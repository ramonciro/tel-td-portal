"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import {
  st, Campo, Select, Modal, Badge, Paginacao, opcoesDe, opcoesMapa, STATUS_PLANO_LABEL,
  fmtData, fmtDataOuSem, fmtNum, hojeISO, perfilNusp, ehOperacao, PERFIL_COORD,
} from "../../../components/NuspUi";

const VAZIO = {
  titulo: "", descricao: "", data_identificacao: "", prazo: "", status: "pendente", pct_conclusao: 0,
  programa_id: "", dimensao_id: "", unidade_id: "", responsavel_id: "", proxima_etapa: "", observacoes: "",
  evidencia_url: "", evidencia_titulo: "", comentario: "",
};

function farol(p) {
  if (p.status === "concluida") return { cor: colors.success, txt: "Concluído" };
  if (p.status === "cancelada") return { cor: colors.neutral, txt: "Cancelado" };
  if (!p.prazo) return { cor: colors.neutral, txt: "Sem prazo definido" };
  const dias = Math.round((new Date(`${p.prazo}T00:00:00`) - new Date(`${hojeISO()}T00:00:00`)) / 86400000);
  if (dias < 0) return { cor: colors.danger, txt: `${Math.abs(dias)} d de atraso` };
  if (dias <= 7) return { cor: "#d97706", txt: dias === 0 ? "Vence hoje" : `Vence em ${dias} d` };
  return { cor: colors.success, txt: "No prazo" };
}

