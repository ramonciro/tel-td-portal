"use client";

// Agenda das salas (04/11/2026): sala × dia, de qualquer ambiente (o catálogo de salas é global).
// Cada turma ocupa a sala em todos os dias do período dela, no horário informado — é a mesma regra que
// o formulário da turma usa para barrar conflito, então a agenda nunca mostra "livre" onde o
// formulário vai bloquear. Bloqueios (manutenção, evento, reunião) aparecem com etiqueta própria.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function iso(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function deISO(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function somar(s, n) {
  const d = deISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function segunda(s) {
  const d = deISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
const br = (s) => deISO(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const hh = (s) => String(s || "").slice(0, 5);

function vazioForm(salas) {
  const hoje = iso(new Date());
  return { sala_id: salas[0] ? String(salas[0].id) : "", data_inicio: hoje, data_fim: hoje, diaInteiro: false, hora_inicio: "08:00", hora_fim: "18:00", motivo: "" };
}

export default function AgendaSalas({ podeBloquear = false }) {
  const [inicio, setInicio] = useState(() => segunda(iso(new Date())));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(vazioForm([]));
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");

  const fim = somar(inicio, 6);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somar(inicio, i)), [inicio]);
  const hoje = iso(new Date());

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");
      const r = await apiFetch(`/salas/agenda?data_inicio=${inicio}&data_fim=${somar(inicio, 6)}`);
      setDados({ salas: Array.isArray(r?.salas) ? r.salas : [], ocupacoes: Array.isArray(r?.ocupacoes) ? r.ocupacoes : [] });
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a agenda das salas.");
    } finally {
      setCarregando(false);
    }
  }, [inicio]);

  useEffect(() => { carregar(); }, [carregar]);

  const porCelula = useMemo(() => {
    const m = new Map();
    for (const o of dados?.ocupacoes || []) {
      const k = `${o.sala_id}|${String(o.data).slice(0, 10)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    }
    for (const v of m.values()) v.sort((a, b) => hh(a.hora_inicio).localeCompare(hh(b.hora_inicio)));
    return m;
  }, [dados]);

  const salas = dados?.salas || [];

  function abrirBloqueio(salaId, data) {
    const f = vazioForm(salas);
    if (salaId) f.sala_id = String(salaId);
    if (data) { f.data_inicio = data; f.data_fim = data; }
    setForm(f); setErroModal(""); setModal(true);
  }

  async function salvarBloqueio(ev) {
    ev.preventDefault();
    if (!form.sala_id) { setErroModal("Escolha a sala."); return; }
    if (!form.motivo.trim()) { setErroModal("Informe o motivo do bloqueio."); return; }
    if (!form.data_inicio || !form.data_fim) { setErroModal("Informe as datas."); return; }
    if (form.data_fim < form.data_inicio) { setErroModal("A data final não pode ser anterior à inicial."); return; }
    const hi = form.diaInteiro ? "00:00" : form.hora_inicio;
    const hf = form.diaInteiro ? "23:59" : form.hora_fim;
    if (!hi || !hf || hf <= hi) { setErroModal("O horário de fim precisa ser depois do início."); return; }
    try {
      setSalvando(true); setErroModal("");
      await apiFetch("/salas/bloqueios", {
        method: "POST",
        body: JSON.stringify({ sala_id: Number(form.sala_id), data_inicio: form.data_inicio, data_fim: form.data_fim, hora_inicio: hi, hora_fim: hf, motivo: form.motivo.trim() }),
      });
      setModal(false);
      setAviso("Sala bloqueada.");
      // Leva a agenda para a semana do bloqueio, para a pessoa ver o resultado.
      const alvo = segunda(form.data_inicio);
      if (alvo !== inicio) setInicio(alvo); else await carregar();
    } catch (e) {
      setErroModal(e.message || "Não foi possível bloquear a sala.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarBloqueio(o) {
    if (!window.confirm(`Cancelar o bloqueio "${o.tema}"? A sala volta a ficar livre nesse período.`)) return;
    try {
      setErro(""); setAviso("");
      await apiFetch(`/salas/bloqueios/${o.id}`, { method: "DELETE" });
      setAviso("Bloqueio cancelado.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível cancelar o bloqueio.");
    }
  }

  return (
    <section style={card} aria-label="Agenda das salas">
      <div style={topo}>
        <div>
          <h2 style={titulo}>Agenda das salas</h2>
          <div style={sub}>
            {br(inicio)} a {br(fim)} · todos os clientes. A turma ocupa a sala em todos os dias do período dela, no horário informado.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={botao} onClick={() => setInicio(somar(inicio, -7))} aria-label="Semana anterior">‹ Anterior</button>
          <button type="button" style={botao} onClick={() => setInicio(segunda(iso(new Date())))}>Hoje</button>
          <button type="button" style={botao} onClick={() => setInicio(somar(inicio, 7))} aria-label="Próxima semana">Próxima ›</button>
          {podeBloquear && salas.length > 0 && <button type="button" style={botaoPrincipal} onClick={() => abrirBloqueio()}>Bloquear sala</button>}
        </div>
      </div>

      {erro && <div style={alertaErro}>{erro}</div>}
      {aviso && <div style={alertaOk}>{aviso}</div>}

      <div style={legenda}>
        <span style={legItem}><span style={{ ...amostra, background: "#dbeafe", borderColor: "#93c5fd" }} /> Turma</span>
        <span style={legItem}><span style={{ ...amostra, background: "repeating-linear-gradient(45deg,#fef3c7,#fef3c7 4px,#fde68a 4px,#fde68a 8px)", borderColor: "#f59e0b" }} /> Bloqueio (sem turma)</span>
        <span style={legItem}><span style={{ ...amostra, background: "#fff", borderColor: "#cbd5e1" }} /> Livre</span>
      </div>

      {carregando && !dados ? (
        <div style={vazio}>Carregando a agenda...</div>
      ) : salas.length === 0 ? (
        <div style={vazio}>Nenhuma sala ativa cadastrada.</div>
      ) : (
        <div style={rolagem}>
          <table style={tabela}>
            <thead>
              <tr>
                <th style={{ ...th, ...colSala }}>Sala</th>
                {dias.map((d, i) => (
                  <th key={d} style={{ ...th, background: d === hoje ? "#eff6ff" : "#f8fafc", color: d === hoje ? colors.primary : "#334155" }}>
                    {DIAS[i]} <span style={{ fontWeight: 600, color: "#64748b" }}>{br(d)}</span>{d === hoje ? " · hoje" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salas.map((s) => (
                <tr key={s.id}>
                  <th scope="row" style={{ ...td, ...colSala, textAlign: "left", background: "#fff" }}>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>{s.nome}</strong>
                    <span style={{ display: "block", fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                      {s.grupo === "sebrae" ? "Sebrae" : "Geral"}{s.capacidade ? ` · ${s.capacidade} pessoas` : ""}
                    </span>
                  </th>
                  {dias.map((d) => {
                    const itens = porCelula.get(`${s.id}|${d}`) || [];
                    return (
                      <td key={d} style={{ ...td, background: d === hoje ? "#f8fbff" : "#fff" }}>
                        {itens.length === 0 ? (
                          podeBloquear ? (
                            <button type="button" style={livreBtn} onClick={() => abrirBloqueio(s.id, d)} title={`Bloquear ${s.nome} em ${br(d)}`}>Livre</button>
                          ) : (
                            <span style={livre}>Livre</span>
                          )
                        ) : (
                          <div style={{ display: "grid", gap: 4 }}>
                            {itens.map((o) => <Chip key={`${o.tipo}-${o.id}`} o={o} podeBloquear={podeBloquear} onCancelar={() => cancelarBloqueio(o)} />)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={backdrop} onMouseDown={(e) => e.target === e.currentTarget && !salvando && setModal(false)}>
          <div style={modalBox} role="dialog" aria-modal="true" aria-label="Bloquear sala">
            <h2 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>Bloquear sala</h2>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#64748b" }}>
              Reserva a sala sem turma (manutenção, evento, reunião). Durante o bloqueio nenhuma turma consegue reservar a sala nesse horário.
            </p>
            {erroModal && <div style={alertaErro}>{erroModal}</div>}
            <form onSubmit={salvarBloqueio} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={campo}>
                <span style={rotulo}>Sala <b style={{ color: "#dc2626" }}>*</b></span>
                <select style={entrada} value={form.sala_id} onChange={(e) => setForm((p) => ({ ...p, sala_id: e.target.value }))}>
                  {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={campo}>
                  <span style={rotulo}>Data de início <b style={{ color: "#dc2626" }}>*</b></span>
                  <input style={entrada} type="date" value={form.data_inicio} onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value, data_fim: p.data_fim < e.target.value ? e.target.value : p.data_fim }))} />
                </label>
                <label style={campo}>
                  <span style={rotulo}>Data de fim <b style={{ color: "#dc2626" }}>*</b></span>
                  <input style={entrada} type="date" value={form.data_fim} min={form.data_inicio} onChange={(e) => setForm((p) => ({ ...p, data_fim: e.target.value }))} />
                </label>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#334155", fontWeight: 700 }}>
                <input type="checkbox" checked={form.diaInteiro} onChange={(e) => setForm((p) => ({ ...p, diaInteiro: e.target.checked }))} />
                Dia inteiro (00:00 às 23:59)
              </label>
              {!form.diaInteiro && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={campo}>
                    <span style={rotulo}>Horário de início</span>
                    <input style={entrada} type="time" value={form.hora_inicio} onChange={(e) => setForm((p) => ({ ...p, hora_inicio: e.target.value }))} />
                  </label>
                  <label style={campo}>
                    <span style={rotulo}>Horário de fim</span>
                    <input style={entrada} type="time" value={form.hora_fim} onChange={(e) => setForm((p) => ({ ...p, hora_fim: e.target.value }))} />
                  </label>
                </div>
              )}
              <label style={campo}>
                <span style={rotulo}>Motivo <b style={{ color: "#dc2626" }}>*</b></span>
                <input style={entrada} maxLength={200} value={form.motivo} onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))} placeholder="Ex.: Manutenção do ar-condicionado" />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button type="button" disabled={salvando} style={botao} onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" disabled={salvando} style={botaoPrincipal}>{salvando ? "Salvando..." : "Bloquear"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Chip({ o, podeBloquear, onCancelar }) {
  const bloqueio = o.tipo === "bloqueio";
  const horario = `${hh(o.hora_inicio)}–${hh(o.hora_fim)}`;
  const periodo = o.periodo_inicio && o.periodo_fim && o.periodo_inicio !== o.periodo_fim ? `${br(o.periodo_inicio)} a ${br(o.periodo_fim)}` : "";
  const dica = [bloqueio ? "Bloqueio" : "Turma", o.cliente && !bloqueio ? o.cliente : "", o.tema, horario, periodo && `período ${periodo}`, o.instrutor && `Instrutor: ${o.instrutor}`, o.criado_por && `Por: ${o.criado_por}`].filter(Boolean).join(" · ");
  return (
    <div
      title={dica}
      style={{
        borderRadius: 8, padding: "5px 7px", fontSize: 11.5, lineHeight: 1.3, border: "1px solid",
        borderColor: bloqueio ? "#f59e0b" : "#93c5fd",
        background: bloqueio ? "repeating-linear-gradient(45deg,#fffbeb,#fffbeb 5px,#fef3c7 5px,#fef3c7 10px)" : "#eff6ff",
        color: "#0f172a",
      }}
    >
      <div style={{ fontWeight: 800, color: bloqueio ? "#92400e" : "#1e40af" }}>
        {bloqueio ? "Bloqueio · " : ""}{horario}
      </div>
      {!bloqueio && o.cliente && <div style={{ fontWeight: 700 }}>{o.cliente}</div>}
      <div style={{ color: "#334155", overflowWrap: "anywhere" }}>{o.tema}</div>
      {bloqueio && podeBloquear && (
        <button type="button" onClick={onCancelar} style={cancelaBtn}>Cancelar bloqueio</button>
      )}
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, marginTop: 16 };
const topo = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 };
const titulo = { margin: 0, fontSize: 16, fontWeight: 850, color: "#0f172a" };
const sub = { fontSize: 12.5, color: "#64748b", marginTop: 3, maxWidth: 560 };
const botao = { border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 10, padding: "9px 13px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" };
const botaoPrincipal = { border: 0, background: colors.accent, color: "#fff", borderRadius: 10, padding: "10px 15px", fontWeight: 850, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const legenda = { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#475569", margin: "4px 0 12px" };
const legItem = { display: "inline-flex", gap: 6, alignItems: "center" };
const amostra = { width: 14, height: 14, borderRadius: 4, border: "1px solid", display: "inline-block" };
const rolagem = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14 };
const tabela = { width: "100%", minWidth: 940, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" };
const th = { padding: "9px 8px", fontSize: 12, fontWeight: 800, textAlign: "center", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #eef2f7", background: "#f8fafc" };
const td = { padding: 6, verticalAlign: "top", borderBottom: "1px solid #eef2f7", borderRight: "1px solid #eef2f7" };
const colSala = { width: 130, position: "sticky", left: 0, zIndex: 1 };
const livre = { display: "block", textAlign: "center", fontSize: 11.5, color: "#94a3b8", padding: "10px 0" };
const livreBtn = { ...livre, width: "100%", border: "1px dashed transparent", background: "transparent", cursor: "pointer", borderRadius: 8 };
const cancelaBtn = { marginTop: 4, border: "1px solid #fcd34d", background: "#fff", color: "#92400e", borderRadius: 7, padding: "3px 7px", fontSize: 10.5, fontWeight: 800, cursor: "pointer" };
const vazio = { padding: 24, textAlign: "center", color: "#64748b", fontSize: 13, border: "1px dashed #e5e7eb", borderRadius: 14 };
const alertaErro = { margin: "10px 0", padding: "10px 12px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
const alertaOk = { margin: "10px 0", padding: "10px 12px", borderRadius: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: 12, fontWeight: 700 };
const backdrop = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 18, background: "rgba(15,23,42,.62)", backdropFilter: "blur(5px)" };
const modalBox = { width: "min(480px,100%)", maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 30px 80px rgba(0,0,0,.28)", padding: 22 };
const campo = { display: "grid", gap: 6 };
const rotulo = { fontSize: 11, fontWeight: 800, color: "#334155" };
const entrada = { width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 10, background: "#f8fafc", color: "#0f172a", padding: "0 11px", outline: "none", fontSize: 12.5 };
