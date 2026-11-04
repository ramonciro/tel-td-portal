"use client";

// Progresso das jornadas de desenvolvimento (04/11/2026).
//
// Mesmo componente no Dashboard (compacto, só números agregados) e no Mapa de
// Desenvolvimento (completo). Os números vêm de /dashboard/jornadas-progresso,
// que reaproveita a conta da grade de presença — então Dashboard e Mapa nunca
// divergem. Nome de participante não passa por aqui.

import { colors, chart } from "../lib/theme";

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(Number(n || 0));
const dec = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(n || 0));

const ETAPAS = [
  { key: "concluido", label: "Concluídos", cor: colors.success },
  { key: "em_sustentacao", label: "Em sustentação", cor: chart.teal },
  { key: "em_percurso", label: "Em percurso", cor: colors.primary },
  { key: "nao_iniciado", label: "Não iniciados", cor: "#94a3b8" },
];

const FAROL = {
  vermelho: { icone: "⚠", texto: "Atenção", cor: colors.dangerText, bg: colors.dangerLight },
  amarelo: { icone: "◔", texto: "Falta lançar", cor: colors.warningText, bg: colors.warningLight },
  verde: { icone: "✓", texto: "Em dia", cor: colors.successText, bg: colors.successLight },
  cinza: { icone: "•", texto: "Sem participantes", cor: colors.neutral, bg: colors.neutralLight },
};
const ORDEM_FAROL = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 };

export function motivoDaJornada(j) {
  const m = [];
  if (j.abaixo_do_minimo > 0) m.push(`${fmt(j.abaixo_do_minimo)} abaixo da presença mínima (${fmt(j.presenca_minima_pct)}%)`);
  if ((j.reciclagem_vencida || 0) > 0) m.push(`${fmt(j.reciclagem_vencida)} com reciclagem vencida`);
  if (j.sem_lancamento > 0) m.push(`${fmt(j.sem_lancamento)} sem presença lançada`);
  return m.join(" · ");
}

function BarraEtapas({ etapas, total }) {
  if (!total) return <div style={{ height: 10, borderRadius: 5, background: colors.neutralLight }} />;
  return (
    <div style={{ display: "flex", gap: 2, height: 10 }} role="img" aria-label={ETAPAS.map((e) => `${e.label}: ${etapas[e.key] || 0}`).join(", ")}>
      {ETAPAS.map((e) => {
        const v = Number(etapas[e.key] || 0);
        if (!v) return null;
        return <div key={e.key} title={`${e.label}: ${v}`} style={{ flex: v, background: e.cor, borderRadius: 4, minWidth: 6 }} />;
      })}
    </div>
  );
}

function Pill({ farol }) {
  const f = FAROL[farol] || FAROL.cinza;
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: f.cor, background: f.bg, whiteSpace: "nowrap" }}>
      <span aria-hidden="true">{f.icone}</span>
      {f.texto}
    </span>
  );
}

function Numero({ valor, rotulo, cor }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary, lineHeight: 1.1 }}>{fmt(valor)}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{rotulo}</div>
    </div>
  );
}

function Legenda() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: colors.textSecondary }}>
      {ETAPAS.map((e) => (
        <span key={e.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: e.cor, display: "inline-block" }} />
          {e.label}
        </span>
      ))}
    </div>
  );
}

