const db = require("../lib/db");

async function listarResultados(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT 
        r.id,
        r.avaliacao_id,
        a.titulo,
        r.pergunta,
        r.resposta,
        r.nota,
        r.created_at
      FROM respostas_avaliacoes r
      LEFT JOIN avaliacoes a ON a.id = r.avaliacao_id
      ORDER BY r.created_at DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error("Erro ao buscar resultados:", error);
    return res.status(500).json({ error: "Erro ao buscar resultados" });
  }
}

module.exports = {
  listarResultados,
};
