/**
 * analyticsController.js — Sprint 5: Analytics & KPIs
 *
 * Motor de cálculo de todos os indicadores do Portal T&D.
 * Todas as queries são filtradas por empresa_id, via tenantScopeFor().
 * super_admin (empresaId = null) recebe dados globais de todos os tenants.
 * superintendente também (Pacote Superintendente, 24/09/2026) — ver
 * CROSS_TENANT_ROLES abaixo.
 *
 * Endpoints:
 *   GET /api/analytics/resumo       → getResumo
 *   GET /api/analytics/horas        → getHoras
 *   GET /api/analytics/nps          → getNps
 *   GET /api/analytics/efetividade  → getEfetividade
 *   GET /api/analytics/roi          → getRoi
 */

const pool = require('../lib/db');
const {
  getHorasAplicadasTotal,
  getHorasAplicadasPorMes,
  getHorasAplicadasPorCliente,
  getHorasAplicadasPorInstrutor,
} = require('../services/capacidadeResolver');
const { tenantScopeFor } = require('../lib/tenantScope');
const { getResumoPresenca } = require('../services/presencaResolver');

// Pacote Superintendente (24/09/2026): a superintendente é chefe dos
// coordenadores e precisa ver Indicadores de todos os tenants, sem escolher
// um tenant no login (cada conta já tem um empresa_id fixo — a seleção no
// login é só validação visual, não um filtro em runtime). Mesmo mecanismo já
// usado para a Assistente de Treinamento (ver tenantScope.js e
// claude/auditoria-riscos-cruzados-pacote-salas-2026-09.md): decidido aqui,
// por endpoint, nunca no clientMiddleware global.
const CROSS_TENANT_ROLES = ['superintendente'];

/* ─── helpers ──────────────────────────────────────────────────────────────── */

// Gera o WHERE clause de tenant dinamicamente
function tenantWhere(empresaId, alias = 't') {
  return empresaId ? `${alias}.empresa_id = ${pool.escape(empresaId)}` : '1=1';
}

