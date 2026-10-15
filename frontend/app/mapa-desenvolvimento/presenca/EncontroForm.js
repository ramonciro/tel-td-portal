"use client";

import { useState } from "react";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { btnPrimario, btnSecundario, btnPerigo, entrada, rotulo, gradeForm, painel, dica, acoes } from "./estilos";

function normalizar(v) {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Criar / editar / duplicar / excluir um encontro da jornada.
export default function EncontroForm({ jornadaId, etapas, trilhas, onGerenciarTrilhas, padrao, encontro, presencasDoEncontro, onFechar, onSalvou, setErro, setAviso }) {
  const novo = !encontro;
  const [f, setF] = useState({
    titulo: encontro?.titulo || padrao?.titulo || "",
    data: encontro?.data || "",
    hora_inicio: encontro?.hora_inicio || "",
    carga_horaria: encontro ? String(encontro.carga_horaria) : "",
    etapa_id: encontro?.etapa_id ? String(encontro.etapa_id) : "",
    trilha_id: encontro?.trilha_id ? String(encontro.trilha_id) : padrao?.trilha_id ? String(padrao.trilha_id) : "",
    trilha_etapa_id: encontro?.trilha_etapa_id ? String(encontro.trilha_etapa_id) : padrao?.trilha_etapa_id ? String(padrao.trilha_etapa_id) : "",
    responsavel: encontro?.responsavel || "",
    observacao: encontro?.observacao || "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [dataCopia, setDataCopia] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const trilhaEscolhida = trilhas.find((t) => String(t.id) === f.trilha_id);
  const etapasDaTrilha = trilhaEscolhida?.etapas || [];

  // Trocar a trilha zera a etapa da trilha (cada etapa pertence a uma trilha só).
  function escolherTrilha(e) {
    setF({ ...f, trilha_id: e.target.value, trilha_etapa_id: "" });
  }

  // Escolher a etapa da trilha sugere o título do encontro quando ele ainda está vazio.
  function escolherEtapaDaTrilha(e) {
    const et = etapasDaTrilha.find((x) => String(x.id) === e.target.value);
    // Sugere também a etapa (porto) da jornada quando o nome bate com UMA só e o campo está vazio
    // (evita encontro "solto", que não aparece em Desenvolvimento por etapa).
    let etapaSugerida = f.etapa_id;
    if (!f.etapa_id && et) {
      const alvo = normalizar(et.titulo);
      const achadas = alvo.length >= 4 ? etapas.filter((x) => { const n = normalizar(x.nome); return n.length >= 4 && (n === alvo || n.includes(alvo) || alvo.includes(n)); }) : [];
      if (achadas.length === 1) etapaSugerida = String(achadas[0].id);
    }
    setF({ ...f, trilha_etapa_id: e.target.value, etapa_id: etapaSugerida, titulo: f.titulo || et?.titulo || "" });
  }

  // Ao escolher a etapa, sugere a trilha ligada a ela (se já estiver na jornada e o campo estiver vazio).
  function escolherEtapa(e) {
    const etapa = etapas.find((x) => String(x.id) === e.target.value);
    const sugerida = etapa?.trilha_id && trilhas.some((t) => t.id === etapa.trilha_id) ? String(etapa.trilha_id) : "";
    setF({ ...f, etapa_id: e.target.value, trilha_id: f.trilha_id || sugerida });
  }

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

  const corpo = () => ({ ...f, etapa_id: f.etapa_id || null, trilha_id: f.trilha_id || null, trilha_etapa_id: f.trilha_etapa_id || null, carga_horaria: f.carga_horaria.replace(",", ".") });

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
          Trilha — opcional
          <select style={entrada} value={f.trilha_id} onChange={escolherTrilha}>
            <option value="">Sem trilha</option>
            {trilhas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo}
              </option>
            ))}
          </select>
        </label>
        <label style={rotulo}>
          Etapa da trilha — opcional
          <select style={entrada} value={f.trilha_etapa_id} onChange={escolherEtapaDaTrilha} disabled={!f.trilha_id || etapasDaTrilha.length === 0}>
            <option value="">{!f.trilha_id ? "Escolha a trilha primeiro" : etapasDaTrilha.length === 0 ? "Esta trilha não tem etapas" : "Sem etapa definida"}</option>
            {etapasDaTrilha.map((x, i) => (
              <option key={x.id} value={x.id}>
                {i + 1}. {x.titulo}
              </option>
            ))}
          </select>
        </label>
        <label style={rotulo}>
          Etapa (porto) da jornada — opcional
          <select style={entrada} value={f.etapa_id} onChange={escolherEtapa}>
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
      <div style={dica}>
        A carga horária é o que vira “horas realizadas” para quem estiver presente. A presença só pode ser lançada a partir da data do encontro.{" "}
        {trilhas.length === 0 ? "Esta jornada ainda não tem trilhas vinculadas. " : "Não achou a trilha? "}
        <button type="button" onClick={onGerenciarTrilhas} style={{ background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
          Vincular trilhas à jornada
        </button>
        .
      </div>
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
