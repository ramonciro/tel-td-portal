"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../services/api";

function formatDate(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("pt-BR");
    }
  }
  return String(value);
}

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

const STATUS_OPTIONS = [
  "Ativo",
  "Desistente",
  "Substituído",
  "Transferido",
  "Desligado",
];

function emptyForm() {
  return {
    id: "",
    nome: "",
    matricula: "",
    cliente: "",
    supervisor: "",
    operacao: "",
    data_admissao: "",
    data_entrada_turma: "",
    data_saida_turma: "",
    status: "Ativo",
    observacoes: "",
  };
}

function emptySubstituicao() {
  return {
    open: false,
    origemId: "",
    nome: "",
    matricula: "",
    cliente: "",
    supervisor: "",
    operacao: "",
    data_admissao: "",
    data_entrada_turma: "",
    observacoes: "",
  };
}

export default function ParticipantesTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [substituicao, setSubstituicao] = useState(emptySubstituicao());

  useEffect(() => {
    carregarTudo();
  }, [id]);

  async function carregarTudo() {
    try {
      if (!id) return;
      setLoading(true);
      setErro("");
      setSucesso("");

      const [dadosTreinamento, listaParticipantes] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turmas-participantes?treinamento_id=${id}`).catch(() => []),
      ]);

      setTreinamento(dadosTreinamento || null);
      setParticipantes(Array.isArray(listaParticipantes) ? listaParticipantes : []);

      setForm((prev) =>
        prev.id
          ? prev
          : {
              ...emptyForm(),
              cliente: dadosTreinamento?.cliente || "",
              supervisor: dadosTreinamento?.supervisor || "",
            }
      );
    } catch (err) {
      setErro(err.message || "Erro ao carregar base da turma");
    } finally {
      setLoading(false);
    }
  }

  const resumo = useMemo(() => {
    const ativos = participantes.filter(
      (item) => String(item.status || "Ativo").toLowerCase() === "ativo"
    ).length;
    const inativos = participantes.length - ativos;

    const desistentes = participantes.filter(
      (item) => String(item.status || "").toLowerCase() === "desistente"
    ).length;

    const substituidos = participantes.filter(
      (item) => String(item.status || "").toLowerCase() === "substituído" ||
      String(item.status || "").toLowerCase() === "substituido"
    ).length;

    return {
      total: participantes.length,
      ativos,
      inativos,
      desistentes,
      substituidos,
    };
  }, [participantes]);

  const participantesFiltrados = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();
    if (!termo) return participantes;

    return participantes.filter((item) => {
      const nome = String(item.nome || item.treinando_nome || "").toLowerCase();
      const matricula = String(item.matricula || "").toLowerCase();
      const status = String(item.status || "").toLowerCase();
      return (
        nome.includes(termo) ||
        matricula.includes(termo) ||
        status.includes(termo)
      );
    });
  }, [participantes, busca]);

  function voltar() {
    window.location.href = `/turma/${id}`;
  }

  function abrirCronograma() {
    window.location.href = `/turma/${id}/cronograma`;
  }

  function limparFormulario() {
    setForm({
      ...emptyForm(),
      cliente: treinamento?.cliente || "",
      supervisor: treinamento?.supervisor || "",
    });
  }

  function editarParticipante(item) {
    setForm({
      id: item.id || "",
      nome: item.nome || item.treinando_nome || "",
      matricula: item.matricula || "",
      cliente: item.cliente || treinamento?.cliente || "",
      supervisor: item.supervisor || "",
      operacao: item.operacao || "",
      data_admissao: toInputDate(item.data_admissao),
      data_entrada_turma: toInputDate(item.data_entrada_turma || item.data_entrada),
      data_saida_turma: toInputDate(item.data_saida_turma || item.data_saida),
      status: item.status || "Ativo",
      observacoes: item.observacoes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarParticipante() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const payload = {
        treinamento_id: Number(id),
        nome: form.nome,
        matricula: form.matricula,
        cliente: form.cliente,
        supervisor: form.supervisor,
        operacao: form.operacao,
        data_admissao: form.data_admissao || null,
        data_entrada_turma: form.data_entrada_turma || null,
        data_saida_turma: form.data_saida_turma || null,
        status: form.status,
        observacoes: form.observacoes,
      };

      if (form.id) {
        await apiFetch(`/turmas-participantes/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Participante atualizado com sucesso.");
      } else {
        await apiFetch("/turmas-participantes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Participante adicionado com sucesso.");
      }

      limparFormulario();
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao salvar participante");
    } finally {
      setSalvando(false);
    }
  }

