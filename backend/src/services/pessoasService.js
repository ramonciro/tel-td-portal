/**
 * pessoasService.js — Cadastro único de pessoas, Fase 0 (22/09/2026)
 *
 * Fundação da unificação de identidade entre turmas, jornadas, coaching,
 * dados bancários e usuários, pedida pelo Ramon depois de aprovar a
 * proposta de `pessoas` único ("precisamos reestruturar todas as páginas
 * que tenham esse impacto... todo o portal precisa ser um só nesse
 * sentido"). Ver proposta e plano no projeto Portal T&D (Claude):
 *   - claude/proposta-cadastro-unico-pessoas-2026-09.md
 *   - claude/plano-reestruturacao-cadastro-unico-pessoas-2026-09.md
 *
 * resolverPessoa() é o único lugar onde "é a mesma pessoa?" deve ser
 * decidido daqui pra frente. Os controllers de cadastro (Fase 2 do plano —
 * treinamentoParticipantesController, jornadaParticipantesController,
 * coachingIndividualController, perfilComportamentalController,
 * reembolsoTransporteController, entityCrud/usersController,
 * rsController) devem chamar esta função em vez de reimplementar a lógica
 * de casamento cada um do seu jeito — hoje ela já está duplicada e
 * divergente entre eles (ver inventário no plano).
 *
 * Prioridade de casamento (mesma da proposta de 22/09/2026):
 *   1. CPF já cadastrado nesta empresa → mesma pessoa, sem ambiguidade.
 *   2. Sem CPF (não informado nesta chamada), matrícula + nome batem
 *      (nome comparado sem diferenciar maiúsculas/espaços) → provável
 *      mesma pessoa. Cobre o módulo Metodologia, que hoje não tem CPF
 *      nenhum, e Avaliação Técnica, onde participante pode não ter
 *      matrícula.
 *   3. Nenhum dos dois → pessoa nova, status_identidade = 'provisoria'.
 *
 * Nunca bloqueia um cadastro por falta de CPF ou de matrícula — a pessoa
 * só fica marcada como provisória, pendente de "enriquecimento" quando um
 * CPF aparecer para ela em outra tela (ex.: a mesma pessoa depois entra
 * numa turma de Treinamento com CPF preenchido).
 */
const pool = require("../lib/db");

function normalizarCpf(valor) {
  const digits = String(valor || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

function normalizarNome(valor) {
  return String(valor || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Mantém nome/cliente da pessoa alinhados ao cadastro mais recente que a
// achou (o "retrato mais atual" da pessoa) — mas nunca apaga um CPF ou
// matrícula que ela já tinha, e nunca sobrescreve com valor vazio. O
// histórico por linha continua intacto nas tabelas de origem, que esta
// função não toca.
async function atualizarRetrato(conn, pessoa, { nome, matricula, cliente }) {
  const sets = [];
  const params = [];
  const nomeLimpo = nome && nome.trim();
  if (nomeLimpo && nomeLimpo !== pessoa.nome) {
    sets.push("nome = ?");
    params.push(nomeLimpo);
  }
  if (matricula && !pessoa.matricula) {
    sets.push("matricula = ?");
    params.push(String(matricula).trim());
  }
  if (cliente && cliente !== pessoa.cliente) {
    sets.push("cliente = ?");
    params.push(cliente);
  }
  if (!sets.length) return pessoa;
  params.push(pessoa.id);
  await conn.query(`UPDATE pessoas SET ${sets.join(", ")} WHERE id = ?`, params);
  return { ...pessoa, nome: nomeLimpo || pessoa.nome, matricula: pessoa.matricula || matricula || null, cliente: cliente || pessoa.cliente };
}

/**
 * @param {{empresaId:number, nome:string, cpf?:string, matricula?:string, cliente?:string}} dados
 * @param {*} conn - pool ou connection de transação (mysql2); padrão: pool.
 * @returns {Promise<{pessoa:object, criada:boolean, casadaPor:'cpf'|'matricula_nome'|null}>}
 */
async function resolverPessoa({ empresaId, nome, cpf, matricula, cliente }, conn = pool) {
  if (!empresaId) throw new Error("resolverPessoa: empresaId é obrigatório");
  if (!nome || !String(nome).trim()) throw new Error("resolverPessoa: nome é obrigatório");

  const cpfNormalizado = normalizarCpf(cpf);
  const matriculaNormalizada = matricula ? String(matricula).trim() : null;
  const nomeNormalizado = normalizarNome(nome);

  if (cpfNormalizado) {
    const [rows] = await conn.query(`SELECT * FROM pessoas WHERE empresa_id = ? AND cpf = ? LIMIT 1`, [
      empresaId,
      cpfNormalizado,
    ]);
    if (rows[0]) {
      const pessoa = await atualizarRetrato(conn, rows[0], { nome, matricula: matriculaNormalizada, cliente });
      return { pessoa, criada: false, casadaPor: "cpf" };
    }
  }

  if (!cpfNormalizado && matriculaNormalizada) {
    const [rows] = await conn.query(
      `SELECT * FROM pessoas WHERE empresa_id = ? AND matricula = ? AND LOWER(TRIM(nome)) = ? LIMIT 1`,
      [empresaId, matriculaNormalizada, nomeNormalizado]
    );
    if (rows[0]) {
      const pessoa = await atualizarRetrato(conn, rows[0], { nome, cliente });
      return { pessoa, criada: false, casadaPor: "matricula_nome" };
    }
  }

  const statusIdentidade = cpfNormalizado ? "confirmada" : "provisoria";
  const [result] = await conn.query(
    `INSERT INTO pessoas (empresa_id, cpf, matricula, nome, cliente, status_identidade)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [empresaId, cpfNormalizado, matriculaNormalizada, String(nome).trim(), cliente || null, statusIdentidade]
  );
  const [novaPessoa] = await conn.query(`SELECT * FROM pessoas WHERE id = ?`, [result.insertId]);
  return { pessoa: novaPessoa[0], criada: true, casadaPor: null };
}

module.exports = { resolverPessoa, normalizarCpf, normalizarNome };
