"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../../services/api";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function normalizeStatus(value) {
  const text = String(value || "").toLowerCase().trim();
  if (["presente", "ausente", "justificado", "pendente"].includes(text)) return text;
  return "pendente";
}

export default function ChamadaTurmaPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id;
  const turmaAulaId = searchParams.get("turma_aula_id");

  const [treinamento, setTreinamento] = useState(null);
  const [aula, setAula] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, turmaAulaId]);

  async function carregar() {
    try {
      if (!id || !turmaAulaId) return;
      setLoading(true);
      setErro("");
      setSucesso("");

      const [dadosTreinamento, listaAulas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
      ]);

      setTreinamento(dadosTreinamento || null);

      const aulaAtual = (Array.isArray(listaAulas) ? listaAulas : []).find(
        (item) => String(item.id) === String(turmaAulaId)
      );
      setAula(aulaAtual || null);

      await apiFetch(`/presenca-aulas/inicializar`, {
        method: "POST",
        body: JSON.stringify({ turma_aula_id: Number(turmaAulaId) }),
      }).catch(() => null);

      const lista = await apiFetch(`/presenca-aulas?turma_aula_id=${turmaAulaId}`).catch(() => []);
      setRegistros(Array.isArray(lista) ? lista : []);
    } catch (err) {
      setErro(err.message || "Erro ao carregar a chamada da turma.");
    } finally {
      setLoading(false);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return registros;
    return registros.filter((item) =>
      String(item.treinando_nome || "").toLowerCase().includes(termo)
    );
  }, [registros, busca]);

  const resumo = useMemo(() => {
    const total = registros.length;
    const presentes = registros.filter((item) => normalizeStatus(item.status) === "presente").length;
    const ausentes = registros.filter((item) => normalizeStatus(item.status) === "ausente").length;
    const justificados = registros.filter((item) => normalizeStatus(item.status) === "justificado").length;
    const pendentes = registros.filter((item) => normalizeStatus(item.status) === "pendente").length;
    return { total, presentes, ausentes, justificados, pendentes };
  }, [registros]);

  function atualizarRegistro(index, campo, valor) {
    setRegistros((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [campo]: valor } : item))
    );
  }

  async function salvar() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch(`/presenca-aulas/salvar`, {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(turmaAulaId),
          registros: registros.map((item) => ({
            treinando_nome: item.treinando_nome,
            status: normalizeStatus(item.status),
            justificativa: item.justificativa || null,
          })),
        }),
      });

      setSucesso("Chamada da turma salva com sucesso.");
      await carregar();
    } catch (err) {
      setErro(err.message || "Erro ao salvar a chamada.");
    } finally {
      setSalvando(false);
    }
  }

  function voltar() {
    window.location.href = `/turma/${id}?turma_aula_id=${turmaAulaId}`;
  }

  if (!id || !turmaAulaId) {
    return <div style={loadingWrap}>Selecione uma aula para lançar a chamada.</div>;
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando chamada da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>← Voltar para gestão da turma</button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>Chamada da turma</div>
        <h1 style={heroTitle}>{treinamento?.tema || "Turma"}</h1>
        <p style={heroSubtitle}>Lançamento da presença por aula, com atualização imediata dos indicadores da turma.</p>
        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={aula?.instrutor_responsavel || treinamento?.instrutor || "-"} />
          <InfoCard label="Aula" value={aula?.titulo || "-"} />
          <InfoCard label="Data" value={formatDate(aula?.data_aula)} />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Total" value={resumo.total} />
        <StatCard title="Presentes" value={resumo.presentes} />
        <StatCard title="Ausentes" value={resumo.ausentes} />
        <StatCard title="Justificados" value={resumo.justificados} />
        <StatCard title="Pendentes" value={resumo.pendentes} />
      </div>

      <div style={sectionCard}>
        <div style={toolbar}>
          <div>
            <h2 style={sectionTitle}>Lista de chamada</h2>
            <p style={sectionSubtitle}>Atualize o status de cada treinando e salve a aula selecionada.</p>
          </div>
          <div style={toolbarActions}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar treinando"
              style={field}
            />
            <button style={btnPrimary} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar chamada"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Treinando</th>
                <th style={th}>Status</th>
                <th style={th}>Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((item, index) => (
                <tr key={`${item.treinando_nome}-${index}`}>
                  <td style={td}>{item.treinando_nome}</td>
                  <td style={td}>
                    <select
                      style={select}
                      value={normalizeStatus(item.status)}
                      onChange={(e) => atualizarRegistro(index, "status", e.target.value)}
                    >
                      <option value="pendente">Pendente</option>
                      <option value="presente">Presente</option>
                      <option value="ausente">Ausente</option>
                      <option value="justificado">Justificado</option>
                    </select>
                  </td>
                  <td style={td}>
                    <input
                      style={field}
                      value={item.justificativa || ""}
                      onChange={(e) => atualizarRegistro(index, "justificativa", e.target.value)}
                      placeholder="Observação / justificativa"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return <div style={infoCard}><div style={infoLabel}>{label}</div><div style={infoValue}>{value}</div></div>;
}
function StatCard({ title, value }) {
  return <div style={statCard}><div style={statTitle}>{title}</div><div style={statValue}>{value}</div></div>;
}

const page = { minHeight: "100vh", background: "#f8fafc", padding: 24 };
const loadingWrap = { minHeight: "100vh", display: "grid", placeItems: "center", color: "#334155", fontWeight: 700, background: "#f8fafc" };
const topBar = { marginBottom: 14 };
const btnVoltar = { background: "#ffffff", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 };
const hero = { background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)", borderRadius: 22, padding: 24, color: "#fff", boxShadow: "0 18px 36px rgba(29,78,216,.18)" };
const heroBadge = { display: "inline-block", width: "fit-content", background: "rgba(255,255,255,.14)", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 };
const heroTitle = { margin: 0, fontSize: 34, lineHeight: 1.05 };
const heroSubtitle = { margin: "8px 0 0", color: "rgba(255,255,255,.84)", lineHeight: 1.6 };
const heroGrid = { marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const infoCard = { background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 14 };
const infoLabel = { fontSize: 12, textTransform: "uppercase", color: "rgba(255,255,255,.68)" };
const infoValue = { marginTop: 6, fontWeight: 800, fontSize: 18 };
const statsGrid = { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 };
const statCard = { background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #e2e8f0" };
const statTitle = { color: "#64748b", fontSize: 13 };
const statValue = { marginTop: 6, fontSize: 30, fontWeight: 800, color: "#0f172a" };
const sectionCard = { marginTop: 16, background: "#fff", borderRadius: 20, padding: 20, border: "1px solid #e2e8f0" };
const sectionTitle = { margin: 0, color: "#0f172a" };
const sectionSubtitle = { margin: "6px 0 0", color: "#64748b" };
const toolbar = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 };
const toolbarActions = { display: "flex", gap: 10, flexWrap: "wrap" };
const field = { minWidth: 220, borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px", background: "#fff" };
const select = { width: "100%", borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px", background: "#fff" };
const btnPrimary = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse" };
const th = { textAlign: "left", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: 13 };
const td = { padding: "12px 10px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", verticalAlign: "top" };
const errorBox = { marginTop: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 14, borderRadius: 12, fontWeight: 700 };
const successBox = { marginTop: 16, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", padding: 14, borderRadius: 12, fontWeight: 700 };
