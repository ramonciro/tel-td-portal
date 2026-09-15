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

async function listar(req, res) {
  try {
    const incluirInativos = String(req.query?.incluir_inativos || "") === "1";
    const rows = await listarSubtipos({ incluirInativos });
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
  try {
    const { id } = req.params;
    const { nome, ativo } = req.body || {};

    const [existente] = await pool.query(`SELECT id FROM subtipos WHERE id = ? LIMIT 1`, [id]);
    if (!existente.length) {
      return res.status(404).json({ ok: false, message: "Subtipo não encontrado" });
    }

    const campos = [];
    const valores = [];
    if (nome !== undefined) {
      const nomeLimpo = String(nome).trim();
      if (!nomeLimpo) {
        return res.status(400).json({ ok: false, message: "O nome não pode ficar vazio" });
      }
      campos.push("nome = ?");
      valores.push(nomeLimpo);
    }
    if (ativo !== undefined) { campos.push("ativo = ?"); valores.push(ativo ? 1 : 0); }

    if (!campos.length) {
      return res.status(400).json({ ok: false, message: "Nenhum campo válido enviado" });
    }

    valores.push(id);
    await pool.query(`UPDATE subtipos SET ${campos.join(", ")} WHERE id = ?`, valores);

    return res.json({ ok: true, message: "Subtipo atualizado com sucesso" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Já existe um subtipo com esse nome" });
    }
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar subtipo" });
  }
}

async function desativar(req, res) {
  try {
    const { id } = req.params;
    const [existente] = await pool.query(`SELECT id FROM subtipos WHERE id = ? LIMIT 1`, [id]);
    if (!existente.length) {
      return res.status(404).json({ ok: false, message: "Subtipo não encontrado" });
    }
    await pool.query(`UPDATE subtipos SET ativo = 0 WHERE id = ?`, [id]);
    return res.json({ ok: true, message: "Subtipo desativado com sucesso" });
  } catch (error) {
    console.error("[subtiposController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao desativar subtipo" });
  }
}

module.exports = { listar, criar, atualizar, desativar };
