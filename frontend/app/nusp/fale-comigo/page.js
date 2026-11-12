"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import {
  st, Campo, Select, Modal, Paginacao, opcoesDe, opcoesNomes, opcoesMapa,
  fmtData, fmtNum, hojeISO, perfilNusp, ehOperacao, PERFIL_COORD,
} from "../../../components/NuspUi";

// Fale Comigo (Pacote 4): caixa de demandas com prazo em dias úteis.
// A equipe técnica (coordenador e analistas) vê e trata; o gestor só vê os números.

const CANAL = { fale_comigo: "Caixa Fale Comigo", email: "E-mail", whatsapp: "WhatsApp", presencial: "Pessoalmente", telefone: "Telefone", outro: "Outro" };
const TIPO = { duvida: "Dúvida", solicitacao: "Pedido", sugestao: "Sugestão", reclamacao: "Reclamação", outro: "Outro" };
const STATUS = { aberta: "Aberta", em_andamento: "Em andamento", respondida: "Respondida", cancelada: "Cancelada" };
const COR_FAROL = { verde: colors.success, amarelo: "#d97706", vermelho: colors.danger, cinza: colors.neutral };
const AVISO_SAUDE = "Não escreva aqui dado de saúde nem relato clínico de ninguém. Registre só o assunto e o que foi combinado; o cuidado individual fica no acolhimento.";

const fmtQuando = (q) => (q ? `${fmtData(q)} ${String(q).slice(11, 16)}` : "—");

const VAZIO = { data_recebimento: "", canal: "fale_comigo", tipo: "duvida", assunto: "", descricao: "", solicitante: "", unidade_id: "", prazo_em: "", responsavel_id: "" };

function Farol({ d }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", background: COR_FAROL[d.farol] || colors.neutral, flexShrink: 0 }} />
      {d.texto}
    </span>
  );
}

function Numero({ rotulo, valor, tom, dica }) {
  const cor = tom === "vermelho" ? colors.danger : tom === "amarelo" ? "#d97706" : colors.textPrimary;
  return (
    <div style={{ ...st.card, padding: 14, flex: "1 1 140px", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.textSecondary }}>{rotulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1.2 }}>{valor}</div>
      {dica ? <div style={{ fontSize: 11, color: colors.textMuted }}>{dica}</div> : null}
    </div>
  );
}

