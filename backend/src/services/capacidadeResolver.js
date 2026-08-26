/**
 * capacidadeResolver.js
 *
 * Modelo HÍBRIDO de capacidade do instrutor (decidido com o coordenador):
 *   - Por padrão, a capacidade de cada instrutor em cada mês é calculada
 *     automaticamente: dias úteis do mês × horas/dia padrão (e × HC/dia
 *     padrão para capacidade de headcount).
 *   - O coordenador pode sobrescrever manualmente a capacidade de um
 *     instrutor específico num mês específico (ex.: férias, afastamento,
 *     pico de demanda) — esse valor manual sempre tem prioridade sobre
 *     o cálculo automático.
 *
 * "Dia útil" aqui segue a mesma regra já usada no resto do sistema para
 * chamada (turmaAulasController.gerarCronogramaTurma): todo dia da
 * semana exceto domingo é letivo, a menos que a regra padrão marque
 * considerar_domingo = true.
 */

const pool = require("../lib/db");
const { getHorasPorInstrutorMes } = require("./horasResolver");

function n(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

function pct(num, den) {
  if (!den) return null;
  return round1((num / den) * 100);
}

function diasUteisDoMes(ano, mes, considerarDomingo) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const d = new Date(ano, mes - 1, dia);
    if (considerarDomingo || d.getDay() !== 0) count += 1;
  }
  return count;
}

async function getRegraPadrao() {
  const [[regra]] = await pool.query(
    `SELECT horas_dia_padrao, hc_dia_padrao, considerar_domingo
     FROM capacidade_regra_padrao WHERE id = 1 LIMIT 1`
  );
  return (
    regra || { horas_dia_padrao: 6, hc_dia_padrao: 30, considerar_domingo: 0 }
  );
}

async function atualizarRegraPadrao({ horasDiaPadrao, hcDiaPadrao, considerarDomingo }) {
  await pool.query(
    `UPDATE capacidade_regra_padrao
     SET horas_dia_padrao = ?, hc_dia_padrao = ?, considerar_domingo = ?
     WHERE id = 1`,
    [n(horasDiaPadrao), n(hcDiaPadrao), considerarDomingo ? 1 : 0]
  );
  return getRegraPadrao();
}

async function listarOverrides({ instrutor, ano } = {}) {
  const cond = [];
  const params = [];
  if (instrutor) {
    cond.push("instrutor = ?");
    params.push(instrutor);
  }
  if (ano) {
    cond.push("ano = ?");
    params.push(ano);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes, criado_por, atualizado_em
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
    [instrutor, n(ano), n(mes), n(horasCapacidade), n(hcCapacidade), observacoes || null, criadoPor || null]
  );
}

async function excluirOverride(id) {
  await pool.query(`DELETE FROM capacidade_instrutor_mensal WHERE id = ?`, [id]);
}

/**
 * Lista todos os instrutores que aparecem em turmas (ativas ou
 * históricas), para que a tela de capacidade também mostre instrutores
 * sem override cadastrado (com capacidade 100% automática).
 */
async function listarInstrutoresConhecidos() {
  const [rows] = await pool.query(
    `SELECT DISTINCT instrutor FROM treinamentos WHERE instrutor IS NOT NULL AND instrutor <> ''
     UNION
     SELECT DISTINCT instrutor_responsavel FROM turma_aulas WHERE instrutor_responsavel IS NOT NULL AND instrutor_responsavel <> ''`
  );
  return rows.map((r) => r.instrutor).filter(Boolean);
}

/**
 * Visão principal: capacidade x realizado, por instrutor e por mês.
 * Cruza o realizado (horasResolver) com a capacidade (override manual
 * ou cálculo automático) para cada combinação instrutor+mês observada
 * no período, e também garante que todo instrutor conhecido apareça
 * nos meses filtrados mesmo sem turmas (capacidade "ociosa").
 */
async function getCapacidadeVsRealizado({ ano, mes, instrutor, dataInicio, dataFim } = {}) {
  const regra = await getRegraPadrao();
  const overrides = await listarOverrides(instrutor ? { instrutor } : {});
  const overridesMap = new Map(overrides.map((o) => [`${o.instrutor}::${o.ano}-${String(o.mes).padStart(2, "0")}`, o]));

  const realizadoPorInstrutorMes = await getHorasPorInstrutorMes({ dataInicio, dataFim });

  // Monta o conjunto de (instrutor, ano, mes) a exibir: todos os que têm
  // realizado no período + (se ano/mes filtrado) todos os instrutores
  // conhecidos, para mostrar capacidade ociosa (0 realizado).
  const chaves = new Map();
  for (const r of realizadoPorInstrutorMes) {
    if (instrutor && r.instrutor !== instrutor) continue;
    if (ano && r.ano !== Number(ano)) continue;
    if (mes && r.mes !== Number(mes)) continue;
    chaves.set(`${r.instrutor}::${r.chave_mes}`, r);
  }

  if (ano && mes) {
    const instrutores = instrutor ? [instrutor] : await listarInstrutoresConhecidos();
    for (const inst of instrutores) {
      const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;
      const chave = `${inst}::${chaveMes}`;
      if (!chaves.has(chave)) {
        chaves.set(chave, {
          instrutor: inst,
          ano: Number(ano),
          mes: Number(mes),
          chave_mes: chaveMes,
          horas_previstas: 0,
          horas_realizadas: 0,
          dias_praticados: 0,
          dias_previstos: 0,
          estimado: false,
        });
      }
    }
  }

  const resultado = [];
  for (const [chave, realizado] of chaves) {
    const override = overridesMap.get(chave);
    let capacidadeHoras, capacidadeHc, origemCapacidade;

    if (override) {
      capacidadeHoras = n(override.horas_capacidade);
      capacidadeHc = n(override.hc_capacidade);
      origemCapacidade = "manual";
    } else {
      const dias = diasUteisDoMes(realizado.ano, realizado.mes, regra.considerar_domingo);
      capacidadeHoras = round1(dias * n(regra.horas_dia_padrao));
      capacidadeHc = dias * n(regra.hc_dia_padrao);
      origemCapacidade = "automatica";
    }

    resultado.push({
      instrutor: realizado.instrutor,
      ano: realizado.ano,
      mes: realizado.mes,
      chave_mes: realizado.chave_mes,
      horas_previstas: realizado.horas_previstas,
      horas_realizadas: realizado.horas_realizadas,
      dias_praticados: realizado.dias_praticados,
      dias_previstos: realizado.dias_previstos,
      estimado: realizado.estimado,
      capacidade_horas: capacidadeHoras,
      capacidade_hc: capacidadeHc,
      origem_capacidade: origemCapacidade,
      ocupacao_horas_pct: pct(realizado.horas_realizadas, capacidadeHoras),
      saldo_horas: round1(capacidadeHoras - realizado.horas_realizadas),
    });
  }

  return resultado.sort((a, b) =>
    a.chave_mes < b.chave_mes ? -1 : a.chave_mes > b.chave_mes ? 1 : a.instrutor > b.instrutor ? 1 : -1
  );
}

module.exports = {
  getRegraPadrao,
  atualizarRegraPadrao,
  listarOverrides,
  salvarOverride,
  excluirOverride,
  listarInstrutoresConhecidos,
  getCapacidadeVsRealizado,
  diasUteisDoMes,
};
