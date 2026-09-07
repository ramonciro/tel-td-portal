/**
 * resumoExecutivoService.js
 *
 * Fase 3 do roadmap de competitividade ("lacuna de diferenciação") —
 * "resumo executivo automático" exibido no Dashboard, dentro do bloco
 * Oceano. Por decisão explícita do Ramon ("vamos seguir sem custo por
 * enquanto"), NÃO chama nenhuma IA/LLM externa: o texto é montado por
 * templates fixos de frase em português, preenchidos com os mesmos sinais
 * que o e-mail diário de pendências já calcula (jobs/pendenciasDigest.js —
 * capacidade fora da faixa, desempenho fora da faixa, chamadas pendentes,
 * turmas críticas). Nenhuma métrica nova é criada aqui.
 *
 * Gerado uma vez por dia pelo mesmo job das 07h (rodarDigestPendencias) e
 * cacheado em resumos_executivos_diarios — não é recalculado a cada
 * carregamento do Dashboard. Se ainda não existir um resumo cacheado para
 * hoje (ambiente novo, ou o job ainda não rodou nesse dia), o endpoint do
 * Dashboard gera na hora, sem cachear, só para a tela nunca ficar vazia.
 */

const pool = require("../lib/db");

function condEmpresa(empresaId) {
  return empresaId ? "empresa_id = ?" : "empresa_id IS NULL";
}

function fraseCriticas(itens) {
  if (!itens.length) return null;
  if (itens.length === 1) {
    const t = itens[0];
    return `A turma "${t.tema}" (${t.cliente}) está em situação crítica e merece atenção imediata.`;
  }
  return `${itens.length} turmas estão em situação crítica e merecem atenção imediata.`;
}

function fraseChamadas(itens) {
  if (!itens.length) return null;
  if (itens.length === 1) {
    const t = itens[0];
    return `Há 1 turma com chamada pendente de registro ("${t.tema}" — ${t.cliente}).`;
  }
  return `Há ${itens.length} turmas com chamada pendente de registro.`;
}

function fraseCapacidade(itens) {
  if (!itens.length) return null;
  if (itens.length === 1) {
    const i = itens[0];
    return `${i.instrutor} está com ocupação fora da faixa saudável (${i.ocupacao_pct}%, ${i.status}).`;
  }
  return `${itens.length} instrutores estão com ocupação fora da faixa saudável, entre eles ${itens[0].instrutor} (${itens[0].ocupacao_pct}%).`;
}

function fraseDesempenho(itens) {
  if (!itens.length) return null;
  if (itens.length === 1) {
    const i = itens[0];
    return `${i.instrutor} está fora da faixa saudável de frequência/NPS este mês (${i.motivo}).`;
  }
  return `${itens.length} instrutores estão fora da faixa saudável de frequência ou NPS este mês.`;
}

/**
 * Função pura — recebe o mesmo objeto "resumo" que
 * pendenciasDigest.montarResumoEmpresa já monta
 * ({capacidade, desempenho, chamadasPendentes, turmasCriticas}) e devolve
 * 2 a 4 frases em português. Sem chamada de rede, sem IA — só template.
 */
function gerarTextoResumo(resumo) {
  const frases = [
    fraseCriticas(resumo.turmasCriticas || []),
    fraseChamadas(resumo.chamadasPendentes || []),
    fraseCapacidade(resumo.capacidade || []),
    fraseDesempenho(resumo.desempenho || []),
  ].filter(Boolean);

  if (!frases.length) {
    return "Nenhum ponto de atenção identificado hoje — capacidade, desempenho e presenças estão dentro do esperado.";
  }

  return frases.join(" ");
}

/** Grava (ou atualiza) o resumo cacheado de hoje para uma empresa. */
async function salvarResumoDoDia(empresaId, texto, totalSinais = 0) {
  const [existente] = await pool.query(
    `SELECT id FROM resumos_executivos_diarios WHERE ${condEmpresa(empresaId)} AND data = CURDATE() LIMIT 1`,
    empresaId ? [empresaId] : []
  );

  if (existente.length) {
    await pool.query(
      `UPDATE resumos_executivos_diarios SET texto = ?, total_sinais = ?, gerado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      [texto, totalSinais, existente[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO resumos_executivos_diarios (empresa_id, data, texto, total_sinais) VALUES (?, CURDATE(), ?, ?)`,
      [empresaId || null, texto, totalSinais]
    );
  }
}

/**
 * Lê o resumo cacheado de hoje. Retorna null se ainda não foi gerado nesse
 * dia — o chamador decide se quer gerar na hora (sem cachear) ou não.
 */
async function getResumoCacheadoDoDia(empresaId) {
  const [rows] = await pool.query(
    `SELECT texto, gerado_em FROM resumos_executivos_diarios WHERE ${condEmpresa(empresaId)} AND data = CURDATE() LIMIT 1`,
    empresaId ? [empresaId] : []
  );
  return rows[0] || null;
}

module.exports = { gerarTextoResumo, salvarResumoDoDia, getResumoCacheadoDoDia };
