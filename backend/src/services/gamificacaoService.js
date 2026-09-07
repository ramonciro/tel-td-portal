/**
 * gamificacaoService.js
 *
 * Fase 3 do roadmap de competitividade ("lacuna de diferenciação") —
 * gamificação de treinando e de instrutor. Sem IA, sem custo: são regras
 * fixas calculadas em cima de dados que o portal já registra no fluxo
 * normal (presença, certificado, trilha, scorecard de instrutor).
 *
 * Uma única tabela "conquistas" (ver migrate.js) serve os dois tipos de
 * entidade — entidade_tipo 'treinando' ou 'instrutor'. entidade_nome é
 * sempre o NOME da pessoa (não e-mail nem id), para casar com o padrão de
 * identidade já usado em todo o resto do portal (treinando_nome em
 * presencas/certificados, instrutor_responsavel em turma_aulas — nunca há
 * FK de verdade para usuarios).
 *
 * Calculado por um job diário (jobs/conquistasJob.js) — nunca em tempo
 * real a cada carregamento de tela. INSERT IGNORE + UNIQUE
 * (entidade_tipo, entidade_nome, tipo, contexto) torna tudo idempotente:
 * rodar de novo não duplica conquistas já concedidas.
 */

const pool = require("../lib/db");

const STATUS_CONCLUIDA = ["concluído", "concluido", "concluída", "concluida"];
const MARCOS_TURMAS = [3, 5, 10];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function condEmpresaTreinamentos(empresaId, alias = "t") {
  return empresaId ? `AND ${alias}.empresa_id = ?` : `AND ${alias}.empresa_id IS NULL`;
}

