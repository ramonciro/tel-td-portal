// Espelho de backend/src/lib/politicaSenha.js (a API é quem decide; isto só avisa antes de enviar).
export const SENHA_DICA = "Use de 8 a 72 caracteres, com pelo menos uma letra e um número.";

export function erroDeSenha(senha) {
  const s = typeof senha === "string" ? senha : "";
  if (s.length < 8 || s.length > 72) return SENHA_DICA;
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return SENHA_DICA;
  return null;
}
