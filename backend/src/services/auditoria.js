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

// Monta o WHERE/valores compartilhado entre a listagem paginada e a contagem
// total — os dois precisam enxergar exatamente o mesmo filtro.
function construirFiltroAuditoria({ usuarioId, acao, entidade, dataInicio, dataFim, empresaId } = {}) {
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
  // Isolamento por tenant: auditoria_log não tem empresa_id própria — o log é
  // vinculado ao usuário que executou a ação. Sem este filtro, qualquer
  // coordenador/superintendente (rota não é super_admin-only) via a trilha de
  // auditoria completa de TODAS as empresas.
  if (empresaId) {
    condicoes.push("usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = ?)");
    valores.push(empresaId);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  return { where, valores };
}

async function listarAuditoria({ usuarioId, acao, entidade, dataInicio, dataFim, limite = 200, empresaId } = {}) {
  const { where, valores } = construirFiltroAuditoria({ usuarioId, acao, entidade, dataInicio, dataFim, empresaId });
  const [rows] = await pool.query(
    `SELECT * FROM auditoria_log ${where} ORDER BY criado_em DESC LIMIT ?`,
    [...valores, Number(limite) || 200]
  );
  return rows;
}

// FIX (07/09): a tela de auditoria mostrava os cards de resumo ("Registros no
// período", "Criações", "Edições", "Exclusões") calculados em cima do array
// já paginado (`itens`) — se o filtro tivesse mais registros do que o limite
// carregado, o card mostrava só o que estava na página, rotulado como se
// fosse o total do período. Esta contagem roda no banco, sem limite, com o
// mesmo filtro da listagem.
async function contarAuditoriaPorAcao({ usuarioId, acao, entidade, dataInicio, dataFim, empresaId } = {}) {
  const { where, valores } = construirFiltroAuditoria({ usuarioId, acao, entidade, dataInicio, dataFim, empresaId });
  const [rows] = await pool.query(
    `SELECT acao, COUNT(*) AS total FROM auditoria_log ${where} GROUP BY acao`,
    valores
  );

  const totais = { total: 0, criar: 0, editar: 0, excluir: 0 };
  for (const row of rows) {
    const qtd = Number(row.total) || 0;
    totais.total += qtd;
    if (row.acao in totais) totais[row.acao] = qtd;
  }
  return totais;
}

module.exports = { registrarAuditoria, listarAuditoria, contarAuditoriaPorAcao, mascarar };
