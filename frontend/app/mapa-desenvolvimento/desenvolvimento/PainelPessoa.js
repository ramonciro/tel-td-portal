"use client";

import { useCallback, useEffect, useState } from "react";
import { colors, radius } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";
import { apiFetch } from "../../../services/api";
import { STATUS_ETAPA, AVALIACAO, TIPO_EVOLUCAO, FAROL_COR, btnPrimario, btnSecundario, btnPerigo, btnMini, entrada, rotulo, painel, dica, acoes, selo, fmtNum } from "./estilos";

// Painel da pessoa: horas, % da jornada, etapas e linha do tempo de evolução.
export default function PainelPessoa({ participanteId, hoje, onFechar, onMudou, setErro, setAviso }) {
  const [dados, setDados] = useState(null);
  const [nova, setNova] = useState({ tipo: "geral", data: hoje, texto: "" });
  const [editando, setEditando] = useState(null); // { id, tipo, data, texto }
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await apiFetch(`/jornada-desenvolvimento/participantes/${participanteId}/painel`));
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o painel da pessoa.");
    }
  }, [participanteId, setErro]);

  useEffect(() => {
    setDados(null);
    setEditando(null);
    carregar();
  }, [carregar]);

  async function criar() {
    setSalvando(true);
    setErro("");
    try {
      await apiFetch(`/jornada-desenvolvimento/participantes/${participanteId}/evolucao`, { method: "POST", body: JSON.stringify(nova) });
      setNova({ tipo: "geral", data: hoje, texto: "" });
      setAviso("Anotação registrada.");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e.message || "Não foi possível registrar a anotação.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizar() {
    setSalvando(true);
    setErro("");
    try {
      await apiFetch(`/jornada-desenvolvimento/evolucao/${editando.id}`, { method: "PUT", body: JSON.stringify({ tipo: editando.tipo, data: editando.data, texto: editando.texto }) });
      setEditando(null);
      setAviso("Anotação atualizada.");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e.message || "Não foi possível atualizar a anotação.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(nota) {
    if (!window.confirm("Excluir esta anotação de evolução? Esta ação não pode ser desfeita.")) return;
    setErro("");
    try {
      await apiFetch(`/jornada-desenvolvimento/evolucao/${nota.id}`, { method: "DELETE" });
      setAviso("Anotação excluída.");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e.message || "Não foi possível excluir a anotação.");
    }
  }

  if (!dados) return <div style={painel}>Carregando painel da pessoa...</div>;
  const p = dados.participante;
  if (!p) return <div style={painel}>Participante não encontrado.</div>;
  const farol = FAROL_COR[p.farol] || FAROL_COR.cinza;

  return (
    <div style={painel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 15 }}>{p.nome}</strong>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {[p.matricula && `Matrícula ${p.matricula}`, p.turma, p.cargo, p.supervisor && `Supervisor: ${p.supervisor}`].filter(Boolean).join(" · ") || dados.jornada.nome}
          </div>
        </div>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href={`/mapa-desenvolvimento/presenca/impressao/${dados.jornada.id}?participante=${participanteId}`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btnSecundario, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Relatório individual (PDF)
          </a>
          <button style={btnSecundario} onClick={onFechar}>
            Fechar
          </button>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Quadro rotulo="% da jornada" valor={p.pct_jornada === null ? "—" : `${fmtNum(p.pct_jornada)}%`} nota={p.base_pct_jornada === "horas" ? "horas ÷ carga prevista" : p.base_pct_jornada === "etapas" ? "etapas concluídas" : "sem carga prevista nem etapas"} />
        <Quadro rotulo="Horas realizadas" valor={`${fmtNum(p.horas)} h`} nota={dados.jornada.meta_horas ? `meta ${fmtNum(dados.jornada.meta_horas)} h` : "pela presença"} />
        <Quadro rotulo="Presença" valor={p.pct_presenca === null ? "—" : `${fmtNum(p.pct_presenca)}%`} nota={`mín. ${fmtNum(dados.jornada.presenca_minima_pct, 0)}%`} cor={farol.cor} />
        <Quadro rotulo="Etapas concluídas" valor={`${p.concluidas} de ${p.total_etapas}`} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Etapas</strong>
        {dados.etapas.length === 0 ? (
          <div style={dica}>Esta jornada ainda não tem etapas cadastradas (Mapa → Jornadas → Etapas).</div>
        ) : (
          dados.etapas.map((et) => {
            const c = p.etapas[et.id];
            const st = STATUS_ETAPA[c.status];
            return (
              <div key={et.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 10, background: "#fff", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 13 }}>{et.nome}</strong>
                  <span style={{ ...selo, background: st.bg, color: st.cor }}>{c.lancado ? st.label : "Sem lançamento"}</span>
                  {c.data_conclusao && <span style={{ fontSize: 12, color: colors.textSecondary }}>em {formatDateBR(c.data_conclusao)}</span>}
                  {c.avaliacao && <span style={{ ...selo, background: AVALIACAO[c.avaliacao].bg, color: AVALIACAO[c.avaliacao].cor }}>{AVALIACAO[c.avaliacao].label}{c.nota !== null ? ` · ${fmtNum(c.nota)}` : ""}</span>}
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  {c.encontros ? `${c.encontros} encontro(s) · ${fmtNum(c.horas)} h · ${c.pct_presenca === null ? "sem presença lançada" : `${fmtNum(c.pct_presenca)}% de presença`}` : "Sem encontros vinculados"}
                </div>
                {c.observacao && <div style={{ fontSize: 12.5, color: colors.textPrimary }}>{c.observacao}</div>}
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Evolução ({p.evolucao.length})</strong>
        <div style={{ display: "grid", gap: 8, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <label style={rotulo}>
              Tipo
              <select style={entrada} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })}>
                {Object.entries(TIPO_EVOLUCAO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={rotulo}>
              Data
              <input style={entrada} type="date" max={hoje} value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} />
            </label>
          </div>
          <textarea style={{ ...entrada, minHeight: 60, resize: "vertical" }} maxLength={2000} placeholder="Pontos fortes, dificuldades, plano de ação..." value={nova.texto} onChange={(e) => setNova({ ...nova, texto: e.target.value })} />
          <div style={acoes}>
            <button style={btnPrimario} disabled={salvando || !nova.texto.trim()} onClick={criar}>
              Registrar anotação
            </button>
            <span style={dica}>Visível só para Metodologia, Coordenação e Super Admin.</span>
          </div>
        </div>

        {p.evolucao.map((n) => {
          const tp = TIPO_EVOLUCAO[n.tipo] || TIPO_EVOLUCAO.geral;
          if (editando && editando.id === n.id) {
            return (
              <div key={n.id} style={{ display: "grid", gap: 8, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  <select style={entrada} value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}>
                    {Object.entries(TIPO_EVOLUCAO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input style={entrada} type="date" max={hoje} value={editando.data} onChange={(e) => setEditando({ ...editando, data: e.target.value })} />
                </div>
                <textarea style={{ ...entrada, minHeight: 60, resize: "vertical" }} maxLength={2000} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
                <div style={acoes}>
                  <button style={btnPrimario} disabled={salvando || !editando.texto.trim()} onClick={atualizar}>
                    Salvar
                  </button>
                  <button style={btnSecundario} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={n.id} style={{ borderLeft: `4px solid ${tp.cor}`, background: "#fff", border: `1px solid ${colors.border}`, borderLeftWidth: 4, borderLeftColor: tp.cor, borderRadius: radius.sm, padding: 10, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...selo, background: tp.bg, color: tp.cor }}>{tp.label}</span>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  {formatDateBR(n.data)}
                  {n.criado_por_nome ? ` · ${n.criado_por_nome}` : ""}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button style={btnMini} onClick={() => setEditando({ id: n.id, tipo: n.tipo, data: n.data, texto: n.texto })}>
                    Editar
                  </button>
                  <button style={{ ...btnMini, color: colors.dangerText }} onClick={() => excluir(n)}>
                    Excluir
                  </button>
                </span>
              </div>
              <div style={{ fontSize: 13, color: colors.textPrimary, whiteSpace: "pre-wrap" }}>{n.texto}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Quadro({ rotulo: r, valor, nota, cor }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".04em" }}>{r}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor || colors.textPrimary }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: colors.textSecondary }}>{nota}</div>}
    </div>
  );
}
