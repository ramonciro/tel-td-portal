"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, corDoCliente, estiloBadgeClassificacao } from "../../lib/theme";

// KPIs do Ambiente Metodologia (20/09/2026, pedido do Ramon) — implementa o
// framework acordado em claude/framework-kpis-metodologia-2026-09-20.md:
// jornada coletiva (adesão ao cronograma, cobertura por cliente) e coaching
// individual (cadência própria por pessoa) ficam sempre separados — nenhum
// dos dois entra no cálculo do outro, e o alerta de MPT nunca é diluído
// numa média. Ver backend/src/controllers/metodologiaKpisController.js.

function farolLabel(farol) {
  if (farol === "critico") return "Crítico";
  if (farol === "atencao") return "Atenção";
  if (farol === "saudavel") return "Saudável";
  return "Sem dado";
}

function farolAccent(farol) {
  if (farol === "critico") return colors.danger;
  if (farol === "atencao") return colors.warning;
  if (farol === "saudavel") return colors.success;
  return colors.neutral;
}

export default function KpisDesenvolvimentoPage() {
  const [kpis, setKpis] = useState(null);
  const [mptResumo, setMptResumo] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const dados = await apiFetch("/metodologia-kpis");
        if (ativo) setKpis(dados);
        // Comprovação MPT por subdivisão (04/11/2026): conta única de horas, ano-calendário.
        try {
          const r = await apiFetch("/mpt/resumo");
          if (ativo) setMptResumo(r);
        } catch (_) {
          if (ativo) setMptResumo(null);
        }
      } catch (err) {
        if (ativo) setErro(err.message || "Não foi possível carregar os KPIs.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const adesao = kpis?.adesaoCronograma;
  const cobertura = kpis?.coberturaPorCliente;
  const coaching = kpis?.coachingIndividual;
  // Encontros e presença das jornadas (16/10/2026) — antes o dashboard só
  // lia etapas com prazo, coaching e ações vencidas.
  const presenca = kpis?.presencaJornadas;
  const encontros = kpis?.adesaoEncontros;
  const jornadas = kpis?.jornadas || [];
  const mptSub = mptResumo?.subdivisoes || [];

  return (
    <PortalShell>
      <PageHero
        eyebrow="Ambiente Metodologia"
        title="KPIs de Desenvolvimento"
        subtitle="Jornada coletiva e coaching individual medidos separadamente — nenhum dos dois entra no cálculo do outro, e o alerta de conformidade MPT nunca é diluído numa média."
      />

      {erro && (
        <div style={avisoErro}>{erro}</div>
      )}

      {carregando ? (
        <div style={{ padding: 24, color: colors.textSecondary }}>Carregando indicadores…</div>
      ) : (
        <>
          <div style={gridStats}>
            <StatCard
              title="Adesão ao cronograma"
              value={adesao?.pct != null ? `${adesao.pct}%` : "—"}
              subtitle={`meta: 90% · ${adesao?.concluidosNoPrazo ?? 0} de ${adesao?.previstos ?? 0} portos previstos até hoje`}
              accent={farolAccent(adesao?.farol)}
              helper={farolLabel(adesao?.farol)}
            />
            <StatCard
              title="Cobertura por cliente"
              value={cobertura?.total ?? "—"}
              subtitle={`pessoas já em jornada · ${cobertura?.porCliente?.length ?? 0} clientes`}
              accent={colors.primary}
            />
            <StatCard
              title="Presença nas jornadas"
              value={presenca?.pct != null ? `${presenca.pct}%` : "—"}
              subtitle={
                presenca?.jornadasComDado
                  ? `${presenca.jornadasAbaixoDoMinimo} de ${presenca.jornadasComDado} jornadas abaixo do mínimo · ${presenca.pessoasAbaixoDoMinimo} pessoas`
                  : "nenhuma chamada lançada ainda"
              }
              accent={farolAccent(presenca?.farol)}
              helper={farolLabel(presenca?.farol)}
            />
            <StatCard
              title="Chamada em dia"
              value={encontros?.pct != null ? `${encontros.pct}%` : "—"}
              subtitle={`${encontros?.lancados ?? 0} de ${encontros?.previstos ?? 0} encontros já realizados com chamada lançada`}
              accent={farolAccent(encontros?.farol)}
              helper={farolLabel(encontros?.farol)}
            />
            <StatCard
              title="Coaching individual — em dia"
              value={coaching?.emDia ?? "—"}
              subtitle={`de ${coaching?.total ?? 0} relacionamentos ativos`}
              accent={colors.success}
            />
            <StatCard
              title="Coaching individual — atrasados"
              value={coaching?.atrasados ?? "—"}
              subtitle={coaching?.aguardando ? `${coaching.aguardando} aguardando 1º encontro` : "farol isolado — não entra na adesão"}
              accent={coaching?.atrasados > 0 ? colors.danger : colors.neutral}
            />
          </div>

          <div style={gridDuas}>
            <SectionCard
              title="Adesão ao cronograma por cliente"
              subtitle="% de portos concluídos no prazo, entre os previstos até hoje — cobertura ao lado é o headcount, não o mesmo cálculo"
            >
              {!adesao?.porCliente?.length ? (
                <p style={vazio}>Sem etapas com prazo vencido registradas ainda — o acompanhamento pelos encontros está no cartão "Chamada em dia" e no bloco de jornadas abaixo.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {adesao.porCliente.map((c) => (
                    <div key={c.cliente}>
                      <div style={linhaLabel}>
                        <span style={{ fontWeight: 700, color: colors.textPrimary }}>{c.cliente}</span>
                        <span style={estiloBadgeClassificacao(farolLabel(c.farol))}>
                          {c.pct != null ? `${c.pct}%` : "sem dado"}
                        </span>
                      </div>
                      <div style={barraFundo}>
                        <div
                          style={{
                            ...barraPreenchida,
                            width: `${c.pct ?? 0}%`,
                            background: farolAccent(c.farol),
                          }}
                        />
                      </div>
                      <div style={legendaBarra}>
                        {c.concluidos} concluídos no prazo de {c.previstos} previstos
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Cobertura por cliente" subtitle="Pessoas com jornada coletiva ativa, por cliente">
              {!cobertura?.porCliente?.length ? (
                <p style={vazio}>Nenhum participante de jornada cadastrado ainda.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cobertura.porCliente.map((c) => (
                    <div key={c.cliente} style={linhaCliente}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: corDoCliente(c.cliente).text,
                          display: "inline-block",
                        }}
                      />
                      <span style={{ flexGrow: 1, fontSize: 13.5, color: colors.textPrimary }}>{c.cliente}</span>
                      <span style={{ fontWeight: 800, color: colors.textPrimary }}>{c.pessoas}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: 20 }}>
          <SectionCard
            title="Jornadas — encontros e presença"
            subtitle="Uma linha por jornada: presença contra o mínimo configurado, horas de presença e chamadas pendentes. Cadastro e lançamento em Mapa de Desenvolvimento → Encontros e presença."
            action={
              <a href="/mapa-desenvolvimento/presenca" style={linkAcao}>
                Abrir encontros e presença →
              </a>
            }
          >
            {!jornadas.length ? (
              <p style={vazio}>Nenhuma jornada cadastrada ainda.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {jornadas.map((j) => (
                  <div key={j.jornada_id} style={linhaJornada}>
                    <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                      <div style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 14 }}>{j.nome}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted }}>
                        {j.cliente || "Sem cliente"} · {j.participantes} participantes · {j.encontros_realizados} de {j.encontros_total} encontros realizados
                      </div>
                      {j.proximo_encontro && (
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>
                          Próximo: {j.proximo_encontro.titulo} ({formatarData(j.proximo_encontro.data)})
                        </div>
                      )}
                    </div>
                    <MiniStat label="horas de presença" value={j.horas_presenca} />
                    <MiniStat label={`presença (mín. ${j.presenca_minima_pct}%)`} value={j.pct_presenca != null ? `${j.pct_presenca}%` : "—"} cor={j.farol === "vermelho" ? colors.danger : j.farol === "verde" ? colors.success : colors.neutral} />
                    <MiniStat label="pessoas abaixo do mínimo" value={j.abaixo_do_minimo} cor={j.abaixo_do_minimo > 0 ? colors.danger : colors.neutral} />
                    <MiniStat label="chamadas pendentes" value={j.chamadas_pendentes} cor={j.chamadas_pendentes > 0 ? colors.warning : colors.neutral} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          </div>

          <div style={gridDuas}>
            <SectionCard
              title="Coaching individual"
              subtitle="Cadência combinada por pessoa — alcança além da tripulação (gerência, coordenação, diretoria)"
              action={
                <a href="/tripulacao" style={linkAcao}>
                  Ver tripulação →
                </a>
              }
            >
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <MiniStat label="ativos" value={coaching?.total ?? 0} />
                <MiniStat label="em dia" value={coaching?.emDia ?? 0} cor={colors.success} />
                <MiniStat label="atrasados" value={coaching?.atrasados ?? 0} cor={colors.danger} />
                <MiniStat label="aguardando 1º encontro" value={coaching?.aguardando ?? 0} cor={colors.neutral} />
              </div>
            </SectionCard>

            <SectionCard
              title="Comprovação MPT"
              subtitle={`Horas reais de presença por subdivisão, jornadas e turmas juntas, ano ${mptResumo?.ano ?? new Date().getFullYear()}. Meta interna de gestão.`}
              action={
                <a href="/mapa-desenvolvimento?aba=mpt" style={linkAcao}>
                  Abrir Comprovação MPT →
                </a>
              }
            >
              {!mptSub.length ? (
                <p style={vazio}>
                  Nenhuma subdivisão com pessoas ainda. Defina a subdivisão padrão nas jornadas (Mapa de Desenvolvimento) ou o subtipo nas turmas.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {mptSub.map((s) => {
                    const semMeta = !s.meta_horas;
                    const rotulo = semMeta
                      ? "Meta não definida"
                      : s.farol === "verde"
                      ? "Saudável"
                      : s.farol === "amarelo"
                      ? "Atenção"
                      : "Crítico";
                    return (
                      <div key={s.subtipo} style={linhaCliente}>
                        <span style={{ flexGrow: 1, fontSize: 13.5, color: colors.textPrimary }}>
                          {s.subtipo}
                          {!semMeta && <span style={{ color: colors.textMuted }}> · meta {s.meta_horas} h</span>}
                        </span>
                        <span style={{ fontSize: 12.5, color: colors.textSecondary }}>
                          {semMeta ? `${s.pessoas} pessoas` : `${s.atingiram} de ${s.pessoas}${s.pct != null ? ` · ${s.pct}%` : ""}`}
                        </span>
                        <span
                          style={
                            semMeta
                              ? { ...estiloBadgeClassificacao("Atenção"), background: "#eef0f3", color: colors.textSecondary }
                              : estiloBadgeClassificacao(rotulo === "Saudável" ? "Estável" : rotulo)
                          }
                        >
                          {rotulo}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </PortalShell>
  );
}

function formatarData(iso) {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

function MiniStat({ label, value, cor }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary }}>{value}</div>
      <div style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const gridStats = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginTop: 20,
};

const gridDuas = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: 20,
  marginTop: 20,
};

const linhaLabel = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
  fontSize: 13.5,
};

const barraFundo = {
  height: 8,
  borderRadius: 999,
  background: colors.surfaceMuted,
  overflow: "hidden",
};

const barraPreenchida = {
  height: "100%",
  borderRadius: 999,
};

const legendaBarra = {
  fontSize: 11.5,
  color: colors.textMuted,
  marginTop: 4,
};

const linhaCliente = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const linhaJornada = {
  display: "flex",
  alignItems: "center",
  gap: 24,
  flexWrap: "wrap",
  padding: "12px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const vazio = {
  fontSize: 13.5,
  color: colors.textMuted,
  margin: 0,
};

const linkAcao = {
  fontSize: 13,
  fontWeight: 700,
  color: colors.primary,
  textDecoration: "none",
};

const avisoErro = {
  marginTop: 16,
  padding: "12px 16px",
  borderRadius: 12,
  background: colors.dangerLight,
  color: colors.dangerText,
  fontSize: 13.5,
};

