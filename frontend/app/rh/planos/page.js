"use client";

// Planos de ação do RH (13/11/2026): transforma o que o clima e o Canguru mostram em ação com dono e prazo.
// Plano fala de tema, site, serviço ou cliente — nunca de uma pessoa. Gestor só lê.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Modal, Badge, perfilRh, ehOperacaoRh, PERFIL_COORD, fmtN, fmtDia, COR_RH, FAROL } from "../../../components/RhUi";

const ORIGEM = { clima: "Clima", canguru: "Canguru", livre: "Livre" };
const PRIO = { alta: "Alta", media: "Média", baixa: "Baixa" };
const STATUS = { aberto: "Aberto", andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const SIT = {
  atrasado: { txt: "Atrasado", cor: FAROL.vermelho.barra }, vence_em_breve: { txt: "Vence em até 7 dias", cor: FAROL.amarelo.barra }, no_prazo: { txt: "No prazo", cor: FAROL.verde.barra },
  concluido: { txt: "Concluído", cor: "#94a3b8" }, cancelado: { txt: "Cancelado", cor: "#94a3b8" },
};
const EVENTO = { criado: "Plano aberto", situacao: "Mudou a situação", prazo: "Mudou o prazo", responsavel: "Mudou o responsável", visibilidade: "Visibilidade para o cliente", edicao: "Editou o plano", nota: "Anotação" };
const opcoes = (m) => Object.entries(m).map(([value, label]) => ({ value, label }));
const amanha = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };
const hoje = () => new Date().toISOString().slice(0, 10);
const dataHora = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

