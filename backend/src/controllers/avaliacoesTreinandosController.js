const pool = require("../lib/db");

async function listAvaliacoesTreinandos(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        at.id,
        at.treinamento_id,
        at.treinando_nome,
        at.nota_nps,
        at.comentario,
        at.created_at,
        t.tema,
        t.cliente,
        t.instrutor
      FROM avaliacoes_treinandos at
      LEFT JOIN treinamentos t ON t.id = at.treinamento_id
      ORDER BY at.id DESC
      `
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar respostas de NPS",
      error: error.message,
    });
  }
}

async function listNpsDisponivel(req, res) {
  try {
    const nomeUsuario = String(req.user?.nome || "").trim();
    const perfil = String(req.user?.perfil || "").toLowerCase();

    if (!nomeUsuario) {
      return res.status(400).json({
        ok: false,
        message: "Usuário não identificado",
      });
    }

    // Para treinando: só mostra turmas em que ele participa e ainda não respondeu
    if (perfil === "treinando") {
      const [rows] = await pool.query(
        `
        SELECT
          t.id,
          t.tema,
          t.cliente,
          t.instrutor,
          t.data,
          t.data_inicio,
          t.data_fim
        FROM treinamentos t
        INNER JOIN treinamento_participantes tp
          ON tp.treinamento_id = t.id
         AND tp.nome = ?
        LEFT JOIN avaliacoes_treinandos at
          ON at.treinamento_id = t.id
         AND at.treinando_nome = ?
        WHERE at.id IS NULL
        ORDER BY COALESCE(t.data_fim, t.data_inicio, t.data) DESC, t.id DESC
        `,
        [nomeUsuario, nomeUsuario]
      );

      return res.json(rows);
    }

    // Para coord/sup/instrutor: retorna todas as turmas
    const [rows] = await pool.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        data,
        data_inicio,
        data_fim
      FROM treinamentos
      ORDER BY COALESCE(data_fim, data_inicio, data) DESC, id DESC
      `
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar NPS disponível",
      error: error.message,
    });
  }
}

async function createAvaliacaoTreinando(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();

    let { treinamento_id, treinando_nome, nota_nps, comentario } = req.body || {};

    if (perfil === "treinando") {
      treinando_nome = nomeUsuario;
    }

    if (!treinamento_id || !treinando_nome || nota_nps === undefined || nota_nps === null) {
      return res.status(400).json({
        ok: false,
        message: "Preencha todos os campos obrigatórios",
      });
    }

    nota_nps = Number(nota_nps);

    if (Number.isNaN(nota_nps) || nota_nps < 0 || nota_nps > 10) {
      return res.status(400).json({
        ok: false,
        message: "A nota NPS deve estar entre 0 e 10",
      });
    }

    // Se for treinando, valida se ele realmente pertence à turma
    if (perfil === "treinando") {
      const [participa] = await pool.query(
        `
        SELECT id
        FROM treinamento_participantes
        WHERE treinamento_id = ? AND nome = ?
        LIMIT 1
        `,
        [treinamento_id, nomeUsuario]
      );

      if (!participa.length) {
        return res.status(403).json({
          ok: false,
          message: "Você só pode avaliar treinamentos em que está participando",
        });
      }
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

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "NPS enviado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar NPS",
      error: error.message,
    });
  }
}

module.exports = {
  listAvaliacoesTreinandos,
  listNpsDisponivel,
  createAvaliacaoTreinando,
};
