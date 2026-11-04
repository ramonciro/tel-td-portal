/**
 * modalidade.js — modalidade da turma (online / presencial) como campo de verdade (04/11/2026).
 *
 * Até aqui a modalidade vivia só como uma marcação `[modalidade:presencial]` colada dentro de
 * `treinamentos.descricao` e era lida por expressão regular em cada tela. Agora existe a coluna
 * `treinamentos.modalidade`. A marcação continua sendo gravada em paralelo (telas antigas abertas,
 * relatórios que ainda leem a descrição), mas a COLUNA é a fonte: onde há as duas, a coluna vence.
 */

const VALIDAS = ["online", "presencial"];
const PADRAO_TAG = /\[modalidade:([^\]]*)\]\s*/gi;

/** "Online", " presencial " -> "online" | "presencial"; qualquer outra coisa -> "" */
function normalizarModalidade(valor) {
  const v = String(valor ?? "").trim().toLowerCase();
  return VALIDAS.includes(v) ? v : "";
}

/** Lê a marcação [modalidade:x] da descrição. */
function modalidadeDaDescricao(descricao) {
  const m = /\[modalidade:([^\]]*)\]/i.exec(String(descricao || ""));
  return normalizarModalidade(m && m[1]);
}

/** Modalidade de uma linha de turma: coluna primeiro, marcação da descrição como reserva. */
function modalidadeDaTurma(row) {
  return normalizarModalidade(row && row.modalidade) || modalidadeDaDescricao(row && row.descricao);
}

/**
 * Devolve a descrição com a marcação alinhada à modalidade (remove a antiga e, se houver modalidade,
 * grava a nova no começo). Mantém o restante do texto como está.
 */
function sincronizarTagNaDescricao(descricao, modalidade) {
  const semTag = String(descricao || "").replace(PADRAO_TAG, "");
  const mod = normalizarModalidade(modalidade);
  return mod ? `[modalidade:${mod}] ${semTag}`.trimEnd() : semTag.trim();
}

module.exports = {
  VALIDAS,
  normalizarModalidade,
  modalidadeDaDescricao,
  modalidadeDaTurma,
  sincronizarTagNaDescricao,
};
