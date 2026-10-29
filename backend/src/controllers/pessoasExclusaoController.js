/**
 * pessoasExclusaoController.js — exclusão de cadastro de TESTE (29/10/2026).
 *
 * Contexto: nos testes de inclusão de colaboradores o Ramon criou pessoas
 * fictícias no cadastro único (ex.: "1", matrícula 1111) e não havia tela para
 * apagá-las. Este módulo permite excluir UMA pessoa por vez, depois de ver o
 * impacto, e só quando ela não tem histórico real.
 *
 *  GET    /api/pessoas/:id/impacto-exclusao  → o que seria afetado e se pode excluir
 *  DELETE /api/pessoas/:id                   → exclui (corpo: { confirmar: true, desativar_conta })
 *
 * Travas (a exclusão é recusada se qualquer uma existir):
 *  - presença já lançada em turma, certificado emitido, avaliação/prova respondida;
 *  - vínculo com jornada, coaching, perfil de Metodologia, dados bancários ou Oficina;
 *  - conta de acesso com perfil diferente de "treinando".
 * O que a exclusão faz: tira a pessoa das turmas (linhas pendentes), desativa a
 * conta de treinando (opcional, nunca apaga a conta) e remove o cadastro. Fica
 * registrado na auditoria. Acesso: coordenador, superintendente e super_admin.
 */
const pool = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");

