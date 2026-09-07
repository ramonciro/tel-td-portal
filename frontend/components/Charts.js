"use client";

// Charts.js — biblioteca de gráficos compartilhada do Portal T&D.
//
// Melhoria (setembro/2026, a pedido do Ramon — "melhorar os gráficos e
// permitir animações", partindo da revisão do Dashboard de R&S): este
// arquivo já existia mas não estava sendo importado por nenhuma página do
// portal (confirmado por busca em todo `app/`) — os gráficos aqui nunca
// tinham rodado de verdade. Duas correções de fundo, além das animações:
//
// 1. Os componentes usavam `var(--color-text-primary)` etc., variáveis CSS
//    que não existem em lugar nenhum do projeto (sem `:root` definindo
//    isso) — o texto cairia no valor padrão do navegador. Trocado por
//    `colors`/`chart` de `lib/theme.js`, a mesma paleta usada no resto do
//    portal.
// 2. Nenhum gráfico animava de verdade na entrada (só tinham `transition`
//    de CSS, que só dispara se o valor muda depois da montagem — como o
//    valor já chegava pronto, nunca disparava). Agora todo componente
//    aceita um prop `revelado` (default: sempre anima ao montar) que
//    controla a entrada de 0 até o valor real, com stagger entre itens e
//    respeito a `prefers-reduced-motion`.
//
// Uso típico com o padrão "revelado" já usado no Início:
//   const [revelado, setRevelado] = useState(false);
//   useEffect(() => { if (!loading) requestAnimationFrame(() => setRevelado(true)); }, [loading]);
//   <Donut fatias={...} revelado={revelado} />

import { useEffect, useRef, useState } from "react";
import { colors, chart as chartColors } from "../lib/theme";

export const CORES = [
  chartColors.blue, colors.success, chartColors.orange, colors.danger, chartColors.purple,
  chartColors.cyan, colors.accent, chartColors.teal, chartColors.pink, colors.neutral,
];

function fmt(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

// Hook interno: dispara `true` uma única vez, no próximo frame após a
// montagem — é o mesmo gatilho usado em toda a entrada animada deste
// arquivo quando o componente não recebe `revelado` explicitamente (ex.:
// uma página que ainda não implementou o padrão "revelado" ganha a
// animação de qualquer forma, sem precisar mudar nada).
function useAutoRevelado(revelado) {
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (revelado !== undefined) return;
    const id = requestAnimationFrame(() => setAuto(true));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return revelado !== undefined ? revelado : auto;
}

// Hook interno: reflete o prefers-reduced-motion do sistema operacional e
// reage se a pessoa mudar a preferência com a página aberta. Usado por TODO
// componente animado deste arquivo (não só o ContadorAnimado) — antes só o
// contador checava isso; barra/donut/linha animavam de qualquer forma porque
// a transição CSS delas era incondicional. FIX (setembro/2026, achado ao
// testar com Playwright em modo reduced-motion): agora a transição vira
// `none` nesse modo, então o elemento já nasce no valor final, sem esperar a
// duração da animação passar escondida.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler));
  }, []);
  return reduced;
}

// Conta de 0 até `valor` ao ser revelado — usado nos números grandes de KPI
// (StatCard-like) para dar a mesma sensação de "painel vivo" que os
// concorrentes de LMS pesquisados no benchmark anunciam como diferencial.
export function ContadorAnimado({ valor = 0, duracaoMs = 700, formatar = fmt, revelado, sufixo = "" }) {
  const show = useAutoRevelado(revelado);
  const [exibido, setExibido] = useState(0);
  const inicioRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setExibido(valor);
      return;
    }
    if (!show) { setExibido(0); return; }
    inicioRef.current = null;
    const alvo = Number(valor) || 0;
    function passo(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min(1, (ts - inicioRef.current) / duracaoMs);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setExibido(Math.round(alvo * ease));
      if (t < 1) frameRef.current = requestAnimationFrame(passo);
    }
    frameRef.current = requestAnimationFrame(passo);
    return () => frameRef.current && cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, valor]);

  return <>{formatar(exibido)}{sufixo}</>;
}

