/**
 * clientMiddleware.js — hotfix isolation
 *
 * PROBLEMA CORRIGIDO (original):
 * O middleware era registrado com app.use() (global) e rodava ANTES de
 * authRequired. Quando chegava, req.user era undefined → empresaId = null
 * → nenhum filtro de tenant aplicado → todos os tenants viam os mesmos dados.
 *
 * SOLUÇÃO (original):
 * Parseia o JWT diretamente do header Authorization, sem depender de
 * req.user estar populado. Funciona independente da ordem de execução.
 *
 * FASE 4 (isolamento multi-tenant, 08/09/2026) — segundo problema encontrado
 * na auditoria: em praticamente todo controller do backend, o filtro de
 * tenant é escrito como `req.empresaId ? "AND empresa_id = ?" : ""` — ou
 * seja, quando req.empresaId é "falsy" (null, 0, undefined), o filtro
 * simplesmente desaparece da query, igual ao comportamento do super_admin
 * (visão global, intencional). O problema é que este middleware também
 * devolvia null para dois casos que NÃO são super_admin:
 *   1. Um usuário comum cujo `empresa_id` no banco está NULL/0 (conta legada
 *      ou mal cadastrada) — confirmado que `authRoutes.js` assina o JWT com
 *      `empresa_id: user.empresa_id ?? null` para qualquer perfil.
 *   2. Qualquer erro interno inesperado (ex.: instabilidade momentânea do
 *      banco na consulta da empresa) — o catch abaixo sempre deixava a
 *      requisição passar sem bloquear ("nunca bloqueia por erro interno").
 * Em ambos os casos, um usuário comum passava a enxergar/editar/excluir
 * dados de TODAS as empresas, do mesmo jeito que o super_admin — silenciosamente,
 * sem nenhum log de alerta visível e sem qualquer ação maliciosa necessária.
 *
 * CORREÇÃO: só o super_admin de verdade recebe `req.empresaId = null` (visão
 * global intencional). Qualquer outro caso sem tenant válido (empresa_id
 * ausente no token, ou erro interno na consulta) agora recebe um id de
 * empresa impossível (`EMPRESA_ID_INEXISTENTE = -1`) em vez de `null` — como
 * é um valor "truthy" em JS, todo o padrão `req.empresaId ? ... : ""` já
 * espalhado pelo código passa a APLICAR o filtro normalmente, e como nenhuma
 * linha tem `empresa_id = -1`, o resultado é "nada encontrado" (fail-closed)
 * em vez de "tudo liberado" (fail-open) — sem precisar tocar em cada
 * controller individualmente.
 */

const EMPRESA_ID_INEXISTENTE = -1;

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
      // Usuário autenticado, não é super_admin, mas o token não carrega uma
      // empresa válida — conta legada/mal cadastrada. Fail-closed: id
      // impossível em vez de null (ver comentário no topo do arquivo).
      console.warn(
        `[clientMiddleware] usuário "${user.email || user.id || "?"}" (perfil "${user.perfil || "?"}") sem empresa_id válido no token — acesso restrito (fail-closed), nenhuma empresa retornará dados.`
      );
      req.empresaId   = EMPRESA_ID_INEXISTENTE;
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
    // Fail-closed: um erro interno (ex.: instabilidade do banco) não deve
    // virar "acesso global" — continua deixando a requisição passar (para
    // não derrubar o app inteiro por causa deste middleware), mas com um id
    // de empresa impossível, então nenhum dado de nenhum tenant é retornado
    // até o próximo request funcionar normalmente.
    console.error('[clientMiddleware] erro interno — aplicando fail-closed:', error.message);
    req.empresaId   = EMPRESA_ID_INEXISTENTE;
    req.empresaNome = null;
    return next();
  }
}

module.exports = { clientMiddleware };
