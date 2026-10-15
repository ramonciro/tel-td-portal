"use client";

import { useState } from "react";
import { colors } from "../../../lib/theme";
import { apiFetch } from "../../../services/api";
import { STATUS_ETAPA, AVALIACAO, btnPrimario, btnSecundario, btnPerigo, entrada, rotulo, gradeForm, painel, dica, acoes, selo, fmtNum } from "./estilos";

// Editor de uma célula (pessoa × etapa): status, data de conclusão, avaliação,
// nota e observação. Só a Metodologia grava (a rota exige o perfil).
export default function EditorEtapa({ participante, etapa, celula, hoje, onFechar, onSalvou, setErro, setAviso }) {
  const [form, setForm] = useState({
    status: celula.status || "nao_iniciada",
    data_conclusao: celula.data_conclusao || "",
    avaliacao: celula.avaliacao || "",
    nota: celula.nota === null || celula.nota === undefined ? "" : String(celula.nota).replace(".", ","),
    observacao: celula.observacao || "",
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar(corpo) {
    setSalvando(true);
    setErro("");
    try {
      await apiFetch(`/jornada-desenvolvimento/participantes/${participante.id}/etapas/${etapa.id}`, {
        method: "PUT",
        body: JSON.stringify(corpo),
      });
      setAviso(corpo.status === "nao_iniciada" && !corpo.avaliacao && !corpo.nota && !corpo.observacao ? "Lançamento removido." : "Etapa salva.");
      onSalvou();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a etapa.");
    } finally {
      setSalvando(false);
    }
  }

  const concluida = form.status === "concluida";

  return (
    <div style={painel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>
          {participante.nome} — {etapa.nome}
        </strong>
        <span style={{ fontSize: 12, color: colors.textSecondary }}>
          {celula.encontros
            ? `${celula.encontros} encontro(s) · ${fmtNum(celula.horas)} h de presença${celula.pct_presenca === null ? "" : ` · ${fmtNum(celula.pct_presenca)}% de presença`}`
            : "Nenhum encontro vinculado a esta etapa (vincule em Encontros e presença)"}
        </span>
      </div>

      {celula.sugestao && celula.sugestao !== form.status && (
        <div style={{ ...dica, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...selo, background: STATUS_ETAPA[celula.sugestao].bg, color: STATUS_ETAPA[celula.sugestao].cor }}>
            Sugestão pela presença: {STATUS_ETAPA[celula.sugestao].label}
          </span>
          <button
            type="button"
            style={{ ...btnSecundario, padding: "4px 10px", fontSize: 12 }}
            onClick={() => setForm({ ...form, status: celula.sugestao, data_conclusao: celula.sugestao === "concluida" ? form.data_conclusao || hoje : "" })}
          >
            Usar sugestão
          </button>
        </div>
      )}

      <div style={gradeForm}>
        <label style={rotulo}>
          Status da etapa
          <select style={entrada} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value, data_conclusao: e.target.value === "concluida" ? form.data_conclusao || hoje : "" })}>
            {Object.entries(STATUS_ETAPA).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {concluida && (
          <label style={rotulo}>
            Data de conclusão
            <input style={entrada} type="date" max={hoje} value={form.data_conclusao} onChange={(e) => setForm({ ...form, data_conclusao: e.target.value })} />
          </label>
        )}
        <label style={rotulo}>
          Avaliação
          <select style={entrada} value={form.avaliacao} onChange={(e) => setForm({ ...form, avaliacao: e.target.value })}>
            <option value="">Sem avaliação</option>
            {Object.entries(AVALIACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label style={rotulo}>
          Nota (0 a 10, opcional)
          <input style={entrada} inputMode="decimal" placeholder="Ex.: 8,5" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
        </label>
      </div>
      <label style={rotulo}>
        Observação (até 500 caracteres)
        <textarea style={{ ...entrada, minHeight: 64, resize: "vertical" }} maxLength={500} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
      </label>
      <div style={dica}>A avaliação e a observação são visíveis só para Metodologia, Coordenação e Super Admin.</div>
      <div style={acoes}>
        <button style={btnPrimario} disabled={salvando} onClick={() => salvar(form)}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        {celula.lancado && (
          <button style={btnPerigo} disabled={salvando} onClick={() => salvar({ status: "nao_iniciada", data_conclusao: "", avaliacao: "", nota: "", observacao: "" })}>
            Limpar lançamento
          </button>
        )}
        <button style={btnSecundario} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
