"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api";
import { colors, radius } from "../lib/theme";
import { fmtData } from "../lib/conteudoUi";

// Seletor de turma para o pedido de conteúdo (Pacote 3, 23/10/2026).
// Liga o material à ação em piso que o originou. Opcional: pedido sem turma continua valendo.
// value = { id, tema, cliente, realizada_em } | null

export default function ConteudoTurmaPicker({ value, onChange, rotulo = "Turma de origem (opcional)", ajuda }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState("");
  const reqId = useRef(0);

  useEffect(() => {
    if (!aberto) return undefined;
    const n = ++reqId.current;
    const t = setTimeout(() => {
      apiFetch(`/conteudo/turmas?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (n === reqId.current) { setLista(r); setErro(""); } })
        .catch((e) => { if (n === reqId.current) setErro(e.message); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, aberto]);

  if (value) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <span style={rotuloStyle}>{rotulo}</span>
        <div style={chipTurma}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis" }}>{value.tema}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>{[value.cliente, value.realizada_em ? fmtData(value.realizada_em) : null].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" onClick={() => onChange(null)} style={linkBtn} aria-label="Tirar a turma deste pedido">Trocar ou tirar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 4, position: "relative" }}>
      <label style={rotuloStyle} htmlFor="conteudo-turma-busca">{rotulo}</label>
      <input
        id="conteudo-turma-busca"
        value={q}
        onChange={(e) => { setQ(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        placeholder="Buscar pelo tema, cliente ou instrutor"
        style={campo}
        autoComplete="off"
      />
      {ajuda && <span style={{ fontSize: 12, color: colors.textMuted }}>{ajuda}</span>}
      {aberto && (
        <div style={caixa} role="listbox" aria-label="Turmas encontradas">
          {erro && <div style={{ padding: 10, fontSize: 13, color: colors.dangerText }}>{erro}</div>}
          {!erro && lista === null && <div style={{ padding: 10, fontSize: 13, color: colors.textMuted }}>Buscando…</div>}
          {!erro && lista && lista.length === 0 && <div style={{ padding: 10, fontSize: 13, color: colors.textMuted }}>Nenhuma turma encontrada.</div>}
          {!erro && (lista || []).map((t) => (
            <button key={t.id} type="button" role="option" aria-selected="false" style={opcao}
              onClick={() => { onChange({ id: t.id, tema: t.tema, cliente: t.cliente, realizada_em: t.realizada_em }); setAberto(false); setQ(""); }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t.tema}</span>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {t.cliente} · {fmtData(t.realizada_em)}{t.tbt ? " · TBT" : ""}{t.n_pedidos ? ` · já tem ${t.n_pedidos} material(is)` : ""}
              </span>
            </button>
          ))}
          <button type="button" style={{ ...opcao, color: colors.textMuted, textAlign: "center" }} onClick={() => setAberto(false)}>Fechar</button>
        </div>
      )}
    </div>
  );
}

const rotuloStyle = { fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const campo = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", fontFamily: "inherit", fontSize: 13.5, color: colors.textPrimary, width: "100%", boxSizing: "border-box" };
const caixa = { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, boxShadow: "0 12px 30px rgba(15,23,42,.18)", maxHeight: 260, overflowY: "auto" };
const opcao = { display: "grid", gap: 2, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${colors.border}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", color: colors.textPrimary };
const chipTurma = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.surfaceMuted };
const linkBtn = { background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", whiteSpace: "nowrap" };
