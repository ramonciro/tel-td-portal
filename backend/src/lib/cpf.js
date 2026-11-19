/**
 * cpf.js — normalização única de CPF (19/11/2026).
 *
 * Padrão do portal: 11 dígitos, só números (ex.: 03671373563). Quem digita ou importa pode mandar com ou sem
 * pontuação. O Excel, porém, tira os zeros à esquerda quando o CPF está como número (03671373563 vira 3671373563):
 * até 19/11/2026 esses CPFs de 10 dígitos eram descartados. Agora, CPF com 9 ou 10 dígitos é completado com zeros à
 * esquerda — mas só se os dígitos verificadores baterem, para não "inventar" um CPF de uma sequência qualquer.
 * CPF já com 11 dígitos segue como sempre (sem conferir os dígitos, igual ao comportamento anterior).
 * CommonJS — nunca usar import/export.
 */

function cpfValido(onze) {
  if (!/^\d{11}$/.test(onze) || /^(\d)\1{10}$/.test(onze)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(onze[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(onze[n])) return false;
  }
  return true;
}

/** Devolve 11 dígitos ou null (vazio/inválido). */
function normalizarCpf(valor) {
  if (valor === null || valor === undefined) return null;
  // Número do Excel (3671373563) ou texto com ponto/traço/espaço.
  const digitos = (typeof valor === "number" && Number.isFinite(valor) ? String(Math.trunc(valor)) : String(valor)).replace(/\D/g, "");
  if (digitos.length === 11) return digitos;
  if (digitos.length >= 9 && digitos.length <= 10) {
    const completo = digitos.padStart(11, "0");
    return cpfValido(completo) ? completo : null;
  }
  return null;
}

module.exports = { normalizarCpf, cpfValido };
