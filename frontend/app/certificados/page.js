"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import { apiFetch, getStoredUser } from "../../services/api";

function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}
function fmtPct(v) { return v != null ? `${Number(v).toFixed(0)}%` : "—"; }
function fmtNota(v) { return v != null ? Number(v).toFixed(1) : "—"; }

function CertCard({ cert }) {
  return (
    <div style={certCard}>
      <div style={certTopo}>
        <span style={certIcone}>🏆</span>
        <div style={{ flex: 1 }}>
          <div style={certNome}>{cert.usuario_nome}</div>
          <div style={certTema}>{cert.treinamento_tema}</div>
          {cert.treinamento_cliente && <div style={certCliente}>{cert.treinamento_cliente}</div>}
        </div>
        <div style={certDataWrap}>
          <div style={certDataLabel}>Emitido em</div>
          <div style={certDataValor}>{fmtDate(cert.emitido_em)}</div>
        </div>
      </div>
      <div style={certMetas}>
        {cert.carga_horaria && (
          <div style={metaItem}><div style={metaLabel}>Carga horária</div><div style={metaValor}>{cert.carga_horaria}h</div></div>
        )}
        {cert.frequencia_percentual != null && (
          <div style={metaItem}><div style={metaLabel}>Frequência</div>
            <div style={{ ...metaValor, color: Number(cert.frequencia_percentual) >= 75 ? "#166534" : "#991b1b" }}>
              {fmtPct(cert.frequencia_percentual)}
            </div>
          </div>
        )}
        {cert.nota_final != null && (
          <div style={metaItem}><div style={metaLabel}>Nota final</div><div style={metaValor}>{fmtNota(cert.nota_final)}</div></div>
        )}
        <div style={metaItem}><div style={metaLabel}>ID</div><div style={{ ...metaValor, fontSize: 11, color: "#9ca3af" }}>#{cert.id}</div></div>
      </div>
    </div>
  );
}

