// eliminacaoFaltasService.js
//
// Regra (Ramon, 24/11/2026): na Avaliação Técnica, quem chega a 3 faltas é eliminado do processo seletivo.
// Falta justificada conta como falta (mesma regra do resto da turma). A eliminação:
//   1) vira desistência automática (sai da chamada e dos cálculos), com o motivo "Eliminado por faltas (N faltas)"
//      e registrada por "Sistema" — é reversível pelo botão de desfazer desistência;
//   2) aparece na Avaliação individual já como "Reprovado", sem exigir notas, com observação automática.
// Se a coordenação desfizer a eliminação, a pessoa não é eliminada de novo (eliminacao_faltas_revertida = 1).

const pool = require("../lib/db");
const { ehSubtipoAvaliacaoTecnica } = require("../lib/subtipos");
const { registrarAuditoria } = require("./auditoria");

const LIMITE_FALTAS = 3;
const MOTIVO_PREFIXO = "Eliminado por faltas";

const motivoEliminacao = (n) => `${MOTIVO_PREFIXO} (${n} faltas)`;
const ehMotivoEliminacao = (m) => String(m || "").startsWith(MOTIVO_PREFIXO);

// Fragmento SQL: participante eliminado por faltas (alias da tabela treinamento_participantes).
function sqlEliminadoPorFaltas(a = "p") {
  return `(${a}.desistencia_em IS NOT NULL AND ${a}.desistencia_motivo LIKE '${MOTIVO_PREFIXO}%')`;
}

// Varre a turma e elimina quem chegou ao limite. Idempotente; nunca derruba a operação que chamou.
async function aplicarEliminacaoPorFaltas(treinamentoId) {
  try {
    const [[t]] = await pool.query("SELECT id, subtipo, empresa_id FROM treinamentos WHERE id = ? LIMIT 1", [treinamentoId]);
    if (!t || !(await ehSubtipoAvaliacaoTecnica(t.subtipo))) return { eliminados: [] };

    const [cand] = await pool.query(
      `SELECT tp.id, tp.nome, COUNT(DISTINCT pa.turma_aula_id) AS faltas, MAX(pa.data_aula) AS ultima
         FROM treinamento_participantes tp
         JOIN presenca_aulas pa ON pa.treinamento_id = tp.treinamento_id AND pa.treinando_nome = tp.nome
                               AND pa.status IN ('ausente','justificado')
         JOIN turma_aulas ta ON ta.id = pa.turma_aula_id AND LOWER(TRIM(COALESCE(ta.status_execucao,''))) <> 'cancelada'
        WHERE tp.treinamento_id = ? AND tp.desistencia_em IS NULL AND COALESCE(tp.eliminacao_faltas_revertida, 0) = 0
        GROUP BY tp.id, tp.nome
       HAVING faltas >= ?`,
      [treinamentoId, LIMITE_FALTAS]
    );
    const eliminados = [];
    for (const c of cand) {
      const n = Number(c.faltas);
      const motivo = motivoEliminacao(n);
      const [r] = await pool.query(
        `UPDATE treinamento_participantes
            SET desistencia_em = NOW(), desistencia_data = ?, desistencia_motivo = ?, desistencia_por = 'Sistema'
          WHERE id = ? AND desistencia_em IS NULL`,
        [c.ultima, motivo, c.id]
      );
      if (!r.affectedRows) continue;
      eliminados.push({ id: c.id, nome: c.nome, faltas: n });
      registrarAuditoria({
        usuario: { nome: "Sistema" }, acao: "eliminacao_faltas", entidade: "treinamento_participante", entidadeId: c.id,
        resumo: `${c.nome} foi eliminado(a) automaticamente da turma ${treinamentoId} por ${n} faltas (limite ${LIMITE_FALTAS}).`,
      });
    }
    if (eliminados.length) {
      await pool.query(
        "UPDATE treinamentos SET participantes = (SELECT COUNT(*) FROM treinamento_participantes WHERE treinamento_id = ? AND desistencia_em IS NULL) WHERE id = ?",
        [treinamentoId, treinamentoId]
      );
    }
    // Garante o "Reprovado" automático na avaliação individual de todos os eliminados por faltas (inclusive os antigos).
    const [elim] = await pool.query(
      `SELECT p.id, p.nome, p.desistencia_motivo FROM treinamento_participantes p
        WHERE p.treinamento_id = ? AND ${sqlEliminadoPorFaltas("p")}`,
      [treinamentoId]
    );
    for (const e of elim) {
      await pool.query(
        `INSERT INTO rotina_avaliacao_individual (empresa_id, treinamento_id, participante_id, resultado, observacao, atualizado_por)
         VALUES (?,?,?,?,?, 'Sistema')
         ON DUPLICATE KEY UPDATE
           resultado = IF(resultado = 'nao_seguiu', resultado, 'nao_seguiu'),
           observacao = IF(observacao IS NULL OR TRIM(observacao) = '', VALUES(observacao), observacao)`,
        [t.empresa_id || null, treinamentoId, e.id, "nao_seguiu", e.desistencia_motivo]
      );
    }
    return { eliminados };
  } catch (e) {
    console.error("[eliminacaoFaltas]", e.message || e);
    return { eliminados: [] };
  }
}

module.exports = { LIMITE_FALTAS, MOTIVO_PREFIXO, ehMotivoEliminacao, sqlEliminadoPorFaltas, aplicarEliminacaoPorFaltas };
