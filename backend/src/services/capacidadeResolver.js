/**
 * capacidadeResolver.js
 *
 * Serviço que faltava por trás de capacidadeController.js. O controller já
 * existia (rotas, validação, formatação de resposta) e a migration de banco
 * também (database/migrations/2026-08-26_capacidade_instrutor.sql), mas este
 * arquivo — o motor de cálculo — nunca tinha sido escrito. Resultado prático:
 * a tela de "Capacidade x Realizado" nunca funcionou em nenhum ambiente,
 * porque o require() deste módulo sempre lançava "Cannot find module".
 *
 * IMPORTANTE — decisão de design: este cálculo usa SOMENTE dado que já é
 * registrado no fluxo normal do portal (criar turma, rodar o cronograma da
 * turma, fazer a chamada). Não existe nenhuma tela ou tabela nova para
 * alguém preencher manualmente. As duas fontes são:
 *
 *   1) turma_aulas — quando a turma já usa o cronograma diário (Gestão de
 *      Turmas > Cronograma), a CH real de cada instrutor vem daí, aula a
 *      aula (carga_horaria_real, só aulas "ministrada"/"parcial"), o que
 *      também cobre substituição/co-instrução (instrutor_responsavel pode
 *      variar aula a aula dentro da mesma turma).
 *   2) treinamentos — para turma que NUNCA teve nenhuma linha de cronograma
 *      gerada, usa a CH nominal da turma inteira (carga_horaria) atribuída
 *      ao instrutor responsável (treinamentos.instrutor) e ao mês de início,
 *      contando só turma que já rodou ou está rodando (não conta planejada
 *      nem cancelada). Isso evita subestimar operações que ainda não usam o
 *      cronograma detalhado.
 *
 * As duas fontes são mutuamente exclusivas por turma (uma turma com
 * cronograma nunca cai no fallback), então não há risco de contar a mesma
 * turma duas vezes.
 */

const pool = require("../lib/db");

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Mesma regra de "dia não letivo" já usada em turmaAulasController.js ao
// gerar o cronograma de uma turma: domingo não conta, a menos que a regra
// padrão diga para considerá-lo.
function diasUteisDoMes(ano, mes, considerarDomingo) {
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let uteis = 0;
  for (let dia = 1; dia <= totalDias; dia += 1) {
    const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
    if (diaSemana === 0 && !considerarDomingo) continue;
    uteis += 1;
  }
  return uteis;
}