// Filtro de recorte (cliente/operação e período), comum a todas as abas de
// Indicadores — pedido do coordenador para poder isolar "NPS do último
// trimestre" ou "efetividade só do cliente X" sem sair da tela. Sempre
// somado ao tenantWhere (nunca substitui o isolamento por tenant) e às
// janelas fixas dos gráficos de tendência (últimos 6/12 meses), que
// continuam valendo por cima deste filtro.
function filtroRecorte(query = {}, alias = 't') {
  const conditions = [];
  const params = [];
  if (query.cliente) {
    conditions.push(`${alias}.cliente = ?`);
    params.push(query.cliente);
  }
  // Alinhado ao Dashboard (15/10/2026): o início do período olha a data de
  // INÍCIO da turma e o fim do período olha a data de FIM (ou, sem data de
  // fim, a de início). Antes aqui os dois extremos usavam a data de fim, e o
  // mesmo intervalo trazia turmas diferentes nas duas telas.
  if (query.data_inicio) {
    conditions.push(`DATE(COALESCE(${alias}.data_inicio, ${alias}.data)) >= ?`);
    params.push(query.data_inicio);
  }
  if (query.data_fim) {
    conditions.push(`DATE(COALESCE(${alias}.data_fim, ${alias}.data_inicio, ${alias}.data)) <= ?`);
    params.push(query.data_fim);
  }
  return {
    sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

// Custo por hora usado no cálculo de ROI. Antes fixo em R$ 150 para todo
// mundo, com uma nota na tela prometendo uma tela de configuração que não
// existia. Agora lê de empresas.custo_hora_treinamento — configurável em
// Painel Super Admin (/admin) → clicar no tenant → seção "Dados do tenant"
// → campo "Custo por hora de treinamento (R$)" (frontend/app/admin/empresa/[id]/page.js).
// Sem tenant (ex.: super_admin navegando sem empresa) ou sem valor definido,
// mantém os R$ 150 como referência padrão.
const CUSTO_HORA_PADRAO = 150;
async function getCustoPorHora(empresaId) {
  if (!empresaId) return CUSTO_HORA_PADRAO;
  try {
    const [[row]] = await pool.query(
      'SELECT custo_hora_treinamento FROM empresas WHERE id = ? LIMIT 1',
      [empresaId]
    );
    const valor = Number(row?.custo_hora_treinamento);
    return valor > 0 ? valor : CUSTO_HORA_PADRAO;
  } catch (_) {
    return CUSTO_HORA_PADRAO;
  }
}

// Status de turmas concluídas (variações encontradas no banco)
// LIKE evita problemas de charset/acento no MySQL do Railway
const STATUS_CONCLUIDO = "(LOWER(TRIM(status)) LIKE '%conclui%' OR LOWER(TRIM(status)) = 'encerrado')";
const STATUS_ANDAMENTO = "(LOWER(TRIM(status)) LIKE '%andamento%' OR LOWER(TRIM(status)) IN ('ativo','ativa'))";
const STATUS_PLANEJADO = "(LOWER(TRIM(status)) LIKE '%planej%' OR LOWER(TRIM(status)) = 'agendado')";

// Fallback seguro para SUM de inteiros
function asInt(v) { return Number(v || 0); }
function asDec(v) { return v != null ? Number(Number(v).toFixed(1)) : null; }

/* ─── recorte de turmas pelo motor único (mesmo do Dashboard) ──────────────── */

function isoData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return [
      valor.getFullYear(),
      String(valor.getMonth() + 1).padStart(2, '0'),
      String(valor.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return String(valor).slice(0, 10);
}

// Carrega as turmas do recorte (tenant + cliente + período) já com presença,
// status e horas resolvidos pelo presencaResolver — a MESMA fonte do
// Dashboard e da Gestão de Turmas. Antes, Indicadores calculava presença só
// pela tabela antiga `presencas` (dividindo por todas as linhas, inclusive
// justificado/pendente) e status pela coluna crua, e por isso os números
// nunca batiam com o Dashboard (Ramon, 15/10/2026: presença 97% x 80,5%).
async function carregarTurmasRecorte(query, empresaId) {
  const todas = await getResumoPresenca({ empresaId });
  return todas.filter((t) => {
    if (query.cliente && t.cliente !== query.cliente) return false;
    const inicio = isoData(t.data_inicio) || isoData(t.data);
    const fim = isoData(t.data_fim) || inicio;
    if (query.data_inicio && !(inicio && inicio >= query.data_inicio)) return false;
    if (query.data_fim && !(fim && fim <= query.data_fim)) return false;
    return true;
  });
}

// Agrega as turmas do recorte numa única passada.
function resumirTurmas(turmas) {
  const r = {
    turmas_total: turmas.length,
    turmas_concluidas: 0,
    por_status: {},
    presentes_pessoas: 0,
    ausentes_pessoas: 0,
    matriculas_confirmadas: 0,
    matriculas_previstas: 0,   // base ativa: o maior entre previsto e confirmado, por turma
    horas_previstas: 0,
    horas_aplicadas: 0,
  };
  for (const t of turmas) {
    const status = t.status_turma || 'Planejada';
    r.por_status[status] = (r.por_status[status] || 0) + 1;
    if (status === 'Concluída') r.turmas_concluidas += 1;
    r.presentes_pessoas += asInt(t.presentes_pessoas);
    r.ausentes_pessoas += asInt(t.ausentes_pessoas);
    const confirmados = asInt(t.treinandos_confirmados);
    r.matriculas_confirmadas += confirmados;
    r.matriculas_previstas += Math.max(asInt(t.treinandos_previstos), confirmados);
    r.horas_previstas += Number(t.horas_planejadas || 0);
    r.horas_aplicadas += Number(t.horas_aplicadas || 0);
  }
  const base = r.presentes_pessoas + r.ausentes_pessoas;
  // Inteiro, como no Dashboard (97% lá, 97% aqui — sem casas decimais que
  // façam o mesmo número parecer diferente).
  r.taxa_presenca = base > 0 ? Math.round((r.presentes_pessoas / base) * 100) : null;
  return r;
}

// Pessoas únicas (por nome) nas turmas do recorte. Por definição, pessoas
// únicas nunca passam das matrículas confirmadas (a mesma pessoa em 3 turmas
// = 1 pessoa, 3 matrículas); quando o cadastro da turma tem mais nomes do que
// matrículas confirmadas pela chamada, o excedente não conta como pessoa
// impactada — por isso o teto `maxMatriculas`.
async function contarPessoasUnicas(turmas, maxMatriculas = null) {
  const ids = turmas.map((t) => Number(t.id)).filter(Boolean);
  if (!ids.length) return 0;
  const [[row]] = await pool.query(
    'SELECT COUNT(DISTINCT tp.nome) AS total FROM treinamento_participantes tp WHERE tp.treinamento_id IN (?)',
    [ids]
  );
  const total = asInt(row.total);
  return maxMatriculas === null ? total : Math.min(total, asInt(maxMatriculas));
}

/* ─── GET /api/analytics/resumo ────────────────────────────────────────────── */
async function getResumo(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const tw   = tenantWhere(eId);
    const filtro = filtroRecorte(req.query);

    // Lista de clientes/operações do tenant, para alimentar o filtro na tela
    // (Indicadores não tinha filtro nenhum antes — nem cliente, nem período).
    let clientes = [];
    try {
      const [clienteRows] = await pool.query(
        `SELECT DISTINCT cliente FROM treinamentos t WHERE ${tw} AND cliente IS NOT NULL AND cliente <> '' ORDER BY cliente`
      );
      clientes = clienteRows.map((r) => r.cliente);
    } catch (_) {}

    // Turmas do recorte pelo motor único (mesmo do Dashboard): status,
    // presença e horas previstas já resolvidos por turma.
    const turmas = await carregarTurmasRecorte(req.query, eId);
    const agg = resumirTurmas(turmas);

    // Horas treinadas (aplicadas) — mesma fonte única da Capacidade: aula a
    // aula quando a turma tem cronograma, senão carga horária nominal de
    // turma que já rodou/está rodando.
    const horas_total = await getHorasAplicadasTotal({
      empresaId: eId,
      cliente: req.query.cliente,
      dataInicio: req.query.data_inicio,
      dataFim: req.query.data_fim,
    });

    // Pessoas únicas x matrículas: a mesma pessoa em 3 turmas é 1 pessoa
    // única e 3 matrículas (o Dashboard mostra matrículas em "Confirmados").
    const participantes_unicos = await contarPessoasUnicas(turmas, agg.matriculas_confirmadas);

    // NPS — duas leituras do mesmo dado: o SCORE clássico (-100 a +100,
    // promotores menos detratores) e a NOTA MÉDIA (0 a 10, a que o Dashboard
    // mostra como "NPS médio").
    let nps_score = null;
    let nps_media = null;
    try {
      const [[nRow]] = await pool.query(
        `SELECT
           COUNT(*)                                                         AS total,
           SUM(CASE WHEN nota_nps >= 9 THEN 1 ELSE 0 END)                  AS promotores,
           SUM(CASE WHEN nota_nps < 7 THEN 1 ELSE 0 END)                   AS detratores,
           ROUND(AVG(nota_nps), 1)                                          AS media
         FROM avaliacoes av
         JOIN treinamentos t ON t.id = av.treinamento_id
         WHERE ${tenantWhere(eId, 't')}${filtro.sql} AND av.nota_nps IS NOT NULL`,
        filtro.params
      );
      if (asInt(nRow.total) > 0) {
        nps_score = Math.round(
          ((asInt(nRow.promotores) - asInt(nRow.detratores)) / asInt(nRow.total)) * 100
        );
        nps_media = Number(nRow.media);
      }
    } catch (_) {}

    return res.json({
      turmas_total:         agg.turmas_total,
      turmas_concluidas:    agg.turmas_concluidas,
      horas_total:          asDec(horas_total),
      horas_previstas:      asDec(agg.horas_previstas),
      participantes_unicos,
      matriculas:           agg.matriculas_confirmadas,
      nps_score,
      nps_media,
      // Presença por PESSOA (presentes / (presentes + ausentes)), a mesma
      // regra do Dashboard e da Frequência Individual: justificado e
      // pendente não contam contra a taxa.
      taxa_presenca:        agg.taxa_presenca,
      por_status:           agg.por_status,
      clientes,
    });
  } catch (error) {
    console.error('[analytics] getResumo:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar resumo'});
  }
}

/* ─── GET /api/analytics/horas ─────────────────────────────────────────────── */
async function getHoras(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const cliente = req.query.cliente;
    const dataInicio = req.query.data_inicio;
    const dataFim = req.query.data_fim;

    // Horas aplicadas — mesma fonte única da Capacidade (aula a aula quando
    // a turma tem cronograma, senão carga horária nominal de turma que já
    // rodou/está rodando). Antes cada agregação abaixo somava carga_horaria
    // nominal de turmas concluídas direto na tabela treinamentos, sem olhar
    // aula a aula — o que divergia do que a tela de Capacidade mostrava.
    const [porMes, porCliente, porInstrutor, total] = await Promise.all([
      getHorasAplicadasPorMes({ empresaId: eId, cliente, dataInicio, dataFim }),
      getHorasAplicadasPorCliente({ empresaId: eId, cliente, dataInicio, dataFim, limit: 10 }),
      getHorasAplicadasPorInstrutor({ empresaId: eId, cliente, dataInicio, dataFim, limit: 10 }),
      getHorasAplicadasTotal({ empresaId: eId, cliente, dataInicio, dataFim }),
    ]);

    return res.json({
      total,
      por_mes:       porMes,
      por_cliente:   porCliente,
      por_instrutor: porInstrutor,
    });
  } catch (error) {
    console.error('[analytics] getHoras:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar horas'});
  }
}

