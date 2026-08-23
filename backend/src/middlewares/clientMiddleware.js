/**
 * clientMiddleware.js — hotfix isolation
 *
 * PROBLEMA CORRIGIDO:
 * O middleware era registrado com app.use() (global) e rodava ANTES de
 * authRequired. Quando chegava, req.user era undefined → empresaId = null
 * → nenhum filtro de tenant aplicado → todos os tenants viam os mesmos dados.
 *
 * SOLUÇÃO:
 * Parseia o JWT diretamente do header Authorization, sem depender de
 * req.user estar populado. Funciona independente da ordem de execução.
 */

const pool = require('../lib/db');
const jwt  = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'default_secret_key';
}

async function clientMiddleware(req, res, next) {
  try {
    // 1. Tenta pegar user de req.user (se authRequired já rodou)
    //    ou parseia o JWT diretamente do header (se rodou antes)
    let user = req.user;

    if (!user) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        try {
          user = jwt.verify(token, getJwtSecret());
        } catch (_) {
          // Token inválido/expirado — deixa authRequired tratar
        }
      }
    }

    if (!user) {
      req.empresaId   = null;
      req.empresaNome = null;
      return next();
    }

    // 2. super_admin não tem tenant — vê tudo
    const isSuperAdmin = String(user.perfil || '').toLowerCase() === 'super_admin'
                      || Number(user.super_admin || 0) === 1;
    if (isSuperAdmin) {
      req.empresaId   = null;
      req.empresaNome = 'Super Admin';
      return next();
    }

    const empresaId = user.empresa_id ?? null;

    if (!empresaId) {
      req.empresaId   = null;
      req.empresaNome = null;
      return next();
    }

    // 3. Verifica se a empresa existe e está ativa
    const [rows] = await pool.query(
      'SELECT id, nome, ativo FROM empresas WHERE id = ? LIMIT 1',
      [empresaId]
    );

    const empresa = rows[0];

    if (!empresa) {
      // Empresa não encontrada — ainda permite acesso (migration pode estar pendente)
      req.empresaId   = empresaId;
      req.empresaNome = null;
      return next();
    }

    if (!empresa.ativo) {
      return res.status(403).json({
        ok: false,
        message: `Ambiente "${empresa.nome}" inativo. Entre em contato com o administrador.`,
      });
    }

    req.empresaId   = empresa.id;
    req.empresaNome = empresa.nome;
    return next();
  } catch (error) {
    console.error('[clientMiddleware]', error.message);
    req.empresaId   = null;
    req.empresaNome = null;
    return next(); // nunca bloqueia por erro interno
  }
}

module.exports = { clientMiddleware };
