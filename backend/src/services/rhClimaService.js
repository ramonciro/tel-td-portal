/**
 * rhClimaService.js — Pesquisa de Clima Organizacional do RH (Pacote 1 e 2, 12/11/2026)
 *
 * Entrada: planilha exportada do Prime RH (41 afirmações em escala de concordância + 8 notas de 0 a 10
 * para as áreas de apoio + perfil de quem respondeu). Método do PCO:
 *  - positivo = Concordo + Concordo Totalmente; negativo = Discordo + Discordo Totalmente; neutro inclui "Não Sei";
 *  - o índice do tema é a média dos percentuais de cada afirmação do tema (peso igual por afirmação);
 *  - farol pelo % positivo (verde, amarelo, vermelho; limites em rh_config).
 *
 * Privacidade (a pesquisa é ANÔNIMA para o RH, a diretoria e o cliente):
 *  - nome, login, matrícula, supervisor e as respostas individuais NUNCA são gravados. A matrícula só é lida em memória,
 *    para achar resposta duplicada;
 *  - o que vai para o banco são contagens por afirmação, por recorte (geral, serviço, tempo de casa, cargo, faixa etária,
 *    gênero, coordenação). Recorte com menos respondentes que o mínimo (padrão 10, nunca abaixo de 5) não é gravado;
 *    os grupos pequenos entram juntos em "Demais (grupos pequenos)" só se a soma atingir o mínimo;
 *  - os índices dos temas e o farol são calculados na leitura, com a configuração atual de temas.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const R = require("../lib/rhBase");

const MAPA_CAT = new Map(R.CATEGORIAS.map((c, i) => [R.chave(c), i]));
const ORDEM_TEMPO = ["Menos de 1 mês", "Entre 1 e 3 meses", "Entre 3 e 6 meses", "Entre 6 e 12 meses", "Mais de 12 meses"];
const ORDEM_FAIXA = ["18 a 25", "26 a 32", "33 a 40", "Acima de 40"];

// Colunas de perfil/recorte, achadas pelo início do cabeçalho (sem acento e sem maiúscula).
const COLUNAS_PERFIL = [
  { tipo: "tempo", nome: "Tempo de casa", inicio: "selecione o tempo na empresa", ordem: ORDEM_TEMPO },
  { tipo: "faixa", nome: "Faixa etária", inicio: "selecione sua faixa etaria", ordem: ORDEM_FAIXA },
  { tipo: "genero", nome: "Gênero", inicio: "genero" },
  { tipo: "escolaridade", nome: "Escolaridade", inicio: "escolaridade", soPerfil: true },
  { tipo: "estado_civil", nome: "Estado civil", inicio: "selecione seu estado civil", soPerfil: true },
  { tipo: "cargo", nome: "Cargo/posição", inicio: "selecione o cargo" },
  { tipo: "servico", nome: "Serviço", inicio: "servico" },
  { tipo: "coordenacao", nome: "Coordenação", inicio: "coordenador", restrito: true },
];
const RECORTES = COLUNAS_PERFIL.filter((c) => !c.soPerfil);
const PERFIL_TIPOS = COLUNAS_PERFIL.filter((c) => c.tipo !== "coordenacao" && c.tipo !== "servico");

const erroHttp = (status, message) => { const e = new Error(message); e.status = status; return e; };
const n0 = (v) => Number(v || 0);
const arred1 = (v) => Math.round(v * 10) / 10;

// ── Leitura da planilha ───────────────────────────────────────────────
function paraData(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") { // serial do Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  const iso = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0)));
  return null;
}
const isoData = (d) => (d ? d.toISOString().slice(0, 10) : null);

function lerLinhas(buffer) {
  const XLSX = require("xlsx");
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: false }); } catch (_) { throw erroHttp(400, "Não consegui abrir o arquivo. Envie a planilha .xlsx exportada do Prime RH."); }
  // primeira aba que tenha a coluna Matrícula (ou a primeira com dados)
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: null, raw: true });
    if (rows.length && Object.keys(rows[0]).some((c) => R.chave(c) === "matricula")) return rows;
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
  if (!rows.length) throw erroHttp(400, "A planilha está vazia.");
  return rows;
}

function ehColunaAfirmacao(rows, col) {
  let tem = 0, ok = 0;
  for (let i = 0; i < rows.length && tem < 300; i++) {
    const v = rows[i][col];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    tem++;
    if (MAPA_CAT.has(R.chave(v))) ok++;
  }
  return tem >= 5 && ok / tem >= 0.9;
}

/** Acha as colunas da planilha: 41 afirmações, 8 notas, perfil, matrícula e data. Lança 400 com a causa. */
function detectarColunas(rows) {
  const cols = Object.keys(rows[0]);
  const tipoCol = cols.find((c) => R.chave(c) === "tipo de pesquisa");
  if (tipoCol) {
    const tipos = new Set(rows.slice(0, 50).map((r) => R.chave(r[tipoCol])).filter(Boolean));
    if ([...tipos].some((t) => t.includes("avaliacao"))) {
      throw erroHttp(400, "Esta planilha é de avaliação do Canguru, não de clima. Use a planilha da Pesquisa de Clima Organizacional do Prime RH.");
    }
  }
  const afirmacoes = cols.filter((c) => ehColunaAfirmacao(rows, c));
  const notas = cols.filter((c) => R.chave(c).startsWith("com qual nota"));
  if (afirmacoes.length !== 41 || notas.length !== 8) {
    throw erroHttp(400, `Esta planilha não tem o formato esperado (41 afirmações e 8 notas das áreas). Encontrei ${afirmacoes.length} afirmações e ${notas.length} notas. Use a exportação da Pesquisa de Clima do Prime RH.`);
  }
  const achar = (inicio) => cols.find((c) => R.chave(c).startsWith(inicio)) || null;
  const perfil = {};
  for (const p of COLUNAS_PERFIL) perfil[p.tipo] = achar(p.inicio);
  return {
    afirmacoes, notas, perfil,
    matricula: achar("matricula"), dataHora: achar("data e hora"), periodo: achar("periodo"), site: cols.find((c) => R.chave(c) === "site") || null,
  };
}

