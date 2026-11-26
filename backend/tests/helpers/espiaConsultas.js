/**
 * espiaConsultas.js — registra, durante as chamadas à API, as consultas SQL que tocam tabelas com empresa_id
 * mas NÃO mencionam empresa_id (nem recebem o id do ambiente como parâmetro) e também não são busca direta por chave.
 * São as candidatas a "esqueci o filtro do ambiente". O teste de isolamento usa isso como CATRACA: a lista atual
 * fica gravada em consultas-sem-ambiente.baseline.json; uma consulta NOVA nessa situação faz o teste falhar, para
 * alguém olhar antes de ir ao ar. Consulta nova revisada e considerada segura entra na lista (UPDATE_BASELINE=1).
 */
const POR_CHAVE = /\bWHERE\b[\s\S]*?\b(?:\w+\.)?(?:id|\w+_id|pessoa_id|usuario_id)\s*(?:=|IN)\s*[(?]/i;

function normalizar(sql) {
  return String(sql)
    .replace(/\s+/g, " ")
    .replace(/\b\d+\b/g, "?")
    .replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, "(?)")
    .replace(/'[^']*'/g, "'?'")
    .trim()
    .slice(0, 220);
}

function instalar(pool, tabelasComEmpresa, idAmbiente) {
  const registro = new Map(); // assinatura -> primeira rota que a executou
  const estado = { rota: "(fora de rota)" };

  const avaliar = (sql, params) => {
    const texto = typeof sql === "string" ? sql : sql && sql.sql;
    if (!texto || !/^\s*(SELECT|UPDATE|DELETE)\b/i.test(texto)) return;
    const tabelas = [...texto.matchAll(/\b(?:FROM|JOIN|UPDATE)\s+`?(\w+)`?/gi)].map((m) => m[1].toLowerCase()).filter((t) => tabelasComEmpresa.has(t));
    if (!tabelas.length) return;
    if (/empresa/i.test(texto)) return;
    if (Array.isArray(params) && params.some((p) => Number(p) === Number(idAmbiente))) return;
    if (POR_CHAVE.test(texto)) return;
    const sig = normalizar(texto);
    if (!registro.has(sig)) registro.set(sig, estado.rota);
  };

  const envolver = (obj) => {
    for (const nome of ["query", "execute"]) {
      const original = obj[nome].bind(obj);
      obj[nome] = (sql, params, ...resto) => { try { avaliar(sql, params); } catch (_) { /* a espiã nunca derruba a chamada */ } return original(sql, params, ...resto); };
    }
  };
  envolver(pool);
  const getConnection = pool.getConnection.bind(pool);
  pool.getConnection = async (...a) => { const c = await getConnection(...a); if (!c.__espiada) { envolver(c); c.__espiada = true; } return c; };

  return { registro, definirRota: (r) => { estado.rota = r; } };
}

module.exports = { instalar, normalizar };
