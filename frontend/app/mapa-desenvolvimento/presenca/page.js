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
import { btnPrimario, btnSecundario, entrada, rotulo, gradeForm, painel, dica, acoes, vazio, avisoErro, avisoOk, fmtNum, selo, corDaTrilha, SEM_TRILHA } from "./estilos";

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
  const [trilhaFiltro, setTrilhaFiltro] = useState(""); // "" = todas · "0" = sem trilha · id da trilha
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
    const idTrilha = escopoTrilha === "0" ? null : Number(escopoTrilha);
    const encontros = dados.encontros.filter((e) => (e.trilha_id || null) === idTrilha);
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
      const tt = p.totais_trilha?.[escopoTrilha] || { horas: 0, presentes: 0, justificados: 0, ausentes: 0, pendentes: 0, pct_presenca: null, farol: "cinza" };
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
                key={painelAtivo.encontro?.id || "novo"}
                jornadaId={jornadaId}
                etapas={dados.etapas}
                trilhas={dados.trilhas}
                onGerenciarTrilhas={() => setEditandoTrilhas(true)}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
                  {[...dados.trilhas.map((t) => ({ ...t, chave: String(t.id) })), ...(dados.sem_trilha.encontros ? [{ id: null, chave: "0", titulo: "Sem trilha", encontros: dados.sem_trilha.encontros, horas_cadastradas: dados.sem_trilha.horas_cadastradas, semTrilha: true }] : [])].map((t) => {
                    const cor = t.semTrilha ? SEM_TRILHA : corDaTrilha(dados.trilhas, t.id);
                    const ativo = trilhaFiltro === t.chave;
                    return (
                      <button
                        key={t.chave}
                        type="button"
                        onClick={() => setTrilhaFiltro(ativo ? "" : t.chave)}
                        style={{ textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer", background: ativo ? cor.bg : "#fff", border: `2px solid ${ativo ? cor.cor : colors.border}`, display: "grid", gap: 4 }}
                      >
                        <span style={{ ...selo, background: cor.bg, color: cor.cor, justifySelf: "start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{t.titulo}</span>
                        <span style={{ fontSize: 12, color: colors.textSecondary }}>
                          {t.semTrilha ? `${t.encontros} encontro(s)` : `${t.encontros_realizados}/${t.encontros} encontro(s) realizados`} · {fmtNum(t.horas_cadastradas)} h
                        </span>
                        {!t.semTrilha && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: t.abaixo_do_minimo ? colors.dangerText : colors.textPrimary }}>
                            {t.pct_medio === null ? "Sem presença lançada" : `Presença média ${fmtNum(t.pct_medio)}%`}
                            {t.abaixo_do_minimo ? ` · ${t.abaixo_do_minimo} abaixo do mínimo` : ""}
                          </span>
                        )}
                        {!t.semTrilha && t.encontros === 0 && <span style={{ fontSize: 11, color: colors.textMuted }}>Nenhum encontro ainda — crie um e escolha esta trilha.</span>}
                      </button>
                    );
                  })}
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
                  {dados.trilhas.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.titulo}
                    </option>
                  ))}
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