// ── Agregação ─────────────────────────────────────────────────────────
function vazio() {
  return { n: 0, q: Array.from({ length: 41 }, () => [0, 0, 0, 0, 0, 0]), notas: Array.from({ length: 8 }, () => ({ n: 0, soma: 0, dist: new Array(11).fill(0) })) };
}
function somar(agg, linha) {
  agg.n++;
  for (let i = 0; i < 41; i++) { const c = linha.q[i]; if (c !== null) agg.q[i][c]++; }
  for (let i = 0; i < 8; i++) {
    const v = linha.notas[i];
    if (v !== null) { agg.notas[i].n++; agg.notas[i].soma += v; agg.notas[i].dist[v]++; }
  }
}
function agregar(linhas) { const a = vazio(); for (const l of linhas) somar(a, l); return a; }

/** Grupos de um recorte: só com n >= mínimo; os pequenos entram juntos em "Demais" se a soma atingir o mínimo. */
function grupos(linhas, tipoDef, minimo) {
  const mapa = new Map();
  for (const l of linhas) {
    const g = l.perfil[tipoDef.tipo] || "Não informado";
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g).push(l);
  }
  const grandes = [], pequenos = [];
  for (const [g, ls] of mapa) (ls.length >= minimo ? grandes : pequenos).push([g, ls]);
  if (tipoDef.ordem) grandes.sort((a, b) => (tipoDef.ordem.indexOf(a[0]) + 100) % 100 - (tipoDef.ordem.indexOf(b[0]) + 100) % 100 || b[1].length - a[1].length);
  else grandes.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
  const demais = pequenos.flatMap(([, ls]) => ls);
  const saida = grandes.map(([g, ls]) => ({ rotulo: g, linhas: ls }));
  if (demais.length >= minimo) saida.push({ rotulo: "Demais (grupos pequenos)", linhas: demais });
  return saida;
}

