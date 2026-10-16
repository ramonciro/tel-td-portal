/**
 * rotinaAvaliacao.js — Avaliação individual (Fase 2 da Rotina do instrutor, 16/10/2026).
 *
 * Ao final da Avaliação Técnica o instrutor registra, por candidato, nota de 5 a 10
 * em 5 critérios (média calculada), observação (obrigatória se média < 6) e o
 * resultado Aprovado / Em berço / Reprovado. O resultado alimenta a célula baby:
 * a célula só lê (ver controllers/celulaBabyController.js).
 * Não soma horas na CH (já está dentro da CH da turma).
 */
const pool = require("./db");

const CRITERIOS = [
  { chave: "pontualidade", coluna: "nota_pontualidade", rotulo: "Pontualidade" },
  { chave: "interesse", coluna: "nota_interesse", rotulo: "Interesse / participação" },
  { chave: "comportamento", coluna: "nota_comportamento", rotulo: "Comportamento geral" },
  { chave: "quiz", coluna: "nota_quiz", rotulo: "Desempenho no quiz" },
  { chave: "avaliacao_final", coluna: "nota_avaliacao_final", rotulo: "Desempenho na avaliação final" },
];
const RESULTADOS = ["passou", "em_berco", "nao_seguiu"];
const ROTULO_RESULTADO = { passou: "Aprovado", em_berco: "Em berço", nao_seguiu: "Reprovado" };
const NOTA_MIN = 5;
const NOTA_MAX = 10;
const MEDIA_MINIMA = 6;

/** Média das 5 notas (2 casas), ou null se faltar alguma. */
function calcularMedia(notas) {
  const v = CRITERIOS.map((c) => notas[c.chave]);
  if (v.some((n) => n === null || n === undefined)) return null;
  return Math.round((v.reduce((s, n) => s + Number(n), 0) / v.length) * 100) / 100;
}

function notaValida(n) {
  return n === null || n === undefined || (Number.isInteger(n) && n >= NOTA_MIN && n <= NOTA_MAX);
}

/** Estado da célula baby da turma (ou null) e da pessoa nela. */
async function situacaoNaCelula(treinamentoId, participanteId) {
  let celula = null;
  try {
    const [[c]] = await pool.query("SELECT id, status FROM celulas_baby WHERE treinamento_id = ? LIMIT 1", [treinamentoId]);
    celula = c || null;
  } catch (_) {
    return { celula: null, pessoa: null, lancamentos: 0 };
  }
  if (!celula) return { celula: null, pessoa: null, lancamentos: 0 };
  const [[pessoa]] = await pool.query(
    "SELECT id, resultado FROM celula_baby_pessoas WHERE celula_id = ? AND participante_id = ? LIMIT 1",
    [celula.id, participanteId]
  );
  let lancamentos = 0;
  if (pessoa) {
    const [[l]] = await pool.query("SELECT COUNT(*) AS n FROM celula_baby_lancamentos WHERE pessoa_row_id = ?", [pessoa.id]);
    lancamentos = Number(l.n);
  }
  return { celula, pessoa: pessoa || null, lancamentos };
}

/** Aplica o resultado na célula baby, se ela existir. Devolve true se mexeu. */
async function aplicarResultadoNaCelula(t, participante, resultado) {
  const { celula, pessoa } = await situacaoNaCelula(t.id, participante.id);
  if (!celula) return false;
  if (!pessoa) {
    if (celula.status !== "a_configurar") return false;
    await pool.query(
      `INSERT IGNORE INTO celula_baby_pessoas (celula_id, participante_id, pessoa_id, nome, matricula, resultado)
       VALUES (?,?,?,?,?,?)`,
      [celula.id, participante.id, participante.pessoa_id || null, participante.nome, participante.matricula || null, resultado]
    );
    return true;
  }
  if ((pessoa.resultado || null) === (resultado || null)) return false;
  await pool.query(
    `UPDATE celula_baby_pessoas SET resultado = ?${resultado === "passou" ? "" : ", parecer = NULL"} WHERE id = ?`,
    [resultado || null, pessoa.id]
  );
  return true;
}

module.exports = {
  CRITERIOS, RESULTADOS, ROTULO_RESULTADO, NOTA_MIN, NOTA_MAX, MEDIA_MINIMA,
  calcularMedia, notaValida, situacaoNaCelula, aplicarResultadoNaCelula,
};