export default function ProgressoJornadas({ dados, compacto = false, limite = 5 }) {
  if (!dados) return <div style={vazio}>Carregando o progresso das jornadas...</div>;
  const todas = Array.isArray(dados.jornadas) ? dados.jornadas : [];
  const t = dados.totais || {};
  if (!todas.length) return <div style={vazio}>Nenhuma jornada ativa por enquanto.</div>;

  const ordenadas = [...todas].sort(
    (a, b) => (ORDEM_FAROL[a.farol] ?? 9) - (ORDEM_FAROL[b.farol] ?? 9) || String(a.cliente || "").localeCompare(String(b.cliente || ""), "pt-BR")
  );
  const linhas = compacto ? ordenadas.slice(0, limite) : ordenadas;
  const restantes = ordenadas.length - linhas.length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Numero valor={t.jornadas} rotulo="jornadas ativas" />
        <Numero valor={t.participantes} rotulo="participantes" />
        <Numero valor={t.etapas?.concluido} rotulo="concluíram" cor={colors.successText} />
        <Numero valor={(t.etapas?.em_percurso || 0) + (t.etapas?.em_sustentacao || 0)} rotulo="em andamento" cor={colors.primary} />
        <Numero valor={t.abaixo_do_minimo} rotulo="abaixo da presença mínima" cor={t.abaixo_do_minimo ? colors.dangerText : undefined} />
        <Numero valor={t.atingiram_meta} rotulo="já atingiram a meta de horas" cor={colors.successText} />
      </div>

      <Legenda />

      <div style={{ display: "grid", gap: 10 }}>
        {linhas.map((j) => {
          const metaPct = j.meta_horas && j.horas_medias !== null ? Math.min(100, Math.round((j.horas_medias / j.meta_horas) * 100)) : null;
          const motivo = motivoDaJornada(j);
          return (
            <div key={j.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 14, background: "#fff", padding: "12px 16px", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <strong style={{ fontSize: 14.5, color: colors.textPrimary }}>{j.nome}</strong>
                  {j.cliente && <span style={{ fontSize: 12.5, color: colors.textSecondary, marginLeft: 8 }}>{j.cliente}</span>}
                </div>
                <Pill farol={j.farol} />
              </div>

              <BarraEtapas etapas={j.etapas} total={j.participantes || ETAPAS.reduce((s, e) => s + (j.etapas[e.key] || 0), 0)} />
              <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                {fmt(j.etapas.concluido)} concluído(s) · {fmt(j.etapas.em_sustentacao)} em sustentação · {fmt(j.etapas.em_percurso)} em percurso · {fmt(j.etapas.nao_iniciado)} não iniciado(s)
              </div>

              {!compacto && (
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, color: colors.textPrimary }}>
                  <span>
                    Encontros: <strong>{fmt(j.encontros_realizados)}</strong> de {fmt(j.encontros)} realizados
                  </span>
                  <span>
                    Presença média: <strong>{j.pct_presenca_medio === null ? "—" : `${dec(j.pct_presenca_medio)}%`}</strong> (mínimo {fmt(j.presenca_minima_pct)}%)
                  </span>
                  <span>
                    Horas por pessoa: <strong>{j.horas_medias === null ? "—" : `${dec(j.horas_medias)}h`}</strong>
                    {j.meta_horas ? ` de ${dec(j.meta_horas)}h` : " (sem meta definida)"}
                    {metaPct !== null ? ` · ${metaPct}%` : ""}
                  </span>
                  {j.meta_horas && j.atingiram_meta !== null && (
                    <span>
                      Atingiram a meta: <strong>{fmt(j.atingiram_meta)}</strong> de {fmt(j.participantes)}
                    </span>
                  )}
                </div>
              )}
              {compacto && j.meta_horas && j.horas_medias !== null && (
                <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                  Horas por pessoa: <strong>{dec(j.horas_medias)}h</strong> de {dec(j.meta_horas)}h ({metaPct}%) · {fmt(j.atingiram_meta ?? 0)} já atingiram a meta
                </div>
              )}

              {motivo && <div style={{ fontSize: 12.5, fontWeight: 700, color: j.farol === "vermelho" ? colors.dangerText : colors.warningText }}>{motivo}</div>}
            </div>
          );
        })}
      </div>

      {restantes > 0 && <div style={{ fontSize: 12.5, color: colors.textSecondary }}>+{restantes} jornada(s) a mais, sem alerta, fora desta lista.</div>}
    </div>
  );
}

const vazio = {
  borderRadius: 14,
  border: `1px dashed ${colors.border}`,
  padding: "16px 18px",
  fontSize: 13.5,
  color: colors.textSecondary,
  background: "#fff",
};