/** Distribuição do perfil de quem respondeu (nunca grava categoria com menos que o mínimo). */
function distribuicaoPerfil(linhas, def, minimo) {
  const total = linhas.length;
  const cont = new Map();
  for (const l of linhas) { const g = l.perfil[def.tipo] || "Não informado"; cont.set(g, (cont.get(g) || 0) + 1); }
  let itens = [...cont.entries()].map(([rotulo, n]) => ({ rotulo, n }));
  if (def.ordem) itens = def.ordem.map((o) => ({ rotulo: o, n: cont.get(o) || 0 })).concat(itens.filter((i) => !def.ordem.includes(i.rotulo)));
  else itens.sort((a, b) => b.n - a.n);
  const grandes = itens.filter((i) => i.n >= minimo || i.n === 0);
  const pequenos = itens.filter((i) => i.n > 0 && i.n < minimo);
  const somaPequenos = pequenos.reduce((s, i) => s + i.n, 0);
  const saida = grandes.map((i) => ({ rotulo: i.rotulo, n: i.n, pct: total ? (i.n / total) * 100 : 0 }));
  if (somaPequenos >= minimo) saida.push({ rotulo: "Outros (grupos pequenos)", n: somaPequenos, pct: total ? (somaPequenos / total) * 100 : 0 });
  return saida;
}

// ── Cálculo na leitura (temas e farol com a configuração atual) ───────
const faixaFarol = (pos, lim) => (pos >= lim.farol_verde_min ? "verde" : pos >= lim.farol_amarelo_min ? "amarelo" : "vermelho");

function pnnQuestao(cnt) {
  const tot = cnt.reduce((s, v) => s + v, 0);
  const soma = (idx) => idx.reduce((s, i) => s + cnt[i], 0);
  if (!tot) return { n: 0, pos_pct: null, neu_pct: null, neg_pct: null };
  return { n: tot, pos_pct: (soma(R.IDX_POS) / tot) * 100, neu_pct: (soma(R.IDX_NEU) / tot) * 100, neg_pct: (soma(R.IDX_NEG) / tot) * 100 };
}

/** dados = { n, q:[41][6], notas:[8]{n,soma,dist} } → bloco legível com temas, afirmações e notas. */
function calcular(dados, cfg) {
  const perguntas = cfg.perguntas.map((p) => ({ numero: p.numero, texto: p.texto, tema_id: p.tema_id, contagens: dados.q[p.numero - 1], ...pnnQuestao(dados.q[p.numero - 1]) }));
  const media = (arr, k) => { const v = arr.filter((x) => x[k] !== null); return v.length ? v.reduce((s, x) => s + x[k], 0) / v.length : null; };
  const temas = cfg.temas.filter((t) => t.ativo !== 0).map((t) => {
    const ps = perguntas.filter((p) => p.tema_id === t.id);
    const pos = media(ps, "pos_pct");
    return { id: t.id, nome: t.nome, n_afirmacoes: ps.length, pos_pct: pos, neu_pct: media(ps, "neu_pct"), neg_pct: media(ps, "neg_pct"), farol: pos === null ? null : faixaFarol(pos, cfg.limites) };
  }).filter((t) => t.n_afirmacoes > 0);
  const comTema = perguntas.filter((p) => p.tema_id && temas.some((t) => t.id === p.tema_id));
  const geral = { pos_pct: media(comTema, "pos_pct"), neu_pct: media(comTema, "neu_pct"), neg_pct: media(comTema, "neg_pct") };
  geral.farol = geral.pos_pct === null ? null : faixaFarol(geral.pos_pct, cfg.limites);
  const notas = dados.notas.map((x, i) => ({
    area: R.AREAS[i], n: x.n, media: x.n ? x.soma / x.n : null,
    pct_9_10: x.n ? ((x.dist[9] + x.dist[10]) / x.n) * 100 : null,
    pct_0_6: x.n ? (x.dist.slice(0, 7).reduce((s, v) => s + v, 0) / x.n) * 100 : null,
    dist: x.dist,
  }));
  const comNota = notas.filter((x) => x.media !== null);
  return { n: dados.n, geral, temas, perguntas, notas, nota_media: comNota.length ? comNota.reduce((s, x) => s + x.media, 0) / comNota.length : null };
}

