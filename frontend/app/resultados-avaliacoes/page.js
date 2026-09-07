"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import { apiFetch, getStoredUser } from "../../services/api";

function safeParseQuestoes(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTreinamentoLabel(material) {
  return `${material.titulo} • ${material.tipo || "material"}${
    material.cliente ? ` • ${material.cliente}` : ""
  }`;
}

function normalizarAlternativa(valor) {
  if (valor === null || valor === undefined) return "";

  const texto = String(valor).trim().toUpperCase();

  if (!texto) return "";

  if (["A", "B", "C", "D"].includes(texto)) return texto;

  const matchLetra = texto.match(/\b([ABCD])\b/);
  if (matchLetra) return matchLetra[1];

  if (texto.startsWith("ALTERNATIVA A")) return "A";
  if (texto.startsWith("ALTERNATIVA B")) return "B";
  if (texto.startsWith("ALTERNATIVA C")) return "C";
  if (texto.startsWith("ALTERNATIVA D")) return "D";

  if (texto.startsWith("A)")) return "A";
  if (texto.startsWith("B)")) return "B";
  if (texto.startsWith("C)")) return "C";
  if (texto.startsWith("D)")) return "D";

  return "";
}

function obterRespostaCorreta(questao) {
  const possiveisCampos = [
    questao?.resposta_correta,
    questao?.gabarito,
    questao?.correta,
    questao?.alternativa_correta,
    questao?.resposta,
  ];

  for (const valor of possiveisCampos) {
    const normalizada = normalizarAlternativa(valor);
    if (normalizada) return normalizada;
  }

  return "";
}

function calcularResultado(materialSelecionado, questoes, respostas) {
  const totalQuestoes = questoes.length;

  let acertos = 0;

  questoes.forEach((questao, index) => {
    const respostaMarcada = normalizarAlternativa(respostas[index]);
    const respostaCorreta = obterRespostaCorreta(questao);

    if (respostaMarcada && respostaCorreta && respostaMarcada === respostaCorreta) {
      acertos += 1;
    }
  });

  const percentual =
    totalQuestoes > 0 ? Number(((acertos / totalQuestoes) * 100).toFixed(2)) : 0;

  const notaMaxima = Number(materialSelecionado?.nota_maxima || 0);
  const notaFinal =
    totalQuestoes > 0
      ? Number(((acertos / totalQuestoes) * notaMaxima).toFixed(2))
      : 0;

  return {
    acertos,
    total_questoes: totalQuestoes,
    percentual,
    nota_final: notaFinal,
  };
}

export default function ResponderAvaliacaoPage() {
  const searchParams = useSearchParams();
  const treinamentoIdContexto = searchParams.get("treinamento_id") || "";

  const [user, setUser] = useState(null);
  const [materiais, setMateriais] = useState([]);
  const [materialId, setMaterialId] = useState("");
  const [treinandoNome, setTreinandoNome] = useState("");
  const [respostas, setRespostas] = useState({});
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const ehTreinando = String(user?.perfil || "").toLowerCase() === "treinando";

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro("");

        const storedUser = getStoredUser();
        setUser(storedUser);
        if (storedUser?.nome) {
          setTreinandoNome(storedUser.nome);
        }

        // FIX: antes buscava em /materiais-avaliativos, rota que não autoriza
        // o perfil "treinando" (403) — a página do próprio treinando nunca
        // listava nenhuma prova. Agora usa a rota dedicada, que também
        // restringe às provas dos treinamentos em que ele participa e some
        // com as que ele já respondeu (uma tentativa por prova).
        const query = treinamentoIdContexto ? `?treinamento_id=${treinamentoIdContexto}` : "";
        const materiaisData = await apiFetch(`/materiais-avaliativos-disponiveis${query}`).catch(() => []);

        const listaMateriais = Array.isArray(materiaisData) ? materiaisData : [];
        const materiaisComQuestoes = listaMateriais.filter((item) => {
          const questoes = safeParseQuestoes(item.questoes_json);
          return questoes.length > 0;
        });

        setMateriais(materiaisComQuestoes);

        // Veio de um link de turma específica (aba Avaliações) e só há uma
        // prova pendente ali — seleciona direto, sem exigir mais um clique.
        if (treinamentoIdContexto && materiaisComQuestoes.length === 1) {
          setMaterialId(String(materiaisComQuestoes[0].id));
        }
      } catch (error) {
        setErro(error.message || "Erro ao carregar avaliações.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [treinamentoIdContexto]);

  const materialSelecionado = useMemo(() => {
    return materiais.find((item) => String(item.id) === String(materialId)) || null;
  }, [materiais, materialId]);

  const questoes = useMemo(() => {
    return materialSelecionado ? safeParseQuestoes(materialSelecionado.questoes_json) : [];
  }, [materialSelecionado]);

  function selecionarResposta(index, alternativa) {
    setRespostas((prev) => ({
      ...prev,
      [index]: alternativa,
    }));
  }

  async function enviarRespostas() {
    try {
      setErro("");
      setSucesso("");
      setResultado(null);

      if (!materialSelecionado) {
        setErro("Selecione uma prova ou simulado.");
        return;
      }

      if (!materialSelecionado.treinamento_id) {
        setErro("Este material não está vinculado a um treinamento.");
        return;
      }

      if (!treinandoNome || !String(treinandoNome).trim()) {
        setErro("Informe o nome do treinando.");
        return;
      }

      if (!questoes.length) {
        setErro("Este material não possui questões cadastradas.");
        return;
      }

      const totalRespondidas = Object.keys(respostas).length;

      if (totalRespondidas < questoes.length) {
        setErro("Responda todas as questões antes de enviar.");
        return;
      }

      const calculo = calcularResultado(materialSelecionado, questoes, respostas);

      const payload = {
        material_id: Number(materialSelecionado.id),
        treinamento_id: Number(materialSelecionado.treinamento_id),
        treinando_nome: String(treinandoNome).trim(),
        respostas_json: JSON.stringify(respostas),
        acertos: calculo.acertos,
        total_questoes: calculo.total_questoes,
        percentual: calculo.percentual,
        nota_final: calculo.nota_final,
      };

      setEnviando(true);

      const response = await apiFetch("/respostas-avaliativas", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setResultado({
        acertos: response?.acertos ?? calculo.acertos,
        total_questoes: response?.total_questoes ?? calculo.total_questoes,
        percentual: response?.percentual ?? calculo.percentual,
        nota_final: response?.nota_final ?? calculo.nota_final,
      });

      setSucesso("Respostas enviadas com sucesso.");
    } catch (error) {
      setErro(error.message || "Erro ao enviar respostas.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Portal T&D · Avaliação"
          title="Responder Avaliação"
          subtitle="Realize a prova ou simulado da sua turma diretamente pelo portal."
        />
      </div>

      {loading ? (
        <div style={loadingBox}>Carregando avaliações...</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {erro ? <div style={errorBox}>{erro}</div> : null}
          {sucesso ? <div style={successBox}>{sucesso}</div> : null}

          {materiais.length === 0 ? (
            <SectionCard
              title="Nenhuma prova pendente"
              subtitle="Não há prova ou simulado aguardando sua resposta no momento."
            >
              <div style={materialDescription}>
                Se você já respondeu a prova desta turma, ela some da lista automaticamente — só é
                permitida uma tentativa por prova/simulado. Se acha que isso é um engano, fale com
                o instrutor ou coordenador da turma.
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              title="Selecionar prova ou simulado"
              subtitle="Escolha o material avaliativo e confirme o treinando."
            >
              <div style={formGrid}>
                <div style={fieldWrap}>
                  <label style={label}>Treinando</label>
                  <input
                    style={input}
                    value={treinandoNome}
                    onChange={(e) => setTreinandoNome(e.target.value)}
                    placeholder="Nome do treinando"
                    disabled={ehTreinando}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={label}>Material</label>
                  <select
                    style={input}
                    value={materialId}
                    onChange={(e) => {
                      setMaterialId(e.target.value);
                      setRespostas({});
                      setResultado(null);
                      setErro("");
                      setSucesso("");
                    }}
                  >
                    <option value="">Selecione uma prova/simulado</option>
                    {materiais.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatTreinamentoLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {materialSelecionado ? (
                <div style={materialInfo}>
                  <div style={materialTitle}>{materialSelecionado.titulo}</div>
                  <div style={materialMeta}>
                    Tipo: {materialSelecionado.tipo || "-"} • Nota máxima:{" "}
                    {Number(materialSelecionado.nota_maxima ?? 0).toFixed(2)} •{" "}
                    {questoes.length} questão(ões)
                  </div>

                  {materialSelecionado.tema ? (
                    <div style={materialDescription}>
                      Treinamento vinculado: {materialSelecionado.tema}
                    </div>
                  ) : null}

                  {materialSelecionado.descricao ? (
                    <div style={materialDescription}>{materialSelecionado.descricao}</div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          )}

          {materialSelecionado ? (
            <SectionCard
              title="Responder questões"
              subtitle="Marque uma alternativa por questão e envie ao final."
            >
              <div style={questionsGrid}>
                {questoes.map((questao, index) => (
                  <div key={index} style={questionCard}>
                    <div style={questionTitle}>
                      {index + 1}. {questao.enunciado || "Questão sem enunciado"}
                    </div>

                    <div style={optionsGrid}>
                      {["A", "B", "C", "D"].map((letra) => {
                        const texto = questao[`alternativa_${letra.toLowerCase()}`];

                        return (
                          <label key={letra} style={optionItem}>
                            <input
                              type="radio"
                              name={`questao-${index}`}
                              value={letra}
                              checked={respostas[index] === letra}
                              onChange={() => selecionarResposta(index, letra)}
                            />
                            <span style={{ marginLeft: 8 }}>
                              <strong>{letra})</strong> {texto || "-"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={enviarRespostas}
                  disabled={enviando}
                >
                  {enviando ? "Enviando..." : "Enviar respostas"}
                </button>
              </div>
            </SectionCard>
          ) : null}

          {resultado ? (
            <SectionCard
              title="Resultado da avaliação"
              subtitle="Resumo do desempenho calculado automaticamente pelo portal."
            >
              <div style={resultGrid}>
                <div style={resultCard}>
                  <span style={resultLabel}>Acertos</span>
                  <strong style={resultValue}>
                    {resultado.acertos}/{resultado.total_questoes}
                  </strong>
                </div>

                <div style={resultCard}>
                  <span style={resultLabel}>Percentual</span>
                  <strong style={resultValue}>{resultado.percentual}%</strong>
                </div>

                <div style={resultCard}>
                  <span style={resultLabel}>Nota final</span>
                  <strong style={resultValue}>{resultado.nota_final}</strong>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}
    </PortalShell>
  );
}

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
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
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const materialInfo = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const materialTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const materialMeta = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
};

const materialDescription = {
  marginTop: 10,
  color: "#334155",
  lineHeight: 1.5,
};

const questionsGrid = {
  display: "grid",
  gap: 14,
};

const questionCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
};

const questionTitle = {
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 12,
  lineHeight: 1.5,
};

const optionsGrid = {
  display: "grid",
  gap: 10,
};

const optionItem = {
  display: "flex",
  alignItems: "flex-start",
  color: "#334155",
  lineHeight: 1.45,
};

const btnPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const resultGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const resultCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 6,
};

const resultLabel = {
  color: "#64748b",
  fontSize: 13,
};

const resultValue = {
  color: "#0f172a",
  fontSize: 24,
  lineHeight: 1.1,
};
