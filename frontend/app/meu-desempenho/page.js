"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";

// "Meu desempenho" — visão do próprio instrutor sobre o scorecard que a
// coordenação já vê em Capacidade > Scorecard por instrutor. Mesmo endpoint
// (/api/desempenho-instrutor), mas aqui não existe seletor de instrutor: o
// backend já auto-escopa pro perfil instrutor (só retorna o próprio),
// então nem passamos o parâmetro. Item 4 da visão de universidade
// corporativa (ver claude/visao-plataforma-educativa-instrutor-2026-09.md
// no projeto) — mostra tanto a posição relativa quanto a média do time
// lado a lado, conforme decidido com o Ramon.

function fmt(n) { return n === null || n === undefined ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(n)); }
function fmtPct(n) { return n == null ? "—" : `${fmt(n)}%`; }

export default function MeuDesempenhoPage() {
  const hoje = new Date();
  const [periodoTipo, setPeriodoTipo] = useState("mensal");
  const [ano,         setAno]         = useState(String(hoje.getFullYear()));
  const [mes,         setMes]         = useState(String(hoje.getMonth() + 1));
  const [trimestre,   setTrimestre]   = useState(String(Math.floor(hoje.getMonth() / 3) + 1));

  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState("");

  useEffect(() => { carregar(); }, [periodoTipo, ano, mes, trimestre]);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const params = new URLSearchParams();
      params.set("periodo", periodoTipo);
      params.set("ano", ano);
      if (periodoTipo === "trimestral") params.set("trimestre", trimestre);
      else params.set("mes", mes);
      const r = await apiFetch(`/desempenho-instrutor?${params.toString()}`);
      setDados(r);
    } catch (e) {
      setErro(e.message || "Erro ao carregar seu desempenho.");
    } finally { setLoading(false); }
  }

  const item = dados?.itens?.[0] || null;
  const medias = dados?.medias_time;

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Seu retorno de performance"
          title="Meu Desempenho"
          subtitle="Frequência, avaliação e NPS das suas turmas, calculados automaticamente — nada aqui exige nenhum lançamento extra da sua parte."
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <select value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value)} style={selectFiltro}>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
              </select>
              {periodoTipo === "mensal" ? (
                <select value={mes} onChange={(e) => setMes(e.target.value)} style={selectFiltro}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                </select>
              ) : (
                <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} style={selectFiltro}>
                  {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}º trimestre</option>)}
                </select>
              )}
              <select value={ano} onChange={(e) => setAno(e.target.value)} style={selectFiltro}>
                {[hoje.getFullYear(), hoje.getFullYear() - 1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          }
        />
      </div>

      {erro && <div style={errBox}>{erro}</div>}

      {loading ? (
        <p style={{ color: "#64748b" }}>Carregando seu desempenho…</p>
      ) : !item || (item.ch.horas_realizadas === 0 && item.frequencia.turmas_consideradas === 0 && item.nps.total_respostas === 0 && item.avaliacao.turmas_no_periodo === 0) ? (
        <div style={card}>
          <p style={{ color: "#64748b", margin: 0 }}>Nenhuma atividade registrada nesse período ainda.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 12 }}>
            <StatCard title="Índice geral" value={item.indice_geral ?? "—"} accent={colors.accent} />
            <StatCard
              title="Sua posição no time"
              value={item.posicao_no_time ? `${item.posicao_no_time}º de ${item.total_no_ranking}` : "—"}
              subtitle={medias ? `Média do time: ${medias.indice_geral ?? "—"}` : undefined}
              accent={colors.navy}
            />
            <StatCard title="Frequência das suas turmas" value={fmtPct(item.frequencia.media_pct)} subtitle={medias ? `Média do time: ${fmtPct(medias.frequencia_pct)}` : undefined} accent={colors.primary} />
            <StatCard title="Ocupação (CH)" value={fmtPct(item.ch.ocupacao_pct)} subtitle={medias ? `Média do time: ${fmtPct(medias.ocupacao_pct)}` : undefined} accent={colors.info} />
            <StatCard title="NPS" value={item.nps.nps_score ?? "—"} subtitle={medias ? `Média do time: ${medias.nps_score ?? "—"}` : undefined} accent={colors.success} />
          </div>

          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
            Índice geral pondera frequência (peso maior) e NPS — a nota de avaliação abaixo é informativa e não entra nessa conta, porque não tem uma escala fixa entre as provas hoje.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={card}>
              <div style={cardTitle}>Avaliação de turma</div>
              {item.avaliacao.turmas_no_periodo === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhuma turma no período.</p>
              ) : (
                <>
                  <p style={linha}>Nota de prova (média): <strong>{item.avaliacao.nota_prova_media != null ? fmt(item.avaliacao.nota_prova_media) : "—"}</strong></p>
                  <p style={linha}>Nota de qualidade (média): <strong>{item.avaliacao.nota_qualidade_media != null ? fmt(item.avaliacao.nota_qualidade_media) : "—"}</strong></p>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                    {item.avaliacao.turmas_com_avaliacao} de {item.avaliacao.turmas_no_periodo} turmas com avaliação lançada.
                    {item.avaliacao.turmas_com_avaliacao < item.avaliacao.turmas_no_periodo && " Lançar a avaliação das demais turmas deixa esse número mais completo."}
                  </p>
                </>
              )}
            </div>
            <div style={card}>
              <div style={cardTitle}>NPS dos seus treinandos</div>
              {item.nps.total_respostas === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhuma resposta de NPS no período.</p>
              ) : (
                <>
                  <p style={linha}>Nota média: <strong>{fmt(item.nps.nota_media)}</strong> · {item.nps.total_respostas} resposta(s)</p>
                  <p style={linha}>Promotores {item.nps.promotores} · Neutros {item.nps.neutros} · Detratores {item.nps.detratores}</p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </PortalShell>
  );
}

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 8px 18px rgba(15,23,42,.04)" };
const cardTitle = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const linha = { fontSize: 13, color: "#334155", margin: "4px 0" };
const errBox = { background: colors.dangerLight, color: colors.dangerText, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13 };
const selectFiltro = { height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.4)", padding: "0 10px", fontSize: 13, background: "rgba(255,255,255,.12)", color: "#fff" };