function resumoExecutivo(bloco, ciclo) {
  const temas = [...bloco.temas].filter((t) => t.pos_pct !== null).sort((a, b) => b.pos_pct - a.pos_pct);
  if (!temas.length) return `${bloco.n} pessoas responderam à pesquisa.`;
  const p1 = (v) => `${v.toFixed(0)}%`;
  const melhores = temas.slice(0, 2), piores = temas.slice(-3).reverse();
  const vermelhos = temas.filter((t) => t.farol === "vermelho").length;
  let s = `${bloco.n.toLocaleString("pt-BR")} pessoas responderam${ciclo?.cliente ? ` na ${ciclo.cliente}` : ""}. Em média, ${p1(bloco.geral.pos_pct)} das respostas foram positivas e ${p1(bloco.geral.neg_pct)} negativas. `;
  s += `Os temas mais bem avaliados são ${melhores.map((t) => `${t.nome} (${p1(t.pos_pct)})`).join(" e ")}. `;
  s += `Os que mais pedem atenção são ${piores.map((t) => `${t.nome} (${p1(t.pos_pct)})`).join(", ")}`;
  s += vermelhos ? `, com ${vermelhos} ${vermelhos === 1 ? "tema" : "temas"} em vermelho.` : ".";
  return s;
}

// ── Importação ────────────────────────────────────────────────────────
function lerRespostas(rows, col) {
  const linhas = [];
  const rel = { sem_resposta_afirmacao: 0, valor_desconhecido: 0, notas_fora_da_escala: 0, notas_vazias: 0, linhas_vazias: 0 };
  for (const r of rows) {
    const q = col.afirmacoes.map((c) => {
      const v = r[c];
      if (v === null || v === undefined || String(v).trim() === "") { rel.sem_resposta_afirmacao++; return null; }
      const i = MAPA_CAT.get(R.chave(v));
      if (i === undefined) { rel.valor_desconhecido++; return null; }
      return i;
    });
    const notas = col.notas.map((c) => {
      const v = r[c];
      if (v === null || v === undefined || String(v).trim() === "") { rel.notas_vazias++; return null; }
      const x = Number(String(v).replace(",", "."));
      if (!Number.isFinite(x) || x < 0 || x > 10 || !Number.isInteger(Math.round(x))) { rel.notas_fora_da_escala++; return null; }
      return Math.round(x);
    });
    if (q.every((x) => x === null)) { rel.linhas_vazias++; continue; }
    const perfil = {};
    for (const p of COLUNAS_PERFIL) {
      const c = col.perfil[p.tipo];
      const v = c ? r[c] : null;
      perfil[p.tipo] = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().replace(/\s+/g, " ");
    }
    const quando = col.dataHora ? paraData(r[col.dataHora]) : null;
    const mat = col.matricula && r[col.matricula] !== null && r[col.matricula] !== undefined ? String(r[col.matricula]).trim() : "";
    linhas.push({ q, notas, perfil, quando, mat, periodo: col.periodo ? r[col.periodo] : null });
  }
  return { linhas, rel };
}

/** Uma resposta por matrícula (vale a mais recente). A matrícula só existe aqui, em memória. */
function removerDuplicados(linhas) {
  const porMat = new Map();
  let semMatricula = 0;
  const unicas = [];
  for (const l of linhas) {
    if (!l.mat) { semMatricula++; unicas.push(l); continue; }
    const ant = porMat.get(l.mat);
    if (!ant || (l.quando && (!ant.quando || l.quando > ant.quando))) porMat.set(l.mat, l);
  }
  return { linhas: unicas.concat([...porMat.values()]), duplicados: linhas.length - unicas.length - porMat.size, semMatricula };
}

function montarResultados(linhas, minimo) {
  const itens = [{ tipo: "geral", rotulo: "Geral", ordem: 0, agg: agregar(linhas) }];
  for (const def of RECORTES) {
    grupos(linhas, def, minimo).forEach((g, i) => itens.push({ tipo: def.tipo, rotulo: g.rotulo, ordem: i + 1, agg: agregar(g.linhas) }));
  }
  const perfil = {};
  for (const def of PERFIL_TIPOS.concat(COLUNAS_PERFIL.filter((c) => c.tipo === "servico"))) perfil[def.tipo] = distribuicaoPerfil(linhas, def, minimo);
  itens[0].perfil = perfil;
  return itens;
}