async function importarExcel() {
  try {
    if (!arquivo) {
      setErro("Selecione um arquivo Excel para importar.");
      return;
    }

    setImportando(true);
    setErro("");
    setSucesso("");

    const apiBase = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
    if (!apiBase) {
      throw new Error("A variável NEXT_PUBLIC_API_URL não está configurada.");
    }

    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("treinamento_id", String(id));
    formData.append("treinamento", String(id));

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : "";

    const response = await fetch(
      `${apiBase}/api/turmas-participantes/importar-excel`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }
    );

    const rawText = await response.text();

    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { message: rawText || "Erro ao importar Excel" };
    }

    if (!response.ok) {
      throw new Error(data?.message || "Erro ao importar Excel");
    }

    setSucesso(data?.message || "Participantes importados com sucesso.");
    setArquivo(null);
    await carregarTudo();
  } catch (err) {
    setErro(err.message || "Erro ao importar Excel");
  } finally {
    setImportando(false);
  }
}

  async function inativarParticipante(item) {
    const confirmar = window.confirm(
      `Deseja inativar ${item.nome || item.treinando_nome}?`
    );
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");

      await apiFetch(`/turmas-participantes/${item.id}/inativar`, {
        method: "POST",
        body: JSON.stringify({
          data_saida_turma: new Date().toISOString().slice(0, 10),
          status: "Desistente",
        }),
      });

      setSucesso("Participante inativado com sucesso.");
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao inativar participante");
    }
  }

  function abrirSubstituicao(item) {
    setSubstituicao({
      open: true,
      origemId: item.id || "",
      nome: "",
      matricula: "",
      cliente: item.cliente || treinamento?.cliente || "",
      supervisor: item.supervisor || treinamento?.supervisor || "",
      operacao: item.operacao || "",
      data_admissao: "",
      data_entrada_turma: "",
      observacoes: "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmarSubstituicao() {
    try {
      if (!substituicao.origemId) {
        setErro("Selecione o participante de origem para substituir.");
        return;
      }

      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch(`/turmas-participantes/${substituicao.origemId}/substituir`, {
        method: "POST",
        body: JSON.stringify({
          nome: substituicao.nome,
          matricula: substituicao.matricula,
          cliente: substituicao.cliente,
          supervisor: substituicao.supervisor,
          operacao: substituicao.operacao,
          data_admissao: substituicao.data_admissao || null,
          data_entrada_turma: substituicao.data_entrada_turma || null,
          observacoes: substituicao.observacoes || "",
        }),
      });

      setSucesso("Substituição realizada com sucesso.");
      setSubstituicao(emptySubstituicao());
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao substituir participante");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando base da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar para gestão da turma
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>Base da turma</div>
        <h1 style={heroTitle}>{treinamento?.tema || "Participantes"}</h1>
        <p style={heroSubtitle}>
          Importe a turma uma vez, mantenha a base ativa e faça substituições sem perder o histórico.
        </p>

        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Período"
            value={`${formatDate(
              treinamento?.data_inicio || treinamento?.data
            )} até ${formatDate(treinamento?.data_fim)}`}
          />
          <InfoCard label="Turma" value={treinamento?.tema || "-"} />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Participantes" value={resumo.total} />
        <StatCard title="Ativos" value={resumo.ativos} />
        <StatCard title="Inativos" value={resumo.inativos} />
        <StatCard title="Desistentes" value={resumo.desistentes} />
        <StatCard title="Substituídos" value={resumo.substituidos} />
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Importar treinandos da turma</h2>
            <p style={sectionSubtitle}>
              Importe a base da turma via Excel uma única vez e reutilize nas aulas do cronograma.
            </p>
          </div>
        </div>

        <div style={importRow}>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            style={fileInput}
          />

          <button style={btnPrimary} onClick={importarExcel} disabled={importando}>
            {importando ? "Importando..." : "Importar Excel"}
          </button>

          <button style={btnSecondary} onClick={abrirCronograma}>
            Abrir cronograma
          </button>
        </div>

        <div style={helperBox}>
          Colunas recomendadas: <strong>nome</strong>, <strong>matricula</strong>, <strong>cliente</strong>, <strong>supervisor</strong>, <strong>operacao</strong>, <strong>data_admissao</strong>.
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>
              {form.id ? "Editar participante" : "Adicionar participante"}
            </h2>
            <p style={sectionSubtitle}>
              Cadastre manualmente, ajuste dados e controle entrada/saída da base da turma.
            </p>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Nome">
            <input
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              style={field}
            />
          </Field>

          <Field label="Matrícula">
            <input
              value={form.matricula}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, matricula: e.target.value }))
              }
              style={field}
            />
          </Field>

          <Field label="Cliente">
            <input
              value={form.cliente}
              onChange={(e) => setForm((prev) => ({ ...prev, cliente: e.target.value }))}
              style={field}
            />
          </Field>

          <Field label="Supervisor">
            <input
              value={form.supervisor}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, supervisor: e.target.value }))
              }
              style={field}
            />
          </Field>

          <Field label="Operação">
            <input
              value={form.operacao}
              onChange={(e) => setForm((prev) => ({ ...prev, operacao: e.target.value }))}
              style={field}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              style={field}
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Data admissão">
            <input
              type="date"
              value={form.data_admissao}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, data_admissao: e.target.value }))
              }
              style={field}
            />
          </Field>

          <Field label="Entrada na turma">
            <input
              type="date"
              value={form.data_entrada_turma}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, data_entrada_turma: e.target.value }))
              }
              style={field}
            />
          </Field>

          <Field label="Saída da turma">
            <input
              type="date"
              value={form.data_saida_turma}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, data_saida_turma: e.target.value }))
              }
              style={field}
            />
          </Field>

          <Field label="Observações" full>
            <textarea
              value={form.observacoes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, observacoes: e.target.value }))
              }
              style={textarea}
            />
          </Field>
        </div>

        <div style={actionsRowLeft}>
          <button style={btnPrimary} onClick={salvarParticipante} disabled={salvando}>
            {salvando
              ? "Salvando..."
              : form.id
              ? "Salvar alterações"
              : "Adicionar participante"}
          </button>

          <button style={btnSecondary} onClick={limparFormulario}>
            Limpar formulário
          </button>
        </div>
      </div>

      {substituicao.open ? (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <h2 style={sectionTitle}>Substituir participante</h2>
              <p style={sectionSubtitle}>
                O histórico do participante anterior é mantido. O novo entra a partir da data informada.
              </p>
            </div>
          </div>

          <div style={formGrid}>
            <Field label="Nome do substituto">
              <input
                value={substituicao.nome}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, nome: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Matrícula">
              <input
                value={substituicao.matricula}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, matricula: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Cliente">
              <input
                value={substituicao.cliente}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, cliente: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Supervisor">
              <input
                value={substituicao.supervisor}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, supervisor: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Operação">
              <input
                value={substituicao.operacao}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, operacao: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Data admissão">
              <input
                type="date"
                value={substituicao.data_admissao}
                onChange={(e) =>
                  setSubstituicao((prev) => ({ ...prev, data_admissao: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Entrada na turma">
              <input
                type="date"
                value={substituicao.data_entrada_turma}
                onChange={(e) =>
                  setSubstituicao((prev) => ({
                    ...prev,
                    data_entrada_turma: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Observações" full>
              <textarea
                value={substituicao.observacoes}
                onChange={(e) =>
                  setSubstituicao((prev) => ({
                    ...prev,
                    observacoes: e.target.value,
                  }))
                }
                style={textarea}
              />
            </Field>
          </div>

          <div style={actionsRowLeft}>
            <button style={btnPrimary} onClick={confirmarSubstituicao} disabled={salvando}>
              {salvando ? "Salvando..." : "Confirmar substituição"}
            </button>
            <button style={btnSecondary} onClick={() => setSubstituicao(emptySubstituicao())}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Participantes da turma</h2>
            <p style={sectionSubtitle}>
              Controle a base ativa da turma e faça substituições sem perder o histórico.
            </p>
          </div>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar participante"
            style={searchInput}
          />
        </div>

        <div style={listaGrid}>
          {participantesFiltrados.map((item) => {
            const status = String(item.status || "Ativo");
            const ativo = status.toLowerCase() === "ativo";

            return (
              <div key={item.id} style={cardParticipante}>
                <div style={cardHeader}>
                  <div>
                    <div style={nomeParticipante}>
                      {item.nome || item.treinando_nome || "-"}
                    </div>
                    <div style={subParticipante}>
                      {item.matricula ? `Matrícula: ${item.matricula}` : "Sem matrícula"}
                    </div>
                  </div>

                  <div
                    style={{
                      ...pillStatus,
                      background: ativo ? "#dcfce7" : "#fee2e2",
                      color: ativo ? "#166534" : "#b91c1c",
                      border: ativo
                        ? "1px solid #bbf7d0"
                        : "1px solid #fecaca",
                    }}
                  >
                    {status}
                  </div>
                </div>

                <div style={miniResumo}>
                  <MiniInfo label="Entrada" value={formatDate(item.data_entrada_turma || item.data_entrada)} />
                  <MiniInfo label="Saída" value={formatDate(item.data_saida_turma || item.data_saida)} />
                  <MiniInfo label="Operação" value={item.operacao || "-"} />
                </div>

                <div style={participantMeta}>
                  <strong>Supervisor:</strong> {item.supervisor || "-"}
                </div>

                {item.observacoes ? (
                  <div style={participantMeta}>
                    <strong>Obs.:</strong> {item.observacoes}
                  </div>
                ) : null}

                <div style={participantActions}>
                  <button style={miniBtn} onClick={() => editarParticipante(item)}>
                    Editar
                  </button>

                  <button style={miniBtn} onClick={() => abrirSubstituicao(item)}>
                    Substituir
                  </button>

                  <button style={miniBtnDanger} onClick={() => inativarParticipante(item)}>
                    Inativar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label: title, children, full = false }) {
  return (
    <div style={{ ...fieldWrap, gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={label}>{title}</label>
      {children}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={infoCard}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div style={miniInfo}>
      <div style={miniLabel}>{label}</div>
      <div style={miniValue}>{value}</div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
};

const loadingWrap = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  color: "#334155",
  fontWeight: 700,
  background: "#f8fafc",
};

const topBar = {
  marginBottom: 14,
};

const btnVoltar = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const hero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  width: "fit-content",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
};

const heroSubtitle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroGrid = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const infoCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 14,
};

const infoLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "rgba(255,255,255,.68)",
};

const infoValue = {
  marginTop: 6,
  fontWeight: 800,
  fontSize: 18,
};

const statsGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
};

const statTitle = {
  color: "#64748b",
  fontSize: 13,
};

const statValue = {
  marginTop: 6,
  fontSize: 30,
  fontWeight: 800,
  color: "#0f172a",
};

const sectionCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const sectionTitle = {
  margin: 0,
  fontSize: 24,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.5,
};

const importRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const helperBox = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#475569",
};

const fileInput = {
  maxWidth: "100%",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
  letterSpacing: ".04em",
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  background: "#fff",
  outline: "none",
};

const textarea = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 92,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "12px",
  background: "#fff",
  outline: "none",
  resize: "vertical",
};

const actionsRowLeft = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 700,
};

const searchInput = {
  width: 260,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  outline: "none",
};

const listaGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

const cardParticipante = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#f8fafc",
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const nomeParticipante = {
  fontWeight: 800,
  fontSize: 18,
  color: "#0f172a",
};

const subParticipante = {
  marginTop: 4,
  color: "#64748b",
};

const pillStatus = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const miniResumo = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const miniInfo = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
};

const miniLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  color: "#64748b",
  fontWeight: 800,
};

const miniValue = {
  marginTop: 6,
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const participantMeta = {
  marginTop: 12,
  color: "#475569",
  lineHeight: 1.5,
};

const participantActions = {
  marginTop: 16,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const miniBtn = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const miniBtnDanger = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const errorBox = {
  marginTop: 16,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  marginTop: 16,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};
