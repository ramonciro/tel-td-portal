"use client";

// Regras do Projeto Canguru (12/11/2026): dias de cada avaliação, alerta de prazo, o que conta como sinal de atenção,
// limites de risco, mínimo por grupo, cargos da operação e palavras que marcam um relato como prioritário. Só o coordenador do RH altera.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";
import { st, Campo, perfilRh, PERFIL_COORD, COR_RH } from "./RhUi";

const CAMPOS_NUM = ["dia_aval_1", "dia_aval_2", "dia_aval_3", "alerta_dias", "tolerancia_dias", "nota_sinal_max", "risco_moderado_min", "risco_alto_min", "min_grupo"];

export default function CangaruRegras() {
  const coord = perfilRh() === PERFIL_COORD;
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    apiFetch("/rh/canguru/config").then((r) => {
      setCfg(r);
      const novo = { termos_operacao: r.termos_operacao || "", termos_prioritarios: r.termos_prioritarios || "", cobranca_a_partir_de: r.cobranca_a_partir_de ? String(r.cobranca_a_partir_de).slice(0, 10) : "" };
      CAMPOS_NUM.forEach((k) => { novo[k] = String(r[k] ?? ""); });
      setF(novo);
    }).catch((e) => setMsg({ tipo: "erro", texto: e.message || "Não foi possível carregar as regras do Canguru." }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const corpo = { termos_operacao: f.termos_operacao, termos_prioritarios: f.termos_prioritarios, cobranca_a_partir_de: f.cobranca_a_partir_de || null };
      CAMPOS_NUM.forEach((k) => { corpo[k] = Number(f[k]); });
      await apiFetch("/rh/canguru/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      setMsg({ tipo: "ok", texto: "Regras do Canguru salvas. Valem na hora para o acompanhamento e o resultado." });
      carregar();
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível salvar." }); }
    finally { setOcupado(false); }
  };

  const num = (k, label, extra = {}, minWidth = 150, dica) => (
    <Campo label={label} minWidth={minWidth} dica={dica}><input style={st.input} type="number" step="1" value={f[k]} disabled={!coord} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></Campo>
  );

  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <h3 style={st.cardTitle}>Projeto Canguru: regras do acompanhamento</h3>
      {msg.texto ? <div style={msg.tipo === "ok" ? st.ok : st.erro}>{msg.texto}</div> : null}
      {!f ? <p style={st.vazio}>Carregando…</p> : (
        <>
          <div style={st.filtros}>
            {num("dia_aval_1", "Dia da 1ª avaliação", { min: 1 })}
            {num("dia_aval_2", "Dia da 2ª avaliação", { min: 1 })}
            {num("dia_aval_3", "Dia da 3ª avaliação", { min: 1 })}
            {num("alerta_dias", "Avisar quantos dias antes", { min: 0, max: 30 }, 170, "Etapa “vencendo”")}
            {num("tolerancia_dias", "Tolerância após o prazo (dias)", { min: 0, max: 30 }, 190)}
          </div>
          <div style={st.filtros}>
            {num("nota_sinal_max", "Nota que já vira sinal (até)", { min: 0, max: 4 }, 190, "Escala de 0 a 5")}
            {num("risco_moderado_min", "Risco moderado a partir de (%)", { min: 1, max: 99 }, 200)}
            {num("risco_alto_min", "Risco alto a partir de (%)", { min: 2, max: 100 }, 190)}
            {num("min_grupo", `Mínimo de novatos por grupo (não menos que ${cfg.minimo_grupo_absoluto})`, { min: cfg.minimo_grupo_absoluto }, 260)}
            <Campo label="Cobrar respostas a partir de" minWidth={170} dica="Em branco: a data da primeira resposta importada"><input style={st.input} type="date" value={f.cobranca_a_partir_de} disabled={!coord} onChange={(e) => setF({ ...f, cobranca_a_partir_de: e.target.value })} /></Campo>
          </div>
          <Campo label="Cargos da operação (palavras separadas por vírgula)" dica="Quem não tiver uma dessas palavras no cargo fica de fora, a menos que se marque “incluir cargos fora da operação” na importação."><input style={st.input} value={f.termos_operacao} disabled={!coord} maxLength={500} onChange={(e) => setF({ ...f, termos_operacao: e.target.value })} /></Campo>
          <div style={{ height: 10 }} />
          <Campo label="Palavras que marcam um relato como prioritário (separadas por vírgula, sem acento)" dica="Servem para colocar relatos de saúde e segurança no topo da fila. Quem decide o que fazer é sempre uma pessoa do RH."><textarea style={st.textarea} value={f.termos_prioritarios} disabled={!coord} maxLength={2000} onChange={(e) => setF({ ...f, termos_prioritarios: e.target.value })} /></Campo>
          {coord ? <div style={{ marginTop: 12 }}><button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={salvar}>Salvar regras do Canguru</button></div> : <p style={{ fontSize: 12, color: colors.textMuted }}>Só o coordenador do RH altera as regras.</p>}
        </>
      )}
    </div>
  );
}
