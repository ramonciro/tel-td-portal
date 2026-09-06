/**
 * adminController.js — Sprint 4 (hotfix v3)
 *
 * Completamente resiliente a migrations pendentes.
 * Cada query que referencia colunas opcionais tem try/catch individual.
 * Funciona mesmo sem Sprint 1, 3 ou 4 aplicados.
 */

const pool = require('../lib/db');

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function gerarSenha(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const PLANOS_PADRAO = [
  { id: 1, slug: 'basico',       nome: 'Básico',       limite_usuarios: 30,   limite_turmas: 50,   descricao: 'Até 30 usuários e 50 turmas' },
  { id: 2, slug: 'profissional', nome: 'Profissional', limite_usuarios: 100,  limite_turmas: 300,  descricao: 'Até 100 usuários e 300 turmas' },
  { id: 3, slug: 'enterprise',   nome: 'Enterprise',   limite_usuarios: 9999, limite_turmas: 9999, descricao: 'Sem limites operacionais' },
];

async function contarTabela(tabela, filtro = '') {
  try {
    const sql = `SELECT COUNT(*) AS n FROM \`${tabela}\` ${filtro}`;
    const [[{ n }]] = await pool.query(sql);
    return Number(n || 0);
  } catch (_) {
    return 0; // tabela ou coluna não existe
  }
}

/* ─── GET /api/admin/stats ─────────────────────────────────────────────────── */
async function getGlobalStats(req, res) {
  try {
    const total_empresas    = await contarTabela('empresas');
    const empresas_ativas   = await contarTabela('empresas', 'WHERE ativo = 1');
    const total_usuarios    = await contarTabela('usuarios', 'WHERE super_admin = 0');
    const total_turmas      = await contarTabela('treinamentos');
    const total_certificados = await contarTabela('certificados');

    let distribuicao_planos = [];
    try {
      const [rows] = await pool.query(
        'SELECT plano, COUNT(*) AS qtd FROM empresas GROUP BY plano ORDER BY qtd DESC'
      );
      distribuicao_planos = rows;
    } catch (_) {}

    return res.json({
      empresas_ativas,
      total_empresas,
      total_usuarios,
      total_turmas,
      total_certificados,
      distribuicao_planos,
    });
  } catch (error) {
    console.error('[admin] getGlobalStats:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar stats', error: error.message });
  }
}

/* ─── GET /api/admin/empresas ──────────────────────────────────────────────── */
async function listEmpresas(req, res) {
  try {
    // SELECT básico — colunas que sempre existem
    const [empresas] = await pool.query('SELECT * FROM empresas ORDER BY nome ASC');

    // Contagens por empresa — cada uma com fallback 0
    const uMap = {};
    try {
      const [rows] = await pool.query(
        'SELECT empresa_id, COUNT(*) AS qtd FROM usuarios WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
      );
      rows.forEach((r) => { uMap[r.empresa_id] = Number(r.qtd); });
    } catch (_) {}

    const tMap = {};
    try {
      const [rows] = await pool.query(
        'SELECT empresa_id, COUNT(*) AS qtd FROM treinamentos WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
      );
      rows.forEach((r) => { tMap[r.empresa_id] = Number(r.qtd); });
    } catch (_) {}

    const cMap = {};
    try {
      const [rows] = await pool.query(
        'SELECT empresa_id, COUNT(*) AS qtd FROM certificados WHERE empresa_id IS NOT NULL GROUP BY empresa_id'
      );
      rows.forEach((r) => { cMap[r.empresa_id] = Number(r.qtd); });
    } catch (_) {}

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

/* ─── GET /api/admin/empresas/:id ──────────────────────────────────────────── */
async function getEmpresa(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Empresa não encontrada' });

    const empresa = rows[0];

    const stats = {
      total_usuarios:     await contarTabela('usuarios',    `WHERE empresa_id = ${id}`),
      total_turmas:       await contarTabela('treinamentos',`WHERE empresa_id = ${id}`),
      total_certificados: await contarTabela('certificados',`WHERE empresa_id = ${id}`),
      total_presencas:    await contarTabela('presencas',   `WHERE empresa_id = ${id}`),
    };

    let usuarios = [];
    try {
      const [uRows] = await pool.query(
        `SELECT id, nome, email, perfil, ativo, criado_em
         FROM usuarios WHERE empresa_id = ? ORDER BY perfil DESC, nome ASC`,
        [id]
      );
      usuarios = uRows;
    } catch (_) {
      // empresa_id ainda não existe em usuarios
      try {
        const [uRows] = await pool.query(
          'SELECT id, nome, email, perfil, ativo FROM usuarios ORDER BY nome ASC LIMIT 50'
        );
        usuarios = uRows;
      } catch (_) {}
    }

    return res.json({ ...empresa, stats, usuarios });
  } catch (error) {
    console.error('[admin] getEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar empresa', error: error.message });
  }
}

