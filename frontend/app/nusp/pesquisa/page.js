"use client";

// Pesquisa de riscos psicossociais do Núcleo (NUSPSI, Pacote 3, 11/2026).
// Três abas: Resultado (agregado, aberto aos três perfis), Respostas individuais (SÓ coordenador, leitura registrada)
// e Importar (só coordenador). O agregado nunca traz nome; células com menos de 5 respondentes vêm protegidas.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import {
  st, Campo, Select, Modal, Badge, Paginacao, fmtNum, fmtData, perfilNusp, PERFIL_COORD,
} from "../../../components/NuspUi";

const CLASSE = {
  baixo: { rotulo: "Baixa", bg: colors.successLight, cor: colors.successText },
  moderado: { rotulo: "Moderada", bg: colors.warningLight, cor: colors.warningText },
  alto: { rotulo: "Alta", bg: colors.dangerLight, cor: colors.dangerText },
};
const SITUACAO = {
  em_tratamento: { rotulo: "Em tratamento", tom: "em_andamento" },
  sem_plano: { rotulo: "Alta exposição sem plano", tom: "atrasado" },
  monitorar: { rotulo: "Monitorar", tom: "alerta" },
  ok: { rotulo: "Sem ação necessária", tom: "concluida" },
  sem_dado: { rotulo: "Sem dado", tom: "pendente" },
};
const RECURSO = { pesquisa_individual: "Abriu uma resposta", pesquisa_individual_lista: "Consultou a lista" };
const pct1 = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

// Mesma regra do servidor (nacional): alta sem plano em aberto é o alerta; moderada sem plano pede monitoramento.
function situacaoDe(classe, planosAbertos) {
  if (classe === "alto") return planosAbertos ? "em_tratamento" : "sem_plano";
  if (classe === "moderado") return planosAbertos ? "em_tratamento" : "monitorar";
  if (classe === "baixo") return "ok";
  return "sem_dado";
}

function ChipClasse({ classe }) {
  const c = CLASSE[classe];
  if (!c) return <span style={{ color: colors.textMuted }}>—</span>;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.cor, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>{c.rotulo}</span>;
}

