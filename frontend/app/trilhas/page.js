"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, chart } from "../../lib/theme";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEtapas(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(/\n|,|;|\|/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferAudience(item) {
  const haystack = [item?.titulo, item?.descricao, ...(Array.isArray(item?.etapas) ? item.etapas : [])]
    .join(" ")
    .toLowerCase();

  const audiences = [];
  if (haystack.includes("instrutor")) audiences.push("Instrutores");
  if (haystack.includes("supervisor")) audiences.push("Supervisores");
  if (haystack.includes("coordena") || haystack.includes("lideran")) audiences.push("Coordenação");

  if (!audiences.length) return ["Instrutores", "Supervisores"];
  return [...new Set(audiences)];
}

function getStatus(item) {
  const etapas = parseEtapas(item?.etapas);
  if (!etapas.length) return "Em estruturação";
  if (etapas.length >= 5) return "Estruturada";
  return "Ativa";
}

function statusTone(status) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
    whiteSpace: "nowrap",
  };

  if (status === "Estruturada") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }
  if (status === "Ativa") {
    return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  }
  return { ...base, background: "#ffedd5", color: "#9a3412" };
}

function estimateHours(etapas) {
  return etapas.length * 2;
}

const initialForm = {
  cliente: "",
  titulo: "",
  descricao: "",
  etapasText: "",
};

