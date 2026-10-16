/**
 * Regras puras da importação de provas feitas no papel (16/10/2026).
 *
 * Duas formas de lançar cada treinando:
 *   - respostas marcadas (A/B/C/D, "-" para em branco): o Portal corrige pelo
 *     gabarito da prova cadastrada; em branco conta como erro;
 *   - nota final já corrigida à mão.
 * A nota que alimenta Dashboard/Analytics/Certificados é avaliacoes.nota_prova,
 * na escala 0–10: quando a nota máxima da prova é outra, converte-se por
 * proporção e guarda-se também a nota original.
 */
const {
  parseQuestoes, normalizarAlternativa, obterRespostaCorreta, pesoDaQuestao,
} = require("./correcaoProva");

const arred2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const EM_BRANCO = new Set(["-", ".", "?", "_", "*"]);

/**
 * "ABCD-ACDB" (espaços, vírgulas e ponto e vírgula são ignorados) → ["A","B","C","D","",...]
 * @returns {{ok:boolean, letras?:string[], erro?:string}}
 */
function lerRespostas(texto, total) {
  const bruto = String(texto || "").toUpperCase().replace(/[\s,;|/]+/g, "");
  const letras = [];
  for (const ch of bruto) {
    if (["A", "B", "C", "D"].includes(ch)) letras.push(ch);
    else if (EM_BRANCO.has(ch)) letras.push("");
    else return { ok: false, erro: `Caractere inválido “${ch}” (use A, B, C, D ou - para em branco).` };
  }
  if (letras.length !== total) {
    return { ok: false, erro: `A prova tem ${total} questões e vieram ${letras.length} respostas.` };
  }
  return { ok: true, letras };
}

/** Corrige pelo gabarito; em branco = erro. Mesma fórmula da prova online (por peso). */
function corrigirLetras(material, letras) {
  const questoes = parseQuestoes(material?.questoes_json);
  const total = questoes.length;
  if (!total) return { ok: false, erro: "Esta prova não tem questões cadastradas." };
  let acertos = 0;
  let pesoTotal = 0;
  let pesoAcertado = 0;
  for (let i = 0; i < total; i++) {
    const marcada = normalizarAlternativa(letras[i]);
    const correta = obterRespostaCorreta(questoes[i]);
    const peso = pesoDaQuestao(questoes[i]);
    pesoTotal += peso;
    if (correta && marcada && marcada === correta) {
      acertos += 1;
      pesoAcertado += peso;
    }
  }
  const notaMaxima = Number(material?.nota_maxima || 0);
  return {
    ok: true,
    acertos,
    total_questoes: total,
    percentual: arred2((pesoAcertado / pesoTotal) * 100),
    nota_original: arred2((pesoAcertado / pesoTotal) * notaMaxima),
    respostas: Object.fromEntries(letras.map((l, i) => [i, l])),
  };
}

/** Questões sem gabarito cadastrado (a correção as trataria sempre como erro). */
function questoesSemGabarito(material) {
  return parseQuestoes(material?.questoes_json).filter((q) => !obterRespostaCorreta(q)).length;
}

/** Nota digitada: número de 0 até a nota máxima, até 2 casas (aceita vírgula). */
function lerNota(valor, notaMaxima) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return { ok: true, nota: null };
  const n = Number(String(valor).trim().replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, erro: "Nota inválida." };
  if (n < 0 || n > Number(notaMaxima)) return { ok: false, erro: `A nota deve ficar entre 0 e ${Number(notaMaxima)}.` };
  return { ok: true, nota: arred2(n) };
}

/** Converte da escala da prova (0..max) para 0–10. */
function converterNota10(nota, notaMaxima) {
  const max = Number(notaMaxima);
  if (nota === null || nota === undefined || !(max > 0)) return null;
  return Math.min(10, Math.max(0, arred2((Number(nota) / max) * 10)));
}

const chaveNome = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

module.exports = {
  arred2, lerRespostas, corrigirLetras, questoesSemGabarito, lerNota, converterNota10, chaveNome,
};