function mesesNoIntervalo({ ano, mes, dataInicio, dataFim }) {
  if (ano && mes) return [{ ano: Number(ano), mes: Number(mes) }];

  if (dataInicio || dataFim) {
    const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00Z`) : new Date(`${dataFim}T00:00:00Z`);
    const fim = dataFim ? new Date(`${dataFim}T00:00:00Z`) : new Date(`${dataInicio}T00:00:00Z`);
    const meses = [];
    const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
    const limite = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
    while (cursor.getTime() <= limite.getTime()) {
      meses.push({ ano: cursor.getUTCFullYear(), mes: cursor.getUTCMonth() + 1 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return meses.length ? meses : [{ ano: inicio.getUTCFullYear(), mes: inicio.getUTCMonth() + 1 }];
  }

  const hoje = new Date();
  return [{ ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 }];
}

function ultimosNMeses(n) {
  const hoje = new Date();
  const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const meses = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - i);
    meses.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  return meses;
}

function statusOcupacao(pct) {
  if (pct == null) return { status: "sem_capacidade", emoji: "—" };
  if (pct < 40) return { status: "ocioso", emoji: "⚪" };
  if (pct <= 100) return { status: "saudavel", emoji: "🟢" };
  if (pct <= 120) return { status: "atencao", emoji: "🟡" };
  return { status: "sobrecarga", emoji: "🔴" };
}

// ---------------------------------------------------------------------------
// Fonte única de CH (planejada x real) — combina turma_aulas (quando existe
// cronograma) com o fallback nominal de treinamentos (quando não existe),
// sem depender de nenhum lançamento manual adicional.
// ---------------------------------------------------------------------------
const FONTE_HORAS_SQL = `
  (
    SELECT
      t.id AS treinamento_id,
      TRIM(ta.instrutor_responsavel) AS instrutor,
      t.cliente AS cliente,
      t.tema AS tema,
      YEAR(ta.data_aula) AS ano,
      MONTH(ta.data_aula) AS mes,
      CASE WHEN LOWER(TRIM(COALESCE(ta.status_execucao,''))) IN ('ministrada','parcial')
           THEN COALESCE(ta.carga_horaria_real, 0) ELSE 0 END AS horas_real,
      COALESCE(ta.carga_horaria_planejada, 0) AS horas_planejada
    FROM turma_aulas ta
    JOIN treinamentos t ON t.id = ta.treinamento_id
    WHERE ta.instrutor_responsavel IS NOT NULL AND TRIM(ta.instrutor_responsavel) <> ''

    UNION ALL

    SELECT
      t.id AS treinamento_id,
      TRIM(t.instrutor) AS instrutor,
      t.cliente AS cliente,
      t.tema AS tema,
      YEAR(COALESCE(t.data_inicio, t.data)) AS ano,
      MONTH(COALESCE(t.data_inicio, t.data)) AS mes,
      CASE WHEN LOWER(TRIM(COALESCE(t.status,''))) NOT LIKE '%planej%'
             AND LOWER(TRIM(COALESCE(t.status,''))) NOT LIKE '%cancel%'
             AND LOWER(TRIM(COALESCE(t.status,''))) <> 'agendado'
           THEN COALESCE(t.carga_horaria, 0) ELSE 0 END AS horas_real,
      COALESCE(t.carga_horaria, 0) AS horas_planejada
    FROM treinamentos t
    WHERE t.instrutor IS NOT NULL AND TRIM(t.instrutor) <> ''
      AND COALESCE(t.data_inicio, t.data) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM turma_aulas ta2 WHERE ta2.treinamento_id = t.id)
  ) fonte_horas
`;

async function getRegraPadrao() {
  const [rows] = await pool.query(
    `SELECT id, horas_dia_padrao, hc_dia_padrao, considerar_domingo, atualizado_em
     FROM capacidade_regra_padrao WHERE id = 1 LIMIT 1`
  );
  if (rows[0]) return rows[0];
  return { id: 1, horas_dia_padrao: 6, hc_dia_padrao: 30, considerar_domingo: 0, atualizado_em: null };
}

async function atualizarRegraPadrao({ horasDiaPadrao, hcDiaPadrao, considerarDomingo }) {
  await pool.query(
    `INSERT INTO capacidade_regra_padrao (id, horas_dia_padrao, hc_dia_padrao, considerar_domingo)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       horas_dia_padrao = VALUES(horas_dia_padrao),
       hc_dia_padrao = VALUES(hc_dia_padrao),
       considerar_domingo = VALUES(considerar_domingo)`,
    [Number(horasDiaPadrao), Number(hcDiaPadrao), considerarDomingo ? 1 : 0]
  );
  return getRegraPadrao();
}

async function listarOverrides({ instrutor, ano } = {}) {
  const conditions = [];
  const params = [];
  if (instrutor) { conditions.push("instrutor = ?"); params.push(instrutor); }
  if (ano) { conditions.push("ano = ?"); params.push(Number(ano)); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes, criado_por, criado_em, atualizado_em
     FROM capacidade_instrutor_mensal ${where}
     ORDER BY ano DESC, mes DESC, instrutor ASC`,
    params
  );
  return rows;
}

async function salvarOverride({ instrutor, ano, mes, horasCapacidade, hcCapacidade, observacoes, criadoPor }) {
  await pool.query(
    `INSERT INTO capacidade_instrutor_mensal
       (instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       horas_capacidade = VALUES(horas_capacidade),
       hc_capacidade = VALUES(hc_capacidade),
       observacoes = VALUES(observacoes),
       criado_por = VALUES(criado_por)`,
    [instrutor, Number(ano), Number(mes), Number(horasCapacidade || 0), Number(hcCapacidade || 0), observacoes || null, criadoPor || null]
  );
}

async function excluirOverride(id) {
  await pool.query(`DELETE FROM capacidade_instrutor_mensal WHERE id = ?`, [id]);
}

async function listarInstrutoresConhecidos() {
  const [rows] = await pool.query(`
    SELECT nome FROM (
      SELECT DISTINCT TRIM(instrutor) AS nome FROM treinamentos WHERE instrutor IS NOT NULL AND TRIM(instrutor) <> ''
      UNION
      SELECT DISTINCT TRIM(instrutor_responsavel) AS nome FROM turma_aulas WHERE instrutor_responsavel IS NOT NULL AND TRIM(instrutor_responsavel) <> ''
    ) todos
    ORDER BY nome ASC
  `);
  return rows.map((r) => r.nome);
}

