"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import { apiFetch, getStoredUser } from "../../services/api";

function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function planoBadge(plano) {
  const p = normalize(plano);
  if (p === "enterprise")   return { bg: "#1e1b4b", text: "#a5b4fc", label: "Enterprise" };
  if (p === "profissional") return { bg: "#0c4a6e", text: "#7dd3fc", label: "Profissional" };
  return                           { bg: "#f3f4f6", text: "#374151", label: "Básico" };
}

function UsageBar({ atual, limite, label }) {
  const pct    = limite > 0 ? Math.min(Math.round((atual / limite) * 100), 100) : 0;
  const danger = pct >= 90;
  const warn   = pct >= 70;
  const cor    = danger ? "#ef4444" : warn ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11,
        color: "#6b7280", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: danger ? "#ef4444" : "#374151" }}>
          {atual}/{limite === 9999 ? "∞" : limite}
        </span>
      </div>
      <div style={{ height: 5, background: "#f3f4f6", borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor,
          borderRadius: 999, transition: "width .3s" }} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const user   = getStoredUser();

  const [stats,   setStats]   = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState("");
  const [toggling, setToggling] = useState(null);
  const [search,  setSearch]   = useState("");
  const [filterPlano,  setFilterPlano]  = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");

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

  async function handleToggle(empresa) {
    setToggling(empresa.id);
    try {
      const res = await apiFetch(`/admin/empresas/${empresa.id}/toggle-ativo`, { method: "POST" });
      setEmpresas((prev) => prev.map((e) =>
        e.id === empresa.id ? { ...e, ativo: res.ativo } : e
      ));
    } catch (err) {
      setError(err.message || "Erro ao alterar status.");
    } finally {
      setToggling(null);
    }
  }

  const planos = useMemo(() => (
    [...new Set(empresas.map((e) => e.plano).filter(Boolean))].sort()
  ), [empresas]);

  const filtradas = useMemo(() => {
    const term = normalize(search);
    return empresas.filter((e) => {
      const matchPlano  = filterPlano  === "todos" || e.plano === filterPlano;
      const matchStatus = filterStatus === "todos" ||
        (filterStatus === "ativo"   &&  e.ativo) ||
        (filterStatus === "inativo" && !e.ativo);
      const matchSearch = !term || [e.nome, e.codigo, e.contato_nome, e.contato_email]
        .join(" ").toLowerCase().includes(term);
      return matchPlano && matchStatus && matchSearch;
    });
  }, [empresas, filterPlano, filterStatus, search]);

  return (
    <PortalShell>
      <div style={page}>
        <PageHero
          title="Super Admin"
          subtitle="Gestão de tenants, planos e saúde da plataforma"
          icon="⚙️"
        />

        {/* KPIs globais */}
        {stats && (
          <div style={kpiRow}>
            {[
              { label: "Tenants ativos",      value: stats.empresas_ativas,    sub: `de ${stats.total_empresas} total` },
              { label: "Usuários na plataforma", value: stats.total_usuarios,   sub: "todos os tenants" },
              { label: "Turmas cadastradas",   value: stats.total_turmas,       sub: "todos os tenants" },
              { label: "Certificados emitidos", value: stats.total_certificados, sub: "todos os tenants" },
            ].map(({ label, value, sub }) => (
              <div key={label} style={kpiCard}>
                <div style={kpiValue}>{value}</div>
                <div style={kpiLabel}>{label}</div>
                <div style={kpiSub}>{sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Distribuição de planos */}
        {stats?.distribuicao_planos?.length > 0 && (
          <div style={planoRow}>
            {stats.distribuicao_planos.map((p) => {
              const pb = planoBadge(p.plano);
              return (
                <div key={p.plano} style={{ ...planoBadgeCard, background: pb.bg }}>
                  <span style={{ color: pb.text, fontWeight: 800, fontSize: 13 }}>{pb.label}</span>
                  <span style={{ color: pb.text, opacity: 0.8, fontSize: 12 }}>{p.qtd} tenant{p.qtd > 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        )}

        {error && <div style={alertErr}>{error}</div>}

        {/* Toolbar */}
        <div style={toolbar}>
          <div style={filterRow}>
            <input style={searchInput} placeholder="Buscar tenant…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select style={sel} value={filterPlano} onChange={(e) => setFilterPlano(e.target.value)}>
              <option value="todos">Todos os planos</option>
              {planos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={sel} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="todos">Ativos e inativos</option>
              <option value="ativo">Somente ativos</option>
              <option value="inativo">Somente inativos</option>
            </select>
          </div>
          <button style={btnNovo} onClick={() => router.push("/admin/nova-empresa")}>
            + Novo tenant
          </button>
        </div>

        {/* Tabela de tenants */}
        {loading ? (
          <div style={empty}>Carregando tenants…</div>
        ) : filtradas.length === 0 ? (
          <div style={empty}>Nenhum tenant encontrado.</div>
        ) : (
          <div style={tenantGrid}>
            {filtradas.map((empresa) => {
              const pb  = planoBadge(empresa.plano);
              const atu = Number(empresa.total_usuarios || 0);
              const att = Number(empresa.total_turmas   || 0);
              const lim_u = Number(empresa.limite_usuarios || 50);
              const lim_t = Number(empresa.limite_turmas   || 100);

              return (
                <div key={empresa.id} style={{ ...tenantCard, opacity: empresa.ativo ? 1 : 0.6 }}>
                  <div style={tenantTop}>
                    <div style={{ flex: 1 }}>
                      <div style={tenantNome}>{empresa.nome}</div>
                      {empresa.codigo && <div style={tenantCodigo}>/{empresa.codigo}</div>}
                    </div>
                    <span style={{ ...planoBadgeSmall, background: pb.bg, color: pb.text }}>
                      {pb.label}
                    </span>
                    <span style={{ ...statusDot, background: empresa.ativo ? "#22c55e" : "#9ca3af" }}
                      title={empresa.ativo ? "Ativo" : "Inativo"} />
                  </div>

                  {empresa.contato_nome && (
                    <div style={tenantMeta}>{empresa.contato_nome} · {empresa.contato_email || "—"}</div>
                  )}

                  <div style={usageBars}>
                    <UsageBar atual={atu} limite={lim_u} label="Usuários" />
                    <UsageBar atual={att} limite={lim_t} label="Turmas" />
                  </div>

                  <div style={tenantStats}>
                    <span style={statItem}>🏆 {empresa.total_certificados || 0} certs</span>
                    <span style={statItem}>📅 {fmtDate(empresa.criado_em)}</span>
                  </div>

                  <div style={tenantActions}>
                    <button style={btnDetail}
                      onClick={() => router.push(`/admin/empresa/${empresa.id}`)}>
                      Gerenciar
                    </button>
                    <button
                      style={{ ...btnToggle, background: empresa.ativo ? "#fef2f2" : "#f0fdf4",
                        color: empresa.ativo ? "#dc2626" : "#166534" }}
                      disabled={toggling === empresa.id}
                      onClick={() => handleToggle(empresa)}>
                      {toggling === empresa.id ? "…" : empresa.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
const planoRow  = { display: "flex", gap: 12, marginBottom: 24 };
const planoBadgeCard = { borderRadius: 10, padding: "10px 16px", display: "flex",
                         flexDirection: "column", gap: 2 };
const alertErr  = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                    borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const toolbar   = { display: "flex", gap: 12, alignItems: "center", marginBottom: 20 };
const filterRow = { display: "flex", gap: 12, flex: 1 };
const searchInput = { flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb",
                      borderRadius: 8, fontSize: 14 };
const sel       = { padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                    fontSize: 14, background: "#fff" };
const empty     = { textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: 14 };
const tenantGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 };
const tenantCard = { background: "#fff", borderRadius: 14, padding: 20,
                     boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6" };
const tenantTop  = { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 };
const tenantNome = { fontWeight: 800, fontSize: 15, color: "#0B1220" };
const tenantCodigo = { fontSize: 12, color: "#9ca3af", fontFamily: "monospace" };
const tenantMeta = { fontSize: 12, color: "#9ca3af", marginBottom: 12 };
const planoBadgeSmall = { fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6 };
const statusDot  = { width: 10, height: 10, borderRadius: 999, flexShrink: 0, marginTop: 4 };
const usageBars  = { margin: "12px 0" };
const tenantStats = { display: "flex", gap: 12, marginBottom: 14 };
const statItem   = { fontSize: 12, color: "#6b7280" };
const tenantActions = { display: "flex", gap: 8 };
const btnNovo    = { padding: "10px 18px", background: "#FF6B4A", color: "#fff", border: "none",
                     borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnDetail  = { flex: 1, padding: "9px 0", background: "#0B1220", color: "#fff", border: "none",
                     borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnToggle  = { padding: "9px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                     fontSize: 13, fontWeight: 700 };
