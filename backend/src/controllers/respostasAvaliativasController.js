const pool = require("../lib/db");

// Isolamento por tenant via JOIN até treinamentos (respostas_avaliativas não
// tem empresa_id própria). Sem isso, respostas de prova de outras empresas
// ficavam visíveis/editáveis/excluíveis por qualquer usuário autenticado.
function tenantJoinTreinamento(empresaId, alias = "ra") {
  return empresaId
    ? ` AND EXISTS (SELECT 1 FROM treinamentos t WHERE t.id = ${alias}.treinamento_id AND t.empresa_id = ${pool.escape(empresaId)})`
    : "";
}

async function treinamentoPertenceAoTenant(treinamentoId, empresaId) {
  if (!empresaId) return true;
  const [rows] = await pool.query(
    `SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ? LIMIT 1`,
    [treinamentoId, empresaId]
  );
  return rows.length > 0;
}

async function listRespostasAvaliativas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        ra.id,
        ra.material_id,
        ra.treinamento_id,
        ra.treinando_nome,
        ra.respostas_json,
        ra.acertos,
        ra.total_questoes,
        ra.percentual,
        ra.nota_final,
        ra.criado_em,
        ra.atualizado_em
      FROM respostas_avaliativas ra
      WHERE 1 = 1${tenantJoinTreinamento(req.empresaId)}
      ORDER BY ra.id DESC
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

async function createRespostaAvaliativa(req, res) {
  try {
    const {
      material_id,
      treinamento_id,
      respostas_json,
      acertos,
      total_questoes,
      percentual,
      nota_final,
    } = req.body || {};

    let treinando_nome = req.body?.treinando_nome;

    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();

    // Mesma trava de identidade já usada no NPS (avaliacoesTreinandosController):
    // treinando não escolhe em nome de quem responde, é sempre o próprio
    // usuário logado — evita um treinando registrar resposta em nome de outro.
    if (perfil === "treinando") {
      if (!nomeUsuario) {
        return res.status(400).json({ ok: false, message: "Usuário não identificado" });
      }
      treinando_nome = nomeUsuario;
    }

    if (!material_id || !treinamento_id || !treinando_nome) {
      return res.status(400).json({
        ok: false,
        message: "Preencha material, treinamento e treinando",
      });
    }

    if (!(await treinamentoPertenceAoTenant(treinamento_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    if (perfil === "treinando") {
      // Valida se o treinando realmente participa da turma — mesma regra do NPS.
      const [participa] = await pool.query(
        `SELECT id FROM treinamento_participantes WHERE treinamento_id = ? AND nome = ? LIMIT 1`,
        [treinamento_id, nomeUsuario]
      );
      if (!participa.length) {
        return res.status(403).json({
          ok: false,
          message: "Você só pode responder avaliações de treinamentos em que está participando",
        });
      }

      // Uma tentativa por prova/simulado — evita refazer até acertar tudo.
      const [duplicado] = await pool.query(
        `SELECT id FROM respostas_avaliativas WHERE material_id = ? AND treinando_nome = ? LIMIT 1`,
        [material_id, nomeUsuario]
      );
      if (duplicado.length) {
        return res.status(400).json({
          ok: false,
          message: "Você já respondeu esta prova/simulado.",
        });
      }
    }

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
      ON DUPLICATE KEY UPDATE
        respostas_json = VALUES(respostas_json),
        acertos = VALUES(acertos),
        total_questoes = VALUES(total_questoes),
        percentual = VALUES(percentual),
        nota_final = VALUES(nota_final),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        material_id,
        treinamento_id,
        treinando_nome,
        typeof respostas_json === "string"
          ? respostas_json
          : JSON.stringify(respostas_json || {}),
        Number(acertos || 0),
        Number(total_questoes || 0),
        Number(percentual || 0),
        Number(nota_final || 0),
      ]
    );

    return res.status(201).json({
      ok: true,
      message: "Resposta avaliativa registrada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao registrar resposta avaliativa",
      error: error.message,
    });
  }
}

async function updateRespostaAvaliativa(req, res) {
  try {
    const { id } = req.params;
    const {
      material_id,
      treinamento_id,
      treinando_nome,
      respostas_json,
      acertos,
      total_questoes,
      percentual,
      nota_final,
    } = req.body || {};

    const tenantCheck = tenantJoinTreinamento(req.empresaId, "respostas_avaliativas");
    const [exists] = await pool.query(
      `SELECT id FROM respostas_avaliativas WHERE id = ?${tenantCheck} LIMIT 1`,
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ ok: false, message: "Resposta avaliativa não encontrada" });
    }

    if (treinamento_id && !(await treinamentoPertenceAoTenant(treinamento_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    await pool.query(
      `
      UPDATE respostas_avaliativas
      SET
        material_id = ?,
        treinamento_id = ?,
        treinando_nome = ?,
        respostas_json = ?,
        acertos = ?,
        total_questoes = ?,
        percentual = ?,
        nota_final = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        material_id,
        treinamento_id,
        treinando_nome,
        typeof respostas_json === "string"
          ? respostas_json
          : JSON.stringify(respostas_json || {}),
        Number(acertos || 0),
        Number(total_questoes || 0),
        Number(percentual || 0),
        Number(nota_final || 0),
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Resposta avaliativa atualizada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar resposta avaliativa",
      error: error.message,
    });
  }
}

async function deleteRespostaAvaliativa(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = tenantJoinTreinamento(req.empresaId, "respostas_avaliativas");

    const [exists] = await pool.query(
      `SELECT id FROM respostas_avaliativas WHERE id = ?${tenantCheck} LIMIT 1`,
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ ok: false, message: "Resposta avaliativa não encontrada" });
    }

    await pool.query(
      `DELETE FROM respostas_avaliativas WHERE id = ?`,
      [id]
    );

    return res.json({
      ok: true,
      message: "Resposta avaliativa excluída com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir resposta avaliativa",
      error: error.message,
    });
  }
}

module.exports = {
  listRespostasAvaliativas,
  createRespostaAvaliativa,
  updateRespostaAvaliativa,
  deleteRespostaAvaliativa,
};
