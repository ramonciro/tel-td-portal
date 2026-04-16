"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiDownload, apiFetch } from "../../../../services/api";
import { formatDateBR } from "../../../../lib/date";

function formatDate(value) {
  return formatDateBR(value);
}

function emptyForm(cliente = "", turma = "", supervisor = "") {
  return {
    nome: "",
    matricula: "",
    cliente,
    turma,
    supervisor,
    operacao: "",
    data_admissao: "",
  };
}

export default function ParticipantesTurmaPage() {
  const params = useParams();
  const id = params?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [arquivo, setArquivo] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

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
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
      ]);

      setTreinamento(dadosTreinamento || null);
      setParticipantes(Array.isArray(listaParticipantes) ? listaParticipantes : []);
      setForm(
        emptyForm(
          dadosTreinamento?.cliente || "",
          dadosTreinamento?.tema || "",
          dadosTreinamento?.supervisor || ""
        )
      );
    } catch (err) {
      setErro(err.message || "Erro ao carregar participantes.");
    } finally {
      setLoading(false);
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

      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("treinamento_id", String(id));

      await apiFetch("/treinamentos/importar-participantes", {
        method: "POST",
        body: formData,
      });

      setSucesso("Participantes importados com sucesso.");
      setArquivo(null);
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao importar Excel");
    } finally {
      setImportando(false);
    }
  }

  async function adicionarParticipanteManual() {
    try {
      if (!form.nome || !form.matricula || !form.cliente || !form.turma) {
        setErro("Preencha nome, matrícula, cliente e turma.");
        return;
      }

      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch(`/treinamentos/${id}/participantes`, {
        method: "POST",
        body: JSON.stringify({
          nome: form.nome,
          matricula: form.matricula,
          cliente: form.cliente,
          turma: form.turma,
          supervisor: form.supervisor,
          operacao: form.operacao,
          data_admissao: form.data_admissao || "",
        }),
      });

      setSucesso("Participante adicionado com sucesso.");
      setForm(
        emptyForm(
          treinamento?.cliente || "",
          treinamento?.tema || "",
          treinamento?.supervisor || ""
        )
      );
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Não foi possível adicionar manualmente.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarPrimeiraAula() {
    try {
      setErro("");
      setSucesso("");
      await apiDownload(
        `/treinamentos/${id}/exportar-primeira-aula`,
        `turma-${id}-primeira-aula.xlsx`
      );
      setSucesso("Arquivo da primeira aula exportado com sucesso.");
    } catch (err) {
      setErro(err.message || "Erro ao exportar a primeira aula.");
    }
  }

  async function removerParticipante(item) {
    const confirmar = window.confirm(`Deseja remover ${item.nome} da turma?`);
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");

      if (!item?.id) {
        throw new Error("Participante sem identificador para exclusão.");
      }

      await apiFetch(`/treinamentos/participantes/${item.id}`, {
        method: "DELETE",
      });

      setParticipantes((atual) => atual.filter((p) => p.id !== item.id));
      setSucesso("Participante removido com sucesso.");
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao remover participante.");
    }
  }

  function abrirCronograma() {
    window.location.href = `/turma/${id}/cronograma`;
  }

  function voltar() {
    window.location.href = `/turma/${id}`;
  }

  const resumo = useMemo(() => {
    const total = participantes.length;
    const ativos = participantes.filter(
      (item) => String(item.status_presenca || "pendente").toLowerCase() !== "removido"
    ).length;
    const inativos = Math.max(0, total - ativos);

    return {
      total,
      ativos,
      inativos,
      desistentes: 0,
      substituidos: 0,
    };
  }, [participantes]);

  const listaFiltrada = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();
    if (!termo) return participantes;

    return participantes.filter((item) => {
      const nome = String(item.nome || "").toLowerCase();
      const matricula = String(item.matricula || "").toLowerCase();
      const operacao = String(item.operacao || "").toLowerCase();

      return (
        nome.includes(termo) ||
        matricula.includes(termo) ||
        operacao.includes(termo)
      );
    });
  }, [participantes, busca]);

  if (loading) {
    return <div style={loadingWrap}>Carregando base da turma...</div>;
  }

  return (
    <div style={page}>
      <script
        src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        async
      />

      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar para gestão da turma
        </button>
      </div>

      <div style={hero}>
        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Período"
            value={`${formatDate(
              treinamento?.data_inicio || treinamento?.data
            )} até ${formatDate(
              treinamento?.data_fim || treinamento?.data_inicio || treinamento?.data
            )}`}
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
        <h2 style={sectionTitle}>Importar treinandos da turma</h2>
        <p style={sectionSubtitle}>
          Importe a base da turma via Excel uma única vez e reutilize nas aulas do cronograma.
        </p>

        <div style={actionsRow}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
          <button style={btnPrimary} onClick={importarExcel} disabled={importando}>
            {importando ? "Importando..." : "Importar Excel"}
          </button>
          <button style={btnSecondary} onClick={abrirCronograma}>
            Abrir cronograma
          </button>
          <button style={btnSecondary} onClick={exportarPrimeiraAula}>
            Exportar 1ª aula
          </button>
        </div>

        <div style={helperText}>
          Colunas obrigatórias: <strong>nome</strong>, <strong>matricula</strong>,{" "}
          <strong>cliente</strong>, <strong>turma</strong>, <strong>supervisor</strong>,{" "}
          <strong>operacao</strong>, <strong>data_admissao</strong>.
        </div>
      </div>

      <div style={sectionCard}>
        <h2 style={sectionTitle}>Adicionar participante manualmente</h2>
        <p style={sectionSubtitle}>
          Inclusão manual usando a mesma estrutura da base da turma.
        </p>

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
              onChange={(e) => setForm((prev) => ({ ...prev, matricula: e.target.value }))}
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

          <Field label="Turma">
            <input
              value={form.turma}
              onChange={(e) => setForm((prev) => ({ ...prev, turma: e.target.value }))}
              style={field}
            />
          </Field>

          <Field label="Supervisor">
            <input
              value={form.supervisor}
              onChange={(e) => setForm((prev) => ({ ...prev, supervisor: e.target.value }))}
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

          <Field label="Data admissão">
            <input
              type="date"
              value={form.data_admissao}
              onChange={(e) => setForm((prev) => ({ ...prev, data_admissao: e.target.value }))}
              style={field}
            />
          </Field>
        </div>

        <div style={actionsRow}>
          <button style={btnPrimary} onClick={adicionarParticipanteManual} disabled={salvando}>
            {salvando ? "Salvando..." : "Adicionar participante"}
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={listHeader}>
          <div>
            <h2 style={sectionTitle}>Base da turma</h2>
            <p style={sectionSubtitle}>Participantes vinculados a esta turma.</p>
          </div>

          <input
            placeholder="Buscar participante"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
          />
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Matrícula</th>
                <th style={th}>Cliente</th>
                <th style={th}>Turma</th>
                <th style={th}>Supervisor</th>
                <th style={th}>Operação</th>
                <th style={th}>Admissão</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.nome}</td>
                  <td style={td}>{item.matricula}</td>
                  <td style={td}>{item.cliente}</td>
                  <td style={td}>{item.turma}</td>
                  <td style={td}>{item.supervisor}</td>
                  <td style={td}>{item.operacao}</td>
                  <td style={td}>{formatDate(item.data_admissao)}</td>
                  <td style={td}>{item.status_presenca || "pendente"}</td>
                  <td style={td}>
                    <button style={btnDangerMini} onClick={() => removerParticipante(item)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {!listaFiltrada.length ? (
                <tr>
                  <td style={emptyTd} colSpan={9}>
                    Nenhum participante encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
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

const heroGrid = {
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  border: "1px solid #e2e8f0",
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
};

const sectionTitle = {
  margin: 0,
  fontSize: 24,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
};

const actionsRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 16,
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
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnDangerMini = {
  background: "#fff1f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const helperText = {
  marginTop: 12,
  color: "#475569",
};

const formGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
};

const listHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const searchInput = {
  width: 260,
  maxWidth: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
};

const tableWrap = {
  marginTop: 16,
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #e2e8f0",
  color: "#475569",
  fontSize: 13,
};

const td = {
  padding: 12,
  borderBottom: "1px solid #e2e8f0",
  color: "#0f172a",
  fontSize: 14,
};

const emptyTd = {
  padding: 18,
  textAlign: "center",
  color: "#64748b",
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