async function listarOperacoesConhecidas() {
  const [rows] = await pool.query(`
    SELECT DISTINCT cliente FROM treinamentos
    WHERE cliente IS NOT NULL AND TRIM(cliente) <> '' AND cliente <> 'Sem cliente'
    ORDER BY cliente ASC
  `);
  return rows.map((r) => r.cliente);
}

async function getCapacidadeVsRealizado({ ano, mes, instrutor, cliente, dataInicio, dataFim } = {}) {
  const meses = mesesNoIntervalo({ ano, mes, dataInicio, dataFim });
  const anos = [...new Set(meses.map((m) => m.ano))];

  const instrutores = instrutor ? [instrutor] : await listarInstrutoresConhecidos();
  if (!instrutores.length) return [];

  const placeholdersInstrutores = instrutores.map(() => "?").join(",");
  const placeholdersMeses = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);
  const clienteSql = cliente ? "AND fonte_horas.cliente = ?" : "";
  const clienteParams = cliente ? [cliente] : [];

  const [horasRows] = await pool.query(
    `SELECT fonte_horas.instrutor, fonte_horas.ano, fonte_horas.mes, SUM(fonte_horas.horas_real) AS horas
     FROM ${FONTE_HORAS_SQL}
     WHERE fonte_horas.instrutor IN (${placeholdersInstrutores})
       AND (fonte_horas.ano, fonte_horas.mes) IN (${placeholdersMeses})
       ${clienteSql}
     GROUP BY fonte_horas.instrutor, fonte_horas.ano, fonte_horas.mes`,
    [...instrutores, ...mesesParams, ...clienteParams]
  );

  const [overridesRows] = await pool.query(
    `SELECT instrutor, ano, mes, horas_capacidade, hc_capacidade
     FROM capacidade_instrutor_mensal
     WHERE instrutor IN (${placeholdersInstrutores}) AND ano IN (${anos.map(() => "?").join(",")})`,
    [...instrutores, ...anos]
  );

  const regra = await getRegraPadrao();

  const chaveMes = (a, m) => `${a}-${pad2(m)}`;
  const mapaHoras = new Map(horasRows.map((r) => [`${r.instrutor}|${chaveMes(r.ano, r.mes)}`, Number(r.horas)]));
  const mapaOverrides = new Map(overridesRows.map((r) => [`${r.instrutor}|${chaveMes(r.ano, r.mes)}`, r]));

  const resultado = [];
  for (const nomeInstrutor of instrutores) {
    for (const { ano: anoRef, mes: mesRef } of meses) {
      const chave = `${nomeInstrutor}|${chaveMes(anoRef, mesRef)}`;
      const horasRealizadas = Number((mapaHoras.get(chave) || 0).toFixed(2));

      const override = mapaOverrides.get(chave);
      const capacidadeHoras = override
        ? Number(override.horas_capacidade)
        : Number((diasUteisDoMes(anoRef, mesRef, !!regra.considerar_domingo) * Number(regra.horas_dia_padrao)).toFixed(2));

      const ocupacaoPct = capacidadeHoras > 0 ? Number(((horasRealizadas / capacidadeHoras) * 100).toFixed(1)) : null;
      const { status, emoji } = statusOcupacao(ocupacaoPct);

      resultado.push({
        instrutor: nomeInstrutor,
        ano: anoRef,
        mes: mesRef,
        horas_realizadas: horasRealizadas,
        capacidade_horas: capacidadeHoras,
        fonte_capacidade: override ? "override" : "automatica",
        ocupacao_pct: ocupacaoPct,
        status_ocupacao: status,
        status_emoji: emoji,
      });
    }
  }

  return resultado;
}