export default function CertificadosPage() {
  const user    = getStoredUser();
  const perfil  = normalize(user?.perfil);
  const isGestor = ["coordenador", "supervisor"].includes(perfil);

  const [certs,      setCerts]    = useState([]);
  const [treinamentos, setTrein]  = useState([]);
  const [loading,    setLoading]  = useState(true);
  const [error,      setError]    = useState("");
  const [success,    setSuccess]  = useState("");
  const [emitindo,   setEmitindo] = useState(false);
  const [search,     setSearch]   = useState("");
  const [filterTema, setFilter]   = useState("todos");
  const [showForm,   setShowForm] = useState(false);
  const [form,       setForm]     = useState({ usuario_nome: "", usuario_email: "", treinamento_id: "" });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [cData, tData] = await Promise.all([
          apiFetch("/certificados").catch(() => []),
          isGestor ? apiFetch("/treinamentos").catch(() => []) : Promise.resolve([]),
        ]);
        setCerts(Array.isArray(cData) ? cData : []);
        setTrein(Array.isArray(tData) ? tData : []);
      } catch (err) {
        setError(err.message || "Erro ao carregar certificados.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isGestor]);

  async function handleEmitir() {
    if (!form.treinamento_id || !form.usuario_nome) {
      setError("Treinamento e nome do participante são obrigatórios."); return;
    }
    setEmitindo(true); setError("");
    try {
      const res = await apiFetch("/certificados/emitir", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setCerts((prev) => [res.certificado, ...prev]);
      setSuccess(`Certificado emitido para "${form.usuario_nome}" ✓`);
      setForm({ usuario_nome: "", usuario_email: "", treinamento_id: "" });
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Erro ao emitir certificado.");
    } finally {
      setEmitindo(false);
    }
  }

  function handlePrint(cert) {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Certificado — ${cert.usuario_nome}</title>
      <style>body{font-family:Georgia,serif;max-width:780px;margin:60px auto;color:#111}
      .logo{font-size:13px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:48px}
      .titulo{font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#9ca3af;margin-bottom:16px}
      .nome{font-size:42px;font-weight:bold;color:#0B1220;border-bottom:3px solid #FF6B4A;padding-bottom:12px;margin-bottom:24px}
      .corpo{font-size:17px;line-height:1.8;color:#374151}.tema{font-weight:bold;color:#0B1220}
      .metas{display:flex;gap:40px;margin:36px 0}.meta label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px}
      .meta span{font-size:18px;font-weight:bold;color:#0B1220}.footer{margin-top:60px;font-size:11px;color:#9ca3af}
      @media print{body{margin:20px}}</style></head><body>
      <div class="logo">Tel Centro de Contatos · Portal T&D</div>
      <div class="titulo">Certificado de Conclusão</div>
      <div class="nome">${cert.usuario_nome}</div>
      <div class="corpo">Certificamos que o participante acima concluiu com aproveitamento o treinamento
        <span class="tema"> ${cert.treinamento_tema}</span>${cert.treinamento_cliente ? ` — ${cert.treinamento_cliente}` : ""}.</div>
      <div class="metas">
        ${cert.carga_horaria ? `<div class="meta"><label>Carga horária</label><span>${cert.carga_horaria}h</span></div>` : ""}
        ${cert.frequencia_percentual != null ? `<div class="meta"><label>Frequência</label><span>${Number(cert.frequencia_percentual).toFixed(0)}%</span></div>` : ""}
        ${cert.nota_final != null ? `<div class="meta"><label>Nota final</label><span>${Number(cert.nota_final).toFixed(1)}</span></div>` : ""}
        <div class="meta"><label>Emitido em</label><span>${fmtDate(cert.emitido_em)}</span></div>
      </div>
      <div class="footer">Certificado nº ${cert.id} · Gerado pelo Portal T&D</div>
      </body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  const temas = useMemo(() => (
    [...new Set(certs.map((c) => c.treinamento_tema).filter(Boolean))].sort()
  ), [certs]);

  const filtrados = useMemo(() => {
    const term = normalize(search);
    return certs.filter((c) => {
      const matchTema   = filterTema === "todos" || c.treinamento_tema === filterTema;
      const matchSearch = !term || [c.usuario_nome, c.treinamento_tema, c.treinamento_cliente].join(" ").toLowerCase().includes(term);
      return matchTema && matchSearch;
    });
  }, [certs, filterTema, search]);

  const kpis = useMemo(() => ({
    total:        certs.length,
    participantes: [...new Set(certs.map((c) => c.usuario_email || c.usuario_nome))].length,
    treinamentos:  [...new Set(certs.map((c) => c.treinamento_id))].length,
    freqMedia: certs.filter((c) => c.frequencia_percentual != null).length
      ? (certs.reduce((s, c) => s + Number(c.frequencia_percentual || 0), 0) /
         certs.filter((c) => c.frequencia_percentual != null).length).toFixed(0) : null,
  }), [certs]);

  return (
    <PortalShell>
      <div style={page}>
        <PageHero
          title="Certificados"
          subtitle={isGestor
            ? "Emissão e histórico de certificados de conclusão por turma"
            : "Seus certificados de conclusão de treinamentos"}
          icon="🏆"
        />

        <div style={kpiRow}>
          <div style={kpiCard}><div style={kpiValue}>{kpis.total}</div><div style={kpiLabel}>Certificados emitidos</div></div>
          {isGestor && <>
            <div style={kpiCard}><div style={kpiValue}>{kpis.participantes}</div><div style={kpiLabel}>Participantes certificados</div></div>
            <div style={kpiCard}><div style={kpiValue}>{kpis.treinamentos}</div><div style={kpiLabel}>Treinamentos cobertos</div></div>
          </>}
          {kpis.freqMedia !== null && (
            <div style={kpiCard}><div style={{ ...kpiValue, color: "#FF6B4A" }}>{kpis.freqMedia}%</div><div style={kpiLabel}>Frequência média</div></div>
          )}
        </div>

        {error   && <div style={alertErr}>{error}</div>}
        {success && <div style={alertOk}>{success}</div>}

        <div style={toolbar}>
          <div style={filterRow}>
            <input style={searchInput} placeholder="Buscar participante ou treinamento…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select style={sel} value={filterTema} onChange={(e) => setFilter(e.target.value)}>
              <option value="todos">Todos os treinamentos</option>
              {temas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {isGestor && (
            <button style={btnEmitir} onClick={() => { setShowForm((v) => !v); setError(""); }}>
              {showForm ? "Cancelar" : "+ Emitir certificado"}
            </button>
          )}
        </div>

        {showForm && isGestor && (
          <div style={formCard}>
            <h3 style={formTitle}>Emitir certificado manualmente</h3>
            <div style={formGrid}>
              <div>
                <label style={lbl}>Treinamento *</label>
                <select style={inputField} value={form.treinamento_id}
                  onChange={(e) => setForm({ ...form, treinamento_id: e.target.value })}>
                  <option value="">— Selecione —</option>
                  {treinamentos.map((t) => <option key={t.id} value={t.id}>{t.tema} ({t.cliente || "?"})</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Nome do participante *</label>
                <input style={inputField} placeholder="Nome completo"
                  value={form.usuario_nome} onChange={(e) => setForm({ ...form, usuario_nome: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>E-mail (opcional)</label>
                <input style={inputField} placeholder="email@empresa.com"
                  value={form.usuario_email} onChange={(e) => setForm({ ...form, usuario_email: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button style={btnSalvar} onClick={handleEmitir} disabled={emitindo}>
                {emitindo ? "Emitindo…" : "Emitir certificado"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={empty}>Carregando certificados…</div>
        ) : filtrados.length === 0 ? (
          <div style={empty}>{certs.length === 0 ? "Nenhum certificado emitido ainda." : "Nenhum resultado para os filtros."}</div>
        ) : (
          <div style={certLista}>
            {filtrados.map((cert) => (
              <div key={cert.id} style={certRow}>
                <CertCard cert={cert} />
                <button style={btnImprimir} onClick={() => handlePrint(cert)}>🖨 Imprimir</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

const page = { padding: "28px 32px", maxWidth: 1100, margin: "0 auto" };
const kpiRow = { display: "flex", gap: 16, margin: "24px 0" };
const kpiCard = { flex: 1, background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" };
const kpiValue = { fontSize: 32, fontWeight: 900, color: "#0B1220" };
const kpiLabel = { fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 600 };
const alertErr = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const alertOk  = { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const toolbar  = { display: "flex", gap: 12, alignItems: "center", marginBottom: 20 };
const filterRow = { display: "flex", gap: 12, flex: 1 };
const searchInput = { flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14 };
const sel = { padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, background: "#fff" };
const empty = { textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: 14 };
const certLista = { display: "flex", flexDirection: "column", gap: 16 };
const certRow = { display: "flex", alignItems: "center", gap: 16 };
const certCard = { flex: 1, background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderLeft: "4px solid #FF6B4A" };
const certTopo = { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 };
const certIcone = { fontSize: 28, lineHeight: 1 };
const certNome = { fontWeight: 900, fontSize: 17, color: "#0B1220" };
const certTema = { fontSize: 14, color: "#374151", marginTop: 2 };
const certCliente = { fontSize: 12, color: "#FF6B4A", fontWeight: 700, marginTop: 2 };
const certDataWrap = { textAlign: "right" };
const certDataLabel = { fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: 1 };
const certDataValor = { fontSize: 14, fontWeight: 800, color: "#0B1220" };
const certMetas = { display: "flex", gap: 32, flexWrap: "wrap" };
const metaItem = {};
const metaLabel = { fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 };
const metaValor = { fontSize: 16, fontWeight: 900, color: "#0B1220" };
const btnImprimir = { padding: "9px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnEmitir = { padding: "10px 18px", background: "#FF6B4A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const formCard = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 20 };
const formTitle = { fontSize: 15, fontWeight: 800, color: "#0B1220", margin: "0 0 16px" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 };
const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 };
const inputField = { width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" };
const btnSalvar = { padding: "10px 24px", background: "#0B1220", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 800 };
