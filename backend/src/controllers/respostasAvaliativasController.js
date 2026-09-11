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

// Fase 4 (isolamento multi-tenant, 08/09/2026): treinamento_id sempre foi
// validado contra o tenant, mas material_id nunca era checado contra
// treinamento_id nenhum — dava pra registrar/editar uma resposta com
// treinamento_id da própria empresa mas material_id de um material de OUTRA
// empresa (ids são sequenciais e fáceis de adivinhar), plantando uma
// referência cruzada entre tenants. Hoje isso não vaza leitura (as consultas
// que unem respostas_avaliativas a materiais_avaliativos sempre re-filtram
// pelo tenant de quem consulta), mas é uma referência inválida e vira
// vazamento no dia em que alguma tela juntar as duas tabelas só por
// material_id. Esta checagem garante que o material realmente pertence ao
// treinamento informado.
async function materialPertenceAoTreinamento(materialId, treinamentoId) {
  const [rows] = await pool.query(
    `SELECT id FROM materiais_avaliativos WHERE id = ? AND treinamento_id = ? LIMIT 1`,
    [materialId, treinamentoId]
  );
  return rows.length > 0;
}

async function listRespostasAvaliativas(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();

    // Mesma trava de identidade já usada no NPS e na criação desta mesma
    // rota: um treinando só pode ver as próprias respostas de prova, nunca
    // as dos colegas (respostas_json inclusive). Sem isso, qualquer
    // treinando autenticado que chamasse este endpoint recebia as respostas
    // de todos os treinandos da empresa.
    const filtroTreinando =
      perfil === "treinando"
        ? ` AND ra.treinando_nome = ${pool.escape(nomeUsuario)}`
        : "";

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
      WHERE 1 = 1${tenantJoinTreinamento(req.empresaId)}${filtroTreinando}
      ORDER BY ra.id DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error("[respostasAvaliativasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar respostas avaliativas"});
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

    if (!(await materialPertenceAoTreinamento(material_id, treinamento_id))) {
      return res.status(400).json({ ok: false, message: "Material não pertence a este treinamento." });
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
    console.error("[respostasAvaliativasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao registrar resposta avaliativa"});
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
      `SELECT id, material_id, treinamento_id FROM respostas_avaliativas WHERE id = ?${tenantCheck} LIMIT 1`,
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ ok: false, message: "Resposta avaliativa não encontrada" });
    }

    // Fase 4 (isolamento multi-tenant): quando o corpo não manda material_id/
    // treinamento_id, mantém os valores atuais em vez de gravar undefined —
    // e valida o par (novo ou atual) contra o tenant e um contra o outro,
    // fechando a mesma lacuna do create (ver comentário em
    // materialPertenceAoTreinamento).
    const materialIdFinal = material_id ?? exists[0].material_id;
    const treinamentoIdFinal = treinamento_id ?? exists[0].treinamento_id;

    if (treinamento_id && !(await treinamentoPertenceAoTenant(treinamento_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    if (!(await materialPertenceAoTreinamento(materialIdFinal, treinamentoIdFinal))) {
      return res.status(400).json({ ok: false, message: "Material não pertence a este treinamento." });
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
        materialIdFinal,
        treinamentoIdFinal,
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
    console.error("[respostasAvaliativasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar resposta avaliativa"});
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
    console.error("[respostasAvaliativasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir resposta avaliativa"});
  }
}

module.exports = {
  listRespostasAvaliativas,
  createRespostaAvaliativa,
  updateRespostaAvaliativa,
  deleteRespostaAvaliativa,
};
