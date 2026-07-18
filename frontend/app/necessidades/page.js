"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, radius } from "../../lib/theme";

const STATUS_STYLE = {
  aberta: { background: colors.infoLight, color: "#0369a1", label: "Aberta" },
  em_atendimento: { background: colors.warningLight, color: colors.warningText, label: "Em atendimento" },
  atendida: { background: colors.successLight, color: colors.successText, label: "Atendida" },
  atrasada: { background: colors.dangerLight, color: colors.dangerText, label: "Atrasada" },
  cancelada: { background: colors.neutralLight, color: colors.neutral, label: "Cancelada" },
};

function badgeStatus(status) {
  const cfg = STATUS_STYLE[status] || STATUS_STYLE.aberta;
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: radius.pill, fontSize: 11, fontWeight: 700, background: cfg.background, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

export default function NecessidadesPage() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const [form, setForm] = useState({ cliente: "", tema: "", horas_necessarias: "", prazo: "", prioridade: "media", origem: "", observacoes: "" });
  const [salvando, setSalvando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]);

  async function carregar() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      const resposta = await apiFetch(`/necessidades?${params.toString()}`);
      setItens(Array.isArray(resposta?.itens) ? resposta.itens : []);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar necessidades.");
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    if (!form.cliente.trim() || !form.tema.trim()) return;
    try {
      setSalvando(true);
      await apiFetch("/necessidades", {
        method: "POST",
        body: JSON.stringify({
          cliente: form.cliente.trim(),
          tema: form.tema.trim(),
          horas_necessarias: Number(form.horas_necessarias) || 0,
          prazo: form.prazo || null,
          prioridade: form.prioridade,
          origem: form.origem.trim() || null,
          observacoes: form.observacoes.trim() || null,
        }),
      });
      setForm({ cliente: "", tema: "", horas_necessarias: "", prazo: "", prioridade: "media", origem: "", observacoes: "" });
      setMostrarForm(false);
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao registrar necessidade.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(id) {
    if (!window.confirm("Cancelar esta necessidade?")) return;
    try {
      await apiFetch(`/necessidades/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelada" }) });
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao cancelar.");
    }
  }

  const resumo = useMemo(() => {
    return {
      total: itens.length,
      abertas: itens.filter((i) => i.status_calculado === "aberta").length,
      emAtendimento: itens.filter((i) => i.status_calculado === "em_atendimento").length,
      atrasadas: itens.filter((i) => i.status_calculado === "atrasada").length,
      atendidas: itens.filter((i) => i.status_calculado === "atendida").length,
    };
  }, [itens]);

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.textPrimary }}>Necessidades de Treinamento</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSecondary }}>
              Ponto de partida do ciclo: o que a operação precisa antes de qualquer turma existir.
            </p>
          </div>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            style={{ height: 36, padding: "0 16px", borderRadius: radius.sm, border: "none", background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {mostrarForm ? "Cancelar" : "+ Nova necessidade"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Total", value: resumo.total, color: colors.primary },
            { label: "Abertas", value: resumo.abertas, color: "#0369a1" },
            { label: "Em atendimento", value: resumo.emAtendimento, color: colors.warning },
            { label: "Atrasadas", value: resumo.atrasadas, color: colors.danger },
            { label: "Atendidas", value: resumo.atendidas, color: colors.success },
          ].map((c) => (
            <div key={c.label} style={{ flex: "1 1 120px", borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{c.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {mostrarForm && (
          <SectionCard title="Registrar necessidade">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <input placeholder="Cliente" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} style={inputStyle} />
              <input placeholder="Tema" value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} style={inputStyle} />
              <input placeholder="Horas necessárias" type="number" value={form.horas_necessarias} onChange={(e) => setForm({ ...form, horas_necessarias: e.target.value })} style={inputStyle} />
              <input placeholder="Prazo" type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} style={inputStyle} />
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} style={inputStyle}>
                <option value="baixa">Prioridade baixa</option>
                <option value="media">Prioridade média</option>
                <option value="alta">Prioridade alta</option>
              </select>
              <input placeholder="Origem (ex: pedido do supervisor X)" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} style={inputStyle} />
            </div>
            <textarea placeholder="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} style={{ ...inputStyle, width: "100%", marginTop: 10, fontFamily: "inherit" }} />
            <button
              onClick={criar}
              disabled={salvando || !form.cliente.trim() || !form.tema.trim()}
              style={{ marginTop: 10, height: 36, padding: "0 16px", borderRadius: radius.sm, border: "none", background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {salvando ? "Registrando..." : "Registrar necessidade"}
            </button>
          </SectionCard>
        )}

        <SectionCard title="Necessidades registradas">
          <div style={{ marginBottom: 12 }}>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={inputStyle}>
              <option value="">Todos os status</option>
              <option value="aberta">Aberta</option>
              <option value="em_atendimento">Em atendimento</option>
              <option value="atendida">Atendida</option>
              <option value="atrasada">Atrasada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          {erro && <p style={{ fontSize: 13, color: colors.dangerText }}>{erro}</p>}
          {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando...</p>}
          {!loading && itens.length === 0 && <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma necessidade registrada ainda.</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {itens.map((item) => (
              <div key={item.id} style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{item.tema}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary }}>{item.cliente}{item.prazo ? ` · prazo ${formatDateBR(item.prazo)}` : ""}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {badgeStatus(item.status_calculado)}
                    {item.status_calculado !== "cancelada" && item.status_calculado !== "atendida" && (
                      <button onClick={() => cancelar(item.id)} style={{ fontSize: 11, color: colors.dangerText, background: "none", border: "none", cursor: "pointer" }}>cancelar</button>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                    <span>{item.horas_atendidas}h de {item.horas_necessarias || "?"}h · {item.turmas_vinculadas} turma(s)</span>
                  </div>
                  {item.horas_necessarias > 0 && (
                    <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min((item.horas_atendidas / item.horas_necessarias) * 100, 100)}%`, background: colors.primary }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const inputStyle = { padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 };
