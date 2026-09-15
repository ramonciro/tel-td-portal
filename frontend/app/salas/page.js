"use client";

/**
 * app/salas/page.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Cadastro do catálogo global de salas (decisões 1-9 da proposta de
 * Agendamento de Salas): lista/cria/edita/desativa sala. É "global" de
 * propósito — sem coluna empresa_id, ver backend/src/controllers/
 * salasController.js — então esta tela sempre mostra o catálogo inteiro,
 * de qualquer cliente/tenant, pra quem tem acesso (coordenador e a
 * Assistente de Treinamento administram; os demais perfis autorizados a
 * criar/editar turma só leem, pra escolher sala no formulário).
 *
 * Não hard-deleta sala (decisão 3 — "sem reserva avulsa" nesta rodada):
 * "excluir" aqui é sempre desativação (ativo=0), que já o backend impõe.
 *
 * Nota: esta página ainda não está no menu do PortalShell — Ramon pediu
 * pra deixar a decisão de onde essas telas ficam (e se ficam) pro final
 * (ver claude/relatorio-... deste pacote). Ela funciona normalmente por
 * URL direta enquanto isso não é decidido.
 */

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch, getStoredUser, hasSomeRole } from "../../services/api";
import { colors } from "../../lib/theme";

const GRUPOS = [
  { value: "geral", label: "Geral" },
  { value: "sebrae", label: "Sebrae" },
];

function emptyForm() {
  return { nome: "", capacidade: "", grupo: "geral" };
}

