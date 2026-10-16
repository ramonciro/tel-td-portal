/**
 * celulaBaby.js — abertura automática da Célula baby (16/10/2026).
 *
 * Célula baby = acompanhamento, pelo próprio instrutor, da curva de
 * aprendizagem dos treinandos que passaram na Avaliação Técnica, nos 7
 * primeiros dias de operação. Abre sozinha quando a turma de Avaliação
 * Técnica é concluída.
 *
 * "Turma concluída": mesma definição do certificado automático
 * (jobs/certificadosAutomaticos.js): status explícito de conclusão OU
 * data_fim já passou, e nunca cancelada.
 *
 * Só olha turmas concluídas nos últimos CELULA_BABY_JANELA_DIAS (padrão 14),
 * para não abrir célula de todo o histórico de turmas antigas.
 *
 * Idempotente (UNIQUE por treinamento_id): pode rodar quantas vezes quiser —
 * é chamado ao abrir a lista de células e pelo job diário.
 */
const pool = require("./db");
const { nomesAvaliacaoTecnica, normalizarChave } = require("./subtipos");

const STATUS_CONCLUIDO = ["concluído", "concluido", "concluída", "concluida", "finalizado", "finalizada"];
const STATUS_CANCELADO = ["cancelado", "cancelada"];

function janelaDias() {
  const n = Number(process.env.CELULA_BABY_JANELA_DIAS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

function turmaConcluida(t, agora = new Date()) {
  const status = String(t.status || "").toLowerCase().trim();
  if (STATUS_CANCELADO.includes(status)) return false;
  if (STATUS_CONCLUIDO.includes(status)) return true;
  const fim = t.data_fim || null;
  return !!(fim && new Date(fim) < agora);
}

/** Abre as células que faltam. Devolve quantas foram criadas. */
async function sincronizarCelulas(empresaId) {
  const { nomes } = await nomesAvaliacaoTecnica();
  const chaves = new Set(nomes.map((n) => normalizarChave(n)));
  const condEmpresa = empresaId ? " AND t.empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];

  const [turmas] = await pool.query(
    `SELECT t.id, t.empresa_id, t.tema, t.turma, t.cliente, t.instrutor, t.subtipo, t.status,
            COALESCE(t.data_fim, t.data_inicio, t.data) AS ref_fim, t.data_fim
       FROM treinamentos t
      WHERE t.subtipo IS NOT NULL AND TRIM(t.subtipo) <> ''${condEmpresa}
        AND NOT EXISTS (SELECT 1 FROM celulas_baby c WHERE c.treinamento_id = t.id)`,
    params
  );

  const limite = new Date(Date.now() - janelaDias() * 24 * 3600 * 1000);
  let criadas = 0;

  for (const t of turmas) {
    if (!chaves.has(normalizarChave(t.subtipo))) continue;
    if (!turmaConcluida(t)) continue;
    if (t.ref_fim && new Date(t.ref_fim) < limite) continue;

    const [participantes] = await pool.query(
      `SELECT id, nome, matricula, pessoa_id FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome ASC`,
      [t.id]
    );
    if (!participantes.length) continue;

    const nomeTurma = [t.tema, t.turma].filter(Boolean).join(" — ") || `Turma ${t.id}`;
    const [r] = await pool.query(
      `INSERT IGNORE INTO celulas_baby (empresa_id, treinamento_id, cliente, turma_nome, instrutor, status)
       VALUES (?, ?, ?, ?, ?, 'a_configurar')`,
      [t.empresa_id || null, t.id, t.cliente || null, nomeTurma, t.instrutor || null]
    );
    if (!r.insertId) continue; // outra execução abriu primeiro

    for (const p of participantes) {
      await pool.query(
        `INSERT IGNORE INTO celula_baby_pessoas (celula_id, participante_id, pessoa_id, nome, matricula)
         VALUES (?, ?, ?, ?, ?)`,
        [r.insertId, p.id, p.pessoa_id || null, p.nome, p.matricula || null]
      );
    }
    // Resultado já definido na avaliação individual (Rotina do instrutor).
    try {
      await pool.query(
        `UPDATE celula_baby_pessoas cp
           JOIN rotina_avaliacao_individual a ON a.treinamento_id = ? AND a.participante_id = cp.participante_id
            SET cp.resultado = a.resultado
          WHERE cp.celula_id = ? AND a.resultado IS NOT NULL`,
        [t.id, r.insertId]
      );
    } catch (e) {
      if (!(e && e.code === "ER_NO_SUCH_TABLE")) console.error("[celulaBaby] resultado da avaliação:", e.message || e);
    }
    criadas += 1;
  }
  return criadas;
}

module.exports = { sincronizarCelulas, turmaConcluida };
