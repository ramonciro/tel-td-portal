/**
 * Padrão de senha do Portal (14/11/2026, decisão do Ramon: "manter uma senha mínima padrão" para todos).
 * Regra: de 8 a 72 caracteres, com pelo menos uma letra e um número.
 * (72 = limite do bcrypt: o que passa disso seria ignorado em silêncio.)
 *
 * Os usuários que já existem não são alterados em lote: no login, quem entrou com uma senha fora do padrão passa a ter a
 * troca obrigatória (troca_senha_obrigatoria = 1) — é o único momento em que a senha digitada é conhecida, já que o banco
 * só guarda o hash. Códigos de primeiro acesso e senhas geradas pelo sistema já exigem a troca no primeiro login.
 */
const MIN = 8;
const MAX = 72;
const MENSAGEM = `A senha deve ter de ${MIN} a ${MAX} caracteres, com pelo menos uma letra e um número.`;

/** Devolve null se a senha está dentro do padrão; senão a mensagem para mostrar ao usuário. */
function validarSenha(senha) {
  const s = typeof senha === "string" ? senha : "";
  if (s.length < MIN || s.length > MAX) return MENSAGEM;
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return MENSAGEM;
  return null;
}

const senhaDentroDoPadrao = (senha) => validarSenha(senha) === null;

module.exports = { validarSenha, senhaDentroDoPadrao, MIN, MAX, MENSAGEM };