/* ─── GET /api/analytics/nps ───────────────────────────────────────────────── */
async function getNps(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const filtro = filtroRecorte(req.query, 't');
    const where = `${tenantWhere(eId, 't')}${filtro.sql}`;

    const [[global]] = await pool.query(
      `SELECT
         COUNT(*)                                                          AS total,
         SUM(CASE WHEN av.nota_nps >= 9 THEN 1 ELSE 0 END)               AS promotores,
         SUM(CASE WHEN av.nota_nps BETWEEN 7 AND 8.9 THEN 1 ELSE 0 END)  AS neutros,
         SUM(CASE WHEN av.nota_nps < 7 THEN 1 ELSE 0 END)                AS detratores,
         ROUND(AVG(av.nota_nps), 1)                                       AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where} AND av.nota_nps IS NOT NULL`,
      filtro.params
    );

    const total      = asInt(global.total);
    const promotores = asInt(global.promotores);
    const detratores = asInt(global.detratores);
    const score      = total > 0
      ? Math.round(((promotores - detratores) / total) * 100)
      : null;

    // NPS por turma (top 10 com mais respostas)
    const [porTurma] = await pool.query(
      `SELECT
         t.tema,
         t.cliente,
         COUNT(av.id)                                                         AS respostas,
         ROUND(AVG(av.nota_nps), 1)                                           AS media,
         SUM(CASE WHEN av.nota_nps >= 9 THEN 1 ELSE 0 END)                   AS promotores,
         SUM(CASE WHEN av.nota_nps < 7 THEN 1 ELSE 0 END)                    AS detratores
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where} AND av.nota_nps IS NOT NULL
       GROUP BY t.id, t.tema, t.cliente
       HAVING respostas >= 2
       ORDER BY respostas DESC
       LIMIT 10`,
      filtro.params
    );

    // Tendência NPS por mês (últimos 6 meses) — janela fixa de 6 meses
    // continua valendo por cima do filtro de período escolhido na tela.
    const [tendencia] = await pool.query(
      `SELECT
         YEAR(av.criado_em)   AS ano,
         MONTH(av.criado_em)  AS mes,
         COUNT(*)             AS respostas,
         ROUND(AVG(av.nota_nps), 1) AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where}
         AND av.nota_nps IS NOT NULL
         AND av.criado_em >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY ano, mes
       ORDER BY ano, mes`,
      filtro.params
    );

    return res.json({
      score,
      total,
      promotores,
      neutros:     asInt(global.neutros),
      detratores,
      media:       asDec(global.media),
      por_turma:   porTurma,
      tendencia,
    });
  } catch (error) {
    console.error('[analytics] getNps:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar NPS'});
  }
}

