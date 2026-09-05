"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import { apiFetch, getStoredUser, hasSomeRole } from "../../../services/api";
import { colors } from "../../../lib/theme";

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

const fmtDate = (v) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return v; }
};
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
  hcs: "", hcs_com_to: "", hcs_aprovados: "", qtd_entregue: "",
  observacoes: "",
};

// ─── Modal de cadastro/edição ──────────────────────────────────────
function RPModal({ open, rp, sites, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [showSug, setShowSug] = useState(false);

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
        observacoes:  rp.observacoes || "",
      });
    } else {
      setForm(FORM_VAZIO);
    }
    setErro("");
  }, [rp, open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const buscarProdutos = useCallback(async (q) => {
    if (!q || q.length < 2) { setSugestoes([]); return; }
    try {
      const data = await apiFetch(`/rs/produtos?q=${encodeURIComponent(q)}`);
      setSugestoes(data);
    } catch { setSugestoes([]); }
  }, []);

  const handleSalvar = async () => {
    if (!form.site || !form.produto) { setErro("Site e Produto são obrigatórios."); return; }
    setSaving(true); setErro("");
    try {
      const payload = { ...form };
      if (payload.mes_referencia?.length === 7) payload.mes_referencia += "-01";
      if (rp) {
        await apiFetch(`/rs/rps/${rp.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/rs/rps", { method: "POST", body: JSON.stringify(payload) });
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
              {sites.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
          </div>

          {/* Produto com autocomplete */}
          <div style={{ position: "relative" }}>
            <label style={labelSt}>Produto / Cliente *</label>
            <input
              value={form.produto}
              onChange={e => { set("produto", e.target.value); buscarProdutos(e.target.value); setShowSug(true); }}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              placeholder="SAFRA, DASA, CEMIG..." style={inputSt}
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
                placeholder="SUPERVISOR DE TELEMARKETING" style={inputSt} />
            </div>
          ) : <div />}

          <div>
            <label style={labelSt}>Chamado</label>
            <input value={form.chamado} onChange={e => set("chamado", e.target.value)}
              placeholder="Nº GLPI, e-mail, DECOLA..." style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Status *</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={inputSt}>
              <option value="EM ANDAMENTO">Em Andamento</option>
              <option value="ENTREGUE">Entregue</option>
              <option value="NÃO ENTREGUE">Não Entregue</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Data de Recebimento da RP</label>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { field: "hcs",           label: "HC'S Solicitados" },
              { field: "hcs_com_to",    label: "HC'S com TO"      },
              { field: "hcs_aprovados", label: "HC'S Aprovados"   },
              { field: "qtd_entregue",  label: "QTD Entregue"     },
            ].map(({ field, label }) => (
              <div key={field}>
                <label style={{ ...labelSt, fontSize: 10 }}>{label}</label>
                <input type="number" min="0" value={form[field]}
                  onChange={e => set(field, e.target.value)}
                  style={{ ...inputSt, textAlign: "center", fontWeight: 800, fontSize: 20 }} />
              </div>
            ))}
          </div>
        </div>

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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} disabled={saving} style={btnSec}>Cancelar</button>
          <button onClick={handleSalvar} disabled={saving} style={btnPrim}>
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

  const user = getStoredUser();
  // coordenador_rs pode criar/editar/excluir; gestor_rs só visualiza
  const podeEditar = hasSomeRole(user, ["coordenador_rs", "super_admin"]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filtroMes)     p.set("mes", filtroMes);
      if (filtroSite)    p.set("site", filtroSite);
      if (filtroSetor)   p.set("setor", filtroSetor);
      if (filtroStatus)  p.set("status", filtroStatus);
      if (filtroProduto) p.set("produto", filtroProduto);
      const data = await apiFetch(`/rs/rps?${p}`);
      setRps(data.rps || []);
      setTotais(data.totais || null);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroMes, filtroSite, filtroSetor, filtroStatus, filtroProduto]);

  useEffect(() => {
    apiFetch("/rs/sites").then(setSites).catch(() => setSites([]));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const showAmbos = !filtroSetor;
  const showEstr  = !filtroSetor || filtroSetor === "ESTRATÉGICO";

  const subtitleText = loading
    ? "Carregando..."
    : `${total} registro${total !== 1 ? "s" : ""} · ${mesLabel(filtroMes) || "todos os meses"}`;

  return (
    <PortalShell
      title="Requisições de Pessoas"
      subtitle={subtitleText}
      topRight={
        podeEditar
          ? <button onClick={() => { setRpEditando(null); setModalOpen(true); }} style={btnPrim}>
              + Nova RP
            </button>
          : null
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

      {/* Tabela */}
      {loading ? (
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
                  <Th>Chamado</Th><Th>Recebimento</Th><Th>Status</Th>
                  {(showAmbos || filtroSetor === "OPERACIONAL") && <><Th>Início Av.</Th><Th>Final Av.</Th></>}
                  {filtroSetor === "ESTRATÉGICO" && <Th>Fechamento</Th>}
                  <Th right>HC'S</Th><Th right>TO</Th><Th right>Aprovados</Th>
                  <Th right>Entregue</Th>
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
                    <Td bold>{rp.produto}</Td>
                    {showEstr && <Td muted>{rp.cargo || "—"}</Td>}
                    <Td muted>{rp.chamado || "—"}</Td>
                    <Td muted>{fmtDate(rp.data_recebimento)}</Td>
                    <Td><StatusBadge status={rp.status} /></Td>
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
                    <Td right bold style={{ color: colors.success }}>{fmtNum(rp.qtd_entregue)}</Td>
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
                      (showAmbos ? 3 : 2) + (showEstr ? 1 : 0) + 3 +
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
                    {podeEditar && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de cadastro/edição */}
      <RPModal open={modalOpen} rp={rpEditando} sites={sites}
        onClose={() => setModalOpen(false)} onSaved={carregar} />

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                        padding: 28, maxWidth: 400, width: "100%",
                        boxShadow: "0 20px 48px rgba(15,23,42,0.15)" }}>
            <h3 style={{ margin: "0 0 8px", color: colors.textPrimary }}>Excluir requisição?</h3>
            <p style={{ color: colors.textSecondary, fontSize: 14, margin: "0 0 20px" }}>
              <strong>{confirmDelete.produto}</strong> · {confirmDelete.site} · {mesLabel(confirmDelete.mes_referencia?.slice(0, 7))}
              <br />Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={btnSec}>Cancelar</button>
              <button onClick={async () => {
                try {
                  await apiFetch(`/rs/rps/${confirmDelete.id}`, { method: "DELETE" });
                  setConfirmDelete(null); carregar();
                } catch (e) { alert(e.message || "Erro ao excluir"); }
              }} style={{ ...btnPrim, background: colors.danger }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
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
