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
 * Este serviço junta DUAS fontes de CH efetivamente realizada por instrutor:
 *   1) turma_aulas.carga_horaria_real — aulas de turmas formais (cadastradas
 *      em `treinamentos`, com cronograma dia a dia).
 *   2) atividades_instrutor.hc_realizado — lançamentos avulsos que o próprio
 *      instrutor registra (baseado na planilha operacional), cobrindo
 *      demanda que não necessariamente vira uma turma formal no sistema
 *      (apoio pontual, coaching, atividades de outra célula etc.).
 *
 * IMPORTANTE — regra operacional para não contar CH em dobro: um instrutor
 * não deve lançar em "Meus Lançamentos" uma atividade que já existe como
 * turma formal no sistema (ela já é capturada via turma_aulas). O acumulado
 * "horas_realizadas" desta função é a SOMA das duas fontes — por isso ela
 * também devolve os dois valores em separado (horas_turmas / horas_atividades)
 * para que qualquer divergência inesperada fique visível na tela, em vez de
 * escondida dentro de um único total.
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

function statusOcupacao(pct) {
  if (pct == null) return { status: "sem_capacidade", emoji: "—" };
  if (pct < 40) return { status: "ocioso", emoji: "⚪" };
  if (pct <= 100) return { status: "saudavel", emoji: "🟢" };
  if (pct <= 120) return { status: "atencao", emoji: "🟡" };
  return { status: "sobrecarga", emoji: "🔴" };
}

async function getRegraPadrao() {
  const [rows] = await pool.query(
    `SELECT id, horas_dia_padrao, hc_dia_padrao, considerar_domingo, atualizado_em
     FROM capacidade_regra_padrao WHERE id = 1 LIMIT 1`
  );
  if (rows[0]) return rows[0];
  // Nunca deveria faltar (migration insere a linha padrão), mas devolve um
  // fallback em memória em vez de quebrar a tela se, por algum motivo, a
  // linha ainda não existir neste ambiente.
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
  if (instrutor) {
    conditions.push("instrutor = ?");
    params.push(instrutor);
  }
  if (ano) {
    conditions.push("ano = ?");
    params.push(Number(ano));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes, criado_por, criado_em, atualizado_em
     FROM capacidade_instrutor_mensal
     ${where}
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
      UNION
      SELECT DISTINCT TRIM(instrutor) AS nome FROM atividades_instrutor WHERE instrutor IS NOT NULL AND TRIM(instrutor) <> ''
    ) todos
    ORDER BY nome ASC
  `);
  return rows.map((r) => r.nome);
}

async function getCapacidadeVsRealizado({ ano, mes, instrutor, dataInicio, dataFim } = {}) {
  const meses = mesesNoIntervalo({ ano, mes, dataInicio, dataFim });
  const anos = [...new Set(meses.map((m) => m.ano))];

  const instrutores = instrutor ? [instrutor] : await listarInstrutoresConhecidos();
  if (!instrutores.length) return [];

  const placeholdersInstrutores = instrutores.map(() => "?").join(",");
  const placeholdersMeses = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);

  // Fonte 1: turmas formais (turma_aulas.carga_horaria_real), só aulas já
  // ministradas ou parciais — aula "planejada"/"cancelada" não é CH real.
  const [horasTurmas] = await pool.query(
    `SELECT
       TRIM(instrutor_responsavel) AS instrutor,
       YEAR(data_aula) AS ano,
       MONTH(data_aula) AS mes,
       COALESCE(SUM(carga_horaria_real), 0) AS horas
     FROM turma_aulas
     WHERE instrutor_responsavel IN (${placeholdersInstrutores})
       AND LOWER(TRIM(status_execucao)) IN ('ministrada', 'parcial')
       AND (YEAR(data_aula), MONTH(data_aula)) IN (${placeholdersMeses})
     GROUP BY TRIM(instrutor_responsavel), YEAR(data_aula), MONTH(data_aula)`,
    [...instrutores, ...mesesParams]
  );

  // Fonte 2: lançamentos avulsos do instrutor (planilha → atividades_instrutor).
  const mesRefs = meses.map((m) => `${m.ano}-${pad2(m.mes)}`);
  const placeholdersMesRef = mesRefs.map(() => "?").join(",");
  const [horasAtividades] = await pool.query(
    `SELECT
       TRIM(instrutor) AS instrutor,
       mes_ref,
       COALESCE(SUM(hc_realizado), 0) AS horas
     FROM atividades_instrutor
     WHERE instrutor IN (${placeholdersInstrutores})
       AND mes_ref IN (${placeholdersMesRef})
       AND LOWER(TRIM(status)) <> 'cancelado'
     GROUP BY TRIM(instrutor), mes_ref`,
    [...instrutores, ...mesRefs]
  );

  const [overridesRows] = await pool.query(
    `SELECT instrutor, ano, mes, horas_capacidade, hc_capacidade
     FROM capacidade_instrutor_mensal
     WHERE instrutor IN (${placeholdersInstrutores}) AND ano IN (${anos.map(() => "?").join(",")})`,
    [...instrutores, ...anos]
  );

  const regra = await getRegraPadrao();

  const chaveMes = (a, m) => `${a}-${pad2(m)}`;
  const mapaTurmas = new Map(horasTurmas.map((r) => [`${r.instrutor}|${chaveMes(r.ano, r.mes)}`, Number(r.horas)]));
  const mapaAtividades = new Map(horasAtividades.map((r) => [`${r.instrutor}|${r.mes_ref}`, Number(r.horas)]));
  const mapaOverrides = new Map(
    overridesRows.map((r) => [`${r.instrutor}|${chaveMes(r.ano, r.mes)}`, r])
  );

  const resultado = [];
  for (const nomeInstrutor of instrutores) {
    for (const { ano: anoRef, mes: mesRef } of meses) {
      const chave = `${nomeInstrutor}|${chaveMes(anoRef, mesRef)}`;
      const horasTurmasInstrutor = mapaTurmas.get(chave) || 0;
      const horasAtividadesInstrutor = mapaAtividades.get(chave) || 0;
      const horasRealizadas = Number((horasTurmasInstrutor + horasAtividadesInstrutor).toFixed(2));

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
        horas_turmas: Number(horasTurmasInstrutor.toFixed(2)),
        horas_atividades: Number(horasAtividadesInstrutor.toFixed(2)),
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

module.exports = {
  getRegraPadrao,
  atualizarRegraPadrao,
  listarOverrides,
  salvarOverride,
  excluirOverride,
  listarInstrutoresConhecidos,
  getCapacidadeVsRealizado,
  // exportado para reuso/testes (ranking, painel etc. também precisam da
  // mesma régua de dias úteis e do mesmo semáforo de ocupação)
  diasUteisDoMes,
  statusOcupacao,
  mesesNoIntervalo,
};
