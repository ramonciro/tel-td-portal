"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import {
  st, Campo, Select, Modal, Badge, Paginacao, opcoesDe, opcoesMapa,
  fmtData, fmtNum, hojeISO, perfilNusp, ehOperacao, PERFIL_COORD,
} from "../../../components/NuspUi";

const CANAL = { presencial: "Presencial", online: "Online (videochamada)", telefone: "Telefone", email_fale_comigo: "E-mail / Fale Comigo", nao_informado: "Não informado (histórico)" };
const ORIGEM = { espontaneo: "Procura espontânea", encaminhado: "Encaminhado", busca_ativa: "Busca ativa" };
const STATUS = { aberto: "Aberto", em_acompanhamento: "Em acompanhamento", encerrado: "Encerrado" };
const TOM_STATUS = { aberto: "alerta", em_acompanhamento: "em_andamento", encerrado: "concluida" };
const RESUMO_MAX = 500;
const RECURSO = { acolhimento: "Abriu uma ficha", acolhimento_lista: "Consultou a lista" };

const VAZIO = {
  matricula: "", nome: "", data_acolhimento: "", canal: "presencial", origem: "", motivo_id: "", encaminhamento_id: "",
  unidade_id: "", programa_id: "", data_retorno: "", status: "aberto", analista_id: "", resumo: "",
};
const dia = (v) => (v ? String(v).slice(0, 10) : "");
const hora = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function AvisoRestrito() {
  return (
    <div style={{ background: colors.warningLight, color: colors.warningText, border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 14 }}>
      <strong>Conteúdo restrito à equipe técnica do Núcleo.</strong> Cada vez que uma ficha é aberta, o acesso fica registrado (quem, quando). O resumo é guardado criptografado e deve trazer só a orientação geral:
      não registre diagnóstico, CID, medicação nem relato clínico.
    </div>
  );
}

