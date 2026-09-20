const db = require("../lib/db");

// Coaching individual (20/09/2026, pedido do Ramon): trilha à parte da
// jornada coletiva, pessoa a pessoa, com cadência própria por
// relacionamento. Ver comentário completo em migrate.js (passo 39/40) e
// claude/framework-kpis-metodologia-2026-09-20.md. Regra central: o farol
// aqui NUNCA entra no cálculo de adesão ao cronograma da jornada coletiva
// (metodologiaKpisController.js) — são dois números que ficam separados de
// propósito.

// Mesmo padrão de validação de tenant já usado em coachingPlanosController.js
// e acoesDesenvolvimentoController.js.
async function validarPertencimentoTenant(req, { jornada_participante_id, responsavel_id }) {
  if (!req.empresaId) return null;

  if (jornada_participante_id) {
    const [rows] = await db.query(
      `SELECT id FROM jornada_participantes WHERE id = ? AND empresa_id = ?`,
      [jornada_participante_id, req.empresaId]
    );
    if (!rows.length) return "Participante de jornada não encontrado.";
  }

  if (responsavel_id) {
    const [rows] = await db.query(
      `SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?`,
      [responsavel_id, req.empresaId]
    );
    if (!rows.length) return "O responsável informado não pertence à sua empresa.";
  }

  return null;
}