async function importarClima({ empresaId, usuario, buffer, simular, nome, cliente, substituir }) {
  const cfg = await R.carregarConfig(empresaId);
  const minimo = Math.max(R.MIN_RECORTE_MINIMO, cfg.limites.min_recorte);
  const rows = lerLinhas(buffer);
  const col = detectarColunas(rows);
  const { linhas: todas, rel: relLeitura } = lerRespostas(rows, col);
  const dedup = removerDuplicados(todas);
  const linhas = dedup.linhas;
  if (!linhas.length) throw erroHttp(400, "Não encontrei nenhuma resposta válida na planilha.");

  const datas = linhas.map((l) => l.quando).filter(Boolean).sort((a, b) => a - b);
  const periodoTxt = col.periodo ? (linhas.find((l) => l.periodo)?.periodo ?? null) : null;
  const nomeCiclo = String(nome || "").trim() || `Clima ${datas.length ? isoData(datas[datas.length - 1]).slice(0, 7) : ""}`.trim();
  const clienteTxt = String(cliente || "").trim() || null;

  const [existente] = await pool.query(`SELECT id FROM rh_clima_ciclos WHERE empresa_id = ? AND nome = ?`, [empresaId, nomeCiclo]);
  const itens = montarResultados(linhas, minimo);
  const geralCalc = calcular(itens[0].agg, cfg);

  const rel = {
    simulacao: !!simular,
    ciclo: { id: null, nome: nomeCiclo, cliente: clienteTxt, periodo: periodoTxt ? String(periodoTxt).trim() : null, data_ini: isoData(datas[0]), data_fim: isoData(datas[datas.length - 1]) },
    linhas: { lidas: rows.length, respondentes: linhas.length, duplicados_removidos: dedup.duplicados, sem_matricula: dedup.semMatricula, linhas_vazias: relLeitura.linhas_vazias },
    qualidade: { afirmacoes_identificadas: 41, notas_identificadas: 8, sem_resposta_em_afirmacao: relLeitura.sem_resposta_afirmacao, valor_desconhecido: relLeitura.valor_desconhecido, notas_fora_da_escala: relLeitura.notas_fora_da_escala, notas_vazias: relLeitura.notas_vazias },
    recortes: RECORTES.map((d) => ({ tipo: d.tipo, nome: d.nome, grupos: itens.filter((i) => i.tipo === d.tipo && !i.rotulo.startsWith("Demais")).length, com_demais: itens.some((i) => i.tipo === d.tipo && i.rotulo.startsWith("Demais")), restrito: !!d.restrito })),
    minimo_recorte: minimo,
    ja_existe: existente.length > 0,
    substitui: existente.length > 0 && !!substituir,
    resultado: { respondentes: geralCalc.n, pos_pct: geralCalc.geral.pos_pct, neg_pct: geralCalc.geral.neg_pct, nota_media: geralCalc.nota_media, temas: geralCalc.temas.map((t) => ({ nome: t.nome, pos_pct: t.pos_pct, farol: t.farol })) },
    privacidade: "Nome, login, matrícula, supervisor e respostas individuais não são gravados. Só contagens por afirmação, em grupos de pelo menos " + minimo + " pessoas.",
    avisos: [],
  };
  if (relLeitura.valor_desconhecido) rel.avisos.push(`${relLeitura.valor_desconhecido} respostas com valor fora da escala (Concordo...Discordo Totalmente) foram ignoradas.`);
  if (relLeitura.notas_fora_da_escala) rel.avisos.push(`${relLeitura.notas_fora_da_escala} notas fora de 0 a 10 foram ignoradas.`);
  if (dedup.duplicados) rel.avisos.push(`${dedup.duplicados} respostas repetidas da mesma matrícula foram descartadas (vale a mais recente).`);
  if (existente.length && !substituir) rel.avisos.push("Já existe um ciclo com este nome. Para importar de novo, confirme a substituição ou mude o nome.");

  if (simular) return rel;
  if (existente.length && !substituir) throw Object.assign(erroHttp(409, `Já existe um ciclo chamado "${nomeCiclo}". Mude o nome ou confirme a substituição.`), { codigo: "CICLO_EXISTE" });

  const cicloId = await comTransacao(async (conn) => {
    if (existente.length) {
      await conn.query(`DELETE FROM rh_clima_resultados WHERE empresa_id = ? AND ciclo_id = ?`, [empresaId, existente[0].id]);
      await conn.query(`DELETE FROM rh_clima_ciclos WHERE empresa_id = ? AND id = ?`, [empresaId, existente[0].id]);
    }
    const [ins] = await conn.query(
      `INSERT INTO rh_clima_ciclos (empresa_id, nome, cliente, periodo, data_ini, data_fim, n_respondentes, importado_por, importado_por_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empresaId, nomeCiclo, clienteTxt, rel.ciclo.periodo, rel.ciclo.data_ini, rel.ciclo.data_fim, linhas.length, usuario?.id ?? null, usuario?.nome ?? null]
    );
    for (const it of itens) {
      const dados = { n: it.agg.n, q: it.agg.q, notas: it.agg.notas, ...(it.perfil ? { perfil: it.perfil } : {}) };
      await conn.query(
        `INSERT INTO rh_clima_resultados (empresa_id, ciclo_id, tipo, rotulo, ordem, n, dados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [empresaId, ins.insertId, it.tipo, it.rotulo, it.ordem, it.agg.n, JSON.stringify(dados)]
      );
    }
    return ins.insertId;
  });
  rel.ciclo.id = cicloId;
  return rel;
}