/* ─── GET /api/analytics/efetividade ───────────────────────────────────────── */
async function getEfetividade(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const filtro = filtroRecorte(req.query, 't');
    const where = `${tenantWhere(eId, 't')}${filtro.sql}`;

    // Taxa de aprovação global (nota_prova >= 6)
    const [[aprovacao]] = await pool.query(
      `SELECT
         COUNT(*)                                               AS total,
         SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados,
         ROUND(AVG(av.nota_prova), 1)                          AS media_prova
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where} AND av.nota_prova IS NOT NULL`,
      filtro.params
    );

    // Taxa de presença — por PESSOA, pelo motor único (mesma regra do
    // Dashboard): presentes / (presentes + ausentes); justificado e pendente
    // não contam contra. `total` = pessoas classificadas (presentes + ausentes).
    let presenca = { taxa: null, presentes: 0, total: 0 };
    try {
      const turmasRecorte = await carregarTurmasRecorte(req.query, eId);
      const agg = resumirTurmas(turmasRecorte);
      presenca = {
        taxa:      agg.taxa_presenca,
        presentes: agg.presentes_pessoas,
        total:     agg.presentes_pessoas + agg.ausentes_pessoas,
      };
    } catch (_) {}

    // Efetividade por cliente
    const [porCliente] = await pool.query(
      `SELECT
         COALESCE(t.cliente, '(sem cliente)')                   AS cliente,
         COUNT(DISTINCT t.id)                                   AS turmas,
         ROUND(AVG(av.nota_prova), 1)                          AS media_prova,
         ROUND(AVG(av.nota_qualidade), 1)                      AS media_qualidade,
         SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados,
         COUNT(av.id)                                           AS avaliados
       FROM treinamentos t
       LEFT JOIN avaliacoes av ON av.treinamento_id = t.id
       WHERE ${where}
       GROUP BY t.cliente
       ORDER BY turmas DESC
       LIMIT 10`,
      filtro.params
    );

    const totalAv    = asInt(aprovacao.total);
    const taxa_aprov = totalAv > 0
      ? Number(((asInt(aprovacao.aprovados) / totalAv) * 100).toFixed(1))
      : null;

    return res.json({
      taxa_aprovacao:    taxa_aprov,
      media_prova:       asDec(aprovacao.media_prova),
      total_avaliados:   totalAv,
      presenca,
      por_cliente:       porCliente,
    });
  } catch (error) {
    console.error('[analytics] getEfetividade:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar efetividade'});
  }
}

