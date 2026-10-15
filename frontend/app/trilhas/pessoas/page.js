"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import StatCard from "../../../components/StatCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";
import { btnPrimario, btnSecundario, btnPerigo, btnMini, entrada, rotulo, gradeForm, painel, dica, acoes, vazio, avisoErro, avisoOk, selo, fmtNum } from "../../mapa-desenvolvimento/desenvolvimento/estilos";

// Trilhas → Participantes e progresso (Fase 3, 16/10/2026).
// Quem está em cada trilha e quais etapas cada pessoa concluiu, lançado pela
// Metodologia (o treinando ainda não tem login). A lista nasce da sincronização
// com os participantes das jornadas ligadas à trilha e aceita inclusão manual.
// Backend: /api/trilha-pessoas.

const fmtData = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export default function TrilhaPessoasPage() {
  const [trilhas, setTrilhas] = useState([]);
  const [trilhaId, setTrilhaId] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtros, setFiltros] = useState({ busca: "", turma: "" });
  const [sel, setSel] = useState(null); // { pid, eid }
  const [previaSync, setPreviaSync] = useState(null);
  const [previaTodos, setPreviaTodos] = useState(null); // { eid, dataConclusao, ...prévia }
  const [adicionando, setAdicionando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [confirmaRemover, setConfirmaRemover] = useState(null);

  useEffect(() => {
    if (!erro && !aviso) return undefined;
    const t = window.setTimeout(() => {
      setErro("");
      setAviso("");
    }, 7000);
    return () => window.clearTimeout(t);
  }, [erro, aviso]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await apiFetch("/trilhas");
        const ordenada = (Array.isArray(lista) ? lista : []).slice().sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
        setTrilhas(ordenada);
        const pedido = new URLSearchParams(window.location.search).get("trilha");
        const alvo = ordenada.find((t) => String(t.id) === pedido) || ordenada[0];
        if (alvo) setTrilhaId(String(alvo.id));
        else setCarregando(false);
      } catch (e) {
        setErro(e.message || "Erro ao carregar as trilhas.");
        setCarregando(false);
      }
    })();
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!trilhaId) return;
      if (!silencioso) setCarregando(true);
      try {
        setDados(await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/matriz`));
      } catch (e) {
        setErro(e.message || "Erro ao carregar os participantes da trilha.");
      } finally {
        setCarregando(false);
      }
    },
    [trilhaId]
  );

  useEffect(() => {
    setDados(null);
    setSel(null);
    setPreviaSync(null);
    setPreviaTodos(null);
    setAdicionando(false);
    setConfirmaRemover(null);
    carregar();
  }, [carregar]);

  const turmas = useMemo(() => (dados ? Array.from(new Set(dados.participantes.map((p) => p.turma).filter(Boolean))).sort() : []), [dados]);
  const linhas = useMemo(() => {
    if (!dados) return [];
    const b = filtros.busca.trim().toLowerCase();
    return dados.participantes.filter((p) => (!b || `${p.nome} ${p.matricula || ""}`.toLowerCase().includes(b)) && (!filtros.turma || p.turma === filtros.turma));
  }, [dados, filtros]);

  const trilhaAtual = trilhas.find((t) => String(t.id) === trilhaId);
  const pessoaSel = dados && sel ? dados.participantes.find((p) => p.id === sel.pid) : null;
  const etapaSel = dados && sel ? dados.etapas.find((e) => e.id === sel.eid) : null;

  async function verPreviaSync() {
    setErro("");
    try {
      const r = await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/sincronizar`, { method: "POST", body: JSON.stringify({}) });
      if (!r.jornadas) setAviso("Nenhuma jornada está ligada a esta trilha. Ligue a trilha à jornada em Encontros e presença, ou inclua as pessoas manualmente.");
      else if (!r.novos) setAviso(`Lista já está em dia com ${r.jornadas} jornada(s) ligada(s).${r.ignorados_removidos ? ` ${r.ignorados_removidos} pessoa(s) que você tirou da trilha continuam fora.` : ""}`);
      else setPreviaSync(r);
    } catch (e) {
      setErro(e.message || "Não foi possível calcular a sincronização.");
    }
  }

  async function aplicarSync() {
    setErro("");
    try {
      const r = await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/sincronizar`, { method: "POST", body: JSON.stringify({ confirmar: true }) });
      setPreviaSync(null);
      setAviso(`${r.novos} pessoa(s) trazida(s) das jornadas.`);
      carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível sincronizar.");
    }
  }

  async function verPreviaTodos(eid, dataConclusao) {
    setErro("");
    try {
      const r = await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/etapas/${eid}/marcar-todos`, { method: "POST", body: JSON.stringify({ data_conclusao: dataConclusao }) });
      if (!r.total) setAviso("Todos já têm lançamento nesta etapa.");
      else setPreviaTodos({ ...r, eid, dataConclusao });
    } catch (e) {
      setErro(e.message || "Não foi possível calcular.");
    }
  }

  async function aplicarTodos() {
    setErro("");
    try {
      const r = await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/etapas/${previaTodos.eid}/marcar-todos`, { method: "POST", body: JSON.stringify({ data_conclusao: previaTodos.dataConclusao, confirmar: true }) });
      setPreviaTodos(null);
      setAviso(`${r.aplicadas} pessoa(s) marcada(s) como concluída(s) em "${r.etapa}". Lançamentos que você já tinha feito não foram alterados.`);
      carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível marcar.");
    }
  }

  async function remover(pid) {
    setErro("");
    try {
      await apiFetch(`/trilha-pessoas/participantes/${pid}`, { method: "DELETE" });
      setConfirmaRemover(null);
      setSel(null);
      setAviso("Pessoa tirada da trilha. O que já foi lançado fica guardado e volta se você reativar.");
      carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível tirar a pessoa da trilha.");
    }
  }

  async function reativar(pid) {
    setErro("");
    try {
      await apiFetch(`/trilha-pessoas/participantes/${pid}/reativar`, { method: "POST", body: JSON.stringify({}) });
      setAviso("Pessoa de volta à trilha.");
      carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível reativar.");
    }
  }

  async function exportar() {
    setExportando(true);
    setErro("");
    try {
      await apiDownload(`/trilha-pessoas/trilhas/${trilhaId}/exportar`, "progresso-trilha.xlsx");
    } catch (e) {
      setErro(e.message || "Erro ao exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16 }}>
        <PageHero
          eyebrow="Trilhas"
          title="Participantes e progresso da trilha"
          subtitle="Quem está em cada trilha e quais etapas cada pessoa concluiu, lançado pela Metodologia. A lista pode vir das jornadas ligadas à trilha ou ser montada à mão."
          actions={
            <>
              <Link href="/trilhas" style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>
                ← Trilhas
              </Link>
              <button style={btnSecundario} onClick={exportar} disabled={exportando || !trilhaId}>
                {exportando ? "Exportando..." : "⬇ Exportar Excel"}
              </button>
            </>
          }
        />

        {erro && <div style={avisoErro}>{erro}</div>}
        {aviso && <div style={avisoOk}>{aviso}</div>}

        <SectionCard
          title="Trilha"
          subtitle={trilhaAtual ? [trilhaAtual.cliente, dados?.jornadas?.length ? `${dados.jornadas.length} jornada(s) ligada(s): ${dados.jornadas.map((j) => j.nome).join(", ")}` : "sem jornada ligada"].filter(Boolean).join(" · ") : undefined}
          action={
            dados ? (
              <div style={acoes}>
                <button style={btnSecundario} onClick={verPreviaSync}>
                  Sincronizar com as jornadas
                </button>
                <button style={btnPrimario} onClick={() => setAdicionando((v) => !v)}>
                  + Adicionar pessoa
                </button>
              </div>
            ) : null
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ ...rotulo, maxWidth: 520 }}>
              Escolha a trilha
              <select style={entrada} value={trilhaId} onChange={(e) => setTrilhaId(e.target.value)}>
                {trilhas.length === 0 && <option value="">Nenhuma trilha cadastrada</option>}
                {trilhas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titulo}
                    {t.cliente ? ` — ${t.cliente}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {previaSync && (
              <div style={painel}>
                <strong style={{ fontSize: 14 }}>Sincronizar com as jornadas</strong>
                <div style={dica}>
                  {previaSync.novos} pessoa(s) das {previaSync.jornadas} jornada(s) ligada(s) ainda não estão na trilha e serão incluídas
                  {previaSync.nomes_novos.length ? `: ${previaSync.nomes_novos.slice(0, 12).join(", ")}${previaSync.novos > 12 ? "…" : ""}` : ""}.
                  Quem você já tirou da trilha não volta, e o que foi lançado não é alterado.
                </div>
                <div style={acoes}>
                  <button style={btnPrimario} onClick={aplicarSync}>
                    Incluir {previaSync.novos} pessoa(s)
                  </button>
                  <button style={btnSecundario} onClick={() => setPreviaSync(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {adicionando && (
              <AdicionarPessoa
                trilhaId={trilhaId}
                jaNaLista={dados ? dados.participantes.map((p) => p.pessoa_id).filter(Boolean) : []}
                setErro={setErro}
                setAviso={setAviso}
                onFechar={() => setAdicionando(false)}
                onAdicionou={() => carregar(true)}
              />
            )}
          </div>
        </SectionCard>

        {dados && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <StatCard title="Participantes" value={dados.totais.participantes} subtitle={`${dados.totais.etapas} etapa(s) na trilha`} accent={colors.primary} />
            <StatCard title="% médio de conclusão" value={dados.totais.pct_medio === null ? "—" : `${fmtNum(dados.totais.pct_medio)}%`} subtitle="etapas concluídas ÷ etapas da trilha" accent={colors.success} />
            <StatCard title="Concluíram todas as etapas" value={dados.totais.concluiram_todas} subtitle={`de ${dados.totais.participantes} participantes`} accent={colors.success} />
            <StatCard title="Sem nenhuma etapa lançada" value={dados.totais.sem_lancamento} subtitle="ainda sem lançamento" accent={dados.totais.sem_lancamento ? colors.warning : colors.neutral} />
          </div>
        )}

        {dados && dados.etapas.length === 0 && (
          <SectionCard title="Etapas">
            <div style={vazio}>Esta trilha ainda não tem etapas. Cadastre-as em Trilhas → editar a trilha.</div>
          </SectionCard>
        )}

        {dados && dados.etapas.length > 0 && (
          <SectionCard title="Pessoas × etapas" subtitle="Clique numa célula para lançar a conclusão (com data e observação). “Marcar todos” preenche só quem ainda não tem lançamento.">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input style={{ ...entrada, maxWidth: 280 }} placeholder="Buscar por nome ou matrícula" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
                {turmas.length > 0 && (
                  <select style={{ ...entrada, maxWidth: 220 }} value={filtros.turma} onChange={(e) => setFiltros({ ...filtros, turma: e.target.value })}>
                    <option value="">Todas as turmas</option>
                    {turmas.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {previaTodos && (
                <div style={painel}>
                  <strong style={{ fontSize: 14 }}>Marcar todos — {previaTodos.etapa}</strong>
                  <div style={dica}>
                    {previaTodos.total} pessoa(s) ainda sem lançamento nesta etapa serão marcadas como concluídas em {fmtData(previaTodos.dataConclusao)}
                    {previaTodos.nomes.length ? `: ${previaTodos.nomes.slice(0, 10).join(", ")}${previaTodos.total > 10 ? "…" : ""}` : ""}.
                  </div>
                  <div style={acoes}>
                    <button style={btnPrimario} onClick={aplicarTodos}>
                      Marcar {previaTodos.total} pessoa(s)
                    </button>
                    <button style={btnSecundario} onClick={() => setPreviaTodos(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div style={{ overflow: "auto", maxHeight: "70vh", border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thBase, ...fixaEsq, zIndex: 4, minWidth: 220 }}>Participante</th>
                      {dados.etapas.map((e) => (
                        <th key={e.id} style={{ ...thBase, textAlign: "center", minWidth: 150 }}>
                          <div style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: colors.textPrimary, fontWeight: 800 }}>{e.titulo}</div>
                          <button type="button" style={{ ...btnMini, marginTop: 4, textTransform: "none", letterSpacing: 0 }} onClick={() => verPreviaTodos(e.id, dados.hoje)}>
                            Marcar todos
                          </button>
                        </th>
                      ))}
                      <th style={{ ...thBase, textAlign: "center", minWidth: 100 }}>Concluídas</th>
                      <th style={{ ...thBase, textAlign: "center", minWidth: 80 }}>%</th>
                      <th style={{ ...thBase, textAlign: "center", minWidth: 90 }}>&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((p) => (
                      <tr key={p.id}>
                        <td style={{ ...tdBase, ...fixaEsq, background: "#fff" }}>
                          <div style={{ fontWeight: 700 }}>{p.nome}</div>
                          <div style={{ fontSize: 11, color: colors.textSecondary }}>
                            {[p.matricula, p.turma].filter(Boolean).join(" · ")}
                            {p.origem === "manual" ? " · incluída à mão" : ""}
                          </div>
                        </td>
                        {dados.etapas.map((e) => {
                          const c = p.etapas[e.id];
                          const ativo = sel && sel.pid === p.id && sel.eid === e.id;
                          return (
                            <td key={e.id} style={{ ...tdBase, textAlign: "center", padding: 4 }}>
                              <button
                                type="button"
                                onClick={() => setSel({ pid: p.id, eid: e.id })}
                                title={c.concluida ? `Concluída em ${fmtData(c.data_conclusao)}${c.observacao ? ` — ${c.observacao}` : ""}` : "Lançar conclusão"}
                                style={{ width: "100%", minHeight: 44, borderRadius: radius.sm, cursor: "pointer", padding: 6, display: "grid", gap: 2, justifyItems: "center", alignContent: "center", background: c.concluida ? colors.successLight : "#fff", border: `2px ${c.concluida ? "solid" : "dashed"} ${ativo ? colors.primary : c.concluida ? colors.successText : colors.border}`, color: c.concluida ? colors.successText : colors.textMuted }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 800 }}>{c.concluida ? "✓ Concluída" : "—"}</span>
                                {c.concluida && <span style={{ fontSize: 10.5, fontWeight: 600 }}>{fmtData(c.data_conclusao)}</span>}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {p.concluidas}/{p.total_etapas}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 800 }}>{p.pct === null ? "—" : `${fmtNum(p.pct)}%`}</td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {confirmaRemover === p.id ? (
                            <span style={{ display: "inline-flex", gap: 4 }}>
                              <button type="button" style={{ ...btnMini, color: colors.dangerText }} onClick={() => remover(p.id)}>
                                Confirmar
                              </button>
                              <button type="button" style={btnMini} onClick={() => setConfirmaRemover(null)}>
                                Não
                              </button>
                            </span>
                          ) : (
                            <button type="button" style={btnMini} onClick={() => setConfirmaRemover(p.id)}>
                              Tirar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {linhas.length === 0 && (
                      <tr>
                        <td style={{ ...tdBase, textAlign: "center", color: colors.textMuted }} colSpan={dados.etapas.length + 4}>
                          {dados.participantes.length === 0 ? "Nenhuma pessoa na trilha ainda. Use “Sincronizar com as jornadas” ou “+ Adicionar pessoa”." : "Nenhum participante encontrado."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {pessoaSel && etapaSel && (
                <EditorConclusao
                  key={`${sel.pid}:${sel.eid}:${pessoaSel.etapas[sel.eid].data_conclusao || "novo"}`}
                  pessoa={pessoaSel}
                  etapa={etapaSel}
                  celula={pessoaSel.etapas[sel.eid]}
                  hoje={dados.hoje}
                  setErro={setErro}
                  setAviso={setAviso}
                  onFechar={() => setSel(null)}
                  onSalvou={() => {
                    setSel(null);
                    carregar(true);
                  }}
                />
              )}
            </div>
          </SectionCard>
        )}

        {dados && dados.removidos.length > 0 && (
          <SectionCard title="Tiradas da trilha" subtitle="Não aparecem na matriz nem voltam pela sincronização. O que já foi lançado fica guardado.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {dados.removidos.map((r) => (
                <span key={r.id} style={{ ...selo, background: colors.neutralLight, color: colors.neutral, display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {r.nome}
                  <button type="button" style={btnMini} onClick={() => reativar(r.id)}>
                    Reativar
                  </button>
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {carregando && !dados && <div style={vazio}>Carregando...</div>}
      </div>
    </PortalShell>
  );
}

function EditorConclusao({ pessoa, etapa, celula, hoje, onFechar, onSalvou, setErro, setAviso }) {
  const [form, setForm] = useState({ data: celula.data_conclusao || hoje, observacao: celula.observacao || "" });
  const [salvando, setSalvando] = useState(false);
  const raiz = useRef(null);

  // O editor abre abaixo da matriz; com lista longa ele ficaria fora da tela.
  useEffect(() => {
    if (raiz.current && typeof raiz.current.scrollIntoView === "function") raiz.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  async function enviar(corpo, mensagem) {
    setSalvando(true);
    setErro("");
    try {
      await apiFetch(`/trilha-pessoas/participantes/${pessoa.id}/etapas/${etapa.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      setAviso(mensagem);
      onSalvou();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={painel} ref={raiz}>
      <strong style={{ fontSize: 14 }}>
        {pessoa.nome} — {etapa.titulo}
      </strong>
      <div style={gradeForm}>
        <label style={rotulo}>
          Data de conclusão
          <input type="date" style={entrada} value={form.data} max={hoje} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </label>
        <label style={{ ...rotulo, gridColumn: "1 / -1" }}>
          Observação (opcional)
          <textarea style={{ ...entrada, minHeight: 60 }} maxLength={500} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        </label>
      </div>
      <div style={acoes}>
        <button style={btnPrimario} disabled={salvando || !form.data} onClick={() => enviar({ concluida: true, data_conclusao: form.data, observacao: form.observacao }, celula.concluida ? "Lançamento atualizado." : "Etapa marcada como concluída.")}>
          {celula.concluida ? "Salvar alterações" : "Marcar como concluída"}
        </button>
        {celula.concluida && (
          <button style={btnPerigo} disabled={salvando} onClick={() => enviar({ concluida: false }, "Lançamento removido.")}>
            Desmarcar
          </button>
        )}
        <button style={btnSecundario} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function AdicionarPessoa({ trilhaId, jaNaLista, setErro, setAviso, onFechar, onAdicionou }) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setItens([]);
      return undefined;
    }
    const t = window.setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await apiFetch(`/pessoas?busca=${encodeURIComponent(termo)}`);
        setItens(r.itens || []);
      } catch (e) {
        setErro(e.message || "Erro ao buscar pessoas.");
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca, setErro]);

  async function adicionar(pessoa) {
    setErro("");
    try {
      const r = await apiFetch(`/trilha-pessoas/trilhas/${trilhaId}/participantes`, { method: "POST", body: JSON.stringify({ pessoa_id: pessoa.id }) });
      setAviso(r.reativado ? `${pessoa.nome} voltou para a trilha.` : `${pessoa.nome} incluída na trilha.`);
      onAdicionou();
    } catch (e) {
      setErro(e.message || "Não foi possível incluir a pessoa.");
    }
  }

  return (
    <div style={painel}>
      <strong style={{ fontSize: 14 }}>Adicionar pessoa do cadastro</strong>
      <input style={{ ...entrada, maxWidth: 420 }} placeholder="Nome, matrícula ou CPF (mín. 2 letras)" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      {buscando && <div style={dica}>Buscando...</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {itens.map((p) => {
          const ja = jaNaLista.includes(p.id);
          return (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700 }}>{p.nome}</span>
              <span style={dica}>{[p.matricula, p.cliente].filter(Boolean).join(" · ")}</span>
              <button style={btnMini} disabled={ja} onClick={() => adicionar(p)}>
                {ja ? "Já está na trilha" : "Incluir"}
              </button>
            </div>
          );
        })}
        {busca.trim().length >= 2 && !buscando && itens.length === 0 && <div style={dica}>Nenhuma pessoa encontrada no cadastro.</div>}
      </div>
      <div style={acoes}>
        <button style={btnSecundario} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}

const thBase = { position: "sticky", top: 0, zIndex: 2, background: colors.surfaceMuted, color: colors.textSecondary, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "left", verticalAlign: "bottom" };
const tdBase = { padding: "6px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "middle" };
const fixaEsq = { position: "sticky", left: 0, zIndex: 3, borderRight: `1px solid ${colors.border}` };
