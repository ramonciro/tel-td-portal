/**
 * rhRetencaoService.js — Turnover e pesquisa de desligamento do RH (Pacote 8, 13/11/2026)
 *
 * Três planilhas alimentam esta frente (todas com simulação antes de gravar):
 *  - Desligamentos: uma linha por pessoa que saiu (matrícula + data do desligamento são obrigatórias);
 *  - Quadro mensal: quantas pessoas havia em cada mês (denominador do turnover; por serviço/site é opcional);
 *  - Pesquisa de desligamento: motivo principal, notas de 1 a 5, "recomendaria" e comentário, ligada ao desligamento pela matrícula.
 *
 * Privacidade: o dado de cada pessoa (nome, comentário) só aparece para coordenador_rh e analista_rh; gestor_rh recebe só totais
 * e percentuais de grupos com o mínimo de pessoas do projeto (mesmo mínimo do Canguru). Comentário da pesquisa nunca leva nome,
 * e texto com código CID é cortado na importação. Esta frente NÃO é aberta ao perfil cliente.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const R = require("../lib/rhBase");
const Canguru = require("./rhCangaruService");
const { matriculaParaComparar, nomesParecidos } = require("./pessoasService");

const erroHttp = (status, message) => { const e = new Error(message); e.status = status; return e; };
const chave = R.chave;
const arred1 = (v) => Math.round(v * 10) / 10;
const pct = (a, b) => (b ? arred1((a / b) * 100) : null);
const RE_CID = /\bCID\b|\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/;
const MAX_TEXTO = 1500;
const DIMENSOES = [["lideranca", "Liderança"], ["remuneracao", "Remuneração e benefícios"], ["ambiente", "Ambiente e colegas"], ["carreira", "Carreira e crescimento"], ["atividades", "Atividades do dia a dia"], ["condicoes", "Condições de trabalho"]];
const TIPOS = { voluntario: "Pedido de demissão", involuntario: "Iniciativa da empresa", outro: "Outro", nao_informado: "Não informado" };
const FAIXAS_TEMPO = [["0 a 30 dias", 0, 30], ["31 a 60 dias", 31, 60], ["61 a 90 dias", 61, 90], ["91 a 180 dias", 91, 180], ["181 a 365 dias", 181, 365], ["Mais de 1 ano", 366, 99999]];

// ── Datas ─────────────────────────────────────────────────────────────
const dataIso = (v) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const somaDias = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
const mesDe = (iso) => String(iso).slice(0, 7);
function proximoMes(ym) { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
function mesesEntre(de, ate) { const out = []; let m = mesDe(de); const fim = mesDe(ate); while (m <= fim && out.length < 240) { out.push(m); m = proximoMes(m); } return out; }
/** Aceita data do Excel (número), Date, dd/mm/aaaa e aaaa-mm-dd. Dia e mês precisam existir de verdade. */
function paraDataIso(v) {
  if (v === null || v === undefined || v === "") return null;
  let y, mo, d;
  if (v instanceof Date) { if (isNaN(v.getTime())) return null; return v.toISOString().slice(0, 10); }
  if (typeof v === "number") { const dt = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10); }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
/** "2026-10", "10/2026", "out/2026" ou uma data qualquer do mês → "2026-10". */
function paraCompetencia(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date || typeof v === "number") { const i = paraDataIso(v); return i ? i.slice(0, 7) : null; }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/); if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) { const i = paraDataIso(t); return i ? i.slice(0, 7) : null; }
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  m = chave(t).match(/^([a-z]{3})[a-z]*[\/\- ](\d{2,4})$/);
  if (m && MESES.includes(m[1])) return `${m[2].length === 2 ? "20" + m[2] : m[2]}-${String(MESES.indexOf(m[1]) + 1).padStart(2, "0")}`;
  return null;
}

// ── Leitura de planilha ───────────────────────────────────────────────
function lerPlanilha(buffer, nomeArquivo, achar, exigidas, mensagem) {
  const XLSX = require("xlsx");
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true }); } catch (_) { throw erroHttp(400, `Não consegui abrir “${nomeArquivo}”. Envie uma planilha .xlsx (ou .csv).`); }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: null, raw: true });
    if (!rows.length) continue;
    const cab = Object.keys(rows[0]);
    const cols = {};
    for (const [k, fn] of Object.entries(achar)) cols[k] = cab.find((h) => fn(chave(h))) || null;
    if (exigidas.every((k) => cols[k])) return { rows, cols };
  }
  throw erroHttp(400, mensagem);
}
const txt = (v, max = 150) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, max) : null; };
const simNao = (v) => { const t = chave(v); if (!t) return null; if (/^(s|sim|yes|y|1|true|verdadeiro)\b/.test(t)) return 1; if (/^(n|nao|no|0|false|falso)\b/.test(t)) return 0; return null; };

function tipoDe(v) {
  const t = chave(v);
  if (!t) return "nao_informado";
  // Código do folha: "Inic.Empregado ..." = a pessoa pediu para sair; "Inic.Empregador ..." = a empresa decidiu (testar antes do resto, porque ambos trazem "justa causa")
  if (/inic\.? ?empregador|iniciativa (da )?empresa|iniciativa (do )?empregador/.test(t)) return "involuntario";
  if (/inic\.? ?empregado|iniciativa (do )?(empregado|colaborador|funcionario)/.test(t)) return "voluntario";
  if (/termino de contrato|comum acordo|transferencia|falecimento|outros casos/.test(t)) return "outro";
  if (/invol|sem justa|com justa|justa causa|dispens|demitid|empresa/.test(t)) return "involuntario";
  if (/volunt|pedido|a pedido/.test(t)) return "voluntario";
  return "outro";
}

async function mapaNovatos(empresaId) {
  const [rows] = await pool.query(
    `SELECT n.id, n.matricula, p.matricula AS mat_pessoa FROM rh_canguru_novatos n LEFT JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id WHERE n.empresa_id = ?`, [empresaId]);
  const m = new Map();
  for (const r of rows) for (const x of [r.matricula, r.mat_pessoa]) { const k = matriculaParaComparar(x); if (k && !m.has(k)) m.set(k, r.id); }
  return m;
}

