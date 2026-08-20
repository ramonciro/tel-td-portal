/**
 * clientMiddleware.js
 *
 * Sprint 1 (fix aplicado no Sprint 3):
 *   - REESCRITO de ESM (import/export) para CJS (require/module.exports).
 *     O package.json não tem "type":"module", então o Node roda em CJS.
 *     A versão ESM anterior causava SyntaxError ao ser carregada via require()
 *     no index.js, tornando o middleware inoperante em produção.
 *
 *   - Import corrigido: '../db.js' → '../lib/db' (pool real do sistema).
 *
 * Responsabilidade:
 *   Lê o empresa_id do JWT (populado pelo authController no login) e
 *   disponibiliza req.empresaId para todos os handlers downstream.
 *   O entityCrud e os controllers dedicados usam req.empresaId para
 *   filtrar automaticamente dados por tenant.
 */

const pool = require('../lib/db');

async function clientMiddleware(req, res, next) {
  try {
    // Rotas públicas (login, health, reset-senha) chegam sem req.user — passa direto
    if (!req.user) return next();

    const empresaId = req.user.empresa_id ?? null;

    if (!empresaId) {
      // Usuário legado sem empresa_id no token (super-admin ou cadastro antigo)
      // Permite acesso sem filtro de tenant
      req.empresaId   = null;
      req.empresaNome = null;
      return next();
    }

    const [rows] = await pool.query(
      'SELECT id, nome, ativo FROM empresas WHERE id = ? LIMIT 1',
      [empresaId]
    );

    const empresa = rows[0];

    if (!empresa) {
      return res.status(403).json({
        ok: false,
        message: 'Ambiente não encontrado. Faça login novamente.',
      });
    }

    if (!empresa.ativo) {
      return res.status(403).json({
        ok: false,
        message: `O ambiente "${empresa.nome}" está inativo. Entre em contato com o administrador.`,
      });
    }

    req.empresaId   = empresa.id;
    req.empresaNome = empresa.nome;

    return next();
  } catch (error) {
    console.error('[clientMiddleware] Erro ao verificar empresa:', error.message);
    // Não bloqueia em erro de DB — loga e continua sem filtro de tenant
    req.empresaId   = null;
    req.empresaNome = null;
    return next();
  }
}

module.exports = { clientMiddleware };