/* ─── POST /api/admin/empresas ─────────────────────────────────────────────── */
async function createEmpresa(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      nome, codigo, plano = 'basico',
      contato_nome, contato_email, contato_telefone,
      subdomain, cor_primaria = '#FF6B4A', observacoes,
      admin_nome, admin_email, admin_senha,
    } = req.body || {};

    if (!nome || !admin_nome || !admin_email) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ ok: false, message: 'nome, admin_nome e admin_email são obrigatórios.' });
    }

    // 1. Cria empresa com colunas mínimas garantidas
    const [empResult] = await conn.query(
      'INSERT INTO empresas (nome, ativo) VALUES (?, 1)',
      [nome]
    );
    const empresaId = empResult.insertId;

    // 2. Tenta atualizar colunas do Sprint 4 (ignora se não existirem)
    const planDefaults = { basico: [30, 50], profissional: [100, 300], enterprise: [9999, 9999] };
    const [limU, limT] = planDefaults[plano] || [50, 100];

    let limiteUsuarios = limU, limiteTurmas = limT;
    try {
      const [pl] = await conn.query('SELECT * FROM planos WHERE slug = ? LIMIT 1', [plano]);
      if (pl[0]) { limiteUsuarios = pl[0].limite_usuarios; limiteTurmas = pl[0].limite_turmas; }
    } catch (_) {}

    const opcionais = [
      ['codigo',           codigo           || null],
      ['plano',            plano                   ],
      ['limite_usuarios',  limiteUsuarios          ],
      ['limite_turmas',    limiteTurmas            ],
      ['contato_nome',     contato_nome     || null],
      ['contato_email',    contato_email    || null],
      ['contato_telefone', contato_telefone || null],
      ['subdomain',        subdomain        || null],
      ['cor_primaria',     cor_primaria            ],
      ['observacoes',      observacoes      || null],
    ];

    for (const [col, val] of opcionais) {
      try {
        await conn.query(`UPDATE empresas SET \`${col}\` = ? WHERE id = ?`, [val, empresaId]);
      } catch (_) {}
    }

    // 3. Verifica e-mail duplicado
    const [existe] = await conn.query(
      'SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?) LIMIT 1', [admin_email]
    );
    if (existe.length) {
      await conn.rollback(); conn.release();
      return res.status(409).json({ ok: false, message: `E-mail "${admin_email}" já cadastrado.` });
    }

    // 4. Cria coordenador inicial
    const bcrypt = require('bcryptjs');
    const senhaPlain = admin_senha || gerarSenha();
    const senhaHash  = await bcrypt.hash(senhaPlain, 10);

    let userResult;

    // Tenta com empresa_id (Sprint 1 aplicado)
    try {
      [userResult] = await conn.query(
        `INSERT INTO usuarios (nome, email, senha, perfil, empresa_id, ativo, troca_senha_obrigatoria)
         VALUES (?, ?, ?, 'coordenador', ?, 1, 1)`,
        [admin_nome, admin_email, senhaHash, empresaId]
      );
    } catch (_) {
      // empresa_id ainda não existe — insere sem ela
      [userResult] = await conn.query(
        `INSERT INTO usuarios (nome, email, senha, perfil, ativo, troca_senha_obrigatoria)
         VALUES (?, ?, ?, 'coordenador', 1, 1)`,
        [admin_nome, admin_email, senhaHash]
      );
      // Tenta linkar depois
      try {
        await conn.query('UPDATE usuarios SET empresa_id = ? WHERE id = ?',
          [empresaId, userResult.insertId]);
      } catch (_) {}
    }

    await conn.commit();
    conn.release();

    return res.status(201).json({
      ok: true,
      empresa: { id: empresaId, nome, codigo: codigo || null, plano, ativo: 1 },
      admin: {
        id:               userResult.insertId,
        nome:             admin_nome,
        email:            admin_email,
        perfil:           'coordenador',
        senha_temporaria: senhaPlain,
        aviso:            'O usuário deverá trocar a senha no primeiro acesso.',
      },
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[admin] createEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao criar empresa', error: error.message });
  }
}

