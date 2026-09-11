"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import { apiFetch, getStoredUser } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";

// Painel super-admin — Visão consolidada entre tenants (roadmap: "Painel
// super-admin com visão consolidada entre tenants"). O /admin já mostra
// uso/limite por tenant individualmente (cards); esta tela agrega os mesmos
// dados — não precisa de nenhum endpoint novo — numa única visão comparativa
// e numa lista de alertas acionáveis, para ficar mais fácil acompanhar a
// saúde de todos os tenants de uma vez à medida que a base cresce (Comércio,
// IBM, Dasa...).

const LIMITE_ILIMITADO = 9999;
// Mesmos defaults usados no card grid do /admin (UsageBar) e na tela do
// tenant (UsageMeter) quando o banco ainda não tem limite_usuarios/turmas
// preenchido — repetir aqui evita a tela consolidada mostrar "∞" para um
// tenant que as outras telas do mesmo painel mostram como "1/50".
const LIMITE_PADRAO_USUARIOS = 50;
const LIMITE_PADRAO_TURMAS = 100;

function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function pctUso(atual, limite) {
  if (limite === LIMITE_ILIMITADO) return null;
  const limiteNum = Number(limite || 0);
  if (limiteNum <= 0) return null;
  return Math.min(Math.round((Number(atual || 0) / limiteNum) * 100), 999);
}

// Deriva a lista de alertas acionáveis a partir dos mesmos dados que o
// /admin já busca em /admin/empresas — nenhuma chamada nova ao backend.
function computeAlertas(empresas) {
  const alertas = [];

  for (const e of empresas) {
    const atuU = Number(e.total_usuarios || 0);
    const limU = Number(e.limite_usuarios || LIMITE_PADRAO_USUARIOS);
    const atuT = Number(e.total_turmas || 0);
    const limT = Number(e.limite_turmas || LIMITE_PADRAO_TURMAS);
    const pU = pctUso(atuU, limU);
    const pT = pctUso(atuT, limT);

    if (pU !== null && pU >= 90) {
      alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "critico",
        mensagem: `Usuários quase no limite: ${atuU}/${limU} (${pU}%)` });
    } else if (pU !== null && pU >= 70) {
      alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "atencao",
        mensagem: `Usuários se aproximando do limite: ${atuU}/${limU} (${pU}%)` });
    }

    if (pT !== null && pT >= 90) {
      alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "critico",
        mensagem: `Turmas quase no limite: ${atuT}/${limT} (${pT}%)` });
    } else if (pT !== null && pT >= 70) {
      alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "atencao",
        mensagem: `Turmas se aproximando do limite: ${atuT}/${limT} (${pT}%)` });
    }

    if (!e.ativo) {
      alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "info",
        mensagem: "Tenant desativado" });
    } else {
      if (!e.contato_email) {
        alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "atencao",
          mensagem: "Sem e-mail de contato cadastrado — onboarding incompleto" });
      }
      if (atuT === 0) {
        alertas.push({ empresaId: e.id, tenant: e.nome, severidade: "atencao",
          mensagem: "Nenhuma turma cadastrada ainda" });
      }
    }
  }

  const ordem = { critico: 0, atencao: 1, info: 2 };
  return alertas.sort((a, b) =>
    ordem[a.severidade] - ordem[b.severidade] || a.tenant.localeCompare(b.tenant)
  );
}

function badgeSeveridade(sev) {
  if (sev === "critico") return { background: colors.dangerLight, color: colors.dangerText, label: "Crítico" };
  if (sev === "atencao")  return { background: colors.warningLight, color: colors.warningText, label: "Atenção" };
  return                          { background: colors.infoLight,    color: "#0369a1",          label: "Info" };
}

