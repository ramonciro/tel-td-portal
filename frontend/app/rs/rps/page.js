"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import { apiFetch, apiDownload, getStoredUser, hasSomeRole } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";

// ─── Helpers ───────────────────────────────────────────────────────

const MES_ATUAL = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MESES_NOME = {
  "01":"Jan","02":"Fev","03":"Mar","04":"Abr","05":"Mai","06":"Jun",
  "07":"Jul","08":"Ago","09":"Set","10":"Out","11":"Nov","12":"Dez",
};

function mesLabel(mes) {
  if (!mes) return "";
  const [ano, mm] = mes.split("-");
  return `${MESES_NOME[mm] || mm}/${ano}`;
}

function getMesesDisponiveis() {
  const hoje = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const fmtDate = formatDateBR;
const fmtNum = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));

// ─── Status badge ──────────────────────────────────────────────────
const STATUS_CFG = {
  "ENTREGUE":     { bg: colors.successLight, cor: colors.successText },
  "EM ANDAMENTO": { bg: "#dbeafe",           cor: "#1e40af"          },
  "NÃO ENTREGUE": { bg: colors.dangerLight,  cor: colors.dangerText  },
  "CANCELADA":    { bg: colors.neutralLight, cor: colors.neutral     },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { bg: colors.neutralLight, cor: colors.neutral };
  return (
    <span style={{
      display: "inline-block", background: cfg.bg, color: cfg.cor,
      borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

// ─── Form inicial do modal ─────────────────────────────────────────
const FORM_VAZIO = {
  mes_referencia: MES_ATUAL(), site: "", setor: "OPERACIONAL",
  chamado: "", produto: "", cargo: "",
  data_recebimento: "", status: "EM ANDAMENTO",
  inicio_av_tecnica: "", final_av_tecnica: "", data_fechamento_vaga: "",
  hcs: "", hcs_com_to: "", hcs_aprovados: "", qtd_entregue: "", hcs_berco: "",
  observacoes: "",
};

// ─── Modal de cadastro/edição ──────────────────────────────────────
function RPModal({ open, rp, sites, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [duplicadas, setDuplicadas] = useState(null); // RPs parecidas, à espera de confirmação
  // Berço (21/10/2026): convocados já feitos, histórico e o painel "Convocar do berço".
  const [convocados, setConvocados] = useState(0);
  const [historico, setHistorico] = useState([]);
  const [convQtd, setConvQtd] = useState("1");
  const [convObs, setConvObs] = useState("");
  const [convAberto, setConvAberto] = useState(false);
  const [convOcupado, setConvOcupado] = useState(false);
  const [convErro, setConvErro] = useState("");
  const [convMsg, setConvMsg] = useState("");
  const [estornando, setEstornando] = useState(null); // id da convocação aguardando confirmação

  const carregarBerco = useCallback(async (id) => {
    try {
      const [d, h] = await Promise.all([
        apiFetch(`/rs/rps/${id}`),
        apiFetch(`/rs/rps/${id}/convocacoes`),
      ]);
      setForm(f => ({ ...f, hcs_berco: d.hcs_berco ?? 0, qtd_entregue: d.qtd_entregue ?? 0 }));
      setConvocados(Number(d.hcs_convocados_berco) || 0);
      setHistorico(h.convocacoes || []);
    } catch { /* o resto do formulário continua valendo */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (rp) {
      setForm({
        mes_referencia:       rp.mes_referencia ? rp.mes_referencia.slice(0, 7) : MES_ATUAL(),
        site:                 rp.site || "",
        setor:                rp.setor || "OPERACIONAL",
        chamado:              rp.chamado || "",
        produto:              rp.produto || "",
        cargo:                rp.cargo || "",
        data_recebimento:     rp.data_recebimento ? rp.data_recebimento.slice(0, 10) : "",
        status:               rp.status || "EM ANDAMENTO",
        inicio_av_tecnica:    rp.inicio_av_tecnica    ? rp.inicio_av_tecnica.slice(0, 10)    : "",
        final_av_tecnica:     rp.final_av_tecnica     ? rp.final_av_tecnica.slice(0, 10)     : "",
        data_fechamento_vaga: rp.data_fechamento_vaga ? rp.data_fechamento_vaga.slice(0, 10) : "",
        hcs:          rp.hcs          ?? "",
        hcs_com_to:   rp.hcs_com_to   ?? "",
        hcs_aprovados:rp.hcs_aprovados ?? "",
        qtd_entregue: rp.qtd_entregue  ?? "",
        hcs_berco:    rp.hcs_berco     ?? "",
        observacoes:  rp.observacoes || "",
      });
    } else {
      setForm(FORM_VAZIO);
    }
    setErro("");
    setDuplicadas(null);
    setConvocados(Number(rp?.hcs_convocados_berco) || 0);
    setHistorico([]);
    setConvAberto(false); setConvErro(""); setConvMsg(""); setEstornando(null);
    setConvQtd("1"); setConvObs("");
    if (rp?.id && rp.setor === "ESTRATÉGICO") carregarBerco(rp.id);
  }, [rp, open, carregarBerco]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Ao marcar ENTREGUE sem quantidade entregue, sugere os aprovados da vaga (limitado ao pedido do gestor,
  // quando há pedido); o berço não conta como entrega. Dá para mudar.
  const mudarStatus = (novo) => {
    setForm(f => {
      const semQtd = f.qtd_entregue === "" || Number(f.qtd_entregue) === 0;
      const apr = Number(f.hcs_aprovados) || 0, sol = Number(f.hcs) || 0;
      const sugestao = f.setor === "ESTRATÉGICO" && sol > 0 ? Math.min(apr, sol) : apr;
      if (novo === "ENTREGUE" && semQtd && sugestao > 0) return { ...f, status: novo, qtd_entregue: String(sugestao) };
      return { ...f, status: novo };
    });
  };

  const buscarProdutos = useCallback(async (q) => {
    if (!q || q.length < 2) { setSugestoes([]); return; }
    try {
      const data = await apiFetch(`/rs/produtos?q=${encodeURIComponent(q)}`);
      setSugestoes(data);
    } catch { setSugestoes([]); }
  }, []);

  const convocar = async () => {
    const q = Number(convQtd);
    if (!Number.isInteger(q) || q < 1) { setConvErro("Informe quantas pessoas foram convocadas (1 ou mais)."); return; }
    setConvOcupado(true); setConvErro(""); setConvMsg("");
    try {
      const r = await apiFetch(`/rs/rps/${rp.id}/convocacoes`, {
        method: "POST", body: JSON.stringify({ quantidade: q, observacao: convObs }),
      });
      setConvMsg(r?.message || "Convocação registrada.");
      setConvAberto(false); setConvQtd("1"); setConvObs("");
      await carregarBerco(rp.id);
      onSaved(); // atualiza a lista por trás, sem fechar esta janela
    } catch (e) { setConvErro(e.message || "Não foi possível convocar."); }
    finally { setConvOcupado(false); }
  };

  const estornar = async (cid) => {
    setConvOcupado(true); setConvErro(""); setConvMsg("");
    try {
      const r = await apiFetch(`/rs/rps/${rp.id}/convocacoes/${cid}`, { method: "DELETE" });
      setConvMsg(r?.message || "Convocação estornada.");
      setEstornando(null);
      await carregarBerco(rp.id);
      onSaved();
    } catch (e) { setConvErro(e.message || "Não foi possível estornar."); }
    finally { setConvOcupado(false); }
  };

  const handleSalvar = async (confirmarDuplicada = false) => {
    if (!form.site || !form.produto) { setErro("Site e Produto são obrigatórios."); return; }
    if (!form.data_recebimento) { setErro("Informe a data de recebimento da RP — sem ela o prazo (SLA) não é calculado."); return; }
    setSaving(true); setErro("");
    try {
      const payload = { ...form };
      if (payload.mes_referencia?.length === 7) payload.mes_referencia += "-01";
      if (rp) {
        await apiFetch(`/rs/rps/${rp.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        if (confirmarDuplicada === true) payload.confirmar_duplicada = true;
        const r = await apiFetch("/rs/rps", { method: "POST", body: JSON.stringify(payload) });
        if (r && r.precisa_confirmar) { setDuplicadas(r.duplicadas || []); return; }
      }
      onSaved(); onClose();
    } catch (e) { setErro(e.message || "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const isEstr = form.setor === "ESTRATÉGICO";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)",
               display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
        padding: "32px 36px", width: "100%", maxWidth: 680,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 64px rgba(15,23,42,0.18)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
                        textTransform: "uppercase", color: colors.accent }}>R&S</p>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>
              {rp ? "Editar Requisição" : "Nova Requisição de Pessoa"}
            </h2>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer",
                     fontSize: 20, color: colors.textMuted, lineHeight: 1 }}>✕</button>
        </div>

        {/* Toggle Setor */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelSt}>Setor *</label>
          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {["OPERACIONAL", "ESTRATÉGICO"].map(s => (
              <button key={s} onClick={() => set("setor", s)} style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13,
                background: form.setor === s ? colors.accent : "#f8fafc",
                color:      form.setor === s ? "#fff"        : colors.neutral,
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Grid de campos */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
          <div>
            <label style={labelSt}>Mês de Referência *</label>
            <input type="month" value={form.mes_referencia}
              onChange={e => set("mes_referencia", e.target.value)} style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Site *</label>
            <select value={form.site} onChange={e => set("site", e.target.value)} style={inputSt}>
              <option value="">Selecione...</option>
              {form.site && !sites.some(s => s.nome === form.site) && <option value={form.site}>{form.site}</option>}
              {sites.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: colors.textMuted }}>
              Falta um site? Cadastre em Configurações R&S.
            </p>
          </div>

          {/* Produto com autocomplete */}
          <div style={{ position: "relative" }}>
            <label style={labelSt}>Produto / Cliente *</label>
            <input
              value={form.produto}
              onChange={e => { set("produto", e.target.value); buscarProdutos(e.target.value); setShowSug(true); }}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              placeholder="Safra, Dasa, Cemig..." style={inputSt}
            />
            {showSug && sugestoes.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.1)", maxHeight: 180, overflowY: "auto",
              }}>
                {sugestoes.map(p => (
                  <div key={p} onClick={() => { set("produto", p); setShowSug(false); }}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13,
                             color: colors.textPrimary, borderBottom: "1px solid #f1f5f9" }}
                    onMouseOver={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseOut={e => e.currentTarget.style.background = "#fff"}
                  >{p}</div>
                ))}
              </div>
            )}
          </div>

          {/* Cargo — só ESTRATÉGICO */}
          {isEstr ? (
            <div>
              <label style={labelSt}>Cargo</label>
              <input value={form.cargo} onChange={e => set("cargo", e.target.value)}
                placeholder="Supervisor de Telemarketing" style={inputSt} />
            </div>
          ) : <div />}

          <div>
            <label style={labelSt}>Chamado</label>
            <input value={form.chamado} onChange={e => set("chamado", e.target.value)}
              placeholder="Nº GLPI, e-mail, DECOLA..." style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Status *</label>
            <select value={form.status} onChange={e => mudarStatus(e.target.value)} style={inputSt}>
              <option value="EM ANDAMENTO">Em Andamento</option>
              <option value="ENTREGUE">Entregue</option>
              <option value="NÃO ENTREGUE">Não Entregue</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Data de Recebimento da RP *</label>
            <input type="date" value={form.data_recebimento}
              onChange={e => set("data_recebimento", e.target.value)} style={inputSt} />
          </div>

          {/* Campos OPERACIONAL */}
          {!isEstr && (
            <>
              <div>
                <label style={labelSt}>Início da Av. Técnica</label>
                <input type="date" value={form.inicio_av_tecnica}
                  onChange={e => set("inicio_av_tecnica", e.target.value)} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Final da Av. Técnica</label>
                <input type="date" value={form.final_av_tecnica}
                  onChange={e => set("final_av_tecnica", e.target.value)} style={inputSt} />
              </div>
            </>
          )}

          {/* Campo ESTRATÉGICO */}
          {isEstr && (
            <div>
              <label style={labelSt}>Data de Fechamento da Vaga</label>
              <input type="date" value={form.data_fechamento_vaga}
                onChange={e => set("data_fechamento_vaga", e.target.value)} style={inputSt} />
            </div>
          )}
        </div>

        {/* Bloco Headcount */}
        <div style={{ marginTop: 20, padding: 18, background: "#f8fafc",
                      borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>
            Headcount
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 14 }}>
            {[
              { field: "hcs",           label: "HC'S Solicitados" },
              { field: "hcs_com_to",    label: "HC'S com TO"      },
              { field: "hcs_aprovados", label: "HC'S Aprovados"   },
              { field: "qtd_entregue",  label: "QTD Entregue"     },
              ...(isEstr ? [{ field: "hcs_berco", label: "No berço" }] : []),
            ].map(({ field, label }) => (
              <div key={field}>
                <label style={{ ...labelSt, fontSize: 10 }} title={
                  field === "hcs_com_to" ? "Quantidade solicitada na RP somada a um percentual de reserva (turnover) para garantir a entrega."
                  : field === "hcs_berco" ? "Reserva: gente que passou na avaliação, mas não entrou na vaga. É à parte dos aprovados e da quantidade entregue. Quando um deles for convocado, use o botão 'Convocar do berço'."
                  : field === "hcs_aprovados" ? (isEstr ? "Pode ser maior que os solicitados. O berço (reserva) é informado à parte." : "Pode ser maior que os solicitados, até o HC'S com TO.")
                  : undefined
                }>{label}</label>
                <input type="number" min="0" value={form[field]}
                  onChange={e => set(field, e.target.value)}
                  style={{ ...inputSt, textAlign: "center", fontWeight: 800, fontSize: 20 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Regras de headcount: berço só nas estratégicas (22/10/2026) */}
        <div style={{ marginTop: 10, fontSize: 12, color: colors.textMuted }}>
          {isEstr ? (
            <>
              O <strong>berço</strong> é a reserva de quem passou na avaliação mas não entrou na vaga. Ele fica à parte:
              {" "}não entra em HC'S Aprovados nem em QTD Entregue, e a vaga pode ser fechada com 0 aprovados e gente no berço.
              {" "}Regra: QTD Entregue (sem contar quem foi convocado do berço) não pode passar de HC'S Aprovados.
            </>
          ) : (
            <>
              Aprovados podem passar do pedido do gestor, <strong>até o HC'S com TO</strong>
              {" "}(sem HC'S com TO preenchido, até os solicitados).
              {" "}Regra: QTD Entregue não pode passar de HC'S Aprovados.
            </>
          )}
        </div>
        {rp && isEstr && (
          <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: colors.textPrimary }}>
                <strong>Convocados do berço:</strong> {convocados}
                <span style={{ color: colors.textMuted }}> (já contam dentro da QTD Entregue)</span>
              </div>
              <button type="button" disabled={convOcupado || !(Number(rp.hcs_berco) > 0 || Number(form.hcs_berco) > 0)}
                onClick={() => { setConvAberto(v => !v); setConvErro(""); setConvMsg(""); }}
                style={{ ...btnSec, padding: "7px 14px", opacity: (Number(form.hcs_berco) > 0) ? 1 : 0.5 }}
                title={Number(form.hcs_berco) > 0 ? "Tira do berço e soma na QTD Entregue" : "Não há ninguém no berço"}>
                Convocar do berço
              </button>
            </div>
            {convAberto && (
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ ...labelSt, fontSize: 10 }}>Quantos?</label>
                  <input type="number" min="1" max={Number(form.hcs_berco) || undefined} value={convQtd}
                    onChange={e => setConvQtd(e.target.value)} style={{ ...inputSt, width: 90, textAlign: "center" }} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ ...labelSt, fontSize: 10 }}>Observação (opcional)</label>
                  <input type="text" maxLength={500} value={convObs} onChange={e => setConvObs(e.target.value)}
                    placeholder="Ex.: vaga aberta por desligamento" style={inputSt} />
                </div>
                <button type="button" onClick={convocar} disabled={convOcupado} style={{ ...btnPrim, padding: "9px 16px" }}>
                  {convOcupado ? "Registrando..." : "Confirmar convocação"}
                </button>
              </div>
            )}
            {convErro && <div style={{ marginTop: 10, fontSize: 13, color: colors.dangerText }}>{convErro}</div>}
            {convMsg && <div style={{ marginTop: 10, fontSize: 13, color: colors.successText }}>{convMsg}</div>}
            {historico.length > 0 && (
              <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, fontSize: 12, color: colors.textMuted }}>
                {historico.map(h => (
                  <li key={h.id} style={{ padding: "6px 0", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ textDecoration: h.estornado_em ? "line-through" : "none" }}>
                      {new Date(h.criado_em).toLocaleString("pt-BR")} · {h.quantidade} convocado(s) · {h.convocado_por_nome || "—"}
                      {h.observacao ? ` · ${h.observacao}` : ""}
                      {h.estornado_em ? ` (estornada em ${new Date(h.estornado_em).toLocaleDateString("pt-BR")}${h.estornado_por_nome ? ` por ${h.estornado_por_nome}` : ""})` : ""}
                    </span>
                    {!h.estornado_em && (estornando === h.id ? (
                      <span>
                        Estornar? {" "}
                        <button type="button" onClick={() => estornar(h.id)} disabled={convOcupado} style={{ ...btnAcao, color: colors.danger }}>Sim</button>
                        <button type="button" onClick={() => setEstornando(null)} disabled={convOcupado} style={btnAcao}>Não</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setEstornando(h.id)} disabled={convOcupado} style={btnAcao}>Estornar</button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Observações */}
        <div style={{ marginTop: 14 }}>
          <label style={labelSt}>Observações</label>
          <textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)}
            rows={2} maxLength={500} placeholder="Anotações livres sobre esta RP..."
            style={{ ...inputSt, resize: "vertical", minHeight: 60 }} />
        </div>

        {erro && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: colors.dangerLight,
                        color: colors.dangerText, borderRadius: 8, fontSize: 13 }}>{erro}</div>
        )}

        {duplicadas && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a",
                        color: "#92400e", borderRadius: 8, fontSize: 13 }}>
            <strong>Já existe uma RP igual a esta</strong> (mesmo mês, site, setor, produto, cargo, chamado e data de recebimento):
            <ul style={{ margin: "6px 0 8px", paddingLeft: 18 }}>
              {duplicadas.map(d => (
                <li key={d.id}>#{d.id} · {d.status}{d.criado_por_nome ? ` · criada por ${d.criado_por_nome}` : ""} · HC'S {d.hcs ?? 0}</li>
              ))}
            </ul>
            Se é uma requisição nova mesmo (por exemplo, outra vaga igual), confirme. Se foi um clique repetido, cancele.
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => handleSalvar(true)} disabled={saving} style={{ ...btnPrim, padding: "7px 14px", background: "#d97706" }}>Criar mesmo assim</button>
              <button onClick={() => setDuplicadas(null)} disabled={saving} style={{ ...btnSec, padding: "7px 14px" }}>Voltar e revisar</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} disabled={saving} style={btnSec}>Cancelar</button>
          <button onClick={() => handleSalvar(false)} disabled={saving || !!duplicadas} style={{ ...btnPrim, opacity: duplicadas ? 0.5 : 1 }}>
            {saving ? "Salvando..." : rp ? "Salvar Alterações" : "Criar RP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────
export default function RPsPage() {
  const router = useRouter();
  const [rps, setRps] = useState([]);
  const [totais, setTotais] = useState(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina] = useState(100);
  const [paginas, setPaginas] = useState(1);
  const [limiteDias, setLimiteDias] = useState(15);
  const [exportando, setExportando] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [msg, setMsg] = useState("");
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filtroMes, setFiltroMes] = useState(MES_ATUAL());
  const [filtroSite, setFiltroSite] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroProduto, setFiltroProduto] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [rpEditando, setRpEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [rpComentando, setRpComentando] = useState(null);

  const user = getStoredUser();
  // coordenador_rs pode criar/editar/excluir; gestor_rs só visualiza
  const podeEditar = hasSomeRole(user, ["coordenador_rs", "super_admin"]);

  const filtrosQS = useCallback(() => {
    const p = new URLSearchParams();
    if (filtroMes)     p.set("mes", filtroMes);
    if (filtroSite)    p.set("site", filtroSite);
    if (filtroSetor)   p.set("setor", filtroSetor);
    if (filtroStatus)  p.set("status", filtroStatus);
    if (filtroProduto) p.set("produto", filtroProduto);
    return p;
  }, [filtroMes, filtroSite, filtroSetor, filtroStatus, filtroProduto]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const p = filtrosQS();
      p.set("page", String(pagina));
      p.set("limit", String(porPagina));
      const data = await apiFetch(`/rs/rps?${p}`);
      setRps(data.rps || []);
      setTotais(data.totais || null);
      setTotal(data.total || 0);
      setPaginas(data.paginas || 1);
      if (data.limite_dias) setLimiteDias(data.limite_dias);
      // Se a página ficou além do fim (ex.: excluiu a última RP dela), volta para a última.
      if ((data.paginas || 1) < pagina) setPagina(data.paginas || 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtrosQS, pagina, porPagina]);

  // Mudou algum filtro: volta para a primeira página.
  useEffect(() => { setPagina(1); }, [filtroMes, filtroSite, filtroSetor, filtroStatus, filtroProduto]);

  const carregarSites = useCallback(() => {
    apiFetch("/rs/sites").then(setSites).catch(() => setSites([]));
  }, []);
  useEffect(() => { carregarSites(); }, [carregarSites]);

  useEffect(() => { carregar(); }, [carregar]);

  async function exportarExcel() {
    setExportando(true); setMsg("");
    try {
      await apiDownload(`/rs/rps-exportar?${filtrosQS()}`, `rps_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setMsg(e.message || "Não foi possível exportar."); }
    finally { setExportando(false); }
  }

  const showAmbos = !filtroSetor;
  const showEstr  = !filtroSetor || filtroSetor === "ESTRATÉGICO";

  const subtitleText = loading
    ? "Carregando..."
    : `${total} registro${total !== 1 ? "s" : ""} · ${mesLabel(filtroMes) || "todos os meses"}`;
  const ini = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);

  return (
    <PortalShell
      title="Requisições de Pessoas"
      subtitle={subtitleText}
      topRight={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={exportarExcel} disabled={exportando || loading} style={{ ...btnSec, padding: "9px 14px" }}
            title="Baixa as RPs com os filtros que estão na tela (todas as páginas)">
            {exportando ? "Gerando..." : "⬇ Exportar Excel"}
          </button>
          {podeEditar && (
            <button onClick={() => setLixeiraAberta(true)} style={{ ...btnSec, padding: "9px 14px" }}
              title="RPs excluídas nos últimos 30 dias">🗑 Lixeira</button>
          )}
          {podeEditar && (
            <button onClick={() => { setRpEditando(null); setModalOpen(true); }} style={btnPrim}>
              + Nova RP
            </button>
          )}
        </div>
      }
    >
      {/* PageHero com stats */}
      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Controle de RPs"
        subtitle="Registro e acompanhamento das Requisições de Pessoas por site e setor."
        stats={
          totais ? [
            { label: "HC'S Solicitados", value: fmtNum(totais.hcs) },
            { label: "HC'S Aprovados",   value: fmtNum(totais.hcs_aprovados) },
            { label: "QTD Entregue",     value: fmtNum(totais.qtd_entregue) },
            ...(Number(totais.hcs_berco) > 0 ? [{ label: "No berço", value: fmtNum(totais.hcs_berco) }] : []),
          ] : []
        }
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "16px 0 12px" }}>
        <div>
          <label style={filterLabel}>Mês</label>
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={filterSelect}>
            <option value="">Todos</option>
            {getMesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Site</label>
          <select value={filtroSite} onChange={e => setFiltroSite(e.target.value)} style={filterSelect}>
            <option value="">Todos os sites</option>
            {sites.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Setor</label>
          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            {[{ v: "", l: "Todos" }, { v: "OPERACIONAL", l: "Operacional" }, { v: "ESTRATÉGICO", l: "Estratégico" }]
              .map(({ v, l }) => (
                <button key={v} onClick={() => setFiltroSetor(v)} style={{
                  padding: "7px 13px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: filtroSetor === v ? colors.accent : "#f8fafc",
                  color:      filtroSetor === v ? "#fff"        : colors.neutral,
                }}>{l}</button>
              ))}
          </div>
        </div>
        <div>
          <label style={filterLabel}>Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={filterSelect}>
            <option value="">Todos</option>
            <option value="EM ANDAMENTO">Em Andamento</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="NÃO ENTREGUE">Não Entregue</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>
        <div>
          <label style={filterLabel}>Produto</label>
          <input value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
            placeholder="Buscar..." style={{ ...filterSelect, width: 150 }} />
        </div>
        {(filtroSite || filtroSetor || filtroStatus || filtroProduto) && (
          <button onClick={() => { setFiltroSite(""); setFiltroSetor(""); setFiltroStatus(""); setFiltroProduto(""); }}
            style={{ alignSelf: "flex-end", padding: "7px 13px", background: "none",
                     border: "1px solid #e2e8f0", borderRadius: 8, color: colors.neutral,
                     cursor: "pointer", fontSize: 12 }}>Limpar</button>
        )}
      </div>

      {msg && (
        <div style={{ margin: "0 0 12px", padding: "10px 14px", background: colors.dangerLight, color: colors.dangerText, borderRadius: 8, fontSize: 13 }}>{msg}</div>
      )}

      {/* Tabela */}
      {loading && rps.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: colors.textMuted }}>Carregando requisições...</div>
      ) : rps.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: colors.textMuted }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <strong>Nenhuma RP encontrada</strong>
          <p style={{ fontSize: 13, marginTop: 4 }}>Ajuste os filtros ou crie uma nova requisição.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                      overflow: "hidden", boxShadow: "0 4px 12px rgba(15,23,42,0.04)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <Th>Mês</Th><Th>Site</Th>
                  {showAmbos && <Th>Setor</Th>}
                  <Th>Produto</Th>
                  {showEstr && <Th>Cargo</Th>}
                  <Th>Chamado</Th><Th>Recebimento</Th><Th>Status</Th><Th>Prazo</Th>
                  {(showAmbos || filtroSetor === "OPERACIONAL") && <><Th>Início Av.</Th><Th>Final Av.</Th></>}
                  {filtroSetor === "ESTRATÉGICO" && <Th>Fechamento</Th>}
                  <Th right>HC'S</Th><Th right>HC'S com TO</Th><Th right>Aprovados</Th>
                  <Th right>Entregue</Th>
                  <Th center>Comentários</Th>
                  {podeEditar && <Th center>Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {rps.map((rp, i) => (
                  <tr key={rp.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc",
                                          borderBottom: "1px solid #f1f5f9" }}>
                    <Td>{mesLabel(rp.mes_referencia?.slice(0, 7))}</Td>
                    <Td>{rp.site}</Td>
                    {showAmbos && (
                      <Td>
                        <span style={{ fontSize: 11, fontWeight: 700,
                          color: rp.setor === "OPERACIONAL" ? "#2563eb" : "#7c3aed" }}>
                          {rp.setor === "OPERACIONAL" ? "OPER." : "ESTR."}
                        </span>
                      </Td>
                    )}
                    <Td bold>
                      {rp.produto}
                      {rp.numeros_incoerentes ? (
                        <span title={`Os números não fecham: ${rp.numeros_incoerentes}. Edite a RP para corrigir.`}
                              style={{ marginLeft: 6, color: "#b45309", cursor: "help" }} aria-label="Números que não fecham">⚠</span>
                      ) : null}
                    </Td>
                    {showEstr && <Td muted>{rp.cargo || "—"}</Td>}
                    <Td muted>{rp.chamado || "—"}</Td>
                    <Td muted>{fmtDate(rp.data_recebimento)}</Td>
                    <Td><StatusBadge status={rp.status} /></Td>
                    <Td><PrazoBadge rp={rp} limite={limiteDias} /></Td>
                    {(showAmbos || filtroSetor === "OPERACIONAL") && (
                      <>
                        <Td muted>{rp.setor === "OPERACIONAL" ? fmtDate(rp.inicio_av_tecnica) : "—"}</Td>
                        <Td muted>{rp.setor === "OPERACIONAL" ? fmtDate(rp.final_av_tecnica)  : "—"}</Td>
                      </>
                    )}
                    {filtroSetor === "ESTRATÉGICO" && <Td muted>{fmtDate(rp.data_fechamento_vaga)}</Td>}
                    <Td right bold>{fmtNum(rp.hcs)}</Td>
                    <Td right muted>{fmtNum(rp.hcs_com_to)}</Td>
                    <Td right>{fmtNum(rp.hcs_aprovados)}</Td>
                    <Td right bold style={{ color: colors.success }}>
                      {fmtNum(rp.qtd_entregue)}
                      {rp.setor !== "OPERACIONAL" && Number(rp.hcs_berco) > 0 ? (
                        <span title={`${rp.hcs_berco} pessoa(s) no berço (reserva)`}
                              style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#b45309" }}>+{rp.hcs_berco} berço</span>
                      ) : null}
                    </Td>
                    <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <button onClick={() => setRpComentando(rp)} style={btnComentarios(Number(rp.qtd_comentarios) > 0)}
                        title="Ver e adicionar comentários desta RP">
                        💬 {Number(rp.qtd_comentarios) > 0 ? rp.qtd_comentarios : "Comentar"}
                      </button>
                    </td>
                    {podeEditar && (
                      <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button onClick={() => { setRpEditando(rp); setModalOpen(true); }}
                          style={btnAcao}>✏️</button>
                        <button onClick={() => setConfirmDelete(rp)}
                          style={{ ...btnAcao, color: colors.danger }}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Linha de TOTAIS */}
                {totais && (
                  <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                    <td colSpan={
                      (showAmbos ? 3 : 2) + (showEstr ? 1 : 0) + 5 +
                      ((showAmbos || filtroSetor === "OPERACIONAL") ? 2 : filtroSetor === "ESTRATÉGICO" ? 1 : 0)
                    }
                      style={{ padding: "12px 16px", fontWeight: 800, fontSize: 12,
                               color: colors.accent, textTransform: "uppercase", letterSpacing: ".04em" }}>
                      TOTAL
                    </td>
                    <td style={tdTotal}>{fmtNum(totais.hcs)}</td>
                    <td style={tdTotal}>{fmtNum(totais.hcs_com_to)}</td>
                    <td style={tdTotal}>{fmtNum(totais.hcs_aprovados)}</td>
                    <td style={{ ...tdTotal, color: colors.success }}>{fmtNum(totais.qtd_entregue)}</td>
                    <td />
                    {podeEditar && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                        padding: "10px 16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, color: colors.textMuted }}>
            <span>
              Mostrando <strong style={{ color: colors.textPrimary }}>{fmtNum(ini)}–{fmtNum(fim)}</strong> de <strong style={{ color: colors.textPrimary }}>{fmtNum(total)}</strong> RPs
              {" · "}Os totais acima valem para todas as {fmtNum(total)}, não só para esta página.
            </span>
            {paginas > 1 && (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setPagina(p => Math.max(p - 1, 1))} disabled={pagina <= 1 || loading}
                  style={{ ...btnSec, padding: "5px 12px", fontSize: 12, opacity: pagina <= 1 ? 0.5 : 1 }}>← Anterior</button>
                <span>Página {pagina} de {paginas}</span>
                <button onClick={() => setPagina(p => Math.min(p + 1, paginas))} disabled={pagina >= paginas || loading}
                  style={{ ...btnSec, padding: "5px 12px", fontSize: 12, opacity: pagina >= paginas ? 0.5 : 1 }}>Próxima →</button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal de cadastro/edição */}
      <RPModal open={modalOpen} rp={rpEditando} sites={sites}
        onClose={() => setModalOpen(false)} onSaved={carregar} />

      {lixeiraAberta && (
        <LixeiraModal onClose={() => setLixeiraAberta(false)} onRestaurada={carregar} />
      )}

      {/* Comentários da RP */}
      {rpComentando && (
        <ComentariosRPModal rp={rpComentando} user={user}
          onClose={() => setRpComentando(null)} onChanged={carregar} />
      )}

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                        padding: 28, maxWidth: 400, width: "100%",
                        boxShadow: "0 20px 48px rgba(15,23,42,0.15)" }}>
            <h3 style={{ margin: "0 0 8px", color: colors.textPrimary }}>Enviar requisição para a lixeira?</h3>
            <p style={{ color: colors.textSecondary, fontSize: 14, margin: "0 0 20px" }}>
              <strong>{confirmDelete.produto}</strong> · {confirmDelete.site} · {mesLabel(confirmDelete.mes_referencia?.slice(0, 7))}
              <br />Ela vai para a lixeira e pode ser restaurada por 30 dias.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={btnSec}>Cancelar</button>
              <button onClick={async () => {
                try {
                  await apiFetch(`/rs/rps/${confirmDelete.id}`, { method: "DELETE" });
                  setConfirmDelete(null); carregar();
                } catch (e) { alert(e.message || "Erro ao excluir"); }
              }} style={{ ...btnPrim, background: colors.danger }}>Enviar para a lixeira</button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

// ─── Comentários da RP (19/10/2026) ────────────────────────────────
// Histórico de observações: cada comentário fica com autor e data/hora.
function ComentariosRPModal({ rp, user, onClose, onChanged }) {
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregarLista = useCallback(async () => {
    try {
      const r = await apiFetch(`/rs/rps/${rp.id}/comentarios`);
      setLista(Array.isArray(r?.comentarios) ? r.comentarios : []);
      setErro("");
    } catch (e) { setErro(e.message || "Erro ao carregar comentários."); }
    finally { setCarregando(false); }
  }, [rp.id]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  async function enviar() {
    const t = texto.trim();
    if (!t) { setErro("Escreva o comentário antes de salvar."); return; }
    setSalvando(true); setErro("");
    try {
      await apiFetch(`/rs/rps/${rp.id}/comentarios`, { method: "POST", body: JSON.stringify({ texto: t }) });
      setTexto("");
      await carregarLista();
      onChanged && onChanged();
    } catch (e) { setErro(e.message || "Erro ao salvar o comentário."); }
    finally { setSalvando(false); }
  }

  async function apagar(c) {
    if (!window.confirm("Apagar este comentário?")) return;
    try {
      await apiFetch(`/rs/rps/${rp.id}/comentarios/${c.id}`, { method: "DELETE" });
      await carregarLista();
      onChanged && onChanged();
    } catch (e) { setErro(e.message || "Erro ao apagar o comentário."); }
  }

  const ehCoordRS = hasSomeRole(user, ["coordenador_rs", "super_admin"]);
  const quando = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d.getTime())
      ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24,
                    maxWidth: 560, width: "100%", maxHeight: "86vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 20px 48px rgba(15,23,42,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: colors.textPrimary }}>Comentários da RP</h3>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              {rp.produto} · {rp.site} · {mesLabel(rp.mes_referencia?.slice(0, 7))}
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnAcao, marginRight: 0 }} aria-label="Fechar">✕</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelSt}>Novo comentário</label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000}
            placeholder="Escreva uma observação ou atualização sobre esta RP..."
            style={{ ...inputSt, resize: "vertical", minHeight: 70 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>{texto.length}/2000</span>
            <button onClick={enviar} disabled={salvando} style={{ ...btnPrim, padding: "8px 16px", opacity: salvando ? 0.6 : 1 }}>
              {salvando ? "Salvando..." : "Adicionar comentário"}
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: colors.dangerLight,
                        color: colors.dangerText, borderRadius: 8, fontSize: 13 }}>{erro}</div>
        )}

        <div style={{ marginTop: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {carregando ? (
            <div style={{ color: colors.textMuted, fontSize: 13 }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", padding: 16,
                          border: "1px dashed #e2e8f0", borderRadius: 10 }}>
              Nenhum comentário ainda.
            </div>
          ) : lista.map((c) => (
            <div key={c.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: colors.textMuted }}>
                <span><strong style={{ color: colors.textPrimary }}>{c.autor_nome || "—"}</strong>
                  {c.autor_perfil ? ` · ${c.autor_perfil === "gestor_rs" ? "Gestor R&S" : c.autor_perfil === "coordenador_rs" ? "Coordenação R&S" : c.autor_perfil}` : ""}
                  {" · "}{quando(c.created_at)}</span>
                {(ehCoordRS || Number(c.autor_id) === Number(user?.id)) && (
                  <button onClick={() => apagar(c)} title="Apagar comentário"
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: 12 }}>
                    🗑
                  </button>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: colors.textSecondary, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {c.texto}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Prazo (RPs em andamento) ──────────────────────────────────────
function PrazoBadge({ rp, limite }) {
  if (rp.status !== "EM ANDAMENTO" || rp.dias_aberto == null) return <span style={{ color: colors.textMuted }}>—</span>;
  const atrasada = !!rp.atrasada;
  return (
    <span title={`${rp.dias_aberto} dia(s) desde o recebimento · limite de ${limite} dias`}
      style={{ display: "inline-block", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap",
               background: atrasada ? colors.dangerLight : colors.successLight, color: atrasada ? colors.dangerText : colors.successText }}>
      {atrasada ? "Atrasada" : "No prazo"} · {rp.dias_aberto}d
    </span>
  );
}

// ─── Lixeira (30 dias) ─────────────────────────────────────────────
function LixeiraModal({ onClose, onRestaurada }) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch("/rs/lixeira");
      setLista(Array.isArray(r?.rps) ? r.rps : []);
      setErro("");
    } catch (e) { setErro(e.message || "Erro ao abrir a lixeira."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function restaurar(rp) {
    setErro(""); setOk("");
    try {
      await apiFetch(`/rs/lixeira/${rp.id}/restaurar`, { method: "POST" });
      setOk(`RP "${rp.produto} · ${rp.site}" restaurada.`);
      await carregar();
      onRestaurada && onRestaurada();
    } catch (e) { setErro(e.message || "Erro ao restaurar."); }
  }

  const quando = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "";
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, maxWidth: 760, width: "100%",
                    maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 48px rgba(15,23,42,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: colors.textPrimary }}>Lixeira de RPs</h3>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              As RPs excluídas ficam aqui por 30 dias; depois são apagadas de vez. Enquanto estão aqui, não entram nos relatórios.
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnAcao, marginRight: 0 }} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={{ marginTop: 10, padding: "8px 12px", background: colors.dangerLight, color: colors.dangerText, borderRadius: 8, fontSize: 13 }}>{erro}</div>}
        {ok && <div style={{ marginTop: 10, padding: "8px 12px", background: colors.successLight, color: colors.successText, borderRadius: 8, fontSize: 13 }}>{ok}</div>}
        <div style={{ marginTop: 14, overflowY: "auto" }}>
          {carregando ? (
            <div style={{ color: colors.textMuted, fontSize: 13 }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", padding: 24, border: "1px dashed #e2e8f0", borderRadius: 10 }}>
              A lixeira está vazia.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <Th>RP</Th><Th>Mês</Th><Th>Excluída</Th><Th>Some em</Th><Th center>Ação</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((rp) => (
                  <tr key={rp.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <Td bold>{rp.produto}<div style={{ fontWeight: 400, fontSize: 11, color: colors.textMuted }}>{rp.site} · {rp.setor === "OPERACIONAL" ? "Operacional" : "Estratégico"}{rp.cargo ? ` · ${rp.cargo}` : ""}</div></Td>
                    <Td muted>{mesLabel(rp.mes)}</Td>
                    <Td muted>{quando(rp.excluido_em)}{rp.excluido_por_nome ? <div style={{ fontSize: 11 }}>por {rp.excluido_por_nome}</div> : null}</Td>
                    <Td muted>{rp.dias_restantes} dia{rp.dias_restantes === 1 ? "" : "s"}</Td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <button onClick={() => restaurar(rp)} style={{ ...btnPrim, padding: "6px 14px", fontSize: 12 }}>Restaurar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes de tabela ──────────────────────────────────────
function Th({ children, right, center }) {
  return (
    <th style={{
      padding: "10px 14px", textAlign: right ? "right" : center ? "center" : "left",
      fontSize: 11, fontWeight: 700, color: colors.textMuted,
      textTransform: "uppercase", letterSpacing: ".04em",
      borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
    }}>{children}</th>
  );
}

function Td({ children, right, bold, muted, style: extra }) {
  return (
    <td style={{
      padding: "9px 14px",
      textAlign: right ? "right" : "left",
      color: muted ? colors.textMuted : bold ? colors.textPrimary : colors.textSecondary,
      fontWeight: bold ? 700 : 400,
      whiteSpace: "nowrap",
      ...extra,
    }}>{children}</td>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────
const labelSt = {
  display: "block", fontSize: 11, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5,
};
const inputSt = {
  width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0",
  borderRadius: 8, color: colors.textPrimary, padding: "9px 11px",
  fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const filterLabel = {
  display: "block", fontSize: 10, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", marginBottom: 4,
};
const filterSelect = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
  color: colors.textPrimary, padding: "7px 11px",
  fontSize: 12, outline: "none", cursor: "pointer", fontFamily: "inherit",
};
const btnPrim = {
  background: colors.accent, color: "#fff", border: "none",
  borderRadius: 10, padding: "10px 20px", fontWeight: 700,
  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const btnSec = {
  background: "#fff", color: colors.neutral, border: "1px solid #e2e8f0",
  borderRadius: 10, padding: "10px 20px", fontWeight: 600,
  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const btnAcao = {
  background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
  cursor: "pointer", padding: "4px 9px", fontSize: 12, marginRight: 5,
  color: colors.textMuted,
};
const tdTotal = {
  padding: "10px 14px", textAlign: "right", fontWeight: 700,
  color: colors.textPrimary, fontSize: 14,
};
const btnComentarios = (tem) => ({
  background: tem ? "#eff6ff" : "none", border: `1px solid ${tem ? "#bfdbfe" : "#e2e8f0"}`,
  borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: tem ? 700 : 500,
  color: tem ? "#1d4ed8" : colors.textMuted, fontFamily: "inherit",
});
