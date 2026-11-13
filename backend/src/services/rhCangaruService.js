/**
 * rhCangaruService.js — Projeto Canguru do RH (Pacotes 3 e 4, 12/11/2026)
 *
 * Acompanha cada operador novato até os 90 dias com as três avaliações da plataforma interna de pesquisas
 * (arquivos "avaliação 30, 60 e 90", aplicadas no 25º, 40º e 85º dia). Entrada por planilha, com simulação antes de gravar.
 *
 * Privacidade (o Canguru é INDIVIDUAL; a proteção vem do acesso restrito, não do anonimato):
 *  - o login da planilha NUNCA é gravado; o nome fica só no cadastro de pessoas (a matrícula liga as duas coisas);
 *  - respostas e textos livres de uma pessoa só aparecem para coordenador_rh e analista_rh (ficha e fila de atenção);
 *  - gestor_rh e relatórios para cliente/diretoria recebem só totais e percentuais, em grupos com o mínimo de novatos;
 *  - texto livre com código CID é removido na importação; texto com palavras de saúde e segurança marca a resposta como prioritária;
 *  - cada abertura de ficha é registrada em rh_acessos_log (quem e quando, nunca o conteúdo).
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const R = require("../lib/rhBase");
const { resolverPessoa, matriculaParaComparar, nomeParaComparar, nomesParecidos } = require("./pessoasService");

const TIPOS = [30, 60, 90];
const TERMOS_PRIORITARIOS_PADRAO = "assedio,ameaca,agress,violen,acidente,adoec,depress,ansiedade,suicid,discrimin,racis,machis,preconceit,abuso,humilh,constrang,saude mental,afastament,lesao,perseguic,intimid,xingament,ofens";
const TERMOS_OPERACAO_PADRAO = "OPERADOR,TMK,TELEMARKETING";
const RE_CID = /\bCID\b|\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/;
const MAX_TEXTO = 1500;
const PASSOS = ["Identificar", "Compartilhar com a supervisão", "Analisar", "Alinhar com o novato", "Acompanhar"];
const SINAIS_ROTULO = { esp: "Expectativas", acol: "Acolhimento", lider: "Liderança", ativ: "Atividades", apoio: "Áreas de apoio", clima: "Clima com colegas" };

const erroHttp = (status, message, extra) => { const e = new Error(message); e.status = status; if (extra) Object.assign(e, extra); return e; };
const chave = R.chave;
const arred1 = (v) => Math.round(v * 10) / 10;
const arred2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b ? arred1((a / b) * 100) : null);

// Prefixo da empresa que a plataforma coloca no nome do site: some na tela (ex.: "ACM", "COMERCIO 3020").
const PREFIXO_SITE = new RegExp("^" + String.fromCharCode(84, 69, 76) + "\\s+", "i");
const rotuloSite = (s) => (s ? String(s).replace(PREFIXO_SITE, "").trim() || String(s) : "Sem site");

// ── Configuração ──────────────────────────────────────────────────────
const CFG_PADRAO = { dia_aval_1: 25, dia_aval_2: 40, dia_aval_3: 85, alerta_dias: 3, tolerancia_dias: 0, nota_sinal_max: 2, risco_moderado_min: 10, risco_alto_min: 20, min_grupo: 5, cobranca_a_partir_de: null, termos_operacao: TERMOS_OPERACAO_PADRAO, termos_prioritarios: TERMOS_PRIORITARIOS_PADRAO };
const MIN_GRUPO_MINIMO = 5;

async function carregarConfig(empresaId) {
  await pool.query(`INSERT IGNORE INTO rh_canguru_config (empresa_id, termos_prioritarios) VALUES (?, ?)`, [empresaId, TERMOS_PRIORITARIOS_PADRAO]);
  const [[c]] = await pool.query(`SELECT * FROM rh_canguru_config WHERE empresa_id = ?`, [empresaId]);
  const cfg = { ...CFG_PADRAO };
  for (const k of Object.keys(CFG_PADRAO)) if (c && c[k] !== null && c[k] !== undefined) cfg[k] = c[k];
  for (const k of ["dia_aval_1", "dia_aval_2", "dia_aval_3", "alerta_dias", "tolerancia_dias", "nota_sinal_max", "min_grupo"]) cfg[k] = Number(cfg[k]);
  for (const k of ["risco_moderado_min", "risco_alto_min"]) cfg[k] = Number(cfg[k]);
  cfg.cobranca_a_partir_de = c?.cobranca_a_partir_de ? dataIso(c.cobranca_a_partir_de) : null;
  return cfg;
}

function dataIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function salvarConfig(empresaId, corpo) {
  const cfg = await carregarConfig(empresaId);
  const n = (k, min, max) => { const v = Number(corpo[k] ?? cfg[k]); if (!Number.isFinite(v) || v < min || v > max) throw erroHttp(400, `Valor inválido em ${k}`); return v; };
  const novo = {
    dia_aval_1: Math.round(n("dia_aval_1", 1, 89)), dia_aval_2: Math.round(n("dia_aval_2", 2, 89)), dia_aval_3: Math.round(n("dia_aval_3", 3, 120)),
    alerta_dias: Math.round(n("alerta_dias", 0, 15)), tolerancia_dias: Math.round(n("tolerancia_dias", 0, 30)),
    nota_sinal_max: Math.round(n("nota_sinal_max", 0, 4)), risco_moderado_min: n("risco_moderado_min", 0, 100), risco_alto_min: n("risco_alto_min", 0, 100),
    min_grupo: Math.round(n("min_grupo", MIN_GRUPO_MINIMO, 1000)),
  };
  if (!(novo.dia_aval_1 < novo.dia_aval_2 && novo.dia_aval_2 < novo.dia_aval_3)) throw erroHttp(400, "Os dias das avaliações devem estar em ordem crescente");
  if (novo.risco_alto_min <= novo.risco_moderado_min) throw erroHttp(400, "O limite do risco alto deve ser maior que o do moderado");
  let desde = corpo.cobranca_a_partir_de === undefined ? cfg.cobranca_a_partir_de : corpo.cobranca_a_partir_de;
  if (desde === "" || desde === null) desde = null;
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde)) || isNaN(new Date(`${desde}T00:00:00Z`).getTime())) throw erroHttp(400, "Data inválida em “cobrar etapas a partir de”");
  const termosOp = String(corpo.termos_operacao ?? cfg.termos_operacao).split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!termosOp.length) throw erroHttp(400, "Informe pelo menos um termo de cargo da operação");
  const termosPr = String(corpo.termos_prioritarios ?? cfg.termos_prioritarios).split(",").map((t) => chave(t)).filter(Boolean);
  await pool.query(
    `UPDATE rh_canguru_config SET dia_aval_1=?, dia_aval_2=?, dia_aval_3=?, alerta_dias=?, tolerancia_dias=?, nota_sinal_max=?, risco_moderado_min=?, risco_alto_min=?, min_grupo=?, cobranca_a_partir_de=?, termos_operacao=?, termos_prioritarios=? WHERE empresa_id = ?`,
    [novo.dia_aval_1, novo.dia_aval_2, novo.dia_aval_3, novo.alerta_dias, novo.tolerancia_dias, novo.nota_sinal_max, novo.risco_moderado_min, novo.risco_alto_min, novo.min_grupo, desde, termosOp.join(","), termosPr.join(","), empresaId]
  );
  return { antes: cfg, depois: { ...novo, cobranca_a_partir_de: desde, termos_operacao: termosOp.join(","), termos_prioritarios: termosPr.join(",") } };
}

const etapasDe = (cfg) => [{ tipo: 30, dia: cfg.dia_aval_1 }, { tipo: 60, dia: cfg.dia_aval_2 }, { tipo: 90, dia: cfg.dia_aval_3 }];

// ── Leitura da planilha ───────────────────────────────────────────────
function paraData(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d.getTime()) ? null : d; }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  const iso = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0)));
  return null;
}
const sqlDataHora = (d) => (d ? d.toISOString().slice(0, 19).replace("T", " ") : null);

function lerLinhas(buffer, nomeArquivo) {
  const XLSX = require("xlsx");
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: false }); } catch (_) { throw erroHttp(400, `Não consegui abrir “${nomeArquivo}”. Envie a planilha .xlsx baixada da plataforma de pesquisas.`); }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: null, raw: true });
    if (rows.length && Object.keys(rows[0]).some((c) => chave(c) === "matricula")) return rows;
  }
  throw erroHttp(400, `“${nomeArquivo}” não tem a coluna Matrícula. Esta tela recebe as planilhas de avaliação 30, 60 e 90 dias.`);
}

// Colunas achadas pelo texto do cabeçalho (sem acento e sem maiúscula); não depende do nome do site nem da empresa.
const COLUNAS = [
  ["data", (h) => h === "data e hora"], ["nome", (h) => h === "nome"], ["matricula", (h) => h === "matricula"], ["site", (h) => h === "site"],
  ["funcao", (h) => h === "funcao"], ["servico", (h) => h === "servico"], ["supervisor", (h) => h === "supervisor"], ["coordenador", (h) => h === "coordenador"],
  ["tipo", (h) => h === "tipo de pesquisa"],
  ["esp_motivo", (h) => /^por que .*nao atendeu .*expectativas/.test(h)],
  ["esp", (h) => /atendeu .*expectativas\?$/.test(h) && !h.startsWith("por que")],
  ["acolhido_area", (h) => h.startsWith("em qual area nao se sentiu acolhido")],
  ["acolhido_texto", (h) => h.startsWith("justifique por que nao se sentiu acolhido")],
  ["acolhido", (h) => h.startsWith("me senti acolhido")],
  ["lider_motivo", (h) => h.startsWith("qual o principal motivo para nao considerar")],
  ["lider_texto", (h) => h.startsWith("justifique sua avaliacao sobre a lideranca")],
  ["lider", (h) => h.startsWith("considero meu lider")],
  ["ativ_etapa", (h) => h.startsWith("em qual etapa as atividades")],
  ["ativ_div", (h) => h.startsWith("justifique a divergencia")],
  ["ativ_area", (h) => h.startsWith("qual area nao correspondeu")],
  ["ativ_rs", (h) => h.startsWith("justifique o seu nivel de satisfacao de recrutamento")],
  ["ativ_trein", (h) => h.startsWith("justifique o seu nivel de satisfacao de treinamento")],
  ["ativ_motivo", (h) => h === "qual o motivo da sua insatisfacao?"],
  ["motivo_geral", (h) => h === "qual o principal motivo da sua insatisfacao?"],
  ["nota_ativ", (h) => h.startsWith("qual seu nivel de satisfacao")],
  ["apoio_texto", (h) => h.startsWith("justifique sua avaliacao sobre as areas de apoio")],
  ["nota_apoio", (h) => h.includes("relacionamento com as areas de apoio")],
  ["clima_texto", (h) => h.startsWith("justifique sua avaliacao sobre o clima")],
  ["nota_clima", (h) => h.startsWith("como voce avalia o clima")],
];

function mapearColunas(cabecalhos, nomeArquivo) {
  const mapa = {};
  for (const h of cabecalhos) {
    const k = chave(h);
    for (const [campo, teste] of COLUNAS) { if (!mapa[campo] && teste(k)) { mapa[campo] = h; break; } }
  }
  if (cabecalhos.some((h) => chave(h).startsWith("selecione o tempo na empresa"))) {
    throw erroHttp(400, `“${nomeArquivo}” é a planilha da pesquisa de clima. Importe-a em Pesquisas de clima; aqui entram só as avaliações 30, 60 e 90 dias.`);
  }
  const falta = ["matricula", "nome", "tipo"].filter((c) => !mapa[c]);
  if (falta.length) throw erroHttp(400, `“${nomeArquivo}” não parece ser uma planilha de avaliação do Canguru (faltou: ${falta.join(", ")}).`);
  return mapa;
}

const textoOuNulo = (v) => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t || chave(t) === "sem resposta") return null;
  return t;
};
const simNao = (v) => { const k = chave(v); return k === "sim" ? 1 : k === "nao" ? 0 : null; };
const notaDe = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : NaN;
};
const tipoDe = (v) => { const m = String(v || "").match(/(\d+)/); const n = m ? Number(m[1]) : 0; return TIPOS.includes(n) ? n : 0; };

/** Aplica as regras de privacidade a um texto livre: tira CID e devolve o texto limpo. */
function limparTexto(t, contagem) {
  const x = textoOuNulo(t);
  if (!x) return null;
  if (RE_CID.test(x)) { contagem.cid += 1; return "[texto removido: continha código CID]"; }
  return x.length > MAX_TEXTO ? x.slice(0, MAX_TEXTO) : x;
}

