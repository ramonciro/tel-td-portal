// auditoria.js
//
// Serviço central de auditoria. Qualquer parte do backend que precise
// registrar uma ação sensível (criar/editar/excluir usuário, treinamento,
// avaliação, presença retroativa etc.) chama `registrarAuditoria`.
//
// Regra importante: auditoria NUNCA pode derrubar a operação principal. Se o
// registro de log falhar por qualquer motivo, apenas loga o erro no console
// e segue — a ação do usuário (criar/editar/excluir) já aconteceu e não deve
// ser desfeita ou travada por uma falha no log.

const pool = require("../lib/db");

const CAMPOS_SENSIVEIS = ["senha", "password", "token", "nova_senha", "novaSenha"];

// Nunca grava valores de senha/token no log, nem no "antes" nem no "depois".
function mascarar(dados) {
  if (!dados || typeof dados !== "object") return dados;
  const copia = { ...dados };
  for (const campo of CAMPOS_SENSIVEIS) {
    if (campo in copia) copia[campo] = "[oculto]";
  }
  return copia;
}

async function registrarAuditoria({
  usuario,
  acao,
  entidade,
  entidadeId,
  resumo,
  dadosAntes,
  dadosDepois,
  ip,
}) {
  try {
    await pool.query(
      `INSERT INTO auditoria_log
        (usuario_id, usuario_nome, perfil, acao, entidade, entidade_id, resumo, dados_antes, dados_depois, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario?.id ?? null,
        usuario?.nome ?? null,
        usuario?.perfil ?? null,
        acao,
        entidade,
        entidadeId ?? null,
        resumo ?? null,
        dadosAntes ? JSON.stringify(mascarar(dadosAntes)) : null,
        dadosDepois ? JSON.stringify(mascarar(dadosDepois)) : null,
        ip ?? null,
      ]
    );
  } catch (error) {
    console.error("[auditoria] falha ao registrar (ação do usuário NÃO foi afetada):", error.message);
  }
}

async function listarAuditoria({ usuarioId, acao, entidade, dataInicio, dataFim, limite = 200 } = {}) {
  const condicoes = [];
  const valores = [];

  if (usuarioId) {
    condicoes.push("usuario_id = ?");
    valores.push(usuarioId);
  }
  if (acao) {
    condicoes.push("acao = ?");
    valores.push(acao);
  }
  if (entidade) {
    condicoes.push("entidade = ?");
    valores.push(entidade);
  }
  if (dataInicio) {
    condicoes.push("criado_em >= ?");
    valores.push(dataInicio);
  }
  if (dataFim) {
    condicoes.push("criado_em <= ?");
    valores.push(dataFim);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT * FROM auditoria_log ${where} ORDER BY criado_em DESC LIMIT ?`,
    [...valores, Number(limite) || 200]
  );
  return rows;
}

module.exports = { registrarAuditoria, listarAuditoria, mascarar };
