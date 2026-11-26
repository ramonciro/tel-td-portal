/**
 * subtipos.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Lista de subtipo/subdivisão, compartilhada entre `acoes_desenvolvimento`
 * (onde o campo já existia) e `treinamentos` (decisão 20 da proposta de
 * Agendamento de Salas: reaproveitar o mesmo padrão em vez de inventar um
 * campo novo isolado, já que essa é a mesma base de dado que o Farol de
 * Conformidade MPT vai precisar depois).
 *
 * Ajuste pós-entrega (15/09/2026, mesmo dia): a primeira versão desta lista
 * era um array fixo no código (`SUBTIPOS_VALIDOS`). Ramon revisou a entrega
 * e pediu para poder editar a lista ele mesmo — sem depender de código novo
 * a cada subdivisão nova. Agora a lista vive na tabela `subtipos`
 * (catálogo GLOBAL, sem empresa_id — mesma razão de `salas`: subdivisão é
 * um conceito só, comum a toda a operação) e é administrada pela tela
 * `/subtipos` (ver subtiposController.js). `normalizeSubtipo` virou
 * assíncrona por causa disso — os dois chamadores (index.js e
 * acoesDesenvolvimentoController.js) já são funções async, então isso é só
 * adicionar um `await`.
 *
 * Achado da auditoria de riscos cruzados original (claude/auditoria-riscos-
 * cruzados-pacote-salas-2026-09.md): `acoes_desenvolvimento.subtipo` nunca
 * teve validação nenhuma no backend — qualquer string era aceita. Isso é
 * particularmente sensível porque essa é a base de dado usada depois para
 * comprovação ao MPT: um typo não aparece como erro, aparece como uma linha
 * "perdida" na agregação por subdivisão. Esta validação fecha essa lacuna
 * para os dois usos (Ações de Desenvolvimento e turma).
 */

/*
 * 26/11/2026 (decisão do Ramon na revisão geral): o catálogo passou a ser POR AMBIENTE (subtipos.empresa_id).
 * Cada ambiente tem o seu e renomear/desativar um subtipo só afeta as turmas, ações, jornadas e metas daquele ambiente.
 * As linhas com empresa_id NULL são o "catálogo modelo": quem nunca teve catálogo próprio (ambiente novo)
 * recebe uma cópia dele na primeira consulta (garantirSubtiposDoAmbiente). Super Admin sem ambiente enxerga o modelo.
 * A detecção de "Avaliação Técnica" continua olhando o nome em TODOS os ambientes (ver nomesAvaliacaoTecnica).
 */
const pool = require("./db");

function normalizarChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Lista de subtipos ativos, para popular o seletor no frontend (Treinamentos,
 * Ações de Desenvolvimento) — ordenada por nome. `incluirInativos` é usado só
 * pela tela de administração (`/subtipos`), que precisa mostrar/reativar os
 * desativados. `comUso` (também só da tela de administração) acrescenta
 * quantas turmas e ações usam cada subtipo, para a tela avisar antes de
 * renomear/desativar algo que está em uso.
 */
async function garantirSubtiposDoAmbiente(empresaId) {
  if (!empresaId) return;
  try {
    const [[r]] = await pool.query("SELECT COUNT(*) AS n FROM subtipos WHERE empresa_id = ?", [empresaId]);
    if (Number(r.n) > 0) return;
    await pool.query(
      `INSERT INTO subtipos (nome, ativo, chave_sistema, empresa_id)
       SELECT nome, ativo, chave_sistema, ? FROM subtipos WHERE empresa_id IS NULL`,
      [empresaId]
    );
  } catch (error) {
    // coluna ainda inexistente (migração não rodou) ou corrida entre dois pedidos: segue com o que existe
    if (!error || (error.code !== "ER_BAD_FIELD_ERROR" && error.code !== "ER_DUP_ENTRY")) throw error;
  }
}

/**
 * Lista de subtipos do ambiente (`empresaId`), para popular o seletor no frontend (Treinamentos,
 * Ações de Desenvolvimento) — ordenada por nome. Sem `empresaId` (Super Admin sem ambiente): o catálogo modelo.
 * `incluirInativos` é usado só pela tela de administração (`/subtipos`), que precisa mostrar/reativar os
 * desativados. `comUso` (também só da tela de administração) acrescenta quantas turmas e ações do
 * ambiente usam cada subtipo, para a tela avisar antes de renomear/desativar algo que está em uso.
 */
