"use client";

import { useState } from "react";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { btnPrimario, btnSecundario, btnPerigo, entrada, rotulo, gradeForm, painel, dica, acoes } from "./estilos";

// Criar / editar / duplicar / excluir um encontro da jornada.
export default function EncontroForm({ jornadaId, etapas, encontro, presencasDoEncontro, onFechar, onSalvou, setErro, setAviso }) {
  const novo = !encontro;
  const [f, setF] = useState({
    titulo: encontro?.titulo || "",
    data: encontro?.data || "",
    hora_inicio: encontro?.hora_inicio || "",
    carga_horaria: encontro ? String(encontro.carga_horaria) : "",
    etapa_id: encontro?.etapa_id ? String(encontro.etapa_id) : "",
    responsavel: encontro?.responsavel || "",
    observacao: encontro?.observacao || "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [dataCopia, setDataCopia] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function executar(fn, sucesso) {
    setErro("");
    setAviso("");
    try {
      setOcupado(true);
      await fn();
      if (sucesso) setAviso(sucesso);
      onSalvou();
    } catch (e) {
      setErro(e.message || "Erro ao salvar o encontro.");
    } finally {
      setOcupado(false);
    }
  }

  const corpo = () => ({ ...f, etapa_id: f.etapa_id || null, carga_horaria: f.carga_horaria.replace(",", ".") });

  const salvar = () =>
    executar(
      () =>
        novo
          ? apiFetch(`/jornada-presenca/jornadas/${jornadaId}/encontros`, { method: "POST", body: JSON.stringify(corpo()) })
          : apiFetch(`/jornada-presenca/encontros/${encontro.id}`, { method: "PUT", body: JSON.stringify(corpo()) }),
      novo ? "Encontro criado." : "Encontro atualizado."
    );

  const duplicar = () =>
    executar(
      () => apiFetch(`/jornada-presenca/encontros/${encontro.id}/duplicar`, { method: "POST", body: JSON.stringify({ data: dataCopia }) }),
      "Encontro duplicado (sem presenças)."
    );

  function excluir() {
    const n = presencasDoEncontro || 0;
    const msg = n
      ? `Excluir o encontro "${encontro.titulo}"? As ${n} presença(s) lançada(s) nele serão apagadas junto. Isso não pode ser desfeito.`
      : `Excluir o encontro "${encontro.titulo}"?`;
    if (!window.confirm(msg)) return;
    executar(() => apiFetch(`/jornada-presenca/encontros/${encontro.id}`, { method: "DELETE" }), "Encontro excluído.");
  }

  return (
    <div style={painel}>
      <strong style={{ fontSize: 14 }}>{novo ? "Novo encontro" : `Editar encontro — ${encontro.titulo}`}</strong>
      <div style={gradeForm}>
        <label style={{ ...rotulo, gridColumn: "span 2" }}>
          Título
          <input style={entrada} value={f.titulo} maxLength={200} onChange={set("titulo")} placeholder="Ex.: Prevenção ao assédio moral — turma 1" />
        </label>
        <label style={rotulo}>
          Data
          <input style={entrada} type="date" value={f.data} onChange={set("data")} />
        </label>
        <label style={rotulo}>
          Horário (opcional)
          <input style={entrada} type="time" value={f.hora_inicio} onChange={set("hora_inicio")} />
        </label>
        <label style={rotulo}>
          Carga horária (h)
          <input style={entrada} inputMode="decimal" value={f.carga_horaria} onChange={set("carga_horaria")} placeholder="Ex.: 4" />
        </label>
        <label style={rotulo}>
          Etapa (porto) — opcional
          <select style={entrada} value={f.etapa_id} onChange={set("etapa_id")}>
            <option value="">Sem etapa</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={rotulo}>
          Responsável / instrutor
          <input style={entrada} value={f.responsavel} maxLength={150} onChange={set("responsavel")} />
        </label>
        <label style={{ ...rotulo, gridColumn: "1 / -1" }}>
          Observação (opcional)
          <input style={entrada} value={f.observacao} maxLength={255} onChange={set("observacao")} />
        </label>
      </div>
      <div style={dica}>A carga horária é o que vira “horas realizadas” para quem estiver presente. A presença só pode ser lançada a partir da data do encontro.</div>
      <div style={acoes}>
        <button style={btnPrimario} disabled={ocupado} onClick={salvar}>
          {novo ? "Criar encontro" : "Salvar alterações"}
        </button>
        <button style={btnSecundario} disabled={ocupado} onClick={onFechar}>
          Fechar
        </button>
      </div>
      {!novo && (
        <div style={{ ...acoes, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <label style={{ ...rotulo, flexDirection: "row", display: "flex", alignItems: "center", gap: 8 }}>
            Duplicar para a data
            <input style={{ ...entrada, width: 170 }} type="date" value={dataCopia} onChange={(e) => setDataCopia(e.target.value)} />
          </label>
          <button style={btnSecundario} disabled={ocupado || !dataCopia} onClick={duplicar}>
            Duplicar
          </button>
          <button style={{ ...btnPerigo, marginLeft: "auto" }} disabled={ocupado} onClick={excluir}>
            Excluir encontro
          </button>
        </div>
      )}
    </div>
  );
}
