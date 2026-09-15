/**
 * subtipos.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Lista fixa de subtipo/subdivisão, compartilhada entre `acoes_desenvolvimento`
 * (onde o campo já existia) e `treinamentos` (decisão 20 da proposta de
 * Agendamento de Salas: reaproveitar o mesmo padrão em vez de inventar um
 * campo novo isolado, já que essa é a mesma base de dado que o Farol de
 * Conformidade MPT vai precisar depois).
 *
 * Achado da auditoria de riscos cruzados (claude/auditoria-riscos-cruzados-
 * pacote-salas-2026-09.md): `acoes_desenvolvimento.subtipo` nunca teve
 * validação nenhuma no backend — qualquer string era aceita. Isso é
 * particularmente sensível porque essa é a base de dado usada depois para
 * comprovação ao MPT: um typo não aparece como erro, aparece como uma linha
 * "perdida" na agregação por subdivisão. Esta lista + `normalizeSubtipo`
 * fecham essa lacuna para os dois usos (Ações de Desenvolvimento e turma),
 * seguindo o mesmo padrão que `tipo_acao` já tinha em
 * acoesDesenvolvimentoController.js (lista fixa + fallback sensato em vez de
 * rejeitar a escrita).
 */

const SUBTIPOS_VALIDOS = [
  "Prevenção ao Assédio Moral",
  "Coaching de Coordenação e Gerência",
  "Compliance e Ética",
  "Desenvolvimento de Liderança",
  "Treinamento Técnico",
  // Decisão 20 — nova opção nesta rodada, exclusiva do lado turma na
  // prática (classificação de turma para a Presença Nominal/Reembolso de
  // Transporte), mas fica na mesma lista para não duplicar o conceito.
  "Avaliação Técnica",
  "Outro",
];

const SUBTIPOS_NORMALIZADOS = new Map(
  SUBTIPOS_VALIDOS.map((valor) => [normalizarChave(valor), valor])
);

function normalizarChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Valida um subtipo recebido do cliente contra a lista fixa. Ao contrário
 * de `tipo_acao` (que sempre precisa de algum valor e cai num fallback
 * fixo), subtipo já é opcional/nullable em ambas as tabelas — então um
 * valor ausente ou inválido vira `null` (não classificado) em vez de ser
 * silenciosamente remapeado para outra categoria, o que seria pior para a
 * integridade da base usada no Farol MPT. Loga um aviso quando o valor
 * recebido não é vazio mas também não bate com nenhuma opção válida, para
 * facilitar notar na prática (ex.: frontend desatualizado, integração
 * externa) sem derrubar a escrita.
 */
function normalizeSubtipo(valorBruto) {
  const bruto = String(valorBruto || "").trim();
  if (!bruto) return null;

  const chave = normalizarChave(bruto);
  const valido = SUBTIPOS_NORMALIZADOS.get(chave);
  if (valido) return valido;

  console.warn(
    `[subtipos] valor de subtipo fora da lista fixa recebido e descartado (virou null): "${bruto}"`
  );
  return null;
}

module.exports = { SUBTIPOS_VALIDOS, normalizeSubtipo };