function calcularSinais(a, cfg) {
  const lista = [];
  if (a.esp === 0) lista.push("esp");
  if (a.acolhido === 0) lista.push("acol");
  if (a.lider === 0) lista.push("lider");
  if (a.nota_ativ !== null && a.nota_ativ <= cfg.nota_sinal_max) lista.push("ativ");
  if (a.nota_apoio !== null && a.nota_apoio <= cfg.nota_sinal_max) lista.push("apoio");
  if (a.nota_clima !== null && a.nota_clima <= cfg.nota_sinal_max) lista.push("clima");
  return lista;
}

function termosPrioritarios(cfg) { return String(cfg.termos_prioritarios || "").split(",").map((t) => t.trim()).filter(Boolean); }
function detectarPrioritario(a, termos) {
  const corpo = chave([a.esp_motivo, a.acolhido_texto, a.lider_texto, a.ativ_texto, a.apoio_texto, a.clima_texto].filter(Boolean).join(" | "));
  if (!corpo) return [];
  return termos.filter((t) => corpo.includes(t));
}

function estaNaOperacao(funcao, cfg) {
  const f = String(funcao || "").toUpperCase();
  const termos = String(cfg.termos_operacao || "").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  return termos.some((t) => f.includes(t));
}

// ── Importação ────────────────────────────────────────────────────────
function montarEntradas(arquivos, cfg, contagem) {
  const entradas = new Map(); // `${chavePessoa}|${tipo}` -> entrada mais recente
  const resumoArquivos = [];
  const termos = termosPrioritarios(cfg);
  let lidas = 0, duplicadas = 0, semIdentificacao = 0, notasForaDaEscala = 0, tipoInvalido = 0;
  for (const arq of arquivos) {
    const rows = lerLinhas(arq.buffer, arq.nome);
    const mapa = mapearColunas(Object.keys(rows[0]), arq.nome);
    const tiposNoArquivo = new Set();
    let linhasArq = 0;
    rows.forEach((r, i) => {
      const nome = String(r[mapa.nome] ?? "").trim();
      const matricula = String(r[mapa.matricula] ?? "").trim();
      if (!nome && !matricula) return;
      lidas += 1; linhasArq += 1;
      const tipo = tipoDe(r[mapa.tipo]);
      if (!tipo) { tipoInvalido += 1; return; }
      tiposNoArquivo.add(tipo);
      const matNorm = matriculaParaComparar(matricula);
      const chavePessoa = matNorm ? `m:${matNorm}` : nome ? `n:${nomeParaComparar(nome)}` : null;
      if (!chavePessoa) { semIdentificacao += 1; return; }
      const dt = paraData(r[mapa.data]);
      const a = {
        esp: simNao(r[mapa.esp]), esp_motivo: limparTexto(r[mapa.esp_motivo] ?? r[mapa.motivo_geral], contagem),
        acolhido: simNao(r[mapa.acolhido]), acolhido_area: textoOuNulo(r[mapa.acolhido_area]), acolhido_texto: limparTexto(r[mapa.acolhido_texto], contagem),
        lider: simNao(r[mapa.lider]), lider_motivo: textoOuNulo(r[mapa.lider_motivo]), lider_texto: limparTexto(r[mapa.lider_texto], contagem),
        nota_ativ: notaDe(r[mapa.nota_ativ]), ativ_motivo: textoOuNulo(r[mapa.ativ_motivo]),
        ativ_area: textoOuNulo(r[mapa.ativ_area]),
        ativ_texto: limparTexto([r[mapa.ativ_div], r[mapa.ativ_rs], r[mapa.ativ_trein]].map(textoOuNulo).filter(Boolean).join(" | ") || null, contagem),
        nota_apoio: notaDe(r[mapa.nota_apoio]), apoio_texto: limparTexto(r[mapa.apoio_texto], contagem),
        nota_clima: notaDe(r[mapa.nota_clima]), clima_texto: limparTexto(r[mapa.clima_texto], contagem),
      };
      for (const k of ["nota_ativ", "nota_apoio", "nota_clima"]) if (Number.isNaN(a[k])) { a[k] = null; notasForaDaEscala += 1; }
      const sinais = calcularSinais(a, cfg);
      const termosAchados = detectarPrioritario(a, termos);
      const e = {
        chavePessoa, tipo, linha: i + 2, arquivo: arq.nome, nome, matricula, matNorm, respondida_em: dt,
        site: textoOuNulo(r[mapa.site]), servico: textoOuNulo(r[mapa.servico]), funcao: textoOuNulo(r[mapa.funcao]),
        supervisor: textoOuNulo(r[mapa.supervisor]), coordenador: textoOuNulo(r[mapa.coordenador]),
        ...a, sinais: sinais.length, sinais_lista: sinais.join(","), prioritario: termosAchados.length ? 1 : 0, prioritario_termos: termosAchados.join(", ") || null,
      };
      const k = `${chavePessoa}|${tipo}`;
      const ant = entradas.get(k);
      if (ant) { duplicadas += 1; if (!(dt && ant.respondida_em && dt < ant.respondida_em)) entradas.set(k, e); } else entradas.set(k, e);
    });
    resumoArquivos.push({ nome: arq.nome, linhas: linhasArq, tipos: [...tiposNoArquivo].sort((x, y) => x - y) });
  }
  return { entradas: [...entradas.values()], resumoArquivos, lidas, duplicadas, semIdentificacao, notasForaDaEscala, tipoInvalido };
}

async function carregarPessoas(empresaId) {
  const [rows] = await pool.query(`SELECT id, nome, matricula, cliente, data_admissao FROM pessoas WHERE empresa_id = ?`, [empresaId]);
  const porMat = new Map(); const porNome = new Map();
  for (const p of rows) {
    const m = matriculaParaComparar(p.matricula);
    if (m) { if (!porMat.has(m)) porMat.set(m, []); porMat.get(m).push(p); }
    const n = nomeParaComparar(p.nome);
    if (n) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(p); }
  }
  return { porMat, porNome };
}
const pessoaResumo = (p) => ({ id: p.id, nome: p.nome, matricula: p.matricula || null, cliente: p.cliente || null, data_admissao: dataIso(p.data_admissao) });

