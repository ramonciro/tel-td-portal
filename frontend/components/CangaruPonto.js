"use client";

// Ponto de atenção do Canguru (12/11/2026): abrir, andar pelos 5 passos, definir responsável e prazo, registrar notas,
// resolver, arquivar e reabrir. Usado na fila de pontos de atenção e na ficha do novato.
import { useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";
import { st, Campo, fmtDia, COR_RH } from "./RhUi";
import { PASSO_NOME, STATUS_PONTO, fmtDataHora } from "./CangaruUi";

const enviar = (url, metodo, corpo) => apiFetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

export function AbrirPontoForm({ novatoId, equipe, onFeito, onCancelar }) {
  const [f, setF] = useState({ responsavel_id: "", prazo: "", combinado: "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const abrir = async () => {
    setOcupado(true); setErro("");
    try {
      await enviar("/rh/canguru/pontos", "POST", { novato_id: novatoId, responsavel_id: f.responsavel_id ? Number(f.responsavel_id) : null, prazo: f.prazo || null, combinado: f.combinado.trim() || null });
      onFeito();
    } catch (e) { setErro(e.message || "Não foi possível abrir o ponto de atenção."); }
    finally { setOcupado(false); }
  };
  return (
    <div>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colors.textSecondary }}>O ponto começa no passo 1 (Identificar). Depois ele avança pelos cinco passos: {PASSO_NOME.join(", ")}.</p>
      <div style={st.filtros}>
        <Campo label="Responsável (equipe do RH)" minWidth={220}>
          <select style={st.input} value={f.responsavel_id} onChange={(e) => setF({ ...f, responsavel_id: e.target.value })}>
            <option value="">Ainda sem responsável</option>
            {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Prazo" minWidth={160}><input style={st.input} type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></Campo>
      </div>
      <Campo label="O que foi combinado (opcional)"><textarea style={st.textarea} maxLength={2000} value={f.combinado} onChange={(e) => setF({ ...f, combinado: e.target.value })} placeholder="Ex.: conversar com o novato e com a supervisão até sexta" /></Campo>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={abrir}>Abrir ponto de atenção</button>
        {onCancelar ? <button type="button" style={st.btnGhost} onClick={onCancelar}>Cancelar</button> : null}
      </div>
    </div>
  );
}

export function PontoCard({ ponto, equipe, onMudou }) {
  const aberto = ["aberto", "em_andamento"].includes(ponto.status);
  const [f, setF] = useState({ responsavel_id: ponto.responsavel_id ? String(ponto.responsavel_id) : "", prazo: ponto.prazo ? String(ponto.prazo).slice(0, 10) : "", combinado: ponto.combinado || "" });
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);

  const agir = async (corpo, ok) => {
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try { await enviar(`/rh/canguru/pontos/${ponto.id}`, "PUT", corpo); setMsg({ tipo: "ok", texto: ok }); await onMudou(); return true; }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível salvar." }); return false; }
    finally { setOcupado(false); }
  };
  const salvarDados = () => agir({ responsavel_id: f.responsavel_id ? Number(f.responsavel_id) : null, prazo: f.prazo || null, combinado: f.combinado.trim() || null }, "Dados do ponto salvos.");
  const registrarNota = async () => { if (await agir({ nota: nota.trim() }, "Nota registrada.")) setNota(""); };

  return (
    <div style={{ border: `1px solid ${aberto ? "#f9a8d4" : colors.border}`, borderRadius: 12, padding: 14, background: aberto ? "#fff" : "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Ponto de atenção · {STATUS_PONTO[ponto.status] || ponto.status}</strong>
        <span style={{ fontSize: 12, color: colors.textMuted }}>Aberto em {fmtDataHora(ponto.aberto_em)}{ponto.aberto_por_nome ? ` por ${ponto.aberto_por_nome}` : ""}{ponto.resolvido_em ? ` · encerrado em ${fmtDataHora(ponto.resolvido_em)}` : ""}</span>
      </div>
      {msg.texto ? <div style={msg.tipo === "ok" ? st.ok : st.erro}>{msg.texto}</div> : null}

      <ol aria-label="Os cinco passos" style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PASSO_NOME.map((nome, i) => {
          const n = i + 1; const atual = ponto.passo === n; const feito = ponto.passo > n;
          return (
            <li key={nome}>
              <button type="button" disabled={!aberto || ocupado || atual} onClick={() => agir({ passo: n }, `Passo ${n}: ${nome}.`)} aria-current={atual ? "step" : undefined}
                style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${atual ? COR_RH : colors.border}`, background: atual ? COR_RH : feito ? "#fce7f3" : "#fff", color: atual ? "#fff" : feito ? "#9d174d" : colors.textSecondary, fontWeight: 800, fontSize: 12, cursor: aberto && !atual ? "pointer" : "default" }}>
                {feito ? "✓ " : ""}{n}. {nome}
              </button>
            </li>
          );
        })}
      </ol>

      {aberto ? (
        <>
          <div style={st.filtros}>
            <Campo label="Responsável" minWidth={200}>
              <select style={st.input} value={f.responsavel_id} onChange={(e) => setF({ ...f, responsavel_id: e.target.value })}>
                <option value="">Sem responsável</option>
                {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Prazo" minWidth={150}><input style={st.input} type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></Campo>
          </div>
          <Campo label="Combinado"><textarea style={st.textarea} maxLength={2000} value={f.combinado} onChange={(e) => setF({ ...f, combinado: e.target.value })} /></Campo>
          <div style={{ marginTop: 8 }}><button type="button" style={st.btnGhost} disabled={ocupado} onClick={salvarDados}>Salvar dados</button></div>
          <div style={{ marginTop: 12 }}>
            <Campo label="Registrar uma nota no histórico"><textarea style={{ ...st.textarea, minHeight: 56 }} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: conversei com a supervisora; ela vai ajustar a escala" /></Campo>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={{ ...st.btnGhost, opacity: nota.trim() ? 1 : 0.5 }} disabled={ocupado || !nota.trim()} onClick={registrarNota}>Registrar nota</button>
              <button type="button" style={{ ...st.btn, background: "#16a34a" }} disabled={ocupado} onClick={() => agir({ status: "resolvido" }, "Ponto resolvido.")}>Marcar como resolvido</button>
              <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => agir({ status: "arquivado" }, "Ponto arquivado.")}>Arquivar</button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>
          {ponto.combinado ? <p style={{ margin: "0 0 8px" }}>Combinado: {ponto.combinado}</p> : null}
          <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => agir({ status: "aberto" }, "Ponto reaberto.")}>Reabrir</button>
        </div>
      )}

      {ponto.historico?.length ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 800, color: colors.textSecondary }}>Histórico ({ponto.historico.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {[...ponto.historico].reverse().map((h) => <li key={h.id} style={{ marginBottom: 3 }}><span style={{ color: colors.textMuted }}>{fmtDataHora(h.created_at)} · {h.usuario_nome || "—"}:</span> {h.texto}</li>)}
          </ul>
        </details>
      ) : null}
      {ponto.prazo ? <div style={{ marginTop: 8, fontSize: 11.5, color: colors.textMuted }}>Prazo: {fmtDia(ponto.prazo)}</div> : null}
    </div>
  );
}