// ── Importação: desligamentos ─────────────────────────────────────────
const COL_DESLIG = {
  mat: (h) => h === "matricula" || h.startsWith("matric"),
  deslig: (h) => (/desligament|demissao|rescisao|saida|data de saida/.test(h) && !/tipo|motivo|causa/.test(h)) && /data|dt|^desligamento$|^demissao$/.test(h),
  adm: (h) => /admissao/.test(h),
  nome: (h) => h === "nome" || h === "colaborador" || h === "funcionario" || h === "nome do colaborador" || h === "nome completo",
  cargo: (h) => h === "cargo" || h === "funcao" || h === "posicao",
  servico: (h) => /^(servico|operacao|campanha|carteira|centro de custo)$/.test(h) || h.startsWith("servico"),
  site: (h) => /^(site|unidade|local|filial)$/.test(h),
  coord: (h) => h.startsWith("coordenad"),
  sup: (h) => h.startsWith("supervis"),
  tipo: (h) => /tipo|modalidade|categoria/.test(h) && !/data/.test(h),
  motivo: (h) => /^(motivo|causa|justificativa)/.test(h) || h === "motivo do desligamento" || h === "motivo da saida",
  recontrata: (h) => /recontrat|elegivel|readmit/.test(h),
};

async function importarDesligamentos({ empresaId, usuario, arquivo, simular }) {
  if (!arquivo) throw erroHttp(400, "Envie a planilha (.xlsx) de desligamentos.");
  const { rows, cols } = lerPlanilha(arquivo.buffer, arquivo.nome, COL_DESLIG, ["mat", "deslig"], `“${arquivo.nome}” precisa ter as colunas “Matrícula” e “Data do desligamento”. Baixe o modelo na própria tela.`);
  const hoje = R.hojeISO();
  const novatos = await mapaNovatos(empresaId);
  const [ex] = await pool.query(`SELECT id, matricula_chave, data_desligamento, nome, cargo, servico, site, coordenador, supervisor, data_admissao, tipo, motivo, recontratavel FROM rh_desligamentos WHERE empresa_id = ?`, [empresaId]);
  const existentes = new Map(ex.map((e) => [`${e.matricula_chave}|${dataIso(e.data_desligamento)}`, e]));
  const rel = { simulacao: !!simular, arquivo: arquivo.nome, linhas: { lidas: rows.length, vazias: 0, duplicadas: 0 }, resultado: { novas: 0, atualizadas: 0, iguais: 0, gravadas: 0 }, problemas: [], avisos: [], resumo: { voluntarios: 0, involuntarios: 0, outros: 0, nao_informado: 0, saida_precoce: 0, ligados_ao_canguru: 0 } };
  const vistos = new Set(); const aplicar = []; let admPosterior = 0;
  rows.forEach((r, i) => {
    const linha = i + 2;
    const matBruta = r[cols.mat]; const k = matriculaParaComparar(matBruta);
    const dRaw = r[cols.deslig];
    if (!k && (dRaw === null || String(dRaw).trim() === "")) { rel.linhas.vazias += 1; return; }
    const nome = cols.nome ? txt(r[cols.nome]) : null;
    const prob = (motivo) => rel.problemas.push({ linha, matricula: matBruta ? String(matBruta) : null, nome, motivo });
    if (!k) return prob("Sem matrícula");
    const dd = paraDataIso(dRaw);
    if (!dd) return prob("Data do desligamento inválida (use dia/mês/ano)");
    if (dd > hoje) return prob("Data do desligamento no futuro");
    if (dd < "2000-01-01") return prob("Data do desligamento muito antiga (confira o ano)");
    const id = `${k}|${dd}`;
    if (vistos.has(id)) { rel.linhas.duplicadas += 1; return; }
    vistos.add(id);
    let adm = cols.adm ? paraDataIso(r[cols.adm]) : null;
    if (adm && adm > dd) { admPosterior += 1; adm = null; }
    const tipo = cols.tipo ? tipoDe(r[cols.tipo]) : "nao_informado";
    const reg = { k, matricula: String(matBruta).trim().slice(0, 40), nome, cargo: cols.cargo ? txt(r[cols.cargo], 120) : null, servico: cols.servico ? txt(r[cols.servico]) : null, site: cols.site ? txt(r[cols.site]) : null,
      coord: cols.coord ? txt(r[cols.coord]) : null, sup: cols.sup ? txt(r[cols.sup]) : null, adm, dd, tipo, motivo: cols.motivo ? txt(r[cols.motivo]) : null, recont: cols.recontrata ? simNao(r[cols.recontrata]) : null, novato: novatos.get(k) || null };
    const e = existentes.get(id);
    if (e) {
      const igual = (e.nome || null) === reg.nome && (e.servico || null) === reg.servico && (e.site || null) === reg.site && (e.cargo || null) === reg.cargo && (e.coordenador || null) === reg.coord && (e.supervisor || null) === reg.sup
        && dataIso(e.data_admissao) === reg.adm && e.tipo === reg.tipo && (e.motivo || null) === reg.motivo && (e.recontratavel ?? null) === reg.recont;
      if (igual) rel.resultado.iguais += 1; else { rel.resultado.atualizadas += 1; aplicar.push(reg); }
    } else { rel.resultado.novas += 1; aplicar.push(reg); }
    if (tipo === "voluntario") rel.resumo.voluntarios += 1; else if (tipo === "involuntario") rel.resumo.involuntarios += 1; else if (tipo === "outro") rel.resumo.outros += 1; else rel.resumo.nao_informado += 1;
    if (adm && diasEntre(adm, dd) <= 90) rel.resumo.saida_precoce += 1;
    if (reg.novato) rel.resumo.ligados_ao_canguru += 1;
  });
  if (rel.problemas.length) rel.avisos.unshift(`${rel.problemas.length} linha(s) com problema não foram gravadas. Corrija na planilha e envie de novo (as demais já estão certas).`);
  if (admPosterior) rel.avisos.push(`${admPosterior} linha(s) têm a admissão depois do desligamento (comum em recontratação com a mesma matrícula): a data de admissão dessas foi ignorada.`);
  if (!cols.tipo) rel.avisos.push("A planilha não tem coluna de tipo de desligamento (pedido de demissão x iniciativa da empresa): o turnover voluntário e o involuntário ficarão como “não informado”.");
  if (!cols.adm) rel.avisos.push("Sem a coluna de data de admissão não dá para calcular a saída precoce (até 90 dias de casa).");
  if (!cols.servico) rel.avisos.push("Sem a coluna de serviço o turnover não sai por serviço.");
  if (simular) return rel;
  await comTransacao(async (conn) => {
    for (let i = 0; i < aplicar.length; i += 400) {
      const lote = aplicar.slice(i, i + 400);
      await conn.query(
        `INSERT INTO rh_desligamentos (empresa_id, matricula, matricula_chave, nome, cargo, servico, site, coordenador, supervisor, data_admissao, data_desligamento, tipo, motivo, recontratavel, novato_id, importado_por)
         VALUES ?
         ON DUPLICATE KEY UPDATE matricula = VALUES(matricula), nome = VALUES(nome), cargo = VALUES(cargo), servico = VALUES(servico), site = VALUES(site), coordenador = VALUES(coordenador), supervisor = VALUES(supervisor),
           data_admissao = VALUES(data_admissao), tipo = VALUES(tipo), motivo = VALUES(motivo), recontratavel = VALUES(recontratavel), novato_id = VALUES(novato_id), importado_por = VALUES(importado_por)`,
        [lote.map((g) => [empresaId, g.matricula, g.k, g.nome, g.cargo, g.servico, g.site, g.coord, g.sup, g.adm, g.dd, g.tipo, g.motivo, g.recont, g.novato, usuario?.id ?? null])]);
      rel.resultado.gravadas += lote.length;
    }
  });
  return rel;
}