export default function FaleComigoPage() {
  const [perfil, setPerfil] = useState("");
  const [cad, setCad] = useState(null);
  const [ind, setInd] = useState(null);
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50, situacao: { abertas: 0, vencem_hoje: 0, atrasadas: 0 } });
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ q: "", status: "abertas", farol: "", canal: "", tipo: "", unidade_id: "", analista: "", de: "", ate: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  useEffect(() => { setPerfil(perfilNusp()); }, []);
  const opera = ehOperacao(perfil);
  const coord = perfil === PERFIL_COORD;

  useEffect(() => { apiFetch("/nusp/cadastros").then(setCad).catch((e) => setErro(e.message)); }, []);

  const carregarInd = useCallback(() => { apiFetch("/nusp/demandas/indicadores").then(setInd).catch(() => setInd(null)); }, []);
  useEffect(() => { carregarInd(); }, [carregarInd]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [f, pagina]);

  const carregar = useCallback(async () => {
    if (!opera) { setCarregando(false); return; }
    setCarregando(true);
    try { setLista(await apiFetch(`/nusp/demandas?${qs}`)); setErro(""); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [qs, opera]);
  useEffect(() => { if (perfil) carregar(); }, [carregar, perfil]);

  const mudar = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };
  const atualizarTudo = () => { carregar(); carregarInd(); };
  const S = lista.situacao || {};

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Fale Comigo">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Fale Comigo"
        subtitle={opera
          ? "Demandas que chegam ao Núcleo, com prazo de resposta em dias úteis. O prazo padrão é de 5 dias úteis."
          : "Números do Fale Comigo no ano. O conteúdo das demandas fica só com a equipe técnica do Núcleo."}
        actions={opera ? <button type="button" style={st.btn} onClick={() => setForm({ dados: { ...VAZIO, data_recebimento: hojeISO() } })}>+ Registrar demanda</button> : null}
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}

      {/* Números: valem para os três perfis */}
      {ind ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Numero rotulo="Recebidas no ano" valor={fmtNum(ind.recebidas)} />
          <Numero rotulo="Respondidas" valor={fmtNum(ind.respondidas)} />
          <Numero rotulo="Em aberto hoje" valor={fmtNum(ind.em_aberto)} />
          <Numero rotulo="Atrasadas hoje" valor={fmtNum(ind.atrasadas)} tom={ind.atrasadas ? "vermelho" : ""} />
          <Numero rotulo="Tempo médio de resposta" valor={ind.tempo_medio_dias_uteis === null ? "—" : `${ind.tempo_medio_dias_uteis.toLocaleString("pt-BR")} d`} dica="em dias úteis" />
          <Numero rotulo="Respondidas no prazo" valor={ind.pct_no_prazo === null ? "—" : `${ind.pct_no_prazo.toLocaleString("pt-BR")}%`} />
        </div>
      ) : null}

      {!opera && perfil ? (
        <div style={{ ...st.card, color: colors.textSecondary, fontSize: 13 }}>
          Aqui a diretoria vê só os números. Quem fala com o Núcleo, o que pergunta e o que é respondido não aparece nesta visão.
        </div>
      ) : null}

      {opera && (
        <>
          {(S.atrasadas || S.vencem_hoje) ? (
            <div style={{ ...st.card, marginBottom: 12, padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, fontWeight: 600 }}>
              {S.atrasadas ? <span style={{ color: colors.danger }}>● {fmtNum(S.atrasadas)} {S.atrasadas === 1 ? "demanda atrasada" : "demandas atrasadas"}</span> : null}
              {S.vencem_hoje ? <span style={{ color: "#d97706" }}>● {fmtNum(S.vencem_hoje)} {S.vencem_hoje === 1 ? "vence hoje" : "vencem hoje"}</span> : null}
            </div>
          ) : null}

          <div style={{ ...st.card, marginBottom: 16 }}>
            <div style={st.filtros}>
              <Campo label="Buscar" minWidth={190}><input style={st.input} value={f.q} onChange={(e) => mudar("q", e.target.value)} placeholder="Assunto, descrição ou solicitante" /></Campo>
              <Campo label="Situação" minWidth={150}><Select value={f.status} onChange={(v) => mudar("status", v)} opcoes={[{ value: "abertas", label: "Só abertas" }, ...opcoesMapa(STATUS)]} vazio="Todas" /></Campo>
              <Campo label="Prazo" minWidth={140}><Select value={f.farol} onChange={(v) => mudar("farol", v)} opcoes={[{ value: "verde", label: "No prazo" }, { value: "amarelo", label: "Vence hoje" }, { value: "vermelho", label: "Atrasadas" }]} /></Campo>
              <Campo label="Canal" minWidth={150}><Select value={f.canal} onChange={(v) => mudar("canal", v)} opcoes={opcoesMapa(CANAL)} /></Campo>
              <Campo label="Tipo" minWidth={130}><Select value={f.tipo} onChange={(v) => mudar("tipo", v)} opcoes={opcoesMapa(TIPO)} /></Campo>
              <Campo label="Unidade" minWidth={140}><Select value={f.unidade_id} onChange={(v) => mudar("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} /></Campo>
              <Campo label="Responsável" minWidth={170}><Select value={f.analista} onChange={(v) => mudar("analista", v)} opcoes={opcoesNomes(cad?.analistas_filtro)} /></Campo>
              <Campo label="Recebida de" minWidth={140}><input type="date" style={st.input} value={f.de} onChange={(e) => mudar("de", e.target.value)} /></Campo>
              <Campo label="até" minWidth={140}><input type="date" style={st.input} value={f.ate} onChange={(e) => mudar("ate", e.target.value)} /></Campo>
            </div>
          </div>

          <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={st.th}>Prazo</th><th style={st.th}>Assunto</th><th style={st.th}>Recebida</th><th style={st.th}>Canal</th>
                    <th style={st.th}>Unidade</th><th style={st.th}>Responsável</th><th style={st.th}>Situação</th><th style={st.th} />
                  </tr>
                </thead>
                <tbody>
                  {lista.itens.map((d) => (
                    <tr key={d.id}>
                      <td style={st.td}><Farol d={d} /><div style={{ fontSize: 11, color: colors.textMuted }}>até {fmtData(d.prazo_em)}</div></td>
                      <td style={st.td}><strong>{d.assunto}</strong><div style={{ fontSize: 11.5, color: colors.textSecondary }}>{TIPO[d.tipo] || d.tipo}</div></td>
                      <td style={st.td}>{fmtData(d.data_recebimento)}</td>
                      <td style={st.td}>{CANAL[d.canal] || d.canal}</td>
                      <td style={st.td}>{d.unidade || "—"}</td>
                      <td style={st.td}>{d.responsavel_nome || "—"}</td>
                      <td style={st.td}>{STATUS[d.status]}</td>
                      <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setDetalheId(d.id)}>Abrir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lista.itens.length && <div style={st.vazio}>{carregando ? "Carregando…" : "Nenhuma demanda encontrada com esses filtros."}</div>}
          </div>
          <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>{fmtNum(lista.total)} {lista.total === 1 ? "demanda" : "demandas"}.</div>
          <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />
        </>
      )}

      {form && (
        <FormDemanda form={form} cad={cad} coord={coord} onClose={() => setForm(null)}
          onSaved={(t) => { setForm(null); setMsg(t); atualizarTudo(); }} />
      )}
      {detalheId && (
        <DetalheDemanda id={detalheId} coord={coord}
          onClose={() => { setDetalheId(null); atualizarTudo(); }}
          onEditar={async (id) => {
            try {
              const d = await apiFetch(`/nusp/demandas/${id}`);
              setDetalheId(null);
              setForm({ id, dados: { ...VAZIO, ...Object.fromEntries(Object.keys(VAZIO).map((k) => [k, d[k] ?? ""])) } });
            } catch (e) { setErro(e.message); }
          }}
          onExcluida={() => { setDetalheId(null); setMsg("Demanda excluída."); atualizarTudo(); }} />
      )}
    </PortalShell>
  );
}

function FormDemanda({ form, cad, coord, onClose, onSaved }) {
  const [d, setD] = useState(form.dados);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      const corpo = { ...d };
      Object.keys(corpo).forEach((k) => { if (corpo[k] === "") corpo[k] = null; });
      if (!form.id) {
        const r = await apiFetch("/nusp/demandas", { method: "POST", body: JSON.stringify(corpo) });
        onSaved(`Demanda registrada. Prazo de resposta: ${fmtData(r.prazo_em)}.`);
      } else {
        await apiFetch(`/nusp/demandas/${form.id}`, { method: "PUT", body: JSON.stringify(corpo) });
        onSaved("Demanda atualizada.");
      }
    } catch (err) { setErro(err.message); } finally { setSalvando(false); }
  };

  return (
    <Modal titulo={form.id ? "Editar demanda" : "Registrar demanda"} onClose={onClose}>
      <form onSubmit={salvar}>
        {erro ? <div style={st.erro}>{erro}</div> : null}
        <div style={{ background: colors.warningLight, color: colors.warningText, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{AVISO_SAUDE}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Assunto *" flex={3} minWidth={260}><input style={st.input} value={d.assunto} maxLength={200} onChange={(e) => set("assunto", e.target.value)} required /></Campo>
          <Campo label="Recebida em *" minWidth={150}><input type="date" style={st.input} value={d.data_recebimento || ""} max={hojeISO()} onChange={(e) => set("data_recebimento", e.target.value)} required /></Campo>
        </div>
        <Campo label="O que foi pedido" flex={1}><textarea style={st.textarea} value={d.descricao || ""} maxLength={1500} onChange={(e) => set("descricao", e.target.value)} /></Campo>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <Campo label="Canal"><Select value={d.canal} onChange={(v) => set("canal", v)} opcoes={opcoesMapa(CANAL)} vazio={null} /></Campo>
          <Campo label="Tipo"><Select value={d.tipo} onChange={(v) => set("tipo", v)} opcoes={opcoesMapa(TIPO)} vazio={null} /></Campo>
          <Campo label="Unidade"><Select value={d.unidade_id} onChange={(v) => set("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} vazio="Não informada" /></Campo>
          <Campo label="Quem pediu (opcional)" minWidth={190} dica="Pode ficar em branco se a pessoa preferiu não se identificar."><input style={st.input} value={d.solicitante || ""} maxLength={150} onChange={(e) => set("solicitante", e.target.value)} /></Campo>
        </div>
        {coord ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Campo label="Prazo de resposta" minWidth={170} dica="Em branco: 5 dias úteis a partir do recebimento. Só o coordenador altera.">
              <input type="date" style={st.input} value={d.prazo_em || ""} onChange={(e) => set("prazo_em", e.target.value)} />
            </Campo>
            <Campo label="Responsável" minWidth={190}>
              <Select value={d.responsavel_id} onChange={(v) => set("responsavel_id", v)} opcoes={(cad?.analistas || []).map((a) => ({ value: String(a.id), label: a.nome }))} vazio="Eu mesmo" />
            </Campo>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>O prazo de resposta é de 5 dias úteis a partir do recebimento (feriados nacionais não contam).</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" style={st.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" style={st.btn} disabled={salvando}>{salvando ? "Salvando…" : form.id ? "Salvar" : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DetalheDemanda({ id, coord, onClose, onEditar, onExcluida }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resposta, setResposta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState(""); // "", "responder", "cancelar"
  const [confirma, setConfirma] = useState(false);

  const carregar = useCallback(async () => {
    try { setD(await apiFetch(`/nusp/demandas/${id}`)); setErro(""); } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = async (status, extra = {}, ok) => {
    setOcupado(true); setErro(""); setMsg("");
    try {
      await apiFetch(`/nusp/demandas/${id}/status`, { method: "POST", body: JSON.stringify({ status, ...extra }) });
      setModo(""); setResposta(""); setMotivo("");
      if (ok) setMsg(ok);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };
  const excluir = async () => {
    setOcupado(true);
    try { await apiFetch(`/nusp/demandas/${id}`, { method: "DELETE" }); onExcluida(); } catch (e) { setErro(e.message); setOcupado(false); }
  };

  const aberta = d && (d.status === "aberta" || d.status === "em_andamento");
  return (
    <Modal titulo={d ? d.assunto : "Demanda"} onClose={onClose} largura={820}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      {!d ? <div style={st.vazio}>Carregando…</div> : (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 13 }}>
            <Farol d={d} />
            <span><strong>Prazo:</strong> {fmtData(d.prazo_em)} ({d.prazo_dias_uteis} dias úteis)</span>
            <span><strong>Situação:</strong> {STATUS[d.status]}</span>
            <span><strong>Recebida:</strong> {fmtData(d.data_recebimento)}</span>
          </div>
          <div style={{ fontSize: 13, display: "grid", gap: 4, marginBottom: 10 }}>
            <span><strong>Canal:</strong> {CANAL[d.canal] || d.canal} · <strong>Tipo:</strong> {TIPO[d.tipo] || d.tipo}{d.unidade ? <> · <strong>Unidade:</strong> {d.unidade}</> : null}</span>
            <span><strong>Quem pediu:</strong> {d.solicitante || "Não identificado"}</span>
            <span><strong>Responsável:</strong> {d.responsavel_nome || "—"} · <strong>Registrada por:</strong> {d.criado_por_nome || "—"} em {fmtQuando(d.criado_em)}</span>
          </div>
          {d.descricao ? <p style={{ fontSize: 13, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{d.descricao}</p> : null}
          {d.resposta ? (
            <div style={{ background: colors.successLight, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 10 }}>
              <strong>Resposta{d.respondida_em ? ` em ${fmtData(d.respondida_em)}` : ""}:</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{d.resposta}</div>
            </div>
          ) : null}

          {/* Ações */}
          {aberta && !modo && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
              {d.status === "aberta" ? <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => mudar("em_andamento", {}, "Você assumiu a demanda.")}>Assumir (em andamento)</button> : null}
              <button type="button" style={st.btn} disabled={ocupado} onClick={() => setModo("responder")}>Registrar resposta</button>
              {d.pode_editar ? <button type="button" style={st.btnGhost} onClick={() => onEditar(id)}>Editar</button> : null}
              <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={() => setModo("cancelar")}>Cancelar demanda</button>
            </div>
          )}
          {modo === "responder" && (
            <div style={{ margin: "12px 0" }}>
              <Campo label="Resumo da resposta *" dica="Conte o que foi respondido ou combinado, sem dado de saúde de ninguém.">
                <textarea style={st.textarea} value={resposta} maxLength={2000} onChange={(e) => setResposta(e.target.value)} autoFocus />
              </Campo>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button type="button" style={st.btn} disabled={ocupado || resposta.trim().length < 10} onClick={() => mudar("respondida", { resposta }, "Demanda respondida.")}>Marcar como respondida</button>
                <button type="button" style={st.btnGhost} onClick={() => setModo("")}>Voltar</button>
              </div>
            </div>
          )}
          {modo === "cancelar" && (
            <div style={{ margin: "12px 0" }}>
              <Campo label="Motivo do cancelamento *"><input style={st.input} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button type="button" style={st.btnMiniDanger} disabled={ocupado || !motivo.trim()} onClick={() => mudar("cancelada", { comentario: motivo }, "Demanda cancelada.")}>Confirmar cancelamento</button>
                <button type="button" style={st.btnGhost} onClick={() => setModo("")}>Voltar</button>
              </div>
            </div>
          )}
          {!aberta && d.pode_reabrir && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
              <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => mudar("em_andamento", {}, "Demanda reaberta.")}>Reabrir</button>
              <button type="button" style={st.btnGhost} onClick={() => onEditar(id)}>Editar / ajustar prazo</button>
            </div>
          )}

          <h3 style={{ ...st.cardTitle, marginTop: 18 }}>Histórico</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(d.historico || []).map((h, i) => (
              <li key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 12.5 }}>
                <span style={{ color: colors.textMuted }}>{fmtQuando(h.quando)}</span> · <strong>{h.usuario_nome || "—"}</strong>{h.texto ? ` — ${h.texto}` : ""}
              </li>
            ))}
          </ul>

          {coord && (
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              {!confirma
                ? <button type="button" style={st.btnMiniDanger} onClick={() => setConfirma(true)}>Excluir demanda</button>
                : (
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                    Isso apaga a demanda e o histórico dela. Excluir mesmo?
                    <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={excluir}>Sim, excluir</button>
                    <button type="button" style={st.btnGhost} onClick={() => setConfirma(false)}>Não</button>
                  </span>
                )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