// Cálculo único do ROI (tela e exportação em Excel usam o mesmo).
//
// Correções de 15/10/2026 (Ramon: "Custo estimado R$ 313 milhões"):
//  - Custo: antes era (horas do portal inteiro) x (pessoas únicas do portal
//    inteiro) x custo/hora — uma conta sem sentido, que explodia com o
//    volume. Agora é a soma, TURMA A TURMA, de (horas aplicadas da turma) x
//    (participantes confirmados da turma) x custo/hora.
//  - Alcance: antes comparava pessoas ÚNICAS com linhas de matrícula (a
//    pessoa que fez 3 turmas contava 1 no numerador e 3 no denominador), o
//    que dava ~32%. Agora é matrículas confirmadas / matrículas previstas,
//    a mesma lógica da "Execução" do Dashboard.
//  - Turmas concluídas: status canônico (mesmo do Dashboard), não a coluna
//    crua `status`.
async function calcularRoi(req, eId) {
  const custoPorHora = await getCustoPorHora(eId);
  const turmas = await carregarTurmasRecorte(req.query, eId);
  const agg = resumirTurmas(turmas);

  const [horasRealizadas, pessoasUnicas] = await Promise.all([
    getHorasAplicadasTotal({
      empresaId: eId,
      cliente: req.query.cliente,
      dataInicio: req.query.data_inicio,
      dataFim: req.query.data_fim,
    }),
    contarPessoasUnicas(turmas, agg.matriculas_confirmadas),
  ]);

  const custo = turmas.reduce(
    (acc, t) => acc + Number(t.horas_aplicadas || 0) * asInt(t.treinandos_confirmados) * custoPorHora,
    0
  );

  const taxaConclusao = agg.turmas_total > 0
    ? Number(((agg.turmas_concluidas / agg.turmas_total) * 100).toFixed(1))
    : 0;
  const alcance = agg.matriculas_previstas > 0
    ? Math.min(Number(((agg.matriculas_confirmadas / agg.matriculas_previstas) * 100).toFixed(1)), 100)
    : null;

  return {
    horas_realizadas:    asDec(horasRealizadas),
    horas_previstas:     asDec(agg.horas_previstas),
    pessoas_impactadas:  pessoasUnicas,
    matriculas:          agg.matriculas_confirmadas,
    matriculas_previstas: agg.matriculas_previstas,
    turmas_concluidas:   agg.turmas_concluidas,
    turmas_total:        agg.turmas_total,
    taxa_conclusao:      taxaConclusao,
    alcance_percentual:  alcance,
    custo_estimado:      Math.round(custo * 100) / 100,
    custo_por_hora:      custoPorHora,
  };
}