export default function TrilhasPage() {
  const [trilhas, setTrilhas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [activeTab, setActiveTab] = useState("catalogo");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("todos");
  const [audienceFilter, setAudienceFilter] = useState("todos");
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [trilhasData, usuariosData] = await Promise.all([
        apiFetch("/trilhas").catch(() => []),
        apiFetch("/usuarios").catch(() => []),
      ]);
      setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
    } catch (err) {
      setError(err.message || "Erro ao carregar trilhas.");
      setTrilhas([]);
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }

  const trilhasEnriquecidas = useMemo(() => {
    return trilhas.map((item) => {
      const etapas = parseEtapas(item.etapas);
      const audiences = inferAudience({ ...item, etapas });
      return {
        ...item,
        etapas,
        audiences,
        status: getStatus({ ...item, etapas }),
        horasEstimadas: estimateHours(etapas),
      };
    });
  }, [trilhas]);

  const colaboradores = useMemo(() => {
    const base = usuarios.filter((item) => {
      const perfil = normalize(item?.perfil);
      return ["instrutor", "supervisor", "coordenador"].includes(perfil);
    });

    return {
      instrutores: base.filter((item) => normalize(item.perfil) === "instrutor"),
      supervisores: base.filter((item) => normalize(item.perfil) === "supervisor"),
      coordenadores: base.filter((item) => normalize(item.perfil) === "coordenador"),
      total: base,
    };
  }, [usuarios]);

  const clients = useMemo(() => {
    const values = [...new Set(trilhasEnriquecidas.map((item) => item.cliente || "GLOBAL"))].sort();
    return values;
  }, [trilhasEnriquecidas]);

  const audienceOptions = ["Instrutores", "Supervisores", "Coordenação"];

  const filteredTrilhas = useMemo(() => {
    const term = normalize(search);

    return trilhasEnriquecidas.filter((item) => {
      const matchesClient = clientFilter === "todos" || (item.cliente || "GLOBAL") === clientFilter;
      const matchesAudience =
        audienceFilter === "todos" || item.audiences.includes(audienceFilter);
      const matchesSearch =
        !term ||
        [item.titulo, item.descricao, item.cliente, ...item.etapas, ...item.audiences]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesClient && matchesAudience && matchesSearch;
    });
  }, [trilhasEnriquecidas, clientFilter, audienceFilter, search]);

  const kpis = useMemo(() => {
    const total = trilhasEnriquecidas.length;
    const estruturadas = trilhasEnriquecidas.filter((item) => item.status === "Estruturada").length;
    const ativas = trilhasEnriquecidas.filter((item) => item.status === "Ativa").length;
    const emEstruturacao = trilhasEnriquecidas.filter((item) => item.status === "Em estruturação").length;
    const horasEstimadas = trilhasEnriquecidas.reduce((acc, item) => acc + item.horasEstimadas, 0);
    const publicosCobertos = new Set(trilhasEnriquecidas.flatMap((item) => item.audiences)).size;

    return {
      total,
      estruturadas,
      ativas,
      emEstruturacao,
      horasEstimadas,
      publicosCobertos,
    };
  }, [trilhasEnriquecidas]);

  const publicoRows = useMemo(() => {
    const config = [
      {
        label: "Instrutores",
        usuarios: colaboradores.instrutores,
        hint: "Trilhas voltadas à condução de sala, didática, materiais e gestão de turma.",
      },
      {
        label: "Supervisores",
        usuarios: colaboradores.supervisores,
        hint: "Trilhas voltadas à gestão de instrutores, indicadores e acompanhamento operacional.",
      },
      {
        label: "Coordenação",
        usuarios: colaboradores.coordenadores,
        hint: "Acompanhamento gerencial, coaching e leitura executiva da operação.",
      },
    ];

    return config.map((item) => {
      const trilhasRelacionadas = trilhasEnriquecidas.filter((trilha) => trilha.audiences.includes(item.label));
      return {
        ...item,
        trilhasRelacionadas,
        horas: trilhasRelacionadas.reduce((acc, trilha) => acc + trilha.horasEstimadas, 0),
      };
    });
  }, [colaboradores, trilhasEnriquecidas]);

  const topAlerts = useMemo(() => {
    const messages = [];
    if (!colaboradores.instrutores.length) {
      messages.push("Nenhum instrutor cadastrado no portal para vinculação de trilhas.");
    }
    if (!colaboradores.supervisores.length) {
      messages.push("Nenhum supervisor cadastrado no portal para acompanhar trilhas.");
    }
    if (kpis.emEstruturacao > 0) {
      messages.push(`${kpis.emEstruturacao} trilha(s) ainda estão em estruturação e pedem complemento de etapas.`);
    }
    if (!messages.length) {
      messages.push("Base pronta para estruturar trilhas por público e evoluir a governança interna.");
    }
    return messages;
  }, [colaboradores, kpis]);

  function resetForm() {
    setForm(initialForm);
    setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      cliente: item.cliente || "",
      titulo: item.titulo || "",
      descricao: item.descricao || "",
      etapasText: item.etapas.join("\n"),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        cliente: form.cliente.trim(),
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        etapas: parseEtapas(form.etapasText),
      };

      if (!payload.cliente || !payload.titulo) {
        throw new Error("Preencha cliente e título da trilha.");
      }

      if (editingId) {
        await apiFetch(`/trilhas/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSuccess("Trilha atualizada com sucesso.");
      } else {
        await apiFetch("/trilhas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Trilha cadastrada com sucesso.");
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || "Erro ao salvar trilha.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Deseja excluir esta trilha?");
    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");
      await apiFetch(`/trilhas/${id}`, { method: "DELETE" });
      setSuccess("Trilha excluída com sucesso.");
      await loadData();
    } catch (err) {
      setError(err.message || "Erro ao excluir trilha.");
    }
  }

  return (
    <PortalShell
      title="Trilhas"
      subtitle="Ambiente para organizar cursos e atividades por público interno, com visual mais executivo e foco em desenvolvimento de instrutores e supervisores."
      topRight={
        <div style={heroBadge}>Estrutura interna de capacitação</div>
      }
    >
      <div style={pageGrid}>
        {error ? <div style={errorBox}>{error}</div> : null}
        {success ? <div style={successBox}>{success}</div> : null}

        <section style={exclusiveHero}>
          <div style={heroHeaderRow}>
            <div>
              <div style={eyebrow}>Trilhas de desenvolvimento</div>
              <h2 style={heroTitle}>Catálogo com visão por público, cobertura e prontidão de uso</h2>
              <p style={heroText}>
                Estruture as jornadas internas do portal para instrutores, supervisores e coordenação,
                mantendo uma leitura próxima ao padrão atual, mas com um visual mais nobre e gerencial.
              </p>
            </div>

            <div style={miniPanel}>
              <div style={miniPanelLabel}>Públicos priorizados</div>
              <div style={miniPanelValue}>Instrutores • Supervisores • Coordenação</div>
              <div style={miniPanelSub}>Com base nos usuários já cadastrados no portal</div>
            </div>
          </div>

          <div style={statsGrid}>
            <StatCard title="Trilhas" value={fmt(kpis.total)} subtitle="Base cadastrada" accent={chart.blue} />
            <StatCard title="Estruturadas" value={fmt(kpis.estruturadas)} subtitle="Com maior maturidade" accent={colors.success} />
            <StatCard title="Ativas" value={fmt(kpis.ativas)} subtitle="Em uso e evolução" accent={chart.teal} />
            <StatCard title="Em estruturação" value={fmt(kpis.emEstruturacao)} subtitle="Pedem complemento" accent={colors.warning} />
            <StatCard title="Públicos cobertos" value={fmt(kpis.publicosCobertos)} subtitle="Perfis atendidos" accent={chart.purple} />
            <StatCard title="Horas estimadas" value={fmt(kpis.horasEstimadas)} subtitle="Carga sugerida do catálogo" accent={chart.cyan} />
          </div>
        </section>

        <div style={tabRow}>
          {[
            ["catalogo", "Catálogo de trilhas"],
            ["publicos", "Acompanhamento por público"],
            ["cadastro", editingId ? "Editar trilha" : "Nova trilha"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{ ...tabButton, ...(activeTab === id ? tabButtonActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "catalogo" ? (
          <>
            <SectionCard
              title="Filtros e leitura rápida"
              subtitle="Use os filtros para ajustar o catálogo por cliente, público e busca textual."
            >
              <div style={filterGrid}>
                <div style={fieldWrap}>
                  <label style={label}>Busca</label>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar trilha, cliente ou etapa"
                    style={input}
                  />
                </div>
                <div style={fieldWrap}>
                  <label style={label}>Cliente</label>
                  <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={input}>
                    <option value="todos">Todos</option>
                    {clients.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label style={label}>Público</label>
                  <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)} style={input}>
                    <option value="todos">Todos</option>
                    {audienceOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            <div style={twoCol}>
              <SectionCard title="Leitura gerencial" subtitle="Pontos rápidos para alinhar evolução e cobertura do catálogo.">
                <div style={alertList}>
                  {topAlerts.map((item, index) => (
                    <div key={index} style={alertItem}>{item}</div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Cobertura por público" subtitle="Leitura resumida do volume de trilhas aplicáveis por perfil.">
                <div style={miniList}>
                  {publicoRows.map((item) => (
                    <div key={item.label} style={miniListItem}>
                      <div style={miniListTop}>
                        <strong>{item.label}</strong>
                        <span>{fmt(item.trilhasRelacionadas.length)} trilha(s)</span>
                      </div>
                      <div style={miniMuted}>{fmt(item.usuarios.length)} usuário(s) no portal • {fmt(item.horas)}h estimadas</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Catálogo de trilhas"
              subtitle={loading ? "Carregando base..." : `${fmt(filteredTrilhas.length)} registro(s) encontrado(s)`}
            >
              {loading ? (
                <div style={emptyState}>Carregando trilhas...</div>
              ) : filteredTrilhas.length ? (
                <div style={catalogGrid}>
                  {filteredTrilhas.map((item) => (
                    <article key={item.id} style={catalogCard}>
                      <div style={cardTopRow}>
                        <span style={statusTone(item.status)}>{item.status}</span>
                        <span style={hoursBadge}>{fmt(item.horasEstimadas)}h estimadas</span>
                      </div>

                      <div style={cardTitle}>{item.titulo || "Sem título"}</div>
                      <div style={cardMeta}>{item.cliente || "GLOBAL"}</div>
                      <p style={cardText}>{item.descricao || "Sem descrição cadastrada."}</p>

                      <div style={chipWrap}>
                        {item.audiences.map((audience) => (
                          <span key={audience} style={audienceChip}>{audience}</span>
                        ))}
                      </div>

                      <div style={stepsTitle}>Etapas da trilha</div>
                      <div style={stepsWrap}>
                        {item.etapas.length ? item.etapas.slice(0, 6).map((step, index) => (
                          <div key={`${item.id}-${index}`} style={stepItem}>{index + 1}. {step}</div>
                        )) : <div style={emptySteps}>Cadastre as etapas para estruturar a jornada.</div>}
                        {item.etapas.length > 6 ? <div style={moreSteps}>+ {item.etapas.length - 6} etapa(s)</div> : null}
                      </div>

                      <div style={actionsRow}>
                        <button type="button" onClick={() => { startEdit(item); setActiveTab("cadastro"); }} style={secondaryButton}>Editar</button>
                        <button type="button" onClick={() => handleDelete(item.id)} style={dangerButton}>Excluir</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={emptyState}>Nenhuma trilha encontrada para os filtros selecionados.</div>
              )}
            </SectionCard>
          </>
        ) : null}

        {activeTab === "publicos" ? (
          <SectionCard
            title="Acompanhamento por público"
            subtitle="Leitura separada para instrutores, supervisores e coordenação, já alinhada ao uso real do portal."
          >
            <div style={publicGrid}>
              {publicoRows.map((item) => (
                <div key={item.label} style={publicCard}>
                  <div style={publicHeader}>
                    <div>
                      <div style={publicTitle}>{item.label}</div>
                      <div style={publicSub}>{item.hint}</div>
                    </div>
                    <span style={publicBadge}>{fmt(item.usuarios.length)} usuário(s)</span>
                  </div>

                  <div style={publicStatsRow}>
                    <div style={publicStatBox}>
                      <strong>{fmt(item.trilhasRelacionadas.length)}</strong>
                      <span>Trilhas relacionadas</span>
                    </div>
                    <div style={publicStatBox}>
                      <strong>{fmt(item.horas)}</strong>
                      <span>Horas estimadas</span>
                    </div>
                  </div>

                  <div style={subsectionTitle}>Trilhas sugeridas</div>
                  <div style={stackList}>
                    {item.trilhasRelacionadas.length ? item.trilhasRelacionadas.map((trilha) => (
                      <div key={trilha.id} style={stackItem}>
                        <div style={stackMain}>{trilha.titulo}</div>
                        <div style={stackSub}>{trilha.cliente || "GLOBAL"} • {trilha.etapas.length} etapa(s)</div>
                      </div>
                    )) : <div style={emptySteps}>Nenhuma trilha vinculada por leitura textual até o momento.</div>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {activeTab === "cadastro" ? (
          <SectionCard
            title={editingId ? "Editar trilha" : "Cadastrar nova trilha"}
            subtitle="Cadastro simples, mantendo a base atual e já preparando o catálogo para a expansão das páginas."
          >
            <form onSubmit={handleSubmit} style={formGrid}>
              <div style={fieldWrap}>
                <label style={label}>Cliente</label>
                <input value={form.cliente} onChange={(e) => setForm((prev) => ({ ...prev, cliente: e.target.value }))} style={input} placeholder="Ex.: SAFRA, CREA, DASA ou GLOBAL" />
              </div>
              <div style={fieldWrap}>
                <label style={label}>Título da trilha</label>
                <input value={form.titulo} onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))} style={input} placeholder="Ex.: Trilha de Formação de Instrutores" />
              </div>
              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} style={textarea} placeholder="Objetivo, aplicação e público esperado da trilha" />
              </div>
              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Etapas da trilha</label>
                <textarea value={form.etapasText} onChange={(e) => setForm((prev) => ({ ...prev, etapasText: e.target.value }))} style={textareaLarge} placeholder={"Liste uma etapa por linha\nEx.: Didática para adultos\nGestão de turma\nFeedback estruturado"} />
              </div>

              <div style={formActions}>
                <button type="submit" style={primaryButton} disabled={saving}>
                  {saving ? "Salvando..." : editingId ? "Atualizar trilha" : "Salvar trilha"}
                </button>
                <button type="button" style={secondaryButton} onClick={resetForm}>
                  Limpar
                </button>
              </div>
            </form>
          </SectionCard>
        ) : null}
      </div>
    </PortalShell>
  );
}

const pageGrid = {
  display: "grid",
  gap: 14,
};

const exclusiveHero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #38bdf8 100%)",
  borderRadius: 24,
  padding: 22,
  color: "#ffffff",
  boxShadow: "0 16px 32px rgba(37,99,235,0.18)",
};

const heroHeaderRow = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 320px)",
  gap: 16,
  alignItems: "start",
};

const eyebrow = {
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.16)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const heroTitle = {
  margin: "12px 0 8px",
  fontSize: 28,
  lineHeight: 1.1,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,0.9)",
  lineHeight: 1.55,
  maxWidth: 760,
};

const miniPanel = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 20,
  padding: 16,
  backdropFilter: "blur(10px)",
};

const miniPanelLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  opacity: 0.85,
  fontWeight: 800,
};

const miniPanelValue = {
  marginTop: 8,
  fontSize: 18,
  lineHeight: 1.25,
  fontWeight: 900,
};

const miniPanelSub = {
  marginTop: 8,
  fontSize: 13,
  color: "rgba(255,255,255,0.82)",
  lineHeight: 1.45,
};

const heroBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginTop: 18,
};

const tabRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const tabButton = {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const tabButtonActive = {
  background: "#1d4ed8",
  color: "#ffffff",
  borderColor: "#1d4ed8",
  boxShadow: "0 10px 20px rgba(37,99,235,0.18)",
};

const filterGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const input = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
  background: "#ffffff",
};

const textarea = {
  ...input,
  minHeight: 96,
  resize: "vertical",
};

const textareaLarge = {
  ...textarea,
  minHeight: 160,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

const alertList = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  color: "#334155",
  lineHeight: 1.45,
};

const miniList = {
  display: "grid",
  gap: 10,
};

const miniListItem = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
};

const miniListTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 14,
  color: "#0f172a",
};

const miniMuted = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const catalogGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
  gap: 12,
};

const catalogCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  padding: 16,
  display: "grid",
  gap: 12,
  boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
};

const cardTopRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const hoursBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 11,
};

const cardTitle = {
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 900,
  color: "#0f172a",
};

const cardMeta = {
  fontSize: 13,
  color: "#64748b",
  fontWeight: 700,
};

const cardText = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
  fontSize: 14,
};

const chipWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const audienceChip = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#334155",
  fontWeight: 800,
  fontSize: 12,
};

const stepsTitle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0f172a",
};

const stepsWrap = {
  display: "grid",
  gap: 8,
};

const stepItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  color: "#334155",
};

const moreSteps = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1d4ed8",
};

const emptySteps = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const actionsRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryButton = {
  border: 0,
  background: "#1d4ed8",
  color: "#ffffff",
  borderRadius: 12,
  padding: "12px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButton = {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  borderRadius: 12,
  padding: "12px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 12,
  padding: "12px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const publicGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const publicCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  padding: 16,
  display: "grid",
  gap: 14,
};

const publicHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "start",
};

const publicTitle = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const publicSub = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.45,
};

const publicBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 12,
};

const publicStatsRow = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const publicStatBox = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 4,
};

const subsectionTitle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0f172a",
};

const stackList = {
  display: "grid",
  gap: 8,
};

const stackItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
};

const stackMain = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 13,
};

const stackSub = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const formActions = {
  gridColumn: "1 / -1",
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  padding: 14,
  borderRadius: 14,
  fontWeight: 700,
};

const successBox = {
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: 14,
  borderRadius: 14,
  fontWeight: 700,
};

const emptyState = {
  padding: 22,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#64748b",
  textAlign: "center",
};
