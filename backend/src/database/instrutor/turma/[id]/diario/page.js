"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, radius } from "../../lib/theme";

export default function DiarioClasseInstrutorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const turmaId = params?.id;
  const aulaId = searchParams.get("aula_id");

  const [aula, setAula] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [presencas, setPresencas] = useState({});
  
  // Novos campos de percepção e feedback
  const [percepcao, setPercepcao] = useState({
    clima: "bom",
    dificuldades: "",
    observacoes: "",
    gerandoFeedback: false,
    feedbackGerado: ""
  });

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (turmaId && aulaId) {
      carregarDadosAula();
    }
  }, [turmaId, aulaId]);

  async function carregarDadosAula() {
    try {
      setLoading(true);
      const [dadosAula, dadosParticipantes, dadosPresencas] = await Promise.all([
        apiFetch(`/turma-aulas/${aulaId}`).catch(() => null),
        apiFetch(`/treinamentos/${turmaId}/participantes`).catch(() => []),
        apiFetch(`/presencas?turma_aula_id=${aulaId}`).catch(() => [])
      ]);

      setAula(dadosAula);
      setParticipantes(Array.isArray(dadosParticipantes) ? dadosParticipantes : []);
      
      // Mapear presenças existentes se houver
      const mapa = {};
      if (Array.isArray(dadosPresencas)) {
        dadosPresencas.forEach(p => {
          mapa[p.participante_id] = p.status; // 'presente', 'ausente', 'justificado'
        });
      }
      setPresencas(mapa);
    } catch (err) {
      setErro(err.message || "Erro ao carregar dados do diário de classe.");
    } finally {
      setLoading(false);
    }
  }

  function mudarStatus(participanteId, status) {
    setPresencas(prev => ({ ...prev, [participanteId]: status }));
  }

  async function salvarDiario() {
    try {
      setSalvando(true);
      setErro("");
      
      // 1. Salvar chamada
      const listaPresencas = Object.entries(presencas).map(([participante_id, status]) => ({
        participante_id,
        status
      }));

      await apiFetch(`/presencas`, {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: aulaId,
          presencas: listaPresencas,
          percepcao_aula: percepcao
        })
      });

      setSucesso("Chamada e percepção da turma salvas com sucesso!");
    } catch (err) {
      setErro(err.message || "Erro ao salvar diário de classe.");
    } finally {
      setSalvando(false);
    }
  }

  async function gerarFeedbackProcesso() {
    try {
      setPercepcao(prev => ({ ...prev, gerandoFeedback: true }));
      // Simulação de chamada para IA gerar um feedback analítico do processo com base nas observações
      setTimeout(() => {
        const resumoGerado = `Análise da Aula: Clima ${percepcao.clima}. Dificuldades relatadas: "${percepcao.dificuldades || 'Nenhuma registrada'}". Recomenda-se reforço prático no próximo encontro para consolidar o aprendizado.`;
        setPercepcao(prev => ({ ...prev, feedbackGerado: resumoGerado, gerandoFeedback: false }));
      }, 1000);
    } catch (err) {
      setPercepcao(prev => ({ ...prev, gerandoFeedback: false }));
    }
  }

  if (loading) {
    return <PortalShell><p style={{ padding: 20 }}>Carregando diário de classe...</p></PortalShell>;
  }

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.textPrimary }}>
            Diário de Classe & Percepção da Turma
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSecondary }}>
            {aula?.titulo ? `Aula: ${aula.titulo}` : "Lançamento de presença e avaliação pedagógica"} {aula?.data_aula ? `· Data: ${formatDateBR(aula.data_aula)}` : ""}
          </p>
        </div>

        {erro && <div style={alertBox(colors.dangerLight, colors.dangerText)}>{erro}</div>}
        {sucesso && <div style={alertBox(colors.successLight, colors.successText)}>{sucesso}</div>}

        <SectionCard title="Lista de Chamada">
          {participantes.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhum treinado vinculado a esta turma.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {participantes.map(p => {
                const statusAtual = presencas[p.id] || "presente";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.surface }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{p.nome}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["presente", "ausente", "justificado"].map(st => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => mudarStatus(p.id, st)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: radius.sm,
                            border: "none",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: statusAtual === st ? colors.primary : colors.surfaceMuted,
                            color: statusAtual === st ? "#fff" : colors.textSecondary,
                            textTransform: "capitalize"
                          }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Percepção do Instrutor & Feedback do Processo">
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Clima / Engajamento da Turma</label>
              <select 
                value={percepcao.clima} 
                onChange={e => setPercepcao({...percepcao, clima: e.target.value})}
                style={inputStyle}
              >
                <option value="excelente">Excelente - Participativa e engajada</option>
                <option value="bom">Bom - Turma receptiva e atenta</option>
                <option value="neutro">Neutro - Participação dentro da média</option>
                <option value="baixo">Baixo engajamento / Desmotivada</option>
                <option value="dificuldade">Alta dificuldade técnica / Resistência</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Dificuldades ou Pontos de Atenção Identificados</label>
              <textarea 
                rows={2}
                placeholder="Ex: Alunos com dúvida na ferramenta X, tempo curto para o exercício..."
                value={percepcao.dificuldades}
                onChange={e => setPercepcao({...percepcao, dificuldades: e.target.value})}
                style={{ ...inputStyle, width: "100%", fontFamily: "inherit" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button 
                type="button"
                onClick={gerarFeedbackProcesso}
                disabled={percepcao.gerandoFeedback}
                style={{ height: 36, padding: "0 14px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: colors.surfaceMuted, color: colors.textPrimary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {percepcao.gerandoFeedback ? "Gerando resumo..." : "🤖 Gerar Feedback do Processo (IA)"}
              </button>
            </div>

            {percepcao.feedbackGerado && (
              <div style={{ padding: 12, borderRadius: radius.md, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af" }}>
                <strong>Resumo e Feedback do Processo:</strong>
                <p style={{ margin: "4px 0 0" }}>{percepcao.feedbackGerado}</p>
              </div>
            )}
          </div>
        </SectionCard>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={salvarDiario}
            disabled={salvando}
            style={{ height: 40, padding: "0 24px", borderRadius: radius.sm, border: "none", background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {salvando ? "Salvando diário..." : "Salvar Diário e Percepção"}
          </button>
        </div>
      </div>
    </PortalShell>
  );
}

const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13, background: "#fff" };
const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: colors.textSecondary, marginBottom: 6 };
const alertBox = (bg, col) => ({ padding: 12, borderRadius: radius.md, background: bg, color: col, fontSize: 13, fontWeight: 700 });
