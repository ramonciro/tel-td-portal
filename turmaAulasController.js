const pool = require("../lib/db");
const { montarLinhasCronograma, toDateOnly: toDateOnlyGerador } = require("../lib/cronogramaGenerator");
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");

// Decisão 12 (Pacote Salas/Assistente/CPF/Horas/Farol MPT, 15/09/2026): a
// Assistente de Treinamento enxerga o cronograma de qualquer tenant nesta
// tela (Gestão de Turmas) — decidido aqui, por chamada, nunca no
// clientMiddleware (ver lib/tenantScope.js).
const CROSS_TENANT_ROLES = ["assistente_treinamento"];

function parseDateUTC(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      Date.UTC(
        dateValue.getUTCFullYear(),
        dateValue.getUTCMonth(),
        dateValue.getUTCDate(),
        12,
        0,
        0
      )
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");

  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateOnly(dateValue) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return null;

  d.setUTCDate(d.getUTCDate() + days);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSunday(dateValue) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 0;
}

function diffDaysInclusive(start, end) {
  const d1 = parseDateUTC(start);
  const d2 = parseDateUTC(end);

  if (!d1 || !d2 || Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    return 1;
  }

  const diff = Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

function toDateOnly(value) {
  return formatDateOnly(value);
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase().trim();
}

// Isolamento por tenant: turma_aulas não é filtrada pelo próprio empresa_id
// (a coluna existe pra backfill/relatório, mas não é confiável — nada aqui
// grava ela numa aula nova). Em vez disso a aula herda o tenant do
// treinamento pai via JOIN, que é sempre gravado corretamente pelo
// entityCrud (multiTenant: true) no momento da criação da turma. Sem
// empresaId (login legado/super_admin) o filtro não entra, preservando o
// comportamento de hoje.
function tenantJoinTreinamento(req, alias = "t") {
  const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
  return empresaId ? ` AND ${alias}.empresa_id = ${pool.escape(empresaId)}` : "";
}

// Correção de segurança 15/09/2026 (auditoria, Pacote A.5): tenantJoinTreinamento
// só cobre tenant — este módulo (plano de aula/cronograma) não tinha o
// filtro de cliente (SAFRA/CREA/etc. dentro do mesmo tenant) que outras
// telas já aplicam, deixando um instrutor vinculado a um cliente ver/editar
// o plano de aula (título, conteúdo, metodologia) de turma de outro cliente
// do mesmo tenant. Devolve true/false; quem chama decide a mensagem de erro
// (mantendo os "não encontrado" já usados, pra não revelar que a turma
// existe em outro cliente).
async function treinamentoAcessivel(req, treinamentoId) {
  const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
  const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [treinamentoId, empresaId] : [treinamentoId];
  const [rows] = await pool.query(`SELECT cliente FROM treinamentos WHERE id = ?${tenantCheck} LIMIT 1`, params);
  if (!rows.length) return false;
  return usuarioTemAcessoAoCliente(req, rows[0].cliente);
}

async function listTurmaAulas(req, res) {
  try {
    const { treinamento_id } = req.query || {};

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    if (!(await treinamentoAcessivel(req, treinamento_id))) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      `
      SELECT
        a.id,
        a.treinamento_id,
        a.dia_numero,
        a.data_aula,
        a.ordem,
        a.titulo,
        a.objetivo,
        a.conteudo_planejado,
        a.metodologia,
        a.carga_horaria_planejada,
        a.instrutor_responsavel,
        a.material_apoio,
        a.status_execucao,
        a.conteudo_ministrado,
        a.carga_horaria_real,
        a.observacoes_execucao,
        a.reprogramada,
        a.motivo_reprogramacao,
        a.ministrada_em,
        a.criado_em,
        a.atualizado_em
      FROM turma_aulas a
      JOIN treinamentos t ON t.id = a.treinamento_id
      WHERE a.treinamento_id = ?${tenantJoinTreinamento(req)}
      ORDER BY a.dia_numero ASC, a.ordem ASC, a.id ASC
      `,
      [treinamento_id]
    );

    return res.json(rows);
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar aulas da turma"});
  }
}

