"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../services/api";

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

export default function ChamadaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [modoAula, setModoAula] = useState(false);
  const [turmaAulaId, setTurmaAulaId] = useState("");
  const [dataAula, setDataAula] = useState("");
  const [origem, setOrigem] = useState("");

  const [treinamento, setTreinamento] = useState(null);
  const [registrosAula, setRegistrosAula] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const aulaId = search.get("turma_aula_id") || "";
    const data = search.get("data_aula") || "";
    const origemParam = search.get("origem") || "";

    setTurmaAulaId(aulaId);
    setModoAula(Boolean(aulaId));
    setDataAula(data);
    setOrigem(origemParam);
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        if (!id) return;

        setLoading(true);
        setErro("");

        const dadosTreinamento = await apiFetch(`/treinamentos/${id}`);
        setTreinamento(dadosTreinamento || null);

        if (turmaAulaId) {
          await apiFetch("/presenca-aulas/inicializar", {
            method: "POST",
            body: JSON.stringify({
              turma_aula_id: Number(turmaAulaId),
            }),
          });

          const registros = await apiFetch(
            `/presenca-aulas?turma_aula_id=${encodeURIComponent(turmaAulaId)}`
          );

          setRegistrosAula(Array.isArray(registros) ? registros : []);
        }
      } catch (err) {
        setErro(err.message || "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [id, turmaAulaId]);

  function atualizarStatus(index, status) {
    const copia = [...registrosAula];
    copia[index] = {
      ...copia[index],
      status,
    };
    setRegistrosAula(copia);
  }

  function atualizarJustificativa(index, justificativa) {
    const copia = [...registrosAula];
    copia[index] = {
      ...copia[index],
      justificativa,
    };
    setRegistrosAula(copia);
  }

  async function salvarPresencaAula() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch("/presenca-aulas/salvar", {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(turmaAulaId),
          registros: registrosAula.map((item) => ({
            treinando_nome: item.treinando_nome,
            status: item.status || "pendente",
            justificativa: item.justificativa || "",
          })),
        }),
      });

      setSucesso("Presença da aula salva com sucesso.");
    } catch (err) {
      setErro(err.message || "Erro ao salvar presença");
    } finally {
      setSalvando(false);
    }
  }

  const resumo = useMemo(() => {
    const presentes = registrosAula.filter((i) => i.status === "presente").length;
    const ausentes = registrosAula.filter((i) => i.status === "ausente").length;
    const justificados = registrosAula.filter((i) => i.status === "justificado").length;
    const pendentes = registrosAula.filter((i) => !i.status || i.status === "pendente").length;

    return {
      total: registrosAula.length,
      presentes,
      ausentes,
      justificados,
      pendentes,
    };
  }, [registrosAula]);

  if (loading) {
    return <div style={{ padding: 40 }}>Carregando...</div>;
  }

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 18,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Página da Turma</h1>
        <div>ID da turma: {String(id || "-")}</div>
        <div>Modo aula: {modoAula ? "SIM" : "NÃO"}</div>
        <div>Turma aula ID: {turmaAulaId || "-"}</div>
        <div>Data aula: {dataAula || "-"}</div>
        <div>Origem: {origem || "-"}</div>

        <hr style={{ margin: "16px 0" }} />

        <div>Tema: {treinamento?.tema || "-"}</div>
        <div>Cliente: {treinamento?.cliente || "-"}</div>
        <div>Instrutor: {treinamento?.instrutor || "-"}</div>
        <div>Data início: {formatDate(treinamento?.data_inicio || treinamento?.data)}</div>
        <div>Data fim: {formatDate(treinamento?.data_fim)}</div>
      </div>

      {erro ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
            fontWeight: 700,
          }}
        >
          {erro}
        </div>
      ) : null}

      {sucesso ? (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
            fontWeight: 700,
          }}
        >
          {sucesso}
        </div>
      ) : null}

      {modoAula ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <CardResumo titulo="Total" valor={resumo.total} />
            <CardResumo titulo="Presentes" valor={resumo.presentes} />
            <CardResumo titulo="Ausentes" valor={resumo.ausentes} />
            <CardResumo titulo="Pendentes" valor={resumo.pendentes + resumo.justificados} />
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 20,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Presença por aula</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {registrosAula.map((item, index) => (
                <div
                  key={item.id || index}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 14,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    {item.treinando_nome || "-"}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
                    <select
                      value={item.status || "pendente"}
                      onChange={(e) => atualizarStatus(index, e.target.value)}
                      style={{
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        padding: "0 10px",
                      }}
                    >
                      <option value="pendente">Pendente</option>
                      <option value="presente">Presente</option>
                      <option value="ausente">Ausente</option>
                      <option value="justificado">Justificado</option>
                    </select>

                    <input
                      value={item.justificativa || ""}
                      onChange={(e) => atualizarJustificativa(index, e.target.value)}
                      placeholder="Justificativa"
                      style={{
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        padding: "0 10px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={salvarPresencaAula}
                disabled={salvando}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: 0,
                  borderRadius: 12,
                  padding: "12px 18px",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {salvando ? "Salvando..." : "Salvar presença da aula"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CardResumo({ titulo, valor }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ color: "#64748b", fontSize: 13 }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{valor}</div>
    </div>
  );
}
