const db = require("../lib/db");
const { usuarioPertenceAoTenant, treinamentoPertenceAoTenant } = require("../services/tenantValidation");
const { normalizeSubtipo } = require("../lib/subtipos");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// Bugfix: tipo_acao/subtipo/publico_alvo eram gravados como literais fixos
// ("treinamento"/null/null) tanto em criar() quanto em atualizar(), então o
// campo de subdivisão nunca era realmente salvo, mesmo que o frontend
// mandasse um valor. Agora lemos do corpo da requisição, com um valor
// padrão sensato quando ausente.
const TIPOS_ACAO_VALIDOS = ["treinamento", "workshop", "palestra", "outro"];
function normalizeTipoAcao(value) {
  const tipo = String(value || "").trim().toLowerCase();
  return TIPOS_ACAO_VALIDOS.includes(tipo) ? tipo : "treinamento";
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE a.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      ${tenantWhere}
      ORDER BY a.id DESC
      `,
      params
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error("Erro ao listar ações de desenvolvimento:", error);
    return res
      .status(500)
      .json({ error: "Erro ao listar ações de desenvolvimento." });
  }
}

async function detalhar(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND a.empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(
      `
      SELECT
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?${tenantCheck}
      LIMIT 1
      `,
      params
    );

    const acao = rows?.[0];

    if (!acao) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    return res.json(acao);
  } catch (error) {
    console.error("Erro ao detalhar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao detalhar ação." });
  }
}

async function criar(req, res) {
  try {
    const body = req.body || {};

    const jornadaId = body.jornada_id ? Number(body.jornada_id) : null;
    const tema = String(body.titulo || body.tema || "").trim();
    const descricao = body.descricao || null;
    const status = body.status || "planejada";
    const responsavelId = body.responsavel_id ? Number(body.responsavel_id) : null;
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const participantesRealizados = toNumber(body.participantes_realizados, 0);
    const quantidadeTurmasSessoes = toNumber(body.quantidade_turmas_sessoes, 0);
    const horasPlanejadas = toNumber(body.horas_planejadas, 0);
    const horasRealizadas = toNumber(body.horas_realizadas, 0);
    const tipoAcao = normalizeTipoAcao(body.tipo_acao);
    // Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026), achado da
    // auditoria de riscos cruzados: subtipo nunca teve validação (qualquer
    // string era aceita), o que corrompe silenciosamente a agregação usada
    // depois para comprovação ao MPT. Agora valida contra a lista fixa
    // compartilhada com treinamentos.subtipo (ver lib/subtipos.js).
    const subtipo = await normalizeSubtipo(body.subtipo);
    const publicoAlvo = String(body.publico_alvo || "").trim() || null;
    const obrigatoria = body.obrigatoria ? 1 : 0;
    const turmaId = body.turma_id ? Number(body.turma_id) : null;

    if (!jornadaId || !tema) {
      return res.status(400).json({
        error: "Jornada e título da ação são obrigatórios.",
      });
    }

    if (req.empresaId) {
      const [jornadaDoTenant] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornadaId, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    // Fase 4 (isolamento multi-tenant): responsavel_id e turma_id nunca
    // eram checados contra o tenant — ver services/tenantValidation.js.
    if (responsavelId && !(await usuarioPertenceAoTenant(responsavelId, req.empresaId))) {
      return res.status(400).json({ error: "O responsável informado não pertence à sua empresa." });
    }
    if (turmaId && !(await treinamentoPertenceAoTenant(turmaId, req.empresaId))) {
      return res.status(400).json({ error: "A turma informada não pertence à sua empresa." });
    }

    const [result] = await db.query(
      `
      INSERT INTO acoes_desenvolvimento (
        jornada_id,
        etapa_id,
        tipo_acao,
        tema,
        subtipo,
        publico_alvo,
        obrigatoria,
        descricao,
        carga_horaria,
        participantes_previstos,
        participantes_realizados,
        quantidade_turmas_sessoes,
        horas_planejadas,
        horas_realizadas,
        status,
        responsavel_id,
        data_inicio,
        data_fim,
        empresa_id,
        turma_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornadaId,
        null,
        tipoAcao,
        tema,
        subtipo,
        publicoAlvo,
        obrigatoria,
        descricao,
        cargaHoraria,
        participantesPrevistos,
        participantesRealizados,
        quantidadeTurmasSessoes,
        horasPlanejadas,
        horasRealizadas,
        status,
        responsavelId,
        dataInicio,
        dataFim,
        req.empresaId ?? null,
        turmaId,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT 
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json(rows?.[0] || {});
  } catch (error) {
    console.error("Erro ao criar ação de desenvolvimento:", error);
    return res.status(500).json({
      error: "Erro ao criar ação.",
    });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const jornadaId = body.jornada_id ? Number(body.jornada_id) : null;
    const tema = String(body.titulo || body.tema || "").trim();
    const descricao = body.descricao || null;
    const status = body.status || "planejada";
    const responsavelId = body.responsavel_id ? Number(body.responsavel_id) : null;
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const participantesRealizados = toNumber(body.participantes_realizados, 0);
    const quantidadeTurmasSessoes = toNumber(body.quantidade_turmas_sessoes, 0);
    const horasPlanejadas = toNumber(body.horas_planejadas, 0);
    const horasRealizadas = toNumber(body.horas_realizadas, 0);
    const tipoAcao = normalizeTipoAcao(body.tipo_acao);
    // Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026), achado da
    // auditoria de riscos cruzados: subtipo nunca teve validação (qualquer
    // string era aceita), o que corrompe silenciosamente a agregação usada
    // depois para comprovação ao MPT. Agora valida contra a lista fixa
    // compartilhada com treinamentos.subtipo (ver lib/subtipos.js).
    const subtipo = await normalizeSubtipo(body.subtipo);
    const publicoAlvo = String(body.publico_alvo || "").trim() || null;
    const obrigatoria = body.obrigatoria ? 1 : 0;
    const turmaId = body.turma_id ? Number(body.turma_id) : null;

    if (!jornadaId || !tema) {
      return res.status(400).json({
        error: "Jornada e título da ação são obrigatórios.",
      });
    }

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `
      SELECT id
      FROM acoes_desenvolvimento
      WHERE id = ?${tenantCheck}
      LIMIT 1
      `,
      checkParams
    );

    if (!exists?.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    if (req.empresaId) {
      const [jornadaDoTenant] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornadaId, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    // Fase 4 (isolamento multi-tenant): idem ao criar() acima.
    if (responsavelId && !(await usuarioPertenceAoTenant(responsavelId, req.empresaId))) {
      return res.status(400).json({ error: "O responsável informado não pertence à sua empresa." });
    }
    if (turmaId && !(await treinamentoPertenceAoTenant(turmaId, req.empresaId))) {
      return res.status(400).json({ error: "A turma informada não pertence à sua empresa." });
    }

    const updateParams = [
      jornadaId,
      tema,
      tipoAcao,
      subtipo,
      publicoAlvo,
      obrigatoria,
      descricao,
      cargaHoraria,
      participantesPrevistos,
      participantesRealizados,
      quantidadeTurmasSessoes,
      horasPlanejadas,
      horasRealizadas,
      status,
      responsavelId,
      dataInicio,
      dataFim,
      turmaId,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE acoes_desenvolvimento
      SET
        jornada_id = ?,
        tema = ?,
        tipo_acao = ?,
        subtipo = ?,
        publico_alvo = ?,
        obrigatoria = ?,
        descricao = ?,
        carga_horaria = ?,
        participantes_previstos = ?,
        participantes_realizados = ?,
        quantidade_turmas_sessoes = ?,
        horas_planejadas = ?,
        horas_realizadas = ?,
        status = ?,
        responsavel_id = ?,
        data_inicio = ?,
        data_fim = ?,
        turma_id = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(
      `
      SELECT 
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(rows?.[0] || { id: Number(id) });
  } catch (error) {
    console.error("Erro ao atualizar ação de desenvolvimento:", error);
    return res.status(500).json({
      error: "Erro ao atualizar ação.",
    });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];

    if (req.empresaId) {
      const [exists] = await db.query(
        `SELECT id FROM acoes_desenvolvimento WHERE id = ?${tenantCheck}`,
        checkParams
      );
      if (!exists.length) {
        return res.status(404).json({ error: "Ação não encontrada." });
      }
    }

    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?${tenantCheck}`, checkParams);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao remover ação." });
  }
}

// Exportação em XLSX pensada como evidência de horas por cliente e
// subdivisão (ex.: Prevenção ao Assédio Moral, Coaching de Coordenação e
// Gerência) para comprovação junto ao MPT — reúne ações e coaching/mentoria
// do Oceano do Desenvolvimento, agrupados por cliente x subdivisão.
async function exportarEvidencias(req, res) {
  try {
    const tenantWhereAcoes = req.empresaId ? "WHERE a.empresa_id = ?" : "";
    const tenantWhereCoaching = req.empresaId ? "WHERE cp.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [acoes] = await db.query(
      `
      SELECT
        a.*,
        j.nome AS jornada_nome,
        j.cliente AS cliente,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      ${tenantWhereAcoes}
      ORDER BY j.cliente ASC, a.subtipo ASC, a.id ASC
      `,
      params
    );

    const [coachings] = await db.query(
      `
      SELECT
        cp.*,
        j.nome AS jornada_nome,
        j.cliente AS cliente,
        u.nome AS responsavel_nome
      FROM coaching_planos cp
      LEFT JOIN jornadas_desenvolvimento j ON j.id = cp.jornada_id
      LEFT JOIN usuarios u ON u.id = cp.responsavel_id
      ${tenantWhereCoaching}
      ORDER BY j.cliente ASC, cp.id ASC
      `,
      params
    );

    // Resumo: soma de horas planejadas/realizadas por cliente x subdivisão,
    // juntando ações (subtipo) e coaching (tipo_coaching como subdivisão).
    const resumoMap = new Map();
    function acumular(cliente, subdivisao, planejadas, realizadas, qtd) {
      const clienteFinal = String(cliente || "").trim() || "Não informado";
      const subdivisaoFinal = String(subdivisao || "").trim() || "Não classificada";
      const chave = `${clienteFinal}|||${subdivisaoFinal}`;
      if (!resumoMap.has(chave)) {
        resumoMap.set(chave, {
          cliente: clienteFinal,
          subdivisao: subdivisaoFinal,
          qtd: 0,
          horasPlanejadas: 0,
          horasRealizadas: 0,
        });
      }
      const registro = resumoMap.get(chave);
      registro.qtd += qtd;
      registro.horasPlanejadas += planejadas;
      registro.horasRealizadas += realizadas;
    }

    acoes.forEach((a) => {
      acumular(
        a.cliente,
        a.subtipo,
        Number(a.horas_planejadas || 0),
        Number(a.horas_realizadas || 0),
        1
      );
    });
    coachings.forEach((c) => {
      acumular(
        c.cliente,
        c.tipo_coaching ? `Coaching: ${c.tipo_coaching}` : "Coaching",
        Number(c.horas_planejadas || 0),
        Number(c.horas_totais || 0),
        1
      );
    });

    const resumo = Array.from(resumoMap.values()).sort((x, y) => {
      if (x.cliente !== y.cliente) return x.cliente.localeCompare(y.cliente, "pt-BR");
      return x.subdivisao.localeCompare(y.subdivisao, "pt-BR");
    });

    const { novoWorkbook, adicionarTabela } = require("../lib/excelExport");
    const wb = novoWorkbook();

    adicionarTabela(wb, {
      nomeAba: "Resumo por cliente",
      colunas: [
        { titulo: "Cliente", chave: "cliente", largura: 24 },
        { titulo: "Subdivisão", chave: "subdivisao", largura: 30 },
        { titulo: "Qtd. registros", chave: "qtd", largura: 14, formato: "inteiro" },
        { titulo: "Horas planejadas", chave: "horasPlanejadas", largura: 15, formato: "decimal1" },
        { titulo: "Horas realizadas", chave: "horasRealizadas", largura: 15, formato: "decimal1" },
      ],
      linhas: resumo,
    });

    adicionarTabela(wb, {
      nomeAba: "Ações",
      colunas: [
        { titulo: "Cliente", chave: "cliente", largura: 22 },
        { titulo: "Jornada", chave: "jornada", largura: 22 },
        { titulo: "Subdivisão", chave: "subdivisao", largura: 26 },
        { titulo: "Ação", chave: "tema", largura: 28 },
        { titulo: "Status", chave: "status", largura: 14 },
        { titulo: "Responsável", chave: "responsavel", largura: 22 },
        { titulo: "Data início", chave: "data_inicio", largura: 13, formato: "data" },
        { titulo: "Data fim", chave: "data_fim", largura: 13, formato: "data" },
        { titulo: "Horas planejadas", chave: "horas_planejadas", largura: 15, formato: "decimal1" },
        { titulo: "Horas realizadas", chave: "horas_realizadas", largura: 15, formato: "decimal1" },
        { titulo: "Participantes previstos", chave: "participantes_previstos", largura: 16, formato: "inteiro" },
        { titulo: "Participantes realizados", chave: "participantes_realizados", largura: 17, formato: "inteiro" },
      ],
      linhas: acoes.map((a) => ({
        cliente: a.cliente || "Não informado",
        jornada: a.jornada_nome || "",
        subdivisao: a.subtipo || "Não classificada",
        tema: a.tema || "",
        status: a.status || "",
        responsavel: a.responsavel_nome || "",
        data_inicio: a.data_inicio || null,
        data_fim: a.data_fim || null,
        horas_planejadas: Number(a.horas_planejadas || 0),
        horas_realizadas: Number(a.horas_realizadas || 0),
        participantes_previstos: Number(a.participantes_previstos || 0),
        participantes_realizados: Number(a.participantes_realizados || 0),
      })),
    });

    adicionarTabela(wb, {
      nomeAba: "Coaching e mentoria",
      colunas: [
        { titulo: "Cliente", chave: "cliente", largura: 22 },
        { titulo: "Jornada", chave: "jornada", largura: 22 },
        { titulo: "Tipo", chave: "tipo", largura: 22 },
        { titulo: "Título", chave: "titulo", largura: 28 },
        { titulo: "Status", chave: "status", largura: 14 },
        { titulo: "Responsável", chave: "responsavel", largura: 22 },
        { titulo: "Data início", chave: "data_inicio", largura: 13, formato: "data" },
        { titulo: "Data fim", chave: "data_fim", largura: 13, formato: "data" },
        { titulo: "Horas planejadas", chave: "horas_planejadas", largura: 15, formato: "decimal1" },
        { titulo: "Horas realizadas", chave: "horas_realizadas", largura: 15, formato: "decimal1" },
      ],
      linhas: coachings.map((c) => ({
        cliente: c.cliente || "Não informado",
        jornada: c.jornada_nome || "",
        tipo: c.tipo_coaching || "",
        titulo: c.titulo || "",
        status: c.status || "",
        responsavel: c.responsavel_nome || "",
        data_inicio: c.data_inicio || null,
        data_fim: c.data_fim || null,
        horas_planejadas: Number(c.horas_planejadas || 0),
        horas_realizadas: Number(c.horas_totais || 0),
      })),
    });

    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evidencia-mapa-desenvolvimento.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Erro ao exportar evidências do Mapa de Desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao exportar evidências do Mapa de Desenvolvimento." });
  }
}

// Lista enxuta de turmas (treinamentos) para o seletor "Vincular turma" da
// Ação, usada para pré-preencher horas/participantes realizados a partir de
// dados reais de uma turma já executada. É um endpoint próprio do Oceano
// (em vez de reusar /api/treinamentos) porque as permissões dessa rota não
// incluem o perfil "superintendente", que também acessa o Mapa de
// Desenvolvimento — e porque só precisamos de poucos campos, não a turma
// inteira.
async function listarTurmasDisponiveis(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT id, tema, cliente, carga_horaria, participantes,
             participantes_previstos, participantes_presentes, data, data_inicio
      FROM treinamentos
      ${tenantWhere}
      ORDER BY data DESC, id DESC
      `,
      params
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    if (String(error.code || "") === "ER_NO_SUCH_TABLE") {
      return res.json([]);
    }
    console.error("Erro ao listar turmas disponíveis:", error);
    return res.status(500).json({ error: "Erro ao listar turmas disponíveis." });
  }
}

// Bugfix/otimização: o Mapa de Desenvolvimento usava GET /api/usuarios (via
// entityCrud genérico) só para popular os <select> de "Responsável" — mas
// aquele endpoint faz "SELECT * FROM usuarios", devolvendo TODOS os campos
// de todos os usuários da empresa para o navegador a cada carregamento da
// página, incluindo a coluna "senha" (hash) — desnecessário e um vazamento
// de dados que não precisa existir. Este endpoint devolve só id + nome,
// com o mesmo filtro por tenant.
async function listarResponsaveisDisponiveis(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `SELECT id, nome FROM usuarios ${tenantWhere} ORDER BY nome ASC`,
      params
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error("Erro ao listar responsáveis disponíveis:", error);
    return res.status(500).json({ error: "Erro ao listar responsáveis disponíveis." });
  }
}

module.exports = {
  listar,
  detalhar,
  criar,
  atualizar,
  remover,
  exportarEvidencias,
  listarTurmasDisponiveis,
  listarResponsaveisDisponiveis,
};