export default function PlanosRhPage() {
  const [perfil, setPerfil] = useState("");
  const [d, setD] = useState(null);
  const [sug, setSug] = useState(null);
  const [f, setF] = useState({ status: "abertos", origem: "", responsavel: "", cliente: "", situacao: "", q: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [novo, setNovo] = useState(null);
  const [abertoId, setAbertoId] = useState(null);
  const [verSug, setVerSug] = useState(false);
  useEffect(() => { setPerfil(perfilRh()); }, []);
  // Atalho vindo do painel: /rh/planos?situacao=atrasado
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const s = q.get("situacao");
    if (s === "atrasado" || s === "vence_em_breve") setF((x) => ({ ...x, situacao: s, status: "abertos" }));
  }, []);
  const opera = ehOperacaoRh(perfil);

  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); }, [f]);
  const carregar = useCallback(async () => {
    try { setD(await apiFetch(`/rh/planos?${qs}`)); setErro(""); } catch (e) { setErro(e.message || "Não foi possível carregar os planos."); }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);
  const carregarSug = useCallback(async () => { if (!opera) return; try { setSug(await apiFetch("/rh/planos/sugestoes")); } catch { setSug(null); } }, [opera]);
  useEffect(() => { carregarSug(); }, [carregarSug]);

  const c = d?.contagem;
  const totalSug = (sug?.clima?.length || 0) + (sug?.canguru?.length || 0);
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const doSug = (s, origem) => setNovo({ origem, ciclo_id: s.ciclo_id || "", tema: s.tema, cliente: s.cliente || "", titulo: s.titulo, acao: "", prioridade: s.prioridade || "media", prazo: amanha(), responsavel_id: "", responsavel_nome: "", visivel_cliente: false, contexto: s.motivo });

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Planos de ação" subtitle="Cada plano tem responsável, prazo e histórico. Concluir exige contar o que foi feito."
        actions={<>
          <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => apiDownload(`/rh/planos/exportar?${qs}`, "planos_de_acao_rh.xlsx").catch((e) => setErro(e.message))}>Exportar Excel</button>
          {opera ? <button type="button" style={st.btn} onClick={() => setNovo({ origem: "livre", ciclo_id: "", tema: "", cliente: "", titulo: "", acao: "", prioridade: "media", prazo: amanha(), responsavel_id: "", responsavel_nome: "", visivel_cliente: false })}>+ Novo plano</button> : null}
        </>} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {msg ? <div style={{ ...st.ok, marginTop: 14 }}>{msg}</div> : null}

      {c ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 16 }}>
          <StatCard title="Abertos" value={fmtN(c.abertos + c.andamento)} subtitle={`${fmtN(c.andamento)} em andamento`} accent="#2563eb" />
          <StatCard title="Atrasados" value={fmtN(c.atrasados)} subtitle="Prazo já passou" accent="#dc2626" />
          <StatCard title="Vencem em 7 dias" value={fmtN(c.vencendo)} subtitle="Olhe esta semana" accent="#f59e0b" />
          <StatCard title="Concluídos" value={fmtN(c.concluidos)} subtitle={c.conclusao_pct === null ? "—" : `${String(c.conclusao_pct).replace(".", ",")}% dos planos`} accent="#16a34a" />
        </div>
      ) : null}

      {opera && totalSug > 0 ? (
        <div style={{ ...st.card, marginTop: 16, borderColor: COR_RH }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div><h3 style={{ ...st.cardTitle, margin: 0 }}>{fmtN(totalSug)} {totalSug === 1 ? "ponto" : "pontos"} sem plano</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: colors.textSecondary }}>Temas do clima em vermelho ou amarelo e sites ou serviços do Canguru em risco alto que ainda não têm plano.</p></div>
            <button type="button" style={st.btnGhost} onClick={() => setVerSug((v) => !v)}>{verSug ? "Esconder" : "Ver sugestões"}</button>
          </div>
          {verSug ? (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead><tr><th style={st.th}>Origem</th><th style={st.th}>O que o resultado mostra</th><th style={st.th} /></tr></thead>
                <tbody>
                  {sug.clima.map((s) => <tr key={`c${s.tema}`}><td style={st.td}><Badge tom={s.farol === "vermelho" ? "atrasado" : "alerta"}>Clima</Badge></td><td style={st.td}>{s.motivo}</td><td style={st.td}><button type="button" style={st.btnMini} onClick={() => doSug(s, "clima")}>Criar plano</button></td></tr>)}
                  {sug.canguru.map((s) => <tr key={`g${s.tema}`}><td style={st.td}><Badge tom="atrasado">Canguru</Badge></td><td style={st.td}>{s.motivo}</td><td style={st.td}><button type="button" style={st.btnMini} onClick={() => doSug(s, "canguru")}>Criar plano</button></td></tr>)}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Buscar" minWidth={180}><input style={st.input} value={f.q} onChange={(e) => mudar("q", e.target.value)} placeholder="Título, tema ou ação" /></Campo>
          <Campo label="Situação" minWidth={150}><Select value={f.status} onChange={(v) => mudar("status", v)} opcoes={[{ value: "abertos", label: "Em aberto (todos)" }, ...opcoes(STATUS)]} vazio="Todas" /></Campo>
          <Campo label="Prazo" minWidth={150}><Select value={f.situacao} onChange={(v) => mudar("situacao", v)} opcoes={[{ value: "atrasado", label: "Atrasados" }, { value: "vence_em_breve", label: "Vencem em 7 dias" }]} /></Campo>
          <Campo label="Origem" minWidth={130}><Select value={f.origem} onChange={(v) => mudar("origem", v)} opcoes={opcoes(ORIGEM)} /></Campo>
          <Campo label="Responsável" minWidth={170}><Select value={f.responsavel} onChange={(v) => mudar("responsavel", v)} opcoes={(d?.filtros?.equipe || []).map((u) => ({ value: String(u.id), label: u.nome }))} /></Campo>
          {d?.filtros?.clientes?.length ? <Campo label="Cliente" minWidth={150}><Select value={f.cliente} onChange={(v) => mudar("cliente", v)} opcoes={d.filtros.clientes.map((x) => ({ value: x, label: x }))} /></Campo> : null}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead><tr><th style={st.th}>Prazo</th><th style={st.th}>Plano</th><th style={st.th}>Origem</th><th style={st.th}>Responsável</th><th style={st.th}>Prioridade</th><th style={st.th}>Situação</th><th style={st.th} /></tr></thead>
            <tbody>
              {(d?.planos || []).map((p) => {
                const s = SIT[p.situacao] || SIT.no_prazo;
                return (
                  <tr key={p.id}>
                    <td style={st.td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: s.cor }} /><span><strong>{fmtDia(p.prazo)}</strong><div style={{ fontSize: 11, color: colors.textSecondary }}>{s.txt}</div></span></span></td>
                    <td style={st.td}><strong>{p.titulo}</strong><div style={{ fontSize: 12, color: colors.textSecondary }}>{[p.tema, p.cliente].filter(Boolean).join(" · ")}</div>{p.visivel_cliente ? <div style={{ fontSize: 11, color: COR_RH, fontWeight: 800 }}>Visível ao cliente</div> : null}</td>
                    <td style={st.td}>{ORIGEM[p.origem]}</td>
                    <td style={st.td}>{p.responsavel || "—"}{p.responsavel_externo ? <div style={{ fontSize: 11, color: colors.textMuted }}>Fora do RH</div> : null}</td>
                    <td style={st.td}>{PRIO[p.prioridade]}</td>
                    <td style={st.td}><Badge tom={p.status === "andamento" ? "em_andamento" : p.status === "concluido" ? "concluido" : p.status === "cancelado" ? "cancelada" : "pendente"}>{p.status_rotulo}</Badge></td>
                    <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setAbertoId(p.id)}>Abrir</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d && !d.planos.length ? <div style={st.vazio}>{c?.total ? "Nenhum plano com esses filtros." : "Ainda não há planos. Use as sugestões acima ou crie o primeiro."}</div> : null}
        {!d && !erro ? <div style={st.vazio}>Carregando…</div> : null}
      </div>

      {novo ? <NovoPlano base={novo} equipe={d?.filtros?.equipe || []} coord={perfil === PERFIL_COORD} onClose={() => setNovo(null)} onSaved={() => { setNovo(null); setMsg("Plano criado."); carregar(); carregarSug(); }} /> : null}
      {abertoId ? <AbrirPlano id={abertoId} opera={opera} coord={perfil === PERFIL_COORD} equipe={d?.filtros?.equipe || []} onClose={() => { setAbertoId(null); carregar(); carregarSug(); }} /> : null}
    </PortalShell>
  );
}

function NovoPlano({ base, equipe, coord, onClose, onSaved }) {
  const [v, setV] = useState(base);
  const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  const set = (k, x) => setV((a) => ({ ...a, [k]: x }));
  const salvar = async (e) => {
    e.preventDefault(); setOcupado(true); setErro("");
    try {
      const { contexto, ...corpo } = v;
      await apiFetch("/rh/planos", { method: "POST", body: JSON.stringify({ ...corpo, ciclo_id: corpo.ciclo_id || null, responsavel_id: corpo.responsavel_id || null }) });
      onSaved();
    } catch (err) { setErro(err.message || "Não foi possível salvar."); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo="Novo plano de ação" onClose={onClose}>
      <form onSubmit={salvar}>
        {erro ? <div style={st.erro}>{erro}</div> : null}
        {v.contexto ? <div style={{ background: colors.neutralLight, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}><strong>Por que este plano:</strong> {v.contexto}</div> : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Título *" flex={3} minWidth={260}><input style={st.input} value={v.titulo} maxLength={160} onChange={(e) => set("titulo", e.target.value)} required /></Campo>
          <Campo label="Prioridade" minWidth={130}><Select value={v.prioridade} onChange={(x) => set("prioridade", x)} opcoes={opcoes(PRIO)} vazio={null} /></Campo>
        </div>
        <Campo label="O que será feito *"><textarea style={st.textarea} value={v.acao} maxLength={2000} onChange={(e) => set("acao", e.target.value)} required placeholder="Descreva a ação e o que muda com ela. Fale de tema, site ou serviço, não de pessoas." /></Campo>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <Campo label="Responsável (RH)" minWidth={190}><Select value={v.responsavel_id} onChange={(x) => set("responsavel_id", x)} opcoes={equipe.map((u) => ({ value: String(u.id), label: u.nome }))} vazio="Outra pessoa (digite ao lado)" /></Campo>
          {!v.responsavel_id ? <Campo label="Nome de quem vai tocar *" minWidth={190}><input style={st.input} value={v.responsavel_nome} maxLength={120} onChange={(e) => set("responsavel_nome", e.target.value)} /></Campo> : null}
          <Campo label="Prazo *" minWidth={150}><input type="date" style={st.input} min={hoje()} value={v.prazo} onChange={(e) => set("prazo", e.target.value)} required /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Tema ou grupo" minWidth={220}><input style={st.input} value={v.tema} maxLength={150} onChange={(e) => set("tema", e.target.value)} /></Campo>
          <Campo label="Cliente" minWidth={160}><input style={st.input} value={v.cliente} maxLength={100} onChange={(e) => set("cliente", e.target.value)} /></Campo>
        </div>
        {coord ? <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginBottom: 12 }}><input type="checkbox" checked={!!v.visivel_cliente} onChange={(e) => set("visivel_cliente", e.target.checked)} />Mostrar este plano ao cliente (só aparece se a pesquisa estiver liberada para ele)</label> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" style={st.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" style={{ ...st.btn, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado}>{ocupado ? "Salvando…" : "Criar plano"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AbrirPlano({ id, opera, coord, equipe, onClose }) {
  const [p, setP] = useState(null);
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [ocupado, setOcupado] = useState(false);
  const [prazo, setPrazo] = useState(""); const [notaPrazo, setNotaPrazo] = useState("");
  const [resp, setResp] = useState(""); const [nota, setNota] = useState("");
  const [fim, setFim] = useState(null); // { status, texto }
  const carregar = useCallback(async () => {
    try { const r = await apiFetch(`/rh/planos/${id}`); setP(r.plano); setPrazo(r.plano.prazo); setResp(r.plano.responsavel_id ? String(r.plano.responsavel_id) : ""); } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviar = async (corpo, texto) => {
    setOcupado(true); setErro(""); setOk("");
    try { const r = await apiFetch(`/rh/planos/${id}`, { method: "PUT", body: JSON.stringify(corpo) }); setP(r.plano); setPrazo(r.plano.prazo); setOk(texto || "Salvo."); setFim(null); setNotaPrazo(""); }
    catch (e) { setErro(e.message || "Não foi possível salvar."); } finally { setOcupado(false); }
  };
  const anotar = async () => {
    if (!nota.trim()) return; setOcupado(true); setErro("");
    try { const r = await apiFetch(`/rh/planos/${id}/notas`, { method: "POST", body: JSON.stringify({ nota }) }); setP(r.plano); setNota(""); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };
  if (!p) return <Modal titulo="Plano de ação" onClose={onClose}>{erro ? <div style={st.erro}>{erro}</div> : <div style={st.vazio}>Carregando…</div>}</Modal>;
  const aberto = p.status === "aberto" || p.status === "andamento";
  const s = SIT[p.situacao] || SIT.no_prazo;
  return (
    <Modal titulo={p.titulo} onClose={onClose} largura={820}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {ok ? <div style={st.ok}>{ok}</div> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <Badge tom={p.status === "andamento" ? "em_andamento" : p.status === "concluido" ? "concluido" : p.status === "cancelado" ? "cancelada" : "pendente"}>{p.status_rotulo}</Badge>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: s.cor }} />{s.txt}</span>
        <span style={{ fontSize: 12.5, color: colors.textSecondary }}>Origem: {ORIGEM[p.origem]}{p.ciclo_nome ? ` · ${p.ciclo_nome}` : ""}{p.tema ? ` · ${p.tema}` : ""}{p.cliente ? ` · ${p.cliente}` : ""}</span>
        {p.visivel_cliente ? <span style={{ fontSize: 11.5, fontWeight: 800, color: COR_RH }}>Visível ao cliente</span> : null}
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.55, marginBottom: 12 }}>{p.acao}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div><div style={st.label}>Responsável</div><strong style={{ fontSize: 13.5 }}>{p.responsavel || "—"}</strong></div>
        <div><div style={st.label}>Prazo</div><strong style={{ fontSize: 13.5 }}>{fmtDia(p.prazo)}</strong></div>
        <div><div style={st.label}>Prioridade</div><strong style={{ fontSize: 13.5 }}>{PRIO[p.prioridade]}</strong></div>
      </div>
      {p.resultado ? <div style={{ background: colors.successLight, color: colors.successText, borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}><strong>Resultado:</strong> {p.resultado}</div> : null}

      {opera ? (
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, marginBottom: 12 }}>
          {aberto ? (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {p.status === "aberto" ? <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => enviar({ status: "andamento" }, "Plano em andamento.")}>Iniciar (em andamento)</button> : null}
                <button type="button" style={{ ...st.btn, background: "#16a34a" }} disabled={ocupado} onClick={() => setFim({ status: "concluido", texto: "" })}>Concluir…</button>
                <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={() => setFim({ status: "cancelado", texto: "" })}>Cancelar plano…</button>
              </div>
              {fim ? (
                <div style={{ background: colors.neutralLight, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <label style={st.label}>{fim.status === "concluido" ? "O que foi feito e qual foi o resultado? *" : "Por que o plano foi cancelado? *"}</label>
                  <textarea style={st.textarea} value={fim.texto} maxLength={2000} onChange={(e) => setFim({ ...fim, texto: e.target.value })} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                    <button type="button" style={st.btnGhost} onClick={() => setFim(null)}>Voltar</button>
                    <button type="button" style={st.btn} disabled={ocupado} onClick={() => enviar(fim.status === "concluido" ? { status: "concluido", resultado: fim.texto } : { status: "cancelado", nota_status: fim.texto }, fim.status === "concluido" ? "Plano concluído." : "Plano cancelado.")}>{fim.status === "concluido" ? "Concluir plano" : "Cancelar plano"}</button>
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Campo label="Novo prazo" minWidth={150}><input type="date" style={st.input} min={hoje()} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo>
                {prazo !== p.prazo ? <Campo label="Motivo (opcional)" minWidth={200} flex={2}><input style={st.input} value={notaPrazo} maxLength={500} onChange={(e) => setNotaPrazo(e.target.value)} /></Campo> : null}
                <Campo label="Responsável" minWidth={190}><Select value={resp} onChange={setResp} opcoes={equipe.map((u) => ({ value: String(u.id), label: u.nome }))} vazio={p.responsavel_externo ? p.responsavel : "Escolha"} /></Campo>
                <button type="button" style={st.btnGhost} disabled={ocupado || (prazo === p.prazo && String(p.responsavel_id || "") === resp)} onClick={() => enviar({ ...(prazo !== p.prazo ? { prazo, nota_prazo: notaPrazo } : {}), ...(resp && String(p.responsavel_id || "") !== resp ? { responsavel_id: Number(resp) } : {}) }, "Alterações salvas.")}>Salvar prazo e responsável</button>
              </div>
            </>
          ) : coord ? <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => enviar({ status: "aberto" }, "Plano reaberto.")}>Reabrir plano</button> : <p style={{ fontSize: 12.5, color: colors.textMuted, margin: 0 }}>Só o coordenador do RH reabre um plano concluído ou cancelado.</p>}
          {coord ? <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginTop: 12 }}><input type="checkbox" checked={p.visivel_cliente} disabled={ocupado} onChange={(e) => enviar({ visivel_cliente: e.target.checked }, e.target.checked ? "Plano visível ao cliente." : "Plano voltou a ser interno.")} />Mostrar este plano ao cliente</label> : null}
        </div>
      ) : null}

      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Histórico</h4>
        {opera ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input style={st.input} value={nota} maxLength={1000} placeholder="Registrar um andamento (ex.: reunião feita, aguardando retorno)" onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") anotar(); }} />
            <button type="button" style={st.btnGhost} disabled={ocupado || !nota.trim()} onClick={anotar}>Anotar</button>
          </div>
        ) : null}
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {p.historico.map((h) => (
            <div key={h.id} style={{ padding: "7px 0", borderTop: `1px solid ${colors.border}`, fontSize: 12.5 }}>
              <strong>{EVENTO[h.evento] || h.evento}</strong>{h.de_valor || h.para_valor ? <span> · {h.de_valor ? `${/^\d{4}-\d{2}-\d{2}$/.test(h.de_valor) ? fmtDia(h.de_valor) : h.de_valor} → ` : ""}{/^\d{4}-\d{2}-\d{2}$/.test(h.para_valor || "") ? fmtDia(h.para_valor) : h.para_valor}</span> : null}
              <span style={{ color: colors.textMuted }}> · {h.usuario_nome || "—"} · {dataHora(h.created_at)}</span>
              {h.nota ? <div style={{ color: colors.textSecondary, whiteSpace: "pre-wrap", marginTop: 2 }}>{h.nota}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
