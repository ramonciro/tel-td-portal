"use client";

/**
 * app/subtipos/page.js — Ajuste pós-entrega do Pacote Salas (15/09/2026)
 *
 * Cadastro do catálogo de subtipo/subdivisão, usado tanto no formulário de
 * turma (Treinamentos) quanto em Ações de Desenvolvimento. Antes era uma
 * lista fixa no código (backend/src/lib/subtipos.js); Ramon pediu para
 * poder editar ele mesmo. Administrado por Coordenador e Assistente de
 * Treinamento (Super Admin sempre passa pelo bypass automático do
 * backend) — ver subtiposController.js.
 *
 * Sem hard delete: um subtipo já usado em alguma turma/ação não pode
 * desaparecer do banco (quebraria a leitura desses registros já
 * classificados) — "excluir" aqui é sempre desativação, igual a Salas.
 *
 * Nota: esta página ainda não está no menu do PortalShell — mesma decisão
 * pendente das outras telas novas deste pacote. Funciona por URL direta.
 */

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch, getStoredUser, hasSomeRole } from "../../services/api";
import { colors } from "../../lib/theme";

export default function SubtiposPage() {
  const [usuario, setUsuario] = useState(null);
  const [subtipos, setSubtipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const canManage = hasSomeRole(usuario, ["coordenador", "assistente_treinamento"]);

  async function carregar() {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch("/subtipos?incluir_inativos=1");
      setSubtipos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Não foi possível carregar os subtipos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
  }, []);

  const ativos = useMemo(() => subtipos.filter((s) => s.ativo), [subtipos]);
  const inativos = useMemo(() => subtipos.filter((s) => !s.ativo), [subtipos]);

  function abrirCriar() {
    setEditingId(null);
    setNome("");
    setError(""); setSuccess(""); setModalOpen(true);
  }

  function abrirEditar(subtipo) {
    setEditingId(subtipo.id);
    setNome(subtipo.nome || "");
    setError(""); setSuccess(""); setModalOpen(true);
  }

  async function salvar(event) {
    event.preventDefault();
    if (!nome.trim()) { setError("Informe o nome do subtipo."); return; }
    try {
      setSaving(true); setError(""); setSuccess("");
      const payload = { nome: nome.trim() };
      if (editingId) await apiFetch(`/subtipos/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/subtipos", { method: "POST", body: JSON.stringify(payload) });
      setSuccess(editingId ? "Subtipo atualizado com sucesso." : "Subtipo cadastrado com sucesso.");
      setModalOpen(false);
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível salvar o subtipo.");
    } finally {
      setSaving(false);
    }
  }

  async function desativar(subtipo) {
    if (!window.confirm(`Desativar "${subtipo.nome}"? Ele deixa de aparecer para novas turmas/ações, mas os registros que já usam esse subtipo continuam com o histórico.`)) return;
    try {
      setError("");
      await apiFetch(`/subtipos/${subtipo.id}`, { method: "DELETE" });
      setSuccess("Subtipo desativado.");
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível desativar o subtipo.");
    }
  }

  async function reativar(subtipo) {
    try {
      setError("");
      await apiFetch(`/subtipos/${subtipo.id}`, { method: "PUT", body: JSON.stringify({ ativo: 1 }) });
      setSuccess("Subtipo reativado.");
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível reativar o subtipo.");
    }
  }

  return (
    <PortalShell>
      <main style={page}>
        <PageHero
          eyebrow="Portal T&D · Conformidade"
          title="Subdivisão / Subtipo"
          subtitle="Lista usada para classificar turmas e Ações de Desenvolvimento — a mesma base usada na comprovação de horas (ex.: MPT)."
          actions={canManage ? <button type="button" style={createButton} onClick={abrirCriar}>+ Novo subtipo</button> : null}
        />

        {error && <div style={alertError}>{error}</div>}
        {success && <div style={alertSuccess}>{success}</div>}

        <section style={card}>
          <h2 style={sectionTitle}>Ativos ({ativos.length})</h2>
          {loading ? (
            <div style={emptyState}>Carregando...</div>
          ) : ativos.length === 0 ? (
            <div style={emptyState}>Nenhum subtipo ativo cadastrado.</div>
          ) : (
            <div style={grid}>
              {ativos.map((s) => (
                <div key={s.id} style={itemCard}>
                  <strong style={itemNome}>{s.nome}</strong>
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

        {canManage && inativos.length > 0 && (
          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={sectionTitle}>Desativados ({inativos.length})</h2>
            <div style={grid}>
              {inativos.map((s) => (
                <div key={s.id} style={{ ...itemCard, opacity: 0.6 }}>
                  <strong style={itemNome}>{s.nome}</strong>
                  <button type="button" style={ghostButton} onClick={() => reativar(s)}>Reativar</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {modalOpen && (
          <div style={modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && !saving && setModalOpen(false)}>
            <div style={modalBox} role="dialog" aria-modal="true">
              <h2 style={modalTitle}>{editingId ? "Editar subtipo" : "Novo subtipo"}</h2>
              <form onSubmit={salvar} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <label style={fieldWrap}>
                  <span style={fieldLabel}>Nome <b style={{ color: "#dc2626" }}>*</b></span>
                  <input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ergonomia" />
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
const itemCard = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1px solid #e5e7eb", background: "#f8fafc" };
const itemNome = { fontSize: 14, color: "#0f172a" };
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