async function listarSubtipos({ incluirInativos = false, comUso = false, empresaId = null } = {}) {
  await garantirSubtiposDoAmbiente(empresaId);
  const filtros = [];
  const params = [];
  if (!incluirInativos) filtros.push("s.ativo = 1");
  filtros.push(empresaId ? "s.empresa_id = ?" : "s.empresa_id IS NULL");
  if (empresaId) params.push(empresaId);
  const where = `WHERE ${filtros.join(" AND ")}`;
  const uso = comUso
    ? `, (SELECT COUNT(*) FROM treinamentos t WHERE t.subtipo = s.nome AND t.empresa_id <=> s.empresa_id) AS turmas_em_uso,
         (SELECT COUNT(*) FROM acoes_desenvolvimento a WHERE a.subtipo = s.nome AND a.empresa_id <=> s.empresa_id) AS acoes_em_uso`
    : "";
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.nome, s.ativo, s.criado_em, s.chave_sistema, s.empresa_id${uso} FROM subtipos s ${where} ORDER BY s.nome ASC`,
      params
    );
    return rows;
  } catch (error) {
    // Banco ainda sem as colunas novas (migração não rodou): mantém a tela funcionando com o que já existia.
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const [rows] = await pool.query(
        `SELECT s.id, s.nome, s.ativo, s.criado_em FROM subtipos s ${incluirInativos ? "" : "WHERE s.ativo = 1"} ORDER BY s.nome ASC`
      );
      return rows;
    }
    throw error;
  }
}

// Chave interna do subtipo que o sistema usa por trás dos panos. Hoje só um:
// o Reembolso de Transporte só enxerga turmas desta subdivisão. Como o
// subtipo é gravado como texto na turma, a regra antiga ("o texto tem que ser
// exatamente 'Avaliação Técnica'") quebrava quando alguém renomeava o item.
// Agora o item é identificado por esta chave (coluna subtipos.chave_sistema),
// e o nome pode mudar sem afetar o Reembolso.
const CHAVE_AVALIACAO_TECNICA = "avaliacao_tecnica";
const NOME_PADRAO_AVALIACAO_TECNICA = "Avaliação Técnica";

async function obterNomeSubtipoSistema(chave, nomePadrao, empresaId = null) {
  try {
    const [rows] = await pool.query(
      `SELECT nome FROM subtipos WHERE chave_sistema = ?${empresaId ? " AND empresa_id = ?" : ""} ORDER BY id LIMIT 1`,
      empresaId ? [chave, empresaId] : [chave]
    );
    if (rows[0] && rows[0].nome) return rows[0].nome;
  } catch (_) {
    // coluna ainda inexistente: cai no nome padrão
  }
  return nomePadrao;
}

// Nomes aceitos como "Avaliação Técnica": o atual de CADA ambiente (que pode ter sido renomeado) e o nome
// original, para turmas antigas que ainda carreguem o texto de antes. Sem `empresaId` junta os nomes de todos
// os ambientes — quase todos os pontos do sistema decidem "é Avaliação Técnica?" só olhando o texto da turma.
async function nomesAvaliacaoTecnica(empresaId = null) {
  let nomes = [];
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT nome FROM subtipos WHERE chave_sistema = ?${empresaId ? " AND empresa_id = ?" : ""}`,
      empresaId ? [CHAVE_AVALIACAO_TECNICA, empresaId] : [CHAVE_AVALIACAO_TECNICA]
    );
    nomes = rows.map((r) => r.nome).filter(Boolean);
  } catch (_) {
    // coluna ainda inexistente: só o nome padrão
  }
  if (!nomes.some((n) => normalizarChave(n) === normalizarChave(NOME_PADRAO_AVALIACAO_TECNICA))) {
    nomes.push(NOME_PADRAO_AVALIACAO_TECNICA);
  }
  return { atual: nomes[0], nomes };
}

async function ehSubtipoAvaliacaoTecnica(valor, empresaId = null) {
  const chave = normalizarChave(valor);
  if (!chave) return false;
  const { nomes } = await nomesAvaliacaoTecnica(empresaId);
  return nomes.some((n) => normalizarChave(n) === chave);
}

/**
 * Valida um subtipo recebido do cliente contra a tabela `subtipos`. Só
 * subtipo ATIVO pode ser aplicado a um registro, com uma exceção: se o valor
 * recebido é o mesmo que o registro já tem (`atual`), ele é mantido como está,
 * mesmo que o subtipo tenha sido desativado depois. Antes, editar e salvar
 * uma turma cujo subtipo havia sido desativado apagava a classificação sem
 * avisar (o valor virava null) — a turma saía do Reembolso de Transporte e
 * aparecia como "Não classificada" no MPT.
 *
 * Valor vazio vira `null` (o usuário limpou o campo de propósito). Valor novo
 * que não é ativo nem o atual é descartado (null) com um aviso no log, sem
 * derrubar a escrita — mesma política de antes.
 */
async function normalizeSubtipo(valorBruto, atual = null, empresaId = null) {
  const bruto = String(valorBruto || "").trim();
  if (!bruto) return null;

  const chave = normalizarChave(bruto);

  // Valor inalterado em relação ao que o registro já tem: preserva.
  if (atual && normalizarChave(atual) === chave) return String(atual).trim();

  // Com ambiente: só o catálogo dele. Sem ambiente (Super Admin): qualquer subtipo ativo de qualquer ambiente.
  let ativos;
  if (empresaId) {
    ativos = await listarSubtipos({ empresaId });
  } else {
    try {
      [ativos] = await pool.query("SELECT nome FROM subtipos WHERE ativo = 1 ORDER BY nome");
    } catch (_) {
      ativos = await listarSubtipos({});
    }
  }
  const encontrado = ativos.find((s) => normalizarChave(s.nome) === chave);
  if (encontrado) return encontrado.nome;

  console.warn(
    `[subtipos] valor de subtipo fora da lista ativa recebido e descartado (virou null): "${bruto}"`
  );
  return null;
}

module.exports = {
  listarSubtipos,
  garantirSubtiposDoAmbiente,
  normalizeSubtipo,
  normalizarChave,
  CHAVE_AVALIACAO_TECNICA,
  NOME_PADRAO_AVALIACAO_TECNICA,
  obterNomeSubtipoSistema,
  nomesAvaliacaoTecnica,
  ehSubtipoAvaliacaoTecnica,
};
