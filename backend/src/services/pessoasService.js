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
 *   2. Matrícula + nome batem (nome comparado sem diferenciar
 *      maiúsculas/acentos/espaços; matrícula sem zeros à esquerda) → mesma
 *      pessoa, mesmo quando chega um CPF que ela ainda não tinha (o CPF é
 *      gravado nela). Se a pessoa achada já tem OUTRO CPF, não casa. Cobre o módulo Metodologia, que hoje não tem CPF
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

// Comparação de nomes para a varredura: sem maiúsculas, sem acentos e com espaços
// repetidos unificados ("José  da Silva" == "jose da silva").
function nomeParaComparar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Matrícula para a varredura: sem espaços nas pontas, maiúscula, e sem zeros à
// esquerda quando é numérica (o Excel costuma comer o zero: "00123" vira "123").
function matriculaParaComparar(valor) {
  const t = String(valor || "").trim().toUpperCase();
  if (!t) return "";
  if (/^\d+$/.test(t)) return t.replace(/^0+/, "") || "0";
  return t;
}

// Mantém nome/cliente da pessoa alinhados ao cadastro mais recente que a
// achou (o "retrato mais atual" da pessoa) — mas nunca apaga um CPF ou
// matrícula que ela já tinha, e nunca sobrescreve com valor vazio. O
// histórico por linha continua intacto nas tabelas de origem, que esta
// função não toca.
// 19/10/2026: quando a pessoa foi achada pela matrícula e agora chegou um CPF
// que ela ainda não tinha, o CPF é gravado (identidade passa a "confirmada").
async function atualizarRetrato(conn, pessoa, { nome, matricula, cliente, cpf }) {
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
  if (cpf && !pessoa.cpf) {
    sets.push("cpf = ?", "status_identidade = 'confirmada'");
    params.push(cpf);
  }
  if (!sets.length) return pessoa;
  params.push(pessoa.id);
  await conn.query(`UPDATE pessoas SET ${sets.join(", ")} WHERE id = ?`, params);
  return {
    ...pessoa,
    nome: nomeLimpo || pessoa.nome,
    matricula: pessoa.matricula || matricula || null,
    cliente: cliente || pessoa.cliente,
    cpf: pessoa.cpf || cpf || null,
    status_identidade: cpf && !pessoa.cpf ? "confirmada" : pessoa.status_identidade,
  };
}

// Varredura por matrícula: acha, na empresa, a pessoa com a mesma matrícula E o
// mesmo nome (sem diferenciar acento/maiúscula/espaço). Se a pessoa achada já
// tem um CPF diferente do que chegou, são pessoas diferentes — não casa.
async function acharPorMatriculaNome(conn, empresaId, matricula, nome, cpf) {
  const mat = matriculaParaComparar(matricula);
  if (!mat) return null;
  const [candidatas] = await conn.query(
    `SELECT * FROM pessoas
      WHERE empresa_id = ? AND matricula IS NOT NULL AND TRIM(matricula) <> ''
        AND ( UPPER(TRIM(matricula)) = ?
              OR UPPER(TRIM(LEADING '0' FROM TRIM(matricula))) = ? )
      ORDER BY (cpf IS NULL), id`,
    [empresaId, mat, mat]
  );
  const alvo = nomeParaComparar(nome);
  return (
    candidatas.find(
      (c) =>
        matriculaParaComparar(c.matricula) === mat &&
        nomeParaComparar(c.nome) === alvo &&
        !(cpf && c.cpf && c.cpf !== cpf)
    ) || null
  );
}

/**
 * @param {{empresaId:number, nome:string, cpf?:string, matricula?:string, cliente?:string}} dados
 * @param {*} conn - pool ou connection de transação (mysql2); padrão: pool.
 * @returns {Promise<{pessoa:object, criada:boolean, casadaPor:'cpf'|'matricula_nome'|null}>}
 *
 * Varredura antes de criar (19/10/2026, pedido do Ramon): 1) CPF; 2) matrícula +
 * nome — agora também quando chega CPF e a pessoa existente ainda não tinha CPF
 * (antes isso criava uma segunda pessoa). Só cria pessoa nova se nenhuma das
 * duas buscas achar.
 */
async function resolverPessoa({ empresaId, nome, cpf, matricula, cliente }, conn = pool) {
  if (!empresaId) throw new Error("resolverPessoa: empresaId é obrigatório");
  if (!nome || !String(nome).trim()) throw new Error("resolverPessoa: nome é obrigatório");

  const cpfNormalizado = normalizarCpf(cpf);
  const matriculaNormalizada = matricula ? String(matricula).trim() : null;

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

  if (matriculaNormalizada) {
    const achada = await acharPorMatriculaNome(conn, empresaId, matriculaNormalizada, nome, cpfNormalizado);
    if (achada) {
      const pessoa = await atualizarRetrato(conn, achada, { nome, cliente, cpf: cpfNormalizado });
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

/**
 * pessoaIdDoUsuario() — 25/09/2026, item "Em seguida" da entrega de
 * inclusão de usuários (treinandos). Resolve o pessoa_id da conta logada
 * (usuarios.pessoa_id) a partir do id do usuário que já vem no JWT
 * (req.user.id) — usado pelos controllers de avaliação (NPS, provas) pra
 * comparar identidade do treinando por pessoa_id em vez de nome exato.
 * Retorna null pra conta antiga sem pessoa_id (criada antes da Fase 0 ou à
 * mão, sem passar pela importação de turma) — quem chama deve cair de volta
 * na comparação por nome nesse caso, exatamente como já funcionava.
 */
async function pessoaIdDoUsuario(userId, conn = pool) {
  if (!userId) return null;
  const [rows] = await conn.query("SELECT pessoa_id FROM usuarios WHERE id = ? LIMIT 1", [userId]);
  return rows[0]?.pessoa_id || null;
}

module.exports = { resolverPessoa, normalizarCpf, normalizarNome, pessoaIdDoUsuario, matriculaParaComparar, nomeParaComparar };
