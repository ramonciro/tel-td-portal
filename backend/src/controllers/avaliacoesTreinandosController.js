import pool from "../db.js";

function classificarNPS(nota) {
  if (nota >= 9) return "Promotor";
  if (nota >= 7) return "Neutro";
  return "Detrator";
}

export async function listAvaliacoesTreinandos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM avaliacoes_treinandos ORDER BY id DESC
    `);

    const data = rows.map((item) => ({
      ...item,
      classificacao: classificarNPS(item.nota_nps),
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar NPS",
      error: error.message,
    });
  }
}

export async function createAvaliacaoTreinando(req, res) {
  try {
    const { treinamento_id, treinando_nome, nota_nps, comentario } = req.body;

    if (!treinamento_id || !treinando_nome || nota_nps === undefined) {
      return res.status(400).json({
        ok: false,
        message: "Preencha todos os campos obrigatórios",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO avaliacoes_treinandos
      (treinamento_id, treinando_nome, nota_nps, comentario)
      VALUES (?, ?, ?, ?)
      `,
      [treinamento_id, treinando_nome, nota_nps, comentario || null]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao salvar NPS",
      error: error.message,
    });
  }
}