function FormAcolhimento({ form, cad, coord, chaveOk, onClose, onSaved }) {
  const [d, setD] = useState(form.dados);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const edit = !!form.id;
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const salvar = async (e) => {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const corpo = { ...d };
      if (edit) { delete corpo.matricula; delete corpo.nome; }
      // Só manda o resumo se ele mudou (assim, sem a chave, dá para ajustar os dados administrativos).
      if (edit && d.resumo === form.resumoOriginal) delete corpo.resumo;
      if (!coord) delete corpo.analista_id;
      await apiFetch(edit ? `/nusp/acolhimentos/${form.id}` : "/nusp/acolhimentos", { method: edit ? "PUT" : "POST", body: JSON.stringify(corpo) });
      onSaved(edit ? "Acolhimento atualizado." : "Acolhimento registrado.");
    } catch (err) { setErro(err.message); } finally { setSalvando(false); }
  };

  return (
    <Modal titulo={edit ? "Editar acolhimento" : "Novo acolhimento individual"} onClose={onClose} largura={780}>
      <form onSubmit={salvar}>
        {erro ? <div style={st.erro}>{erro}</div> : null}
        {!chaveOk ? (
          <div style={{ ...st.erro, background: colors.warningLight, color: colors.warningText, borderColor: "#fde68a" }}>
            A chave de criptografia do Núcleo não está configurada neste ambiente: dá para registrar o acolhimento, mas não o resumo.
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Matrícula *" minWidth={140}>
            <input style={st.input} value={d.matricula} onChange={(e) => set("matricula", e.target.value)} required disabled={edit} />
          </Campo>
          <Campo label="Nome" flex={2} minWidth={220} dica={edit ? "" : "Necessário só se a matrícula ainda não estiver no cadastro."}>
            <input style={st.input} value={d.nome} onChange={(e) => set("nome", e.target.value)} disabled={edit} />
          </Campo>
          <Campo label="Data do acolhimento *" minWidth={160}>
            <input type="date" style={st.input} value={d.data_acolhimento} max={hojeISO()} onChange={(e) => set("data_acolhimento", e.target.value)} required />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Canal *" minWidth={190}><Select value={d.canal} onChange={(v) => set("canal", v)} opcoes={opcoesMapa(CANAL)} vazio={null} /></Campo>
          <Campo label="Origem" minWidth={170}><Select value={d.origem} onChange={(v) => set("origem", v)} opcoes={opcoesMapa(ORIGEM)} vazio="Não informada" /></Campo>
          <Campo label="Motivo (categoria geral)" minWidth={230}><Select value={d.motivo_id} onChange={(v) => set("motivo_id", v)} opcoes={opcoesDe(cad?.motivos)} vazio="Não informado" /></Campo>
          <Campo label="Encaminhamento" minWidth={230}><Select value={d.encaminhamento_id} onChange={(v) => set("encaminhamento_id", v)} opcoes={opcoesDe(cad?.encaminhamentos)} vazio="Não informado" /></Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo label="Unidade" minWidth={170}><Select value={d.unidade_id} onChange={(v) => set("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} vazio="Não informada" /></Campo>
          <Campo label="Programa" minWidth={190}><Select value={d.programa_id} onChange={(v) => set("programa_id", v)} opcoes={opcoesDe(cad?.programas)} vazio="Não informado" /></Campo>
          <Campo label="Retorno previsto" minWidth={160}><input type="date" style={st.input} value={d.data_retorno} onChange={(e) => set("data_retorno", e.target.value)} /></Campo>
          <Campo label="Situação" minWidth={170}><Select value={d.status} onChange={(v) => set("status", v)} opcoes={opcoesMapa(STATUS)} vazio={null} /></Campo>
          {coord ? (
            <Campo label="Responsável" minWidth={190}>
              <Select value={d.analista_id} onChange={(v) => set("analista_id", v)} opcoes={(cad?.analistas || []).map((a) => ({ value: String(a.id), label: a.nome }))} vazio="Eu mesmo(a)" />
            </Campo>
          ) : null}
        </div>
        <Campo label={`Resumo curto (opcional, até ${RESUMO_MAX} caracteres)`} flex={1} minWidth={280}
          dica="Só a orientação geral. Sem diagnóstico, CID, medicação ou relato clínico. Fica criptografado.">
          <textarea style={{ ...st.textarea, minHeight: 110 }} value={d.resumo} maxLength={RESUMO_MAX} onChange={(e) => set("resumo", e.target.value)} />
          <div style={{ textAlign: "right", fontSize: 11, color: colors.textMuted }}>{d.resumo.length}/{RESUMO_MAX}</div>
        </Campo>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button type="button" style={st.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" style={st.btn} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
      <div style={{ width: 150, flexShrink: 0, color: colors.textSecondary, fontWeight: 700, fontSize: 12 }}>{rotulo}</div>
      <div style={{ minWidth: 0 }}>{children || "—"}</div>
    </div>
  );
}

function DetalheAcolhimento({ id, coord, onClose, onEditar, onExcluido }) {
  const [it, setIt] = useState(null);
  const [erro, setErro] = useState("");
  const [confirma, setConfirma] = useState(false);
  useEffect(() => {
    apiFetch(`/nusp/acolhimentos/${id}`).then((r) => setIt(r.item)).catch((e) => setErro(e.message));
  }, [id]);

  const excluir = async () => {
    try { await apiFetch(`/nusp/acolhimentos/${id}`, { method: "DELETE" }); onExcluido(); } catch (e) { setErro(e.message); }
  };

  return (
    <Modal titulo="Acolhimento individual" onClose={onClose} largura={720}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {!it && !erro ? <div style={st.vazio}>Carregando…</div> : null}
      {it && (
        <>
          <Linha rotulo="Pessoa"><strong>{it.pessoa_nome}</strong> · matrícula {it.pessoa_matricula}</Linha>
          <Linha rotulo="Data">{fmtData(it.data_acolhimento)}</Linha>
          <Linha rotulo="Canal">{CANAL[it.canal] || it.canal}</Linha>
          <Linha rotulo="Origem">{ORIGEM[it.origem]}</Linha>
          <Linha rotulo="Motivo">{it.motivo}</Linha>
          <Linha rotulo="Encaminhamento">{it.encaminhamento}</Linha>
          <Linha rotulo="Unidade / programa">{[it.unidade, it.programa].filter(Boolean).join(" · ")}</Linha>
          <Linha rotulo="Retorno previsto">{it.data_retorno ? fmtData(it.data_retorno) : ""}</Linha>
          <Linha rotulo="Situação"><Badge tom={TOM_STATUS[it.status]}>{STATUS[it.status] || it.status}</Badge></Linha>
          <Linha rotulo="Responsável">{it.analista_nome}</Linha>
          <Linha rotulo="Origem do registro">{it.origem_registro === "importacao" ? "Importado da planilha (só dados administrativos)" : "Registrado no portal"}</Linha>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: colors.textSecondary, marginBottom: 4 }}>Resumo</div>
            {it.resumo_indisponivel === "SEM_CHAVE" ? (
              <div style={st.erro}>O resumo existe, mas a chave de criptografia não está configurada neste ambiente. Avise o responsável técnico.</div>
            ) : it.resumo_indisponivel ? (
              <div style={st.erro}>O resumo não pôde ser aberto (chave diferente da usada na gravação). Avise o responsável técnico.</div>
            ) : it.resumo ? (
              <div style={{ background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, fontSize: 13, whiteSpace: "pre-wrap" }}>{it.resumo}</div>
            ) : (
              <div style={{ fontSize: 13, color: colors.textMuted }}>Sem resumo registrado.</div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {coord && !confirma ? <button type="button" style={st.btnMiniDanger} onClick={() => setConfirma(true)}>Excluir</button> : null}
            {coord && confirma ? (
              <>
                <span style={{ fontSize: 12.5, color: colors.dangerText, alignSelf: "center" }}>Excluir de vez? Não dá para desfazer.</span>
                <button type="button" style={st.btnMiniDanger} onClick={excluir}>Sim, excluir</button>
                <button type="button" style={st.btnGhost} onClick={() => setConfirma(false)}>Não</button>
              </>
            ) : null}
            <button type="button" style={st.btnGhost} onClick={onClose}>Fechar</button>
            <button type="button" style={st.btn} onClick={() => onEditar(it)}>Editar</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function RegistroAcessos() {
  const [f, setF] = useState({ recurso: "", de: "", ate: "" });
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50 });
  const [erro, setErro] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [f, pagina]);
  useEffect(() => {
    apiFetch(`/nusp/acessos?${qs}`).then((r) => { setLista(r); setErro(""); }).catch((e) => setErro(e.message));
  }, [qs]);
  const mudar = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };
  return (
    <>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: "0 0 12px" }}>
        Quem abriu fichas de acolhimento e quando. O registro guarda o fato, nunca o conteúdo lido.
      </p>
      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="O que foi feito" minWidth={200}><Select value={f.recurso} onChange={(v) => mudar("recurso", v)} opcoes={opcoesMapa(RECURSO)} /></Campo>
          <Campo label="De" minWidth={140}><input type="date" style={st.input} value={f.de} onChange={(e) => mudar("de", e.target.value)} /></Campo>
          <Campo label="Até" minWidth={140}><input type="date" style={st.input} value={f.ate} onChange={(e) => mudar("ate", e.target.value)} /></Campo>
        </div>
      </div>
      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr><th style={st.th}>Data e hora</th><th style={st.th}>Usuário</th><th style={st.th}>Ação</th><th style={st.th}>Ficha</th><th style={st.th}>Detalhe</th></tr></thead>
            <tbody>
              {lista.itens.map((a) => (
                <tr key={a.id}>
                  <td style={st.td}>{hora(a.created_at)}</td>
                  <td style={st.td}>{a.usuario_nome || "—"}<div style={{ fontSize: 11, color: colors.textMuted }}>{a.perfil}</div></td>
                  <td style={st.td}>{RECURSO[a.recurso] || a.recurso}</td>
                  <td style={st.td}>{a.registro_id ? `#${a.registro_id}` : "—"}</td>
                  <td style={st.td}>{a.detalhe || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lista.itens.length && <div style={st.vazio}>Nenhum acesso registrado neste filtro.</div>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>{fmtNum(lista.total)} acesso(s).</div>
      <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />
    </>
  );
}

export default function AcolhimentosPage() {
  const [perfil, setPerfil] = useState("");
  const [aba, setAba] = useState("fichas");
  const [cad, setCad] = useState(null);
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50, chave_configurada: true });
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ q: "", de: "", ate: "", motivo_id: "", unidade_id: "", canal: "", status: "", analista_id: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  useEffect(() => { setPerfil(perfilNusp()); }, []);
  const coord = perfil === PERFIL_COORD;
  const opera = ehOperacao(perfil);

  useEffect(() => { apiFetch("/nusp/cadastros").then(setCad).catch((e) => setErro(e.message)); }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [f, pagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await apiFetch(`/nusp/acolhimentos?${qs}`)); setErro(""); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { if (opera) carregar(); }, [carregar, opera]);

  const mudar = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };
  const abrirNovo = () => setForm({ dados: { ...VAZIO, data_acolhimento: hojeISO() } });
  const abrirEdicao = (it) => {
    const resumo = it.resumo || "";
    setDetalheId(null);
    setForm({
      id: it.id, resumoOriginal: resumo,
      dados: {
        ...VAZIO, matricula: it.pessoa_matricula, nome: it.pessoa_nome, data_acolhimento: dia(it.data_acolhimento), canal: it.canal, origem: it.origem || "",
        motivo_id: it.motivo_id ? String(it.motivo_id) : "", encaminhamento_id: it.encaminhamento_id ? String(it.encaminhamento_id) : "",
        unidade_id: it.unidade_id ? String(it.unidade_id) : "", programa_id: it.programa_id ? String(it.programa_id) : "",
        data_retorno: dia(it.data_retorno), status: it.status, analista_id: it.analista_id ? String(it.analista_id) : "", resumo,
      },
    });
  };

  if (perfil && !opera) {
    return (
      <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Acolhimentos">
        <div style={st.erro}>Acesso restrito à equipe técnica do Núcleo.</div>
      </PortalShell>
    );
  }

  const abaBtn = (id, rot) => (
    <button type="button" onClick={() => setAba(id)} style={{ ...st.btnGhost, background: aba === id ? colors.primaryLight : "#fff", color: aba === id ? colors.primary : colors.textSecondary, fontWeight: 800 }}>{rot}</button>
  );

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Acolhimentos">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Acolhimentos individuais"
        subtitle={coord ? "Você vê todos os acolhimentos do Núcleo." : "Você vê só os acolhimentos que registrou ou de que é responsável."}
        actions={<button type="button" style={st.btn} onClick={abrirNovo}>+ Novo acolhimento</button>}
      />
      <AvisoRestrito />
      {coord ? <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>{abaBtn("fichas", "Fichas")}{abaBtn("acessos", "Registro de acessos")}</div> : null}
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}

      {aba === "acessos" && coord ? <RegistroAcessos /> : (
        <>
          <div style={{ ...st.card, marginBottom: 16 }}>
            <div style={st.filtros}>
              <Campo label="Buscar" minWidth={190}><input style={st.input} value={f.q} onChange={(e) => mudar("q", e.target.value)} placeholder="Matrícula ou nome" /></Campo>
              <Campo label="De" minWidth={140}><input type="date" style={st.input} value={f.de} onChange={(e) => mudar("de", e.target.value)} /></Campo>
              <Campo label="Até" minWidth={140}><input type="date" style={st.input} value={f.ate} onChange={(e) => mudar("ate", e.target.value)} /></Campo>
              <Campo label="Motivo" minWidth={200}><Select value={f.motivo_id} onChange={(v) => mudar("motivo_id", v)} opcoes={opcoesDe(cad?.motivos)} /></Campo>
              <Campo label="Unidade" minWidth={150}><Select value={f.unidade_id} onChange={(v) => mudar("unidade_id", v)} opcoes={opcoesDe(cad?.unidades)} /></Campo>
              <Campo label="Canal" minWidth={170}><Select value={f.canal} onChange={(v) => mudar("canal", v)} opcoes={opcoesMapa(CANAL)} /></Campo>
              <Campo label="Situação" minWidth={150}><Select value={f.status} onChange={(v) => mudar("status", v)} opcoes={opcoesMapa(STATUS)} /></Campo>
              {coord ? <Campo label="Responsável" minWidth={170}><Select value={f.analista_id} onChange={(v) => mudar("analista_id", v)} opcoes={(cad?.analistas || []).map((a) => ({ value: String(a.id), label: a.nome }))} /></Campo> : null}
            </div>
          </div>

          <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={st.th}>Data</th><th style={st.th}>Pessoa</th><th style={st.th}>Canal</th><th style={st.th}>Motivo</th><th style={st.th}>Unidade</th>
                    <th style={st.th}>Encaminhamento</th><th style={st.th}>Situação</th><th style={st.th}>Responsável</th><th style={st.th} />
                  </tr>
                </thead>
                <tbody>
                  {lista.itens.map((a) => (
                    <tr key={a.id}>
                      <td style={st.td}>{fmtData(a.data_acolhimento)}</td>
                      <td style={st.td}><strong>{a.pessoa_nome}</strong><div style={{ fontSize: 11.5, color: colors.textSecondary }}>mat. {a.pessoa_matricula}</div></td>
                      <td style={st.td}>{CANAL[a.canal] || a.canal}</td>
                      <td style={st.td}>{a.motivo || "—"}</td>
                      <td style={st.td}>{a.unidade || "—"}</td>
                      <td style={st.td}>{a.encaminhamento || "—"}</td>
                      <td style={st.td}><Badge tom={TOM_STATUS[a.status]}>{STATUS[a.status] || a.status}</Badge>{a.data_retorno ? <div style={{ fontSize: 11, color: colors.textSecondary }}>retorno {fmtData(a.data_retorno)}</div> : null}</td>
                      <td style={st.td}>{a.analista_nome || "—"}</td>
                      <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setDetalheId(a.id)}>Abrir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lista.itens.length && <div style={st.vazio}>{carregando ? "Carregando…" : "Nenhum acolhimento encontrado."}</div>}
          </div>
          <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>{fmtNum(lista.total)} acolhimento(s). A lista não mostra o resumo; ele só abre dentro da ficha.</div>
          <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />
        </>
      )}

      {form && (
        <FormAcolhimento form={form} cad={cad} coord={coord} chaveOk={lista.chave_configurada !== false} onClose={() => setForm(null)}
          onSaved={(t) => { setForm(null); setMsg(t); carregar(); }} />
      )}
      {detalheId && (
        <DetalheAcolhimento id={detalheId} coord={coord} onClose={() => setDetalheId(null)} onEditar={abrirEdicao}
          onExcluido={() => { setDetalheId(null); setMsg("Acolhimento excluído."); carregar(); }} />
      )}
    </PortalShell>
  );
}
