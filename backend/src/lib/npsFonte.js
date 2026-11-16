/**
 * npsFonte.js — fonte ÚNICA de respostas de NPS para os indicadores.
 *
 * Varredura de 16/11/2026: o NPS fica em duas tabelas.
 *   - `avaliacoes`: importação Excel, provas em papel, lançamentos da equipe.
 *   - `avaliacoes_treinandos`: o "Responder NPS" que o próprio treinando
 *     preenche no portal (é a fonte do Relatório da turma e do Desempenho do
 *     instrutor).
 * Dashboard, Indicadores (Analytics) e Fechamento mensal liam só `avaliacoes`,
 * então uma turma com 15 respostas do treinando aparecia com NPS 40 no
 * Relatório da turma e vazio no Dashboard.
 *
 * `npsUnificadoSql()` devolve uma subconsulta (derived table) com as colunas
 * { id, treinamento_id, nota_nps, criado_em } que junta as duas fontes SEM
 * dupla contagem: se a mesma pessoa (mesmo nome, mesma turma) já tem nota de
 * NPS em `avaliacoes`, a resposta do portal não é somada de novo.
 *
 * Uso:  FROM ${await npsUnificadoSql()} av JOIN treinamentos t ON t.id = av.treinamento_id
 */
const pool = require("./db");

let _temCriadoEm = null;
async function avaliacoesTemCriadoEm() {
  if (_temCriadoEm !== null) return _temCriadoEm;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'avaliacoes' AND column_name = 'criado_em'`
    );
    _temCriadoEm = Number(rows[0]?.n || 0) > 0;
    return _temCriadoEm;
  } catch (_) {
    return true;
  }
}

let _temTabelaTreinandos = null;
async function temTabelaAvaliacoesTreinandos() {
  if (_temTabelaTreinandos !== null) return _temTabelaTreinandos;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'avaliacoes_treinandos'`
    );
    _temTabelaTreinandos = Number(rows[0]?.n || 0) > 0;
    return _temTabelaTreinandos;
  } catch (_) {
    return false;
  }
}

async function npsUnificadoSql() {
  const criado = (await avaliacoesTemCriadoEm()) ? "a.criado_em" : "NULL";
  const base = `SELECT a.id AS id, a.treinamento_id AS treinamento_id, a.nota_nps AS nota_nps, ${criado} AS criado_em
      FROM avaliacoes a
     WHERE a.nota_nps IS NOT NULL`;
  if (!(await temTabelaAvaliacoesTreinandos())) return `(${base})`;
  return `(
    ${base}
    UNION ALL
    SELECT -at.id AS id, at.treinamento_id AS treinamento_id, at.nota_nps AS nota_nps, at.created_at AS criado_em
      FROM avaliacoes_treinandos at
     WHERE at.nota_nps IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM avaliacoes a2
          WHERE a2.treinamento_id = at.treinamento_id
            AND a2.nota_nps IS NOT NULL
            AND LOWER(TRIM(a2.treinando_nome)) = LOWER(TRIM(at.treinando_nome))
       )
  )`;
}

module.exports = { npsUnificadoSql };