function BarraPct({ pct, classe }) {
  const c = CLASSE[classe];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: colors.neutralLight, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%`, height: "100%", background: c ? c.cor : colors.textMuted }} />
      </div>
      <strong style={{ fontSize: 13, minWidth: 48, textAlign: "right" }}>{pct === null || pct === undefined ? "—" : pct1(pct)}</strong>
    </div>
  );
}

// ── Aba Resultado ─────────────────────────────────────────────
function Resultado({ pesquisa, coord, onMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [unidadeSel, setUnidadeSel] = useState("");
  const [servicoSel, setServicoSel] = useState("");
  const [visao, setVisao] = useState("unidade");

  const carregar = useCallback(() => {
    setDados(null);
    apiFetch(`/nusp/pesquisas/${pesquisa.id}/resultados`).then((d) => { setDados(d); setErro(""); }).catch((e) => setErro(e.message));
  }, [pesquisa.id]);
  useEffect(() => { setUnidadeSel(""); setServicoSel(""); carregar(); }, [carregar]);

  const acao = async (caminho, metodo, texto, confirma) => {
    if (confirma && !window.confirm(confirma)) return;
    try {
      const r = await apiFetch(caminho, { method: metodo });
      setMsg(r.message || texto); setErro("");
      if (metodo === "DELETE") onMudou(); else carregar();
    } catch (e) { setErro(e.message); }
  };

  if (erro && !dados) return <div style={st.erro}>{erro}</div>;
  if (!dados) return <div style={st.vazio}>Carregando…</div>;

  const dims = dados.dimensoes;
  const sel = servicoSel ? dados.servicos.find((g) => g.rotulo === servicoSel) : unidadeSel ? dados.unidades.find((g) => String(g.id) === unidadeSel) : dados.nacional;
  const rotuloSel = servicoSel ? `Serviço ${servicoSel}` : unidadeSel ? `Unidade ${sel?.rotulo}` : "Nacional";
  const grupos = visao === "unidade" ? dados.unidades : dados.servicos;

  const celula = (g, d) => {
    const r = g.res[d.id];
    if (g.suprimido || !r || r.pct === null) return <td key={d.id} style={{ ...st.td, textAlign: "center", color: colors.textMuted, fontSize: 12 }} title={`Menos de ${dados.minimo_celula} respondentes: dado protegido`}>—</td>;
    const c = CLASSE[r.classificacao];
    return <td key={d.id} style={{ ...st.td, textAlign: "center", background: c?.bg, color: c?.cor, fontWeight: 800, fontSize: 12.5 }} title={`${d.nome}: ${pct1(r.pct)} — exposição ${c?.rotulo?.toLowerCase()}`}>{pct1(r.pct)}</td>;
  };

  return (
    <>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard title="Respondentes" value={fmtNum(dados.nacional?.n)} subtitle={`Ciclo ${pesquisa.ciclo} · ${fmtData(pesquisa.data_referencia)}`} accent={colors.primary} />
        <StatCard title="Dimensões em alta exposição" value={dados.resumo.altas} subtitle="Acima de 50% de respostas desfavoráveis" accent={colors.dangerText} />
        <StatCard title="Em exposição moderada" value={dados.resumo.moderadas} subtitle="De 26% a 50%" accent={colors.warningText} />
        <StatCard title="Altas sem plano de ação" value={dados.resumo.altas_sem_plano} subtitle={dados.resumo.altas_sem_plano ? "Precisa de plano em aberto" : "Todas com plano em aberto"} accent={dados.resumo.altas_sem_plano ? colors.dangerText : colors.successText} />
      </div>

      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <h3 style={st.cardTitle}>Farol por dimensão — {rotuloSel}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={st.btnGhost} onClick={() => apiDownload(`/nusp/pesquisas/${pesquisa.id}/exportar`, `nucleo-pesquisa-${pesquisa.ciclo}.xlsx`).catch((e) => setErro(e.message))}>Exportar Excel</button>
            {coord ? <button type="button" style={st.btnGhost} onClick={() => acao(`/nusp/pesquisas/${pesquisa.id}/recalcular`, "POST", "Resultados recalculados")}>Recalcular</button> : null}
            {coord ? <button type="button" style={st.btnGhost} onClick={() => acao(`/nusp/pesquisas/${pesquisa.id}/planos-sugeridos`, "POST", "Rascunhos conferidos")}>Criar rascunhos de plano</button> : null}
            {coord ? <button type="button" style={st.btnMiniDanger} onClick={() => acao(`/nusp/pesquisas/${pesquisa.id}`, "DELETE", "Pesquisa excluída", `Excluir a pesquisa ${pesquisa.ciclo} e TODAS as respostas dela? Isso não pode ser desfeito.`)}>Excluir pesquisa</button> : null}
          </div>
        </div>
        <div style={st.filtros}>
          <Campo label="Unidade" minWidth={200}>
            <Select value={unidadeSel} onChange={(v) => { setUnidadeSel(v); setServicoSel(""); }} opcoes={dados.unidades.map((u) => ({ value: String(u.id), label: u.rotulo }))} vazio="Nacional (todas)" />
          </Campo>
          <Campo label="Serviço" minWidth={240}>
            <Select value={servicoSel} onChange={(v) => { setServicoSel(v); setUnidadeSel(""); }} opcoes={dados.servicos.map((g) => ({ value: g.rotulo, label: g.suprimido ? `${g.rotulo} (protegido)` : g.rotulo }))} vazio="Todos" />
          </Campo>
        </div>
        {sel?.suprimido ? (
          <div style={{ ...st.erro, background: colors.warningLight, color: colors.warningText, borderColor: "#fde68a" }}>
            Este recorte tem menos de {dados.minimo_celula} respondentes (ou é complementar de um recorte protegido): os percentuais não são exibidos para proteger as pessoas.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={st.th}>Dimensão</th><th style={st.th}>% de exposição</th><th style={st.th}>Classificação</th>
                  {dados.anterior ? <th style={st.th}>vs {dados.anterior.ciclo}</th> : null}
                  <th style={st.th}>Planos em aberto</th><th style={st.th}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.farol.map((f) => {
                  const r = sel?.res[f.dimensao_id] || { pct: null, classificacao: null };
                  const nacionalSel = sel === dados.nacional;
                  const s = SITUACAO[situacaoDe(r.classificacao, f.planos.abertos)] || SITUACAO.sem_dado;
                  return (
                    <tr key={f.dimensao_id}>
                      <td style={st.td}><strong>{f.dimensao}</strong></td>
                      <td style={st.td}><BarraPct pct={r.pct} classe={r.classificacao} /></td>
                      <td style={st.td}><ChipClasse classe={r.classificacao} /></td>
                      {dados.anterior ? (
                        <td style={st.td}>{nacionalSel && f.variacao !== null ? <span style={{ color: f.variacao > 0 ? colors.dangerText : f.variacao < 0 ? colors.successText : colors.textSecondary, fontWeight: 700 }}>{f.variacao > 0 ? "▲" : f.variacao < 0 ? "▼" : "="} {Math.abs(f.variacao).toLocaleString("pt-BR")} p.p.</span> : <span style={{ color: colors.textMuted }}>—</span>}</td>
                      ) : null}
                      <td style={st.td}>
                        {f.planos.abertos ? <Link href={`/nusp/planos?dimensao_id=${f.dimensao_id}`} style={{ color: colors.primary, fontWeight: 700 }}>{f.planos.abertos} em aberto</Link> : <span style={{ color: colors.textMuted }}>nenhum</span>}
                        {f.planos.atrasados ? <div style={{ fontSize: 11, color: colors.dangerText, fontWeight: 700 }}>{f.planos.atrasados} atrasado(s)</div> : null}
                      </td>
                      <td style={st.td}><Badge tom={s.tom}>{s.rotulo}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: colors.textMuted, margin: "10px 0 0" }}>
          % de exposição = respostas desfavoráveis ÷ (favoráveis + desfavoráveis) nas perguntas da dimensão. Até 25% baixa · 26% a 50% moderada · acima de 50% alta.
          O farol de plano usa os planos de ação ligados à dimensão (qualquer unidade).
        </p>
      </div>

      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ ...st.cardTitle, margin: 0, marginRight: 8 }}>Comparativo</h3>
          {[["unidade", "Por unidade"], ["servico", `Por serviço (${dados.servicos.length})`]].map(([v, r]) => (
            <button key={v} type="button" onClick={() => setVisao(v)} style={{ ...st.btnGhost, height: 32, background: visao === v ? colors.primaryLight : "#fff", color: visao === v ? colors.primary : colors.textSecondary, fontWeight: 800 }}>{r}</button>
          ))}
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1250 }}>
            <thead>
              <tr>
                <th style={st.th}>{visao === "unidade" ? "Unidade" : "Serviço"}</th><th style={{ ...st.th, textAlign: "center" }}>Resp.</th>
                {dims.map((d) => <th key={d.id} style={{ ...st.th, textAlign: "center", fontSize: 10, minWidth: 92, maxWidth: 110, whiteSpace: "normal", lineHeight: 1.25, verticalAlign: "bottom", textTransform: "none" }} title={d.nome}>{d.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {dados.nacional ? (
                <tr style={{ background: colors.surfaceMuted }}>
                  <td style={st.td}><strong>Nacional</strong></td><td style={{ ...st.td, textAlign: "center" }}>{fmtNum(dados.nacional.n)}</td>
                  {dims.map((d) => celula(dados.nacional, d))}
                </tr>
              ) : null}
              {grupos.map((g) => (
                <tr key={`${g.recorte}-${g.id || g.rotulo}`}>
                  <td style={st.td}>{g.rotulo}</td>
                  <td style={{ ...st.td, textAlign: "center", color: g.suprimido ? colors.textMuted : undefined }}>{g.suprimido ? "<5" : fmtNum(g.n)}</td>
                  {dims.map((d) => celula(g, d))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 18px 14px", fontSize: 11.5, color: colors.textMuted }}>
          “—” = dado protegido (menos de {dados.minimo_celula} respondentes, ou recorte complementar de um protegido, para que o valor não possa ser descoberto por subtração). Cor: verde baixa · âmbar moderada · vermelho alta.
        </div>
      </div>
    </>
  );
}

// ── Aba Respostas individuais (só coordenador) ─────────────────
function DetalheIndividual({ pesquisaId, rid, onClose }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => { apiFetch(`/nusp/pesquisas/${pesquisaId}/individuais/${rid}`).then(setD).catch((e) => setErro(e.message)); }, [pesquisaId, rid]);
  return (
    <Modal titulo="Resposta individual" onClose={onClose} largura={900}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {!d && !erro ? <div style={st.vazio}>Abrindo…</div> : null}
      {d ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>{d.resposta.nome}</strong>
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
              mat. {d.resposta.matricula || "—"} · {d.resposta.unidade || d.resposta.site || "sem unidade"} · {d.resposta.servico || "sem serviço"} · {d.resposta.funcao || "sem função"}
              {d.resposta.respondida_em ? ` · respondeu em ${fmtData(d.resposta.respondida_em)}` : ""}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Supervisor: {d.resposta.supervisor || "—"} · Coordenador: {d.resposta.coordenador || "—"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginBottom: 14 }}>
            {d.dimensoes.map((x) => (
              <div key={x.dimensao} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 10px", background: CLASSE[x.classificacao]?.bg || "#fff" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.textSecondary }}>{x.dimensao}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <strong style={{ color: CLASSE[x.classificacao]?.cor || colors.textMuted }}>{x.pct === null ? "—" : pct1(x.pct)}</strong>
                  <span style={{ fontSize: 11.5, color: colors.textSecondary }}>{x.favoraveis} fav. · {x.desfavoraveis} desf.</span>
                </div>
              </div>
            ))}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={st.th}>#</th><th style={st.th}>Pergunta</th><th style={st.th}>Resposta</th><th style={st.th}>Leitura</th></tr></thead>
            <tbody>
              {d.perguntas.map((p) => (
                <tr key={p.n}>
                  <td style={st.td}>{p.n}</td>
                  <td style={st.td}>{p.texto}<div style={{ fontSize: 11, color: colors.textMuted }}>{p.dimensao || "não pontua"}</div></td>
                  <td style={st.td}>{p.resposta || "—"}</td>
                  <td style={st.td}>{p.leitura ? <Badge tom={p.leitura === "favoravel" ? "concluida" : "atrasado"}>{p.leitura === "favoravel" ? "Favorável" : "Desfavorável"}</Badge> : <span style={{ color: colors.textMuted }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </Modal>
  );
}

function Individuais({ pesquisa }) {
  const [lista, setLista] = useState({ itens: [], total: 0, limite: 50 });
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ busca: "", unidade_id: "", servico: "" });
  const [cad, setCad] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);
  const [acessos, setAcessos] = useState(false);

  useEffect(() => { apiFetch("/nusp/cadastros").then(setCad).catch(() => {}); }, []);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [f, pagina]);
  useEffect(() => {
    apiFetch(`/nusp/pesquisas/${pesquisa.id}/individuais?${qs}`).then((r) => { setLista(r); setErro(""); }).catch((e) => setErro(e.message));
  }, [pesquisa.id, qs]);
  const mudar = (k, v) => { setPagina(1); setF((x) => ({ ...x, [k]: v })); };

  return (
    <>
      <div style={{ background: colors.warningLight, color: colors.warningText, border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 14 }}>
        <strong>Conteúdo restrito ao coordenador do Núcleo.</strong> As respostas são guardadas criptografadas, e cada vez que a lista ou uma resposta é aberta o acesso fica registrado (quem e quando).
        Use só para acolhimento e acompanhamento das pessoas; não compartilhe nomes com a diretoria nem com as áreas.
      </div>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="Buscar" minWidth={220}><input style={st.input} value={f.busca} onChange={(e) => mudar("busca", e.target.value)} placeholder="Matrícula ou nome" /></Campo>
          <Campo label="Unidade" minWidth={190}><Select value={f.unidade_id} onChange={(v) => mudar("unidade_id", v)} opcoes={(cad?.unidades || []).filter((u) => u.ativo !== 0).map((u) => ({ value: String(u.id), label: u.nome }))} /></Campo>
          <Campo label="Serviço" minWidth={220}><input style={st.input} value={f.servico} onChange={(e) => mudar("servico", e.target.value)} placeholder="Nome exato do serviço" /></Campo>
        </div>
      </div>
      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr><th style={st.th}>Pessoa</th><th style={st.th}>Unidade</th><th style={st.th}>Serviço</th><th style={st.th}>Função</th><th style={st.th}>Respondeu em</th><th style={st.th} /></tr></thead>
            <tbody>
              {lista.itens.map((a) => (
                <tr key={a.id}>
                  <td style={st.td}><strong>{a.nome}</strong><div style={{ fontSize: 11.5, color: colors.textSecondary }}>mat. {a.matricula || "—"}</div></td>
                  <td style={st.td}>{a.unidade || "—"}</td><td style={st.td}>{a.servico || "—"}</td><td style={st.td}>{a.funcao || "—"}</td>
                  <td style={st.td}>{fmtData(a.respondida_em)}</td>
                  <td style={st.td}><button type="button" style={st.btnMini} onClick={() => setAberto(a.id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lista.itens.length && <div style={st.vazio}>Nenhuma resposta encontrada.</div>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 8 }}>
        {fmtNum(lista.total)} resposta(s). A lista não mostra as respostas; elas só abrem dentro da ficha.{" "}
        <button type="button" style={{ ...st.btnMini, marginLeft: 6 }} onClick={() => setAcessos((x) => !x)}>{acessos ? "Ocultar registro de acessos" : "Ver registro de acessos"}</button>
      </div>
      <Paginacao total={lista.total} limite={lista.limite} pagina={pagina} onPagina={setPagina} />
      {acessos ? <RegistroAcessos /> : null}
      {aberto ? <DetalheIndividual pesquisaId={pesquisa.id} rid={aberto} onClose={() => setAberto(null)} /> : null}
    </>
  );
}

function RegistroAcessos() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    Promise.all([apiFetch("/nusp/acessos?recurso=pesquisa_individual"), apiFetch("/nusp/acessos?recurso=pesquisa_individual_lista")])
      .then(([a, b]) => setItens([...(a.itens || []), ...(b.itens || [])].sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 60)))
      .catch((e) => setErro(e.message));
  }, []);
  return (
    <div style={{ ...st.card, marginTop: 12 }}>
      <h3 style={st.cardTitle}>Registro de acessos às respostas individuais</h3>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {!itens ? <div style={st.vazio}>Carregando…</div> : !itens.length ? <div style={st.vazio}>Nenhum acesso registrado.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={st.th}>Quando</th><th style={st.th}>Quem</th><th style={st.th}>O quê</th><th style={st.th}>Detalhe</th></tr></thead>
          <tbody>{itens.map((i) => (
            <tr key={i.id}>
              <td style={st.td}>{new Date(i.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td style={st.td}>{i.usuario_nome || "—"}</td><td style={st.td}>{RECURSO[i.recurso] || i.recurso}</td><td style={st.td}>{i.detalhe || (i.registro_id ? `registro ${i.registro_id}` : "—")}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

// ── Aba Importar (só coordenador) ──────────────────────────────
function Importar({ chaveOk, onImportada }) {
  const ano = new Date().getFullYear();
  const [arquivo, setArquivo] = useState(null);
  const [ciclo, setCiclo] = useState(`${ano}-1`);
  const [nome, setNome] = useState("");
  const [dataRef, setDataRef] = useState("");
  const [criarPlanos, setCriarPlanos] = useState(true);
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (simular) => {
    if (!arquivo) { setErro("Escolha a planilha (.xlsx) primeiro."); return; }
    if (!ciclo.trim()) { setErro("Informe o ciclo (ex.: 2026-1)."); return; }
    setOcupado(true); setErro("");
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo); fd.append("ciclo", ciclo.trim());
      if (nome.trim()) fd.append("nome", nome.trim());
      if (dataRef) fd.append("data_referencia", dataRef);
      fd.append("criar_planos", criarPlanos ? "1" : "0");
      const r = await apiFetch(`/nusp/pesquisas/importar${simular ? "?simular=1" : ""}`, { method: "POST", body: fd });
      setRel(r);
      if (!simular) onImportada(r.pesquisa.id);
    } catch (e) { setErro(e.message); setRel(null); } finally { setOcupado(false); }
  };
  const linha = (rot, v) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}><span style={{ color: colors.textSecondary }}>{rot}</span><strong>{typeof v === "number" ? fmtNum(v) : v}</strong></div>;
  const caixa = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12 };

  return (
    <div style={st.card}>
      <h3 style={st.cardTitle}>Importar respostas da pesquisa</h3>
      {!chaveOk ? <div style={{ ...st.erro, background: colors.warningLight, color: colors.warningText, borderColor: "#fde68a" }}>A chave de criptografia do Núcleo não está configurada neste ambiente: dá para simular, mas não gravar a pesquisa.</div> : null}
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: "0 0 12px" }}>
        Use a planilha com a aba <strong>BASE DE DADOS</strong> (uma linha por pessoa, com Matrícula, Site, Serviço e as 24 perguntas). Rodar de novo o <em>mesmo ciclo</em> substitui as respostas dele; um ciclo novo cria uma nova rodada para comparação.
      </p>
      <div style={st.filtros}>
        <Campo label="Ciclo *" minWidth={130} dica="Ex.: 2026-1"><input style={st.input} value={ciclo} maxLength={40} onChange={(e) => { setCiclo(e.target.value); setRel(null); }} /></Campo>
        <Campo label="Nome (opcional)" flex={2} minWidth={240}><input style={st.input} value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} placeholder="Pesquisa de riscos psicossociais 2026-1" /></Campo>
        <Campo label="Data de referência" minWidth={160} dica="Padrão: última resposta"><input type="date" style={st.input} value={dataRef} onChange={(e) => setDataRef(e.target.value)} /></Campo>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept=".xlsx" onChange={(e) => { setArquivo(e.target.files?.[0] || null); setRel(null); }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: colors.textSecondary }}>
          <input type="checkbox" checked={criarPlanos} onChange={(e) => setCriarPlanos(e.target.checked)} /> Criar rascunhos de plano de ação (5 dimensões da planilha)
        </label>
        <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => enviar(true)}>Simular (não grava)</button>
        <button type="button" style={st.btn} disabled={ocupado || !rel?.simulacao || !chaveOk} onClick={() => enviar(false)} title={rel?.simulacao ? "" : "Rode a simulação antes"}>{ocupado ? "Aguarde…" : "Importar de verdade"}</button>
      </div>
      {rel ? (
        <>
          <div style={rel.simulacao ? st.ok : { ...st.ok, background: colors.infoLight, color: "#075985", borderColor: "#bae6fd" }}>
            {rel.simulacao ? "Simulação concluída — nada foi gravado. Confira o resultado nacional abaixo antes de importar." : "Importação concluída."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            <div style={caixa}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Linhas</div>
              {linha("Lidas", rel.linhas.lidas)}{linha("Importadas", rel.linhas.importadas)}{linha("Sem matrícula", rel.linhas.sem_matricula)}
              {linha("Matrícula repetida no arquivo", rel.linhas.duplicadas_no_arquivo)}{linha("Sem nenhuma resposta", rel.linhas.sem_nenhuma_resposta)}
              {linha("Resposta fora das opções", rel.linhas.resposta_nao_reconhecida)}
              {rel.linhas.linhas_com_problema?.length ? <div style={{ fontSize: 11.5, color: colors.warningText, marginTop: 6 }}>Linhas com problema: {rel.linhas.linhas_com_problema.join(", ")}</div> : null}
            </div>
            <div style={caixa}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Pessoas e recortes</div>
              {linha("Já cadastradas", rel.pessoas.ja_cadastradas)}{linha("Novas (cadastro provisório)", rel.pessoas.novas)}
              {linha("Serviços", rel.servicos.total)}{linha(`Serviços com menos de ${rel.minimo_celula} resp. (protegidos)`, rel.servicos.abaixo_do_minimo)}
              {rel.pesquisa.ja_existia ? linha("Respostas substituídas", rel.pesquisa.respostas_anteriores_substituidas) : null}
              {rel.planos.solicitado ? linha("Rascunhos de plano criados", rel.planos.criados) : null}
            </div>
            <div style={caixa}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Sites</div>
              {rel.sites.map((s) => <div key={s.site}>{linha(s.site, s.respondentes)}</div>)}
              {rel.unidades_novas.length ? <div style={{ fontSize: 11.5, color: colors.warningText, marginTop: 6 }}>Serão criadas como unidade: {rel.unidades_novas.join(", ")}</div> : null}
            </div>
          </div>
          <div style={{ ...caixa, marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Resultado nacional calculado</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0 24px" }}>
              {rel.nacional.map((n) => <div key={n.dimensao} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "3px 0", gap: 8 }}><span>{n.dimensao}</span><span style={{ display: "flex", gap: 8, alignItems: "center" }}><strong>{pct1(n.pct)}</strong><ChipClasse classe={n.classificacao} /></span></div>)}
            </div>
          </div>
          {rel.avisos?.length ? <ul style={{ fontSize: 12.5, color: colors.warningText, paddingLeft: 18 }}>{rel.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul> : null}
        </>
      ) : null}
    </div>
  );
}

export default function PesquisaNuspPage() {
  const [perfil, setPerfil] = useState("");
  const [pesquisas, setPesquisas] = useState(null);
  const [chaveOk, setChaveOk] = useState(true);
  const [sel, setSel] = useState("");
  const [aba, setAba] = useState("resultado");
  const [erro, setErro] = useState("");

  useEffect(() => { setPerfil(perfilNusp()); }, []);
  const coord = perfil === PERFIL_COORD;

  const carregar = useCallback((selecionar) => {
    apiFetch("/nusp/pesquisas").then((r) => {
      setPesquisas(r.itens); if (r.chave_configurada !== undefined) setChaveOk(r.chave_configurada);
      setSel((atual) => (selecionar ? String(selecionar) : atual && r.itens.some((p) => String(p.id) === atual) ? atual : r.itens[0] ? String(r.itens[0].id) : ""));
      setErro("");
    }).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pesquisa = pesquisas?.find((p) => String(p.id) === sel) || null;
  const abaBtn = (id, rot) => (
    <button type="button" onClick={() => setAba(id)} style={{ ...st.btnGhost, background: aba === id ? colors.primaryLight : "#fff", color: aba === id ? colors.primary : colors.textSecondary, fontWeight: 800 }}>{rot}</button>
  );

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Pesquisa de riscos psicossociais">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Pesquisa de riscos psicossociais"
        subtitle="Exposição por dimensão, farol e plano de ação ligado a cada dimensão em alta exposição."
        actions={pesquisas?.length ? (
          <select value={sel} onChange={(e) => { setSel(e.target.value); setAba("resultado"); }} style={{ ...st.input, width: "auto", minWidth: 220 }} aria-label="Pesquisa">
            {pesquisas.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.ciclo})</option>)}
          </select>
        ) : null}
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {abaBtn("resultado", "Resultado")}
        {coord ? abaBtn("individual", "Respostas individuais") : null}
        {coord ? abaBtn("importar", "Importar") : null}
      </div>

      {aba === "importar" && coord ? (
        <Importar chaveOk={chaveOk} onImportada={(id) => { carregar(id); }} />
      ) : !pesquisas ? (
        <div style={st.vazio}>Carregando…</div>
      ) : !pesquisa ? (
        <div style={st.card}>
          <div style={st.vazio}>Nenhuma pesquisa importada ainda.{coord ? " Use a aba “Importar” para trazer as respostas." : " A coordenação do Núcleo ainda não importou os resultados."}</div>
        </div>
      ) : aba === "individual" && coord ? (
        <Individuais key={pesquisa.id} pesquisa={pesquisa} />
      ) : (
        <Resultado key={pesquisa.id} pesquisa={pesquisa} coord={coord} onMudou={() => carregar()} />
      )}
    </PortalShell>
  );
}
