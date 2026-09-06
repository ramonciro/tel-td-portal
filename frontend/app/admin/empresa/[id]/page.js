"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../../../services/api";
import { colors } from "../../../../lib/theme";

function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function UsageMeter({ label, atual, limite, icon }) {
  const pct    = limite > 0 ? Math.min(Math.round((atual / limite) * 100), 100) : 0;
  const ilimit = limite === 9999;
  const danger = !ilimit && pct >= 90;
  const warn   = !ilimit && pct >= 70;
  const cor    = danger ? "#ef4444" : warn ? "#f59e0b" : "#22c55e";
  return (
    <div style={meterCard}>
      <div style={meterTop}>
        <span style={meterIcon}>{icon}</span>
        <div>
          <div style={meterLabel}>{label}</div>
          <div style={meterVal}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#0B1220" }}>{atual}</span>
            <span style={{ fontSize: 14, color: "#9ca3af" }}>/{ilimit ? "∞" : limite}</span>
          </div>
        </div>
      </div>
      {!ilimit && (
        <div style={meterBar}>
          <div style={{ ...meterFill, width: `${pct}%`, background: cor }} />
        </div>
      )}
      {!ilimit && (
        <div style={{ fontSize: 12, color: danger ? "#ef4444" : "#9ca3af" }}>
          {pct}% utilizado
          {danger && " — próximo do limite!"}
        </div>
      )}
    </div>
  );
}

