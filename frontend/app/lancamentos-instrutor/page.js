"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors } from "../../lib/theme";

/* ─── opções fixas (mesmas da planilha operacional) ─────────────────── */
const CANAIS = [
  "SAC/0800/Chat",
  "Central Cartões",
  "Retenção",
  "Qualidade",
  "Reclame Aqui / RA",
  "Redes Sociais / NPS",
  "Outro",
];

const STATUS_CFG = {
  programado: { bg: "#e0f2fe", cor: "#0369a1", label: "Programado" },
  realizado:  { bg: colors.successLight, cor: colors.successText, label: "Realizado" },
  parcial:    { bg: colors.warningLight, cor: colors.warningText, label: "Parcial" },
  cancelado:  { bg: "#f1f5f9", cor: "#94a3b8", label: "Cancelado" },
};

function fmt(n) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(n || 0)); }

function emptyForm() {
  return {
    data_inicio: "", data_fim: "", tema: "", tipo_atividade: "", canal: "",
    hora_inicio: "", hora_fim: "", hc_programado: "", hc_realizado: "",
    status: "programado", local: "", observacoes: "",
  };
}

function LancamentoRow({ item, podeEditar, onEditar, onExcluir }) {
  const sCfg = STATUS_CFG[item.status] || STATUS_CFG.programado;
  return (
    <tr style={{ borderBottom: "1px solid #eef2f7" }}>
      <td style={td}>{String(item.data_inicio).slice(0, 10)}{item.data_fim && item.data_fim !== item.data_inicio ? ` → ${String(item.data_fim).slice(0,10)}` : ""}</td>
      <td style={{ ...td, fontWeight: 600 }}>{item.tema}</td>
      <td style={td}>{item.canal || "—"}</td>
      <td style={td}>{item.celula || "—"}</td>
      <td style={{ ...td, textAlign: "center" }}>{fmt(item.ch_horas)}h</td>
      <td style={{ ...td, textAlign: "center" }}>{fmt(item.hc_programado)}</td>
      <td style={{ ...td, textAlign: "center" }}>{fmt(item.hc_realizado)}</td>
      <td style={td}><span style={{ ...badge, background: sCfg.bg, color: sCfg.cor }}>{sCfg.label}</span></td>
      {podeEditar && (
        <td style={{ ...td, whiteSpace: "nowrap" }}>
          <button style={btnLink} onClick={() => onEditar(item)}>Editar</button>
          <button style={{ ...btnLink, color: colors.dangerText }} onClick={() => onExcluir(item.id)}>Excluir</button>
        </td>
      )}
    </tr>
  );
}