// ── Leitura ───────────────────────────────────────────────────────────
async function listarCiclos(empresaId) {
  const [rows] = await pool.query(
    `SELECT id, nome, cliente, periodo, DATE_FORMAT(data_ini, '%Y-%m-%d') AS data_ini, DATE_FORMAT(data_fim, '%Y-%m-%d') AS data_fim,
            n_respondentes, status, importado_por_nome, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS importado_em
       FROM rh_clima_ciclos WHERE empresa_id = ? ORDER BY COALESCE(data_fim, DATE(created_at)) DESC, id DESC`, [empresaId]);
  return rows;
}
async function carregarCiclo(empresaId, id) {
  const [rows] = await pool.query(
    `SELECT id, nome, cliente, periodo, DATE_FORMAT(data_ini, '%Y-%m-%d') AS data_ini, DATE_FORMAT(data_fim, '%Y-%m-%d') AS data_fim,
            n_respondentes, status, importado_por_nome, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS importado_em
       FROM rh_clima_ciclos WHERE empresa_id = ? AND id = ?`, [empresaId, id]);
  return rows[0] || null;
}
async function carregarBloco(empresaId, cicloId, tipo, rotulo = null) {
  const [rows] = await pool.query(
    `SELECT tipo, rotulo, ordem, n, dados FROM rh_clima_resultados WHERE empresa_id = ? AND ciclo_id = ? AND tipo = ?${rotulo ? " AND rotulo = ?" : ""} ORDER BY ordem, id`,
    rotulo ? [empresaId, cicloId, tipo, rotulo] : [empresaId, cicloId, tipo]);
  return rows.map((r) => ({ ...r, dados: JSON.parse(r.dados) }));
}

/** Resultado geral do ciclo (resumo, temas, afirmações, notas e perfil). */
async function resultadoGeral(empresaId, ciclo) {
  const cfg = await R.carregarConfig(empresaId);
  const [geral] = await carregarBloco(empresaId, ciclo.id, "geral");
  if (!geral) return null;
  const calc = calcular(geral.dados, cfg);
  return { ciclo, limites: cfg.limites, resumo: resumoExecutivo(calc, ciclo), ...calc, perfil: geral.dados.perfil || {} };
}

/** Recorte (um tipo): cada grupo com índice geral e % positivo por tema. */
async function recorte(empresaId, ciclo, tipo) {
  const def = RECORTES.find((d) => d.tipo === tipo);
  if (!def) throw erroHttp(400, "Recorte inválido.");
  const cfg = await R.carregarConfig(empresaId);
  const blocos = await carregarBloco(empresaId, ciclo.id, tipo);
  const geral = (await carregarBloco(empresaId, ciclo.id, "geral"))[0];
  const calcGeral = calcular(geral.dados, cfg);
  return {
    tipo, nome: def.nome, restrito: !!def.restrito, minimo: cfg.limites.min_recorte, limites: cfg.limites,
    temas: calcGeral.temas.map((t) => ({ id: t.id, nome: t.nome })),
    geral: { n: calcGeral.n, pos_pct: calcGeral.geral.pos_pct, farol: calcGeral.geral.farol, temas: calcGeral.temas.map((t) => ({ id: t.id, pos_pct: t.pos_pct, farol: t.farol })) },
    grupos: blocos.map((b) => {
      const c = calcular(b.dados, cfg);
      return { rotulo: b.rotulo, n: b.n, pos_pct: c.geral.pos_pct, neg_pct: c.geral.neg_pct, farol: c.geral.farol, nota_media: c.nota_media, temas: c.temas.map((t) => ({ id: t.id, pos_pct: t.pos_pct, farol: t.farol })) };
    }),
  };
}