/* ─── GET /api/analytics/roi ───────────────────────────────────────────────── */
async function getRoi(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const roi = await calcularRoi(req, eId);
    return res.json(roi);
  } catch (error) {
    console.error('[analytics] getRoi:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar ROI'});
  }
}

/* ─── GET /api/analytics/exportar ──────────────────────────────────────────── */
// Exporta em Excel a aba de Indicadores ativa (?aba=horas|nps|efetividade|roi),
// respeitando o mesmo filtro de cliente/período usado na tela.
async function exportarIndicadores(req, res) {
  try {
    const { empresaId: eId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const aba = String(req.query.aba || 'horas');
    const { novoWorkbook, adicionarTabela, estilizarCabecalho, escreverCelula } = require('../lib/excelExport');
    const wb = novoWorkbook();

    if (aba === 'horas') {
      // Mesma fonte única de horas aplicadas usada pela tela (getHoras) e
      // pela Capacidade — antes este export somava carga_horaria nominal
      // direto na tabela, divergindo do que a tela mostrava.
      const [porCliente, porInstrutor] = await Promise.all([
        getHorasAplicadasPorCliente({ empresaId: eId, cliente: req.query.cliente, dataInicio: req.query.data_inicio, dataFim: req.query.data_fim, limit: 10 }),
        getHorasAplicadasPorInstrutor({ empresaId: eId, cliente: req.query.cliente, dataInicio: req.query.data_inicio, dataFim: req.query.data_fim, limit: 10 }),
      ]);
      adicionarTabela(wb, {
        nomeAba: "Por cliente",
        colunas: [
          { titulo: "Cliente/Operação", chave: "cliente", largura: 34 },
          { titulo: "Turmas", chave: "turmas", largura: 12, formato: "inteiro" },
          { titulo: "Horas", chave: "horas", largura: 12, formato: "decimal1" },
        ],
        linhas: porCliente.map((r) => ({ cliente: r.cliente, turmas: r.turmas, horas: r.horas })),
      });
      adicionarTabela(wb, {
        nomeAba: "Por instrutor",
        colunas: [
          { titulo: "Instrutor", chave: "instrutor", largura: 30 },
          { titulo: "Turmas", chave: "turmas", largura: 12, formato: "inteiro" },
          { titulo: "Horas", chave: "horas", largura: 12, formato: "decimal1" },
        ],
        linhas: porInstrutor.map((r) => ({ instrutor: r.instrutor, turmas: r.turmas, horas: r.horas })),
      });
    } else if (aba === 'nps') {
      const filtro = filtroRecorte(req.query, 't');
      const where = `${tenantWhere(eId, 't')}${filtro.sql}`;
      const [porTurma] = await pool.query(
        `SELECT t.tema, t.cliente, COUNT(av.id) AS respostas, ROUND(AVG(av.nota_nps), 1) AS media
         FROM avaliacoes av JOIN treinamentos t ON t.id = av.treinamento_id
         WHERE ${where} AND av.nota_nps IS NOT NULL
         GROUP BY t.id, t.tema, t.cliente ORDER BY respostas DESC`,
        filtro.params
      );
      adicionarTabela(wb, {
        nomeAba: "NPS por turma",
        colunas: [
          { titulo: "Turma", chave: "tema", largura: 34 },
          { titulo: "Cliente", chave: "cliente", largura: 22 },
          { titulo: "Respostas", chave: "respostas", largura: 12, formato: "inteiro" },
          { titulo: "NPS médio", chave: "media", largura: 12, formato: "decimal1" },
        ],
        linhas: porTurma.map((r) => ({ tema: r.tema, cliente: r.cliente, respostas: r.respostas, media: r.media })),
      });
    } else if (aba === 'efetividade') {
      const filtro = filtroRecorte(req.query, 't');
      const where = `${tenantWhere(eId, 't')}${filtro.sql}`;
      const [porCliente] = await pool.query(
        `SELECT
           COALESCE(t.cliente, '(sem cliente)')                  AS cliente,
           COUNT(DISTINCT t.id)                                  AS turmas,
           ROUND(AVG(av.nota_prova), 1)                          AS media_prova,
           COUNT(av.id)                                          AS avaliados,
           SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados
         FROM treinamentos t LEFT JOIN avaliacoes av ON av.treinamento_id = t.id
         WHERE ${where} GROUP BY t.cliente ORDER BY turmas DESC`,
        filtro.params
      );
      adicionarTabela(wb, {
        nomeAba: "Efetividade por cliente",
        colunas: [
          { titulo: "Cliente/Operação", chave: "cliente", largura: 30 },
          { titulo: "Turmas", chave: "turmas", largura: 10, formato: "inteiro" },
          { titulo: "Avaliados", chave: "avaliados", largura: 12, formato: "inteiro" },
          { titulo: "Nota média", chave: "media_prova", largura: 12, formato: "decimal1" },
          { titulo: "Aprovados", chave: "aprovados", largura: 12, formato: "inteiro" },
          { titulo: "% Aprovados", chave: "pct_aprovados", largura: 13, formato: "percentual" },
        ],
        linhas: porCliente.map((r) => ({
          cliente: r.cliente,
          turmas: r.turmas,
          avaliados: r.avaliados || 0,
          media_prova: r.media_prova,
          aprovados: r.aprovados || 0,
          pct_aprovados: Number(r.avaliados) > 0 ? Math.round((Number(r.aprovados) / Number(r.avaliados)) * 100) : "",
        })),
      });
    } else if (aba === 'roi') {
      const roi = await calcularRoi(req, eId);
      const ws = wb.addWorksheet("ROI");
      ws.columns = [{ width: 36 }, { width: 18 }];
      const linhasRoi = [
        ["Turmas totais", roi.turmas_total, "inteiro"],
        ["Turmas concluídas", roi.turmas_concluidas, "inteiro"],
        ["Horas previstas", roi.horas_previstas, "decimal1"],
        ["Horas realizadas", roi.horas_realizadas, "decimal1"],
        ["Pessoas únicas impactadas", roi.pessoas_impactadas, "inteiro"],
        ["Matrículas confirmadas", roi.matriculas, "inteiro"],
        ["Matrículas previstas", roi.matriculas_previstas, "inteiro"],
        ["Custo por hora", roi.custo_por_hora, "moeda"],
        ["Custo estimado (turma a turma)", roi.custo_estimado, "moeda"],
      ];
      ws.getCell(1, 1).value = "Indicador";
      ws.getCell(1, 2).value = "Valor";
      estilizarCabecalho(ws, 1, 2);
      linhasRoi.forEach(([label, valor, formato], index) => {
        const row = index + 2;
        ws.getCell(row, 1).value = label;
        escreverCelula(ws, row, 2, valor, formato);
      });
    } else {
      return res.status(400).json({ ok: false, message: "Aba inválida." });
    }

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="indicadores_${aba}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error('[analytics] exportarIndicadores:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao exportar indicadores'});
  }
}

module.exports = { getResumo, getHoras, getNps, getEfetividade, getRoi, exportarIndicadores };
