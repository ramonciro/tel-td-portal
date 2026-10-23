"use client";

import { useState } from "react";
import { apiFetch } from "../services/api";
import { colors, radius } from "../lib/theme";
import { estiloBtn } from "../lib/conteudoUi";

// Confirmação de exclusão de pedido de conteúdo finalizado (concluído ou cancelado). Só o coordenador.
// A exclusão apaga o pedido e as etapas; a auditoria guarda uma cópia do que foi apagado.
export default function ConteudoExcluir({ pedido, onFechar, onExcluido }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function excluir() {
    setOcupado(true); setErro("");
    try {
      await apiFetch(`/conteudo/pedidos/${pedido.id}`, { method: "DELETE" });
      onExcluido();
    } catch (e) { setErro(e.message); setOcupado(false); }
  }
  return (
    <div style={fundo} onClick={onFechar}>
      <div style={caixa} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Excluir pedido">
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Excluir este pedido?</h2>
        <p style={{ margin: "0 0 8px", fontSize: 14 }}><strong>{pedido.titulo}</strong> · {pedido.cliente}</p>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: colors.textSecondary }}>
          O pedido e o histórico de tempos dele saem dos indicadores e não voltam. Fica um registro na auditoria.
        </p>
        {erro && <div style={alerta}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Cancelar</button>
          <button type="button" disabled={ocupado} onClick={excluir} style={{ ...estiloBtn.base, background: colors.danger, color: "#fff", border: `1px solid ${colors.danger}`, opacity: ocupado ? 0.6 : 1 }}>
            {ocupado ? "Excluindo…" : "Excluir pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

const fundo = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const caixa = { background: "#fff", borderRadius: radius.lg, padding: 22, width: "100%", maxWidth: 440, boxShadow: "0 24px 60px rgba(15,23,42,.3)" };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "10px 14px", fontSize: 14 };
