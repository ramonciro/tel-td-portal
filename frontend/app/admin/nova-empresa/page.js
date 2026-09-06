"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../../services/api";
import { colors } from "../../../lib/theme";

function normalize(v) { return String(v || "").trim().toLowerCase(); }

const STEPS = ["Dados do tenant", "Usuário admin", "Revisar e criar"];

function StepIndicator({ current }) {
  return (
    <div style={stepRow}>
      {STEPS.map((label, idx) => {
        const done   = idx < current;
        const active = idx === current;
        return (
          <div key={idx} style={stepItem}>
            <div style={{
              ...stepCircle,
              background:   done ? "#22c55e" : active ? "#0B1220" : "#e5e7eb",
              color:        done || active ? "#fff" : "#9ca3af",
            }}>
              {done ? "✓" : idx + 1}
            </div>
            <div style={{ ...stepLabel, color: active ? "#0B1220" : "#9ca3af",
              fontWeight: active ? 800 : 500 }}>
              {label}
            </div>
            {idx < STEPS.length - 1 && <div style={stepLine} />}
          </div>
        );
      })}
    </div>
  );
}

export default function NovaEmpresaPage() {
  const router = useRouter();
  const user   = getStoredUser();

  const [step,    setStep]    = useState(0);
  const [planos,  setPlanos]  = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState(null);   // dados retornados após criação

  // Formulário completo
  const [empresa, setEmpresa] = useState({
    nome: "", codigo: "", plano: "basico",
    contato_nome: "", contato_email: "", contato_telefone: "",
    subdomain: "", observacoes: "",
  });
  const [admin, setAdmin] = useState({
    admin_nome: "", admin_email: "", admin_senha: "",
  });

  useEffect(() => {
    if (normalize(user?.perfil) !== "super_admin") { router.replace("/inicio"); return; }
    apiFetch("/admin/planos").then(setPlanos).catch(() => {});
  }, []);

  function fieldEmpresa(key) {
    return {
      value: empresa[key],
      onChange: (e) => setEmpresa((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }
  function fieldAdmin(key) {
    return {
      value: admin[key],
      onChange: (e) => setAdmin((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  function validateStep() {
    if (step === 0) {
      if (!empresa.nome.trim()) { setError("Nome do tenant é obrigatório."); return false; }
    }
    if (step === 1) {
      if (!admin.admin_nome.trim() || !admin.admin_email.trim()) {
        setError("Nome e e-mail do administrador são obrigatórios."); return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.admin_email)) {
        setError("E-mail inválido."); return false;
      }
    }
    setError(""); return true;
  }

  function nextStep() { if (validateStep()) setStep((s) => s + 1); }
  function prevStep() { setStep((s) => s - 1); setError(""); }

  async function handleCreate() {
    setSaving(true); setError("");
    try {
      const body = { ...empresa, ...admin };
      const res  = await apiFetch("/admin/empresas", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
      setStep(3); // success screen
    } catch (err) {
      setError(err.message || "Erro ao criar tenant.");
    } finally {
      setSaving(false);
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const planoSelecionado = planos.find((p) => p.slug === empresa.plano);

  // ── Tela de sucesso
  if (step === 3 && result) {
    return (
      <PortalShell>
        <div style={page}>
          <div style={successCard}>
            <div style={successIcon}>✓</div>
            <h2 style={successTitle}>Tenant criado com sucesso!</h2>
            <p style={successSub}>Guarde as credenciais abaixo — a senha não será exibida novamente.</p>

            <div style={credCard}>
              <h3 style={credTitle}>Credenciais do administrador</h3>
              <div style={credGrid}>
                {[
                  { label: "Empresa",  value: result.empresa.nome },
                  { label: "Plano",    value: result.empresa.plano },
                  { label: "Nome",     value: result.admin.nome },
                  { label: "E-mail",   value: result.admin.email },
                  { label: "Senha temporária", value: result.admin.senha_temporaria, mono: true, copy: true },
                ].map(({ label, value, mono, copy }) => (
                  <div key={label} style={credItem}>
                    <div style={credLabel}>{label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ ...credValue, fontFamily: mono ? "monospace" : "inherit",
                        letterSpacing: mono ? 2 : 0 }}>{value}</div>
                      {copy && (
                        <button style={btnCopy} onClick={() => copyText(value)}>Copiar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={credAviso}>
                ⚠️ {result.admin.aviso}
              </div>
            </div>

            <div style={successActions}>
              <button style={btnSecundary} onClick={() => router.push("/admin")}>
                ← Voltar ao painel
              </button>
              <button style={btnPrimary}
                onClick={() => router.push(`/admin/empresa/${result.empresa.id}`)}>
                Gerenciar tenant →
              </button>
            </div>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div style={page}>
        <div style={header}>
          <div>
            <h1 style={titulo}>Novo Tenant</h1>
            <p style={subtitulo}>Criação de novo ambiente no Portal T&D</p>
          </div>
          <button style={btnSecundary} onClick={() => router.push("/admin")}>← Cancelar</button>
        </div>

        <StepIndicator current={step} />

        {error && <div style={alertErr}>{error}</div>}

        <div style={formCard}>
          {/* ── Step 0: Dados do tenant ─────────────────────────────────── */}
          {step === 0 && (
            <div>
              <h2 style={sectionTitle}>Dados do tenant</h2>
              <div style={formGrid}>
                <div style={fieldFull}>
                  <label style={lbl}>Nome da empresa *</label>
                  <input style={inp} placeholder="Ex.: Dasa S.A." {...fieldEmpresa("nome")} />
                </div>
                <div>
                  <label style={lbl}>Código / Slug</label>
                  <input style={inp} placeholder="ex: dasa" {...fieldEmpresa("codigo")} />
                  <div style={hint}>Identificador único — usado em subdomain e X-Client-ID</div>
                </div>
                <div>
                  <label style={lbl}>Plano</label>
                  <select style={inp} {...fieldEmpresa("plano")}>
                    {planos.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.nome} — {p.descricao}</option>
                    ))}
                  </select>
                </div>
                {planoSelecionado && (
                  <div style={planoCaps}>
                    <span>👥 Até {planoSelecionado.limite_usuarios === 9999 ? "∞" : planoSelecionado.limite_usuarios} usuários</span>
                    <span>🎓 Até {planoSelecionado.limite_turmas   === 9999 ? "∞" : planoSelecionado.limite_turmas} turmas</span>
                  </div>
                )}
                <div style={fieldFull}><div style={divider} /></div>
                <div>
                  <label style={lbl}>Nome do contato</label>
                  <input style={inp} placeholder="Nome do responsável T&D" {...fieldEmpresa("contato_nome")} />
                </div>
                <div>
                  <label style={lbl}>E-mail do contato</label>
                  <input style={inp} type="email" placeholder="contato@empresa.com" {...fieldEmpresa("contato_email")} />
                </div>
                <div>
                  <label style={lbl}>Telefone</label>
                  <input style={inp} placeholder="(00) 00000-0000" {...fieldEmpresa("contato_telefone")} />
                </div>
                <div>
                  <label style={lbl}>Subdomínio</label>
                  <input style={inp} placeholder="dasa.teltd.com.br" {...fieldEmpresa("subdomain")} />
                </div>
                <div style={fieldFull}>
                  <label style={lbl}>Observações</label>
                  <textarea style={{ ...inp, minHeight: 72 }} placeholder="Notas internas sobre o tenant…"
                    {...fieldEmpresa("observacoes")} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Usuário admin ────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h2 style={sectionTitle}>Usuário administrador inicial</h2>
              <p style={sectionDesc}>
                Este usuário receberá o perfil <strong>Coordenador</strong> e será o primeiro
                acesso ao tenant. A senha poderá ser temporária — o sistema exigirá troca no
                primeiro login.
              </p>
              <div style={formGrid}>
                <div>
                  <label style={lbl}>Nome completo *</label>
                  <input style={inp} placeholder="Nome do coordenador" {...fieldAdmin("admin_nome")} />
                </div>
                <div>
                  <label style={lbl}>E-mail *</label>
                  <input style={inp} type="email" placeholder="coordenador@empresa.com"
                    {...fieldAdmin("admin_email")} />
                </div>
                <div style={fieldFull}>
                  <label style={lbl}>Senha temporária</label>
                  <input style={inp} placeholder="Deixe vazio para gerar automaticamente"
                    {...fieldAdmin("admin_senha")} />
                  <div style={hint}>
                    Se deixado em branco, uma senha segura de 10 caracteres será gerada e exibida após a criação.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Revisão ─────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 style={sectionTitle}>Revisar e confirmar</h2>
              <div style={reviewGrid}>
                <div style={reviewSection}>
                  <div style={reviewSectionTitle}>Tenant</div>
                  {[
                    { label: "Nome",     value: empresa.nome },
                    { label: "Código",   value: empresa.codigo || "—" },
                    { label: "Plano",    value: planoSelecionado?.nome || empresa.plano },
                    { label: "Contato",  value: empresa.contato_nome || "—" },
                    { label: "E-mail",   value: empresa.contato_email || "—" },
                    { label: "Telefone", value: empresa.contato_telefone || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={reviewItem}>
                      <span style={reviewLabel}>{label}</span>
                      <span style={reviewValue}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={reviewSection}>
                  <div style={reviewSectionTitle}>Usuário admin</div>
                  {[
                    { label: "Nome",   value: admin.admin_nome },
                    { label: "E-mail", value: admin.admin_email },
                    { label: "Perfil", value: "Coordenador" },
                    { label: "Senha",  value: admin.admin_senha ? "Definida manualmente" : "Gerada automaticamente" },
                    { label: "Troca na 1ª entrada", value: "Sim" },
                  ].map(({ label, value }) => (
                    <div key={label} style={reviewItem}>
                      <span style={reviewLabel}>{label}</span>
                      <span style={reviewValue}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navegação entre steps */}
        <div style={navRow}>
          {step > 0 && (
            <button style={btnSecundary} onClick={prevStep}>← Anterior</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 && (
            <button style={btnPrimary} onClick={nextStep}>Próximo →</button>
          )}
          {step === 2 && (
            <button style={btnCreate} onClick={handleCreate} disabled={saving}>
              {saving ? "Criando tenant…" : "✓ Criar tenant"}
            </button>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

const page         = { padding: "28px 32px", maxWidth: 860, margin: "0 auto" };
const header       = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 };
const titulo       = { fontSize: 28, fontWeight: 900, color: "#0B1220", margin: 0 };
const subtitulo    = { fontSize: 14, color: "#9ca3af", marginTop: 4 };
const stepRow      = { display: "flex", alignItems: "center", marginBottom: 32 };
const stepItem     = { display: "flex", alignItems: "center", gap: 10, flex: 1 };
const stepCircle   = { width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center",
                       justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 };
const stepLabel    = { fontSize: 13 };
const stepLine     = { flex: 1, height: 2, background: "#e5e7eb", margin: "0 8px" };
const alertErr     = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                       borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const formCard     = { background: "#fff", borderRadius: 14, padding: "28px 32px",
                       boxShadow: "0 1px 4px rgba(0,0,0,.08)", marginBottom: 20 };
const sectionTitle = { fontSize: 18, fontWeight: 900, color: "#0B1220", margin: "0 0 8px" };
const sectionDesc  = { fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 };
const formGrid     = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const fieldFull    = { gridColumn: "1 / -1" };
const lbl          = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 };
const inp          = { width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                       fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                       background: "#fff" };
const hint         = { fontSize: 12, color: "#9ca3af", marginTop: 4 };
const divider      = { height: 1, background: "#f3f4f6" };
const planoCaps    = { gridColumn: "1 / -1", display: "flex", gap: 16, fontSize: 13, color: "#374151",
                       background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px" };
const reviewGrid   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 };
const reviewSection = { background: "#f9fafb", borderRadius: 10, padding: "16px 20px" };
const reviewSectionTitle = { fontWeight: 800, fontSize: 13, color: "#0B1220", marginBottom: 12,
                              textTransform: "uppercase", letterSpacing: 1 };
const reviewItem   = { display: "flex", justifyContent: "space-between", padding: "6px 0",
                       borderBottom: "1px solid #f3f4f6" };
const reviewLabel  = { fontSize: 13, color: "#9ca3af" };
const reviewValue  = { fontSize: 13, fontWeight: 700, color: "#0B1220", textAlign: "right", maxWidth: "60%" };
const navRow       = { display: "flex", gap: 12, alignItems: "center" };

// Success
const successCard  = { background: "#fff", borderRadius: 16, padding: 40,
                       boxShadow: "0 2px 8px rgba(0,0,0,.08)", textAlign: "center" };
const successIcon  = { width: 64, height: 64, background: "#dcfce7", color: "#166534",
                       borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
                       fontSize: 28, fontWeight: 900, margin: "0 auto 20px" };
const successTitle = { fontSize: 24, fontWeight: 900, color: "#0B1220", margin: "0 0 8px" };
const successSub   = { color: "#9ca3af", fontSize: 14, marginBottom: 28 };
const credCard     = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12,
                       padding: "20px 24px", textAlign: "left", marginBottom: 28 };
const credTitle    = { fontWeight: 800, fontSize: 14, color: "#0B1220", margin: "0 0 16px" };
const credGrid     = { display: "flex", flexDirection: "column", gap: 12 };
const credItem     = {};
const credLabel    = { fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase",
                       letterSpacing: 1, marginBottom: 2 };
const credValue    = { fontSize: 15, fontWeight: 700, color: "#0B1220" };
const credAviso    = { marginTop: 16, fontSize: 13, color: "#92400e", background: "#fef3c7",
                       border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" };
const successActions = { display: "flex", gap: 12, justifyContent: "center" };

const btnPrimary   = { padding: "10px 24px", background: colors.accent, color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700 };
const btnSecundary = { padding: "10px 20px", background: "#f3f4f6", color: "#374151", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700 };
const btnCreate    = { padding: "12px 32px", background: "#0B1220", color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 800 };
const btnCopy      = { padding: "4px 10px", background: "#e5e7eb", color: "#374151", border: "none",
                       borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 };
