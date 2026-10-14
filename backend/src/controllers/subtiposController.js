/**
 * subtiposController.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT,
 * ajuste pós-entrega (15/09/2026)
 *
 * CRUD do catálogo de subtipo/subdivisão (ver lib/subtipos.js para a
 * validação em si). Ramon pediu para poder editar essa lista sem depender
 * de código novo — o padrão aqui espelha salasController.js de propósito
 * (mesmo tipo de catálogo global, mesma filosofia de "desativar em vez de
 * excluir" para não invalidar histórico de turma/ação já classificada).
 *
 * Sem hard delete: um subtipo que já foi usado em treinamentos.subtipo ou
 * acoes_desenvolvimento.subtipo não pode desaparecer do banco (quebraria a
 * leitura desses registros) — "excluir" aqui é sempre desativação, igual a
 * salas.
 */
const pool = require("../lib/db");
const { listarSubtipos, normalizarChave } = require("../lib/subtipos");

// Ajuste 15/10/2026: renomear um subtipo agora acompanha as turmas e ações que
// já o usam (o texto é gravado nelas), e o item "de sistema" (usado pelo
// Reembolso de Transporte) não pode ser desativado.
const MSG_SISTEMA =
  "Este subtipo é usado pelo Reembolso de Transporte e não pode ser desativado. Você pode renomeá-lo livremente.";

async function contarUso(conn, nome) {
  const [[t]] = await conn.query(`SELECT COUNT(*) AS n FROM treinamentos WHERE subtipo = ?`, [nome]);
  const [[a]] = await conn.query(`SELECT COUNT(*) AS n FROM acoes_desenvolvimento WHERE subtipo = ?`, [nome]);
  return { turmas: Number(t.n) || 0, acoes: Number(a.n) || 0 };
}

