/**
 * provisionamentoUsuariosService.js — Inclusão de usuários (treinandos), 25/09/2026
 *
 * Ver proposta no projeto Portal T&D (Claude):
 *   claude/proposta-inclusao-usuarios-treinandos-2026-09-25.md
 *
 * Decisões do Ramon (25/09/2026):
 *   1. Login por CPF ou matrícula (ver routes/authRoutes.js).
 *   2. Contas nascem em lote, junto da importação/cadastro de participantes
 *      de turma — é este serviço que faz isso.
 *   3. Senha inicial continua o padrão já usado no resto do portal
 *      (Tel@2026, troca obrigatória no primeiro acesso).
 *
 * garantirUsuarioTreinando() é chamado depois de resolverPessoa() (ver
 * pessoasService.js) — nunca decide identidade sozinho, só o que fazer com
 * a pessoa já resolvida:
 *   - pessoa sem CPF e sem matrícula → não dá pra logar por nenhum dos dois
 *     ainda (ver Decisão 1), então não cria conta nenhuma. Fica só como
 *     participante da turma, igual antes desta mudança.
 *   - pessoa já tem uma conta (qualquer perfil) → não duplica; se o
 *     `cliente` desta turma ainda não estiver na lista de clientes da
 *     conta (campo multi-valor, mesmo padrão de lib/acessoCliente.js),
 *     adiciona — assim uma pessoa que entra numa turma de um cliente novo
 *     passa a enxergar os dois, sem precisar de nenhuma ação manual.
 *   - pessoa nova, sem conta → cria uma, perfil 'treinando', sem e-mail
 *     (login por CPF/matrícula não depende disso — ver Decisão 1),
 *     ligada à pessoa por `pessoa_id`.
 */
const bcrypt = require("bcryptjs");
const pool = require("../lib/db");

const SENHA_PADRAO_TREINANDO = "Tel@2026";

function normalizarListaClientes(valor) {
  return String(valor || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {{pessoa: object, empresaId: number, cliente?: string}} dados
 * @param {*} conn - pool ou connection de transação (mysql2); padrão: pool.
 * @returns {Promise<{criado:boolean, atualizado:boolean, usuarioId?:number, motivo?:string}>}
 */
async function garantirUsuarioTreinando({ pessoa, empresaId, cliente }, conn = pool) {
  if (!pessoa || !pessoa.id) {
    throw new Error("garantirUsuarioTreinando: pessoa é obrigatória");
  }

  // Decisão 1 — login só existe por CPF ou matrícula por enquanto. Sem
  // nenhum dos dois, a pessoa continua só como registro na turma (mesmo
  // comportamento de antes desta entrega) — nada bloqueia o cadastro do
  // participante, só não gera acesso ao portal pra ela ainda.
  if (!pessoa.cpf && !pessoa.matricula) {
    return { criado: false, atualizado: false, motivo: "sem_cpf_matricula" };
  }

  const [existentes] = await conn.query(
    `SELECT id, cliente FROM usuarios WHERE pessoa_id = ? LIMIT 1`,
    [pessoa.id]
  );

  if (existentes.length) {
    const usuarioExistente = existentes[0];
    const clienteNovo = String(cliente || "").trim();
    const clientesAtuais = normalizarListaClientes(usuarioExistente.cliente);
    const jaTemCliente = clientesAtuais.some(
      (c) => c.toLowerCase() === clienteNovo.toLowerCase()
    );

    if (clienteNovo && !jaTemCliente) {
      const clientesAtualizados = [...clientesAtuais, clienteNovo].join(", ");
      await conn.query(`UPDATE usuarios SET cliente = ? WHERE id = ?`, [
        clientesAtualizados,
        usuarioExistente.id,
      ]);
      return { criado: false, atualizado: true, usuarioId: usuarioExistente.id };
    }

    return { criado: false, atualizado: false, usuarioId: usuarioExistente.id, motivo: "ja_existia" };
  }

  const senhaHash = await bcrypt.hash(SENHA_PADRAO_TREINANDO, 10);
  const [result] = await conn.query(
    `INSERT INTO usuarios
      (nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria, empresa_id, pessoa_id)
     VALUES (?, NULL, ?, 'treinando', ?, 1, 1, ?, ?)`,
    [pessoa.nome, senhaHash, String(cliente || pessoa.cliente || "").trim() || null, empresaId, pessoa.id]
  );

  return { criado: true, atualizado: false, usuarioId: result.insertId };
}

module.exports = { garantirUsuarioTreinando, SENHA_PADRAO_TREINANDO };