/** Descobre quem é a pessoa de cada grupo. Devolve { ok: pessoa, por } ou { conflito: {...} }. */
function resolverGrupo(g, idx) {
  const ref = g.ultima;
  if (ref.matNorm) {
    const candidatos = idx.porMat.get(ref.matNorm) || [];
    if (candidatos.length) {
      const parecida = candidatos.find((p) => nomesParecidos(p.nome, ref.nome));
      if (parecida) return { pessoa: parecida, por: "matricula" };
      return { conflito: { tipo: "nome_diferente", candidatos: candidatos.map(pessoaResumo) } };
    }
    return { conflito: { tipo: "sem_cadastro", candidatos: [] } };
  }
  const porNome = idx.porNome.get(nomeParaComparar(ref.nome)) || [];
  if (porNome.length === 1) return { pessoa: porNome[0], por: "nome" };
  if (porNome.length > 1) return { conflito: { tipo: "sem_matricula", candidatos: porNome.map(pessoaResumo) } };
  return { conflito: { tipo: "sem_matricula", candidatos: [] } };
}

async function importarAvaliacoes({ empresaId, usuario, arquivos, simular, decisoes, incluirFora }) {
  if (!arquivos?.length) throw erroHttp(400, "Envie pelo menos uma planilha (.xlsx) de avaliação 30, 60 ou 90 dias.");
  const cfg = await carregarConfig(empresaId);
  const contagem = { cid: 0 };
  const m = montarEntradas(arquivos, cfg, contagem);
  if (!m.entradas.length) throw erroHttp(400, "Não encontrei nenhuma avaliação válida nas planilhas (confira o tipo de pesquisa e a matrícula).");

  // Agrupa por pessoa (matrícula ou, sem matrícula, nome)
  const grupos = new Map();
  for (const e of m.entradas) {
    if (!grupos.has(e.chavePessoa)) grupos.set(e.chavePessoa, { chave: e.chavePessoa, entradas: [], ultima: e });
    const g = grupos.get(e.chavePessoa); g.entradas.push(e);
    if (!g.ultima.respondida_em || (e.respondida_em && e.respondida_em >= g.ultima.respondida_em)) g.ultima = e;
  }
  const idx = await carregarPessoas(empresaId);

  const rel = {
    simulacao: !!simular,
    arquivos: m.resumoArquivos,
    linhas: { lidas: m.lidas, avaliacoes: m.entradas.length, duplicadas_removidas: m.duplicadas, tipo_invalido: m.tipoInvalido, sem_identificacao: m.semIdentificacao },
    novatos: { distintos: grupos.size, vinculados_por_matricula: 0, vinculados_por_nome: 0, vinculados_pela_conferencia: 0, a_cadastrar: 0, cadastrados: 0, pulados: 0, fora_da_operacao: 0 },
    avaliacoes: { por_tipo: Object.fromEntries(TIPOS.map((t) => [t, 0])), importadas: 0, atualizadas: 0, puladas: 0 },
    conflitos: [], fora_da_operacao: [],
    qualidade: { notas_fora_da_escala: m.notasForaDaEscala, textos_com_cid_removidos: contagem.cid, sem_admissao: 0 },
    sinais: { novatos_com_sinal: 0, recorrentes: 0, nas_tres: 0, prioritarios: 0 },
    avisos: [],
  };

  const aProcessar = []; // { g, pessoa, por, criar }
  const foraMap = new Map();
  for (const g of grupos.values()) {
    if (!estaNaOperacao(g.ultima.funcao, cfg) && !incluirFora) {
      rel.novatos.fora_da_operacao += 1;
      const f = g.ultima.funcao || "Sem cargo";
      foraMap.set(f, (foraMap.get(f) || 0) + 1);
      rel.avaliacoes.puladas += g.entradas.length;
      continue;
    }
    const r = resolverGrupo(g, idx);
    if (r.pessoa) {
      if (r.por === "matricula") rel.novatos.vinculados_por_matricula += 1; else rel.novatos.vinculados_por_nome += 1;
      aProcessar.push({ g, pessoa: r.pessoa });
      continue;
    }
    const d = (decisoes && decisoes[g.chave]) || {};
    const c = r.conflito;
    const item = {
      chave: g.chave, tipo: c.tipo, nome: g.ultima.nome, matricula: g.ultima.matricula || null, site: g.ultima.site ? rotuloSite(g.ultima.site) : null,
      servico: g.ultima.servico || null, avaliacoes: g.entradas.map((x) => x.tipo).sort((a, b) => a - b), candidatos: c.candidatos,
      pode_cadastrar: c.tipo !== "nome_diferente", decisao: "pular",
    };
    if (d.acao === "vincular" && c.candidatos.some((p) => Number(p.id) === Number(d.pessoa_id))) {
      item.decisao = "vincular";
      const alvo = [...idx.porMat.values(), ...idx.porNome.values()].flat().find((p) => Number(p.id) === Number(d.pessoa_id));
      aProcessar.push({ g, pessoa: alvo }); rel.novatos.vinculados_pela_conferencia += 1;
    } else if (d.acao === "cadastrar" && item.pode_cadastrar) {
      item.decisao = "cadastrar";
      aProcessar.push({ g, pessoa: null, criar: true }); rel.novatos.a_cadastrar += 1;
    } else {
      rel.novatos.pulados += 1; rel.avaliacoes.puladas += g.entradas.length;
    }
    rel.conflitos.push(item);
  }
  rel.fora_da_operacao = [...foraMap.entries()].map(([funcao, novatos]) => ({ funcao, novatos })).sort((a, b) => b.novatos - a.novatos);

  // Estatísticas de sinais (sobre o que será importado)
  for (const x of aProcessar) {
    const com = x.g.entradas.filter((e) => e.sinais > 0);
    if (com.length) rel.sinais.novatos_com_sinal += 1;
    if (com.length >= 2) rel.sinais.recorrentes += 1;
    if (com.length === 3) rel.sinais.nas_tres += 1;
    if (x.g.entradas.some((e) => e.prioritario)) rel.sinais.prioritarios += 1;
    for (const e of x.g.entradas) rel.avaliacoes.por_tipo[e.tipo] += 1;
    const adm = x.pessoa ? dataIso(x.pessoa.data_admissao) : null;
    if (!adm) rel.qualidade.sem_admissao += 1;
  }
  if (rel.novatos.fora_da_operacao && !incluirFora) rel.avisos.push(`${rel.novatos.fora_da_operacao} pessoa(s) de cargos fora da operação ficaram de fora. Marque “incluir cargos fora da operação” se quiser trazê-las.`);
  if (rel.conflitos.length) rel.avisos.push(`${rel.conflitos.length} pessoa(s) precisam de conferência (não achei no cadastro ou o nome é diferente). Sem decisão, a linha é pulada.`);
  if (rel.qualidade.sem_admissao) rel.avisos.push(`${rel.qualidade.sem_admissao} novato(s) sem data de admissão no cadastro: informe na ficha para o portal contar os dias.`);
  if (m.notasForaDaEscala) rel.avisos.push(`${m.notasForaDaEscala} nota(s) fora da escala de 0 a 5 foram ignoradas.`);
  if (contagem.cid) rel.avisos.push(`${contagem.cid} texto(s) tinham código CID e foram removidos.`);

  if (simular) return rel;

  await comTransacao(async (conn) => {
    for (const x of aProcessar) {
      let pessoa = x.pessoa;
      const ref = x.g.ultima;
      if (x.criar) {
        const r = await resolverPessoa({ empresaId, nome: ref.nome, matricula: ref.matricula || null, cliente: ref.servico || ref.site || null }, conn);
        pessoa = r.pessoa;
        if (!pessoa) { rel.novatos.pulados += 1; rel.avaliacoes.puladas += x.g.entradas.length; continue; }
        rel.novatos.cadastrados += 1;
      }
      const [[atual]] = await conn.query(`SELECT * FROM rh_canguru_novatos WHERE empresa_id = ? AND pessoa_id = ?`, [empresaId, pessoa.id]);
      const [[ultima]] = atual ? await conn.query(`SELECT MAX(respondida_em) AS d FROM rh_canguru_avaliacoes WHERE novato_id = ?`, [atual.id]) : [[{ d: null }]];
      const maisRecente = !ultima?.d || (ref.respondida_em && ref.respondida_em >= new Date(ultima.d));
      const [[pAdm]] = await conn.query(`SELECT data_admissao FROM pessoas WHERE id = ? AND empresa_id = ?`, [pessoa.id, empresaId]);
      let novatoId;
      if (!atual) {
        const adm = pAdm?.data_admissao ? dataIso(pAdm.data_admissao) : null;
        const [ins] = await conn.query(
          `INSERT INTO rh_canguru_novatos (empresa_id, pessoa_id, matricula, site, servico, funcao, supervisor, coordenador, data_admissao, admissao_origem) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [empresaId, pessoa.id, ref.matricula || null, ref.site, ref.servico, ref.funcao, ref.supervisor, ref.coordenador, adm, adm ? "cadastro" : null]
        );
        novatoId = ins.insertId;
      } else {
        novatoId = atual.id;
        const adm = atual.admissao_origem === "manual" ? null : (pAdm?.data_admissao ? dataIso(pAdm.data_admissao) : null);
        await conn.query(
          `UPDATE rh_canguru_novatos SET matricula = COALESCE(?, matricula)${maisRecente ? ", site = ?, servico = ?, funcao = ?, supervisor = ?, coordenador = ?" : ""}${adm ? ", data_admissao = ?, admissao_origem = 'cadastro'" : ""} WHERE id = ?`,
          [ref.matricula || null, ...(maisRecente ? [ref.site, ref.servico, ref.funcao, ref.supervisor, ref.coordenador] : []), ...(adm ? [adm] : []), novatoId]
        );
      }
      for (const e of x.g.entradas) {
        const [[ja]] = await conn.query(`SELECT id FROM rh_canguru_avaliacoes WHERE novato_id = ? AND tipo = ?`, [novatoId, e.tipo]);
        const valores = [e.respondida_em ? sqlDataHora(e.respondida_em) : null, e.site, e.servico, e.esp, e.esp_motivo, e.acolhido, e.acolhido_area, e.acolhido_texto, e.lider, e.lider_motivo, e.lider_texto, e.nota_ativ, e.ativ_motivo, e.ativ_area, e.ativ_texto, e.nota_apoio, e.apoio_texto, e.nota_clima, e.clima_texto, e.sinais, e.sinais_lista || null, e.prioritario, e.prioritario_termos, String(e.arquivo || "").slice(0, 200), usuario?.id ?? null];
        const cols = "respondida_em=?, site=?, servico=?, esp=?, esp_motivo=?, acolhido=?, acolhido_area=?, acolhido_texto=?, lider=?, lider_motivo=?, lider_texto=?, nota_ativ=?, ativ_motivo=?, ativ_area=?, ativ_texto=?, nota_apoio=?, apoio_texto=?, nota_clima=?, clima_texto=?, sinais=?, sinais_lista=?, prioritario=?, prioritario_termos=?, origem_arquivo=?, importado_por=?";
        if (ja) { await conn.query(`UPDATE rh_canguru_avaliacoes SET ${cols}, importado_em = CURRENT_TIMESTAMP WHERE id = ?`, [...valores, ja.id]); rel.avaliacoes.atualizadas += 1; }
        else { await conn.query(`INSERT INTO rh_canguru_avaliacoes SET empresa_id = ?, novato_id = ?, tipo = ?, ${cols}`, [empresaId, novatoId, e.tipo, ...valores]); rel.avaliacoes.importadas += 1; }
      }
    }
  });
  return rel;
}

// ── Admissões em lote (13/11/2026) ────────────────────────────────────
// Planilha com Matrícula + Data de admissão (Nome é opcional, só ajuda a conferir). Atualiza só novatos que já estão no Canguru.
// Data lançada aqui vale como “informada pelo RH” (admissao_origem = manual), então não é trocada pelo cadastro depois.
function lerLinhasAdmissao(buffer, nomeArquivo) {
  const XLSX = require("xlsx");
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: false }); } catch (_) { throw erroHttp(400, `Não consegui abrir “${nomeArquivo}”. Envie uma planilha .xlsx (ou .csv).`); }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: null, raw: true });
    if (!rows.length) continue;
    const cab = Object.keys(rows[0]);
    const mat = cab.find((h) => chave(h) === "matricula");
    const adm = cab.find((h) => /^(data )?(de )?admissao$|^dt admissao$|^data admissao$/.test(chave(h)) || chave(h).startsWith("data de admissao") || chave(h) === "admissao");
    const nm = cab.find((h) => chave(h) === "nome");
    if (mat && adm) return { rows, mat, adm, nm };
  }
  throw erroHttp(400, `“${nomeArquivo}” precisa ter as colunas “Matrícula” e “Data de admissão”. Baixe o modelo na própria tela.`);
}

function dataEstrita(v) {
  // paraData aceita 31/31/2026 (o JavaScript "rola" o mês); para admissão, dia e mês precisam existir de verdade.
  const d = paraData(v);
  if (!d) return null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/) || v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const [a, b, c] = v.trim().includes("/") ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]];
      if (d.getUTCFullYear() !== a || d.getUTCMonth() + 1 !== b || d.getUTCDate() !== c) return null;
    }
  }
  return d;
}

async function importarAdmissoes({ empresaId, usuario, arquivo, simular }) {
  if (!arquivo) throw erroHttp(400, "Envie a planilha (.xlsx) com matrícula e data de admissão.");
  const { rows, mat, adm, nm } = lerLinhasAdmissao(arquivo.buffer, arquivo.nome);
  const hoje = R.hojeISO();
  const [novatos] = await pool.query(
    `SELECT n.id, n.pessoa_id, n.matricula, n.data_admissao, n.admissao_origem, p.nome, p.matricula AS mat_pessoa
       FROM rh_canguru_novatos n LEFT JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id WHERE n.empresa_id = ?`, [empresaId]);
  const porMat = new Map();
  for (const n of novatos) for (const m of [n.matricula, n.mat_pessoa]) { const k = matriculaParaComparar(m); if (k && !porMat.has(k)) porMat.set(k, n); }

  const rel = {
    simulacao: !!simular, arquivo: arquivo.nome,
    linhas: { lidas: rows.length, vazias: 0, duplicadas: 0 },
    resultado: { novas: 0, alteradas: 0, iguais: 0, gravadas: 0 },
    problemas: [], alteracoes: [], avisos: [],
  };
  const vistos = new Map(); const aplicar = [];
  rows.forEach((r, i) => {
    const linha = i + 2; // linha na planilha (cabeçalho = 1)
    const matBruta = r[mat]; const k = matriculaParaComparar(matBruta);
    const nomePlan = nm ? String(r[nm] ?? "").trim() : "";
    if (!k && (r[adm] === null || String(r[adm]).trim() === "")) { rel.linhas.vazias += 1; return; }
    const prob = (motivo) => rel.problemas.push({ linha, matricula: matBruta ? String(matBruta) : null, nome: nomePlan || null, motivo });
    if (!k) return prob("Sem matrícula");
    const n = porMat.get(k);
    if (!n) return prob("Matrícula não encontrada entre os novatos do Canguru");
    const d = dataEstrita(r[adm]);
    if (!d) return prob("Data de admissão inválida (use dia/mês/ano)");
    const iso = d.toISOString().slice(0, 10);
    if (iso > hoje) return prob("Data de admissão no futuro");
    if (iso < "2000-01-01") return prob("Data de admissão muito antiga (confira o ano)");
    if (vistos.has(n.id)) {
      rel.linhas.duplicadas += 1;
      if (vistos.get(n.id) !== iso) prob(`Matrícula repetida na planilha com data diferente (valeu a primeira: ${vistos.get(n.id).split("-").reverse().join("/")})`);
      return;
    }
    vistos.set(n.id, iso);
    const antes = dataIso(n.data_admissao);
    if (nomePlan && n.nome && !nomesParecidos(n.nome, nomePlan)) rel.avisos.push(`Linha ${linha}: o nome da planilha (${nomePlan}) é diferente do cadastro (${n.nome}). Vale a matrícula; confira se é a pessoa certa.`);
    if (antes === iso && n.admissao_origem === "manual") { rel.resultado.iguais += 1; return; }
    if (antes === iso) { rel.resultado.iguais += 1; aplicar.push({ id: n.id, iso, soOrigem: true }); return; }
    if (antes) { rel.resultado.alteradas += 1; rel.alteracoes.push({ linha, nome: n.nome, matricula: String(matBruta), antes, depois: iso }); }
    else rel.resultado.novas += 1;
    aplicar.push({ id: n.id, iso });
  });
  if (rel.problemas.length) rel.avisos.unshift(`${rel.problemas.length} linha(s) com problema não foram gravadas. Corrija na planilha e envie de novo (as demais já estão certas).`);
  if (rel.resultado.alteradas) rel.avisos.push(`${rel.resultado.alteradas} novato(s) já tinham outra data de admissão; a da planilha vai substituir.`);
  if (simular) return rel;

  await comTransacao(async (conn) => {
    for (const a of aplicar) {
      await conn.query(`UPDATE rh_canguru_novatos SET data_admissao = ?, admissao_origem = 'manual' WHERE id = ? AND empresa_id = ?`, [a.iso, a.id, empresaId]);
      if (!a.soOrigem) rel.resultado.gravadas += 1;
    }
  });
  return rel;
}

async function modeloAdmissoes(empresaId) {
  const [rows] = await pool.query(
    `SELECT n.matricula, p.nome FROM rh_canguru_novatos n LEFT JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id
      WHERE n.empresa_id = ? AND n.data_admissao IS NULL ORDER BY p.nome LIMIT 2000`, [empresaId]);
  return rows;
}

// ── Cálculo de etapas e situação ──────────────────────────────────────
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const somaDias = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

function statusEtapa(adm, hoje, e, resp, cfg, cobrarDesde) {
  if (resp) return "respondida";
  if (!adm) return "sem_admissao";
  const prazo = somaDias(adm, e.dia);
  if (cobrarDesde && prazo < cobrarDesde) return "anterior";
  const dia = diasEntre(adm, hoje);
  if (dia > e.dia + cfg.tolerancia_dias) return "sem_resposta";
  if (dia >= e.dia - cfg.alerta_dias) return "vencendo";
  return "futura";
}

/** Monta a visão de cada novato (dia, etapas, situação). `avs` agrupadas por novato. */
function montarNovato(n, avs, pontoAberto, cfg, hoje, cobrarDesde) {
  const adm = dataIso(n.data_admissao);
  const dia = adm ? diasEntre(adm, hoje) : null;
  const etapas = etapasDe(cfg).map((e) => {
    const a = avs.find((x) => x.tipo === e.tipo) || null;
    const respondidaEm = a?.respondida_em ? new Date(a.respondida_em).toISOString().slice(0, 10) : null;
    const diaResp = a && adm && respondidaEm ? diasEntre(adm, respondidaEm) : null;
    return {
      tipo: e.tipo, dia_prazo: e.dia, status: statusEtapa(adm, hoje, e, !!a, cfg, cobrarDesde),
      respondida_em: respondidaEm, dia_resposta: diaResp, no_prazo: diaResp === null ? null : diaResp <= e.dia + cfg.tolerancia_dias,
      sinais: a ? a.sinais : null, sinais_lista: a?.sinais_lista ? a.sinais_lista.split(",") : [], prioritario: !!a?.prioritario,
    };
  });
  const comSinal = etapas.filter((e) => e.sinais > 0).length;
  const prioritario = etapas.some((e) => e.prioritario);
  const sinaisTotal = etapas.reduce((s, e) => s + (e.sinais || 0), 0);
  let situacao = "em_dia";
  if (!adm) situacao = "sem_admissao";
  else if (etapas.some((e) => e.status === "sem_resposta") || pontoAberto || prioritario) situacao = "pede_acao";
  else if (etapas.some((e) => e.status === "vencendo")) situacao = "atencao";
  else if (dia >= cfg.dia_aval_3 && etapas.every((e) => e.status === "respondida" || e.status === "anterior")) situacao = "concluido";
  return { id: n.id, pessoa_id: n.pessoa_id, nome: n.nome, matricula: n.matricula, site: n.site, site_rotulo: rotuloSite(n.site), servico: n.servico, funcao: n.funcao, supervisor: n.supervisor, coordenador: n.coordenador, data_admissao: adm, admissao_origem: n.admissao_origem, dia, etapas, situacao, sinais_total: sinaisTotal, recorrente: comSinal >= 2, prioritario, ponto_aberto: pontoAberto ? { id: pontoAberto.id, passo: pontoAberto.passo, status: pontoAberto.status } : null };
}

async function carregarBase(empresaId, cfg) {
  const [novatos] = await pool.query(
    `SELECT n.*, p.nome FROM rh_canguru_novatos n JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id WHERE n.empresa_id = ?`, [empresaId]);
  const [avs] = await pool.query(`SELECT * FROM rh_canguru_avaliacoes WHERE empresa_id = ?`, [empresaId]);
  const [pontos] = await pool.query(`SELECT * FROM rh_canguru_pontos WHERE empresa_id = ? AND status IN ('aberto','em_andamento')`, [empresaId]);
  const porNovato = new Map(); for (const a of avs) { if (!porNovato.has(a.novato_id)) porNovato.set(a.novato_id, []); porNovato.get(a.novato_id).push(a); }
  const pontoPor = new Map(pontos.map((p) => [p.novato_id, p]));
  let cobrarDesde = cfg.cobranca_a_partir_de;
  if (!cobrarDesde) { const datas = avs.filter((a) => a.respondida_em).map((a) => new Date(a.respondida_em).toISOString().slice(0, 10)).sort(); cobrarDesde = datas[0] || null; }
  const hoje = R.hojeISO();
  const lista = novatos.map((n) => montarNovato(n, porNovato.get(n.id) || [], pontoPor.get(n.id) || null, cfg, hoje, cobrarDesde));
  return { lista, avs, novatos, hoje, cobrarDesde };
}

// ── Acompanhamento (RH) ───────────────────────────────────────────────
const ORDEM_SITUACAO = { pede_acao: 0, sem_admissao: 1, atencao: 2, em_dia: 3, concluido: 4 };

async function acompanhamento(empresaId, f = {}) {
  const cfg = await carregarConfig(empresaId);
  const { lista, hoje, cobrarDesde } = await carregarBase(empresaId, cfg);
  const sites = [...new Set(lista.map((n) => n.site).filter(Boolean))].sort().map((s) => ({ valor: s, rotulo: rotuloSite(s) }));
  const servicos = [...new Set(lista.map((n) => n.servico).filter(Boolean))].sort();
  const busca = chave(f.busca || "");
  let x = lista;
  if (f.site) x = x.filter((n) => n.site === f.site);
  if (f.servico) x = x.filter((n) => n.servico === f.servico);
  if (f.situacao) x = x.filter((n) => n.situacao === f.situacao);
  if (busca) x = x.filter((n) => chave(n.nome).includes(busca) || chave(n.matricula).includes(busca));
  const etapasAll = x.flatMap((n) => n.etapas);
  const respondidas = etapasAll.filter((e) => e.status === "respondida");
  const kpis = {
    novatos: x.length,
    etapas_vencendo: etapasAll.filter((e) => e.status === "vencendo").length,
    etapas_sem_resposta: etapasAll.filter((e) => e.status === "sem_resposta").length,
    pontos_de_atencao: x.filter((n) => n.sinais_total > 0 && !n.ponto_aberto).length,
    pontos_abertos: x.filter((n) => n.ponto_aberto).length,
    respostas_no_prazo_pct: pct(respondidas.filter((e) => e.no_prazo).length, respondidas.filter((e) => e.no_prazo !== null).length),
    sem_admissao: x.filter((n) => n.situacao === "sem_admissao").length,
  };
  x = [...x].sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || (b.dia ?? -1) - (a.dia ?? -1) || a.nome.localeCompare(b.nome));
  const limite = Math.min(Math.max(Number(f.limite) || 50, 1), 200);
  const deslocamento = Math.max(Number(f.deslocamento) || 0, 0);
  return { hoje, cobranca_a_partir_de: cobrarDesde, etapas: etapasDe(cfg), kpis, total: x.length, novatos: x.slice(deslocamento, deslocamento + limite), filtros: { sites, servicos }, config: { dia_aval_3: cfg.dia_aval_3 } };
}

// ── Ficha do novato (RH) ──────────────────────────────────────────────
async function ficha(empresaId, id) {
  const cfg = await carregarConfig(empresaId);
  const [[n]] = await pool.query(`SELECT n.*, p.nome FROM rh_canguru_novatos n JOIN pessoas p ON p.id = n.pessoa_id WHERE n.id = ? AND n.empresa_id = ?`, [id, empresaId]);
  if (!n) return null;
  const [avs] = await pool.query(`SELECT * FROM rh_canguru_avaliacoes WHERE novato_id = ? AND empresa_id = ? ORDER BY tipo`, [id, empresaId]);
  const [pontos] = await pool.query(`SELECT po.*, u.nome AS responsavel_nome, ua.nome AS aberto_por_nome FROM rh_canguru_pontos po LEFT JOIN usuarios u ON u.id = po.responsavel_id LEFT JOIN usuarios ua ON ua.id = po.aberto_por WHERE po.novato_id = ? AND po.empresa_id = ? ORDER BY po.id DESC`, [id, empresaId]);
  const ids = pontos.map((p) => p.id);
  const [hist] = ids.length ? await pool.query(`SELECT * FROM rh_canguru_pontos_hist WHERE empresa_id = ? AND ponto_id IN (?) ORDER BY id`, [empresaId, ids]) : [[]];
  const aberto = pontos.find((p) => ["aberto", "em_andamento"].includes(p.status)) || null;
  let cobrarDesde = cfg.cobranca_a_partir_de;
  if (!cobrarDesde) { const [[m]] = await pool.query(`SELECT MIN(respondida_em) d FROM rh_canguru_avaliacoes WHERE empresa_id = ?`, [empresaId]); cobrarDesde = m?.d ? new Date(m.d).toISOString().slice(0, 10) : null; }
  const v = montarNovato(n, avs, aberto, cfg, R.hojeISO(), cobrarDesde);
  const avaliacoes = avs.map((a) => ({
    tipo: a.tipo, respondida_em: a.respondida_em ? new Date(a.respondida_em).toISOString() : null, site: a.site ? rotuloSite(a.site) : null, servico: a.servico,
    esp: a.esp, esp_motivo: a.esp_motivo, acolhido: a.acolhido, acolhido_area: a.acolhido_area, acolhido_texto: a.acolhido_texto, lider: a.lider, lider_motivo: a.lider_motivo, lider_texto: a.lider_texto,
    nota_ativ: a.nota_ativ, ativ_motivo: a.ativ_motivo, ativ_area: a.ativ_area, ativ_texto: a.ativ_texto, nota_apoio: a.nota_apoio, apoio_texto: a.apoio_texto, nota_clima: a.nota_clima, clima_texto: a.clima_texto,
    sinais: a.sinais, sinais_lista: a.sinais_lista ? a.sinais_lista.split(",") : [], prioritario: !!a.prioritario, prioritario_termos: a.prioritario_termos,
  }));
  return { novato: v, avaliacoes, pontos: pontos.map((p) => ({ ...p, prazo: dataIso(p.prazo), historico: hist.filter((h) => h.ponto_id === p.id) })), passos: PASSOS, rotulos_sinais: SINAIS_ROTULO };
}

async function salvarAdmissao(empresaId, id, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || "")) || isNaN(new Date(`${data}T00:00:00Z`).getTime())) throw erroHttp(400, "Informe a data de admissão (AAAA-MM-DD).");
  if (data > R.hojeISO()) throw erroHttp(400, "A data de admissão não pode estar no futuro.");
  const [[n]] = await pool.query(`SELECT id, data_admissao FROM rh_canguru_novatos WHERE id = ? AND empresa_id = ?`, [id, empresaId]);
  if (!n) throw erroHttp(404, "Novato não encontrado");
  await pool.query(`UPDATE rh_canguru_novatos SET data_admissao = ?, admissao_origem = 'manual' WHERE id = ?`, [data, id]);
  return { antes: dataIso(n.data_admissao), depois: data };
}

// ── Pontos de atenção ─────────────────────────────────────────────────
async function filaAtencao(empresaId, f = {}) {
  const cfg = await carregarConfig(empresaId);
  const { lista } = await carregarBase(empresaId, cfg);
  let x = lista.filter((n) => n.sinais_total > 0 || n.prioritario || n.ponto_aberto);
  const sites = [...new Set(x.map((n) => n.site).filter(Boolean))].sort().map((s) => ({ valor: s, rotulo: rotuloSite(s) }));
  if (f.site) x = x.filter((n) => n.site === f.site);
  if (f.servico) x = x.filter((n) => n.servico === f.servico);
  if (f.so_prioritarios) x = x.filter((n) => n.prioritario);
  if (f.so_recorrentes) x = x.filter((n) => n.recorrente);
  if (f.ponto === "sem") x = x.filter((n) => !n.ponto_aberto);
  if (f.ponto === "com") x = x.filter((n) => n.ponto_aberto);
  const busca = chave(f.busca || ""); if (busca) x = x.filter((n) => chave(n.nome).includes(busca) || chave(n.matricula).includes(busca));
  const ult = (n) => n.etapas.filter((e) => e.respondida_em).map((e) => e.respondida_em).sort().pop() || "";
  x = [...x].sort((a, b) => Number(b.prioritario) - Number(a.prioritario) || Number(b.recorrente) - Number(a.recorrente) || b.sinais_total - a.sinais_total || ult(b).localeCompare(ult(a)));
  const resumo = { total: x.length, prioritarios: x.filter((n) => n.prioritario).length, recorrentes: x.filter((n) => n.recorrente).length, com_ponto_aberto: x.filter((n) => n.ponto_aberto).length, sem_ponto: x.filter((n) => !n.ponto_aberto).length };
  const limite = Math.min(Math.max(Number(f.limite) || 50, 1), 200); const deslocamento = Math.max(Number(f.deslocamento) || 0, 0);
  return { resumo, total: x.length, itens: x.slice(deslocamento, deslocamento + limite).map((n) => ({ ...n, ultima_resposta: ult(n) || null })), filtros: { sites, servicos: [...new Set(x.map((n) => n.servico).filter(Boolean))].sort() }, rotulos_sinais: SINAIS_ROTULO };
}

async function listarPontos(empresaId, status) {
  const filtro = status === "resolvidos" ? ["resolvido", "arquivado"] : ["aberto", "em_andamento"];
  const [rows] = await pool.query(
    `SELECT po.*, n.site, n.servico, n.matricula, p.nome, u.nome AS responsavel_nome FROM rh_canguru_pontos po
       JOIN rh_canguru_novatos n ON n.id = po.novato_id JOIN pessoas p ON p.id = n.pessoa_id LEFT JOIN usuarios u ON u.id = po.responsavel_id
      WHERE po.empresa_id = ? AND po.status IN (?) ORDER BY po.prazo IS NULL, po.prazo, po.id DESC`, [empresaId, filtro]);
  const hoje = R.hojeISO();
  return rows.map((p) => ({ id: p.id, novato_id: p.novato_id, nome: p.nome, matricula: p.matricula, site_rotulo: rotuloSite(p.site), servico: p.servico, status: p.status, passo: p.passo, passo_nome: PASSOS[p.passo - 1], responsavel_id: p.responsavel_id, responsavel_nome: p.responsavel_nome, prazo: dataIso(p.prazo), atrasado: !!p.prazo && dataIso(p.prazo) < hoje && ["aberto", "em_andamento"].includes(p.status), combinado: p.combinado, aberto_em: p.aberto_em, resolvido_em: p.resolvido_em }));
}

async function equipe(empresaId) {
  const [rows] = await pool.query(`SELECT id, nome, perfil FROM usuarios WHERE empresa_id = ? AND perfil IN ('coordenador_rh','analista_rh') AND (ativo IS NULL OR ativo = 1) ORDER BY nome`, [empresaId]);
  return rows;
}

async function abrirPonto(empresaId, usuario, { novato_id, responsavel_id, prazo, combinado }) {
  const [[n]] = await pool.query(`SELECT id FROM rh_canguru_novatos WHERE id = ? AND empresa_id = ?`, [Number(novato_id), empresaId]);
  if (!n) throw erroHttp(404, "Novato não encontrado");
  const [[ja]] = await pool.query(`SELECT id FROM rh_canguru_pontos WHERE novato_id = ? AND status IN ('aberto','em_andamento') LIMIT 1`, [n.id]);
  if (ja) throw erroHttp(409, "Este novato já tem um ponto de atenção em aberto.", { ponto_id: ja.id });
  const resp = await validarResponsavel(empresaId, responsavel_id);
  const pz = validarPrazo(prazo);
  const texto = combinado ? String(combinado).slice(0, 2000) : null;
  const id = await comTransacao(async (conn) => {
    const [ins] = await conn.query(`INSERT INTO rh_canguru_pontos (empresa_id, novato_id, status, passo, responsavel_id, prazo, combinado, aberto_por) VALUES (?,?,?,?,?,?,?,?)`, [empresaId, n.id, "aberto", 1, resp, pz, texto, usuario?.id ?? null]);
    await conn.query(`INSERT INTO rh_canguru_pontos_hist (empresa_id, ponto_id, usuario_id, usuario_nome, acao, passo, texto) VALUES (?,?,?,?,?,?,?)`, [empresaId, ins.insertId, usuario?.id ?? null, usuario?.nome ?? null, "abriu", 1, "Ponto de atenção aberto"]);
    return ins.insertId;
  });
  return id;
}

async function validarResponsavel(empresaId, id) {
  if (id === undefined || id === null || id === "") return null;
  const [[u]] = await pool.query(`SELECT id FROM usuarios WHERE id = ? AND empresa_id = ? AND perfil IN ('coordenador_rh','analista_rh')`, [Number(id), empresaId]);
  if (!u) throw erroHttp(400, "Responsável inválido: escolha alguém da equipe do RH.");
  return u.id;
}
function validarPrazo(p) {
  if (p === undefined || p === null || p === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p)) || isNaN(new Date(`${p}T00:00:00Z`).getTime())) throw erroHttp(400, "Prazo inválido (AAAA-MM-DD).");
  return p;
}

async function atualizarPonto(empresaId, usuario, id, corpo) {
  const [[p]] = await pool.query(`SELECT * FROM rh_canguru_pontos WHERE id = ? AND empresa_id = ?`, [Number(id), empresaId]);
  if (!p) throw erroHttp(404, "Ponto de atenção não encontrado");
  const aberto = ["aberto", "em_andamento"].includes(p.status);
  if (!aberto && corpo.status !== "aberto" && corpo.status !== "em_andamento") throw erroHttp(409, "Este ponto já foi encerrado. Reabra para editar.");
  const novo = { passo: p.passo, status: p.status, responsavel_id: p.responsavel_id, prazo: dataIso(p.prazo), combinado: p.combinado };
  const hist = [];
  if (corpo.passo !== undefined) {
    const passo = Number(corpo.passo);
    if (!Number.isInteger(passo) || passo < 1 || passo > PASSOS.length) throw erroHttp(400, "Passo inválido");
    if (passo !== p.passo) { novo.passo = passo; hist.push(["passo", passo, `Passo: ${PASSOS[passo - 1]}`]); if (novo.status === "aberto" && passo > 1) novo.status = "em_andamento"; }
  }
  if (corpo.status !== undefined && corpo.status !== p.status) {
    if (!["aberto", "em_andamento", "resolvido", "arquivado"].includes(corpo.status)) throw erroHttp(400, "Situação inválida");
    novo.status = corpo.status; hist.push([corpo.status === "resolvido" ? "resolveu" : corpo.status === "arquivado" ? "arquivou" : "reabriu", novo.passo, `Situação: ${corpo.status}`]);
  }
  if (corpo.responsavel_id !== undefined) { const r = await validarResponsavel(empresaId, corpo.responsavel_id); if (r !== p.responsavel_id) { novo.responsavel_id = r; hist.push(["responsavel", null, r ? "Responsável definido" : "Responsável removido"]); } }
  if (corpo.prazo !== undefined) { const pz = validarPrazo(corpo.prazo); if (pz !== dataIso(p.prazo)) { novo.prazo = pz; hist.push(["prazo", null, pz ? `Prazo: ${pz}` : "Prazo removido"]); } }
  if (corpo.combinado !== undefined) { const t = corpo.combinado ? String(corpo.combinado).slice(0, 2000) : null; if (t !== p.combinado) { novo.combinado = t; hist.push(["combinado", null, "Combinado atualizado"]); } }
  if (corpo.nota) hist.push(["nota", novo.passo, String(corpo.nota).slice(0, 1000)]);
  if (!hist.length) return { id: p.id, sem_mudanca: true };
  await comTransacao(async (conn) => {
    await conn.query(`UPDATE rh_canguru_pontos SET status=?, passo=?, responsavel_id=?, prazo=?, combinado=?, resolvido_em = ${["resolvido", "arquivado"].includes(novo.status) ? "COALESCE(resolvido_em, NOW())" : "NULL"} WHERE id = ?`, [novo.status, novo.passo, novo.responsavel_id, novo.prazo, novo.combinado, p.id]);
    for (const [acao, passo, texto] of hist) await conn.query(`INSERT INTO rh_canguru_pontos_hist (empresa_id, ponto_id, usuario_id, usuario_nome, acao, passo, texto) VALUES (?,?,?,?,?,?,?)`, [empresaId, p.id, usuario?.id ?? null, usuario?.nome ?? null, acao, passo, texto]);
  });
  return { id: p.id, antes: { status: p.status, passo: p.passo }, depois: { status: novo.status, passo: novo.passo } };
}

// ── Resultado (RH, gestor, relatórios) ────────────────────────────────
function risco(pctSinal, cfg) {
  if (pctSinal === null) return null;
  if (pctSinal >= cfg.risco_alto_min) return "alto";
  if (pctSinal >= cfg.risco_moderado_min) return "moderado";
  return "baixo";
}

function agregarEtapa(rows) {
  const sim = (k) => { const v = rows.filter((r) => r[k] !== null); return { n: v.length, pct: pct(v.filter((r) => r[k] === 1).length, v.length) }; };
  const media = (k) => { const v = rows.filter((r) => r[k] !== null); return v.length ? arred2(v.reduce((s, r) => s + r[k], 0) / v.length) : null; };
  return { respostas: rows.length, novatos: new Set(rows.map((r) => r.novato_id)).size, expectativas_pct: sim("esp").pct, acolhimento_pct: sim("acolhido").pct, lideranca_pct: sim("lider").pct, nota_atividades: media("nota_ativ"), nota_apoio: media("nota_apoio"), nota_clima: media("nota_clima"), com_sinal: rows.filter((r) => r.sinais > 0).length, com_sinal_pct: pct(rows.filter((r) => r.sinais > 0).length, rows.length) };
}

function ranking(rows, campo, denominador, minimo, ocultar) {
  const m = new Map();
  for (const r of rows) { const v = r[campo]; if (!v) continue; m.set(v, (m.get(v) || 0) + 1); }
  let itens = [...m.entries()].map(([motivo, n]) => ({ motivo, n, pct: pct(n, denominador) })).sort((a, b) => b.n - a.n);
  if (ocultar) itens = itens.filter((i) => i.n >= minimo);
  return itens.slice(0, 8);
}

function agruparPor(rows, campo, cfg, ocultar) {
  const m = new Map();
  for (const r of rows) { const k = r[campo] || null; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  const mk = (rotulo, rs, extra = {}) => {
    const novatos = new Set(rs.map((r) => r.novato_id)).size;
    const comSinal = rs.filter((r) => r.sinais > 0).length;
    const p = pct(comSinal, rs.length);
    return { rotulo, ...extra, novatos, respostas: rs.length, com_sinal: comSinal, com_sinal_pct: p, risco: risco(p, cfg), poucos: novatos < cfg.min_grupo, por_etapa: Object.fromEntries(TIPOS.map((t) => { const e = rs.filter((r) => r.tipo === t); return [t, { respostas: e.length, com_sinal_pct: pct(e.filter((r) => r.sinais > 0).length, e.length) }]; })) };
  };
  let grupos = [...m.entries()].map(([k, rs]) => ({ k, rs }));
  const pequenos = ocultar ? grupos.filter((g) => new Set(g.rs.map((r) => r.novato_id)).size < cfg.min_grupo) : [];
  grupos = ocultar ? grupos.filter((g) => new Set(g.rs.map((r) => r.novato_id)).size >= cfg.min_grupo) : grupos;
  const linhas = grupos.map((g) => mk(campo === "site" ? rotuloSite(g.k) : g.k || "Sem informação", g.rs, { valor: g.k })).sort((a, b) => (b.com_sinal_pct ?? -1) - (a.com_sinal_pct ?? -1) || b.respostas - a.respostas);
  let demais = null;
  if (pequenos.length) {
    const rs = pequenos.flatMap((g) => g.rs);
    if (new Set(rs.map((r) => r.novato_id)).size >= cfg.min_grupo) demais = mk("Demais (grupos pequenos)", rs, { valor: null });
  }
  return { linhas, demais, ocultos: pequenos.length };
}

function resultadoVazio(cfg, f, nominal) {
  const grupo = { linhas: [], demais: null, ocultos: 0 };
  const geral = { avaliacoes: 0, novatos: 0, novatos_com_sinal: 0, recorrentes: 0, nas_tres: 0, nas_tres_avaliacoes: 0, prioritarios: nominal ? 0 : null, novatos_com_sinal_pct: null };
  return {
    gerado_em: new Date().toISOString(), config: { nota_sinal_max: cfg.nota_sinal_max, risco_moderado_min: cfg.risco_moderado_min, risco_alto_min: cfg.risco_alto_min, min_grupo: cfg.min_grupo, dias: etapasDe(cfg) },
    filtros_aplicados: { site: null, servico: null, de: f.de || null, ate: f.ate || null }, filtros: { sites: [], servicos: [] }, nominal, geral,
    etapas: TIPOS.map((t) => ({ tipo: t, dia: etapasDe(cfg).find((e) => e.tipo === t).dia, ...agregarEtapa([]) })),
    evolucao: { novatos_com_duas_ou_mais: 0, saiu_do_sinal: 0, entrou_no_sinal: 0, manteve_sinal: 0, sem_sinal: 0, variacao_nota_atividades: null, variacao_nota_apoio: null, variacao_nota_clima: null },
    motivos: { insatisfacao_atividades: [], lideranca: [], acolhimento_area: [] }, por_site: grupo, por_servico: { ...grupo }, leitura: leituraResumo(geral, [], cfg),
  };
}

/** Resultado agregado. `nominal` = perfis da equipe do RH (veem grupos pequenos e a contagem de relatos prioritários). */
async function resultado(empresaId, f = {}, nominal = false) {
  const cfg = await carregarConfig(empresaId);
  const ocultar = !nominal;
  const params = [empresaId]; let where = `a.empresa_id = ?`;
  if (f.site) { where += ` AND a.site = ?`; params.push(f.site); }
  if (f.servico) { where += ` AND a.servico = ?`; params.push(f.servico); }
  // Escopo de cliente (Pacote 7): lista de serviços (obrigatória) e, se houver, de sites. Sem nenhum serviço, nada é devolvido.
  if (Array.isArray(f.servicos)) { if (!f.servicos.length) return resultadoVazio(cfg, f, nominal); where += ` AND a.servico IN (${f.servicos.map(() => "?").join(",")})`; params.push(...f.servicos); }
  if (Array.isArray(f.sites) && f.sites.length) { where += ` AND a.site IN (${f.sites.map(() => "?").join(",")})`; params.push(...f.sites); }
  if (f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de)) { where += ` AND a.respondida_em >= ?`; params.push(`${f.de} 00:00:00`); }
  if (f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate)) { where += ` AND a.respondida_em <= ?`; params.push(`${f.ate} 23:59:59`); }
  const [rows] = await pool.query(`SELECT a.* FROM rh_canguru_avaliacoes a WHERE ${where}`, params);
  const [sitesRows] = await pool.query(`SELECT DISTINCT site FROM rh_canguru_avaliacoes WHERE empresa_id = ? AND site IS NOT NULL ORDER BY site`, [empresaId]);
  const [servRows] = await pool.query(`SELECT DISTINCT servico FROM rh_canguru_avaliacoes WHERE empresa_id = ? AND servico IS NOT NULL ORDER BY servico`, [empresaId]);
  const filtros = { sites: sitesRows.map((s) => ({ valor: s.site, rotulo: rotuloSite(s.site) })), servicos: servRows.map((s) => s.servico) };
  const porNovato = new Map(); for (const r of rows) { if (!porNovato.has(r.novato_id)) porNovato.set(r.novato_id, []); porNovato.get(r.novato_id).push(r); }
  const novatos = [...porNovato.values()];
  const semSinalMin = (arr) => arr.filter((r) => r.sinais > 0).length;
  const geral = {
    avaliacoes: rows.length, novatos: novatos.length,
    novatos_com_sinal: novatos.filter((rs) => semSinalMin(rs) >= 1).length,
    recorrentes: novatos.filter((rs) => semSinalMin(rs) >= 2).length,
    nas_tres: novatos.filter((rs) => rs.length === 3 && semSinalMin(rs) === 3).length,
    nas_tres_avaliacoes: novatos.filter((rs) => new Set(rs.map((r) => r.tipo)).size === 3).length,
    prioritarios: nominal ? novatos.filter((rs) => rs.some((r) => r.prioritario)).length : null,
  };
  geral.novatos_com_sinal_pct = pct(geral.novatos_com_sinal, geral.novatos);
  const etapas = TIPOS.map((t) => ({ tipo: t, dia: etapasDe(cfg).find((e) => e.tipo === t).dia, ...agregarEtapa(rows.filter((r) => r.tipo === t)) }));
  // Evolução: quem respondeu a primeira e a última etapa disponíveis (pelo menos duas)
  const pares = novatos.filter((rs) => rs.length >= 2).map((rs) => [...rs].sort((a, b) => a.tipo - b.tipo)).map((rs) => [rs[0], rs[rs.length - 1]]);
  const dif = (k) => { const v = pares.filter(([a, b]) => a[k] !== null && b[k] !== null); return v.length ? arred2(v.reduce((s, [a, b]) => s + (b[k] - a[k]), 0) / v.length) : null; };
  const evolucao = {
    novatos_com_duas_ou_mais: pares.length,
    saiu_do_sinal: pares.filter(([a, b]) => a.sinais > 0 && b.sinais === 0).length,
    entrou_no_sinal: pares.filter(([a, b]) => a.sinais === 0 && b.sinais > 0).length,
    manteve_sinal: pares.filter(([a, b]) => a.sinais > 0 && b.sinais > 0).length,
    sem_sinal: pares.filter(([a, b]) => a.sinais === 0 && b.sinais === 0).length,
    variacao_nota_atividades: dif("nota_ativ"), variacao_nota_apoio: dif("nota_apoio"), variacao_nota_clima: dif("nota_clima"),
  };
  const negat = (k) => rows.filter((r) => r[k] === 0).length;
  const insat = rows.filter((r) => r.nota_ativ !== null && r.nota_ativ <= cfg.nota_sinal_max).length;
  const motivos = {
    insatisfacao_atividades: ranking(rows, "ativ_motivo", insat, cfg.min_grupo, ocultar),
    lideranca: ranking(rows, "lider_motivo", negat("lider"), cfg.min_grupo, ocultar),
    acolhimento_area: ranking(rows, "acolhido_area", negat("acolhido"), cfg.min_grupo, ocultar),
  };
  return {
    gerado_em: new Date().toISOString(), config: { nota_sinal_max: cfg.nota_sinal_max, risco_moderado_min: cfg.risco_moderado_min, risco_alto_min: cfg.risco_alto_min, min_grupo: cfg.min_grupo, dias: etapasDe(cfg) },
    filtros_aplicados: { site: f.site || null, servico: f.servico || null, de: f.de || null, ate: f.ate || null }, filtros, nominal,
    geral, etapas, evolucao, motivos,
    por_site: agruparPor(rows, "site", cfg, ocultar), por_servico: agruparPor(rows, "servico", cfg, ocultar),
    leitura: leituraResumo(geral, etapas, cfg),
  };
}

/** Sites e serviços que existem nas avaliações (para o coordenador montar o escopo de um cliente). */
async function opcoesEscopo(empresaId) {
  const [sv] = await pool.query(`SELECT servico, COUNT(DISTINCT novato_id) AS novatos FROM rh_canguru_avaliacoes WHERE empresa_id = ? AND servico IS NOT NULL GROUP BY servico ORDER BY servico`, [empresaId]);
  const [st] = await pool.query(`SELECT DISTINCT site FROM rh_canguru_avaliacoes WHERE empresa_id = ? AND site IS NOT NULL ORDER BY site`, [empresaId]);
  return { servicos: sv.map((x) => ({ valor: x.servico, novatos: Number(x.novatos) })), sites: st.map((x) => ({ valor: x.site, rotulo: rotuloSite(x.site) })) };
}

const LIMIAR_PP = 2;
const dpp = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : arred2(b - a));
const tend = (d, inverso = false) => (d === null ? null : Math.abs(d) < LIMIAR_PP ? "estavel" : (d > 0) !== inverso ? "melhorou" : "piorou");

/**
 * Compara dois períodos de resposta (A = anterior, B = atual), com o mesmo recorte (site/serviço ou escopo de cliente).
 * Grupos pequenos nunca entram. `inverso`: para "% com sinal", subir é piorar.
 */
async function compararPeriodos(empresaId, base, perA, perB) {
  const [A, B] = [await resultado(empresaId, { ...base, ...perA }, false), await resultado(empresaId, { ...base, ...perB }, false)];
  const cfg = await carregarConfig(empresaId);
  const g = (x) => ({ novatos: x.geral.novatos, avaliacoes: x.geral.avaliacoes, com_sinal: x.geral.novatos_com_sinal, com_sinal_pct: x.geral.novatos_com_sinal_pct, recorrentes: x.geral.recorrentes });
  const poucos = (x) => x.geral.novatos < cfg.min_grupo;
  const etapas = TIPOS.map((t) => {
    const a = A.etapas.find((e) => e.tipo === t), b = B.etapas.find((e) => e.tipo === t);
    const ok = a.novatos >= cfg.min_grupo && b.novatos >= cfg.min_grupo;
    const c = (k, inv) => { const d = ok ? dpp(a[k], b[k]) : null; return { a: ok ? a[k] : null, b: ok ? b[k] : null, delta: d, tendencia: tend(d, inv) }; };
    return { tipo: t, dia: a.dia, a_respostas: a.respostas, b_respostas: b.respostas, poucos: !ok, expectativas: c("expectativas_pct"), acolhimento: c("acolhimento_pct"), lideranca: c("lideranca_pct"), com_sinal: c("com_sinal_pct", true), nota_atividades: c("nota_atividades"), nota_apoio: c("nota_apoio"), nota_clima: c("nota_clima") };
  });
  const grupos = (campo) => {
    const mb = new Map(B[campo].linhas.map((l) => [l.rotulo, l]));
    return A[campo].linhas.filter((l) => mb.has(l.rotulo) && !l.poucos && !mb.get(l.rotulo).poucos).map((l) => {
      const b = mb.get(l.rotulo); const d = dpp(l.com_sinal_pct, b.com_sinal_pct);
      return { rotulo: l.rotulo, a_novatos: l.novatos, b_novatos: b.novatos, a_sinal_pct: l.com_sinal_pct, b_sinal_pct: b.com_sinal_pct, delta: d, tendencia: tend(d, true), a_risco: l.risco, b_risco: b.risco };
    }).sort((x, y) => (y.delta ?? -999) - (x.delta ?? -999));
  };
  const dSinal = poucos(A) || poucos(B) ? null : dpp(A.geral.novatos_com_sinal_pct, B.geral.novatos_com_sinal_pct);
  const avisos = [`Variações de menos de ${LIMIAR_PP} pontos percentuais são tratadas como estáveis.`, `Períodos ou etapas com menos de ${cfg.min_grupo} novatos não são comparados.`];
  let resumo;
  if (poucos(A) || poucos(B)) resumo = "Um dos períodos tem poucos novatos para comparar com segurança.";
  else resumo = `Novatos com sinal de atenção: ${String(A.geral.novatos_com_sinal_pct).replace(".", ",")}% no período anterior e ${String(B.geral.novatos_com_sinal_pct).replace(".", ",")}% no atual (${dSinal > 0 ? "+" : ""}${String(dSinal).replace(".", ",")} p.p., ${{ melhorou: "melhorou", piorou: "piorou", estavel: "estável" }[tend(dSinal, true)]}).`;
  return { periodo_a: perA, periodo_b: perB, geral: { a: g(A), b: g(B), delta_sinal: dSinal, tendencia: tend(dSinal, true), poucos: poucos(A) || poucos(B) }, etapas, por_site: grupos("por_site"), por_servico: grupos("por_servico"), resumo, avisos, limiar_pp: LIMIAR_PP, filtros_aplicados: A.filtros_aplicados, config: A.config };
}

function leituraResumo(g, etapas, cfg) {
  if (!g.avaliacoes) return "Ainda não há avaliações importadas para este recorte.";
  const e = etapas.filter((x) => x.respostas);
  const ult = e[e.length - 1];
  const partes = [`${g.novatos} novatos responderam ${g.avaliacoes} avaliações.`];
  if (ult) partes.push(`Na avaliação de ${ult.tipo} dias, ${ult.expectativas_pct !== null ? String(ult.expectativas_pct).replace(".", ",") : "—"}% disseram que a empresa atendeu as expectativas, ${ult.acolhimento_pct !== null ? String(ult.acolhimento_pct).replace(".", ",") : "—"}% se sentiram acolhidos e ${ult.lideranca_pct !== null ? String(ult.lideranca_pct).replace(".", ",") : "—"}% consideram o líder um bom gestor.`);
  partes.push(`${g.novatos_com_sinal} (${String(g.novatos_com_sinal_pct).replace(".", ",")}%) tiveram ao menos um sinal de atenção, ${g.recorrentes} em duas ou mais avaliações.`);
  return partes.join(" ");
}

// ── Painel do RH (resumo do Canguru) ──────────────────────────────────
async function resumoPainel(empresaId, nominal) {
  const [[c]] = await pool.query(`SELECT COUNT(*) n FROM rh_canguru_novatos WHERE empresa_id = ?`, [empresaId]);
  if (!Number(c.n)) return { vazio: true };
  const cfg = await carregarConfig(empresaId);
  const res = await resultado(empresaId, {}, nominal);
  const out = { vazio: false, novatos: res.geral.novatos, avaliacoes: res.geral.avaliacoes, novatos_com_sinal: res.geral.novatos_com_sinal, recorrentes: res.geral.recorrentes, leitura: res.leitura, risco: { altos: res.por_site.linhas.filter((l) => l.risco === "alto").length } };
  if (nominal) {
    const { lista } = await carregarBase(empresaId, cfg);
    const etapas = lista.flatMap((n) => n.etapas);
    out.etapas_vencendo = etapas.filter((e) => e.status === "vencendo").length;
    out.etapas_sem_resposta = etapas.filter((e) => e.status === "sem_resposta").length;
    out.pontos_abertos = lista.filter((n) => n.ponto_aberto).length;
    out.fila = lista.filter((n) => n.sinais_total > 0 && !n.ponto_aberto).length;
    out.prioritarios = lista.filter((n) => n.prioritario).length;
  }
  return out;
}

// Lista nominal (só Excel do RH interno)
async function listaNominal(empresaId) {
  const cfg = await carregarConfig(empresaId);
  const { lista } = await carregarBase(empresaId, cfg);
  return lista;
}

module.exports = {
  TIPOS, PASSOS, SINAIS_ROTULO, MIN_GRUPO_MINIMO, rotuloSite, carregarConfig, salvarConfig, importarAvaliacoes, importarAdmissoes, modeloAdmissoes, acompanhamento, ficha, salvarAdmissao,
  filaAtencao, listarPontos, equipe, abrirPonto, atualizarPonto, resultado, opcoesEscopo, compararPeriodos, resumoPainel, listaNominal, etapasDe,
};