async function getPainel({ meses: totalMeses = 3, instrutor, cliente } = {}) {
  const meses = ultimosNMeses(Number(totalMeses));
  const regra = await getRegraPadrao();
  const instrutores = instrutor ? [instrutor] : await listarInstrutoresConhecidos();

  const linhasPorMes = [];
  for (const { ano, mes } of meses) {
    const itens = await getCapacidadeVsRealizado({ ano, mes, instrutor, cliente });
    const capacidadeNominal = itens.reduce((acc, i) => acc + i.capacidade_horas, 0);
    const hcRealizado = itens.reduce((acc, i) => acc + i.horas_realizadas, 0);
    const desvio = Number((hcRealizado - capacidadeNominal).toFixed(2));
    const ocupacaoPct = capacidadeNominal > 0 ? Number(((hcRealizado / capacidadeNominal) * 100).toFixed(1)) : 0;
    const { emoji } = statusOcupacao(capacidadeNominal > 0 ? ocupacaoPct : null);
    linhasPorMes.push({
      mes: `${ano}-${pad2(mes)}`,
      mes_extenso: new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
      capacidade_nominal: Number(capacidadeNominal.toFixed(2)),
      hc_realizado: Number(hcRealizado.toFixed(2)),
      desvio,
      ocupacao_pct: ocupacaoPct,
      status_emoji: emoji,
    });
  }

  const clienteSql = cliente ? "AND fonte_horas.cliente = ?" : "";
  const clienteParams = cliente ? [cliente] : [];
  const placeholdersMeses = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);
  const [[programadoRow]] = await pool.query(
    `SELECT COALESCE(SUM(fonte_horas.horas_planejada), 0) AS total
     FROM ${FONTE_HORAS_SQL}
     WHERE (fonte_horas.ano, fonte_horas.mes) IN (${placeholdersMeses}) ${clienteSql}`,
    [...mesesParams, ...clienteParams]
  );

  const capacidadeTotalPeriodo = linhasPorMes.reduce((acc, l) => acc + l.capacidade_nominal, 0);
  const hcRealizadoPeriodo = linhasPorMes.reduce((acc, l) => acc + l.hc_realizado, 0);
  const capacidadePorInstrutorMes = instrutores.length
    ? Number((diasUteisDoMes(meses[meses.length - 1].ano, meses[meses.length - 1].mes, !!regra.considerar_domingo) * Number(regra.horas_dia_padrao)).toFixed(2))
    : 0;

  return {
    periodo: { meses: linhasPorMes.map((l) => l.mes) },
    indicadores: {
      capacidade_nominal_periodo: Number(capacidadeTotalPeriodo.toFixed(2)),
      capacidade_mensal_time: instrutores.length ? Number((capacidadePorInstrutorMes * instrutores.length).toFixed(2)) : 0,
      capacidade_por_instrutor: capacidadePorInstrutorMes,
      hc_programado_periodo: Number(Number(programadoRow.total).toFixed(2)),
      hc_realizado_periodo: Number(hcRealizadoPeriodo.toFixed(2)),
      aderencia_geral_pct: Number(programadoRow.total) > 0
        ? Number(((hcRealizadoPeriodo / Number(programadoRow.total)) * 100).toFixed(1))
        : null,
      ocupacao_time_pct: capacidadeTotalPeriodo > 0
        ? Number(((hcRealizadoPeriodo / capacidadeTotalPeriodo) * 100).toFixed(1))
        : 0,
    },
    por_mes: linhasPorMes,
  };
}

async function getCapacityConsumido({ meses: totalMeses = 3, cliente } = {}) {
  const meses = ultimosNMeses(Number(totalMeses));
  const instrutores = await listarInstrutoresConhecidos();
  const porInstrutor = new Map(instrutores.map((nome) => [nome, { instrutor: nome, meses: {}, total_90d: 0, capacidade_90d: 0 }]));

  for (const { ano, mes } of meses) {
    const itens = await getCapacidadeVsRealizado({ ano, mes, cliente });
    for (const item of itens) {
      const linha = porInstrutor.get(item.instrutor);
      if (!linha) continue;
      linha.meses[`${ano}-${pad2(mes)}`] = item.horas_realizadas;
      linha.total_90d += item.horas_realizadas;
      linha.capacidade_90d += item.capacidade_horas;
    }
  }

  const linhas = Array.from(porInstrutor.values())
    .map((linha) => ({
      ...linha,
      total_90d: Number(linha.total_90d.toFixed(2)),
      capacidade_90d: Number(linha.capacidade_90d.toFixed(2)),
      ocupacao_pct: linha.capacidade_90d > 0 ? Number(((linha.total_90d / linha.capacidade_90d) * 100).toFixed(1)) : 0,
    }))
    .filter((linha) => !cliente || linha.total_90d > 0)
    .sort((a, b) => b.total_90d - a.total_90d);

  return { meses: meses.map((m) => `${m.ano}-${pad2(m.mes)}`), itens: linhas };
}

