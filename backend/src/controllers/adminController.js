/**
 * adminController.js — Sprint 4: SaaS Foundation
 *
 * Rotas exclusivas para o perfil super_admin.
 * Gerencia empresas (tenants), planos e usuários admin de cada tenant.
 *
 * Todos os endpoints aqui estão protegidos por requireSuperAdmin no index.js.
 * Não há filtro por empresa_id — super_admin enxerga tudo.
 *
 * Endpoints:
 *   GET  /api/admin/stats              → getGlobalStats
 *   GET  /api/admin/empresas           → listEmpresas
 *   GET  /api/admin/empresas/:id       → getEmpresa
 *   POST /api/admin/empresas           → createEmpresa (+ admin user)
 *   PUT  /api/admin/empresas/:id       → updateEmpresa
 *   POST /api/admin/empresas/:id/toggle-ativo → toggleAtivo
 *   GET  /api/admin/planos             → listPlanos
 */

const pool   = require('../lib/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/* ─── helpers ────────────────────────────────────────────────────────────── */
function gerarSenhaTemporaria(len = 10) {
  return crypto.randomBytes(len).toString('base64').slice(0, len).replace(/[^a-zA-Z0-9]/g, 'x');
}

async function getEmpresaStats(empresaId) {
  const [[{ total_usuarios }]] = await pool.query(
    'SELECT COUNT(*) AS total_usuarios FROM usuarios WHERE empresa_id = ?', [empresaId]
  );
  const [[{ total_turmas }]] = await pool.query(
    'SELECT COUNT(*) AS total_turmas FROM treinamentos WHERE empresa_id = ?', [empresaId]
  );
  let total_certificados = 0;
  try {
    const [[{ tc }]] = await pool.query(
      'SELECT COUNT(*) AS tc FROM certificados WHERE empresa_id = ?', [empresaId]
    );
    total_certificados = Number(tc || 0);
  } catch (_) { /* Sprint 3 migration pendente */ }
  const [[{ total_presencas }]] = await pool.query(
    'SELECT COUNT(*) AS total_presencas FROM presencas WHERE empresa_id = ?', [empresaId]
  );
  return {
    total_usuarios:    Number(total_usuarios    || 0),
    total_turmas:      Number(total_turmas      || 0),
    total_certificados: total_certificados,
    total_presencas:   Number(total_presencas   || 0),
  };
}

/* ─── GET /api/admin/stats ──────────────────────────────────────────────── */
async function getGlobalStats(req, res) {
  try {
    const [[{ empresas_ativas }]] = await pool.query(
      "SELECT COUNT(*) AS empresas_ativas FROM empresas WHERE ativo = 1"
    );
    const [[{ total_empresas }]] = await pool.query(
      "SELECT COUNT(*) AS total_empresas FROM empresas"
    );
    const [[{ total_usuarios }]] = await pool.query(
      "SELECT COUNT(*) AS total_usuarios FROM usuarios"
    );
    const [[{ total_turmas }]] = await pool.query(
      "SELECT COUNT(*) AS total_turmas FROM treinamentos"
    );
    let total_certificados = 0;
    try {
      const [[{ tc }]] = await pool.query("SELECT COUNT(*) AS tc FROM certificados");
      total_certificados = Number(tc || 0);
    } catch (_) { /* Sprint 3 migration pendente */ }
    const [porPlano] = await pool.query(
      "SELECT plano, COUNT(*) AS qtd FROM empresas GROUP BY plano ORDER BY qtd DESC"
    );

    return res.json({
      empresas_ativas:   Number(empresas_ativas   || 0),
      total_empresas:    Number(total_empresas    || 0),
      total_usuarios:    Number(total_usuarios    || 0),
      total_turmas:      Number(total_turmas      || 0),
      total_certificados: total_certificados,
      distribuicao_planos: porPlano,
    });
  } catch (error) {
    console.error('[admin] getGlobalStats:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar stats globais', error: error.message });
  }
}

