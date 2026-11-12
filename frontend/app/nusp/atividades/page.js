"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import {
  EvidenciaItem, AnexarArquivo,
  st, Campo, Select, Modal, Badge, Paginacao, opcoesDe, opcoesNomes, opcoesMapa, TIPO_LABEL, FORMATO_LABEL, STATUS_ATV_LABEL, PRESENCA_LABEL,
  fmtData, fmtDataOuSem, fmtHoras, fmtNum, hojeISO, perfilNusp, ehOperacao, PERFIL_COORD,
} from "../../../components/NuspUi";

const VAZIA = {
  tipo: "escuta_coletiva", tema: "", publico: "", data_inicio: "", data_fim: "", horas: "", formato: "", status: "planejada",
  programa_id: "", frente_id: "", dimensao_id: "", unidade_id: "", analista_id: "", resultado: "", proxima_etapa: "", observacoes: "",
  evidencia_url: "", evidencia_titulo: "",
};

export default function AtividadesPage() {
  const [perfil, setPerfil] = useState("");
  const [cad, setCad] = useState(null);
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50 });
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ q: "", status: "", tipo: "", programa_id: "", unidade_id: "", dimensao_id: "", analista: "", de: "", ate: "", sem_evidencia: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null); // { id?, dados }
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
    try {
      setLista(await apiFetch(`/nusp/atividades?${qs}`));
      setErro("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarFiltro = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };

  const abrirNova = () => setForm({ dados: { ...VAZIA, data_inicio: hojeISO() } });
  const abrirEdicao = async (id) => {
    try {
      const a = await apiFetch(`/nusp/atividades/${id}`);
      setForm({
        id,
        dados: {
          ...VAZIA,
          ...Object.fromEntries(Object.keys(VAZIA).map((k) => [k, a[k] ?? ""])),
          horas: a.horas ?? "",
          evidencia_url: "", evidencia_titulo: "",
        },
      });
    } catch (e) { setErro(e.message); }
  };

  const baixar = () => apiDownload(`/nusp/exportar?tipo=atividades&${qs.replace(/pagina=\d+&?/, "")}`, "nucleo-atividades.xlsx").catch((e) => setErro(e.message));

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Atividades">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Atividades"
        subtitle="Escutas, capacitações, ações e reuniões. Para concluir uma atividade, anexe pelo menos uma evidência (link)."
        actions={
          <>
            <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={baixar}>Exportar Excel</button>
            {opera ? <button type="button" style={st.btn} onClick={abrirNova}>+ Nova atividade</button> : null}
          </>
        }
      />

      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}

      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="Buscar" minWidth={190}><input style={st.input} value={f.q} onChange={(e) => mudarFiltro("q", e.target.value)} placeholder="Tema ou público" /></Campo>
          <Campo label="Status" minWidth={140}><Select value={f.status} onChange={(v) => mudarFiltro("status", v)} opcoes={opcoesMapa(STATUS_ATV_LABEL)} /></Campo>
          <Campo label="Tipo" minWidth={170}><Select value={f.tipo} onChange={(v) => mudarFiltro("tipo", v)} opcoes={opcoesMapa(TIPO_LABEL)} /></Campo>
          <Campo label="Programa" minWidth={170}><Select value={f.programa_id} onChange={(v) => mudarFiltro("programa_id", v)} opcoes={opcoesDe(cad?.programas)} /></Campo>
          <Campo label="Unidade" minWidth={150}><Select value={f.unidade_id} onChange={(v) => mudarFiltro("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} /></Campo>
          <Campo label="Analista" minWidth={170}><Select value={f.analista} onChange={(v) => mudarFiltro("analista", v)} opcoes={opcoesNomes(cad?.analistas_filtro)} /></Campo>
          <Campo label="Dimensão" minWidth={200}><Select value={f.dimensao_id} onChange={(v) => mudarFiltro("dimensao_id", v)} opcoes={opcoesDe(cad?.dimensoes)} /></Campo>
          <Campo label="De" minWidth={140}><input type="date" style={st.input} value={f.de} onChange={(e) => mudarFiltro("de", e.target.value)} /></Campo>
          <Campo label="Até" minWidth={140}><input type="date" style={st.input} value={f.ate} onChange={(e) => mudarFiltro("ate", e.target.value)} /></Campo>
          <Campo label="Evidência" minWidth={170}>
            <Select value={f.sem_evidencia} onChange={(v) => mudarFiltro("sem_evidencia", v)} opcoes={[{ value: "1", label: "Concluídas sem evidência" }]} />
          </Campo>
        </div>
      </div>

      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={st.th}>Data</th><th style={st.th}>Tema</th><th style={st.th}>Tipo</th><th style={st.th}>Programa</th>
                <th style={st.th}>Unidade</th><th style={st.th}>Analista</th><th style={st.th}>Horas</th><th style={st.th}>Pessoas</th>
                <th style={st.th}>Evid.</th><th style={st.th}>Status</th><th style={st.th} />
              </tr>
            </thead>
            <tbody>
              {lista.itens.map((a) => (
                <tr key={a.id}>
                  <td style={st.td}>{a.data_inicio ? fmtData(a.data_inicio) : <span style={{ color: colors.textSecondary, fontStyle: "italic" }}>Sem data definida</span>}</td>
                  <td style={st.td}><strong>{a.tema}</strong>{a.publico ? <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{a.publico}</div> : null}</td>
                  <td style={st.td}>{TIPO_LABEL[a.tipo] || a.tipo}</td>
                  <td style={st.td}>{a.programa || "—"}{a.frente ? <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{a.frente}</div> : null}</td>
                  <td style={st.td}>{a.unidade || "—"}</td>
                  <td style={st.td}>{a.analista_nome || "—"}</td>
                  <td style={st.td}>{fmtHoras(a.horas)}</td>
                  <td style={st.td}>{a.pessoas_legado != null && !a.pessoas ? `${fmtNum(a.pessoas_legado)}*` : fmtNum(a.pessoas)}</td>
                  <td style={st.td}>
                    {a.evidencias > 0 ? <Badge tom="concluida">{a.evidencias}</Badge> : a.status === "concluida" ? <Badge tom="alerta">Falta</Badge> : "—"}
                  </td>
                  <td style={st.td}><Badge tom={a.status}>{STATUS_ATV_LABEL[a.status] || a.status}</Badge></td>
                  <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setDetalheId(a.id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lista.itens.length && <div style={st.vazio}>{carregando ? "Carregando…" : "Nenhuma atividade encontrada com esses filtros."}</div>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>
        {fmtNum(lista.total)} {lista.total === 1 ? "atividade" : "atividades"}. * Número informado no histórico, sem lista nominal.
      </div>
      <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />

      {form && (
        <FormAtividade
          form={form}
          cad={cad}
          coord={coord}
          onClose={() => setForm(null)}
          onSaved={(texto, novoId) => {
            setForm(null);
            setMsg(texto);
            carregar();
            if (novoId) setDetalheId(novoId);
          }}
        />
      )}
      {detalheId && (
        <DetalheAtividade
          id={detalheId}
          opera={opera}
          coord={coord}
          onClose={() => { setDetalheId(null); carregar(); }}
          onEditar={(id) => { setDetalheId(null); abrirEdicao(id); }}
          onExcluida={() => { setDetalheId(null); setMsg("Atividade excluída."); carregar(); }}
        />
      )}
    </PortalShell>
  );
}

// ── Formulário de criar/editar ─────────────────────────────────────────
function FormAtividade({ form, cad, coord, onClose, onSaved }) {
  const [d, setD] = useState(form.dados);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const frentes = (cad?.frentes || []).filter((fr) => fr.ativo !== 0 && String(fr.programa_id) === String(d.programa_id));

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const corpo = { ...d };
      Object.keys(corpo).forEach((k) => { if (corpo[k] === "") corpo[k] = null; });
      if (!form.id) {
        const r = await apiFetch("/nusp/atividades", { method: "POST", body: JSON.stringify(corpo) });
        onSaved("Atividade registrada. Lance os participantes e anexe a evidência.", r.id);
      } else {
        await apiFetch(`/nusp/atividades/${form.id}`, { method: "PUT", body: JSON.stringify(corpo) });
        onSaved("Atividade atualizada.");
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={form.id ? "Editar atividade" : "Nova atividade"} onClose={onClose}>
      <form onSubmit={salvar}>
        {erro ? <div style={st.erro}>{erro}</div> : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Tema / ação *" flex={3} minWidth={240}><input style={st.input} value={d.tema} maxLength={250} onChange={(e) => set("tema", e.target.value)} required /></Campo>
          <Campo label="Tipo *" minWidth={170}><Select value={d.tipo} onChange={(v) => set("tipo", v)} opcoes={opcoesMapa(TIPO_LABEL)} vazio={null} /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Programa / comitê"><Select value={d.programa_id} onChange={(v) => setD((x) => ({ ...x, programa_id: v, frente_id: "" }))} opcoes={opcoesDe(cad?.programas)} vazio="Selecione" /></Campo>
          <Campo label="Frente"><Select value={d.frente_id} onChange={(v) => set("frente_id", v)} opcoes={opcoesDe(frentes)} vazio={frentes.length ? "Selecione" : "Sem frentes"} /></Campo>
          <Campo label="Dimensão da pesquisa" minWidth={220}><Select value={d.dimensao_id} onChange={(v) => set("dimensao_id", v)} opcoes={opcoesDe(cad?.dimensoes)} vazio="Selecione" /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Unidade"><Select value={d.unidade_id} onChange={(v) => set("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} vazio="Selecione" /></Campo>
          <Campo label="Público atendido"><input style={st.input} value={d.publico} maxLength={150} onChange={(e) => set("publico", e.target.value)} placeholder="Ex.: Operação, Gestores" /></Campo>
          <Campo label="Formato"><Select value={d.formato} onChange={(v) => set("formato", v)} opcoes={opcoesMapa(FORMATO_LABEL)} vazio="Selecione" /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label={d.status === "planejada" ? "Data de início" : "Data de início *"} minWidth={140} dica={d.status === "planejada" ? "Pode ficar em branco enquanto a atividade estiver Planejada" : undefined}><input type="date" style={st.input} value={d.data_inicio || ""} onChange={(e) => set("data_inicio", e.target.value)} required={d.status !== "planejada"} /></Campo>
          <Campo label="Data de término" minWidth={140}><input type="date" style={st.input} value={d.data_fim || ""} onChange={(e) => set("data_fim", e.target.value)} /></Campo>
          <Campo label="Horas" minWidth={100}><input style={st.input} inputMode="decimal" value={d.horas} onChange={(e) => set("horas", e.target.value)} placeholder="0" /></Campo>
          <Campo label="Status" minWidth={150}><Select value={d.status} onChange={(v) => set("status", v)} opcoes={opcoesMapa(STATUS_ATV_LABEL)} vazio={null} /></Campo>
          {coord ? (
            <Campo label="Analista responsável" minWidth={190}>
              <Select value={d.analista_id} onChange={(v) => set("analista_id", v)} opcoes={(cad?.analistas || []).map((a) => ({ value: String(a.id), label: a.nome }))} vazio="Eu mesmo" />
            </Campo>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Resultado / andamento" flex={2} minWidth={260}><textarea style={st.textarea} value={d.resultado} maxLength={1000} onChange={(e) => set("resultado", e.target.value)} /></Campo>
          <Campo label="Próxima etapa" minWidth={220}><textarea style={st.textarea} value={d.proxima_etapa} maxLength={300} onChange={(e) => set("proxima_etapa", e.target.value)} /></Campo>
        </div>
        <Campo label="Observações" flex={1}><textarea style={st.textarea} value={d.observacoes} maxLength={1000} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
        {!form.id && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
            <Campo label="Evidência (link, opcional agora)" flex={2} minWidth={260} dica="Pasta ou arquivo no Drive/SharePoint. Para anexar um arquivo direto, salve a atividade e abra o detalhe dela. Para concluir é preciso ao menos uma evidência (link ou arquivo).">
              <input style={st.input} value={d.evidencia_url} onChange={(e) => set("evidencia_url", e.target.value)} placeholder="https://…" />
            </Campo>
            <Campo label="Título do link" minWidth={180}><input style={st.input} value={d.evidencia_titulo} onChange={(e) => set("evidencia_titulo", e.target.value)} placeholder="Ex.: Lista de presença" /></Campo>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" style={st.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" style={st.btn} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Detalhe: participantes e evidências ────────────────────────────────
function DetalheAtividade({ id, opera, coord, onClose, onEditar, onExcluida }) {
  const [a, setA] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ev, setEv] = useState({ url: "", titulo: "" });
  const [linhas, setLinhas] = useState("");
  const [resultado, setResultado] = useState(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try { setA(await apiFetch(`/nusp/atividades/${id}`)); setErro(""); } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const pode = opera && a?.pode_editar;

  const acao = async (fn, ok) => {
    setOcupado(true); setErro(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); await carregar(); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };

  const addEvidencia = (e) => {
    e.preventDefault();
    acao(async () => {
      await apiFetch("/nusp/evidencias", { method: "POST", body: JSON.stringify({ entidade: "atividade", entidade_id: id, url: ev.url, titulo: ev.titulo || null }) });
      setEv({ url: "", titulo: "" });
    }, "Evidência anexada.");
  };

  // Cada linha: matrícula;nome;presença(opcional). Aceita também tab (colar do Excel).
  const lancar = (e) => {
    e.preventDefault();
    const itens = linhas.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const p = l.split(/[;\t,]/).map((x) => x.trim());
      const pres = (p[2] || "").toLowerCase();
      return {
        matricula: p[0] || "",
        nome: p[1] || "",
        presenca: pres.startsWith("aus") ? "ausente" : pres.startsWith("just") ? "justificado" : "presente",
      };
    });
    if (!itens.length) { setErro("Cole ao menos uma linha: matrícula;nome"); return; }
    acao(async () => {
      const r = await apiFetch(`/nusp/atividades/${id}/participantes`, { method: "POST", body: JSON.stringify({ itens }) });
      setResultado(r);
      if (!r.erros?.length) setLinhas("");
    });
  };

  const enviarPlanilha = (e) => {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    acao(async () => {
      const fd = new FormData();
      fd.append("arquivo", arq);
      const r = await apiFetch(`/nusp/atividades/${id}/participantes/importar`, { method: "POST", body: fd });
      setResultado(r);
    });
  };

  const mudarPresenca = (p, presenca) => acao(() => apiFetch(`/nusp/participacoes/${p.id}`, { method: "PUT", body: JSON.stringify({ presenca }) }));
  const remover = (p) => acao(() => apiFetch(`/nusp/participacoes/${p.id}`, { method: "DELETE" }), "Participante removido.");
  const removerEv = (x) => acao(() => apiFetch(`/nusp/evidencias/${x.id}`, { method: "DELETE" }), "Evidência removida.");
  const concluir = () => acao(async () => {
    await apiFetch(`/nusp/atividades/${id}`, { method: "PUT", body: JSON.stringify({ ...camposEdicao(a), status: "concluida" }) });
  }, "Atividade concluída.");
  const excluir = async () => {
    setOcupado(true);
    try { await apiFetch(`/nusp/atividades/${id}`, { method: "DELETE" }); onExcluida(); } catch (e) { setErro(e.message); setOcupado(false); }
  };

  return (
    <Modal titulo={a ? a.tema : "Atividade"} onClose={onClose} largura={900}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      {!a ? <div style={st.vazio}>Carregando…</div> : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <Badge tom={a.status}>{STATUS_ATV_LABEL[a.status]}</Badge>
            <span style={{ fontSize: 12.5, color: colors.textSecondary }}>
              {TIPO_LABEL[a.tipo]} · {fmtDataOuSem(a.data_inicio)}{a.data_fim ? ` a ${fmtData(a.data_fim)}` : ""} · {fmtHoras(a.horas)} h
              {a.formato ? ` · ${FORMATO_LABEL[a.formato]}` : ""}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 }}>
            <div><strong>Programa:</strong> {a.programa || "—"}{a.frente ? ` / ${a.frente}` : ""}</div>
            <div><strong>Dimensão:</strong> {a.dimensao || "—"}</div>
            <div><strong>Unidade:</strong> {a.unidade || "—"}</div>
            <div><strong>Público:</strong> {a.publico || "—"}</div>
            <div><strong>Analista:</strong> {a.analista_nome || "—"}</div>
            {a.origem === "importacao" ? <div><strong>Origem:</strong> planilha importada</div> : null}
          </div>
          {a.resultado ? <p style={{ fontSize: 13, margin: "0 0 8px" }}><strong>Resultado:</strong> {a.resultado}</p> : null}
          {a.proxima_etapa ? <p style={{ fontSize: 13, margin: "0 0 8px" }}><strong>Próxima etapa:</strong> {a.proxima_etapa}</p> : null}
          {a.observacoes ? <p style={{ fontSize: 13, margin: "0 0 8px" }}><strong>Observações:</strong> {a.observacoes}</p> : null}

          {/* Evidências */}
          <h3 style={{ ...st.cardTitle, marginTop: 18 }}>Evidências ({a.lista_evidencias?.length || 0})</h3>
          {!a.lista_evidencias?.length ? <div style={{ fontSize: 12.5, color: colors.textMuted, marginBottom: 8 }}>Nenhuma evidência anexada.</div> : (
            <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none" }}>
              {a.lista_evidencias.map((x) => (
                <EvidenciaItem key={x.id} x={x} podeRemover={pode} ocupado={ocupado} onRemover={removerEv} onErro={setErro} />
              ))}
            </ul>
          )}
          {pode && (
            <form onSubmit={addEvidencia} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Campo label="Link da evidência" flex={2} minWidth={240}><input style={st.input} value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} placeholder="https://…" required /></Campo>
              <Campo label="Título (opcional)" minWidth={170}><input style={st.input} value={ev.titulo} onChange={(e) => setEv({ ...ev, titulo: e.target.value })} /></Campo>
              <button type="submit" style={st.btn} disabled={ocupado}>Anexar link</button>
            </form>
          )}
          {pode && <AnexarArquivo entidade="atividade" entidadeId={id} ocupado={ocupado} acao={acao} />}

          {/* Participantes (nunca chegam ao gestor: a API não envia) */}
          {opera && (
            <>
              <h3 style={{ ...st.cardTitle, marginTop: 22 }}>Participantes ({a.participantes?.length || 0})</h3>
              {a.pessoas_legado != null && !a.participantes?.length ? (
                <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 8 }}>O histórico informa {fmtNum(a.pessoas_legado)} {a.pessoas_legado === 1 ? "pessoa" : "pessoas"}, sem lista nominal.</div>
              ) : null}
              {a.participantes?.length ? (
                <div style={{ overflowX: "auto", marginBottom: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={st.th}>Matrícula</th><th style={st.th}>Nome</th><th style={st.th}>Presença</th><th style={st.th} /></tr></thead>
                    <tbody>
                      {a.participantes.map((p) => (
                        <tr key={p.id}>
                          <td style={st.td}>{p.matricula}</td>
                          <td style={st.td}>{p.nome}</td>
                          <td style={st.td}>
                            {pode ? (
                              <select style={{ ...st.input, height: 30, width: 140 }} value={p.presenca} disabled={ocupado} onChange={(e) => mudarPresenca(p, e.target.value)}>
                                {Object.entries(PRESENCA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            ) : PRESENCA_LABEL[p.presenca]}
                          </td>
                          <td style={st.td}>{pode ? <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={() => remover(p)}>Remover</button> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {pode && (
                <div style={{ background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14 }}>
                  <form onSubmit={lancar}>
                    <label style={st.label}>Cole a lista, uma pessoa por linha (matrícula;nome;presença). A matrícula é obrigatória.</label>
                    <textarea style={{ ...st.textarea, minHeight: 90 }} value={linhas} onChange={(e) => setLinhas(e.target.value)} placeholder={"12345;Maria da Silva;presente\n67890;João Souza;ausente"} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                      <button type="submit" style={st.btn} disabled={ocupado}>Lançar participantes</button>
                      <label style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                        Importar planilha (.xlsx)
                        <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={enviarPlanilha} />
                      </label>
                      <span style={{ fontSize: 11.5, color: colors.textMuted }}>Planilha com colunas Matrícula, Nome, Presença (e opcional Concluiu).</span>
                    </div>
                  </form>
                  {resultado && (
                    <div style={{ marginTop: 10, fontSize: 12.5 }}>
                      <strong>{fmtNum(resultado.gravados)}</strong> {resultado.gravados === 1 ? "gravado" : "gravados"}, {fmtNum(resultado.novos)} {resultado.novos === 1 ? "novo" : "novos"} nesta atividade.
                      {resultado.erros?.length ? (
                        <ul style={{ color: colors.dangerText, margin: "6px 0 0", paddingLeft: 18 }}>
                          {resultado.erros.slice(0, 20).map((er, i) => <li key={i}>Linha {er.linha}: {er.motivo}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Ações */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 22 }}>
            {pode && a.status !== "concluida" && a.status !== "cancelada" ? (
              <button type="button" style={st.btn} disabled={ocupado} onClick={concluir} title={a.lista_evidencias?.length ? "" : "Anexe ao menos uma evidência para concluir"}>Marcar como concluída</button>
            ) : null}
            {pode ? <button type="button" style={st.btnGhost} onClick={() => onEditar(id)}>Editar</button> : null}
            {pode && !confirmaExcluir ? <button type="button" style={st.btnMiniDanger} onClick={() => setConfirmaExcluir(true)}>Excluir</button> : null}
            {pode && confirmaExcluir ? (
              <>
                <span style={{ alignSelf: "center", fontSize: 12.5, color: colors.dangerText }}>Isso também apaga os participantes e as evidências. Excluir mesmo?</span>
                <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={excluir}>Sim, excluir</button>
                <button type="button" style={st.btnGhost} onClick={() => setConfirmaExcluir(false)}>Não</button>
              </>
            ) : null}
          </div>
          {!coord && opera && !a.pode_editar ? <p style={{ fontSize: 12, color: colors.textMuted }}>Você pode consultar esta atividade, mas só o analista responsável e a coordenação a editam.</p> : null}
        </>
      )}
    </Modal>
  );
}

function camposEdicao(a) {
  return {
    tipo: a.tipo, tema: a.tema, publico: a.publico, data_inicio: a.data_inicio, data_fim: a.data_fim, horas: a.horas, formato: a.formato,
    programa_id: a.programa_id, frente_id: a.frente_id, dimensao_id: a.dimensao_id, unidade_id: a.unidade_id,
    analista_id: a.analista_id, resultado: a.resultado, proxima_etapa: a.proxima_etapa, observacoes: a.observacoes,
  };
}