export default function EmpresaDetailPage() {
  const { id }   = useParams();
  const router   = useRouter();
  const user     = getStoredUser();

  const [empresa,  setEmpresa]  = useState(null);
  const [planos,   setPlanos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [editMode, setEditMode] = useState(false);
  const [form,     setForm]     = useState({});

  useEffect(() => {
    if (normalize(user?.perfil) !== "super_admin") { router.replace("/inicio"); return; }
    async function load() {
      try {
        const [e, p] = await Promise.all([
          apiFetch(`/admin/empresas/${id}`),
          apiFetch("/admin/planos"),
        ]);
        setEmpresa(e);
        setPlanos(p);
        setForm({
          nome: e.nome || "", codigo: e.codigo || "",
          plano: e.plano || "basico",
          contato_nome: e.contato_nome || "", contato_email: e.contato_email || "",
          contato_telefone: e.contato_telefone || "",
          subdomain: e.subdomain || "", observacoes: e.observacoes || "",
          custo_hora_treinamento: e.custo_hora_treinamento ?? "",
        });
      } catch (err) {
        setError(err.message || "Erro ao carregar empresa.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    if (!form.nome.trim()) { setError("Nome é obrigatório."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const saveRes = await apiFetch(`/admin/empresas/${id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });

      if (saveRes && !saveRes.ok && saveRes.message) {
        setError(saveRes.message); setSaving(false); return;
      }

      // Recarrega dados atualizados do servidor
      const updated = await apiFetch(`/admin/empresas/${id}`);
      setEmpresa(updated);

      // CRÍTICO: atualiza form com dados salvos para que a tela
      // reflita o estado real do banco (não apenas o estado local)
      setForm({
        nome:             updated.nome             || "",
        codigo:           updated.codigo           || "",
        plano:            updated.plano            || "basico",
        contato_nome:     updated.contato_nome     || "",
        contato_email:    updated.contato_email    || "",
        contato_telefone: updated.contato_telefone || "",
        subdomain:        updated.subdomain        || "",
        observacoes:      updated.observacoes      || "",
        custo_hora_treinamento: updated.custo_hora_treinamento ?? "",
      });

      setSuccess("Dados atualizados com sucesso.");
      setEditMode(false);
    } catch (err) {
      setError(err.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true); setError(""); setSuccess("");
    try {
      const res = await apiFetch(`/admin/empresas/${id}/toggle-ativo`, { method: "POST" });
      setEmpresa((prev) => ({ ...prev, ativo: res.ativo }));
      setSuccess(res.ativo ? "Tenant ativado." : "Tenant desativado.");
    } catch (err) {
      setError(err.message || "Erro ao alterar status.");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Excluir este tenant permanentemente? Esta ação não pode ser desfeita.')) return;
    setDeleting(true); setError(''); setSuccess('');
    try {
      await apiFetch(`/admin/empresas/${id}`, { method: 'DELETE' });
      router.replace('/admin');
    } catch (err) {
      setError(err.message || 'Erro ao excluir empresa.');
      setDeleting(false);
    }
  }

  function fld(key) {
    return {
      value: form[key] || "",
      onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
      disabled: !editMode,
      style: { ...inp, background: editMode ? "#fff" : "#f9fafb", cursor: editMode ? "text" : "default" },
    };
  }

  if (loading) return <PortalShell><div style={loadingMsg}>Carregando tenant…</div></PortalShell>;
  if (!empresa) return <PortalShell><div style={loadingMsg}>{error || "Tenant não encontrado."}</div></PortalShell>;

  const stats = empresa.stats || {};

  return (
    <PortalShell>
      <div style={page}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <button style={backBtn} onClick={() => router.push("/admin")}>← Painel admin</button>
            <h1 style={titulo}>{empresa.nome}</h1>
            <div style={headerMeta}>
              {empresa.codigo && <span style={codBadge}>/{empresa.codigo}</span>}
              <span style={{ ...statusBadge, background: empresa.ativo ? "#dcfce7" : "#f3f4f6",
                color: empresa.ativo ? "#166534" : "#9ca3af" }}>
                {empresa.ativo ? "Ativo" : "Inativo"}
              </span>
              <span style={planoBadge}>{empresa.plano}</span>
            </div>
          </div>
          <div style={headerActions}>
            {editMode ? (
              <>
                <button style={btnSecundary} onClick={() => { setEditMode(false); setError(""); }}>Cancelar</button>
                <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar alterações"}
                </button>
              </>
            ) : (
              <button style={btnPrimary} onClick={() => setEditMode(true)}>Editar</button>
            )}
          </div>
        </div>

        {error   && <div style={alertErr}>{error}</div>}
        {success && <div style={alertOk}>{success}</div>}

        {/* Uso */}
        <div style={metersRow}>
          <UsageMeter label="Usuários"   atual={stats.total_usuarios || 0}    limite={empresa.limite_usuarios || 50}  icon="👥" />
          <UsageMeter label="Turmas"     atual={stats.total_turmas || 0}      limite={empresa.limite_turmas   || 100} icon="🎓" />
          <UsageMeter label="Certificados" atual={stats.total_certificados || 0} limite={9999}                       icon="🏆" />
          <UsageMeter label="Registros de presença" atual={stats.total_presencas || 0} limite={9999}                icon="📋" />
        </div>

        <div style={contentGrid}>
          {/* Dados da empresa */}
          <div style={section}>
            <h2 style={sectionTitle}>Dados do tenant</h2>
            <div style={formGrid}>
              <div style={fieldFull}>
                <label style={lbl}>Nome *</label>
                <input {...fld("nome")} placeholder="Nome da empresa" />
              </div>
              <div>
                <label style={lbl}>Código / Slug</label>
                <input {...fld("codigo")} placeholder="ex: dasa" />
              </div>
              <div>
                <label style={lbl}>Plano</label>
                <select {...fld("plano")}>
                  {planos.map((p) => <option key={p.slug} value={p.slug}>{p.nome}</option>)}
                </select>
              </div>
              <div style={fieldFull}><div style={divider} /></div>
              <div>
                <label style={lbl}>Nome do contato</label>
                <input {...fld("contato_nome")} placeholder="—" />
              </div>
              <div>
                <label style={lbl}>E-mail do contato</label>
                <input {...fld("contato_email")} placeholder="—" />
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input {...fld("contato_telefone")} placeholder="—" />
              </div>
              <div>
                <label style={lbl}>Subdomínio</label>
                <input {...fld("subdomain")} placeholder="—" />
              </div>
              <div>
                <label style={lbl}>Custo por hora de treinamento (R$)</label>
                <input {...fld("custo_hora_treinamento")} type="number" min="0" step="0.01"
                  placeholder="150.00" />
                <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 4 }}>
                  Usado no cálculo de ROI (Indicadores). Em branco, usa R$ 150/h como referência.
                </div>
              </div>
              <div style={fieldFull}>
                <label style={lbl}>Observações</label>
                <textarea {...fld("observacoes")} style={{ ...inp, minHeight: 80,
                  background: editMode ? "#fff" : "#f9fafb", cursor: editMode ? "text" : "default" }}
                  placeholder="—" />
              </div>
              <div style={fieldFull}>
                <div style={metaInfo}>Criado em: {fmtDate(empresa.criado_em)}</div>
              </div>
            </div>
          </div>

          {/* Usuários do tenant */}
          <div style={section}>
            <h2 style={sectionTitle}>Usuários ({(empresa.usuarios || []).length})</h2>
            {(empresa.usuarios || []).length === 0 ? (
              <div style={emptyMsg}>Nenhum usuário cadastrado.</div>
            ) : (
              <div style={userList}>
                {(empresa.usuarios || []).map((u) => (
                  <div key={u.id} style={userItem}>
                    <div style={userAvatar}>{(u.nome || "?")[0].toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={userName}>{u.nome}</div>
                      <div style={userEmail}>{u.email}</div>
                    </div>
                    <span style={{ ...perfilBadge,
                      background: u.perfil === "coordenador" ? "#dbeafe" : "#f3f4f6",
                      color:      u.perfil === "coordenador" ? "#1d4ed8" : "#6b7280" }}>
                      {u.perfil}
                    </span>
                    <span style={{ ...atvDot, background: u.ativo ? "#22c55e" : "#9ca3af" }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zona de perigo */}
        <div style={dangerZone}>
          <h3 style={dangerTitle}>Zona de perigo</h3>
          <div style={dangerRow}>
            <div>
              <div style={dangerLabel}>
                {empresa.ativo ? "Desativar tenant" : "Ativar tenant"}
              </div>
              <div style={dangerDesc}>
                {empresa.ativo
                  ? "Nenhum usuário deste tenant conseguirá fazer login enquanto estiver inativo."
                  : "Reativa o acesso de todos os usuários deste tenant."}
              </div>
            </div>
            <button
              style={{ ...btnDanger, background: empresa.ativo ? "#ef4444" : "#22c55e" }}
              disabled={toggling}
              onClick={handleToggle}>
              {toggling ? "Aguarde…" : empresa.ativo ? "Desativar" : "Ativar"}
            </button>
          </div>
        </div>
      </div>

      {/* Exclusão permanente */}
      <div style={{ ...dangerZone, marginTop: 16, borderColor: "#fca5a5" }}>
        <h3 style={{ ...dangerTitle, color: "#7f1d1d" }}>Exclusão permanente</h3>
        <div style={dangerRow}>
          <div>
            <div style={dangerLabel}>Excluir tenant</div>
            <div style={dangerDesc}>
              Remove a empresa e todos os seus usuários. Bloqueado se houver turmas cadastradas.
            </div>
          </div>
          <button style={{ ...btnDanger, background: "#7f1d1d" }}
            disabled={deleting} onClick={handleDelete}>
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
    </PortalShell>
  );
}

const page         = { padding: "28px 32px", maxWidth: 1100, margin: "0 auto" };
const loadingMsg   = { padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 14 };
const pageHeader   = { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                       marginBottom: 28 };
const backBtn      = { background: "none", border: "none", color: "#9ca3af", cursor: "pointer",
                       fontSize: 13, padding: "0 0 4px", display: "block" };
const titulo       = { fontSize: 28, fontWeight: 900, color: "#0B1220", margin: "4px 0 8px" };
const headerMeta   = { display: "flex", gap: 10, alignItems: "center" };
const codBadge     = { fontSize: 12, fontFamily: "monospace", color: "#9ca3af" };
const statusBadge  = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999 };
const planoBadge   = { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                       background: "#f3f4f6", color: "#374151" };
const headerActions = { display: "flex", gap: 10, alignItems: "center" };
const alertErr     = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                       borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const alertOk      = { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                       borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const metersRow    = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 };
const meterCard    = { background: "#fff", borderRadius: 12, padding: 18,
                       boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const meterTop     = { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 };
const meterIcon    = { fontSize: 24 };
const meterLabel   = { fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 2 };
const meterVal     = { display: "flex", alignItems: "baseline", gap: 4 };
const meterBar     = { height: 6, background: "#f3f4f6", borderRadius: 999, marginBottom: 6 };
const meterFill    = { height: "100%", borderRadius: 999, transition: "width .3s" };
const contentGrid  = { display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, marginBottom: 28 };
const section      = { background: "#fff", borderRadius: 14, padding: "24px 28px",
                       boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const sectionTitle = { fontSize: 16, fontWeight: 800, color: "#0B1220", margin: "0 0 20px" };
const formGrid     = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const fieldFull    = { gridColumn: "1 / -1" };
const lbl          = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5 };
const inp          = { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                       fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const divider      = { height: 1, background: "#f3f4f6" };
const metaInfo     = { fontSize: 12, color: "#9ca3af" };
const emptyMsg     = { textAlign: "center", color: "#9ca3af", padding: "20px 0", fontSize: 13 };
const userList     = { display: "flex", flexDirection: "column", gap: 8 };
const userItem     = { display: "flex", alignItems: "center", gap: 10,
                       padding: "10px 12px", borderRadius: 8, background: "#f9fafb" };
const userAvatar   = { width: 32, height: 32, background: "#0B1220", color: "#fff",
                       borderRadius: 999, display: "flex", alignItems: "center",
                       justifyContent: "center", fontWeight: 900, fontSize: 13, flexShrink: 0 };
const userName     = { fontWeight: 700, fontSize: 13, color: "#0B1220" };
const userEmail    = { fontSize: 12, color: "#6b7280" };
const perfilBadge  = { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 };
const atvDot       = { width: 8, height: 8, borderRadius: 999, flexShrink: 0 };
const dangerZone   = { background: "#fff", border: "1px solid #fecaca", borderRadius: 14,
                       padding: "20px 28px" };
const dangerTitle  = { fontSize: 14, fontWeight: 800, color: "#991b1b", margin: "0 0 14px" };
const dangerRow    = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 };
const dangerLabel  = { fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 4 };
const dangerDesc   = { fontSize: 13, color: "#9ca3af" };
const btnPrimary   = { padding: "10px 20px", background: colors.accent, color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSecundary = { padding: "10px 20px", background: "#f3f4f6", color: "#374151", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnDanger    = { padding: "10px 20px", color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