// Farol calculado em runtime a partir do último encontro registrado — nunca
// guardado numa coluna, pra não dessincronizar (mesmo raciocínio do farol
// de prazo em mapa-desenvolvimento/page.js, getPrazoInfo). Sem nenhum
// encontro ainda: "aguardando" (não é tratado como atraso — a pessoa pode
// ter acabado de entrar no coaching).
function calcularFarolCoaching({ ultimo_encontro, cadencia_dias, status }) {
  if (status === "encerrado") return { farol: "encerrado", dias_desde_ultimo: null };
  if (!ultimo_encontro) return { farol: "aguardando", dias_desde_ultimo: null };

  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const ultimo = new Date(ultimo_encontro);
  const ultimoLocal = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate());

  const diasDesdeUltimo = Math.round((hojeLocal - ultimoLocal) / (1000 * 60 * 60 * 24));
  const farol = diasDesdeUltimo > Number(cadencia_dias || 30) ? "atrasado" : "em_dia";

  return { farol, dias_desde_ultimo: diasDesdeUltimo };
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE ci.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT ci.*,
             jp.jornada_id AS jornada_participante_jornada_id,
             jd.nome AS jornada_nome,
             u.nome AS responsavel_nome,
             (SELECT MAX(data_encontro) FROM coaching_encontros ce WHERE ce.coaching_individual_id = ci.id) AS ultimo_encontro,
             (SELECT COUNT(*) FROM coaching_encontros ce WHERE ce.coaching_individual_id = ci.id) AS total_encontros
      FROM coaching_individual ci
      LEFT JOIN jornada_participantes jp ON jp.id = ci.jornada_participante_id
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
      LEFT JOIN usuarios u ON u.id = ci.responsavel_id
      ${tenantWhere}
      ORDER BY ci.nome ASC
      `,
      params
    );

    const comFarol = rows.map((row) => ({
      ...row,
      ...calcularFarolCoaching(row),
    }));

    res.json(comFarol);
  } catch (error) {
    console.error("Erro ao listar coaching individual:", error);
    res.status(500).json({ error: "Erro ao listar coaching individual." });
  }
}

async function buscarPorId(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND ci.empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(
      `
      SELECT ci.*,
             jp.jornada_id AS jornada_participante_jornada_id,
             jd.nome AS jornada_nome,
             u.nome AS responsavel_nome,
             (SELECT MAX(data_encontro) FROM coaching_encontros ce WHERE ce.coaching_individual_id = ci.id) AS ultimo_encontro,
             (SELECT COUNT(*) FROM coaching_encontros ce WHERE ce.coaching_individual_id = ci.id) AS total_encontros
      FROM coaching_individual ci
      LEFT JOIN jornada_participantes jp ON jp.id = ci.jornada_participante_id
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
      LEFT JOIN usuarios u ON u.id = ci.responsavel_id
      WHERE ci.id = ?${tenantCheck}
      `,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    const [encontros] = await db.query(
      `SELECT * FROM coaching_encontros WHERE coaching_individual_id = ? ORDER BY data_encontro DESC`,
      [id]
    );

    res.json({ ...rows[0], ...calcularFarolCoaching(rows[0]), encontros });
  } catch (error) {
    console.error("Erro ao buscar coaching individual:", error);
    res.status(500).json({ error: "Erro ao buscar coaching individual." });
  }
}

async function criar(req, res) {
  try {
    const {
      nome,
      matricula,
      cliente,
      cargo,
      jornada_participante_id,
      responsavel_id,
      cadencia_dias,
      status,
      data_inicio,
      data_fim,
      observacoes,
    } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome da pessoa é obrigatório." });
    }

    const jornadaParticipanteIdNum = jornada_participante_id ? Number(jornada_participante_id) : null;
    const responsavelIdNum = responsavel_id ? Number(responsavel_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_participante_id: jornadaParticipanteIdNum,
      responsavel_id: responsavelIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const [result] = await db.query(
      `
      INSERT INTO coaching_individual
      (nome, matricula, cliente, cargo, jornada_participante_id, responsavel_id,
       cadencia_dias, status, data_inicio, data_fim, observacoes, empresa_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nome,
        matricula || null,
        cliente || null,
        cargo || null,
        jornadaParticipanteIdNum,
        responsavelIdNum,
        Number(cadencia_dias || 30),
        status || "ativo",
        data_inicio || null,
        data_fim || null,
        observacoes || null,
        req.empresaId ?? null,
      ]
    );

    const [rows] = await db.query(`SELECT * FROM coaching_individual WHERE id = ?`, [result.insertId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar coaching individual:", error);
    res.status(500).json({ error: "Erro ao criar coaching individual." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const {
      nome,
      matricula,
      cliente,
      cargo,
      jornada_participante_id,
      responsavel_id,
      cadencia_dias,
      status,
      data_inicio,
      data_fim,
      observacoes,
    } = req.body;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    const jornadaParticipanteIdNum = jornada_participante_id ? Number(jornada_participante_id) : null;
    const responsavelIdNum = responsavel_id ? Number(responsavel_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_participante_id: jornadaParticipanteIdNum,
      responsavel_id: responsavelIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const updateParams = [
      nome,
      matricula || null,
      cliente || null,
      cargo || null,
      jornadaParticipanteIdNum,
      responsavelIdNum,
      Number(cadencia_dias || 30),
      status || "ativo",
      data_inicio || null,
      data_fim || null,
      observacoes || null,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE coaching_individual
      SET nome = ?, matricula = ?, cliente = ?, cargo = ?,
          jornada_participante_id = ?, responsavel_id = ?, cadencia_dias = ?,
          status = ?, data_inicio = ?, data_fim = ?, observacoes = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(`SELECT * FROM coaching_individual WHERE id = ?`, [id]);

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar coaching individual:", error);
    res.status(500).json({ error: "Erro ao atualizar coaching individual." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    // Log de encontros some junto (não faz sentido órfão) — sem FK no banco,
    // então a limpeza é feita aqui, explícita, dentro do mesmo tenant.
    await db.query(`DELETE FROM coaching_encontros WHERE coaching_individual_id = ?`, [id]);
    await db.query(`DELETE FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    res.json({ success: true, message: "Coaching individual removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover coaching individual:", error);
    res.status(500).json({ error: "Erro ao remover coaching individual." });
  }
}

async function listarEncontros(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    const [rows] = await db.query(
      `SELECT * FROM coaching_encontros WHERE coaching_individual_id = ? ORDER BY data_encontro DESC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar encontros de coaching:", error);
    res.status(500).json({ error: "Erro ao listar encontros de coaching." });
  }
}

async function criarEncontro(req, res) {
  try {
    const { id } = req.params;
    const { data_encontro, observacoes } = req.body;

    if (!data_encontro) {
      return res.status(400).json({ error: "Data do encontro é obrigatória." });
    }

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    const [result] = await db.query(
      `INSERT INTO coaching_encontros (coaching_individual_id, data_encontro, observacoes, registrado_por_id, empresa_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, data_encontro, observacoes || null, req.user?.id || null, req.empresaId ?? null]
    );

    const [rows] = await db.query(`SELECT * FROM coaching_encontros WHERE id = ?`, [result.insertId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao registrar encontro de coaching:", error);
    res.status(500).json({ error: "Erro ao registrar encontro de coaching." });
  }
}

async function removerEncontro(req, res) {
  try {
    const { id, encontroId } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM coaching_individual WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Coaching individual não encontrado." });
    }

    await db.query(`DELETE FROM coaching_encontros WHERE id = ? AND coaching_individual_id = ?`, [encontroId, id]);

    res.json({ success: true, message: "Encontro removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover encontro de coaching:", error);
    res.status(500).json({ error: "Erro ao remover encontro de coaching." });
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  remover,
  listarEncontros,
  criarEncontro,
  removerEncontro,
};