// ── Comparativo entre dois ciclos (13/11/2026) ────────────────────────
// Os dois ciclos são calculados com os temas e afirmações ATUAIS do cadastro (a resposta de cada afirmação fica gravada por ciclo),
// então a comparação é justa mesmo se o coordenador reorganizar os temas depois. Só agregado: nenhum dado individual.
const LIMIAR_VARIACAO = 2; // pontos percentuais: abaixo disso a variação é tratada como "estável"
const arred = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const delta = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : arred(b - a));
const tendencia = (d) => (d === null ? null : d >= LIMIAR_VARIACAO ? "melhorou" : d <= -LIMIAR_VARIACAO ? "piorou" : "estavel");

async function comparar(empresaId, cicloA, cicloB, tipoRecorte, incluirRestrito) {
  const [A, B] = [await resultadoGeral(empresaId, cicloA), await resultadoGeral(empresaId, cicloB)];
  if (!A || !B) throw erroHttp(404, "Um dos ciclos não tem resultado calculado.");
  const temas = B.temas.map((tb) => {
    const ta = A.temas.find((t) => t.id === tb.id) || null;
    const d = delta(ta?.pos_pct, tb.pos_pct);
    return { id: tb.id, nome: tb.nome, a_pos: arred(ta?.pos_pct), b_pos: arred(tb.pos_pct), delta: d, tendencia: tendencia(d), a_farol: ta?.farol || null, b_farol: tb.farol, a_neg: arred(ta?.neg_pct), b_neg: arred(tb.neg_pct), delta_neg: delta(ta?.neg_pct, tb.neg_pct) };
  });
  const afirmacoes = B.perguntas.map((pb) => {
    const pa = A.perguntas.find((p) => p.numero === pb.numero);
    const d = delta(pa?.pos_pct, pb.pos_pct);
    return { numero: pb.numero, texto: pb.texto, tema_id: pb.tema_id, a_pos: arred(pa?.pos_pct), b_pos: arred(pb.pos_pct), delta: d, tendencia: tendencia(d) };
  });
  const notas = B.notas.map((nb, i) => ({ area: nb.area, a_media: arred(A.notas[i]?.media), b_media: arred(nb.media), delta: delta(A.notas[i]?.media, nb.media), a_n: A.notas[i]?.n || 0, b_n: nb.n }));
  const geral = {
    a: { n: A.n, pos_pct: arred(A.geral.pos_pct), neg_pct: arred(A.geral.neg_pct), neu_pct: arred(A.geral.neu_pct), nota_media: arred(A.nota_media), farol: A.geral.farol },
    b: { n: B.n, pos_pct: arred(B.geral.pos_pct), neg_pct: arred(B.geral.neg_pct), neu_pct: arred(B.geral.neu_pct), nota_media: arred(B.nota_media), farol: B.geral.farol },
    delta_pos: delta(A.geral.pos_pct, B.geral.pos_pct), delta_neg: delta(A.geral.neg_pct, B.geral.neg_pct), delta_nota: delta(A.nota_media, B.nota_media), delta_n: B.n - A.n,
  };
  geral.tendencia = tendencia(geral.delta_pos);
  const comDelta = temas.filter((t) => t.delta !== null);
  const destaques = {
    melhoras: [...comDelta].filter((t) => t.delta >= LIMIAR_VARIACAO).sort((x, y) => y.delta - x.delta).slice(0, 3),
    quedas: [...comDelta].filter((t) => t.delta <= -LIMIAR_VARIACAO).sort((x, y) => x.delta - y.delta).slice(0, 3),
    saiu_do_vermelho: temas.filter((t) => t.a_farol === "vermelho" && t.b_farol !== "vermelho").map((t) => t.nome),
    entrou_no_vermelho: temas.filter((t) => t.a_farol !== "vermelho" && t.a_farol !== null && t.b_farol === "vermelho").map((t) => t.nome),
    afirmacoes_melhoras: [...afirmacoes].filter((x) => x.delta !== null && x.delta >= LIMIAR_VARIACAO).sort((x, y) => y.delta - x.delta).slice(0, 3),
    afirmacoes_quedas: [...afirmacoes].filter((x) => x.delta !== null && x.delta <= -LIMIAR_VARIACAO).sort((x, y) => x.delta - y.delta).slice(0, 3),
  };
  const avisos = [];
  if (cicloA.cliente !== cicloB.cliente) avisos.push("Os dois ciclos são de clientes diferentes. A comparação mostra a diferença, mas não é evolução do mesmo grupo.");
  if (A.n && Math.abs(B.n - A.n) / A.n > 0.3) avisos.push(`O número de respondentes mudou bastante (${A.n.toLocaleString("pt-BR")} → ${B.n.toLocaleString("pt-BR")}). Leia a variação com cuidado: o grupo que respondeu não é o mesmo.`);
  avisos.push(`Variações de menos de ${LIMIAR_VARIACAO} pontos percentuais são tratadas como estáveis.`);

  let recorte = null;
  if (tipoRecorte) {
    const def = RECORTES.find((d) => d.tipo === tipoRecorte);
    if (!def) throw erroHttp(400, "Recorte inválido.");
    if (def.restrito && !incluirRestrito) throw erroHttp(403, "O recorte por coordenação é só da equipe do RH.");
    const [ra, rb] = [await recorteDe(empresaId, cicloA, tipoRecorte), await recorteDe(empresaId, cicloB, tipoRecorte)];
    const grupos = rb.grupos.filter((g) => !g.rotulo.startsWith("Demais")).map((gb) => {
      const ga = ra.grupos.find((g) => g.rotulo === gb.rotulo) || null;
      const d = delta(ga?.pos_pct, gb.pos_pct);
      return { rotulo: gb.rotulo, a_n: ga?.n ?? null, b_n: gb.n, a_pos: arred(ga?.pos_pct), b_pos: arred(gb.pos_pct), delta: d, tendencia: tendencia(d), b_farol: gb.farol, a_farol: ga?.farol || null };
    });
    recorte = { tipo: tipoRecorte, nome: def.nome, grupos, so_em_um: { so_no_anterior: ra.grupos.filter((g) => !g.rotulo.startsWith("Demais") && !rb.grupos.some((x) => x.rotulo === g.rotulo)).map((g) => g.rotulo) }, minimo: B.limites.min_recorte };
  }
  return { limiar: LIMIAR_VARIACAO, a: cicloA, b: cicloB, geral, temas, afirmacoes, notas, destaques, avisos, recorte, limites: B.limites, resumo: resumoComparativo(geral, destaques, cicloA, cicloB) };
}
async function recorteDe(empresaId, ciclo, tipo) {
  const r = await recorte(empresaId, ciclo, tipo);
  return r;
}
function resumoComparativo(g, d, a, b) {
  const p1 = (v) => `${String(Math.abs(v)).replace(".", ",")}`;
  let s = `De “${a.nome}” para “${b.nome}”, a parcela de respostas positivas `;
  s += g.delta_pos === null ? "não pôde ser comparada." : g.tendencia === "estavel" ? `ficou estável (${g.a.pos_pct}% → ${g.b.pos_pct}%).` : `${g.delta_pos > 0 ? "subiu" : "caiu"} ${p1(g.delta_pos)} ponto(s) percentual(is) (${g.a.pos_pct}% → ${g.b.pos_pct}%).`;
  if (d.melhoras.length) s += ` Maiores avanços: ${d.melhoras.map((t) => `${t.nome} (+${p1(t.delta)})`).join(", ")}.`;
  if (d.quedas.length) s += ` Maiores quedas: ${d.quedas.map((t) => `${t.nome} (−${p1(t.delta)})`).join(", ")}.`;
  if (d.saiu_do_vermelho.length) s += ` Saíram do vermelho: ${d.saiu_do_vermelho.join(", ")}.`;
  if (d.entrou_no_vermelho.length) s += ` Entraram no vermelho: ${d.entrou_no_vermelho.join(", ")}.`;
  return s;
}

function tiposRecorte() { return RECORTES.map((d) => ({ tipo: d.tipo, nome: d.nome, restrito: !!d.restrito })); }

module.exports = { importarClima, listarCiclos, carregarCiclo, resultadoGeral, recorte, comparar, LIMIAR_VARIACAO, tiposRecorte, calcular, resumoExecutivo, carregarBloco, faixaFarol, RECORTES, COLUNAS_PERFIL, PERFIL_TIPOS, arred1, n0 };