async function getRanking({ meses: totalMeses = 3, cliente } = {}) {
  const meses = ultimosNMeses(Number(totalMeses));
  const acumulado = new Map();
  for (const { ano, mes } of meses) {
    const itens = await getCapacidadeVsRealizado({ ano, mes, cliente });
    for (const item of itens) {
      const atual = acumulado.get(item.instrutor) || { instrutor: item.instrutor, horas: 0, capacidade: 0 };
      atual.horas += item.horas_realizadas;
      atual.capacidade += item.capacidade_horas;
      acumulado.set(item.instrutor, atual);
    }
  }

  return Array.from(acumulado.values())
    .filter((item) => item.horas > 0)
    .map((item) => ({
      instrutor: item.instrutor,
      horas_realizadas: Number(item.horas.toFixed(2)),
      pct_capacidade: item.capacidade > 0 ? Number(((item.horas / item.capacidade) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.horas_realizadas - a.horas_realizadas)
    .map((item, index) => ({ posicao: index + 1, ...item }));
}

async function getAderenciaPorTema({ cliente, ano, mes, dataInicio, dataFim } = {}) {
  const temFiltroPeriodo = ano || mes || dataInicio || dataFim;
  const conditions = [];
  const params = [];
  if (cliente) { conditions.push("fonte_horas.cliente = ?"); params.push(cliente); }
  if (temFiltroPeriodo) {
    const meses = mesesNoIntervalo({ ano, mes, dataInicio, dataFim });
    conditions.push(`(fonte_horas.ano, fonte_horas.mes) IN (${meses.map(() => "(?, ?)").join(",")})`);
    params.push(...meses.flatMap((m) => [m.ano, m.mes]));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT
       fonte_horas.tema AS tema,
       COUNT(DISTINCT fonte_horas.treinamento_id) AS qtd_turmas,
       COALESCE(SUM(fonte_horas.horas_planejada), 0) AS hc_programado,
       COALESCE(SUM(fonte_horas.horas_real), 0) AS hc_realizado
     FROM ${FONTE_HORAS_SQL}
     ${where}
     GROUP BY fonte_horas.tema
     ORDER BY hc_realizado DESC`,
    params
  );

  return rows.map((r) => {
    const programado = Number(r.hc_programado);
    const realizado = Number(r.hc_realizado);
    return {
      tema: r.tema || "(sem tema)",
      qtd_turmas: Number(r.qtd_turmas),
      hc_programado: programado,
      hc_realizado: realizado,
      aderencia_pct: programado > 0 ? Number(((realizado / programado) * 100).toFixed(1)) : null,
    };
  });
}

async function getDistribuicaoPorOperacao({ meses: totalMeses } = {}) {
  const conditions = [];
  const params = [];
  if (totalMeses) {
    const meses = ultimosNMeses(Number(totalMeses));
    conditions.push(`(fonte_horas.ano, fonte_horas.mes) IN (${meses.map(() => "(?, ?)").join(",")})`);
    params.push(...meses.flatMap((m) => [m.ano, m.mes]));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT
       COALESCE(NULLIF(fonte_horas.cliente, ''), 'Sem operação') AS operacao,
       COALESCE(SUM(fonte_horas.horas_real), 0) AS horas
     FROM ${FONTE_HORAS_SQL}
     ${where}
     GROUP BY COALESCE(NULLIF(fonte_horas.cliente, ''), 'Sem operação')`,
    params
  );

  const total = rows.reduce((acc, r) => acc + Number(r.horas), 0);
  const itens = rows
    .map((r) => ({
      operacao: r.operacao,
      horas: Number(Number(r.horas).toFixed(2)),
      pct_sobre_total: total > 0 ? Number(((Number(r.horas) / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.horas - a.horas);

  return { itens, total_horas: Number(total.toFixed(2)) };
}

async function getAlertas() {
  const hoje = new Date();
  const itens = await getCapacidadeVsRealizado({ ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 });
  const alertas = itens
    .filter((item) => item.status_ocupacao !== "saudavel")
    .map((item) => ({
      instrutor: item.instrutor,
      ocupacao_pct: item.ocupacao_pct,
      status: item.status_ocupacao,
      status_emoji: item.status_emoji,
    }))
    .sort((a, b) => (b.ocupacao_pct || 0) - (a.ocupacao_pct || 0));

  return { itens: alertas, todos: itens };
}

module.exports = {
  getRegraPadrao,
  atualizarRegraPadrao,
  listarOverrides,
  salvarOverride,
  excluirOverride,
  listarInstrutoresConhecidos,
  listarOperacoesConhecidas,
  getCapacidadeVsRealizado,
  getPainel,
  getCapacityConsumido,
  getRanking,
  getAderenciaPorTema,
  getDistribuicaoPorOperacao,
  getAlertas,
  diasUteisDoMes,
  statusOcupacao,
  mesesNoIntervalo,
};
