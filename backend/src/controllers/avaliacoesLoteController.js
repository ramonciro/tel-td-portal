/**
 * Lançamento de avaliação para a turma inteira (19/10/2026).
 *
 * Ramon testou em produção: para provas incluídas como PDF (sem questões no
 * Portal) a nota precisa entrar pelo instrutor, e lançar nome por nome na
 * aba Avaliações da turma não é prático. Esta rota cria, de uma vez, a linha
 * "aguardando correção" (nota vazia) de cada participante da turma com o título
 * informado — quem já tem linha com o mesmo título é ignorado. Depois o
 * instrutor só digita as notas (ou usa a importação em papel/planilha, que
 * casa pelo mesmo título).
 *
 * POST /api/avaliacoes-lote  { treinamento_id, titulo }
 */

const pool = require("../lib/db");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const { registrarAuditoria } = require("../services/auditoria");

async function lancarAvaliacaoParaTurma(req, res) {
  try {
    const treinamentoId = Number(req.body?.treinamento_id);
    const titulo = String(req.body?.titulo || "").trim();
    if (!treinamentoId || !titulo) {
      return res.status(400).json({ ok: false, message: "Informe a turma e o título da avaliação." });
    }
    if (titulo.length > 200) {
      return res.status(400).json({ ok: false, message: "O título pode ter no máximo 200 caracteres." });
    }

    const [turmas] = await pool.query(
      `SELECT id, tema, cliente, empresa_id FROM treinamentos WHERE id = ?${req.empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
      req.empresaId ? [treinamentoId, req.empresaId] : [treinamentoId]
    );
    const turma = turmas[0];
    if (!turma || !usuarioTemAcessoAoCliente(req, turma.cliente)) {
      return res.status(404).json({ ok: false, message: "Turma não encontrada." });
    }

    const [participantes] = await pool.query(
      `SELECT DISTINCT TRIM(nome) AS nome FROM treinamento_participantes WHERE treinamento_id = ? AND nome IS NOT NULL AND TRIM(nome) <> ''`,
      [treinamentoId]
    );
    if (!participantes.length) {
      return res.status(400).json({ ok: false, message: "Esta turma ainda não tem participantes." });
    }

    const [jaTem] = await pool.query(
      `SELECT LOWER(TRIM(treinando_nome)) AS chave FROM avaliacoes WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?))`,
      [treinamentoId, titulo]
    );
    const existentes = new Set(jaTem.map((r) => r.chave));

    let criadas = 0;
    for (const p of participantes) {
      if (existentes.has(String(p.nome).toLowerCase())) continue;
      existentes.add(String(p.nome).toLowerCase());
      await pool.query(
        `INSERT INTO avaliacoes (empresa_id, treinamento_id, titulo, treinando_nome) VALUES (?, ?, ?, ?)`,
        [turma.empresa_id || null, treinamentoId, titulo, p.nome]
      );
      criadas += 1;
    }

    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "avaliacao", entidadeId: treinamentoId,
      resumo: `${req.user?.nome || "Alguém"} lançou a avaliação “${titulo}” para a turma ${turma.tema} (${criadas} treinando(s))`,
      dadosDepois: { treinamento_id: treinamentoId, titulo, criadas }, ip: req.ip,
    });

    return res.status(201).json({
      ok: true,
      criadas,
      ja_existiam: participantes.length - criadas,
      message: criadas
        ? `Avaliação “${titulo}” lançada para ${criadas} treinando(s). Agora é só digitar as notas.`
        : "Todos os participantes já tinham essa avaliação lançada.",
    });
  } catch (error) {
    console.error("[avaliacoesLote]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao lançar a avaliação para a turma." });
  }
}

module.exports = { lancarAvaliacaoParaTurma };
