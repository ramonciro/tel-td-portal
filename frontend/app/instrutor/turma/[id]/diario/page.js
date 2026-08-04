"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PortalShell from "../../../../../components/PortalShell";
import SectionCard from "../../../../../components/SectionCard";
import { apiFetch } from "../../../../../services/api";

export default function DiarioClassePage() {
  const params = useParams();
  const router = useRouter();
  const turmaId = params.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [turma, setTurma] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  
  const [conteudoMinistrado, setConteudoMinistrado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [presencas, setPresencas] = useState({});
  const [avaliacoes, setAvaliacoes] = useState({});
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (turmaId) {
      carregarDadosTurma();
    }
  }, [turmaId]);

  async function carregarDadosTurma() {
    try {
      setLoading(true);
      setErro("");
      
      const dadosTurma = await apiFetch(`/api/turmas/${turmaId}`);
      setTurma(dadosTurma);

      const listaAlunos = dadosTurma?.participantes || dadosTurma?.alunos || [];
      setParticipantes(listaAlunos);

      const presInicial = {};
      const avInicial = {};
      listaAlunos.forEach(aluno => {
        const id = aluno.id || aluno.usuarioId;
        presInicial[id] = true;
        avInicial[id] = { nota: "", feedback: "" };
      });
      setPresencas(presInicial);
      setAvaliacoes(avInicial);

    } catch (err) {
      console.error("Erro ao carregar turma:", err);
      setErro("Não foi possível carregar os dados desta turma.");
    } finally {
      setLoading(false);
    }
  }

  function handlePresencaChange(usuarioId, status) {
    setPresencas(prev => ({ ...prev, [usuarioId]: status }));
  }

  function handleAvaliacaoChange(usuarioId, campo, valor) {
    setAvaliacoes(prev => ({
      ...prev,
      [usuarioId]: {
        ...prev[usuarioId],
        [campo]: valor
      }
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErro("");
    setSucesso("");

    try {
      const payload = {
        conteudoMinistrado,
        observacoes,
        chamada: Object.keys(presencas).map(usuarioId => ({
          usuarioId,
          presente: presencas[usuarioId]
        })),
        desempenho: Object.keys(avaliacoes).map(usuarioId => ({
          usuarioId,
          nota: avaliacoes[usuarioId].nota ? Number(avaliacoes[usuarioId].nota) : null,
          feedback: avaliacoes[usuarioId].feedback || ""
        }))
      };

      await apiFetch(`/api/turmas/${turmaId}/diario`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setSucesso("Diário de classe registrado e feedback pedagógico salvo com sucesso!");
      setTimeout(() => {
        router.push(`/presencas`);
      }, 2000);

    } catch (err) {
      console.error("Erro ao salvar diário:", err);
      setErro(err.message || "Erro ao salvar o diário de classe. Verifique os campos.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PortalShell title="Diário de Classe" subtitle="Carregando informações da turma...">
        <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Carregando...</div>
      </PortalShell>
    );
  }

  return (
    <PortalShell 
      title={`Diário de Classe: ${turma?.nome || "Turma"}`} 
      subtitle="Registro diário de conteúdo, chamada de frequência e feedback pedagógico individual."
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20, maxWidth: 1000 }}>
        
        {erro && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 16, borderRadius: 12, fontWeight: 600 }}>
            {erro}
          </div>
        )}

        {sucesso && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: 16, borderRadius: 12, fontWeight: 600 }}>
            {sucesso}
          </div>
        )}

        <SectionCard title="Conteúdo e Ocorrências da Aula">
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Conteúdo Ministrado / Tópicos Abordados *
              </label>
              <textarea
                required
                rows={4}
                value={conteudoMinistrado}
                onChange={e => setConteudoMinistrado(e.target.value)}
                placeholder="Descreva detalhadamente o que foi ensinado nesta aula..."
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Observações Gerais da Turma
              </label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Ocorrências, engajamento, avisos importantes..."
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Frequência e Desempenho dos Alunos">
          {participantes.length === 0 ? (
            <p style={{ color: "#64748b", fontStyle: "italic" }}>Nenhum aluno matriculado encontrado nesta turma.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {participantes.map(aluno => {
                const id = aluno.id || aluno.usuarioId;
                const nome = aluno.nome || aluno.usuarioNome || "Aluno";

                return (
                  <div key={id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <strong style={{ fontSize: 15, color: "#0f172a" }}>{nome}</strong>
                      
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handlePresencaChange(id, true)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            border: "1px solid #cbd5e1",
                            background: presencas[id] === true ? "#16a34a" : "#fff",
                            color: presencas[id] === true ? "#fff" : "#475569"
                          }}
                        >
                          Presente
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePresencaChange(id, false)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            border: "1px solid #cbd5e1",
                            background: presencas[id] === false ? "#dc2626" : "#fff",
                            color: presencas[id] === false ? "#fff" : "#475569"
                          }}
                        >
                          Ausente
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center" }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#475569" }}>
                          Nota / Conceito
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          placeholder="Ex: 8.5"
                          value={avaliacoes[id]?.nota || ""}
                          onChange={e => handleAvaliacaoChange(id, "nota", e.target.value)}
                          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#475569" }}>
                          Feedback Pedagógico Individual
                        </label>
                        <input
                          type="text"
                          placeholder="Comentário sobre o desempenho do aluno nesta aula..."
                          value={avaliacoes[id]?.feedback || ""}
                          onChange={e => handleAvaliacaoChange(id, "feedback", e.target.value)}
                          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ padding: "12px 20px", borderRadius: 10, background: "#e2e8f0", color: "#334155", fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: "12px 24px", borderRadius: 10, background: "#2563eb", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Salvando Diário..." : "Salvar Diário de Classe"}
          </button>
        </div>

      </form>
    </PortalShell>
  );
}
