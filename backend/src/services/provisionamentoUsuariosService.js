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
 *   3. Senha inicial: era o padrão único Portal@2026. Desde 21/10/2026 cada
 *      conta nova nasce com um CÓDIGO DE PRIMEIRO ACESSO próprio (ver
 *      lib/codigoAcesso.js), com validade; a troca de senha segue obrigatória
 *      no primeiro acesso. Contas antigas não são alteradas aqui.
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
const { gerarCodigo, canonico, expiraEm } = require("../lib/codigoAcesso");
const { nomeParaComparar } = require("./pessoasService");

const SENHA_PADRAO_TREINANDO = "Portal@2026";

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

  // 28/10/2026 — conta criada à mão (Gestão de Usuários) sem vínculo com `pessoas`:
  // se há UMA única conta de treinando do mesmo ambiente, sem pessoa_id, com o mesmo
  // nome, é a mesma pessoa — liga em vez de criar uma segunda conta.
  const jaTemConta = await conn.query(`SELECT id FROM usuarios WHERE pessoa_id = ? LIMIT 1`, [pessoa.id]);
  if (!jaTemConta[0].length) {
    const [orfas] = await conn.query(
      `SELECT id, nome, cliente FROM usuarios
        WHERE empresa_id = ? AND pessoa_id IS NULL AND perfil = 'treinando' AND nome = ? LIMIT 20`,
      [empresaId, pessoa.nome]
    );
    const alvo = nomeParaComparar(pessoa.nome);
    const iguais = orfas.filter((u) => nomeParaComparar(u.nome) === alvo);
    if (iguais.length === 1) {
      const conta = iguais[0];
      const clienteNovo = String(cliente || "").trim();
      const atuais = normalizarListaClientes(conta.cliente);
      const novos = clienteNovo && !atuais.some((c) => c.toLowerCase() === clienteNovo.toLowerCase())
        ? [...atuais, clienteNovo].join(", ")
        : conta.cliente;
      await conn.query(`UPDATE usuarios SET pessoa_id = ?, cliente = ? WHERE id = ?`, [pessoa.id, novos || null, conta.id]);
      return { criado: false, atualizado: true, usuarioId: conta.id, motivo: "conta_existente_vinculada" };
    }
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

  const codigo = gerarCodigo();
  const senhaHash = await bcrypt.hash(canonico(codigo), 10);
  const [result] = await conn.query(
    `INSERT INTO usuarios
      (nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria, empresa_id, pessoa_id, codigo_acesso, codigo_acesso_expira)
     VALUES (?, NULL, ?, 'treinando', ?, 1, 1, ?, ?, ?, ?)`,
    [pessoa.nome, senhaHash, String(cliente || pessoa.cliente || "").trim() || null, empresaId, pessoa.id, codigo, expiraEm()]
  );

  return { criado: true, atualizado: false, usuarioId: result.insertId };
}

module.exports = { garantirUsuarioTreinando, SENHA_PADRAO_TREINANDO };
