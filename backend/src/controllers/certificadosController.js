/**
 * certificadosController.js — Sprint 3
 *
 * Emissão e listagem de certificados de conclusão de turma.
 *
 * Regra de elegibilidade (padrão):
 *   - Frequência ≥ 75% (quando registros de presença existem)
 *   - Se não há avaliação cadastrada, emite mesmo sem nota
 *
 * Endpoints:
 *   GET  /api/certificados                      → listCertificados
 *   GET  /api/certificados/preview              → previewCertificado (não grava — só calcula)
 *   POST /api/certificados/emitir               → emitirCertificado
 *   GET  /api/certificados/verificar            → verificarCertificado
 */

const pool = require('../lib/db');

/* ─── LIST ─────────────────────────────────────────────────────────────────── */
async function listCertificados(req, res) {
  try {
    const perfil    = String(req.user?.perfil || '').toLowerCase().trim();
    const empresaId = req.empresaId ?? null;
    const userEmail = req.user?.email;

    const where  = [];
    const params = [];

    // Treinandos e instrutores veem apenas os próprios certificados
    const isGestor = ['coordenador', 'supervisor', 'superintendente'].includes(perfil);
    if (!isGestor) {
      where.push('usuario_email = ?');
      params.push(userEmail);
    }

    if (empresaId !== null) {
      where.push('empresa_id = ?');
      params.push(empresaId);
    }

    let query = 'SELECT * FROM certificados';
    if (where.length) query += ` WHERE ${where.join(' AND ')}`;
    query += ' ORDER BY emitido_em DESC';

    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (error) {
    console.error('[certificados] listCertificados:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao listar certificados', error: error.message });
  }
}

/* ─── ELEGIBILIDADE (compartilhado entre preview e emissão) ─────────────────── */
// Calcula frequência e nota de um participante numa turma, sem gravar nada.
// Usado tanto pelo preview (coordenador confere antes de emitir) quanto pela
// emissão de fato — assim os dois nunca podem divergir no cálculo.
async function calcularElegibilidade(treinamento_id, nome, empresaId) {
  const tenantCheckTr = empresaId ? ' AND empresa_id = ?' : '';
  const trParams = empresaId ? [treinamento_id, empresaId] : [treinamento_id];
  const [trRows] = await pool.query(
    `SELECT tema, cliente, carga_horaria FROM treinamentos WHERE id = ?${tenantCheckTr} LIMIT 1`,
    trParams
  );
  if (!trRows.length) return null;
  const tr = trRows[0];

  // Calcula frequência com base em presencas legado (por nome)
  const [presRows] = await pool.query(
    `SELECT
       COUNT(*)                                                       AS total,
       SUM(CASE WHEN LOWER(TRIM(status)) = 'presente' THEN 1 ELSE 0 END) AS presentes
     FROM presencas
     WHERE treinamento_id = ? AND treinando_nome = ?`,
    [treinamento_id, nome]
  );
  const total    = Number(presRows[0]?.total    || 0);
  const presentes = Number(presRows[0]?.presentes || 0);
  const freq = total > 0 ? Number(((presentes / total) * 100).toFixed(1)) : null;

  // Também tenta via presenca_aulas (sistema de chamada por aula)
  let freqFinal = freq;
  if (freq === null) {
    const [paRows] = await pool.query(
      `SELECT
         COUNT(*)                                                          AS total,
         SUM(CASE WHEN LOWER(TRIM(pa.status)) = 'presente' THEN 1 ELSE 0 END) AS presentes
       FROM presenca_aulas pa
       JOIN turma_aulas ta ON ta.id = pa.turma_aula_id
       WHERE ta.treinamento_id = ? AND pa.treinando_nome = ?`,
      [treinamento_id, nome]
    );
    const paTotal    = Number(paRows[0]?.total    || 0);
    const paPresentes = Number(paRows[0]?.presentes || 0);
    freqFinal = paTotal > 0 ? Number(((paPresentes / paTotal) * 100).toFixed(1)) : null;
  }

  // Busca nota final (prova > qualidade)
  const [avRows] = await pool.query(
    `SELECT
       AVG(nota_prova)     AS media_prova,
       AVG(nota_qualidade) AS media_qualidade
     FROM avaliacoes
     WHERE treinamento_id = ? AND treinando_nome = ?`,
    [treinamento_id, nome]
  );
  const mediaProva = avRows[0]?.media_prova     ? Number(Number(avRows[0].media_prova).toFixed(1))     : null;
  const mediaQual  = avRows[0]?.media_qualidade ? Number(Number(avRows[0].media_qualidade).toFixed(1)) : null;
  const nota = mediaProva ?? mediaQual ?? null;

  return { tr, freqFinal, nota };
}

const FREQUENCIA_MINIMA = 75;

