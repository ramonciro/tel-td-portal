"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import StatCard from "../../../components/StatCard";
import Grade from "./Grade";
import EncontroForm from "./EncontroForm";
import Importacao from "./Importacao";
import TrilhasJornada from "./TrilhasJornada";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { btnPrimario, btnSecundario, btnMini, entrada, rotulo, gradeForm, painel, dica, acoes, vazio, avisoErro, avisoOk, fmtNum, selo, corDaTrilha, SEM_TRILHA } from "./estilos";

// Mapa de Desenvolvimento → Encontros e presença (Fase 1, 13/10/2026; trilhas
// vinculadas à jornada e aos encontros em 13/10/2026).
// Chamada por encontro, com data, para cada pessoa da tripulação da jornada.
// Regras (decisões A–E do Ramon): justificada não soma horas e fica fora do %;
// presença mínima, meta de horas e periodicidade da reciclagem são
// configuráveis por jornada; só a Metodologia lança. Backend: /api/jornada-presenca.

const PROXIMA = { "": "presente", presente: "justificado", justificado: "ausente", ausente: null };

export default function PresencaJornadasPage() {
  const [jornadas, setJornadas] = useState([]);
  const [jornadaId, setJornadaId] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [painelAtivo, setPainelAtivo] = useState(null); // { tipo: "encontro", encontro? } | { tipo: "importar" } | { tipo: "config" }
  const [pendentes, setPendentes] = useState(() => new Set());
  const [filtros, setFiltros] = useState({ busca: "", turma: "", supervisor: "", abaixo: false, semLancamento: false });
  // "" = todas · "0" = sem trilha · "T" = trilha T · "T:E" = etapa E da trilha T ("T:0" = encontros da trilha sem etapa)
  const [trilhaFiltro, setTrilhaFiltro] = useState("");
  const [editandoTrilhas, setEditandoTrilhas] = useState(false);
  const [cfg, setCfg] = useState({ presenca_minima_pct: "75", meta_horas: "", periodicidade_meses: "" });
  const timer = useRef(null);

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
        const lista = await apiFetch("/jornadas-desenvolvimento");
        setJornadas(lista);
        const pedido = new URLSearchParams(window.location.search).get("jornada");
        const alvo = lista.find((j) => String(j.id) === pedido) || lista.find((j) => j.status === "em_andamento") || lista[0];
        if (alvo) setJornadaId(String(alvo.id));
        else setCarregando(false);
      } catch (e) {
        setErro(e.message || "Erro ao carregar as jornadas.");
        setCarregando(false);
      }
    })();
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!jornadaId) return;
      if (!silencioso) setCarregando(true);
      try {
        const d = await apiFetch(`/jornada-presenca/jornadas/${jornadaId}/grade`);
        setDados(d);
        setCfg({
          presenca_minima_pct: String(d.jornada.presenca_minima_pct),
          meta_horas: d.jornada.meta_horas === null ? "" : String(d.jornada.meta_horas),
          periodicidade_meses: d.jornada.periodicidade_meses === null ? "" : String(d.jornada.periodicidade_meses),
        });
      } catch (e) {
        setErro(e.message || "Erro ao carregar a grade de presença.");
      } finally {
        setCarregando(false);
      }
    },
    [jornadaId]
  );

  useEffect(() => {
    setDados(null);
    setPainelAtivo(null);
    setEditandoTrilhas(false);
    setTrilhaFiltro("");
    carregar();
  }, [carregar]);

  const recarregarEmBreve = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => carregar(true), 500);
  }, [carregar]);

  async function clicarCelula(encontro, participante, atual) {
    const chave = `${encontro.id}:${participante.id}`;
    if (pendentes.has(chave)) return;
    const proxima = PROXIMA[atual || ""];
    setPendentes((s) => new Set(s).add(chave));
    setDados((d) => {
      const presencas = { ...d.presencas };
      if (proxima) presencas[chave] = proxima;
      else delete presencas[chave];
      return { ...d, presencas };
    });
    try {
      await apiFetch(`/jornada-presenca/encontros/${encontro.id}/presenca`, {
        method: "PUT",
        body: JSON.stringify({ participante_id: participante.id, situacao: proxima }),
      });
      recarregarEmBreve();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a presença.");
      setDados((d) => {
        const presencas = { ...d.presencas };
        if (atual) presencas[chave] = atual;
        else delete presencas[chave];
        return { ...d, presencas };
      });
    } finally {
      setPendentes((s) => {
        const n = new Set(s);
        n.delete(chave);
        return n;
      });
    }
  }

  async function todosPresentes(encontro) {
    setErro("");
    setAviso("");
    try {
      const r = await apiFetch(`/jornada-presenca/encontros/${encontro.id}/presenca-lote`, {
        method: "POST",
        body: JSON.stringify({ situacao: "presente", somente_nao_lancados: true }),
      });
      setAviso(r.alterados ? `${r.alterados} pessoa(s) marcada(s) como presente em "${encontro.titulo}". Quem já estava lançado não foi alterado.` : "Todos já estavam lançados neste encontro.");
      carregar(true);
    } catch (e) {
      setErro(e.message || "Erro ao marcar presença em lote.");
    }
  }

  async function salvarConfig() {
    setErro("");
    setAviso("");
    try {
      await apiFetch(`/jornada-presenca/jornadas/${jornadaId}/config`, {
        method: "PUT",
        body: JSON.stringify({
          presenca_minima_pct: cfg.presenca_minima_pct.replace(",", "."),
          meta_horas: cfg.meta_horas.replace(",", "."),
          periodicidade_meses: cfg.periodicidade_meses,
        }),
      });
      setAviso("Configuração salva.");
      setPainelAtivo(null);
      carregar(true);
    } catch (e) {
      setErro(e.message || "Erro ao salvar a configuração.");
    }
  }

  async function baixar() {
    setErro("");
    try {
      await apiDownload(`/jornada-presenca/jornadas/${jornadaId}/exportar`, "presenca-jornada.xlsx");
    } catch (e) {
      setErro(e.message || "Erro ao exportar.");
    }
  }

  const abrir = (caminho) => window.open(caminho, "_blank", "noopener");

  const turmas = useMemo(() => (dados ? [...new Set(dados.participantes.map((p) => p.turma).filter(Boolean))].sort() : []), [dados]);
  const supervisores = useMemo(() => (dados ? [...new Set(dados.participantes.map((p) => p.supervisor).filter(Boolean))].sort() : []), [dados]);
  // Com uma trilha escolhida, a grade mostra só os encontros dela e as colunas
  // de horas / presença / pendência passam a valer só para essa trilha (meta de
  // horas e reciclagem são da jornada inteira e ficam ocultas).
  const escopoTrilha = trilhaFiltro !== "" && dados ? trilhaFiltro : "";
  const dadosVisiveis = useMemo(() => {
    if (!dados || !escopoTrilha) return dados;
    const [t, et] = escopoTrilha.split(":");
    const idTrilha = t === "0" ? null : Number(t);
    const encontros = dados.encontros.filter((e) => {
      if ((e.trilha_id || null) !== idTrilha) return false;
      if (et === undefined) return true;
      return (e.trilha_etapa_id || 0) === Number(et);
    });
    const ids = new Set(encontros.map((e) => e.id));
    return {
      ...dados,
      encontros,
      por_encontro: dados.por_encontro.filter((p) => ids.has(p.encontro_id)),
      jornada: { ...dados.jornada, meta_horas: null, periodicidade_meses: null },
    };
  }, [dados, escopoTrilha]);

  const linhas = useMemo(() => {
    if (!dados) return [];
    const q = filtros.busca.trim().toLowerCase();
    const base = dados.participantes.map((p) => {
      if (!escopoTrilha) return p;
      const tt = (escopoTrilha.includes(":") ? p.totais_etapa?.[escopoTrilha] : p.totais_trilha?.[escopoTrilha]) || { horas: 0, presentes: 0, justificados: 0, ausentes: 0, pendentes: 0, pct_presenca: null, farol: "cinza" };
      return { ...p, totais: { ...p.totais, ...tt, meta_pct: null, atingiu_meta: null, reciclagem: null } };
    });
    return base.filter((p) => {
      if (q && !`${p.nome} ${p.matricula || ""}`.toLowerCase().includes(q)) return false;
      if (filtros.turma && p.turma !== filtros.turma) return false;
      if (filtros.supervisor && p.supervisor !== filtros.supervisor) return false;
      if (filtros.abaixo && p.totais.farol !== "vermelho") return false;
      if (filtros.semLancamento && !p.totais.pendentes) return false;
      return true;
    });
  }, [dados, filtros, escopoTrilha]);

  const r = dados?.resumo;
  const jornadaAtual = jornadas.find((j) => String(j.id) === jornadaId);

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16 }}>
        <PageHero
          eyebrow="Mapa de Desenvolvimento"
          title="Encontros e presença"
          subtitle="Chamada por encontro, com data, para cada pessoa da tripulação. Horas realizadas e % de presença são calculados automaticamente."
          actions={
            <>
              <Link href="/mapa-desenvolvimento" style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>
                ← Mapa
              </Link>
              <Link href={`/mapa-desenvolvimento/desenvolvimento${jornadaId ? `?jornada=${jornadaId}` : ""}`} style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>
                Desenvolvimento por etapa →
              </Link>
            </>
          }
        />

        {erro && <div style={avisoErro}>{erro}</div>}
        {aviso && <div style={avisoOk}>{aviso}</div>}

        <SectionCard
          title="Jornada"
          subtitle={jornadaAtual ? [jornadaAtual.cliente, jornadaAtual.status === "em_andamento" ? "Em andamento" : null].filter(Boolean).join(" · ") : undefined}
          action={
            jornadaId ? (
              <div style={acoes}>
                <button style={btnSecundario} onClick={() => setPainelAtivo({ tipo: "config" })}>
                  Configurar presença
                </button>
                <button style={btnSecundario} onClick={() => setPainelAtivo({ tipo: "importar" })}>
                  Importar planilha
                </button>
                <button style={btnSecundario} onClick={baixar}>
                  Exportar Excel
                </button>
                <button style={btnSecundario} onClick={() => abrir(`/mapa-desenvolvimento/presenca/impressao/${jornadaId}`)}>
                  Imprimir / PDF
                </button>
                <button style={btnPrimario} onClick={() => setPainelAtivo({ tipo: "encontro" })}>
                  + Novo encontro
                </button>
              </div>
            ) : null
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ ...rotulo, maxWidth: 520 }}>
              Escolha a jornada
              <select style={entrada} value={jornadaId} onChange={(e) => setJornadaId(e.target.value)}>
                {jornadas.length === 0 && <option value="">Nenhuma jornada cadastrada</option>}
                {jornadas.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nome}
                    {j.cliente ? ` — ${j.cliente}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {painelAtivo?.tipo === "config" && dados && (
              <div style={painel}>
                <strong style={{ fontSize: 14 }}>Configuração de presença desta jornada</strong>
                <div style={gradeForm}>
                  <label style={rotulo}>
                    Presença mínima (%)
                    <input style={entrada} inputMode="decimal" value={cfg.presenca_minima_pct} onChange={(e) => setCfg({ ...cfg, presenca_minima_pct: e.target.value })} />
                  </label>
                  <label style={rotulo}>
                    Meta de horas por pessoa (opcional)
                    <input style={entrada} inputMode="decimal" value={cfg.meta_horas} placeholder="Ex.: 4" onChange={(e) => setCfg({ ...cfg, meta_horas: e.target.value })} />
                  </label>
                  <label style={rotulo}>
                    Reciclagem a cada (meses, opcional)
                    <input style={entrada} inputMode="numeric" value={cfg.periodicidade_meses} placeholder="Ex.: 6" onChange={(e) => setCfg({ ...cfg, periodicidade_meses: e.target.value })} />
                  </label>
                </div>
                <div style={dica}>
                  A presença mínima pinta o farol de cada pessoa. A meta de horas e a periodicidade servem para acompanhar o treinamento inicial e a reciclagem
                  exigidos pela NR-17 (Anexo II) e pelos TACs com o MPT — o sistema <strong>não define</strong> o número da norma: informe aqui o valor que vale
                  para este cliente. A reciclagem é contada a partir do dia em que a pessoa atinge a meta de horas (ou da última presença, se não houver meta).
                </div>
                <div style={acoes}>
                  <button style={btnPrimario} onClick={salvarConfig}>
                    Salvar
                  </button>
                  <button style={btnSecundario} onClick={() => setPainelAtivo(null)}>
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {painelAtivo?.tipo === "importar" && (
              <Importacao
                jornadaId={jornadaId}
                setErro={setErro}
                setAviso={setAviso}
                onBaixarModelo={baixar}
                onFechar={() => setPainelAtivo(null)}
                onImportou={() => {
                  setPainelAtivo(null);
                  carregar(true);
                }}
              />
            )}

            {painelAtivo?.tipo === "encontro" && dados && (
              <EncontroForm
                key={painelAtivo.encontro?.id || `novo-${painelAtivo.padrao?.trilha_id || 0}-${painelAtivo.padrao?.trilha_etapa_id || 0}`}
                jornadaId={jornadaId}
                etapas={dados.etapas}
                trilhas={dados.trilhas}
                onGerenciarTrilhas={() => setEditandoTrilhas(true)}
                padrao={painelAtivo.padrao}
                encontro={painelAtivo.encontro}
                presencasDoEncontro={painelAtivo.encontro ? Object.keys(dados.presencas).filter((k) => k.startsWith(`${painelAtivo.encontro.id}:`)).length : 0}
                setErro={setErro}
                setAviso={setAviso}
                onFechar={() => setPainelAtivo(null)}
                onSalvou={() => {
                  setPainelAtivo(null);
                  carregar(true);
                }}
              />
            )}
          </div>
        </SectionCard>

        {dados && (
          <SectionCard
            title="Trilhas da jornada"
            subtitle="Cada encontro pertence a uma trilha (ou a nenhuma). Clique numa trilha para filtrar a grade e ver horas e presença só dela."
            action={
              <button style={btnSecundario} onClick={() => setEditandoTrilhas((v) => !v)}>
                {editandoTrilhas ? "Fechar" : "Vincular trilhas"}
              </button>
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              {editandoTrilhas && (
                <TrilhasJornada
                  jornadaId={jornadaId}
                  setErro={setErro}
                  setAviso={setAviso}
                  onFechar={() => setEditandoTrilhas(false)}
                  onSalvou={() => {
                    setEditandoTrilhas(false);
                    setTrilhaFiltro("");
                    carregar(true);
                  }}
                />
              )}
              {dados.trilhas.length === 0 ? (
                <div style={vazio}>
                  Nenhuma trilha vinculada a esta jornada ainda.{" "}
                  {!editandoTrilhas && (
                    <button style={btnPrimario} onClick={() => setEditandoTrilhas(true)}>
                      Vincular trilhas
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {dados.trilhas.map((t) => {
                    const cor = corDaTrilha(dados.trilhas, t.id);
                    const chave = String(t.id);
                    const ativo = trilhaFiltro === chave;
                    return (
                      <div key={t.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, display: "grid", gap: 10, background: "#fff" }}>
                        <button
                          type="button"
                          onClick={() => setTrilhaFiltro(ativo ? "" : chave)}
                          title="Filtrar a grade por esta trilha"
                          style={{ textAlign: "left", padding: 10, borderRadius: 10, cursor: "pointer", background: ativo ? cor.bg : colors.surfaceMuted, border: `2px solid ${ativo ? cor.cor : "transparent"}`, display: "grid", gap: 3 }}
                        >
                          <span style={{ ...selo, background: cor.bg, color: cor.cor, justifySelf: "start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{t.titulo}</span>
                          <span style={{ fontSize: 12, color: colors.textSecondary }}>
                            {t.etapas.length} etapa(s) · {t.encontros_realizados}/{t.encontros} encontro(s) realizados · {fmtNum(t.horas_cadastradas)} h
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: t.abaixo_do_minimo ? colors.dangerText : colors.textPrimary }}>
                            {t.pct_medio === null ? "Sem presença lançada" : `Presença média da trilha ${fmtNum(t.pct_medio)}%`}
                            {t.abaixo_do_minimo ? ` · ${t.abaixo_do_minimo} abaixo do mínimo` : ""}
                          </span>
                        </button>
                        {t.etapas.length === 0 ? (
                          <div style={dica}>Esta trilha ainda não tem etapas. Cadastre-as na página Trilhas para acompanhar a presença por etapa.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                            {t.etapas.map((et, i) => {
                              const ch = `${t.id}:${et.id}`;
                              const ativoEt = trilhaFiltro === ch;
                              return (
                                <div key={et.id} style={{ border: `2px solid ${ativoEt ? cor.cor : colors.border}`, background: ativoEt ? cor.bg : "#fff", borderRadius: 10, padding: 10, display: "grid", gap: 4 }}>
                                  <button type="button" onClick={() => setTrilhaFiltro(ativoEt ? "" : ch)} title="Filtrar a grade por esta etapa" style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", display: "grid", gap: 2 }}>
                                    <strong style={{ fontSize: 13, color: colors.textPrimary }}>
                                      Etapa {i + 1} · {et.titulo}
                                    </strong>
                                    <span style={{ fontSize: 12, color: colors.textSecondary }}>
                                      {et.encontros === 0 ? "Nenhum encontro ainda" : `${et.encontros_realizados}/${et.encontros} encontro(s) · ${fmtNum(et.horas_cadastradas)} h`}
                                    </span>
                                    {et.encontros > 0 && (
                                      <span style={{ fontSize: 12, fontWeight: 700, color: et.abaixo_do_minimo ? colors.dangerText : colors.textPrimary }}>
                                        {et.pct_medio === null ? "Sem presença lançada" : `Presença média ${fmtNum(et.pct_medio)}%`}
                                        {et.abaixo_do_minimo ? ` · ${et.abaixo_do_minimo} abaixo do mínimo` : ""}
                                      </span>
                                    )}
                                  </button>
                                  <div>
                                    <button
                                      type="button"
                                      style={btnMini}
                                      onClick={() => {
                                        setEditandoTrilhas(false);
                                        setPainelAtivo({ tipo: "encontro", padrao: { trilha_id: t.id, trilha_etapa_id: et.id, titulo: et.titulo } });
                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                      }}
                                    >
                                      + Encontro desta etapa
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {t.sem_etapa.encontros > 0 && (
                              <button
                                type="button"
                                onClick={() => setTrilhaFiltro(trilhaFiltro === `${t.id}:0` ? "" : `${t.id}:0`)}
                                style={{ textAlign: "left", border: `2px solid ${trilhaFiltro === `${t.id}:0` ? cor.cor : colors.border}`, background: "#fff", borderRadius: 10, padding: 10, cursor: "pointer", display: "grid", gap: 2 }}
                              >
                                <strong style={{ fontSize: 13, color: colors.textPrimary }}>Sem etapa definida</strong>
                                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                                  {t.sem_etapa.encontros} encontro(s) · {fmtNum(t.sem_etapa.horas_cadastradas)} h
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {dados.sem_trilha.encontros > 0 && (
                    <button
                      type="button"
                      onClick={() => setTrilhaFiltro(trilhaFiltro === "0" ? "" : "0")}
                      style={{ textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer", background: trilhaFiltro === "0" ? SEM_TRILHA.bg : "#fff", border: `2px solid ${trilhaFiltro === "0" ? SEM_TRILHA.cor : colors.border}`, display: "grid", gap: 3 }}
                    >
                      <span style={{ ...selo, background: SEM_TRILHA.bg, color: SEM_TRILHA.cor, justifySelf: "start" }}>Sem trilha</span>
                      <span style={{ fontSize: 12, color: colors.textSecondary }}>
                        {dados.sem_trilha.encontros} encontro(s) · {fmtNum(dados.sem_trilha.horas_cadastradas)} h
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {dados && r && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <StatCard title="Participantes" value={r.participantes} accent="#2563eb" />
            <StatCard title="Encontros" value={`${r.encontros_realizados}/${r.encontros}`} subtitle={`${fmtNum(r.horas_encontros)} h cadastradas`} accent="#7c3aed" helper="realizados / cadastrados" />
            <StatCard title="Presença média" value={r.pct_medio === null ? "—" : `${fmtNum(r.pct_medio)}%`} accent="#16a34a" />
            <StatCard title="Abaixo do mínimo" value={r.abaixo_do_minimo} subtitle={`mínimo ${fmtNum(dados.jornada.presenca_minima_pct, 0)}%`} accent={r.abaixo_do_minimo ? "#b91c1c" : "#16a34a"} />
            <StatCard title="Sem lançamento" value={r.sem_lancamento} subtitle="encontro realizado sem chamada" accent={r.sem_lancamento ? "#c2410c" : "#16a34a"} />
            {r.atingiram_meta !== null && <StatCard title="Atingiram a meta" value={`${r.atingiram_meta}/${r.participantes}`} subtitle={`${fmtNum(dados.jornada.meta_horas)} h por pessoa`} accent="#0f766e" />}
            {r.reciclagem_vencida !== null && <StatCard title="Reciclagem vencida" value={r.reciclagem_vencida} accent={r.reciclagem_vencida ? "#b91c1c" : "#16a34a"} />}
          </div>
        )}

        <SectionCard
          title="Grade de chamada"
          subtitle="Clique na célula para alternar: vazio → P (presente) → J (justificado) → F (ausente) → vazio. Justificado não soma horas e fica fora do cálculo do %. Encontro sem lançamento nunca vira falta sozinho."
        >
          {carregando && !dados ? (
            <div style={vazio}>Carregando…</div>
          ) : !jornadaId ? (
            <div style={vazio}>Cadastre uma jornada no Mapa de Desenvolvimento para começar.</div>
          ) : !dados ? null : dados.participantes.length === 0 ? (
            <div style={vazio}>Esta jornada ainda não tem tripulação. Adicione ou importe os participantes em Mapa de Desenvolvimento → Jornadas.</div>
          ) : dados.encontros.length === 0 ? (
            <div style={vazio}>
              Nenhum encontro cadastrado ainda.{" "}
              <button style={btnPrimario} onClick={() => setPainelAtivo({ tipo: "encontro" })}>
                Criar o primeiro encontro
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...acoes }}>
                <input style={{ ...entrada, width: 240 }} placeholder="Buscar nome ou matrícula" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
                <select style={{ ...entrada, width: 220 }} value={trilhaFiltro} onChange={(e) => setTrilhaFiltro(e.target.value)}>
                  <option value="">Todas as trilhas</option>
                  {dados.trilhas.flatMap((t) => [
                    <option key={t.id} value={String(t.id)}>
                      {t.titulo}
                    </option>,
                    ...t.etapas.map((et, i) => (
                      <option key={`${t.id}:${et.id}`} value={`${t.id}:${et.id}`}>
                        {"   ↳ Etapa "}
                        {i + 1} · {et.titulo}
                      </option>
                    )),
                  ])}
                  {dados.sem_trilha.encontros > 0 && <option value="0">Sem trilha</option>}
                </select>
                <select style={{ ...entrada, width: 180 }} value={filtros.turma} onChange={(e) => setFiltros({ ...filtros, turma: e.target.value })}>
                  <option value="">Todas as turmas</option>
                  {turmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select style={{ ...entrada, width: 200 }} value={filtros.supervisor} onChange={(e) => setFiltros({ ...filtros, supervisor: e.target.value })}>
                  <option value="">Todos os supervisores</option>
                  {supervisores.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label style={{ ...dica, display: "flex", gap: 6, alignItems: "center", color: colors.textPrimary }}>
                  <input type="checkbox" checked={filtros.abaixo} onChange={(e) => setFiltros({ ...filtros, abaixo: e.target.checked })} />
                  Só abaixo do mínimo
                </label>
                <label style={{ ...dica, display: "flex", gap: 6, alignItems: "center", color: colors.textPrimary }}>
                  <input type="checkbox" checked={filtros.semLancamento} onChange={(e) => setFiltros({ ...filtros, semLancamento: e.target.checked })} />
                  Só com pendência de lançamento
                </label>
                <span style={dica}>
                  {linhas.length} de {dados.participantes.length} pessoa(s)
                </span>
              </div>
              {linhas.length === 0 ? (
                <div style={vazio}>Nenhuma pessoa com esses filtros.</div>
              ) : dadosVisiveis.encontros.length === 0 ? (
                <div style={vazio}>Nenhum encontro nesta trilha ainda. Crie um encontro e escolha esta trilha.</div>
              ) : (
                <Grade
                  dados={dadosVisiveis}
                  escopoTrilha={Boolean(escopoTrilha)}
                  linhas={linhas}
                  pendentes={pendentes}
                  onCelula={clicarCelula}
                  onTodos={todosPresentes}
                  onEditarEncontro={(e) => setPainelAtivo({ tipo: "encontro", encontro: e })}
                  onExtrato={(p) => abrir(`/mapa-desenvolvimento/presenca/impressao/${jornadaId}?participante=${p.id}`)}
                />
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}
