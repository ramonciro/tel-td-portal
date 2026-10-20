"use client";

/**
 * SinoAvisos.js — sino de avisos no cabeçalho do portal (21/10/2026)
 *
 * Mostra, para cada pessoa, o que está pendente para o perfil dela (chamadas,
 * rotina, aulas, certificados, RPs atrasadas…). Os avisos vêm de /api/avisos,
 * somem sozinhos quando a pendência é resolvida e voltam como "não lido" se
 * a quantidade aumentar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../services/api";

const COR_GRAV = { critico: "#dc2626", atencao: "#d97706", info: "#2563eb" };
const INTERVALO_MS = 5 * 60 * 1000;

export default function SinoAvisos() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState({ nao_lidos: 0, itens: [] });
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef(null);

  const carregar = useCallback(async (atualizar = false) => {
    try {
      setCarregando(true);
      const r = await apiFetch(`/avisos${atualizar ? "?atualizar=1" : ""}`);
      setDados({ nao_lidos: Number(r?.nao_lidos || 0), itens: Array.isArray(r?.itens) ? r.itens : [] });
    } catch {
      /* o sino nunca atrapalha a página */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(() => carregar(), INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  async function abrirAviso(item) {
    setAberto(false);
    if (!item.lido_em) {
      setDados((d) => ({ nao_lidos: Math.max(0, d.nao_lidos - 1), itens: d.itens.map((i) => (i.id === item.id ? { ...i, lido_em: new Date().toISOString() } : i)) }));
      apiFetch(`/avisos/${item.id}/lido`, { method: "POST" }).catch(() => {});
    }
    if (item.link) router.push(item.link);
  }

  async function marcarTodos() {
    setDados((d) => ({ nao_lidos: 0, itens: d.itens.map((i) => ({ ...i, lido_em: i.lido_em || new Date().toISOString() })) }));
    apiFetch("/avisos/lidos", { method: "POST" }).catch(() => {});
  }

  return (
    <div ref={caixa} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { const abrir = !aberto; setAberto(abrir); if (abrir) carregar(true); }}
        aria-label={dados.nao_lidos ? `Avisos: ${dados.nao_lidos} não lido(s)` : "Avisos"}
        aria-expanded={aberto}
        style={botao}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {dados.nao_lidos > 0 ? <span style={selo}>{dados.nao_lidos > 9 ? "9+" : dados.nao_lidos}</span> : null}
      </button>

      {aberto ? (
        <div style={painel} role="dialog" aria-label="Avisos">
          <div style={painelTopo}>
            <strong style={{ fontSize: 14 }}>Avisos</strong>
            {dados.nao_lidos > 0 ? <button type="button" onClick={marcarTodos} style={linkBtn}>Marcar todos como lidos</button> : null}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {carregando && !dados.itens.length ? <p style={vazio}>Carregando…</p> : null}
            {!carregando && !dados.itens.length ? <p style={vazio}>Tudo em dia por aqui. Nenhum aviso no momento.</p> : null}
            {dados.itens.map((item) => (
              <button key={item.id} type="button" onClick={() => abrirAviso(item)} style={{ ...linha, background: item.lido_em ? "#fff" : "#f8fafc" }}>
                <span style={{ ...ponto, background: item.lido_em ? "transparent" : (COR_GRAV[item.gravidade] || COR_GRAV.info), border: item.lido_em ? "1px solid #cbd5e1" : "none" }} />
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: item.lido_em ? 600 : 800, color: "#0f172a" }}>{item.titulo}</span>
                  {item.mensagem ? <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>{item.mensagem}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const botao = { position: "relative", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, width: 42, height: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#0f172a", cursor: "pointer" };
const selo = { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #fff" };
const painel = { position: "absolute", right: 0, top: 50, width: "min(380px, calc(100vw - 32px))", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 18px 40px rgba(15,23,42,.18)", zIndex: 50, overflow: "hidden" };
const painelTopo = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #f1f5f9" };
const linkBtn = { background: "none", border: 0, color: "#1d4ed8", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 };
const linha = { display: "flex", gap: 10, alignItems: "flex-start", width: "100%", padding: "12px 14px", border: 0, borderBottom: "1px solid #f1f5f9", cursor: "pointer" };
const ponto = { flexShrink: 0, width: 9, height: 9, borderRadius: 999, marginTop: 5 };
const vazio = { margin: 0, padding: "22px 14px", color: "#64748b", fontSize: 13, textAlign: "center" };