/* ─── PREVIEW (não grava nada) ───────────────────────────────────────────────── */
// GET /api/certificados/preview?treinamento_id=X&nome=Y
// Deixa o coordenador ver frequência/nota calculadas ANTES de confirmar a
// emissão — hoje ele só descobre esse número depois que o certificado já
// foi emitido.
async function previewCertificado(req, res) {
  try {
    const { treinamento_id, nome } = req.query || {};
    if (!treinamento_id || !nome) {
      return res.status(400).json({ ok: false, message: 'Informe treinamento_id e nome.' });
    }

    const empresaId = req.empresaId ?? null;
    const resultado = await calcularElegibilidade(treinamento_id, nome, empresaId);
    if (!resultado) {
      return res.status(404).json({ ok: false, message: 'Treinamento não encontrado' });
    }
    const { tr, freqFinal, nota } = resultado;

    return res.json({
      ok: true,
      treinamento_tema: tr.tema,
      treinamento_cliente: tr.cliente,
      carga_horaria: tr.carga_horaria,
      frequencia_percentual: freqFinal,
      nota_final: nota,
      abaixo_do_minimo: freqFinal != null && freqFinal < FREQUENCIA_MINIMA,
      frequencia_minima: FREQUENCIA_MINIMA,
      sem_registros: freqFinal == null,
    });
  } catch (error) {
    console.error('[certificados] previewCertificado:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao calcular elegibilidade', error: error.message });
  }
}

/* ─── EMITIR ────────────────────────────────────────────────────────────────── */
// Body: { usuario_nome?, usuario_email?, treinamento_id }
// Se não informados, usa dados do usuário logado (req.user)
async function emitirCertificado(req, res) {
  try {
    const { treinamento_id, usuario_nome, usuario_email } = req.body || {};

    if (!treinamento_id) {
      return res.status(400).json({ ok: false, message: 'treinamento_id é obrigatório' });
    }

    // Bugfix: "?? 1" mis-atribuía TODO certificado emitido por super_admin ou
    // usuário legado (empresaId nulo) à empresa de id 1 — em vez de manter
    // null (sem tenant), como o resto do sistema faz. Também abria brecha
    // para outro tenant "herdar" certificados da empresa 1 por engano.
    const empresaId = req.empresaId ?? null;
    const nome  = usuario_nome  || req.user?.nome  || '';
    const email = usuario_email || req.user?.email || null;

    // Busca dados do treinamento + calcula frequência/nota (mesma lógica do preview)
    const resultado = await calcularElegibilidade(treinamento_id, nome, empresaId);
    if (!resultado) {
      return res.status(404).json({ ok: false, message: 'Treinamento não encontrado' });
    }
    const { tr, freqFinal, nota } = resultado;

    // Emite (upsert — emitir de novo atualiza frequência e nota)
    const [result] = await pool.query(
      `INSERT INTO certificados
         (usuario_nome, usuario_email, treinamento_id, treinamento_tema,
          treinamento_cliente, frequencia_percentual, nota_final, carga_horaria, empresa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         frequencia_percentual = VALUES(frequencia_percentual),
         nota_final            = VALUES(nota_final),
         emitido_em            = CURRENT_TIMESTAMP`,
      [nome, email, treinamento_id, tr.tema, tr.cliente, freqFinal, nota, tr.carga_horaria, empresaId]
    );

    const certId = result.insertId || null;

    return res.status(201).json({
      ok: true,
      certificado: {
        id:                    certId,
        usuario_nome:          nome,
        usuario_email:         email,
        treinamento_id,
        treinamento_tema:      tr.tema,
        treinamento_cliente:   tr.cliente,
        carga_horaria:         tr.carga_horaria,
        frequencia_percentual: freqFinal,
        nota_final:            nota,
        emitido_em:            new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[certificados] emitirCertificado:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao emitir certificado', error: error.message });
  }
}

/* ─── VERIFICAR ─────────────────────────────────────────────────────────────── */
// GET /api/certificados/verificar?treinamento_id=X&email=Y
async function verificarCertificado(req, res) {
  try {
    const { treinamento_id, email } = req.query;
    const userEmail = email || req.user?.email;

    if (!treinamento_id || !userEmail) {
      return res.status(400).json({ ok: false, message: 'Parâmetros insuficientes' });
    }

    const tenantCheck = req.empresaId ? ' AND empresa_id = ?' : '';
    const params = req.empresaId ? [treinamento_id, userEmail, req.empresaId] : [treinamento_id, userEmail];
    const [rows] = await pool.query(
      `SELECT * FROM certificados WHERE treinamento_id = ? AND usuario_email = ?${tenantCheck} LIMIT 1`,
      params
    );

    return res.json({ ok: true, certificado: rows[0] || null });
  } catch (error) {
    console.error('[certificados] verificarCertificado:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao verificar certificado', error: error.message });
  }
}

module.exports = { listCertificados, emitirCertificado, verificarCertificado, previewCertificado };