// Cada item é uma contagem de "histórico real" que impede a exclusão.
async function contar(conn, sql, params) {
  try {
    const [[linha]] = await conn.query(sql, params);
    return Number(linha?.n || 0);
  } catch (e) {
    if (e && (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR")) return 0;
    throw e;
  }
}

async function calcularImpacto(conn, pessoaId, empresaId) {
  const [pessoaRows] = await conn.query(
    `SELECT id, nome, matricula, cliente, status_identidade FROM pessoas WHERE id = ? AND empresa_id = ? LIMIT 1`,
    [pessoaId, empresaId]
  );
  const pessoa = pessoaRows[0];
  if (!pessoa) return null;

  const [turmas] = await conn.query(
    `SELECT tp.id AS participante_id, tp.treinamento_id, tp.nome, tp.status_presenca,
            t.tema, t.cliente, t.data_inicio, t.data
       FROM treinamento_participantes tp
       JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.pessoa_id = ? AND t.empresa_id = ?
      ORDER BY tp.id DESC`,
    [pessoaId, empresaId]
  );
  const [contas] = await conn.query(
    `SELECT id, nome, email, perfil, ativo FROM usuarios WHERE pessoa_id = ? AND empresa_id = ?`,
    [pessoaId, empresaId]
  );

  const bloqueios = [];
  const marcar = (n, texto) => { if (n > 0) bloqueios.push(`${texto} (${n})`); };

  marcar(turmas.filter((t) => String(t.status_presenca || "pendente") !== "pendente").length, "presença já lançada em turma");

  let presencasAulas = 0;
  let certificados = 0;
  for (const t of turmas) {
    presencasAulas += await contar(
      conn,
      `SELECT COUNT(*) AS n FROM presenca_aulas WHERE treinamento_id = ? AND treinando_nome = ? AND status <> 'pendente'`,
      [t.treinamento_id, t.nome]
    );
    certificados += await contar(
      conn,
      `SELECT COUNT(*) AS n FROM certificados WHERE treinamento_id = ? AND usuario_nome = ?`,
      [t.treinamento_id, t.nome]
    );
  }
  marcar(presencasAulas, "presença por aula já lançada");
  marcar(certificados, "certificado emitido");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM avaliacoes_treinandos WHERE pessoa_id = ?`, [pessoaId]), "avaliação respondida");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM respostas_avaliativas WHERE pessoa_id = ?`, [pessoaId]), "prova/NPS respondido");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM jornada_participantes WHERE pessoa_id = ?`, [pessoaId]), "vínculo com jornada");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM coaching_individual WHERE pessoa_id = ?`, [pessoaId]), "coaching individual");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM pessoas_metodologia WHERE pessoa_id = ?`, [pessoaId]), "perfil de Metodologia");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM dados_bancarios_colaborador WHERE pessoa_id = ?`, [pessoaId]), "dados bancários");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM oficina_inscricoes WHERE pessoa_id = ?`, [pessoaId]), "inscrição na Oficina de Talentos");
  marcar(await contar(conn, `SELECT COUNT(*) AS n FROM oficina_certificados WHERE pessoa_id = ?`, [pessoaId]), "certificado da Oficina");
  const contasNaoTreinando = contas.filter((c) => String(c.perfil || "").toLowerCase() !== "treinando");
  marcar(contasNaoTreinando.length, "conta de acesso com perfil diferente de treinando");

  return { pessoa, turmas, contas, bloqueios, pode_excluir: bloqueios.length === 0 };
}

async function impacto(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Id inválido." });
    if (!req.empresaId) return res.status(400).json({ ok: false, message: "Empresa não identificada." });
    const r = await calcularImpacto(pool, id, req.empresaId);
    if (!r) return res.status(404).json({ ok: false, message: "Pessoa não encontrada." });
    return res.json({ ok: true, ...r });
  } catch (e) {
    console.error("[pessoas.impacto]", e.message || e);
    return res.status(500).json({ ok: false, message: "Erro ao calcular o impacto da exclusão." });
  }
}

async function excluir(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "Id inválido." });
  if (!req.empresaId) return res.status(400).json({ ok: false, message: "Empresa não identificada." });
  if (req.body?.confirmar !== true) {
    return res.status(400).json({ ok: false, message: "Confirmação ausente. Revise o impacto e confirme a exclusão." });
  }
  const desativarConta = req.body?.desativar_conta !== false;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await calcularImpacto(conn, id, req.empresaId);
    if (!r) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Pessoa não encontrada." });
    }
    if (!r.pode_excluir) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        message: "Esta pessoa tem histórico e não pode ser excluída: " + r.bloqueios.join("; ") + ".",
        bloqueios: r.bloqueios,
      });
    }

    const [delPart] = await conn.query(
      `DELETE FROM treinamento_participantes WHERE pessoa_id = ? AND treinamento_id IN (SELECT id FROM treinamentos WHERE empresa_id = ?)`,
      [id, req.empresaId]
    );
    let contasDesativadas = 0;
    if (r.contas.length) {
      if (desativarConta) {
        const [up] = await conn.query(
          `UPDATE usuarios SET ativo = 0, pessoa_id = NULL WHERE pessoa_id = ? AND empresa_id = ? AND perfil = 'treinando'`,
          [id, req.empresaId]
        );
        contasDesativadas = up.affectedRows;
      }
    }
    // Contas que ficaram (não desativadas) apenas perdem o vínculo (FK SET NULL).
    await conn.query(`DELETE FROM pessoas WHERE id = ? AND empresa_id = ?`, [id, req.empresaId]);
    await conn.commit();

    registrarAuditoria({
      usuario: req.user,
      acao: "excluir",
      entidade: "pessoa",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} excluiu o cadastro de teste "${r.pessoa.nome}" (matrícula ${r.pessoa.matricula || "—"}); ${delPart.affectedRows} turma(s) desvinculada(s), ${contasDesativadas} conta(s) desativada(s)`,
      dadosAntes: { id, nome: r.pessoa.nome, matricula: r.pessoa.matricula, cliente: r.pessoa.cliente, turmas: r.turmas.map((t) => t.treinamento_id), contas: r.contas.map((c) => c.id) },
      ip: req.ip,
    });
    return res.json({ ok: true, turmas_removidas: delPart.affectedRows, contas_desativadas: contasDesativadas });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error("[pessoas.excluir]", e.message || e);
    return res.status(500).json({ ok: false, message: "Erro ao excluir o cadastro." });
  } finally {
    conn.release();
  }
}

module.exports = { impacto, excluir, calcularImpacto };