/* ─── PUT /api/admin/empresas/:id ──────────────────────────────────────────── */
async function updateEmpresa(req, res) {
  try {
    const { id } = req.params;
    const {
      nome, codigo, plano,
      contato_nome, contato_email, contato_telefone,
      subdomain, cor_primaria, logo_url, observacoes,
      custo_hora_treinamento,
    } = req.body || {};

    if (!nome) {
      return res.status(400).json({ ok: false, message: 'Nome é obrigatório.' });
    }

    const planoFinal   = plano || 'basico';
    const colunasFaltantes = [];

    // nome sempre salvo (coluna garantida desde o início)
    await pool.query('UPDATE empresas SET nome = ? WHERE id = ?', [nome, id]);

    // Colunas do Sprint 4 — falham silenciosamente se ainda não existem no banco,
    // mas agora logam o erro para diagnóstico nos logs do Railway.
    const opcionais = [
      ['codigo',           codigo           || null],
      ['plano',            planoFinal              ],
      ['contato_nome',     contato_nome     || null],
      ['contato_email',    contato_email    || null],
      ['contato_telefone', contato_telefone || null],
      ['subdomain',        subdomain        || null],
      ['cor_primaria',     cor_primaria     || '#FF6B4A'],
      ['logo_url',         logo_url         || null],
      ['observacoes',      observacoes      || null],
      ['custo_hora_treinamento', custo_hora_treinamento !== '' && custo_hora_treinamento != null
        ? Number(custo_hora_treinamento) : null],
    ];

    for (const [col, val] of opcionais) {
      try {
        // Usa placeholder ?? para escapar o nome da coluna com segurança
        await pool.query('UPDATE empresas SET ?? = ? WHERE id = ?', [col, val, id]);
      } catch (colErr) {
        console.warn(`[updateEmpresa] coluna "${col}" indisponível: ${colErr.message}`);
        colunasFaltantes.push(col);
      }
    }

    // Atualiza limites conforme plano
    const planoDefs = { basico:[30,50], profissional:[100,300], enterprise:[9999,9999] };
    const [defU, defT] = planoDefs[planoFinal] || [50, 100];
    try {
      const [plRows] = await pool.query(
        'SELECT limite_usuarios, limite_turmas FROM planos WHERE slug = ? LIMIT 1',
        [planoFinal]
      );
      const limU = plRows[0]?.limite_usuarios ?? defU;
      const limT = plRows[0]?.limite_turmas   ?? defT;
      await pool.query(
        'UPDATE empresas SET limite_usuarios = ?, limite_turmas = ? WHERE id = ?',
        [limU, limT, id]
      );
    } catch (limErr) {
      console.warn('[updateEmpresa] limites não salvos:', limErr.message);
    }

    return res.json({
      ok: true,
      colunas_pendentes: colunasFaltantes.length ? colunasFaltantes : undefined,
    });
  } catch (error) {
    console.error('[admin] updateEmpresa:', error.message);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar empresa',
      error: error.message,
    });
  }
}

/* ─── POST /api/admin/empresas/:id/toggle-ativo ────────────────────────────── */
async function toggleAtivo(req, res) {
  try {
    const { id } = req.params;
    const [[emp]] = await pool.query('SELECT ativo FROM empresas WHERE id = ? LIMIT 1', [id]);
    if (!emp) return res.status(404).json({ ok: false, message: 'Empresa não encontrada' });

    const novoAtivo = emp.ativo ? 0 : 1;
    await pool.query('UPDATE empresas SET ativo = ? WHERE id = ?', [novoAtivo, id]);
    return res.json({ ok: true, ativo: novoAtivo });
  } catch (error) {
    console.error('[admin] toggleAtivo:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao alterar status', error: error.message });
  }
}

/* ─── GET /api/admin/planos ────────────────────────────────────────────────── */
async function listPlanos(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM planos WHERE ativo = 1 ORDER BY limite_usuarios ASC'
    );
    return res.json(rows.length ? rows : PLANOS_PADRAO);
  } catch (_) {
    return res.json(PLANOS_PADRAO);
  }
}

module.exports = {
  getGlobalStats,
  listEmpresas,
  getEmpresa,
  createEmpresa,
  updateEmpresa,
  toggleAtivo,
  deleteEmpresa,
  listPlanos,
};

/* ─── DELETE /api/admin/empresas/:id ──────────────────────────────────────── */
// Remove o tenant E todos os usuários vinculados.
// Segurança: bloqueia deleção se houver dados reais associados em qualquer
// módulo (não só treinamentos) — evita órfãos em Biblioteca, Oceano do
// Desenvolvimento, Certificados e R&S.
async function deleteEmpresa(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const verificacoes = [
      { tabela: 'treinamentos',             label: 'turma(s) cadastrada(s)' },
      { tabela: 'biblioteca',               label: 'material(is) na Biblioteca' },
      { tabela: 'jornadas_desenvolvimento', label: 'registro(s) no Oceano do Desenvolvimento' },
      { tabela: 'certificados',             label: 'certificado(s) emitido(s)' },
      { tabela: 'rps',                      label: 'requisição(ões) de R&S' },
    ];

    for (const { tabela, label } of verificacoes) {
      const total = await contarTabela(tabela, `WHERE empresa_id = ${Number(id)}`);
      if (total > 0) {
        await conn.rollback(); conn.release();
        return res.status(409).json({
          ok: false,
          message: `Esta empresa possui ${total} ${label}. Desative-a em vez de excluir, ou remova esses registros primeiro.`,
        });
      }
    }

    // Remove usuários do tenant
    await conn.query('DELETE FROM usuarios WHERE empresa_id = ?', [id]);

    // Remove a empresa
    await conn.query('DELETE FROM empresas WHERE id = ?', [id]);

    await conn.commit();
    conn.release();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[admin] deleteEmpresa:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao excluir empresa', error: error.message });
  }
}
