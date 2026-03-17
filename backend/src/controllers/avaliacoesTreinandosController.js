export async function createAvaliacaoTreinando(req, res) {
  try {
    const { treinamento_id, treinando_nome, nota_nps, comentario } = req.body;

    if (!treinamento_id || !treinando_nome || nota_nps === undefined) {
      return res.status(400).json({
        ok: false,
        message: "Preencha todos os campos obrigatórios",
      });
    }

    if (nota_nps < 0 || nota_nps > 10) {
      return res.status(400).json({
        ok: false,
        message: "A nota NPS deve estar entre 0 e 10",
      });
    }

    const [duplicado] = await pool.query(
      `
      SELECT id
      FROM avaliacoes_treinandos
      WHERE treinamento_id = ?
        AND treinando_nome = ?
      LIMIT 1
      `,
      [treinamento_id, treinando_nome]
    );

    if (duplicado.length) {
      return res.status(400).json({
        ok: false,
        message: "Esse treinando já respondeu o NPS dessa turma",
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