export default function PlanosPage() {
  const [perfil, setPerfil] = useState("");
  const [cad, setCad] = useState(null);
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50 });
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ q: "", status: "", programa_id: "", unidade_id: "", dimensao_id: "", atrasados: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  useEffect(() => { setPerfil(perfilNusp()); }, []);
  const opera = ehOperacao(perfil);
  const coord = perfil === PERFIL_COORD;

  useEffect(() => { apiFetch("/nusp/cadastros").then(setCad).catch((e) => setErro(e.message)); }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [f, pagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await apiFetch(`/nusp/planos?${qs}`)); setErro(""); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };
  const abrirNovo = () => setForm({ dados: { ...VAZIO, data_identificacao: hojeISO() } });
  const abrirEdicao = async (id) => {
    try {
      const p = await apiFetch(`/nusp/planos/${id}`);
      setForm({ id, dados: { ...VAZIO, ...Object.fromEntries(Object.keys(VAZIO).map((k) => [k, p[k] ?? ""])), evidencia_url: "", evidencia_titulo: "", comentario: "" } });
    } catch (e) { setErro(e.message); }
  };

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Planos de ação">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Planos de ação"
        subtitle="Cada plano tem prazo, responsável e histórico. Um plano só chega a 100% quando é marcado como concluído com evidência."
        actions={
          <>
            <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => apiDownload("/nusp/exportar?tipo=planos", "nucleo-planos.xlsx").catch((e) => setErro(e.message))}>Exportar Excel</button>
            {opera ? <button type="button" style={st.btn} onClick={abrirNovo}>+ Novo plano</button> : null}
          </>
        }
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}

      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="Buscar" minWidth={190}><input style={st.input} value={f.q} onChange={(e) => mudar("q", e.target.value)} placeholder="Título do plano" /></Campo>
          <Campo label="Status" minWidth={140}><Select value={f.status} onChange={(v) => mudar("status", v)} opcoes={opcoesMapa(STATUS_PLANO_LABEL)} /></Campo>
          <Campo label="Prazo" minWidth={150}><Select value={f.atrasados} onChange={(v) => mudar("atrasados", v)} opcoes={[{ value: "1", label: "Somente atrasados" }]} /></Campo>
          <Campo label="Programa" minWidth={170}><Select value={f.programa_id} onChange={(v) => mudar("programa_id", v)} opcoes={opcoesDe(cad?.programas)} /></Campo>
          <Campo label="Unidade" minWidth={150}><Select value={f.unidade_id} onChange={(v) => mudar("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} /></Campo>
          <Campo label="Dimensão" minWidth={200}><Select value={f.dimensao_id} onChange={(v) => mudar("dimensao_id", v)} opcoes={opcoesDe(cad?.dimensoes)} /></Campo>
        </div>
      </div>

      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                <th style={st.th}>Farol</th><th style={st.th}>Plano</th><th style={st.th}>Unidade</th><th style={st.th}>Dimensão</th>
                <th style={st.th}>Responsável</th><th style={st.th}>Prazo</th><th style={st.th}>%</th><th style={st.th}>Status</th><th style={st.th} />
              </tr>
            </thead>
            <tbody>
              {lista.itens.map((p) => {
                const fa = farol(p);
                return (
                  <tr key={p.id}>
                    <td style={st.td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}><span style={{ width: 11, height: 11, borderRadius: "50%", background: fa.cor }} />{fa.txt}</span></td>
                    <td style={st.td}><strong>{p.titulo}</strong>{p.programa ? <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{p.programa}</div> : null}</td>
                    <td style={st.td}>{p.unidade || "—"}</td>
                    <td style={st.td}>{p.dimensao || "—"}</td>
                    <td style={st.td}>{p.responsavel_nome || "—"}</td>
                    <td style={st.td}>{fmtDataOuSem(p.prazo, "Sem prazo")}</td>
                    <td style={st.td}>{fmtNum(p.pct_conclusao)}%</td>
                    <td style={st.td}><Badge tom={p.status}>{STATUS_PLANO_LABEL[p.status]}</Badge></td>
                    <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setDetalheId(p.id)}>Abrir</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!lista.itens.length && <div style={st.vazio}>{carregando ? "Carregando…" : "Nenhum plano encontrado."}</div>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>{fmtNum(lista.total)} plano(s).</div>
      <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />

      {form && (
        <FormPlano form={form} cad={cad} coord={coord} onClose={() => setForm(null)}
          onSaved={(t) => { setForm(null); setMsg(t); carregar(); }} />
      )}
      {detalheId && (
        <DetalhePlano id={detalheId} opera={opera} coord={coord}
          onClose={() => { setDetalheId(null); carregar(); }}
          onEditar={(id) => { setDetalheId(null); abrirEdicao(id); }}
          onExcluido={() => { setDetalheId(null); setMsg("Plano excluído."); carregar(); }} />
      )}
    </PortalShell>
  );
}

function FormPlano({ form, cad, coord, onClose, onSaved }) {
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
      if (corpo.status === "concluida") corpo.pct_conclusao = 100;
      if (!form.id) {
        await apiFetch("/nusp/planos", { method: "POST", body: JSON.stringify(corpo) });
        onSaved("Plano criado.");
      } else {
        await apiFetch(`/nusp/planos/${form.id}`, { method: "PUT", body: JSON.stringify(corpo) });
        onSaved("Plano atualizado.");
      }
    } catch (err) { setErro(err.message); } finally { setSalvando(false); }
  };

  return (
    <Modal titulo={form.id ? "Atualizar plano" : "Novo plano de ação"} onClose={onClose}>
      <form onSubmit={salvar}>
        {erro ? <div style={st.erro}>{erro}</div> : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Plano de ação *" flex={3} minWidth={260}><input style={st.input} value={d.titulo} maxLength={250} onChange={(e) => set("titulo", e.target.value)} required /></Campo>
          <Campo label="Status" minWidth={150}><Select value={d.status} onChange={(v) => set("status", v)} opcoes={opcoesMapa(STATUS_PLANO_LABEL)} vazio={null} /></Campo>
        </div>
        <Campo label="Descrição" flex={1}><textarea style={st.textarea} value={d.descricao} maxLength={1500} onChange={(e) => set("descricao", e.target.value)} /></Campo>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <Campo label="Data de identificação" minWidth={150} dica="Pode ficar em branco"><input type="date" style={st.input} value={d.data_identificacao || ""} onChange={(e) => set("data_identificacao", e.target.value)} /></Campo>
          <Campo label="Prazo" minWidth={150} dica="Sem prazo, o plano não entra no farol de atrasos"><input type="date" style={st.input} value={d.prazo || ""} onChange={(e) => set("prazo", e.target.value)} /></Campo>
          <Campo label="% de conclusão" minWidth={130} dica="100% só ao marcar como Concluída">
            <input type="number" min="0" max="99" style={st.input} value={d.status === "concluida" ? 100 : d.pct_conclusao} disabled={d.status === "concluida"} onChange={(e) => set("pct_conclusao", e.target.value === "" ? 0 : Number(e.target.value))} />
          </Campo>
          {coord ? (
            <Campo label="Responsável" minWidth={190}>
              <Select value={d.responsavel_id} onChange={(v) => set("responsavel_id", v)} opcoes={(cad?.analistas || []).map((a) => ({ value: String(a.id), label: a.nome }))} vazio="Eu mesmo" />
            </Campo>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Programa / comitê"><Select value={d.programa_id} onChange={(v) => set("programa_id", v)} opcoes={opcoesDe(cad?.programas)} vazio="Selecione" /></Campo>
          <Campo label="Dimensão" minWidth={220}><Select value={d.dimensao_id} onChange={(v) => set("dimensao_id", v)} opcoes={opcoesDe(cad?.dimensoes)} vazio="Selecione" /></Campo>
          <Campo label="Unidade"><Select value={d.unidade_id} onChange={(v) => set("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} vazio="Selecione" /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Próxima etapa" flex={2} minWidth={240}><input style={st.input} value={d.proxima_etapa} maxLength={300} onChange={(e) => set("proxima_etapa", e.target.value)} /></Campo>
          <Campo label="Comentário do histórico" flex={2} minWidth={240} dica="Fica registrado no histórico do plano"><input style={st.input} value={d.comentario} maxLength={1000} onChange={(e) => set("comentario", e.target.value)} /></Campo>
        </div>
        <Campo label="Observações" flex={1}><textarea style={st.textarea} value={d.observacoes} maxLength={1000} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <Campo label="Evidência (link)" flex={2} minWidth={260} dica="Obrigatória para concluir. Outros links podem ser anexados depois.">
            <input style={st.input} value={d.evidencia_url} onChange={(e) => set("evidencia_url", e.target.value)} placeholder="https://…" />
          </Campo>
          <Campo label="Título do link" minWidth={180}><input style={st.input} value={d.evidencia_titulo} onChange={(e) => set("evidencia_titulo", e.target.value)} /></Campo>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" style={st.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" style={st.btn} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DetalhePlano({ id, opera, coord, onClose, onEditar, onExcluido }) {
  const [p, setP] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ev, setEv] = useState({ url: "", titulo: "" });
  const [ocupado, setOcupado] = useState(false);
  const [confirma, setConfirma] = useState(false);

  const carregar = useCallback(async () => {
    try { setP(await apiFetch(`/nusp/planos/${id}`)); setErro(""); } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const pode = opera && p?.pode_editar;
  const acao = async (fn, ok) => {
    setOcupado(true); setErro(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); await carregar(); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };
  const addEv = (e) => {
    e.preventDefault();
    acao(async () => {
      await apiFetch("/nusp/evidencias", { method: "POST", body: JSON.stringify({ entidade: "plano", entidade_id: id, url: ev.url, titulo: ev.titulo || null }) });
      setEv({ url: "", titulo: "" });
    }, "Evidência anexada.");
  };
  const excluir = async () => {
    setOcupado(true);
    try { await apiFetch(`/nusp/planos/${id}`, { method: "DELETE" }); onExcluido(); } catch (e) { setErro(e.message); setOcupado(false); }
  };

  return (
    <Modal titulo={p ? p.titulo : "Plano de ação"} onClose={onClose} largura={820}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      {!p ? <div style={st.vazio}>Carregando…</div> : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <Badge tom={p.status}>{STATUS_PLANO_LABEL[p.status]}</Badge>
            <span style={{ fontSize: 12.5, color: colors.textSecondary }}>
              {fmtNum(p.pct_conclusao)}% · identificado em {fmtDataOuSem(p.data_identificacao, "data não definida")} · prazo {fmtDataOuSem(p.prazo, "não definido")}
              {p.concluido_em ? ` · concluído em ${fmtData(p.concluido_em)}` : ""}
            </span>
            {p.atrasado ? <Badge tom="atrasado">Atrasado</Badge> : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: 12.5, color: colors.textSecondary, marginBottom: 12 }}>
            <div><strong>Programa:</strong> {p.programa || "—"}</div>
            <div><strong>Dimensão:</strong> {p.dimensao || "—"}</div>
            <div><strong>Unidade:</strong> {p.unidade || "—"}</div>
            <div><strong>Responsável:</strong> {p.responsavel_nome || "—"}</div>
          </div>
          {p.descricao ? <p style={{ fontSize: 13, margin: "0 0 8px" }}>{p.descricao}</p> : null}
          {p.proxima_etapa ? <p style={{ fontSize: 13, margin: "0 0 8px" }}><strong>Próxima etapa:</strong> {p.proxima_etapa}</p> : null}
          {p.observacoes ? <p style={{ fontSize: 13, margin: "0 0 8px" }}><strong>Observações:</strong> {p.observacoes}</p> : null}

          <h3 style={{ ...st.cardTitle, marginTop: 16 }}>Evidências ({p.lista_evidencias?.length || 0})</h3>
          {!p.lista_evidencias?.length ? <div style={{ fontSize: 12.5, color: colors.textMuted, marginBottom: 8 }}>Nenhuma evidência anexada.</div> : (
            <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none" }}>
              {p.lista_evidencias.map((x) => (
                <li key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
                  <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{x.titulo || x.url}</a>
                  <span style={{ fontSize: 11.5, color: colors.textMuted }}>{x.criado_por_nome} · {x.criado_em}</span>
                  {pode ? <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={() => acao(() => apiFetch(`/nusp/evidencias/${x.id}`, { method: "DELETE" }), "Evidência removida.")}>Remover</button> : null}
                </li>
              ))}
            </ul>
          )}
          {pode && (
            <form onSubmit={addEv} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Campo label="Link da evidência" flex={2} minWidth={240}><input style={st.input} value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} placeholder="https://…" required /></Campo>
              <Campo label="Título (opcional)" minWidth={170}><input style={st.input} value={ev.titulo} onChange={(e) => setEv({ ...ev, titulo: e.target.value })} /></Campo>
              <button type="submit" style={st.btn} disabled={ocupado}>Anexar</button>
            </form>
          )}

          <h3 style={{ ...st.cardTitle, marginTop: 20 }}>Histórico</h3>
          {!p.historico?.length ? <div style={{ fontSize: 12.5, color: colors.textMuted }}>Sem registros.</div> : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {p.historico.map((h, i) => (
                <li key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 12.5 }}>
                  <strong>{h.quando}</strong> · {h.usuario_nome || "—"} · {STATUS_PLANO_LABEL[h.status] || h.status} ({fmtNum(h.pct_conclusao)}%)
                  {h.texto ? <div style={{ color: colors.textSecondary }}>{h.texto}</div> : null}
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 20 }}>
            {pode ? <button type="button" style={st.btn} onClick={() => onEditar(id)}>Atualizar plano</button> : null}
            {coord && !confirma ? <button type="button" style={st.btnMiniDanger} onClick={() => setConfirma(true)}>Excluir</button> : null}
            {coord && confirma ? (
              <>
                <span style={{ alignSelf: "center", fontSize: 12.5, color: colors.dangerText }}>Excluir apaga também o histórico e as evidências. Confirma?</span>
                <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={excluir}>Sim, excluir</button>
                <button type="button" style={st.btnGhost} onClick={() => setConfirma(false)}>Não</button>
              </>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}
