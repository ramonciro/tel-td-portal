/**
 * clientMiddleware.js
 *
 * Sprint 1 — Fix:
 *   - Import estava apontando para '../config/database' (inexistente).
 *     Corrigido para '../db' (pool real do sistema).
 *   - Middleware nunca era aplicado no index.js.
 *     Agora é registrado globalmente antes das rotas protegidas.
 *
 * Responsabilidade:
 *   Lê o empresa_id do usuário autenticado (via JWT em req.user)
 *   e o disponibiliza em req.empresaId para todas as queries subsequentes.
 *   Também valida que o ambiente (cliente selecionado no login) existe e está ativo.
 */

import pool from "../db.js";

export async function clientMiddleware(req, res, next) {
  try {
    // Rotas públicas (login, health check) não têm req.user — pula o filtro
    if (!req.user) return next();

    const empresaId = req.user?.empresa_id ?? null;

    if (!empresaId) {
      // Usuário sem empresa_id no token — usuário legado ou super-admin
      // Permite o acesso mas sem filtro de tenant
      req.empresaId = null;
      return next();
    }

    // Valida que a empresa existe e está ativa no banco
    const [rows] = await pool.query(
      "SELECT id, nome, ativo FROM empresas WHERE id = ? LIMIT 1",
      [empresaId]
    );

    const empresa = rows[0];

    if (!empresa) {
      return res.status(403).json({
        ok: false,
        message: "Ambiente não encontrado. Faça login novamente.",
      });
    }

    if (!empresa.ativo) {
      return res.status(403).json({
        ok: false,
        message: `O ambiente "${empresa.nome}" está inativo. Entre em contato com o administrador.`,
      });
    }

    // Disponibiliza para todos os handlers downstream
    req.empresaId   = empresa.id;
    req.empresaNome = empresa.nome;

    return next();
  } catch (error) {
    console.error("[clientMiddleware] Erro ao verificar empresa:", error.message);
    // Não bloqueia em caso de erro de DB — loga e continua
    req.empresaId = null;
    return next();
  }
}
