/**
 * Sincronia da prova respondida com a nota da turma (19/10/2026).
 *
 * Problema relatado em produção: o treinando respondia a prova no Portal, a
 * resposta ia para `respostas_avaliativas`, mas a aba "Avaliações" da turma, o
 * Dashboard, os Certificados e o desempenho do instrutor leem `avaliacoes.nota_prova`
 * — que só era preenchida pelo lançamento manual ou pela importação de prova em
 * papel. Resultado: a nota "sumia" para quem olhava a turma.
 *
 * Regra desta sincronia:
 *   - A nota oficial da pessoa naquela prova é a MELHOR tentativa
 *     (mesma regra já usada em respostas_avaliativas).
 *   - nota_prova fica na escala 0–10 (percentual ÷ 10), a mesma da importação em
 *     papel — assim prova online, prova em papel e lançamento manual convivem.
 *   - A linha de `avaliacoes` é identificada por turma + título da prova + nome
 *     (sem diferenciar maiúsculas/espaços), exatamente como a importação em
 *     papel faz. Se o instrutor já tinha lançado a linha vazia ("aguardando
 *     correção") com o mesmo título, ela é preenchida em vez de duplicada.
 *   - Funciona para prova montada no Portal (com questões) e também reflete as
 *     tentativas importadas do papel (origem 'papel').
 *
 * Nada aqui lança exceção para o chamador: falha de sincronia não pode impedir
 * o treinando de enviar a prova (a resposta já foi gravada). O erro vai pro log
 * e a migração de reconciliação (ensureCorrecoesAvaliacoes) cobre o que faltar.
 */

const pool = require("./db");

function arredonda2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Recalcula e grava a nota da turma para uma pessoa em um material.
 * @param {{materialId:number, treinamentoId:number, nome:string, pessoaId?:number|null, conn?:object}} p
 * @returns {Promise<{ok:boolean, nota_prova?:number|null, acao?:string, motivo?:string}>}
 */
async function sincronizarNotaProva({ materialId, treinamentoId, nome, pessoaId = null, conn = null }) {
  const db = conn || pool;
  try {
    const nomeLimpo = String(nome || "").trim();
    if (!materialId || !treinamentoId || !nomeLimpo) return { ok: false, motivo: "dados incompletos" };

    const [[material]] = await db.query(
      `SELECT id, titulo, nota_maxima FROM materiais_avaliativos WHERE id = ? LIMIT 1`,
      [materialId]
    );
    if (!material) return { ok: false, motivo: "material não encontrado" };

    // Melhor tentativa da pessoa neste material (pessoa_id quando existe, senão nome).
    const [melhorRows] = await db.query(
      `SELECT MAX(percentual) AS melhor_pct, MAX(nota_final) AS melhor_nota
         FROM respostas_avaliativas
        WHERE material_id = ?
          AND ( ${pessoaId ? "pessoa_id = ? OR (pessoa_id IS NULL AND LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?)))" : "LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?))"} )`,
      pessoaId ? [materialId, pessoaId, nomeLimpo] : [materialId, nomeLimpo]
    );
    const melhor = melhorRows[0] || {};
    if (melhor.melhor_pct === null || melhor.melhor_pct === undefined) {
      // Não sobrou nenhuma resposta (ex.: coordenação excluiu para liberar nova tentativa):
      // limpa só a nota que a própria sincronia tinha gravado; nota lançada à mão fica.
      await db.query(
        `UPDATE avaliacoes SET nota_prova = NULL
          WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?)) AND LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?))
            AND observacoes LIKE 'Prova online%'`,
        [treinamentoId, String(material.titulo || "Prova").trim() || "Prova", nomeLimpo]
      );
      return { ok: true, nota_prova: null, acao: "sem-respostas" };
    }
    const nota10 = Math.min(10, Math.max(0, arredonda2(Number(melhor.melhor_pct) / 10)));

    const [[turma]] = await db.query(`SELECT empresa_id FROM treinamentos WHERE id = ? LIMIT 1`, [treinamentoId]);
    const titulo = String(material.titulo || "Prova").trim() || "Prova";

    const [ex] = await db.query(
      `SELECT id FROM avaliacoes
        WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?)) AND LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?))
        ORDER BY id LIMIT 1`,
      [treinamentoId, titulo, nomeLimpo]
    );
    if (ex.length) {
      await db.query(`UPDATE avaliacoes SET nota_prova = ? WHERE id = ?`, [nota10, ex[0].id]);
      return { ok: true, nota_prova: nota10, acao: "atualizada" };
    }
    await db.query(
      `INSERT INTO avaliacoes (empresa_id, treinamento_id, titulo, treinando_nome, nota_prova, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [turma?.empresa_id || null, treinamentoId, titulo, nomeLimpo, nota10, `Prova online (material #${materialId})`]
    );
    return { ok: true, nota_prova: nota10, acao: "criada" };
  } catch (error) {
    console.error("[sincNotaProva]", error.message || error);
    return { ok: false, motivo: error.message || "erro" };
  }
}

/**
 * Preenche (sem sobrescrever) as notas de provas já respondidas e que ainda não
 * têm linha em `avaliacoes`. Usada pela migração: idempotente e nunca mexe em
 * nota que alguém já lançou ou corrigiu à mão.
 * @returns {Promise<number>} quantas linhas criou
 */
async function reconciliarNotasProvas() {
  const [grupos] = await pool.query(
    `SELECT ra.material_id, ra.treinamento_id,
            MIN(ra.treinando_nome) AS nome, MAX(ra.percentual) AS melhor_pct,
            m.titulo AS titulo, t.empresa_id AS empresa_id
       FROM respostas_avaliativas ra
       JOIN materiais_avaliativos m ON m.id = ra.material_id
       JOIN treinamentos t ON t.id = ra.treinamento_id
      GROUP BY ra.material_id, ra.treinamento_id, LOWER(TRIM(ra.treinando_nome)), m.titulo, t.empresa_id`
  );
  let criadas = 0;
  for (const g of grupos) {
    const nome = String(g.nome || "").trim();
    const titulo = String(g.titulo || "Prova").trim() || "Prova";
    if (!nome || g.melhor_pct === null || g.melhor_pct === undefined) continue;
    const [ex] = await pool.query(
      `SELECT id FROM avaliacoes
        WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?)) AND LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?)) LIMIT 1`,
      [g.treinamento_id, titulo, nome]
    );
    if (ex.length) continue;
    const nota10 = Math.min(10, Math.max(0, arredonda2(Number(g.melhor_pct) / 10)));
    await pool.query(
      `INSERT INTO avaliacoes (empresa_id, treinamento_id, titulo, treinando_nome, nota_prova, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [g.empresa_id || null, g.treinamento_id, titulo, nome, nota10, `Prova online (material #${g.material_id})`]
    );
    criadas += 1;
  }
  return criadas;
}

module.exports = { sincronizarNotaProva, reconciliarNotasProvas };
