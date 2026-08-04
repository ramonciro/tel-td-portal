"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, radius, estiloBadgeStatus } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";

export default function PainelInstrutorPage() {
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarTurmasDoInstrutor();
  }, []);

  async function carregarTurmasDoInstrutor() {
    try {
      setLoading(true);
      // Busca as turmas filtradas pelo instrutor logado (o backend identifica via token/sessão)
      const resposta = await apiFetch("/presenca-resumo");
      const itens = Array.isArray(resposta?.itens) ? resposta.itens : [];
      setTurmas(itens);
      setErro("");
    } catch (err) {
      setErro(err.message || "Erro ao carregar turmas do instrutor.");
    } finally {
      setLoading(false);
    }
  }

  function irParaCriarTurma() {
    window.location.href = "/instrutor/nova-turma";
  }

  function abrirDiario(turmaId, aulaId) {
    if (aulaId) {
      window.location.href = `/instrutor/turma/${turmaId}/diario?aula_id=${aulaId}`;
    } else {
      window.location.href = `/turma/${turmaId}`;
    }
  }

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: colors.primary, background: "#eff6ff", padding: "4px 10px", borderRadius: 999 }}>
              Área do Instrutor
            </span>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800, color: colors.textPrimary }}>
              Minhas Turmas & Gestão Autônoma
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: colors.textSecondary }}>
              Crie turmas, gerencie cronogramas e registre o diário de classe com percepção pedagógica.
            </p>
          </div>
          <button
            onClick={irParaCriarTurma}
            style={{
              background: colors.primary,
              color: "#fff",
              border: "none",
              borderRadius: radius.md,
              padding: "12px 20px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.2)"
            }}
          >
            + Criar Nova Turma
          </button>
        </div>

        {erro && (
          <div style={{ padding: 14, borderRadius: radius.md, background: "#fef2f2", color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>
            {erro}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: colors.textSecondary, fontWeight: 600 }}>
            Carregando painel do instrutor...
          </div>
        ) : (
          <SectionCard title="Turmas sob sua responsabilidade" subtitle="Acompanhe o andamento e acesse rapidamente o diário de classe.">
            {turmas.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: colors.textMuted, fontSize: 14 }}>
                Nenhuma turma cadastrada. Clique em "+ Criar Nova Turma" para começar.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 10 }}>
                {turmas.map((item) => (
                  <div key={item.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 16, background: colors.surface, display: "grid", gap: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={estiloBadgeStatus(item.status_turma)}>{item.status_turma}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>
                        {item.treinandos_previstos || 0} treinandos
                      </span>
                    </div>

                    <div style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
                      {item.tema || "Turma sem tema"}
                    </div>

                    <div style={{ fontSize: 13, color: colors.textSecondary }}>
                      Cliente: <strong>{item.cliente || "-"}</strong> · Período: {formatDateBR(item.data_inicio)}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button
                        onClick={() => abrirDiario(item.id, item.proxima_aula_id)}
                        style={{
                          flex: 1,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          borderRadius: radius.sm,
                          padding: "10px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        Abrir Diário / Chamada
                      </button>
                      <button
                        onClick={() => window.location.href = `/turma/${item.id}`}
                        style={{
                          background: colors.surfaceMuted,
                          color: colors.textPrimary,
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          padding: "10px 14px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        Gerir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </PortalShell>
  );
}
