"use client";

import { useMemo, useState } from "react";
import { colors, chart } from "../lib/theme";

// Curva de aprendizagem da Célula baby (16/10/2026): uma linha por pessoa
// (D1 a D7), a média da turma em destaque e, quando o instrutor definiu, a
// meta de referência tracejada. Dia sem lançamento fica em branco (a linha
// não cruza o buraco). Gráfico em SVG próprio porque a GraficoLinha geral
// não trata dias faltando nem meta.

export const CORES_PESSOAS = [
  chart.blue, chart.orange, chart.teal, chart.purple, chart.pink, chart.cyan,
  "#65a30d", "#b45309", "#0f766e", "#be123c", "#4338ca", "#475569",
];

const W = 680;
const H = 280;
const M = { l: 52, r: 18, t: 16, b: 34 };

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default function CelulaBabyCurva({ pessoas = [], dias = 7, valorDe, meta = null, unidade = "" }) {
  const [ocultas, setOcultas] = useState({});

  const visiveis = pessoas.filter((p) => !ocultas[p.id]);

  const { series, media, min, max } = useMemo(() => {
    const series = pessoas.map((p, i) => ({
      id: p.id,
      nome: p.nome,
      cor: CORES_PESSOAS[i % CORES_PESSOAS.length],
      pontos: Array.from({ length: dias }, (_, d) => {
        const v = valorDe(p.id, d + 1);
        return v === null || v === undefined ? null : Number(v);
      }),
    }));
    const media = Array.from({ length: dias }, (_, d) => {
      const vs = series.filter((s) => !ocultas[s.id]).map((s) => s.pontos[d]).filter((v) => v !== null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    });
    const todos = [
      ...series.filter((s) => !ocultas[s.id]).flatMap((s) => s.pontos),
      ...media,
      ...(meta !== null && meta !== undefined ? [Number(meta)] : []),
    ].filter((v) => v !== null && !Number.isNaN(v));
    let min = todos.length ? Math.min(...todos) : 0;
    let max = todos.length ? Math.max(...todos) : 1;
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12;
    return { series, media, min: min - pad, max: max + pad };
  }, [pessoas, dias, valorDe, meta, ocultas]);

  const x = (d) => M.l + ((W - M.l - M.r) * d) / (dias - 1);
  const y = (v) => M.t + (H - M.t - M.b) * (1 - (v - min) / (max - min));

  function caminho(pontos) {
    let d = "";
    let aberto = false;
    pontos.forEach((v, i) => {
      if (v === null) { aberto = false; return; }
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      aberto = true;
    });
    return d.trim();
  }

  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const temDado = series.some((s) => s.pontos.some((v) => v !== null));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de aprendizagem por pessoa e média da turma" style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={colors.textSecondary}>{fmt(t)}</text>
          </g>
        ))}
        {Array.from({ length: dias }, (_, d) => (
          <text key={d} x={x(d)} y={H - 10} textAnchor="middle" fontSize="12" fill={colors.textSecondary} fontWeight="600">D{d + 1}</text>
        ))}
        {meta !== null && meta !== undefined && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(Number(meta))} y2={y(Number(meta))} stroke={colors.accent} strokeWidth="2" strokeDasharray="6 5" />
            <text x={W - M.r} y={y(Number(meta)) - 6} textAnchor="end" fontSize="11" fill={colors.accentText} fontWeight="700">Meta {fmt(Number(meta))}{unidade ? ` ${unidade}` : ""}</text>
          </g>
        )}
        {series.filter((s) => !ocultas[s.id]).map((s) => (
          <g key={s.id}>
            <path d={caminho(s.pontos)} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" opacity="0.9" />
            {s.pontos.map((v, i) => v === null ? null : (
              <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={s.cor} stroke="#fff" strokeWidth="2">
                <title>{`${s.nome} · D${i + 1}: ${fmt(v)}${unidade ? ` ${unidade}` : ""}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {visiveis.length > 0 && (
          <g>
            <path d={caminho(media)} fill="none" stroke={colors.navy} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {media.map((v, i) => v === null ? null : (
              <circle key={i} cx={x(i)} cy={y(v)} r="5" fill={colors.navy} stroke="#fff" strokeWidth="2">
                <title>{`Média da turma · D${i + 1}: ${fmt(v)}${unidade ? ` ${unidade}` : ""}`}</title>
              </circle>
            ))}
          </g>
        )}
        {!temDado && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14" fill={colors.textMuted}>Sem lançamentos neste indicador ainda.</text>
        )}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: colors.navy }}>
          <span style={{ width: 18, height: 4, background: colors.navy, borderRadius: 2 }} /> Média da turma
        </span>
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOcultas((o) => ({ ...o, [s.id]: !o[s.id] }))}
            aria-pressed={!ocultas[s.id]}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px",
              borderRadius: 999, border: `1px solid ${colors.border}`, background: ocultas[s.id] ? "#f8fafc" : "#fff",
              color: ocultas[s.id] ? colors.textMuted : colors.textPrimary, cursor: "pointer", fontWeight: 600,
              textDecoration: ocultas[s.id] ? "line-through" : "none",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 999, background: s.cor, opacity: ocultas[s.id] ? 0.35 : 1 }} />
            {s.nome}
          </button>
        ))}
      </div>
    </div>
  );
}
