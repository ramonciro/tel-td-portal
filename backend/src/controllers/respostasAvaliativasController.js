const pool = require("../lib/db");

function safeParseQuestoes(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizarResposta(valor) {
  return String(valor || "").trim().toUpperCase();
}

async function listRespostasAvaliativas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        material_id,
        treinamento_id,
        treinando_nome,
        respostas_json,
        acertos,
        total_questoes,
        percentual,
        nota_final,
        criado_em,
        atualizado_em
      FROM respostas_avaliativas
      ORDER BY id DESC
    `);

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar respostas avaliativas",
      error: error.message,
    });
  }
}

async function submitRespostaAvaliativa(req, res) {
  try {
    const { material_id, treinando_nome, respostas } = req.body || {};

    if (!material_id || !treinando_nome || !respostas) {
      return res.status(400).json({
        ok: false,
        message: "Preencha material, treinando e respostas",
      });
    }

    const [materiais] = await pool.query(
      `
      SELECT
        id,
        treinamento_id,
        titulo,
        COALESCE(nota_maxima, 0) AS nota_maxima,
        questoes_json
      FROM materiais_avaliativos
      WHERE id = ?
      LIMIT 1
      `,
      [material_id]
    );

    if (!materiais.length) {
      return res.status(404).json({
        ok: false,
        message: "Material avaliativo não encontrado",
      });
    }

    const material = materiais[0];
    const questoes = safeParseQuestoes(material.questoes_json);

    if (!questoes.length) {
      return res.status(400).json({
        ok: false,
        message: "Este material ainda não possui questões cadastradas",
      });
    }

    const respostasObj =
      Array.isArray(respostas)
        ? respostas.reduce((acc, item, index) => {
            acc[index] = item;
            return acc;
          }, {})
        : respostas;

    let acertos = 0;

    questoes.forEach((questao, index) => {
      const respostaUsuario = normalizarResposta(respostasObj[index]);
      const correta = normalizarResposta(questao.correta);

      if (respostaUsuario && correta && respostaUsuario === correta) {
        acertos += 1;
      }
    });

    const total_questoes = questoes.length;
    const percentual = total_questoes
      ? Number(((acertos / total_questoes) * 100).toFixed(2))
      : 0;

    const notaMaxima = Number(material.nota_maxima || 10);
    const nota_final = total_questoes
      ? Number(((acertos / total_questoes) * notaMaxima).toFixed(2))
      : 0;

    const respostas_json = JSON.stringify(respostasObj);

    const [existentes] = await pool.query(
      `
      SELECT id
      FROM respostas_avaliativas
      WHERE material_id = ? AND treinando_nome = ?
      LIMIT 1
      `,
      [material_id, treinando_nome]
    );

    if (existentes.length) {
      await pool.query(
        `
        UPDATE respostas_avaliativas
        SET
          treinamento_id = ?,
          respostas_json = ?,
          acertos = ?,
          total_questoes = ?,
          percentual = ?,
          nota_final = ?
        WHERE id = ?
        `,
        [
          material.treinamento_id,
          respostas_json,
          acertos,
          total_questoes,
          percentual,
          nota_final,
          existentes[0].id,
        ]
      );
    } else {
      await pool.query(
        `
        INSERT INTO respostas_avaliativas
        (
          material_id,
          treinamento_id,
          treinando_nome,
          respostas_json,
          acertos,
          total_questoes,
          percentual,
          nota_final
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          material_id,
          material.treinamento_id,
          treinando_nome,
          respostas_json,
          acertos,
          total_questoes,
          percentual,
          nota_final,
        ]
      );
    }

    const [avaliacoesExistentes] = await pool.query(
      `
      SELECT id
      FROM avaliacoes
      WHERE treinamento_id = ? AND treinando_nome = ? AND titulo = ?
      LIMIT 1
      `,
      [material.treinamento_id, treinando_nome, material.titulo]
    );

    if (avaliacoesExistentes.length) {
      await pool.query(
        `
        UPDATE avaliacoes
        SET nota_prova = ?, comentario = ?
        WHERE id = ?
        `,
        [
          nota_final,
          `Resultado automático da prova/simulado: ${acertos}/${total_questoes} acertos`,
          avaliacoesExistentes[0].id,
        ]
      );
    } else {
      await pool.query(
        `
        INSERT INTO avaliacoes
        (
          treinamento_id,
          titulo,
          nota_nps,
          nota_qualidade,
          nota_prova,
          comentario,
          treinando_nome
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          material.treinamento_id,
          material.titulo,
          0,
          0,
          nota_final,
          `Resultado automático da prova/simulado: ${acertos}/${total_questoes} acertos`,
          treinando_nome,
        ]
      );
    }

    return res.json({
      ok: true,
      material_id: material.id,
      treinamento_id: material.treinamento_id,
      titulo: material.titulo,
      treinando_nome,
      acertos,
      total_questoes,
      percentual,
      nota_final,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao enviar respostas da avaliação",
      error: error.message,
    });
  }
}

module.exports = {
  listRespostasAvaliativas,
  submitRespostaAvaliativa,
};
