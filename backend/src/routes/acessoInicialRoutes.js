/**
 * acessoInicialRoutes.js — códigos de primeiro acesso dos treinandos (21/10/2026)
 *
 * Substitui a senha única de todos os treinandos por um código individual
 * (lib/codigoAcesso.js). Quem coordena vê quem ainda não acessou, gera/renova
 * códigos e baixa a lista para entregar às pessoas.
 *
 * Perfis: coordenador, supervisor, assistente_treinamento (montado em index.js).
 * Sempre limitado à empresa de quem pede (req.empresaId).
 */
const express = require("express");
const pool = require("../lib/db");
const { definirCodigo } = require("../lib/codigoAcesso");
const { registrarAuditoria } = require("../services/auditoria");

const router = express.Router();

// Situação de cada conta de treinando, calculada no SQL.
const SITUACAO_SQL = `
  CASE
    WHEN u.troca_senha_obrigatoria = 0 THEN 'ativa'
    WHEN u.codigo_acesso IS NULL THEN 'senha_padrao'
    WHEN u.codigo_acesso_expira IS NOT NULL AND u.codigo_acesso_expira < NOW() THEN 'codigo_vencido'
    ELSE 'aguardando'
  END`;

const ROTULO = {
  ativa: "Já acessou",
  senha_padrao: "Senha padrão antiga (sem código)",
  codigo_vencido: "Código vencido",
  aguardando: "Aguardando primeiro acesso",
};

function filtroBase(req, { treinamentoId }) {
  const cond = ["u.perfil = 'treinando'", "u.ativo = 1"];
  const params = [];
  if (req.empresaId) { cond.push("u.empresa_id = ?"); params.push(req.empresaId); }
  if (treinamentoId) {
    cond.push("u.pessoa_id IN (SELECT tp.pessoa_id FROM treinamento_participantes tp WHERE tp.treinamento_id = ? AND tp.pessoa_id IS NOT NULL)");
    params.push(treinamentoId);
  }
  return { cond, params };
}

async function validarTurma(req, treinamentoId) {
  if (!treinamentoId) return true;
  const [r] = await pool.query(
    `SELECT id FROM treinamentos WHERE id = ? ${req.empresaId ? "AND empresa_id = ?" : ""} LIMIT 1`,
    req.empresaId ? [treinamentoId, req.empresaId] : [treinamentoId]
  );
  return r.length > 0;
}