async function getTurmaAulaById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        a.id,
        a.treinamento_id,
        a.dia_numero,
        a.data_aula,
        a.ordem,
        a.titulo,
        a.objetivo,
        a.conteudo_planejado,
        a.metodologia,
        a.carga_horaria_planejada,
        a.instrutor_responsavel,
        a.material_apoio,
        a.status_execucao,
        a.conteudo_ministrado,
        a.carga_horaria_real,
        a.observacoes_execucao,
        a.reprogramada,
        a.motivo_reprogramacao,
        a.ministrada_em,
        a.criado_em,
        a.atualizado_em,
        t.cliente AS cliente_turma
      FROM turma_aulas a
      JOIN treinamentos t ON t.id = a.treinamento_id
      WHERE a.id = ?${tenantJoinTreinamento(req)}
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length || !usuarioTemAcessoAoCliente(req, rows[0].cliente_turma)) {
      return res.status(404).json({
        ok: false,
        message: "Aula não encontrada",
      });
    }

    delete rows[0].cliente_turma;
    return res.json(rows[0]);
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar aula"});
  }
}

async function createTurmaAula(req, res) {
  try {
    const {
      treinamento_id,
      dia_numero,
      data_aula,
      ordem,
      titulo,
      objetivo,
      conteudo_planejado,
      metodologia,
      carga_horaria_planejada,
      instrutor_responsavel,
      material_apoio,
      status_execucao,
      conteudo_ministrado,
      carga_horaria_real,
      observacoes_execucao,
      reprogramada,
      motivo_reprogramacao,
      ministrada_em,
    } = req.body || {};

    if (!treinamento_id || !dia_numero || !data_aula || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, dia, data e título da aula",
      });
    }

    if (!(await treinamentoAcessivel(req, treinamento_id))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO turma_aulas
      (
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(treinamento_id),
        Number(dia_numero),
        toDateOnly(data_aula),
        Number(ordem || 1),
        titulo,
        objetivo || null,
        conteudo_planejado || null,
        metodologia || null,
        Number(carga_horaria_planejada || 0),
        instrutor_responsavel || null,
        material_apoio || null,
        status_execucao || "planejada",
        conteudo_ministrado || null,
        Number(carga_horaria_real || 0),
        observacoes_execucao || null,
        reprogramada ? 1 : 0,
        motivo_reprogramacao || null,
        ministrada_em || null,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Aula criada com sucesso",
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar aula da turma"});
  }
}

