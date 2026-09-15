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
 * desativados.
 */
async function listarSubtipos({ incluirInativos = false } = {}) {
  const where = incluirInativos ? "" : "WHERE ativo = 1";
  const [rows] = await pool.query(
    `SELECT id, nome, ativo, criado_em FROM subtipos ${where} ORDER BY nome ASC`
  );
  return rows;
}

/**
 * Valida um subtipo recebido do cliente contra a tabela `subtipos` (só
 * considera ativo — um subtipo desativado não pode mais ser aplicado a
 * registro novo, mas continua valendo nos registros antigos que já o têm).
 * Ao contrário de `tipo_acao` (que sempre precisa de algum valor e cai num
 * fallback fixo), subtipo já é opcional/nullable em ambas as tabelas —
 * então um valor ausente ou inválido vira `null` (não classificado) em vez
 * de ser silenciosamente remapeado para outra categoria, o que seria pior
 * para a integridade da base usada no Farol MPT. Loga um aviso quando o
 * valor recebido não é vazio mas também não bate com nenhuma opção válida
 * (ex.: frontend desatualizado, integração externa, ou o subtipo foi
 * desativado entre o usuário abrir o formulário e salvar) sem derrubar a
 * escrita.
 */
async function normalizeSubtipo(valorBruto) {
  const bruto = String(valorBruto || "").trim();
  if (!bruto) return null;

  const chave = normalizarChave(bruto);
  const ativos = await listarSubtipos();
  const encontrado = ativos.find((s) => normalizarChave(s.nome) === chave);
  if (encontrado) return encontrado.nome;

  console.warn(
    `[subtipos] valor de subtipo fora da lista ativa recebido e descartado (virou null): "${bruto}"`
  );
  return null;
}

module.exports = { listarSubtipos, normalizeSubtipo, normalizarChave };
