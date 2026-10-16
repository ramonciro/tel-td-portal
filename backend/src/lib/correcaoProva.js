/**
 * Correção de prova/simulado no SERVIDOR (14/10/2026).
 *
 * Antes, o gabarito (campo `correta` de cada questão em questoes_json) ia
 * junto com a prova para o navegador do treinando, a nota era calculada lá e
 * o servidor gravava o que o navegador mandasse — dava para ver o gabarito no
 * DevTools e para enviar qualquer nota. Agora:
 *   - o treinando recebe a prova SEM gabarito (removerGabarito);
 *   - ele envia só as alternativas marcadas; acertos, percentual e nota saem
 *     daqui (corrigir).
 *
 * Nota = (soma dos pesos das questões certas ÷ soma dos pesos) × nota_máxima.
 * Peso vazio, zero ou inválido vale 1 — então prova sem pesos definidos é
 * dividida igualmente, exatamente como era antes (15/10/2026).
 */

const CAMPOS_GABARITO = ["resposta_correta", "gabarito", "correta", "alternativa_correta", "resposta"];

function parseQuestoes(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  for (const campo of CAMPOS_GABARITO) {
    const n = normalizarAlternativa(questao?.[campo]);
    if (n) return n;
  }
  return "";
}

// Peso da questão: vazio, zero, negativo ou inválido vale 1.
function pesoDaQuestao(questao) {
  const p = Number(questao?.peso);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

// Aceita objeto {0:"A",1:"C"} ou string JSON dele.
function parseRespostas(raw) {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/**
 * @returns {{ok:boolean, erro?:string, acertos?, total_questoes?, percentual?, nota_final?, respostas?}}
 */
function corrigir(material, respostasBrutas) {
  const questoes = parseQuestoes(material?.questoes_json);
  const total = questoes.length;
  if (!total) return { ok: false, erro: "Este material não possui questões cadastradas." };

  const enviadas = parseRespostas(respostasBrutas);
  const respostas = {};
  let acertos = 0;
  let pesoTotal = 0;
  let pesoAcertado = 0;

  for (let i = 0; i < total; i++) {
    const marcada = normalizarAlternativa(enviadas[i]);
    if (!marcada) return { ok: false, erro: "Responda todas as questões antes de enviar." };
    respostas[i] = marcada;
    const correta = obterRespostaCorreta(questoes[i]);
    const peso = pesoDaQuestao(questoes[i]);
    pesoTotal += peso;
    if (correta && marcada === correta) {
      acertos += 1;
      pesoAcertado += peso;
    }
  }

  const notaMaxima = Number(material?.nota_maxima || 0);
  return {
    ok: true,
    acertos,
    total_questoes: total,
    percentual: Number(((pesoAcertado / pesoTotal) * 100).toFixed(2)),
    nota_final: Number(((pesoAcertado / pesoTotal) * notaMaxima).toFixed(2)),
    respostas,
  };
}

// Devolve questoes_json (string) sem nenhum campo que revele a resposta certa.
function removerGabarito(questoesRaw) {
  const limpas = parseQuestoes(questoesRaw).map((q) => {
    const copia = { ...(q || {}) };
    for (const campo of CAMPOS_GABARITO) delete copia[campo];
    return copia;
  });
  return JSON.stringify(limpas);
}

// tentativas_max do material: NULL/inválido = 1; teto de 10.
function tentativasPermitidas(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 10);
}

module.exports = {
  parseQuestoes, corrigir, removerGabarito, tentativasPermitidas,
  // usados pela importação de provas em papel (lib/provasPapel.js)
  normalizarAlternativa, obterRespostaCorreta, pesoDaQuestao,
};
