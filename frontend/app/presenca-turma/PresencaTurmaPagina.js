"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TurmaPageShell from "../../components/TurmaPageShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import GradeTurma from "./GradeTurma";
import { apiFetch, apiDownload, getStoredUser, hasSomeRole } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { btnPrimario, btnSecundario, entrada, rotulo, painel, dica, acoes, vazio, avisoErro, avisoOk, fmtNum } from "../mapa-desenvolvimento/presenca/estilos";

// Treinamentos → turma → aba "Presença" (13/10/2026).
// Mesmo modelo da chamada das jornadas: grade pessoas × aulas, clique para
// P / J / F, "Todos ✓" por aula, horas e % por pessoa, farol de presença
// mínima, Excel e PDF (lista preenchida, lista em branco, extrato individual
// e relatório da turma). Backend: /api/turma-presenca (mesma tabela da
// chamada por aula, então as duas telas sempre mostram o mesmo dado).
// Endereço: /presenca-turma?turma=<id> (page.js só reexporta este arquivo)

const PROXIMA = { "": "presente", presente: "justificado", justificado: "ausente", ausente: null };
const PODE_CONFIGURAR = ["coordenador", "assistente_treinamento", "super_admin"];

export default function PresencaTurmaPage() {
  const [id, setId] = useState("");
  const [treinamento, setTreinamento] = useState(null);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pendentes, setPendentes] = useState(() => new Set());
  const [filtros, setFiltros] = useState({ busca: "", abaixo: false, semLancamento: false });
  const [painelAtivo, setPainelAtivo] = useState(null); // "config" | null
  const [minimo, setMinimo] = useState("");
  const [menuPdf, setMenuPdf] = useState(false);
  const [justificando, setJustificando] = useState(null); // { aula, participante, texto }
  const timer = useRef(null);

  const podeConfigurar = useMemo(() => hasSomeRole(getStoredUser(), PODE_CONFIGURAR), []);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("turma") || "");
  }, []);

  useEffect(() => {
    if (!erro && !aviso) return undefined;
    const t = window.setTimeout(() => {
      setErro("");
      setAviso("");
    }, 7000);
    return () => window.clearTimeout(t);
  }, [erro, aviso]);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!id) return;
      if (!silencioso) setCarregando(true);
      try {
        const d = await apiFetch(`/turma-presenca/turmas/${id}/grade`);
        setDados(d);
        setMinimo(d.turma.presenca_minima_definida ? String(d.turma.presenca_minima_pct) : "");
      } catch (e) {
        setErro(e.message || "Erro ao carregar a grade de presença.");
      } finally {
        setCarregando(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!id) return;
    apiFetch(`/treinamentos/${id}`)
      .then(setTreinamento)
      .catch(() => null);
    carregar();
  }, [id, carregar]);

  const recarregarEmBreve = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => carregar(true), 500);
  }, [carregar]);

  async function enviar(aula, participante, situacao, justificativa, anterior) {
    const chave = `${aula.id}:${participante.id}`;
    if (pendentes.has(chave)) return;
    setPendentes((s) => new Set(s).add(chave));
    const aplicar = (sit, just) =>
      setDados((d) => {
        const presencas = { ...d.presencas };
        const justificativas = { ...d.justificativas };
        if (sit) presencas[chave] = sit;
        else delete presencas[chave];
        if (sit === "justificado" && just) justificativas[chave] = just;
        else delete justificativas[chave];
        return { ...d, presencas, justificativas };
      });
    aplicar(situacao, justificativa);
    try {
      await apiFetch(`/turma-presenca/aulas/${aula.id}/presenca`, {
        method: "PUT",
        body: JSON.stringify({ participante_id: participante.id, situacao, justificativa }),
      });
      recarregarEmBreve();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a presença.");
      aplicar(anterior || null, null);
    } finally {
      setPendentes((s) => {
        const n = new Set(s);
        n.delete(chave);
        return n;
      });
    }
  }

  function clicarCelula(aula, participante, atual) {
    const proxima = PROXIMA[atual || ""];
    if (proxima === "justificado") {
      setJustificando({ aula, participante, texto: "", anterior: atual });
      return;
    }
    enviar(aula, participante, proxima, null, atual);
  }

  async function confirmarJustificativa() {
    const texto = String(justificando.texto || "").trim();
    if (!texto) return;
    const { aula, participante, anterior } = justificando;
    setJustificando(null);
    await enviar(aula, participante, "justificado", texto, anterior);
  }

  async function todosPresentes(aula) {
    setErro("");
    setAviso("");
    try {
      const r = await apiFetch(`/turma-presenca/aulas/${aula.id}/presenca-lote`, {
        method: "POST",
        body: JSON.stringify({ situacao: "presente" }),
      });
      setAviso(r.alterados ? `${r.alterados} pessoa(s) marcada(s) como presente em "${aula.titulo}". Quem já estava lançado não foi alterado.` : "Todos já estavam lançados nesta aula.");
      carregar(true);
    } catch (e) {
      setErro(e.message || "Erro ao marcar presença em lote.");
    }
  }

  async function salvarMinimo() {
    setErro("");
    setAviso("");
    try {
      await apiFetch(`/turma-presenca/turmas/${id}/config`, {
        method: "PUT",
        body: JSON.stringify({ presenca_minima_pct: minimo.replace(",", ".") }),
      });
      setAviso("Presença mínima salva.");
      setPainelAtivo(null);
      carregar(true);
    } catch (e) {
      setErro(e.message || "Erro ao salvar a presença mínima.");
    }
  }

  async function baixar() {
    setErro("");
    try {
      await apiDownload(`/turma-presenca/turmas/${id}/exportar`, "presenca-turma.xlsx");
    } catch (e) {
      setErro(e.message || "Erro ao exportar.");
    }
  }

  const abrir = (caminho) => window.open(caminho, "_blank", "noopener");
  const imprimir = (modo) => {
    setMenuPdf(false);
    abrir(`/presenca-turma/impressao?turma=${id}&modo=${modo}`);
  };

  const linhas = useMemo(() => {
    if (!dados) return [];
    const q = filtros.busca.trim().toLowerCase();
    return dados.participantes.filter((p) => {
      if (q && !`${p.nome} ${p.matricula || ""}`.toLowerCase().includes(q)) return false;
      if (filtros.abaixo && p.totais.farol !== "vermelho") return false;
      if (filtros.semLancamento && !p.totais.pendentes) return false;
      return true;
    });
  }, [dados, filtros]);

  const r = dados?.resumo;

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={!treinamento && carregando} abaAtiva="presenca">
      <div style={{ display: "grid", gap: 16 }}>
        {erro && <div style={avisoErro}>{erro}</div>}
        {aviso && <div style={avisoOk}>{aviso}</div>}

        <SectionCard
          title="Presença da turma"
          subtitle="Chamada de todas as aulas numa só tela. Horas realizadas e % de presença são calculados automaticamente."
          action={
            id ? (
              <div style={{ ...acoes, position: "relative" }}>
                {podeConfigurar && (
                  <button style={btnSecundario} onClick={() => setPainelAtivo(painelAtivo === "config" ? null : "config")}>
                    Presença mínima
                  </button>
                )}
                <button style={btnSecundario} onClick={baixar}>
                  Exportar Excel
                </button>
                <button style={btnPrimario} onClick={() => setMenuPdf((v) => !v)}>
                  Imprimir / PDF ▾
                </button>
                {menuPdf && (
                  <div style={menu}>
                    <button style={itemMenu} onClick={() => imprimir("preenchida")}>
                      <b>Lista de presença preenchida</b>
                      <span style={dica}>Pessoas × aulas com P / J / F, horas e %</span>
                    </button>
                    <button style={itemMenu} onClick={() => imprimir("branco")}>
                      <b>Lista em branco para assinar</b>
                      <span style={dica}>Pessoas × aulas, células vazias (papel)</span>
                    </button>
                    <button style={itemMenu} onClick={() => imprimir("relatorio")}>
                      <b>Relatório da turma (cliente)</b>
                      <span style={dica}>Resumo, horas, presença e quem está abaixo do mínimo</span>
                    </button>
                    <div style={{ ...dica, padding: "6px 10px" }}>O extrato individual abre pelo botão “Extrato” de cada pessoa; a lista de uma aula, pelo botão “Lista” no cabeçalho dela.</div>
                  </div>
                )}
              </div>
            ) : null
          }
        >
          {painelAtivo === "config" && dados && (
            <div style={{ ...painel, marginBottom: 14 }}>
              <strong style={{ fontSize: 14 }}>Presença mínima desta turma</strong>
              <label style={{ ...rotulo, maxWidth: 260 }}>
                Presença mínima (%)
                <input style={entrada} inputMode="decimal" value={minimo} placeholder="Padrão: 75" onChange={(e) => setMinimo(e.target.value)} />
              </label>
              <div style={dica}>Pinta o farol de cada pessoa (verde = dentro do mínimo, vermelho = abaixo). Em branco, vale o padrão de 75%. Não altera certificados já emitidos nem as telas de frequência.</div>
              <div style={acoes}>
                <button style={btnPrimario} onClick={salvarMinimo}>
                  Salvar
                </button>
                <button style={btnSecundario} onClick={() => setPainelAtivo(null)}>
                  Fechar
                </button>
              </div>
            </div>
          )}

          {!id ? (
            <div style={vazio}>Abra esta tela pela aba “Presença” de uma turma.</div>
          ) : carregando && !dados ? (
            <div style={vazio}>Carregando…</div>
          ) : !dados ? null : dados.participantes.length === 0 ? (
            <div style={vazio}>Esta turma ainda não tem participantes. Adicione ou importe na aba “Pessoas”.</div>
          ) : dados.aulas.length === 0 ? (
            <div style={vazio}>Esta turma ainda não tem aulas no cronograma. Monte o cronograma na aba “Cronograma” para fazer a chamada.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {dados.horas_estimadas && (
                <div style={{ ...dica, background: colors.warningLight, color: colors.warningText, padding: "8px 12px", borderRadius: radius.sm }}>
                  As aulas do cronograma não têm carga horária própria: a carga horária da turma foi dividida igualmente entre elas (estimativa). Informe a carga de cada aula no Cronograma para horas exatas.
                </div>
              )}
              <div style={acoes}>
                <input style={{ ...entrada, width: 240 }} placeholder="Buscar nome ou matrícula" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
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

              {r && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                  <StatCard title="Participantes" value={r.participantes} accent="#2563eb" />
                  <StatCard title="Aulas" value={`${r.aulas_realizadas}/${r.aulas}`} subtitle={`${fmtNum(r.horas_aulas)} h no cronograma`} accent="#7c3aed" helper="realizadas / no cronograma" />
                  <StatCard title="Presença média" value={r.pct_medio === null ? "—" : `${fmtNum(r.pct_medio)}%`} accent="#16a34a" />
                  <StatCard title="Abaixo do mínimo" value={r.abaixo_do_minimo} subtitle={`mínimo ${fmtNum(dados.turma.presenca_minima_pct, 0)}%`} accent={r.abaixo_do_minimo ? "#b91c1c" : "#16a34a"} />
                  <StatCard title="Sem lançamento" value={r.sem_lancamento} subtitle="aula realizada sem chamada" accent={r.sem_lancamento ? "#c2410c" : "#16a34a"} />
                </div>
              )}

              {linhas.length === 0 ? (
                <div style={vazio}>Nenhuma pessoa com esses filtros.</div>
              ) : (
                <GradeTurma
                  dados={dados}
                  turmaId={id}
                  linhas={linhas}
                  pendentes={pendentes}
                  onCelula={clicarCelula}
                  onTodos={todosPresentes}
                  onExtrato={(p) => abrir(`/presenca-turma/impressao?turma=${id}&modo=extrato&participante=${p.id}`)}
                />
              )}
              <div style={dica}>
                Clique na célula para alternar: vazio → P (presente) → J (justificado, pede o motivo) → F (ausente) → vazio. Justificado não soma horas e fica fora do cálculo do %. Aula realizada sem lançamento nunca vira falta sozinha. Presença só pode ser lançada a partir da data da aula. A chamada por aula continua disponível no Cronograma e usa os mesmos dados.
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {justificando && (
        <div style={fundoModal} onClick={() => setJustificando(null)}>
          <div style={caixaModal} onClick={(e) => e.stopPropagation()}>
            <strong style={{ fontSize: 15 }}>Falta justificada</strong>
            <div style={dica}>
              {justificando.participante.nome} — {justificando.aula.titulo}. Informe o motivo; ele fica no registro e no extrato.
            </div>
            <textarea
              autoFocus
              rows={3}
              style={{ ...entrada, resize: "vertical" }}
              placeholder="Ex.: atestado médico"
              value={justificando.texto}
              onChange={(e) => setJustificando({ ...justificando, texto: e.target.value })}
            />
            <div style={acoes}>
              <button style={{ ...btnPrimario, opacity: justificando.texto.trim() ? 1 : 0.5 }} disabled={!justificando.texto.trim()} onClick={confirmarJustificativa}>
                Salvar justificativa
              </button>
              <button style={btnSecundario} onClick={() => setJustificando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </TurmaPageShell>
  );
}

const menu = { position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, boxShadow: "0 8px 24px rgba(15,23,42,.14)", minWidth: 320, padding: 6, display: "grid", gap: 2 };
const itemMenu = { textAlign: "left", background: "none", border: "none", padding: "8px 10px", borderRadius: radius.sm, cursor: "pointer", display: "grid", gap: 2, fontSize: 13, color: colors.textPrimary };
const fundoModal = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const caixaModal = { background: "#fff", borderRadius: radius.md, padding: 20, width: "100%", maxWidth: 440, display: "grid", gap: 12, boxShadow: "0 16px 48px rgba(15,23,42,.3)" };
