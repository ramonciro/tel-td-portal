/**
 * tx.js — transação MySQL em uma linha (21/10/2026).
 *
 *   const r = await comTransacao(async (conn) => {
 *     await conn.query("UPDATE ...");
 *     await conn.query("DELETE ...");
 *     return algo;
 *   });
 *
 * Se qualquer passo lançar erro, tudo é desfeito (ROLLBACK) e o erro sobe para o
 * controller tratar como sempre. Usa uma conexão do pool e sempre a devolve.
 */
const pool = require("./db");

async function comTransacao(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (erro) {
    try { await conn.rollback(); } catch (_) { /* conexão já caiu */ }
    throw erro;
  } finally {
    conn.release();
  }
}

// Tolera só "tabela ainda não existe" (bancos que não rodaram uma migração antiga);
// qualquer outro erro continua subindo e desfaz a transação.
function ignorarTabelaAusente(promessa) {
  return promessa.catch((e) => {
    if (e && (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146)) return null;
    throw e;
  });
}

module.exports = { comTransacao, ignorarTabelaAusente };