/* ─── GET /api/admin/empresas ───────────────────────────────────────────── */
// Contagens em queries separadas com fallback 0 para tabelas opcionais
// (certificados só existe após Sprint 3 migration; super_admin após Sprint 4).
async function listEmpresas(req, res) {
  try {
    const [empresas] = await pool.query('SELECT * FROM empresas ORDER BY nome ASC');

    // Usuários por empresa
    const [uRows] = await pool.query(
      'SELECT empresa_id, COUNT(*) AS qtd FROM usuarios WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
    );
    const uMap = {};
    uRows.forEach((r) => { uMap[r.empresa_id] = Number(r.qtd); });

    // Turmas por empresa
    const [tRows] = await pool.query(
      'SELECT empresa_id, COUNT(*) AS qtd FROM treinamentos WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
    );
    const tMap = {};
    tRows.forEach((r) => { tMap[r.empresa_id] = Number(r.qtd); });

    // Certificados por empresa — tabela criada no Sprint 3, pode não existir
    const cMap = {};
    try {
      const [cRows] = await pool.query(
        'SELECT empresa_id, COUNT(*) AS qtd FROM certificados WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
      );
      cRows.forEach((r) => { cMap[r.empresa_id] = Number(r.qtd); });
    } catch (_) { /* Sprint 3 migration pendente — ignora silenciosamente */ }

    const result = empresas.map((e) => ({
      ...e,
      total_usuarios:     uMap[e.id] || 0,
      total_turmas:       tMap[e.id] || 0,
      total_certificados: cMap[e.id] || 0,
    }));

    return res.json(result);
  } catch (error) {
    console.error('[admin] listEmpresas:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao listar empresas', error: error.message });
  }
}


/* ─── GET /api/admin/empresas/:id ──────────────────────────────────────── */
async function getEmpresa(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM empresas WHERE id = ? LIMIT 1', [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Empresa não encontrada' });

    const empresa = rows[0];
    const stats   = await getEmpresaStats(id);

    // Usuários administradores do tenant
    const [admins] = await pool.query(
      `SELECT id, nome, email, perfil, ativo, criado_em
       FROM usuarios WHERE empresa_id = ?
       ORDER BY perfil DESC, nome ASC`,
      [id]
    );

    return res.json({ ...empresa, stats, usuarios: admins });
  } catch (error) {
    console.error('[admin] getEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar empresa', error: error.message });
  }
}