// ── Importação: quadro mensal ─────────────────────────────────────────
const COL_QUADRO = {
  comp: (h) => /competencia|^mes$|^periodo$|^mes\/ano|^data$|mes de referencia|referencia/.test(h),
  hc: (h) => /headcount|^hc$|quadro|efetivo|colaboradores|ativos|quantidade|^qtd/.test(h),
  servico: (h) => /^(servico|operacao|campanha|carteira)/.test(h),
  site: (h) => /^(site|unidade|local|filial)$/.test(h),
};
async function importarQuadro({ empresaId, usuario, arquivo, simular }) {
  if (!arquivo) throw erroHttp(400, "Envie a planilha (.xlsx) com o quadro mensal.");
  const { rows, cols } = lerPlanilha(arquivo.buffer, arquivo.nome, COL_QUADRO, ["comp", "hc"], `“${arquivo.nome}” precisa ter as colunas “Competência” (mês/ano) e “Headcount” (quantidade de pessoas). Serviço e site são opcionais. Baixe o modelo na própria tela.`);
  const hoje = R.hojeISO();
  const [ex] = await pool.query(`SELECT competencia, servico, site, headcount FROM rh_quadro WHERE empresa_id = ?`, [empresaId]);
  const existentes = new Map(ex.map((e) => [`${e.competencia}|${e.servico}|${e.site}`, Number(e.headcount)]));
  const rel = { simulacao: !!simular, arquivo: arquivo.nome, linhas: { lidas: rows.length, vazias: 0, duplicadas: 0 }, resultado: { novas: 0, atualizadas: 0, iguais: 0, gravadas: 0 }, problemas: [], avisos: [], resumo: { meses: 0, de: null, ate: null, por_servico: !!cols.servico } };
  const vistos = new Map(); const aplicar = []; const meses = new Set();
  rows.forEach((r, i) => {
    const linha = i + 2;
    const cRaw = r[cols.comp], hRaw = r[cols.hc];
    if ((cRaw === null || String(cRaw).trim() === "") && (hRaw === null || String(hRaw).trim() === "")) { rel.linhas.vazias += 1; return; }
    const prob = (motivo) => rel.problemas.push({ linha, matricula: null, nome: null, motivo });
    const comp = paraCompetencia(cRaw);
    if (!comp) return prob("Competência inválida (use mês/ano, por exemplo 10/2026)");
    if (comp > hoje.slice(0, 7)) return prob("Competência no futuro");
    if (comp < "2000-01") return prob("Competência muito antiga (confira o ano)");
    const hc = Number(String(hRaw ?? "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(hc) || hc < 0 || hc > 1000000 || !Number.isInteger(Math.round(hc))) return prob("Headcount inválido (use um número inteiro)");
    const servico = cols.servico ? (txt(r[cols.servico]) || "") : ""; const site = cols.site ? (txt(r[cols.site]) || "") : "";
    const id = `${comp}|${servico}|${site}`;
    if (vistos.has(id)) { rel.linhas.duplicadas += 1; if (vistos.get(id) !== Math.round(hc)) prob("Competência repetida na planilha com headcount diferente (valeu o primeiro)"); return; }
    vistos.set(id, Math.round(hc)); meses.add(comp);
    const antes = existentes.get(id);
    if (antes === undefined) rel.resultado.novas += 1; else if (antes === Math.round(hc)) { rel.resultado.iguais += 1; return; } else rel.resultado.atualizadas += 1;
    aplicar.push({ comp, servico, site, hc: Math.round(hc) });
  });
  const ord = [...meses].sort(); rel.resumo.meses = ord.length; rel.resumo.de = ord[0] || null; rel.resumo.ate = ord[ord.length - 1] || null;
  if (rel.problemas.length) rel.avisos.unshift(`${rel.problemas.length} linha(s) com problema não foram gravadas. Corrija na planilha e envie de novo (as demais já estão certas).`);
  if (!cols.servico) rel.avisos.push("Sem a coluna de serviço, o quadro vale só para o turnover geral; o turnover por serviço fica sem percentual (aparece só a quantidade de saídas).");
  if (simular) return rel;
  await comTransacao(async (conn) => {
    for (let i = 0; i < aplicar.length; i += 500) {
      const lote = aplicar.slice(i, i + 500);
      await conn.query(`INSERT INTO rh_quadro (empresa_id, competencia, servico, site, headcount, importado_por) VALUES ? ON DUPLICATE KEY UPDATE headcount = VALUES(headcount), importado_por = VALUES(importado_por)`, [lote.map((g) => [empresaId, g.comp, g.servico, g.site, g.hc, usuario?.id ?? null])]);
      rel.resultado.gravadas += lote.length;
    }
  });
  return rel;
}

// ── Importação: pesquisa de desligamento ──────────────────────────────
const COL_PESQ = {
  mat: (h) => h === "matricula" || h.startsWith("matric"),
  data: (h) => /^data( da)?( resposta| pesquisa| entrevista)?$|data da resposta|data da entrevista|respondida em/.test(h),
  motivo: (h) => /motivo principal|principal motivo|motivo da saida|^motivo$|motivo do desligamento/.test(h),
  lideranca: (h) => /lider|gestor|supervis/.test(h),
  remuneracao: (h) => /remunera|salari|benefic/.test(h),
  ambiente: (h) => /ambiente|colegas|clima|relacionament/.test(h),
  carreira: (h) => /carreira|crescimento|desenvolvimento|promoc/.test(h),
  atividades: (h) => /atividade|trabalho|funcao/.test(h) && !/condic/.test(h),
  condicoes: (h) => /condic|estrutura|ferramenta|jornada|escala/.test(h),
  recomendaria: (h) => /recomend|indicaria/.test(h),
  voltaria: (h) => /voltaria|retornaria|trabalharia novamente|recontrat/.test(h),
  comentario: (h) => /coment|observac|sugest|texto|relato/.test(h),
  servico: (h) => /^(servico|operacao|campanha)/.test(h),
  site: (h) => /^(site|unidade|local|filial)$/.test(h),
};
async function importarPesquisa({ empresaId, usuario, arquivo, simular }) {
  if (!arquivo) throw erroHttp(400, "Envie a planilha (.xlsx) da pesquisa de desligamento.");
  const { rows, cols } = lerPlanilha(arquivo.buffer, arquivo.nome, COL_PESQ, ["mat"], `“${arquivo.nome}” precisa ter a coluna “Matrícula” e ao menos o motivo principal, uma nota ou um comentário. Baixe o modelo na própria tela.`);
  if (!cols.motivo && !DIMENSOES.some(([d]) => cols[d]) && !cols.comentario) throw erroHttp(400, `“${arquivo.nome}” precisa ter ao menos o motivo principal, uma nota (de 1 a 5) ou um comentário. Baixe o modelo na própria tela.`);
  const hoje = R.hojeISO();
  const cfg = await Canguru.carregarConfig(empresaId);
  const termos = String(cfg.termos_prioritarios || "").split(",").map((t) => chave(t)).filter(Boolean);
  const [ds] = await pool.query(`SELECT id, matricula_chave, data_desligamento, servico, site FROM rh_desligamentos WHERE empresa_id = ? ORDER BY data_desligamento DESC`, [empresaId]);
  const porMat = new Map(); for (const d of ds) { if (!porMat.has(d.matricula_chave)) porMat.set(d.matricula_chave, []); porMat.get(d.matricula_chave).push(d); }
  const [ex] = await pool.query(`SELECT matricula_chave, data_resposta FROM rh_desl_pesquisa WHERE empresa_id = ?`, [empresaId]);
  const existentes = new Set(ex.map((e) => `${e.matricula_chave}|${dataIso(e.data_resposta)}`));
  const rel = { simulacao: !!simular, arquivo: arquivo.nome, linhas: { lidas: rows.length, vazias: 0, duplicadas: 0 }, resultado: { novas: 0, atualizadas: 0, iguais: 0, gravadas: 0 }, problemas: [], avisos: [], resumo: { ligadas_ao_desligamento: 0, sem_desligamento: 0, notas_fora_da_escala: 0, comentarios_com_cid_removidos: 0, prioritarias: 0 } };
  const vistos = new Set(); const aplicar = [];
  rows.forEach((r, i) => {
    const linha = i + 2; const matBruta = r[cols.mat]; const k = matriculaParaComparar(matBruta);
    const brutos = [cols.motivo, cols.comentario, ...DIMENSOES.map(([d]) => cols[d])].filter(Boolean).map((c) => r[c]);
    if (!k && brutos.every((v) => v === null || String(v).trim() === "")) { rel.linhas.vazias += 1; return; }
    const prob = (motivo) => rel.problemas.push({ linha, matricula: matBruta ? String(matBruta) : null, nome: null, motivo });
    if (!k) return prob("Sem matrícula");
    const lista = porMat.get(k) || [];
    let dResp = cols.data ? paraDataIso(r[cols.data]) : null;
    if (cols.data && r[cols.data] !== null && String(r[cols.data]).trim() !== "" && !dResp) return prob("Data da resposta inválida (use dia/mês/ano)");
    const desl = dResp ? (lista.find((d) => dataIso(d.data_desligamento) <= somaDias(dResp, 30) && dataIso(d.data_desligamento) >= somaDias(dResp, -120)) || lista[0] || null) : (lista[0] || null);
    if (!dResp) dResp = desl ? dataIso(desl.data_desligamento) : null;
    if (!dResp) return prob("Sem data da resposta e a matrícula não está nos desligamentos importados (informe a data ou importe os desligamentos antes)");
    if (dResp > hoje) return prob("Data da resposta no futuro");
    const id = `${k}|${dResp}`;
    if (vistos.has(id)) { rel.linhas.duplicadas += 1; return; }
    vistos.add(id);
    const g = { k, dResp, desl: desl ? desl.id : null, servico: desl?.servico || (cols.servico ? txt(r[cols.servico]) : null), site: desl?.site || (cols.site ? txt(r[cols.site]) : null), motivo: cols.motivo ? txt(r[cols.motivo]) : null, rec: cols.recomendaria ? simNao(r[cols.recomendaria]) : null, volt: cols.voltaria ? simNao(r[cols.voltaria]) : null, notas: {}, comentario: null, prioritario: 0 };
    for (const [d] of DIMENSOES) {
      if (!cols[d]) continue;
      const v = r[cols[d]]; if (v === null || String(v).trim() === "") continue;
      const n = Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n < 1 || n > 5) { rel.resumo.notas_fora_da_escala += 1; continue; }
      g.notas[d] = Math.round(n);
    }
    let c = cols.comentario ? txt(r[cols.comentario], MAX_TEXTO) : null;
    if (c && RE_CID.test(c)) { c = null; rel.resumo.comentarios_com_cid_removidos += 1; }
    if (c) { g.comentario = c; const t = chave(c); if (termos.some((x) => t.includes(x))) { g.prioritario = 1; rel.resumo.prioritarias += 1; } }
    if (!g.motivo && !Object.keys(g.notas).length && !g.comentario && g.rec === null && g.volt === null) return prob("Linha sem motivo, nota ou comentário");
    if (g.desl) rel.resumo.ligadas_ao_desligamento += 1; else rel.resumo.sem_desligamento += 1;
    if (existentes.has(id)) rel.resultado.atualizadas += 1; else rel.resultado.novas += 1;
    aplicar.push(g);
  });
  if (rel.problemas.length) rel.avisos.unshift(`${rel.problemas.length} linha(s) com problema não foram gravadas. Corrija na planilha e envie de novo (as demais já estão certas).`);
  if (rel.resumo.sem_desligamento) rel.avisos.push(`${rel.resumo.sem_desligamento} resposta(s) não têm desligamento importado com a mesma matrícula: entram na pesquisa, mas sem serviço e site (a menos que a planilha traga essas colunas). Importe os desligamentos primeiro para ligar tudo.`);
  if (rel.resumo.notas_fora_da_escala) rel.avisos.push(`${rel.resumo.notas_fora_da_escala} nota(s) fora da escala de 1 a 5 foram ignoradas.`);
  if (rel.resumo.comentarios_com_cid_removidos) rel.avisos.push(`${rel.resumo.comentarios_com_cid_removidos} comentário(s) com código de doença (CID) não foram gravados, para não guardar dado de saúde.`);
  if (simular) return rel;
  await comTransacao(async (conn) => {
    for (const g of aplicar) {
      await conn.query(
        `INSERT INTO rh_desl_pesquisa (empresa_id, matricula_chave, desligamento_id, data_resposta, servico, site, motivo_principal, nota_lideranca, nota_remuneracao, nota_ambiente, nota_carreira, nota_atividades, nota_condicoes, recomendaria, voltaria, comentario, prioritario, importado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE desligamento_id = VALUES(desligamento_id), servico = VALUES(servico), site = VALUES(site), motivo_principal = VALUES(motivo_principal), nota_lideranca = VALUES(nota_lideranca), nota_remuneracao = VALUES(nota_remuneracao),
           nota_ambiente = VALUES(nota_ambiente), nota_carreira = VALUES(nota_carreira), nota_atividades = VALUES(nota_atividades), nota_condicoes = VALUES(nota_condicoes), recomendaria = VALUES(recomendaria), voltaria = VALUES(voltaria), comentario = VALUES(comentario), prioritario = VALUES(prioritario), importado_por = VALUES(importado_por)`,
        [empresaId, g.k, g.desl, g.dResp, g.servico, g.site, g.motivo, g.notas.lideranca ?? null, g.notas.remuneracao ?? null, g.notas.ambiente ?? null, g.notas.carreira ?? null, g.notas.atividades ?? null, g.notas.condicoes ?? null, g.rec, g.volt, g.comentario, g.prioritario, usuario?.id ?? null]);
      rel.resultado.gravadas += 1;
    }
  });
  return rel;
}

/** Ranking de motivos; para o gestor, motivos com menos citações que o mínimo do projeto viram uma linha só (“Outros motivos”). */
function agruparMotivos(lista, total, minimo, limite) {
  const ord = lista.sort((a, b) => b.n - a.n);
  let out = ord, resto = 0;
  if (minimo > 0) { out = ord.filter((x) => x.n >= minimo); resto = ord.filter((x) => x.n < minimo).reduce((a, x) => a + x.n, 0); }
  out = out.slice(0, limite).map((x) => ({ ...x, pct: pct(x.n, total) }));
  if (resto >= (minimo || Infinity)) out.push({ rotulo: "Outros motivos (citados poucas vezes)", n: resto, pct: pct(resto, total) });
  return out;
}

// ── Turnover ──────────────────────────────────────────────────────────
function periodoPadrao(f) {
  const ok = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  const hoje = R.hojeISO();
  let ate = ok(f.ate) || hoje;
  let de = ok(f.de);
  if (!de) { const m = mesDe(ate); const y = +m.slice(0, 4), mo = +m.slice(5, 7); const ini = new Date(Date.UTC(y, mo - 1 - 11, 1)); de = ini.toISOString().slice(0, 10); }
  if (de > ate) throw erroHttp(400, "A data inicial não pode ser depois da final.");
  if (diasEntre(de, ate) > 366 * 5) throw erroHttp(400, "O período pode ter no máximo 5 anos.");
  return { de, ate };
}

/** Headcount de uma competência para o filtro dado (ou null quando o quadro não tem esse recorte). */
function headcountDoMes(linhas, f) {
  const meus = linhas.filter((q) => (!f.servico || q.servico === f.servico) && (!f.site || q.site === f.site));
  if (!meus.length) return null;
  if (!f.servico && !f.site) { const geral = meus.find((q) => q.servico === "" && q.site === ""); if (geral) return Number(geral.headcount); }
  // sem filtro: soma por serviço (se houver serviço) para não contar duas vezes o mesmo grupo; com filtro: soma o que casar
  if (!f.servico && !f.site) {
    const comServ = meus.filter((q) => q.servico !== ""); if (comServ.length) return comServ.reduce((a, q) => a + Number(q.headcount), 0);
    return meus.reduce((a, q) => a + Number(q.headcount), 0);
  }
  return meus.reduce((a, q) => a + Number(q.headcount), 0);
}

async function turnover(empresaId, filtros, { ocultar }) {
  const cfg = await Canguru.carregarConfig(empresaId);
  const { de, ate } = periodoPadrao(filtros);
  const f = { servico: txt(filtros.servico) || null, site: txt(filtros.site) || null };
  const params = [empresaId, de, ate]; let where = "empresa_id = ? AND data_desligamento BETWEEN ? AND ?";
  if (f.servico) { where += " AND servico = ?"; params.push(f.servico); }
  if (f.site) { where += " AND site = ?"; params.push(f.site); }
  const [rows] = await pool.query(`SELECT id, servico, site, data_admissao, data_desligamento, tipo, motivo, novato_id FROM rh_desligamentos WHERE ${where}`, params);
  if (ocultar && rows.length < cfg.min_grupo) return { ok: true, poucos: true, periodo: { de, ate }, filtros_aplicados: f, min_grupo: cfg.min_grupo, desligamentos: rows.length, mensagem: `Houve poucas saídas no período (menos de ${cfg.min_grupo}) para mostrar o resultado sem identificar ninguém.`, tipos: TIPOS };
  const meses = mesesEntre(de, ate);
  const [quadro] = await pool.query(`SELECT competencia, servico, site, headcount FROM rh_quadro WHERE empresa_id = ? AND competencia BETWEEN ? AND ?`, [empresaId, mesDe(de), mesDe(ate)]);
  const quadroPorMes = new Map(); for (const q of quadro) { if (!quadroPorMes.has(q.competencia)) quadroPorMes.set(q.competencia, []); quadroPorMes.get(q.competencia).push(q); }

  const novatoOk = (d) => d.data_admissao ? diasEntre(dataIso(d.data_admissao), dataIso(d.data_desligamento)) : null;
  const mensal = meses.map((m) => {
    const doMes = rows.filter((d) => mesDe(dataIso(d.data_desligamento)) === m);
    const hc = quadroPorMes.has(m) ? headcountDoMes(quadroPorMes.get(m), f) : null;
    return { mes: m, desligamentos: doMes.length, voluntarios: doMes.filter((d) => d.tipo === "voluntario").length, involuntarios: doMes.filter((d) => d.tipo === "involuntario").length, headcount: hc, taxa: hc ? pct(doMes.length, hc) : null };
  });
  const comHc = mensal.filter((x) => x.headcount);
  const hcMedio = comHc.length ? Math.round(comHc.reduce((a, x) => a + x.headcount, 0) / comHc.length) : null;
  const desligComHc = comHc.reduce((a, x) => a + x.desligamentos, 0);
  const tx = (n, hc, nMeses) => (hc && nMeses ? arred1((n / nMeses / hc) * 100) : null);
  const tenure = rows.map(novatoOk);
  const comAdm = tenure.filter((t) => t !== null);
  const precoces = comAdm.filter((t) => t <= 90).length;
  const tipoN = (t) => rows.filter((d) => d.tipo === t).length;
  const geral = {
    desligamentos: rows.length, voluntarios: tipoN("voluntario"), involuntarios: tipoN("involuntario"), outros: tipoN("outro"), nao_informado: tipoN("nao_informado"),
    pct_voluntario: pct(tipoN("voluntario"), tipoN("voluntario") + tipoN("involuntario")),
    com_admissao: comAdm.length, saida_precoce: precoces, saida_precoce_pct: pct(precoces, comAdm.length),
    headcount_medio: hcMedio, meses_com_quadro: comHc.length,
    taxa_mensal_media: hcMedio ? tx(desligComHc, hcMedio, comHc.length) : null,
    taxa_periodo: hcMedio ? arred1((desligComHc / hcMedio) * 100) : null,
  };
  const faixas = FAIXAS_TEMPO.map(([rotulo, a, b]) => { const n = comAdm.filter((t) => t >= a && t <= b).length; return { rotulo, n, pct: pct(n, comAdm.length) }; });
  const motivosMap = new Map();
  for (const d of rows) { const k = chave(d.motivo); if (!k) continue; const e = motivosMap.get(k) || { rotulo: d.motivo, n: 0 }; e.n += 1; motivosMap.set(k, e); }
  const comMotivo = [...motivosMap.values()].reduce((a, x) => a + x.n, 0);
  const motivos = agruparMotivos([...motivosMap.values()], comMotivo, ocultar ? cfg.min_grupo : 0, 10);

  // por serviço e por site: taxa só quando o quadro tem aquele recorte
  async function porDim(campo) {
    const mapa = new Map();
    for (const d of rows) { const v = d[campo] || null; const e = mapa.get(v) || { valor: v, n: 0, vol: 0, prec: 0, comAdm: 0 }; e.n += 1; if (d.tipo === "voluntario") e.vol += 1; const t = novatoOk(d); if (t !== null) { e.comAdm += 1; if (t <= 90) e.prec += 1; } mapa.set(v, e); }
    const out = [];
    for (const e of mapa.values()) {
      const ff = { ...f, [campo]: e.valor };
      const hcs = meses.map((m) => (quadroPorMes.has(m) && e.valor ? headcountDoMes(quadroPorMes.get(m), ff) : null)).filter((x) => x);
      const hcm = hcs.length ? hcs.reduce((a, x) => a + x, 0) / hcs.length : null;
      const poucos = e.n < cfg.min_grupo;
      out.push({ rotulo: campo === "site" ? Canguru.rotuloSite(e.valor) : (e.valor || "Sem serviço"), valor: e.valor, desligamentos: e.n, voluntarios: e.vol, saida_precoce: e.prec, saida_precoce_pct: pct(e.prec, e.comAdm), headcount_medio: hcm ? Math.round(hcm) : null, taxa_periodo: hcm ? arred1((e.n / hcm) * 100) : null, poucos });
    }
    out.sort((a, b) => b.desligamentos - a.desligamentos);
    const visiveis = ocultar ? out.filter((x) => !x.poucos) : out;
    return { linhas: visiveis.slice(0, 60), ocultos: ocultar ? out.length - visiveis.length : 0, total: out.length };
  }
  const [porServico, porSite] = [await porDim("servico"), await porDim("site")];

  // Ligação com o Canguru: dos que saíram até 90 dias de casa e estavam no Canguru, quantos já tinham sinal de atenção?
  let canguru = null;
  const prec = rows.filter((d) => d.novato_id && novatoOk(d) !== null && novatoOk(d) <= 90);
  if (prec.length) {
    const ids = prec.map((d) => d.novato_id);
    const [sinais] = await pool.query(`SELECT DISTINCT novato_id FROM rh_canguru_avaliacoes WHERE empresa_id = ? AND sinais > 0 AND novato_id IN (?)`, [empresaId, ids]);
    const nSinal = new Set(sinais.map((s) => s.novato_id)).size;
    if (!ocultar || prec.length >= cfg.min_grupo) canguru = { precoces_no_canguru: prec.length, com_sinal: nSinal, com_sinal_pct: pct(nSinal, prec.length) };
  }
  const avisos = [];
  if (!quadro.length) avisos.push("Ainda não há quadro mensal importado: o turnover aparece só em quantidade de saídas, sem percentual.");
  else if (comHc.length < meses.length) avisos.push(`O quadro mensal cobre ${comHc.length} de ${meses.length} mês(es) do período; o percentual usa só os meses com quadro.`);
  if (rows.length && geral.com_admissao < rows.length) avisos.push(`${rows.length - geral.com_admissao} desligamento(s) sem data de admissão ficam de fora do tempo de casa e da saída precoce.`);
  if (ocultar) avisos.push(`Grupos com menos de ${cfg.min_grupo} saídas não aparecem por serviço/site.`);
  avisos.push("Taxa = saídas ÷ headcount médio (do quadro mensal). “Saída precoce” = saiu com até 90 dias de casa.");
  return { ok: true, periodo: { de, ate }, filtros_aplicados: f, geral, mensal, faixas_tempo: faixas, motivos, por_servico: porServico, por_site: porSite, canguru, avisos, min_grupo: cfg.min_grupo, tipos: TIPOS };
}

async function opcoesTurnover(empresaId) {
  const [s] = await pool.query(`SELECT servico AS v, COUNT(*) AS n FROM rh_desligamentos WHERE empresa_id = ? AND servico IS NOT NULL AND servico <> '' GROUP BY servico ORDER BY servico`, [empresaId]);
  const [t] = await pool.query(`SELECT site AS v FROM rh_desligamentos WHERE empresa_id = ? AND site IS NOT NULL AND site <> '' GROUP BY site ORDER BY site`, [empresaId]);
  const [[tot]] = await pool.query(`SELECT COUNT(*) AS n, MIN(data_desligamento) AS de, MAX(data_desligamento) AS ate FROM rh_desligamentos WHERE empresa_id = ?`, [empresaId]);
  const [[q]] = await pool.query(`SELECT COUNT(*) AS n, MIN(competencia) AS de, MAX(competencia) AS ate FROM rh_quadro WHERE empresa_id = ?`, [empresaId]);
  return { servicos: s.map((x) => x.v), sites: t.map((x) => ({ valor: x.v, rotulo: Canguru.rotuloSite(x.v) })), base: { desligamentos: Number(tot.n), de: dataIso(tot.de), ate: dataIso(tot.ate), quadro_linhas: Number(q.n), quadro_de: q.de, quadro_ate: q.ate } };
}

/** Lista nominal (só equipe do RH). */
async function listaDesligamentos(empresaId, filtros, limite = 500) {
  const { de, ate } = periodoPadrao(filtros);
  const params = [empresaId, de, ate]; let where = "d.empresa_id = ? AND d.data_desligamento BETWEEN ? AND ?";
  const servico = txt(filtros.servico), site = txt(filtros.site);
  if (servico) { where += " AND d.servico = ?"; params.push(servico); }
  if (site) { where += " AND d.site = ?"; params.push(site); }
  const [rows] = await pool.query(
    `SELECT d.id, d.matricula, d.nome, d.cargo, d.servico, d.site, d.coordenador, d.supervisor, d.data_admissao, d.data_desligamento, d.tipo, d.motivo, d.recontratavel, d.novato_id,
            (SELECT COUNT(*) FROM rh_desl_pesquisa p WHERE p.empresa_id = d.empresa_id AND p.matricula_chave = d.matricula_chave) AS pesquisas
       FROM rh_desligamentos d WHERE ${where} ORDER BY d.data_desligamento DESC, d.id DESC LIMIT ${Math.min(2000, Math.max(1, Number(limite) || 500))}`, params);
  return rows.map((r) => ({ id: r.id, matricula: r.matricula, nome: r.nome, cargo: r.cargo, servico: r.servico, site: r.site ? Canguru.rotuloSite(r.site) : null, coordenador: r.coordenador, supervisor: r.supervisor, data_admissao: dataIso(r.data_admissao), data_desligamento: dataIso(r.data_desligamento),
    dias_de_casa: r.data_admissao ? diasEntre(dataIso(r.data_admissao), dataIso(r.data_desligamento)) : null, tipo: r.tipo, tipo_rotulo: TIPOS[r.tipo], motivo: r.motivo, recontratavel: r.recontratavel === null ? null : Number(r.recontratavel) === 1, no_canguru: !!r.novato_id, respondeu_pesquisa: Number(r.pesquisas) > 0 }));
}

async function removerDesligamento(empresaId, id) {
  const [[d]] = await pool.query(`SELECT id, matricula_chave, nome FROM rh_desligamentos WHERE id = ? AND empresa_id = ?`, [id, empresaId]);
  if (!d) throw erroHttp(404, "Desligamento não encontrado");
  await pool.query(`UPDATE rh_desl_pesquisa SET desligamento_id = NULL WHERE empresa_id = ? AND desligamento_id = ?`, [empresaId, id]);
  await pool.query(`DELETE FROM rh_desligamentos WHERE id = ? AND empresa_id = ?`, [id, empresaId]);
  return d;
}

// ── Pesquisa de desligamento: resultado ───────────────────────────────
async function resultadoPesquisa(empresaId, filtros, { ocultar }) {
  const cfg = await Canguru.carregarConfig(empresaId);
  const { de, ate } = periodoPadrao(filtros);
  const servico = txt(filtros.servico) || null, site = txt(filtros.site) || null;
  const params = [empresaId, de, ate]; let where = "empresa_id = ? AND data_resposta BETWEEN ? AND ?";
  if (servico) { where += " AND servico = ?"; params.push(servico); }
  if (site) { where += " AND site = ?"; params.push(site); }
  const [rows] = await pool.query(`SELECT * FROM rh_desl_pesquisa WHERE ${where}`, params);
  const [[dd]] = await pool.query(`SELECT COUNT(*) AS n FROM rh_desligamentos WHERE empresa_id = ? AND data_desligamento BETWEEN ? AND ?${servico ? " AND servico = ?" : ""}${site ? " AND site = ?" : ""}`, [empresaId, de, ate, ...(servico ? [servico] : []), ...(site ? [site] : [])]);
  const base = { ok: true, periodo: { de, ate }, filtros_aplicados: { servico, site }, min_grupo: cfg.min_grupo, dimensoes: DIMENSOES.map(([id, nome]) => ({ id, nome })) };
  if (ocultar && rows.length < cfg.min_grupo) return { ...base, poucos: true, respostas: rows.length, mensagem: `Ainda há poucas respostas (menos de ${cfg.min_grupo}) para mostrar o resultado sem identificar ninguém.` };
  const media = (lista, campo) => { const v = lista.map((r) => r[campo]).filter((x) => x !== null && x !== undefined).map(Number); return v.length ? { media: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, n: v.length } : { media: null, n: 0 }; };
  const notas = DIMENSOES.map(([id, nome]) => ({ id, nome, ...media(rows, `nota_${id}`) }));
  const sn = (campo) => { const v = rows.filter((r) => r[campo] !== null && r[campo] !== undefined); return { sim: v.filter((r) => Number(r[campo]) === 1).length, n: v.length, pct: pct(v.filter((r) => Number(r[campo]) === 1).length, v.length) }; };
  const motivosMap = new Map(); for (const r of rows) { const k = chave(r.motivo_principal); if (!k) continue; const e = motivosMap.get(k) || { rotulo: r.motivo_principal, n: 0 }; e.n += 1; motivosMap.set(k, e); }
  const comMotivo = [...motivosMap.values()].reduce((a, x) => a + x.n, 0);
  const motivos = agruparMotivos([...motivosMap.values()], comMotivo, ocultar ? cfg.min_grupo : 0, 12);
  const porDim = (campo) => {
    const mapa = new Map(); for (const r of rows) { const v = r[campo] || null; if (!mapa.has(v)) mapa.set(v, []); mapa.get(v).push(r); }
    const out = [...mapa.entries()].map(([v, lista]) => {
      const todas = lista.flatMap((r) => DIMENSOES.map(([d]) => r[`nota_${d}`]).filter((x) => x !== null && x !== undefined)).map(Number);
      const rec = lista.filter((r) => r.recomendaria !== null && r.recomendaria !== undefined);
      const principal = (() => { const m = new Map(); for (const r of lista) { const k = chave(r.motivo_principal); if (!k) continue; const e = m.get(k) || { rotulo: r.motivo_principal, n: 0 }; e.n += 1; m.set(k, e); } return [...m.values()].sort((a, b) => b.n - a.n)[0]?.rotulo || null; })();
      return { rotulo: campo === "site" ? Canguru.rotuloSite(v) : (v || "Sem serviço"), respostas: lista.length, nota_media: todas.length ? Math.round((todas.reduce((a, b) => a + b, 0) / todas.length) * 100) / 100 : null, recomendaria_pct: pct(rec.filter((r) => Number(r.recomendaria) === 1).length, rec.length), motivo_principal: principal, poucos: lista.length < cfg.min_grupo };
    }).sort((a, b) => b.respostas - a.respostas);
    const vis = ocultar ? out.filter((x) => !x.poucos) : out;
    return { linhas: vis.slice(0, 60), ocultos: ocultar ? out.length - vis.length : 0 };
  };
  const out = { ...base, respostas: rows.length, desligamentos_no_periodo: Number(dd.n), cobertura_pct: pct(rows.length, Number(dd.n)), notas, recomendaria: sn("recomendaria"), voltaria: sn("voltaria"), motivos, por_servico: porDim("servico"), por_site: porDim("site"), prioritarios: rows.filter((r) => Number(r.prioritario) === 1).length };
  if (ocultar) { out.prioritarios = null; }
  else {
    out.comentarios = rows.filter((r) => r.comentario).sort((a, b) => Number(b.prioritario) - Number(a.prioritario) || String(dataIso(b.data_resposta)).localeCompare(String(dataIso(a.data_resposta)))).slice(0, 100)
      .map((r) => ({ id: r.id, data: dataIso(r.data_resposta), servico: r.servico, site: r.site ? Canguru.rotuloSite(r.site) : null, motivo: r.motivo_principal, texto: r.comentario, prioritario: Number(r.prioritario) === 1 }));
  }
  out.avisos = [`Notas de 1 (pior) a 5 (melhor).${ocultar ? ` Grupos com menos de ${cfg.min_grupo} respostas não aparecem.` : ""}`];
  return out;
}

module.exports = {
  DIMENSOES, TIPOS, FAIXAS_TEMPO, importarDesligamentos, importarQuadro, importarPesquisa, turnover, opcoesTurnover, listaDesligamentos, removerDesligamento, resultadoPesquisa,
  paraDataIso, paraCompetencia, tipoDe, diasEntre, somaDias, dataIso, mesDe, periodoPadrao,
};