async function buscarPorId(id) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, ativo, chave_sistema FROM subtipos WHERE id = ? LIMIT 1`, [id]);
    return rows[0] || null;
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const [rows] = await pool.query(`SELECT id, nome, ativo FROM subtipos WHERE id = ? LIMIT 1`, [id]);
      return rows[0] ? { ...rows[0], chave_sistema: null } : null;
    }
    throw error;
  }
}

async function listar(req, res) {
  try {
    const incluirInativos = String(req.query?.incluir_inativos || "") === "1";
    const rows = await listarSubtipos({ incluirInativos, comUso: incluirInativos });
    return res.json(rows);
  } catch (error) {
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao listar subtipos" });
  }
}

async function criar(req, res) {
  try {
    const nome = String(req.body?.nome || "").trim();
    if (!nome) {
      return res.status(400).json({ ok: false, message: "Informe o nome do subtipo" });
    }

    // Checagem case/acento-insensível antes do INSERT: a coluna já tem
    // UNIQUE KEY em `nome` (bate exato), mas isso sozinho deixaria passar
    // "avaliação técnica" e "Avaliação Técnica" como duas linhas diferentes,
    // exatamente o tipo de duplicidade que essa tabela existe para evitar.
    const existentes = await listarSubtipos({ incluirInativos: true });
    const chave = normalizarChave(nome);
    if (existentes.some((s) => normalizarChave(s.nome) === chave)) {
      return res.status(409).json({ ok: false, message: "Já existe um subtipo com esse nome" });
    }

    const [result] = await pool.query(`INSERT INTO subtipos (nome, ativo) VALUES (?, 1)`, [nome]);
    return res.status(201).json({ ok: true, id: result.insertId, message: "Subtipo criado com sucesso" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Já existe um subtipo com esse nome" });
    }
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao criar subtipo" });
  }
}

async function atualizar(req, res) {
  let conn = null;
  try {
    const { id } = req.params;
    const { nome, ativo } = req.body || {};

    const atual = await buscarPorId(id);
    if (!atual) {
      return res.status(404).json({ ok: false, message: "Subtipo não encontrado" });
    }

    let nomeNovo = null;
    if (nome !== undefined) {
      nomeNovo = String(nome).trim();
      if (!nomeNovo) {
        return res.status(400).json({ ok: false, message: "O nome não pode ficar vazio" });
      }
    }
    if (ativo !== undefined && !ativo && atual.chave_sistema) {
      return res.status(409).json({ ok: false, message: MSG_SISTEMA });
    }

    const renomeia = nomeNovo !== null && nomeNovo !== atual.nome;
    if (renomeia) {
      // Duplicidade case/acento-insensível, ignorando o próprio registro
      // (permite só trocar maiúscula/acento do mesmo item).
      const todos = await listarSubtipos({ incluirInativos: true });
      const chave = normalizarChave(nomeNovo);
      if (todos.some((s) => Number(s.id) !== Number(atual.id) && normalizarChave(s.nome) === chave)) {
        return res.status(409).json({ ok: false, message: "Já existe um subtipo com esse nome" });
      }
    }

    const campos = [];
    const valores = [];
    if (nomeNovo !== null) { campos.push("nome = ?"); valores.push(nomeNovo); }
    if (ativo !== undefined) { campos.push("ativo = ?"); valores.push(ativo ? 1 : 0); }
    if (!campos.length) {
      return res.status(400).json({ ok: false, message: "Nenhum campo válido enviado" });
    }
    valores.push(id);

    let atualizadas = { turmas: 0, acoes: 0 };
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query(`UPDATE subtipos SET ${campos.join(", ")} WHERE id = ?`, valores);
    if (renomeia) {
      // O subtipo é gravado como texto em turmas e ações: sem este passo,
      // renomear deixaria o histórico apontando para um nome que não existe
      // mais no catálogo.
      const [rt] = await conn.query(`UPDATE treinamentos SET subtipo = ? WHERE subtipo = ?`, [nomeNovo, atual.nome]);
      const [ra] = await conn.query(`UPDATE acoes_desenvolvimento SET subtipo = ? WHERE subtipo = ?`, [nomeNovo, atual.nome]);
      atualizadas = { turmas: rt.affectedRows || 0, acoes: ra.affectedRows || 0 };
    }
    await conn.commit();

    const extra = renomeia && (atualizadas.turmas || atualizadas.acoes)
      ? ` ${atualizadas.turmas} turma(s) e ${atualizadas.acoes} ação(ões) acompanharam o novo nome.`
      : "";
    return res.json({
      ok: true,
      message: `Subtipo atualizado com sucesso.${extra}`,
      turmas_atualizadas: atualizadas.turmas,
      acoes_atualizadas: atualizadas.acoes,
    });
  } catch (error) {
    if (conn) { try { await conn.rollback(); } catch (_) {} }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Já existe um subtipo com esse nome" });
    }
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar subtipo" });
  } finally {
    if (conn) conn.release();
  }
}

async function desativar(req, res) {
  try {
    const { id } = req.params;
    const existente = await buscarPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, message: "Subtipo não encontrado" });
    }
    if (existente.chave_sistema) {
      return res.status(409).json({ ok: false, message: MSG_SISTEMA });
    }
    const uso = await contarUso(pool, existente.nome);
    await pool.query(`UPDATE subtipos SET ativo = 0 WHERE id = ?`, [id]);
    // Turmas/ações que já usam o subtipo continuam com ele (histórico
    // preservado); só deixa de ser oferecido para novos cadastros.
    const extra = uso.turmas || uso.acoes
      ? ` ${uso.turmas} turma(s) e ${uso.acoes} ação(ões) continuam com esta classificação; ele só deixa de ser oferecido em novos cadastros.`
      : "";
    return res.json({ ok: true, message: `Subtipo desativado com sucesso.${extra}`, turmas_em_uso: uso.turmas, acoes_em_uso: uso.acoes });
  } catch (error) {
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao desativar subtipo" });
  }
}

module.exports = { listar, criar, atualizar, desativar };