async function registrarConquista({ empresaId, entidadeTipo, entidadeNome, tipo, titulo, descricao, contexto, conquistadoEm }) {
  const nome = String(entidadeNome || "").trim();
  if (!nome) return;
  try {
    await pool.query(
      `INSERT IGNORE INTO conquistas
        (empresa_id, entidade_tipo, entidade_nome, tipo, titulo, descricao, contexto, conquistado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [empresaId || null, entidadeTipo, nome, tipo, titulo, descricao || null, contexto, conquistadoEm || hoje()]
    );
  } catch (error) {
    console.error(`[gamificacao] Erro ao registrar conquista (${entidadeTipo}/${tipo}):`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Treinando
// ---------------------------------------------------------------------------

/** 1) Presença perfeita — 100% de presença numa turma já concluída. */
async function calcularPresencaPerfeita(empresaId) {
  const params = empresaId ? [empresaId, empresaId] : [];
  const [linhas] = await pool.query(
    `
    SELECT nome, treinamento_id, tema, data_fim, dias, presentes
    FROM (
      SELECT p.treinando_nome AS nome, t.id AS treinamento_id, t.tema, t.data_fim,
             COUNT(*) AS dias, SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      WHERE LOWER(t.status) IN ('concluído','concluido','concluída','concluida') ${condEmpresaTreinamentos(empresaId)}
      GROUP BY p.treinando_nome, t.id, t.tema, t.data_fim

      UNION ALL

      SELECT pa.treinando_nome AS nome, t.id AS treinamento_id, t.tema, t.data_fim,
             COUNT(*) AS dias, SUM(CASE WHEN pa.status = 'presente' THEN 1 ELSE 0 END) AS presentes
      FROM presenca_aulas pa
      INNER JOIN treinamentos t ON t.id = pa.treinamento_id
      WHERE LOWER(t.status) IN ('concluído','concluido','concluída','concluida') ${condEmpresaTreinamentos(empresaId)}
      GROUP BY pa.treinando_nome, t.id, t.tema, t.data_fim
    ) fontes
    WHERE nome IS NOT NULL AND TRIM(nome) <> ''
    GROUP BY nome, treinamento_id, tema, data_fim
    HAVING SUM(dias) > 0 AND SUM(presentes) = SUM(dias)
    `,
    params
  );

  for (const item of linhas) {
    await registrarConquista({
      empresaId,
      entidadeTipo: "treinando",
      entidadeNome: item.nome,
      tipo: "presenca_perfeita",
      titulo: "Presença perfeita",
      descricao: `100% de presença na turma "${item.tema}".`,
      contexto: `turma:${item.treinamento_id}`,
      conquistadoEm: item.data_fim ? new Date(item.data_fim).toISOString().slice(0, 10) : hoje(),
    });
  }
  return linhas.length;
}

/** 2) Trilha concluída — 100% das etapas da trilha marcadas como concluídas. */
async function calcularTrilhaConcluida(empresaId) {
  const condEmpresa = empresaId ? "AND tp.empresa_id = ?" : "AND tp.empresa_id IS NULL";
  const params = empresaId ? [empresaId] : [];
  const [linhas] = await pool.query(
    `
    SELECT tp.usuario_email, tp.trilha_id, tr.titulo,
           (SELECT COUNT(*) FROM trilha_etapas te WHERE te.trilha_id = tp.trilha_id) AS total_etapas,
           SUM(tp.concluido) AS concluidas,
           MAX(tp.concluido_em) AS concluido_em
    FROM trilha_progresso tp
    INNER JOIN trilhas_aprendizagem tr ON tr.id = tp.trilha_id
    WHERE 1=1 ${condEmpresa}
    GROUP BY tp.usuario_email, tp.trilha_id, tr.titulo
    HAVING total_etapas > 0 AND concluidas = total_etapas
    `,
    params
  );

  if (!linhas.length) return 0;

  const [usuarios] = await pool.query("SELECT nome, email FROM usuarios");
  const nomePorEmail = new Map(usuarios.map((u) => [String(u.email || "").trim().toLowerCase(), u.nome]));

  for (const item of linhas) {
    const nome = nomePorEmail.get(String(item.usuario_email || "").trim().toLowerCase()) || item.usuario_email;
    await registrarConquista({
      empresaId,
      entidadeTipo: "treinando",
      entidadeNome: nome,
      tipo: "trilha_concluida",
      titulo: "Trilha concluída",
      descricao: `Concluiu todas as etapas da trilha "${item.titulo}".`,
      contexto: `trilha:${item.trilha_id}`,
      conquistadoEm: item.concluido_em ? new Date(item.concluido_em).toISOString().slice(0, 10) : hoje(),
    });
  }
  return linhas.length;
}

/** 3) Primeira certificação — o primeiro certificado emitido para a pessoa. */
async function calcularPrimeiraCertificacao(empresaId) {
  const condEmpresa = empresaId ? "AND empresa_id = ?" : "AND empresa_id IS NULL";
  const params = empresaId ? [empresaId] : [];
  const [linhas] = await pool.query(
    `
    SELECT usuario_nome, MIN(emitido_em) AS primeira_emissao
    FROM certificados
    WHERE usuario_nome IS NOT NULL AND TRIM(usuario_nome) <> '' ${condEmpresa}
    GROUP BY usuario_nome
    `,
    params
  );

  for (const item of linhas) {
    await registrarConquista({
      empresaId,
      entidadeTipo: "treinando",
      entidadeNome: item.usuario_nome,
      tipo: "primeira_certificacao",
      titulo: "Primeira certificação",
      descricao: "Emitiu seu primeiro certificado de conclusão no Portal T&D.",
      contexto: "unico",
      conquistadoEm: item.primeira_emissao ? new Date(item.primeira_emissao).toISOString().slice(0, 10) : hoje(),
    });
  }
  return linhas.length;
}

/** 4) Sequência de turmas — marcos de 3 / 5 / 10 turmas concluídas (participação registrada). */
async function calcularSequenciaTurmas(empresaId) {
  const params = empresaId ? [empresaId, empresaId] : [];
  const [linhas] = await pool.query(
    `
    SELECT nome, COUNT(DISTINCT treinamento_id) AS total_turmas
    FROM (
      SELECT p.treinando_nome AS nome, t.id AS treinamento_id
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      WHERE LOWER(t.status) IN ('concluído','concluido','concluída','concluida') ${condEmpresaTreinamentos(empresaId)}

      UNION

      SELECT pa.treinando_nome AS nome, t.id AS treinamento_id
      FROM presenca_aulas pa
      INNER JOIN treinamentos t ON t.id = pa.treinamento_id
      WHERE LOWER(t.status) IN ('concluído','concluido','concluída','concluida') ${condEmpresaTreinamentos(empresaId)}
    ) fontes
    WHERE nome IS NOT NULL AND TRIM(nome) <> ''
    GROUP BY nome
    `,
    params
  );

  let total = 0;
  for (const item of linhas) {
    for (const marco of MARCOS_TURMAS) {
      if (item.total_turmas >= marco) {
        // eslint-disable-next-line no-await-in-loop
        await registrarConquista({
          empresaId,
          entidadeTipo: "treinando",
          entidadeNome: item.nome,
          tipo: "sequencia_turmas",
          titulo: `${marco} turmas concluídas`,
          descricao: `Participou de ${marco} ou mais turmas concluídas no Portal T&D.`,
          contexto: `marco:${marco}`,
          conquistadoEm: hoje(),
        });
        total += 1;
      }
    }
  }
  return total;
}

async function calcularConquistasTreinandos(empresaId) {
  const [presenca, trilha, certificacao, sequencia] = await Promise.all([
    calcularPresencaPerfeita(empresaId).catch((e) => { console.error("[gamificacao] presenca_perfeita:", e.message); return 0; }),
    calcularTrilhaConcluida(empresaId).catch((e) => { console.error("[gamificacao] trilha_concluida:", e.message); return 0; }),
    calcularPrimeiraCertificacao(empresaId).catch((e) => { console.error("[gamificacao] primeira_certificacao:", e.message); return 0; }),
    calcularSequenciaTurmas(empresaId).catch((e) => { console.error("[gamificacao] sequencia_turmas:", e.message); return 0; }),
  ]);
  return { presenca, trilha, certificacao, sequencia };
}

/** Lista as conquistas de um treinando específico, mais recentes primeiro. */
async function listarConquistasTreinando(empresaId, nomeTreinando) {
  const condEmpresa = empresaId ? "AND empresa_id = ?" : "AND empresa_id IS NULL";
  const params = empresaId ? [empresaId, nomeTreinando] : [nomeTreinando];
  const [rows] = await pool.query(
    `SELECT tipo, titulo, descricao, contexto, conquistado_em
     FROM conquistas
     WHERE entidade_tipo = 'treinando' ${condEmpresa} AND LOWER(TRIM(entidade_nome)) = LOWER(TRIM(?))
     ORDER BY conquistado_em DESC, id DESC`,
    params
  );
  return rows;
}

module.exports = {
  calcularConquistasTreinandos,
  listarConquistasTreinando,
  registrarConquista,
};