function MiniBar({ atual, limite }) {
  const pct = pctUso(atual, limite);
  const ilimitado = pct === null;
  const danger = !ilimitado && pct >= 90;
  const warn   = !ilimitado && pct >= 70;
  const cor    = danger ? colors.danger : warn ? colors.warning : colors.success;
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5,
        color: colors.textSecondary, marginBottom: 3, fontWeight: 700 }}>
        <span>{atual}/{ilimitado ? "∞" : limite}</span>
        {!ilimitado && <span style={{ color: danger ? colors.danger : colors.textMuted }}>{pct}%</span>}
      </div>
      {!ilimitado && (
        <div style={{ height: 5, background: colors.neutralLight, borderRadius: radius.pill }}>
          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: cor,
            borderRadius: radius.pill, transition: "width .3s" }} />
        </div>
      )}
    </div>
  );
}

export default function ConsolidadoPage() {
  const router = useRouter();
  const user   = getStoredUser();

  const [stats, setStats]     = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState("");

  useEffect(() => {
    if (normalize(user?.perfil) !== "super_admin") {
      router.replace("/inicio"); return;
    }
    async function load() {
      try {
        const [s, e] = await Promise.all([
          apiFetch("/admin/stats"),
          apiFetch("/admin/empresas"),
        ]);
        setStats(s);
        setEmpresas(Array.isArray(e) ? e : []);
      } catch (err) {
        setError(err.message || "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const alertas = useMemo(() => computeAlertas(empresas), [empresas]);
  const empresasOrdenadas = useMemo(() => {
    // Tenants com alerta crítico sobem para o topo da tabela — é o tipo de
    // priorização que essa tela existe para dar, em vez de ordem alfabética.
    const severidadePorEmpresa = {};
    for (const a of alertas) {
      const atual = severidadePorEmpresa[a.empresaId];
      if (!atual || (atual === "atencao" && a.severidade === "critico")) {
        severidadePorEmpresa[a.empresaId] = a.severidade;
      }
    }
    const peso = { critico: 0, atencao: 1, undefined: 2, info: 2 };
    return [...empresas].sort((a, b) => {
      const pa = peso[severidadePorEmpresa[a.id]] ?? 2;
      const pb = peso[severidadePorEmpresa[b.id]] ?? 2;
      return pa - pb || a.nome.localeCompare(b.nome);
    });
  }, [empresas, alertas]);

  return (
    <PortalShell>
      <div style={page}>
        <PageHero
          title="Visão Consolidada"
          subtitle="Saúde de todos os tenants numa tela só — uso vs. limites, alertas acionáveis e volume agregado"
          icon="📊"
          actions={
            <button style={btnVoltar} onClick={() => router.push("/admin")}>
              ← Voltar ao painel
            </button>
          }
        />

        {stats && (
          <div style={kpiRow}>
            {[
              { label: "Tenants ativos",         value: stats.empresas_ativas,     sub: `de ${stats.total_empresas} total` },
              { label: "Usuários na plataforma",  value: stats.total_usuarios,      sub: "todos os tenants" },
              { label: "Turmas cadastradas",      value: stats.total_turmas,        sub: "todos os tenants" },
              { label: "Certificados emitidos",   value: stats.total_certificados,  sub: "todos os tenants" },
            ].map(({ label, value, sub }) => (
              <div key={label} style={kpiCard}>
                <div style={kpiValue}>{value}</div>
                <div style={kpiLabel}>{label}</div>
                <div style={kpiSub}>{sub}</div>
              </div>
            ))}
          </div>
        )}

        {error && <div style={alertErr}>{error}</div>}

        {loading ? (
          <div style={empty}>Carregando visão consolidada…</div>
        ) : (
          <>
            {/* Alertas acionáveis */}
            <div style={sectionCard}>
              <div style={sectionTitle}>
                Alertas
                {alertas.length > 0 && (
                  <span style={countPill}>{alertas.length}</span>
                )}
              </div>

              {alertas.length === 0 ? (
                <div style={emptyAlertas}>
                  ✅ Nenhum alerta no momento — todos os tenants estão dentro do esperado.
                </div>
              ) : (
                <div style={alertList}>
                  {alertas.map((a, i) => {
                    const b = badgeSeveridade(a.severidade);
                    return (
                      <div key={i} style={alertRow}>
                        <span style={{ ...severidadeBadge, background: b.background, color: b.color }}>
                          {b.label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={alertTenant}>{a.tenant}</div>
                          <div style={alertMsg}>{a.mensagem}</div>
                        </div>
                        <button style={btnVerTenant}
                          onClick={() => router.push(`/admin/empresa/${a.empresaId}`)}>
                          Ver tenant
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comparativo lado a lado */}
            <div style={sectionCard}>
              <div style={sectionTitle}>Comparativo entre tenants</div>
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Tenant</th>
                      <th style={th}>Plano</th>
                      <th style={th}>Status</th>
                      <th style={th}>Usuários</th>
                      <th style={th}>Turmas</th>
                      <th style={th}>Certificados</th>
                      <th style={th}>Criado em</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresasOrdenadas.map((e) => (
                      <tr key={e.id} style={{ opacity: e.ativo ? 1 : 0.55 }}>
                        <td style={{ ...td, fontWeight: 800, color: colors.textPrimary }}>{e.nome}</td>
                        <td style={td}>{e.plano || "básico"}</td>
                        <td style={td}>
                          <span style={{ ...statusPill,
                            background: e.ativo ? colors.successLight : colors.neutralLight,
                            color: e.ativo ? colors.successText : colors.textSecondary }}>
                            {e.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={td}><MiniBar atual={e.total_usuarios} limite={e.limite_usuarios || LIMITE_PADRAO_USUARIOS} /></td>
                        <td style={td}><MiniBar atual={e.total_turmas} limite={e.limite_turmas || LIMITE_PADRAO_TURMAS} /></td>
                        <td style={td}>{e.total_certificados || 0}</td>
                        <td style={td}>{fmtDate(e.criado_em)}</td>
                        <td style={td}>
                          <button style={btnGerenciar}
                            onClick={() => router.push(`/admin/empresa/${e.id}`)}>
                            Gerenciar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}

const page      = { padding: "28px 32px", maxWidth: 1300, margin: "0 auto" };
const kpiRow    = { display: "flex", gap: 16, margin: "24px 0" };
const kpiCard   = { flex: 1, background: "#fff", borderRadius: 12, padding: "18px 20px",
                    boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" };
const kpiValue  = { fontSize: 32, fontWeight: 900, color: "#0B1220" };
const kpiLabel  = { fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 600 };
const kpiSub    = { fontSize: 11, color: "#9ca3af", marginTop: 2 };
const alertErr  = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                    borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const empty     = { textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: 14 };

const btnVoltar = { padding: "10px 16px", background: "rgba(255,255,255,0.12)", color: "#fff",
                    border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };

const sectionCard = { background: "#fff", borderRadius: 14, padding: 22, marginBottom: 20,
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6" };
const sectionTitle = { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800,
                       color: colors.textPrimary, marginBottom: 16 };
const countPill = { background: colors.dangerLight, color: colors.dangerText, fontSize: 11.5,
                    fontWeight: 800, padding: "2px 9px", borderRadius: radius.pill };
const emptyAlertas = { color: colors.successText, background: colors.successLight, borderRadius: 10,
                       padding: "14px 16px", fontSize: 13.5, fontWeight: 600 };
const alertList = { display: "flex", flexDirection: "column", gap: 8 };
const alertRow = { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                   background: colors.surfaceMuted, borderRadius: 10, border: `1px solid ${colors.border}` };
const severidadeBadge = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: radius.pill,
                          flexShrink: 0 };
const alertTenant = { fontSize: 13.5, fontWeight: 800, color: colors.textPrimary };
const alertMsg  = { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 };
const btnVerTenant = { padding: "7px 12px", background: colors.navy, color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                       whiteSpace: "nowrap" };

const tableWrap = { overflowX: "auto" };
const table = { width: "100%", borderCollapse: "collapse", minWidth: 760 };
const th = { textAlign: "left", fontSize: 11.5, fontWeight: 800, color: colors.textMuted,
             textTransform: "uppercase", letterSpacing: ".03em", padding: "0 12px 10px", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "12px 12px", borderBottom: `1px solid ${colors.border}`, fontSize: 13, color: colors.textSecondary,
             verticalAlign: "middle" };
const statusPill = { fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: radius.pill };
const btnGerenciar = { padding: "7px 14px", background: "#0B1220", color: "#fff", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" };