// ─── Barra horizontal ──────────────────────────────────────────────────────
// Uma cor só por padrão (ranking de magnitude — ver dataviz: cor por barra
// só faz sentido quando cada barra é uma identidade diferente, não quando
// todas medem a mesma métrica). Passe `corPorItem` só quando as barras
// representarem categorias distintas de verdade (ex.: status).
export function BarraHorizontal({ dados = [], labelKey, valueKey, cor = chartColors.blue, sufixo = "", maxItens = 8, revelado, corPorItem = null, subtitulo = null }) {
  const show = useAutoRevelado(revelado);
  const reduceMotion = usePrefersReducedMotion();
  const lista = [...dados].sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)).slice(0, maxItens);
  const max = Math.max(...lista.map((d) => Number(d[valueKey] || 0)), 1);

  if (!lista.length) {
    return <p style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", padding: "16px 0" }}>Sem dados no período</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {lista.map((d, i) => {
        const val = Number(d[valueKey] || 0);
        const pct = Math.round((val / max) * 100);
        const corBarra = corPorItem ? corPorItem(d, i) : cor;
        const sub = subtitulo ? subtitulo(d) : null;
        return (
          <div key={i} title={sub ? `${d[labelKey]}: ${fmt(val)}${sufixo} — ${sub}` : `${d[labelKey]}: ${fmt(val)}${sufixo}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 5 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "62%", color: colors.textPrimary, fontWeight: 600 }}>
                {d[labelKey] || "—"}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
                {sub && <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>{sub}</span>}
                <span style={{ fontWeight: 800, color: corBarra }}>{fmt(val)}{sufixo}</span>
              </span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: colors.neutralLight, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: show ? `${pct}%` : "0%",
                  background: corBarra,
                  borderRadius: 999,
                  transition: reduceMotion ? "none" : `width .8s cubic-bezier(.22,1,.36,1) ${i * 0.06}s`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Donut ─────────────────────────────────────────────────────────────────
export function Donut({ fatias = [], total, revelado, tamanho = 150 }) {
  const show = useAutoRevelado(revelado);
  const reduceMotion = usePrefersReducedMotion();
  const soma = fatias.reduce((a, f) => a + Number(f.valor || 0), 0);
  const base = total ?? soma;
  if (!soma) return <p style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", padding: "24px 0" }}>Sem dados</p>;

  let angulo = -90;
  const R = tamanho * 0.37, cx = tamanho / 2, cy = tamanho / 2, strokeW = tamanho * 0.13;
  const circunferencia = 2 * Math.PI * R;

  const arcos = fatias.map((f) => {
    const pct = Number(f.valor || 0) / soma;
    const dashArray = show
      ? `${pct * circunferencia} ${circunferencia}`
      : `0 ${circunferencia}`;
    const rotate = angulo;
    angulo += pct * 360;
    return { ...f, dashArray, rotate };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <svg width={tamanho} height={tamanho} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={colors.neutralLight} strokeWidth={strokeW} />
        {arcos.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={R}
            fill="none" stroke={a.cor} strokeWidth={strokeW} strokeLinecap="butt"
            strokeDasharray={a.dashArray}
            strokeDashoffset={0}
            transform={`rotate(${a.rotate} ${cx} ${cy})`}
            style={{ transition: reduceMotion ? "none" : `stroke-dasharray .9s cubic-bezier(.22,1,.36,1) ${i * 0.08}s` }}
          >
            <title>{`${a.label}: ${fmt(a.valor)} (${Math.round((Number(a.valor || 0) / soma) * 100)}%)`}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: tamanho * 0.15, fontWeight: 800, fill: colors.textPrimary }}>
          <ContadorAnimado valor={base} revelado={show} />
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: colors.textSecondary }}>total</text>
      </svg>
      <div style={{ display: "grid", gap: 9, flex: 1, minWidth: 140 }}>
        {fatias.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flexShrink: 0 }} />
            <span style={{ flex: 1, color: colors.textSecondary }}>{f.label}</span>
            <span style={{ fontWeight: 700, color: f.cor, minWidth: 28, textAlign: "right" }}>
              <ContadorAnimado valor={Number(f.valor || 0)} revelado={show} />
            </span>
            <span style={{ fontSize: 11, color: colors.textMuted, minWidth: 32, textAlign: "right" }}>
              {soma ? Math.round((Number(f.valor || 0) / soma) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Linha (evolução mensal) ───────────────────────────────────────────────
export function GraficoLinha({ dados = [], linhas = [], eixoX = "mes", revelado }) {
  const show = useAutoRevelado(revelado);
  const reduceMotion = usePrefersReducedMotion();
  const [hover, setHover] = useState(null); // { i }

  if (!dados.length) return <p style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", padding: "24px 0" }}>Sem dados no período</p>;

  const W = 560, H = 190, padL = 34, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = dados.flatMap((d) => linhas.map((l) => Number(d[l.key] || 0)));
  const maxVal = Math.max(...allVals, 1);

  const xPos = (i) => padL + (dados.length > 1 ? (i / (dados.length - 1)) * innerW : innerW / 2);
  const yPos = (v) => padT + innerH - (v / maxVal) * innerH;

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const label = (mes) => {
    const [, m] = String(mes || "").split("-");
    return meses[Number(m || 1) - 1] || mes;
  };

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 320 }}
          onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * (1 - t)} y2={padT + innerH * (1 - t)}
              stroke={colors.border} strokeWidth={0.75} />
          ))}
          {linhas.map((l) => {
            const pts = dados.map((d, i) => `${xPos(i)},${yPos(Number(d[l.key] || 0))}`).join(" ");
            const comprimento = pts.length * 6 + 400; // aproximação suficiente para o efeito de "desenhar"
            return (
              <g key={l.key}>
                <polyline
                  points={pts} fill="none" stroke={l.cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
                  style={{
                    strokeDasharray: comprimento,
                    strokeDashoffset: show ? 0 : comprimento,
                    transition: reduceMotion ? "none" : "stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)",
                  }}
                />
                {dados.map((d, i) => (
                  <circle key={i} cx={xPos(i)} cy={yPos(Number(d[l.key] || 0))}
                    r={hover === i ? 5.5 : 3.5} fill={l.cor}
                    style={{ opacity: show ? 1 : 0, transition: reduceMotion ? "none" : `opacity .4s ease ${0.5 + i * 0.05}s, r .15s ease` }}
                    onMouseEnter={() => setHover(i)}
                  >
                    <title>{`${label(d[eixoX])} — ${l.label}: ${fmt(d[l.key])}${l.sufixo || ""}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {hover !== null && (
            <line x1={xPos(hover)} x2={xPos(hover)} y1={padT} y2={padT + innerH} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="3 3" />
          )}
          {dados.map((d, i) => (
            <text key={i} x={xPos(i)} y={H - 8} textAnchor="middle"
              style={{ fontSize: 10.5, fill: hover === i ? colors.textPrimary : colors.textSecondary, fontWeight: hover === i ? 700 : 400 }}
              onMouseEnter={() => setHover(i)}>
              {label(d[eixoX])}
            </text>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
        {linhas.map((l) => (
          <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: colors.textSecondary }}>
            <span style={{ width: 16, height: 3, background: l.cor, borderRadius: 2, display: "inline-block" }} />
            {l.label}
            {hover !== null && (
              <span style={{ fontWeight: 700, color: l.cor }}>· {fmt(dados[hover]?.[l.key])}{l.sufixo || ""}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funil ─────────────────────────────────────────────────────────────────
export function Funil({ etapas = [], revelado }) {
  const show = useAutoRevelado(revelado);
  const reduceMotion = usePrefersReducedMotion();
  const max = Math.max(...etapas.map((e) => Number(e.valor || 0)), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {etapas.map((e, i) => {
        const pct = Math.round((Number(e.valor || 0) / max) * 100);
        const pctReal = i === 0 ? 100 : Math.round((Number(e.valor || 0) / Number(etapas[0].valor || 1)) * 100);
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: colors.textSecondary }}>{e.label}</span>
              <span style={{ fontWeight: 700, color: e.cor }}>{fmt(e.valor)} <span style={{ color: colors.textSecondary, fontWeight: 400 }}>({pctReal}%)</span></span>
            </div>
            <div style={{ height: 20, borderRadius: 6, background: colors.neutralLight, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: show ? `${pct}%` : "0%", background: e.cor, borderRadius: 6,
                transition: reduceMotion ? "none" : `width .7s cubic-bezier(.22,1,.36,1) ${i * 0.08}s`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Faróis visuais ────────────────────────────────────────────────────────
export function FarolGrid({ farois = [] }) {
  const tone = (t) => ({
    verde: { bg: colors.successLight, border: colors.success, text: colors.successText },
    amarelo: { bg: colors.warningLight, border: colors.warning, text: colors.warningText },
    vermelho: { bg: colors.dangerLight, border: colors.danger, text: colors.dangerText },
  }[t] || { bg: colors.neutralLight, border: colors.border, text: colors.textSecondary });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {farois.map((f, i) => {
        const s = tone(f.tom || f.tone || f.cor);
        return (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.text, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{f.titulo || f.title}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.text }}>{f.valor ?? f.value}</div>
            {f.detalhe || f.detail ? <div style={{ fontSize: 12, color: s.text, marginTop: 3, opacity: .8 }}>{f.detalhe || f.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