/* ─── POST /api/admin/empresas ──────────────────────────────────────────── */
// Cria o tenant + usuário coordenador inicial em uma transação.
// Retorna as credenciais do admin para copiar (senha temporária em texto claro,
// exibida UMA única vez — usuário deve trocar no primeiro login).
async function createEmpresa(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      nome, codigo, plano = 'basico',
      contato_nome, contato_email, contato_telefone,
      subdomain, cor_primaria = '#FF6B4A', observacoes,
      // Usuário admin inicial
      admin_nome, admin_email, admin_senha,
    } = req.body || {};

    if (!nome || !admin_nome || !admin_email) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ ok: false, message: 'nome, admin_nome e admin_email são obrigatórios.' });
    }

    // Busca limites do plano
    const [planoRows] = await conn.query(
      'SELECT * FROM planos WHERE slug = ? LIMIT 1', [plano]
    );
    const planoData = planoRows[0] || { limite_usuarios: 50, limite_turmas: 100 };

    // Cria empresa
    const [empResult] = await conn.query(
      `INSERT INTO empresas
         (nome, codigo, plano, limite_usuarios, limite_turmas,
          contato_nome, contato_email, contato_telefone,
          subdomain, cor_primaria, observacoes, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        nome,
        codigo || null,
        plano,
        planoData.limite_usuarios,
        planoData.limite_turmas,
        contato_nome || null,
        contato_email || null,
        contato_telefone || null,
        subdomain || null,
        cor_primaria,
        observacoes || null,
      ]
    );
    const empresaId = empResult.insertId;

    // Verifica se o email do admin já existe
    const [existeEmail] = await conn.query(
      'SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?) LIMIT 1', [admin_email]
    );
    if (existeEmail.length) {
      await conn.rollback(); conn.release();
      return res.status(409).json({ ok: false, message: `E-mail "${admin_email}" já está cadastrado no sistema.` });
    }

    // Senha: usa a fornecida ou gera temporária
    const senhaPlain = admin_senha || gerarSenhaTemporaria();
    const senhaHash  = await bcrypt.hash(senhaPlain, 10);

    const [userResult] = await conn.query(
      `INSERT INTO usuarios
         (nome, email, senha, perfil, empresa_id, ativo, troca_senha_obrigatoria)
       VALUES (?, ?, ?, 'coordenador', ?, 1, 1)`,
      [admin_nome, admin_email, senhaHash, empresaId]
    );

    await conn.commit();
    conn.release();

    return res.status(201).json({
      ok: true,
      empresa: {
        id:         empresaId,
        nome,
        codigo:     codigo || null,
        plano,
        ativo:      1,
      },
      admin: {
        id:              userResult.insertId,
        nome:            admin_nome,
        email:           admin_email,
        perfil:          'coordenador',
        senha_temporaria: senhaPlain,   // exibir UMA vez — nunca armazenar no frontend
        aviso:           'O usuário deverá trocar a senha no primeiro acesso.',
      },
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[admin] createEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao criar empresa', error: error.message });
  }
}

/* ─── PUT /api/admin/empresas/:id ───────────────────────────────────────── */
async function updateEmpresa(req, res) {
  try {
    const { id } = req.params;
    const {
      nome, codigo, plano,
      contato_nome, contato_email, contato_telefone,
      subdomain, cor_primaria, logo_url, observacoes,
    } = req.body || {};

    if (!nome) return res.status(400).json({ ok: false, message: 'Nome é obrigatório.' });

    // Atualiza limites se o plano mudou
    let limite_usuarios = undefined;
    let limite_turmas   = undefined;
    if (plano) {
      const [planoRows] = await pool.query(
        'SELECT * FROM planos WHERE slug = ? LIMIT 1', [plano]
      );
      if (planoRows[0]) {
        limite_usuarios = planoRows[0].limite_usuarios;
        limite_turmas   = planoRows[0].limite_turmas;
      }
    }

    const fields = [
      'nome = ?', 'codigo = ?', 'contato_nome = ?', 'contato_email = ?',
      'contato_telefone = ?', 'subdomain = ?', 'cor_primaria = ?',
      'logo_url = ?', 'observacoes = ?',
    ];
    const values = [
      nome, codigo || null, contato_nome || null, contato_email || null,
      contato_telefone || null, subdomain || null,
      cor_primaria || '#FF6B4A', logo_url || null, observacoes || null,
    ];

    if (plano)            { fields.push('plano = ?');            values.push(plano); }
    if (limite_usuarios)  { fields.push('limite_usuarios = ?');  values.push(limite_usuarios); }
    if (limite_turmas)    { fields.push('limite_turmas = ?');    values.push(limite_turmas); }

    values.push(id);
    await pool.query(`UPDATE empresas SET ${fields.join(', ')} WHERE id = ?`, values);

    return res.json({ ok: true });
  } catch (error) {
    console.error('[admin] updateEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao atualizar empresa', error: error.message });
  }
}

/* ─── POST /api/admin/empresas/:id/toggle-ativo ─────────────────────────── */
async function toggleAtivo(req, res) {
  try {
    const { id } = req.params;
    const [[empresa]] = await pool.query('SELECT ativo FROM empresas WHERE id = ? LIMIT 1', [id]);
    if (!empresa) return res.status(404).json({ ok: false, message: 'Empresa não encontrada' });

    const novoAtivo = empresa.ativo ? 0 : 1;
    await pool.query('UPDATE empresas SET ativo = ? WHERE id = ?', [novoAtivo, id]);

    return res.json({ ok: true, ativo: novoAtivo });
  } catch (error) {
    console.error('[admin] toggleAtivo:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao alterar status', error: error.message });
  }
}

/* ─── GET /api/admin/planos ─────────────────────────────────────────────── */
async function listPlanos(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM planos WHERE ativo = 1 ORDER BY limite_usuarios ASC');
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Erro ao listar planos', error: error.message });
  }
}

module.exports = {
  getGlobalStats,
  listEmpresas,
  getEmpresa,
  createEmpresa,
  updateEmpresa,
  toggleAtivo,
  listPlanos,
};