export default function LancamentosInstrutorPage() {
  const [user] = useState(() => getStoredUser());
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const r = await apiFetch("/atividades-instrutor");
      setItens(Array.isArray(r?.itens) ? r.itens : []);
    } catch (e) { setErro(e.message || "Erro ao carregar lançamentos."); }
    finally { setLoading(false); }
  }

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  function editar(item) {
    setEditandoId(item.id);
    setForm({
      data_inicio: String(item.data_inicio).slice(0, 10),
      data_fim: item.data_fim ? String(item.data_fim).slice(0, 10) : "",
      tema: item.tema || "", tipo_atividade: item.tipo_atividade || "", canal: item.canal || "",
      hora_inicio: item.hora_inicio ? String(item.hora_inicio).slice(0, 5) : "",
      hora_fim: item.hora_fim ? String(item.hora_fim).slice(0, 5) : "",
      hc_programado: String(item.hc_programado ?? ""), hc_realizado: String(item.hc_realizado ?? ""),
      status: item.status || "programado", local: item.local || "", observacoes: item.observacoes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() { setEditandoId(null); setForm(emptyForm()); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.data_inicio || !form.tema.trim()) {
        throw new Error("Informe ao menos Data Início e Tema.");
      }
      const payload = { ...form, tema: form.tema.trim() };
      if (editandoId) {
        await apiFetch(`/atividades-instrutor/${editandoId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/atividades-instrutor", { method: "POST", body: JSON.stringify(payload) });
      }
      cancelarEdicao();
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao salvar lançamento."); }
    finally { setSalvando(false); }
  }

  async function excluir(id) {
    if (!window.confirm("Excluir este lançamento?")) return;
    try {
      await apiFetch(`/atividades-instrutor/${id}`, { method: "DELETE" });
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  const resumoMesAtual = useMemo(() => {
    const mesAtual = new Date().toISOString().slice(0, 7);
    const doMes = itens.filter((i) => String(i.mes_ref) === mesAtual);
    const chRealizada = doMes.reduce((acc, i) => acc + (String(i.status) === "cancelado" ? 0 : Number(i.hc_realizado || 0)), 0);
    const chProgramada = doMes.reduce((acc, i) => acc + Number(i.hc_programado || 0), 0);
    return {
      totalLancamentos: doMes.length,
      chRealizada,
      chProgramada,
      aderencia: chProgramada > 0 ? Math.round((chRealizada / chProgramada) * 100) : 0,
    };
  }, [itens]);

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Registro de demanda"
          title="Meus Lançamentos"
          subtitle="Registre suas atividades (CH programada x realizada). Não lance aqui uma turma que já existe formalmente no sistema — ela já entra na sua CH efetiva automaticamente."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard title="Lançamentos no mês" value={resumoMesAtual.totalLancamentos} accent={colors.primary} />
        <StatCard title="CH programada (mês)" value={`${fmt(resumoMesAtual.chProgramada)}h`} accent={colors.info} />
        <StatCard title="CH realizada (mês)" value={`${fmt(resumoMesAtual.chRealizada)}h`} accent={colors.success} />
        <StatCard title="Aderência (mês)" value={`${resumoMesAtual.aderencia}%`} accent={colors.accent} />
      </div>

      {erro && <div style={errBox}>{erro}</div>}

      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>
          {editandoId ? "Editar lançamento" : "Nova atividade"}
        </div>
        <div style={grid}>
          <MF label="Data Início *"><input type="date" value={form.data_inicio} onChange={campo("data_inicio")} style={input} /></MF>
          <MF label="Data Fim"><input type="date" value={form.data_fim} onChange={campo("data_fim")} style={input} /></MF>
          <MF label="Tema / Treinamento *" full><input value={form.tema} onChange={campo("tema")} style={input} placeholder="O que foi feito" /></MF>
          <MF label="Tipo de Atividade"><input value={form.tipo_atividade} onChange={campo("tipo_atividade")} style={input} placeholder="Treinamento, coaching, suporte…" /></MF>
          <MF label="Canal / Célula">
            <select value={form.canal} onChange={campo("canal")} style={input}>
              <option value="">Selecione…</option>
              {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </MF>
          <MF label="Hora Início"><input type="time" value={form.hora_inicio} onChange={campo("hora_inicio")} style={input} /></MF>
          <MF label="Hora Fim"><input type="time" value={form.hora_fim} onChange={campo("hora_fim")} style={input} /></MF>
          <MF label="HC Programado (h)"><input type="number" step="0.5" value={form.hc_programado} onChange={campo("hc_programado")} style={input} placeholder="0" /></MF>
          <MF label="HC Realizado (h)"><input type="number" step="0.5" value={form.hc_realizado} onChange={campo("hc_realizado")} style={input} placeholder="0" /></MF>
          <MF label="Status">
            <select value={form.status} onChange={campo("status")} style={input}>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </MF>
          <MF label="Local"><input value={form.local} onChange={campo("local")} style={input} placeholder="Presencial / Online / sala" /></MF>
          <MF label="Observações" full>
            <textarea value={form.observacoes} onChange={campo("observacoes")} rows={2} style={{ ...input, height: "auto", resize: "vertical" }} />
          </MF>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          {editandoId && <button style={btnCancelar} onClick={cancelarEdicao}>Cancelar edição</button>}
          <button style={btnSalvar} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Lançar atividade"}
          </button>
        </div>
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>Histórico de lançamentos</div>
        {loading ? (
          <p style={{ color: "#64748b" }}>Carregando…</p>
        ) : itens.length === 0 ? (
          <p style={{ color: "#64748b" }}>Nenhum lançamento ainda. Use o formulário acima para registrar sua primeira atividade.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={th}>Data</th>
                  <th style={th}>Tema</th>
                  <th style={th}>Canal</th>
                  <th style={th}>Célula</th>
                  <th style={{ ...th, textAlign: "center" }}>CH (h)</th>
                  <th style={{ ...th, textAlign: "center" }}>Programado</th>
                  <th style={{ ...th, textAlign: "center" }}>Realizado</th>
                  <th style={th}>Status</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <LancamentoRow key={item.id} item={item} podeEditar onEditar={editar} onExcluir={excluir} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

/* ─── subcomponentes ─────────────────────────── */
function MF({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
      {children}
    </div>
  );
}

/* ─── estilos ─────────────────────────────────── */
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 8px 18px rgba(15,23,42,.04)" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 };
const input = { height: 38, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 13, width: "100%" };
const th = { padding: "8px 10px" };
const td = { padding: "8px 10px", fontSize: 13, color: "#334155" };
const badge = { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 };
const errBox = { background: colors.dangerLight, color: colors.dangerText, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13 };
const btnLink = { background: "none", border: "none", color: colors.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 6px" };
const btnSalvar = { background: colors.navy, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnCancelar = { background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