function numeroOuNull(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function listar(req, { treinamentoId, situacao }) {
  const { cond, params } = filtroBase(req, { treinamentoId });
  const [rows] = await pool.query(
    `SELECT u.id, u.nome, u.cliente, u.codigo_acesso, u.codigo_acesso_expira,
            p.cpf, p.matricula, ${SITUACAO_SQL} AS situacao
       FROM usuarios u
       LEFT JOIN pessoas p ON p.id = u.pessoa_id
      WHERE ${cond.join(" AND ")}
      ORDER BY u.nome`,
    params
  );
  return situacao ? rows.filter((r) => r.situacao === situacao) : rows;
}

// Resumo para os cartões da tela.
router.get("/resumo", async (req, res) => {
  try {
    const treinamentoId = numeroOuNull(req.query.treinamento_id);
    if (!(await validarTurma(req, treinamentoId))) return res.status(404).json({ message: "Turma não encontrada." });
    const linhas = await listar(req, { treinamentoId });
    const resumo = { total: linhas.length, ativa: 0, aguardando: 0, codigo_vencido: 0, senha_padrao: 0 };
    for (const l of linhas) resumo[l.situacao] += 1;
    res.json(resumo);
  } catch (e) {
    console.error("[acesso-inicial] resumo:", e.message);
    res.status(500).json({ message: "Erro ao carregar o resumo de acessos." });
  }
});

router.get("/lista", async (req, res) => {
  try {
    const treinamentoId = numeroOuNull(req.query.treinamento_id);
    if (!(await validarTurma(req, treinamentoId))) return res.status(404).json({ message: "Turma não encontrada." });
    const situacao = Object.keys(ROTULO).includes(req.query.situacao) ? req.query.situacao : null;
    const linhas = await listar(req, { treinamentoId, situacao });
    res.json(linhas.map((l) => ({
      id: l.id, nome: l.nome, cliente: l.cliente,
      identificador: l.cpf || l.matricula || null,
      situacao: l.situacao, situacao_rotulo: ROTULO[l.situacao],
      // O código só aparece enquanto a pessoa não trocou a senha.
      codigo: l.situacao === "ativa" ? null : l.codigo_acesso,
      expira_em: l.situacao === "ativa" ? null : l.codigo_acesso_expira,
    })));
  } catch (e) {
    console.error("[acesso-inicial] lista:", e.message);
    res.status(500).json({ message: "Erro ao listar acessos." });
  }
});

// Gera códigos para quem ainda não acessou e está sem código (senha padrão
// antiga) ou com o código vencido. Nunca mexe em quem já trocou a senha.
router.post("/gerar", async (req, res) => {
  try {
    const treinamentoId = numeroOuNull(req.body?.treinamento_id);
    if (!(await validarTurma(req, treinamentoId))) return res.status(404).json({ message: "Turma não encontrada." });
    const incluirAguardando = req.body?.renovar_todos === true;
    const linhas = await listar(req, { treinamentoId });
    const alvo = linhas.filter((l) =>
      l.situacao === "senha_padrao" || l.situacao === "codigo_vencido" || (incluirAguardando && l.situacao === "aguardando")
    );
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const l of alvo) await definirCodigo(conn, l.id);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    registrarAuditoria({
      usuario: req.user, acao: "gerar_codigos_acesso", entidade: "usuario", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} gerou ${alvo.length} código(s) de primeiro acesso${treinamentoId ? ` (turma ${treinamentoId})` : ""}`,
      ip: req.ip,
    });
    res.json({ gerados: alvo.length, ignorados: linhas.length - alvo.length });
  } catch (e) {
    console.error("[acesso-inicial] gerar:", e.message);
    res.status(500).json({ message: "Erro ao gerar códigos de acesso." });
  }
});

// Novo código para UMA pessoa (primeiro acesso perdido ou senha esquecida de quem não tem e-mail).
router.post("/regenerar/:usuarioId", async (req, res) => {
  try {
    const id = numeroOuNull(req.params.usuarioId);
    if (!id) return res.status(400).json({ message: "Usuário inválido." });
    const [rows] = await pool.query(
      `SELECT id, nome FROM usuarios WHERE id = ? AND perfil = 'treinando' ${req.empresaId ? "AND empresa_id = ?" : ""} LIMIT 1`,
      req.empresaId ? [id, req.empresaId] : [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Treinando não encontrado." });
    const codigo = await definirCodigo(pool, id);
    registrarAuditoria({
      usuario: req.user, acao: "novo_codigo_acesso", entidade: "usuario", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} gerou novo código de acesso para ${rows[0].nome}`, ip: req.ip,
    });
    res.json({ id, nome: rows[0].nome, codigo });
  } catch (e) {
    console.error("[acesso-inicial] regenerar:", e.message);
    res.status(500).json({ message: "Erro ao gerar o código." });
  }
});

router.get("/exportar", async (req, res) => {
  try {
    const treinamentoId = numeroOuNull(req.query.treinamento_id);
    if (!(await validarTurma(req, treinamentoId))) return res.status(404).json({ message: "Turma não encontrada." });
    const linhas = (await listar(req, { treinamentoId })).filter((l) => l.situacao !== "ativa");
    const { novoWorkbook, adicionarTabela } = require("../lib/excelExport");
    const wb = novoWorkbook();
    adicionarTabela(wb, {
      nomeAba: "Códigos de acesso",
      colunas: [
        { titulo: "Nome", chave: "nome", largura: 34 },
        { titulo: "CPF / Matrícula (login)", chave: "identificador", largura: 24 },
        { titulo: "Operação", chave: "cliente", largura: 20 },
        { titulo: "Código de primeiro acesso", chave: "codigo", largura: 26 },
        { titulo: "Vale até", chave: "expira_em", formato: "data", largura: 14 },
        { titulo: "Situação", chave: "situacao", largura: 32 },
      ],
      linhas: linhas.map((l) => ({
        nome: l.nome, identificador: l.cpf || l.matricula || "-", cliente: l.cliente || "-",
        codigo: l.codigo_acesso || "— gere o código —", expira_em: l.codigo_acesso_expira || null,
        situacao: ROTULO[l.situacao],
      })),
    });
    const buf = await wb.xlsx.writeBuffer();
    registrarAuditoria({
      usuario: req.user, acao: "exportar", entidade: "usuario", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} exportou ${linhas.length} código(s) de primeiro acesso`, ip: req.ip,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="codigos-de-acesso.xlsx"');
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[acesso-inicial] exportar:", e.message);
    res.status(500).json({ message: "Erro ao exportar os códigos." });
  }
});

module.exports = router;