async function updateTurmaAula(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      dia_numero,
      data_aula,
      ordem,
      titulo,
      objetivo,
      conteudo_planejado,
      metodologia,
      carga_horaria_planejada,
      instrutor_responsavel,
      material_apoio,
      status_execucao,
      conteudo_ministrado,
      carga_horaria_real,
      observacoes_execucao,
      reprogramada,
      motivo_reprogramacao,
      ministrada_em,
    } = req.body || {};

    if (!treinamento_id || !dia_numero || !data_aula || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, dia, data e título da aula",
      });
    }

    const [aulaAtual] = await pool.query(
      `SELECT a.id, t.cliente AS cliente_turma FROM turma_aulas a JOIN treinamentos t ON t.id = a.treinamento_id WHERE a.id = ?${tenantJoinTreinamento(req)} LIMIT 1`,
      [id]
    );
    if (!aulaAtual.length || !usuarioTemAcessoAoCliente(req, aulaAtual[0].cliente_turma)) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    if (!(await treinamentoAcessivel(req, treinamento_id))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    await pool.query(
      `
      UPDATE turma_aulas
      SET
        treinamento_id = ?,
        dia_numero = ?,
        data_aula = ?,
        ordem = ?,
        titulo = ?,
        objetivo = ?,
        conteudo_planejado = ?,
        metodologia = ?,
        carga_horaria_planejada = ?,
        instrutor_responsavel = ?,
        material_apoio = ?,
        status_execucao = ?,
        conteudo_ministrado = ?,
        carga_horaria_real = ?,
        observacoes_execucao = ?,
        reprogramada = ?,
        motivo_reprogramacao = ?,
        ministrada_em = ?
      WHERE id = ?
      `,
      [
        Number(treinamento_id),
        Number(dia_numero),
        toDateOnly(data_aula),
        Number(ordem || 1),
        titulo,
        objetivo || null,
        conteudo_planejado || null,
        metodologia || null,
        Number(carga_horaria_planejada || 0),
        instrutor_responsavel || null,
        material_apoio || null,
        status_execucao || "planejada",
        conteudo_ministrado || null,
        Number(carga_horaria_real || 0),
        observacoes_execucao || null,
        reprogramada ? 1 : 0,
        motivo_reprogramacao || null,
        ministrada_em || null,
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Aula atualizada com sucesso",
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar aula da turma"});
  }
}

async function deleteTurmaAula(req, res) {
  try {
    const { id } = req.params;

    const [aulaAtual] = await pool.query(
      `SELECT a.id, t.cliente AS cliente_turma FROM turma_aulas a JOIN treinamentos t ON t.id = a.treinamento_id WHERE a.id = ?${tenantJoinTreinamento(req)} LIMIT 1`,
      [id]
    );
    if (!aulaAtual.length || !usuarioTemAcessoAoCliente(req, aulaAtual[0].cliente_turma)) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    await pool.query(`DELETE FROM turma_aulas WHERE id = ?`, [id]);

    return res.json({
      ok: true,
      message: "Aula excluída com sucesso",
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir aula da turma"});
  }
}

// Insere as linhas já calculadas por montarLinhasCronograma() — usado tanto
// pelo endpoint manual abaixo quanto pela geração automática na criação da
// turma (decisão 21, ver gerarCronogramaAutomatico). Não faz nenhum cálculo
// por conta própria — isso é responsabilidade única de cronogramaGenerator.js,
// pra manual/automático/migração retroativa nunca divergirem.
async function inserirLinhasCronograma(treinamentoId, linhas) {
  for (const linha of linhas) {
    await pool.query(
      `
      INSERT INTO turma_aulas
      (
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        status_execucao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(treinamentoId),
        linha.dia_numero,
        linha.data_aula,
        1,
        linha.titulo,
        linha.objetivo,
        null,
        null,
        linha.carga_horaria_planejada,
        linha.instrutor_responsavel,
        linha.status_execucao,
      ]
    );
  }
}

async function gerarCronogramaTurma(req, res) {
  try {
    const { treinamento_id } = req.body || {};

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    const [treinamentos] = await pool.query(
      `
      SELECT
        id,
        tema,
        instrutor,
        status,
        data,
        data_inicio,
        data_fim,
        carga_horaria,
        hora_inicio,
        hora_fim,
        cliente
      FROM treinamentos
      WHERE id = ?${tenantJoinTreinamento(req, "treinamentos")}
      LIMIT 1
      `,
      [treinamento_id]
    );

    if (!treinamentos.length || !usuarioTemAcessoAoCliente(req, treinamentos[0].cliente)) {
      return res.status(404).json({
        ok: false,
        message: "Turma não encontrada",
      });
    }

    const turma = treinamentos[0];

    const [existentes] = await pool.query(
      `SELECT COUNT(*) AS total FROM turma_aulas WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    if (Number(existentes[0]?.total || 0) > 0) {
      return res.status(400).json({
        ok: false,
        message: "Essa turma já possui aulas cadastradas",
      });
    }

    const hojeISO = toDateOnlyGerador(new Date());
    const { linhas, pulada, motivoPulo } = montarLinhasCronograma({ turma, hojeISO });

    if (pulada) {
      return res.status(400).json({
        ok: false,
        message: `Não foi possível gerar o cronograma: ${motivoPulo}.`,
      });
    }

    await inserirLinhasCronograma(treinamento_id, linhas);

    return res.json({
      ok: true,
      message: "Cronograma base gerado com sucesso",
      total_dias: linhas.length,
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao gerar cronograma da turma"});
  }
}

// Decisão 21 ("cronograma sempre") — chamado pelo afterWrite do CRUD
// genérico de /api/treinamentos logo após criar a turma. Nunca lança: uma
// falha aqui não pode impedir a turma de ser criada (ela já foi gravada),
// só fica sem cronograma automático — o botão manual "Gerar cronograma"
// continua disponível como caminho de recuperação, e o log abaixo avisa no
// servidor pra não passar despercebido.
async function gerarCronogramaAutomatico({ id, data }) {
  try {
    const [existentes] = await pool.query(
      `SELECT COUNT(*) AS total FROM turma_aulas WHERE treinamento_id = ?`,
      [id]
    );
    if (Number(existentes[0]?.total || 0) > 0) return;

    const turma = {
      tema: data.tema,
      instrutor: data.instrutor,
      status: data.status,
      data: data.data,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      carga_horaria: data.carga_horaria,
      hora_inicio: data.hora_inicio,
      hora_fim: data.hora_fim,
    };

    const hojeISO = toDateOnlyGerador(new Date());
    const { linhas, pulada, motivoPulo } = montarLinhasCronograma({ turma, hojeISO });

    if (pulada) {
      console.warn(`[cronograma automático] turma #${id} sem cronograma gerado: ${motivoPulo}`);
      return;
    }

    await inserirLinhasCronograma(id, linhas);
  } catch (error) {
    console.error(`[cronograma automático] falhou para a turma #${id}:`, error.message || error);
  }
}

async function duplicarPlanoAulas(req, res) {
  try {
    const { treinamento_origem_id, treinamento_destino_id } = req.body || {};

    if (!treinamento_origem_id || !treinamento_destino_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento_origem_id e treinamento_destino_id",
      });
    }

    const [origemAcessivel, destinoAcessivel] = await Promise.all([
      treinamentoAcessivel(req, treinamento_origem_id),
      treinamentoAcessivel(req, treinamento_destino_id),
    ]);
    if (!origemAcessivel || !destinoAcessivel) {
      return res.status(404).json({
        ok: false,
        message: "Treinamento de origem ou destino não encontrado",
      });
    }

    const [origem] = await pool.query(
      `
      SELECT *
      FROM turma_aulas
      WHERE treinamento_id = ?
      ORDER BY dia_numero ASC, ordem ASC, id ASC
      `,
      [treinamento_origem_id]
    );

    if (!origem.length) {
      return res.status(404).json({
        ok: false,
        message: "A turma de origem não possui aulas",
      });
    }

    const [existentesDestino] = await pool.query(
      `SELECT COUNT(*) AS total FROM turma_aulas WHERE treinamento_id = ?`,
      [treinamento_destino_id]
    );

    if (Number(existentesDestino[0]?.total || 0) > 0) {
      return res.status(400).json({
        ok: false,
        message: "A turma de destino já possui aulas cadastradas",
      });
    }

    for (const aula of origem) {
      await pool.query(
        `
        INSERT INTO turma_aulas
        (
          treinamento_id,
          dia_numero,
          data_aula,
          ordem,
          titulo,
          objetivo,
          conteudo_planejado,
          metodologia,
          carga_horaria_planejada,
          instrutor_responsavel,
          material_apoio,
          status_execucao,
          conteudo_ministrado,
          carga_horaria_real,
          observacoes_execucao,
          reprogramada,
          motivo_reprogramacao,
          ministrada_em
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(treinamento_destino_id),
          Number(aula.dia_numero || 1),
          toDateOnly(aula.data_aula),
          Number(aula.ordem || 1),
          aula.titulo,
          aula.objetivo,
          aula.conteudo_planejado,
          aula.metodologia,
          Number(aula.carga_horaria_planejada || 0),
          aula.instrutor_responsavel,
          aula.material_apoio,
          "planejada",
          null,
          0,
          null,
          0,
          null,
          null,
        ]
      );
    }

    return res.json({
      ok: true,
      message: "Plano de aulas duplicado com sucesso",
      total: origem.length,
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao duplicar plano de aulas"});
  }
}

async function getResumoTurmaAulas(req, res) {
  try {
    const { treinamento_id } = req.params;

    if (!(await treinamentoAcessivel(req, treinamento_id))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const [aulas] = await pool.query(
      `
      SELECT
        id,
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em
      FROM turma_aulas
      WHERE treinamento_id = ?
      ORDER BY dia_numero ASC, ordem ASC, id ASC
      `,
      [treinamento_id]
    );

    // FIX (Pacote 2 — "alinhar status de aulas"): este resumo contava aulas
    // com status_execucao "ministrada"/"parcial", valores que nunca existiram
    // nos dados reais — o formulário de Cronograma (STATUS_AULA_OPTIONS no
    // frontend) só grava planejada/em_andamento/concluida/reprogramada/
    // cancelada (mesmo engano já documentado e corrigido em
    // capacidadeResolver.js). Na prática, ministradas/parciais sempre davam
    // zero e toda aula concluída ou em andamento caía no bucket "planejadas"
    // do detalhamento por dia (ver `else` mais abaixo, antes desta correção).
    const totalAulas = aulas.length;
    const planejadas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "planejada"
    ).length;
    const concluidas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "concluida"
    ).length;
    const emAndamento = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "em_andamento"
    ).length;
    const reprogramadas = aulas.filter(
      (item) =>
        normalizeStatus(item.status_execucao) === "reprogramada" ||
        Number(item.reprogramada || 0) === 1
    ).length;
    const canceladas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "cancelada"
    ).length;

    const cargaPlanejada = aulas.reduce(
      (acc, item) => acc + Number(item.carga_horaria_planejada || 0),
      0
    );

    const cargaReal = aulas.reduce(
      (acc, item) => acc + Number(item.carga_horaria_real || 0),
      0
    );

    const aderenciaAulas = totalAulas
      ? Math.round(((concluidas + emAndamento) / totalAulas) * 100)
      : 0;

    const aderenciaCarga =
      cargaPlanejada > 0 ? Math.round((cargaReal / cargaPlanejada) * 100) : 0;

    const desvioCarga = Number((cargaReal - cargaPlanejada).toFixed(2));

    const porDiaMap = {};

    aulas.forEach((item) => {
      const key = `${item.dia_numero}-${toDateOnly(item.data_aula)}`;

      if (!porDiaMap[key]) {
        porDiaMap[key] = {
          dia_numero: Number(item.dia_numero || 0),
          data_aula: toDateOnly(item.data_aula),
          total_aulas: 0,
          concluidas: 0,
          em_andamento: 0,
          planejadas: 0,
          reprogramadas: 0,
          canceladas: 0,
          carga_planejada: 0,
          carga_real: 0,
        };
      }

      const bucket = porDiaMap[key];
      const status = normalizeStatus(item.status_execucao);

      bucket.total_aulas += 1;
      bucket.carga_planejada += Number(item.carga_horaria_planejada || 0);
      bucket.carga_real += Number(item.carga_horaria_real || 0);

      if (status === "concluida") bucket.concluidas += 1;
      else if (status === "em_andamento") bucket.em_andamento += 1;
      else if (status === "reprogramada" || Number(item.reprogramada || 0) === 1)
        bucket.reprogramadas += 1;
      else if (status === "cancelada") bucket.canceladas += 1;
      else bucket.planejadas += 1; // "planejada" ou status vazio/desconhecido
    });

    const porDia = Object.values(porDiaMap)
      .sort((a, b) => a.dia_numero - b.dia_numero)
      .map((item) => {
        const aderencia =
          item.total_aulas > 0
            ? Math.round(((item.concluidas + item.em_andamento) / item.total_aulas) * 100)
            : 0;

        return {
          ...item,
          aderencia_aulas: aderencia,
          desvio_carga: Number((item.carga_real - item.carga_planejada).toFixed(2)),
        };
      });

    const alertas = [];

    if (planejadas > 0) {
      alertas.push(`${planejadas} aula(s) ainda estão planejadas.`);
    }

    if (emAndamento > 0) {
      alertas.push(`${emAndamento} aula(s) estão em andamento.`);
    }

    if (reprogramadas > 0) {
      alertas.push(`${reprogramadas} aula(s) estão reprogramadas.`);
    }

    if (canceladas > 0) {
      alertas.push(`${canceladas} aula(s) foram canceladas.`);
    }

    if (!alertas.length) {
      alertas.push("Cronograma sem alertas críticos no momento.");
    }

    return res.json({
      ok: true,
      resumo: {
        total_aulas: totalAulas,
        planejadas,
        concluidas,
        em_andamento: emAndamento,
        reprogramadas,
        canceladas,
        carga_planejada: Number(cargaPlanejada.toFixed(2)),
        carga_real: Number(cargaReal.toFixed(2)),
        aderencia_aulas: aderenciaAulas,
        aderencia_carga: aderenciaCarga,
        desvio_carga: desvioCarga,
      },
      por_dia: porDia,
      alertas,
    });
  } catch (error) {
    console.error("[turmaAulasController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar resumo do cronograma"});
  }
}

module.exports = {
  listTurmaAulas,
  getTurmaAulaById,
  createTurmaAula,
  updateTurmaAula,
  deleteTurmaAula,
  gerarCronogramaTurma,
  gerarCronogramaAutomatico,
  duplicarPlanoAulas,
  getResumoTurmaAulas,
  // Exportado para uso exclusivo do script de migração retroativa
  // (scripts/migrarCronogramaRetroativo.js) — reaproveita o mesmo INSERT que
  // os dois outros chamadores usam, para os três nunca divergirem em como
  // uma linha de turma_aulas é gravada.
  inserirLinhasCronograma,
};