export default function SalasPage() {
  const [usuario, setUsuario] = useState(null);
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Decisão 13: só a Assistente de Treinamento administra o catálogo de
  // salas (Super Admin também pode, via bypass automático do backend, mas
  // ele nunca chega nesta tela — PortalShell sempre redireciona pra
  // /admin). Coordenador e os demais perfis só consultam.
  const canManage = hasSomeRole(usuario, ["assistente_treinamento"]);

  async function carregar() {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch("/salas");
      setSalas(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Não foi possível carregar as salas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
  }, []);

  const ativas = useMemo(() => salas.filter((s) => s.ativo), [salas]);
  const inativas = useMemo(() => salas.filter((s) => !s.ativo), [salas]);

  function abrirCriar() {
    setEditingId(null);
    setForm(emptyForm());
    setError(""); setSuccess(""); setModalOpen(true);
  }

  function abrirEditar(sala) {
    setEditingId(sala.id);
    setForm({ nome: sala.nome || "", capacidade: sala.capacidade ?? "", grupo: sala.grupo || "geral" });
    setError(""); setSuccess(""); setModalOpen(true);
  }

  async function salvar(event) {
    event.preventDefault();
    if (!form.nome.trim()) { setError("Informe o nome da sala."); return; }
    try {
      setSaving(true); setError(""); setSuccess("");
      const payload = {
        nome: form.nome.trim(),
        capacidade: form.capacidade ? Number(form.capacidade) : null,
        grupo: form.grupo || "geral",
      };
      if (editingId) await apiFetch(`/salas/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/salas", { method: "POST", body: JSON.stringify(payload) });
      setSuccess(editingId ? "Sala atualizada com sucesso." : "Sala cadastrada com sucesso.");
      setModalOpen(false);
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível salvar a sala.");
    } finally {
      setSaving(false);
    }
  }

  async function desativar(sala) {
    if (!window.confirm(`Desativar a sala "${sala.nome}"? Ela deixa de aparecer para novas reservas, mas turmas já vinculadas continuam com o histórico.`)) return;
    try {
      setError("");
      await apiFetch(`/salas/${sala.id}`, { method: "DELETE" });
      setSuccess("Sala desativada.");
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível desativar a sala.");
    }
  }

  async function reativar(sala) {
    try {
      setError("");
      await apiFetch(`/salas/${sala.id}`, { method: "PUT", body: JSON.stringify({ ativo: 1 }) });
      setSuccess("Sala reativada.");
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível reativar a sala.");
    }
  }

  return (
    <PortalShell>
      <main style={page}>
        <PageHero
          eyebrow="Portal T&D · Agendamento"
          title="Salas"
          subtitle="Catálogo global de salas usado na reserva de horário das turmas — vale para todos os clientes."
          actions={canManage ? <button type="button" style={createButton} onClick={abrirCriar}>+ Nova sala</button> : null}
        />

        {error && <div style={alertError}>{error}</div>}
        {success && <div style={alertSuccess}>{success}</div>}

        <section style={card}>
          <h2 style={sectionTitle}>Ativas ({ativas.length})</h2>
          {loading ? (
            <div style={emptyState}>Carregando...</div>
          ) : ativas.length === 0 ? (
            <div style={emptyState}>Nenhuma sala ativa cadastrada.</div>
          ) : (
            <div style={grid}>
              {ativas.map((s) => (
                <div key={s.id} style={salaCard}>
                  <div>
                    <strong style={salaNome}>{s.nome}</strong>
                    <span style={salaMeta}>{s.grupo === "sebrae" ? "Sebrae" : "Geral"}{s.capacidade ? ` · até ${s.capacidade} pessoas` : ""}</span>
                  </div>
                  {canManage && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={ghostButton} onClick={() => abrirEditar(s)}>Editar</button>
                      <button type="button" style={dangerGhost} onClick={() => desativar(s)}>Desativar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {canManage && inativas.length > 0 && (
          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={sectionTitle}>Desativadas ({inativas.length})</h2>
            <div style={grid}>
              {inativas.map((s) => (
                <div key={s.id} style={{ ...salaCard, opacity: 0.6 }}>
                  <div>
                    <strong style={salaNome}>{s.nome}</strong>
                    <span style={salaMeta}>{s.grupo === "sebrae" ? "Sebrae" : "Geral"}</span>
                  </div>
                  <button type="button" style={ghostButton} onClick={() => reativar(s)}>Reativar</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {modalOpen && (
          <div style={modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && !saving && setModalOpen(false)}>
            <div style={modalBox} role="dialog" aria-modal="true">
              <h2 style={modalTitle}>{editingId ? "Editar sala" : "Nova sala"}</h2>
              <form onSubmit={salvar} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <label style={fieldWrap}>
                  <span style={fieldLabel}>Nome <b style={{ color: "#dc2626" }}>*</b></span>
                  <input style={inputStyle} value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Sala 7" />
                </label>
                <label style={fieldWrap}>
                  <span style={fieldLabel}>Capacidade (opcional)</span>
                  <input style={inputStyle} type="number" min="0" value={form.capacidade} onChange={(e) => setForm((p) => ({ ...p, capacidade: e.target.value }))} placeholder="Ex.: 20" />
                </label>
                <label style={fieldWrap}>
                  <span style={fieldLabel}>Grupo</span>
                  <select style={inputStyle} value={form.grupo} onChange={(e) => setForm((p) => ({ ...p, grupo: e.target.value }))}>
                    {GRUPOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                  <button type="button" disabled={saving} style={secondaryButton} onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button type="submit" disabled={saving} style={createButton}>{saving ? "Salvando..." : "Salvar"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </PortalShell>
  );
}

const page = { minHeight: "100vh", padding: "28px clamp(18px, 3vw, 42px) 48px", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" };
const createButton = { border: 0, background: colors.accent, color: "#fff", borderRadius: 12, padding: "12px 17px", fontWeight: 850, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButton = { border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 12, padding: "12px 17px", fontWeight: 800, fontSize: 13, cursor: "pointer" };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, marginTop: 16 };
const sectionTitle = { margin: "0 0 14px", fontSize: 16, fontWeight: 850, color: "#0f172a" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 };
const salaCard = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1px solid #e5e7eb", background: "#f8fafc" };
const salaNome = { display: "block", fontSize: 14, color: "#0f172a" };
const salaMeta = { display: "block", fontSize: 11, color: "#64748b", marginTop: 2 };
const ghostButton = { border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 9, padding: "7px 10px", fontWeight: 750, fontSize: 11, cursor: "pointer" };
const dangerGhost = { ...ghostButton, color: "#b91c1c", borderColor: "#fecaca" };
const emptyState = { padding: 24, textAlign: "center", color: "#64748b", fontSize: 13 };
const alertError = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
const alertSuccess = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: 12, fontWeight: 700 };
const modalBackdrop = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 18, background: "rgba(15,23,42,.62)", backdropFilter: "blur(5px)" };
const modalBox = { width: "min(420px,100%)", background: "#fff", borderRadius: 20, boxShadow: "0 30px 80px rgba(0,0,0,.28)", padding: 22 };
const modalTitle = { margin: 0, fontSize: 18, color: "#0f172a" };
const fieldWrap = { display: "grid", gap: 6 };
const fieldLabel = { fontSize: 11, fontWeight: 800, color: "#334155" };
const inputStyle = { width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 10, background: "#f8fafc", color: "#0f172a", padding: "0 11px", outline: "none", fontSize: 12.5 };
