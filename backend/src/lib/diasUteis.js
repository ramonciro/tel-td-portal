/**
 * diasUteis.js — conta de dias úteis (segunda a sexta, sem feriado nacional).
 * Usado pelo prazo do "Fale Comigo" (Núcleo). CommonJS — nunca usar import/export.
 *
 * Feriados nacionais: os fixos e os que dependem da Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi).
 * Feriado estadual ou municipal não entra: o coordenador ajusta o prazo da demanda quando precisar.
 * As datas trafegam como texto "AAAA-MM-DD" para não sofrer com fuso horário.
 */

const pad = (n) => String(n).padStart(2, "0");
const paraTexto = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const paraData = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const somar = (d, dias) => new Date(d.getTime() + dias * 86400000);

// Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cache = new Map();
function feriadosDoAno(ano) {
  if (cache.has(ano)) return cache.get(ano);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  const p = pascoa(ano);
  const moveis = [-48, -47, -2, 60].map((delta) => paraTexto(somar(p, delta)));
  const set = new Set([...fixos, ...moveis]);
  cache.set(ano, set);
  return set;
}

function ehDiaUtil(d) {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosDoAno(d.getUTCFullYear()).has(paraTexto(d));
}

/** Soma `n` dias úteis a partir de `inicio` ("AAAA-MM-DD"); o dia do início não conta. Devolve "AAAA-MM-DD" (ou null se a data for inválida). */
function somarDiasUteis(inicio, n) {
  let d = paraData(inicio);
  if (!d) return null;
  let falta = Math.max(0, Math.trunc(Number(n) || 0));
  while (falta > 0) {
    d = somar(d, 1);
    if (ehDiaUtil(d)) falta--;
  }
  return paraTexto(d);
}

/** Quantos dias úteis passaram entre as duas datas (o início não conta, o fim conta). 0 se fim <= início. */
function diasUteisEntre(inicio, fim) {
  const a = paraData(inicio), b = paraData(fim);
  if (!a || !b || b <= a) return 0;
  let n = 0;
  for (let d = somar(a, 1); d <= b; d = somar(d, 1)) if (ehDiaUtil(d)) n++;
  return n;
}

module.exports = { somarDiasUteis, diasUteisEntre, ehDiaUtil, paraData, paraTexto };
