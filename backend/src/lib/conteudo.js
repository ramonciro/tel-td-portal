/**
 * conteudo.js — Produção de conteúdo (22/10/2026)
 *
 * Regras de tempo do módulo. Todas as datas do módulo são "de parede" no
 * horário de Salvador (America/Bahia), gravadas e lidas como texto
 * "YYYY-MM-DD HH:MM:SS". O servidor (Railway) roda em UTC; por isso o
 * "agora" vem daqui e nunca de NOW() do MySQL, e a leitura usa DATE_FORMAT
 * para o driver não converter fuso.
 *
 * O prazo de cada etapa é em HORAS ÚTEIS (seg–sex, 08:00–12:00 e
 * 13:00–17:48 por padrão, configurável em conteudo_config). Feriados não
 * são descontados.
 */
const pool = require("./db");

const ETAPAS = ["criacao", "validacao", "postagem"];
const STATUS_ABERTOS = ["a_fazer", "em_criacao", "em_validacao", "em_ajustes", "validado", "em_postagem"];
const STATUS_FINAIS = ["concluido", "cancelado"];
const STATUS_TODOS = [...STATUS_ABERTOS, ...STATUS_FINAIS];

const EXPEDIENTE_PADRAO = {
  manha_ini: "08:00",
  manha_fim: "12:00",
  tarde_ini: "13:00",
  tarde_fim: "17:48",
  dias_uteis: "1,2,3,4,5",
};

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:MM:SS" no horário de Salvador. */
function agoraBahia(data = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const g = (t) => partes.find((p) => p.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

function hojeBahia() {
  return agoraBahia().slice(0, 10);
}

function somarDias(dataIso, dias) {
  const [a, m, d] = dataIso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Aceita "YYYY-MM-DD HH:MM[:SS]" ou "YYYY-MM-DDTHH:MM[:SS]". Devolve texto normalizado ou null. */
function normalizarDataHora(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, a, mo, d, h, mi, s] = m;
  const dt = new Date(Date.UTC(+a, +mo - 1, +d, +h, +mi, +(s || 0)));
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  if (+h > 23 || +mi > 59) return null;
  return `${a}-${mo}-${d} ${h}:${mi}:${s || "00"}`;
}

/** Texto de parede -> milissegundos (UTC "falso", só serve para diferenças). */
function paraMs(s) {
  const n = normalizarDataHora(s);
  if (!n) return null;
  const m = n.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function minutosDe(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

async function carregarExpediente(empresaId) {
  const exp = { ...EXPEDIENTE_PADRAO };
  try {
    const [rows] = await pool.query(
      "SELECT chave, valor FROM conteudo_config WHERE empresa_id = ?",
      [empresaId || 0]
    );
    for (const r of rows) if (r.chave in exp && r.valor) exp[r.chave] = String(r.valor);
  } catch (e) {
    /* tabela ainda não existe: usa o padrão */
  }
  return exp;
}

function expedienteValido(exp) {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const k of ["manha_ini", "manha_fim", "tarde_ini", "tarde_fim"]) if (!re.test(String(exp[k] || ""))) return false;
  if (!(minutosDe(exp.manha_ini) < minutosDe(exp.manha_fim))) return false;
  if (!(minutosDe(exp.manha_fim) <= minutosDe(exp.tarde_ini))) return false;
  if (!(minutosDe(exp.tarde_ini) < minutosDe(exp.tarde_fim))) return false;
  const dias = String(exp.dias_uteis || "").split(",").map((x) => Number(x.trim()));
  return dias.length > 0 && dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Horas úteis entre dois horários de parede. Devolve null se algum dos dois
 * faltar; número negativo NUNCA é devolvido (fim antes do início -> null,
 * o que sinaliza dado inconsistente).
 */
function horasUteis(ini, fim, exp = EXPEDIENTE_PADRAO) {
  const a = paraMs(ini);
  const b = paraMs(fim);
  if (a === null || b === null) return null;
  if (b < a) return null;
  const blocos = [
    [minutosDe(exp.manha_ini), minutosDe(exp.manha_fim)],
    [minutosDe(exp.tarde_ini), minutosDe(exp.tarde_fim)],
  ];
  const dias = new Set(String(exp.dias_uteis).split(",").map((x) => Number(x.trim())));
  const DIA = 86400000;
  let dia0 = Math.floor(a / DIA) * DIA;
  const diaN = Math.floor(b / DIA) * DIA;
  let minutos = 0;
  let guarda = 0;
  for (let d = dia0; d <= diaN && guarda < 3000; d += DIA, guarda++) {
    const dow = new Date(d).getUTCDay();
    if (!dias.has(dow)) continue;
    for (const [bi, bf] of blocos) {
      const ini2 = Math.max(a, d + bi * 60000);
      const fim2 = Math.min(b, d + bf * 60000);
      if (fim2 > ini2) minutos += (fim2 - ini2) / 60000;
    }
  }
  return Math.round((minutos / 60) * 100) / 100;
}

function horasCorridas(ini, fim) {
  const a = paraMs(ini);
  const b = paraMs(fim);
  if (a === null || b === null || b < a) return null;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

/** Verde até 80% do prazo, âmbar até 100%, vermelho acima. Sem prazo -> neutro. */
function farolDe(decorrido, prazo) {
  const p = Number(prazo);
  if (decorrido === null || decorrido === undefined || !(p > 0)) return "neutro";
  const r = decorrido / p;
  if (r <= 0.8) return "verde";
  if (r <= 1) return "ambar";
  return "vermelho";
}

const sansAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const primeiroNome = (s) => sansAcento(s).split(/\s+/)[0] || "";

/**
 * Status que o pedido deve ter segundo as etapas já gravadas. Usado na
 * importação do histórico e ao reabrir um pedido cancelado.
 */
function statusPelasEtapas(etapas) {
  if (!etapas.length) return "a_fazer";
  const ordem = { criacao: 0, validacao: 1, postagem: 2 };
  const ult = [...etapas].sort(
    (x, y) =>
      (ordem[x.etapa] - ordem[y.etapa]) ||
      (x.rodada - y.rodada) ||
      (Number(x.id || 0) - Number(y.id || 0))
  )[etapas.length - 1];
  const aberta = !ult.fim;
  if (ult.etapa === "criacao") return aberta ? "em_criacao" : "em_validacao";
  if (ult.etapa === "validacao") {
    if (aberta) return "em_validacao";
    return ult.resultado === "ajustes" ? "em_ajustes" : "validado";
  }
  return aberta ? "em_postagem" : "concluido";
}

module.exports = {
  ETAPAS,
  STATUS_ABERTOS,
  STATUS_FINAIS,
  STATUS_TODOS,
  EXPEDIENTE_PADRAO,
  agoraBahia,
  hojeBahia,
  somarDias,
  normalizarDataHora,
  paraMs,
  carregarExpediente,
  expedienteValido,
  horasUteis,
  horasCorridas,
  farolDe,
  sansAcento,
  primeiroNome,
  statusPelasEtapas,
};
