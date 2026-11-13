/**
 * rhCangaruSupervisorService.js — Projeto Canguru, visão do SUPERVISOR (Pacote 9, 13/11/2026)
 *
 * O supervisor avalia o novato (operador) aos 30, 60 e 85 dias, com nota de 0 a 5 em cada requisito:
 * Negociação, Relacionamento interpessoal, Resolução e Empatia (30 dias); + Conduta (60 dias); + Responsabilidade e Ética (85 dias).
 * Nota baixa traz categoria, motivo e observação. O formulário de 85 dias entra como a 3ª etapa (tipo 90), igual à avaliação do operador.
 *
 * Regras:
 *  - o novato é o mesmo do Canguru do operador (ligado pela matrícula); quem ainda não está no Canguru fica de fora, a menos que se marque “incluir”;
 *  - sinal de atenção = requisito com nota até o limite das regras do Canguru (padrão 2);
 *  - linha com TODAS as notas zeradas é tratada como “sem avaliação” (abandono, falta): fica de fora das médias, conta como sinal e como relato prioritário;
 *  - observação com termo de abandono/ausência também marca a resposta como prioritária (os termos de saúde do operador não valem aqui: “postura agressiva” descreve o novato);
 *  - texto livre com código CID é removido; só a equipe do RH vê nome e observação; gestor e relatórios recebem agregados (grupos com o mínimo de novatos);
 *  - o ranking por supervisor é só do RH interno.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const L = require("./rhCangaruLotes");
const R = require("../lib/rhBase");
const C = require("./rhCangaruService");
const { resolverPessoa, matriculaParaComparar, nomesParecidos } = require("./pessoasService");

const { REQUISITOS, REQ_ROTULO, TIPOS } = C;
const chave = R.chave;
const erroHttp = (status, message) => { const e = new Error(message); e.status = status; return e; };
const arred2 = (v) => Math.round(v * 100) / 100;
const arred1 = (v) => Math.round(v * 10) / 10;
const pct = (a, b) => (b ? arred1((a / b) * 100) : null);
const fmt = (n) => (n === null || n === undefined ? "—" : String(n).replace(".", ","));
const mediaDe = (arr) => { const v = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(Number(x))).map(Number); return v.length ? arred2(v.reduce((s, x) => s + x, 0) / v.length) : null; };

const FORM_PARA_TIPO = { 30: 30, 60: 60, 85: 90, 90: 90 };
const TOKENS_REQ = [["neg", "negoci"], ["rel", "relacion"], ["res", "resolu"], ["emp", "empat"], ["cond", "condu"], ["resp", "responsab"], ["etica", "etic"]];
const TERMOS_RISCO = [["abandono", /abandon/], ["falta injustificada", /falta[s]? injustificada|escala em falta|perfil de abs/], ["ausência", /ausenc/], ["pedido de demissão", /pedido de demissao|quer sair|deseja sair/], ["desligamento", /desligament/]];

// ── Leitura da planilha ───────────────────────────────────────────────
function lerLinhas(buffer, nome) {
  const XLSX = require("xlsx");
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true }); } catch (_) { throw erroHttp(400, `Não consegui abrir “${nome}”. Envie a planilha .xlsx do relatório de avaliação do supervisor.`); }
  for (const aba of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { defval: null, raw: true });
    if (!rows.length) continue;
    const hs = Object.keys(rows[0]).map(chave);
    if (hs.includes("tipo de pesquisa") || hs.includes("login")) throw erroHttp(400, `“${nome}” é a planilha de respostas do OPERADOR. Troque a visão para “Operador” para importá-la.`);
    if (hs.includes("matricula") && hs.includes("nome do formulario")) return rows;
  }
  throw erroHttp(400, `“${nome}” não parece o relatório de avaliação do supervisor (faltou Matrícula ou Nome do Formulário).`);
}

function mapearColunas(headers) {
  const base = {}; const grupos = new Map();
  for (const h of headers) {
    const k = chave(h);
    const g = k.match(/^(pergunta|nota|categoria|opcao|observacao) (\d+)$/);
    if (g) { const n = Number(g[2]); if (!grupos.has(n)) grupos.set(n, {}); grupos.get(n)[g[1]] = h; continue; }
    if (k === "nome" || k === "matricula" || k === "supervisor" || k === "matricula supervisor" || k === "data resposta" || k === "servico operacao" || k === "nome do formulario") base[k] = h;
  }
  return { base, grupos: [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v) };
}

function requisitoDe(pergunta) {
  const t = String(pergunta || "");
  const m = t.match(/requisito\s*["'“”‘’]?\s*([^"'“”‘’.]+)/i);
  const k = chave(m ? m[1] : t.slice(0, 200));
  for (const [r, tok] of TOKENS_REQ) if (k.includes(tok)) return r;
  return null;
}
const tipoDeFormulario = (v) => { const m = String(v || "").match(/(\d+)/); const n = m ? Number(m[1]) : 0; return { dias: n || null, tipo: FORM_PARA_TIPO[n] || 0 }; };
const notaDe = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const m = String(v).match(/(\d+)/); if (!m) return NaN;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : NaN;
};

function montarEntradas(arquivos, cfg, contagem) {
  const entradas = new Map();
  const resumoArquivos = [];
  let lidas = 0, duplicadas = 0, semMatricula = 0, tipoInvalido = 0, foraEscala = 0, semRequisito = 0;
  for (const arq of arquivos) {
    const rows = lerLinhas(arq.buffer, arq.nome);
    const { base, grupos } = mapearColunas(Object.keys(rows[0]));
    const tiposArq = new Set(); let linhasArq = 0;
    rows.forEach((r, i) => {
      const nome = String(r[base.nome] ?? "").trim();
      const matricula = String(r[base.matricula] ?? "").trim();
      if (!nome && !matricula) return;
      lidas += 1; linhasArq += 1;
      const { dias, tipo } = tipoDeFormulario(r[base["nome do formulario"]]);
      if (!tipo) { tipoInvalido += 1; return; }
      const matNorm = matriculaParaComparar(matricula);
      if (!matNorm) { semMatricula += 1; return; }
      tiposArq.add(tipo);
      const notas = Object.fromEntries(REQUISITOS.map((k) => [k, null]));
      const detalhes = []; const textos = [];
      for (const g of grupos) {
        const req = requisitoDe(r[g.pergunta]);
        if (!req) { semRequisito += 1; continue; }
        let nota = notaDe(r[g.nota]);
        if (Number.isNaN(nota)) { foraEscala += 1; nota = null; }
        notas[req] = nota;
        const cat = C.limparTexto(r[g.categoria], contagem), op = C.textoOuNulo(r[g.opcao]), obs = C.limparTexto(r[g.observacao], contagem);
        if (cat) textos.push(cat); if (op) textos.push(op); if (obs) textos.push(obs);
        if (nota !== null || cat || op || obs) detalhes.push({ r: req, n: nota, c: cat, o: op, t: obs });
      }
      const valores = REQUISITOS.map((k) => notas[k]).filter((x) => x !== null);
      const zerada = valores.length > 0 && valores.every((x) => x === 0);
      const sinaisLista = REQUISITOS.filter((k) => notas[k] !== null && notas[k] <= cfg.nota_sinal_max);
      const corpo = chave(textos.join(" | "));
      const termos = TERMOS_RISCO.filter(([, re]) => re.test(corpo)).map(([rot]) => rot);
      if (zerada) termos.unshift("todas as notas zeradas");
      const dt = C.paraData(r[base["data resposta"]]);
      const e = {
        matNorm, tipo, formulario_dias: dias, linha: i + 2, arquivo: arq.nome, nome, matricula, respondida_em: dt,
        supervisor_nome: C.textoOuNulo(r[base.supervisor]), supervisor_matricula: C.textoOuNulo(r[base["matricula supervisor"]]), servico_arquivo: C.textoOuNulo(r[base["servico operacao"]]),
        notas, media: zerada || !valores.length ? null : arred2(valores.reduce((s, x) => s + x, 0) / valores.length), zerada, detalhes,
        sinais: sinaisLista.length, sinais_lista: sinaisLista.join(","), prioritario: termos.length ? 1 : 0, prioritario_termos: termos.join(", ") || null,
      };
      const k = `${matNorm}|${tipo}`; const ant = entradas.get(k);
      if (ant) { duplicadas += 1; if (!(dt && ant.respondida_em && dt < ant.respondida_em)) entradas.set(k, e); } else entradas.set(k, e);
    });
    resumoArquivos.push({ nome: arq.nome, linhas: linhasArq, tipos: [...tiposArq].sort((x, y) => x - y) });
  }
  return { entradas: [...entradas.values()], resumoArquivos, lidas, duplicadas, semMatricula, tipoInvalido, foraEscala, semRequisito };
}

async function carregarNovatos(empresaId) {
  const [rows] = await pool.query(
    `SELECT n.id, n.pessoa_id, n.matricula, n.servico, n.supervisor, p.nome, p.matricula AS pmat, p.data_admissao
       FROM rh_canguru_novatos n JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id WHERE n.empresa_id = ?`, [empresaId]);
  const porMat = new Map();
  for (const n of rows) for (const m of new Set([matriculaParaComparar(n.matricula), matriculaParaComparar(n.pmat)].filter(Boolean))) { if (!porMat.has(m)) porMat.set(m, []); porMat.get(m).push(n); }
  return porMat;
}

// ── Importação ────────────────────────────────────────────────────────
// O arquivo do supervisor traz só o serviço (ex.: "INSS - GERAL"), e o serviço pertence a um site (ex.: ACM).
// Para quem entra por "incluir novos", o site vem do que já está cadastrado no Canguru para o mesmo serviço (o mais frequente).
const normServ = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
async function mapaSiteDosServicos(conn, empresaId) {
  const [rows] = await conn.query(`SELECT servico, site, COUNT(*) n FROM rh_canguru_novatos WHERE empresa_id = ? AND servico IS NOT NULL AND site IS NOT NULL GROUP BY servico, site`, [empresaId]);
  const melhor = new Map();
  for (const r of rows) { const k = normServ(r.servico); const at = melhor.get(k); if (!at || Number(r.n) > at.n) melhor.set(k, { site: r.site, n: Number(r.n) }); }
  return new Map([...melhor].map(([k, v]) => [k, v.site]));
}
const siteDoServico = (mapa, servico) => (mapa && servico ? mapa.get(normServ(servico)) || null : null);

async function importarSupervisor({ empresaId, usuario, arquivos, simular, incluirNovos }) {
  if (!arquivos?.length) throw erroHttp(400, "Envie pelo menos uma planilha (.xlsx) de avaliação do supervisor (30, 60 ou 85 dias).");
  const cfg = await C.carregarConfig(empresaId);
  const contagem = { cid: 0 };
  const m = montarEntradas(arquivos, cfg, contagem);
  if (!m.entradas.length) throw erroHttp(400, "Não encontrei nenhuma avaliação válida nas planilhas (confira o nome do formulário e a matrícula).");

  const novatos = await carregarNovatos(empresaId);
  const pessoasIdx = incluirNovos ? await C.carregarPessoas(empresaId) : null;
  const grupos = new Map();
  for (const e of m.entradas) { if (!grupos.has(e.matNorm)) grupos.set(e.matNorm, []); grupos.get(e.matNorm).push(e); }

  const rel = {
    simulacao: !!simular, visao: "supervisor", arquivos: m.resumoArquivos,
    linhas: { lidas: m.lidas, avaliacoes: m.entradas.length, duplicadas_removidas: m.duplicadas, formulario_invalido: m.tipoInvalido, sem_matricula: m.semMatricula },
    novatos: { distintos: grupos.size, vinculados: 0, a_incluir: 0, incluidos: 0, fora_do_canguru: 0, nome_diferente: 0 },
    avaliacoes: { por_tipo: Object.fromEntries(TIPOS.map((t) => [t, 0])), importadas: 0, atualizadas: 0, puladas: 0 },
    qualidade: { notas_fora_da_escala: m.foraEscala, perguntas_sem_requisito: m.semRequisito, linhas_zeradas: 0, textos_com_cid_removidos: contagem.cid },
    sinais: { novatos_com_sinal: 0, recorrentes: 0, nas_tres: 0, prioritarios: 0 },
    pulados: [], avisos: [],
  };

  const aProcessar = []; // { ents, novato | criar }
  for (const [mat, ents] of grupos) {
    const ref = ents[0];
    const cand = novatos.get(mat) || [];
    if (cand.length) {
      const ok = cand.find((n) => nomesParecidos(n.nome, ref.nome));
      if (ok) { aProcessar.push({ ents, novato: ok }); rel.novatos.vinculados += 1; continue; }
      rel.novatos.nome_diferente += 1; rel.avaliacoes.puladas += ents.length;
      rel.pulados.push({ motivo: "nome_diferente", nome: ref.nome, matricula: ref.matricula, servico: ref.servico_arquivo, avaliacoes: ents.map((x) => x.tipo).sort((a, b) => a - b), cadastro: cand[0].nome });
      continue;
    }
    if (incluirNovos) {
      const ex = pessoasIdx.porMat.get(mat) || [];
      if (ex.length && !ex.some((p) => nomesParecidos(p.nome, ref.nome))) {
        rel.novatos.nome_diferente += 1; rel.avaliacoes.puladas += ents.length;
        rel.pulados.push({ motivo: "nome_diferente", nome: ref.nome, matricula: ref.matricula, servico: ref.servico_arquivo, avaliacoes: ents.map((x) => x.tipo).sort((a, b) => a - b), cadastro: ex[0].nome });
        continue;
      }
      aProcessar.push({ ents, criar: true }); rel.novatos.a_incluir += 1; continue;
    }
    rel.novatos.fora_do_canguru += 1; rel.avaliacoes.puladas += ents.length;
    rel.pulados.push({ motivo: "fora_do_canguru", nome: ref.nome, matricula: ref.matricula, servico: ref.servico_arquivo, avaliacoes: ents.map((x) => x.tipo).sort((a, b) => a - b) });
  }

  for (const x of aProcessar) {
    const com = x.ents.filter((e) => e.sinais > 0);
    if (com.length) rel.sinais.novatos_com_sinal += 1;
    if (com.length >= 2) rel.sinais.recorrentes += 1;
    if (com.length === 3) rel.sinais.nas_tres += 1;
    if (x.ents.some((e) => e.prioritario)) rel.sinais.prioritarios += 1;
    for (const e of x.ents) { rel.avaliacoes.por_tipo[e.tipo] += 1; if (e.zerada) rel.qualidade.linhas_zeradas += 1; }
  }
  rel.pulados = rel.pulados.slice(0, 200);
  if (rel.novatos.fora_do_canguru) rel.avisos.push(`${rel.novatos.fora_do_canguru} pessoa(s) ainda não estão no Canguru (não há resposta do operador delas). Importe antes as respostas do operador ou marque “incluir quem ainda não está no Canguru”. Cuidado: o arquivo traz também gente de áreas como Qualidade, RH e Treinamento.`);
  if (rel.novatos.nome_diferente) rel.avisos.push(`${rel.novatos.nome_diferente} pessoa(s) têm a matrícula no cadastro com outro nome e foram puladas. Confira a matrícula na planilha.`);
  if (rel.qualidade.linhas_zeradas) rel.avisos.push(`${rel.qualidade.linhas_zeradas} avaliação(ões) vieram com todas as notas zeradas (em geral abandono ou falta). Ficam fora das médias e entram como relato prioritário.`);
  if (m.foraEscala) rel.avisos.push(`${m.foraEscala} nota(s) fora da escala de 0 a 5 foram ignoradas.`);
  if (m.semRequisito) rel.avisos.push(`${m.semRequisito} pergunta(s) não tinham um requisito reconhecível e foram ignoradas.`);
  if (contagem.cid) rel.avisos.push(`${contagem.cid} texto(s) tinham código CID e foram removidos.`);
  if (simular) return rel;

  await comTransacao(async (conn) => {
    const loteId = await L.criarLote(conn, { empresaId, usuario, origem: "supervisor", arquivos: arquivos.map((a) => a.nome).join(", ") });
    const mapaSite = await mapaSiteDosServicos(conn, empresaId);
    for (const x of aProcessar) {
      let novatoId;
      const ref = x.ents[0];
      if (x.novato) {
        novatoId = x.novato.id;
        const st = siteDoServico(mapaSite, ref.servico_arquivo);
        if (st) {
          const [[antesN]] = await conn.query(`SELECT * FROM rh_canguru_novatos WHERE id = ?`, [novatoId]);
          await conn.query(`UPDATE rh_canguru_novatos SET site = ? WHERE id = ? AND empresa_id = ? AND site IS NULL`, [st, novatoId, empresaId]);
          const [[depoisN]] = await conn.query(`SELECT * FROM rh_canguru_novatos WHERE id = ?`, [novatoId]);
          await L.registrarNovato(conn, loteId, empresaId, novatoId, antesN, depoisN);
        }
      }
      else {
        const r = await resolverPessoa({ empresaId, nome: ref.nome, matricula: ref.matricula || null, cliente: ref.servico_arquivo || null }, conn);
        const pessoa = r && r.pessoa;
        if (!pessoa) { rel.novatos.nome_diferente += 1; rel.avaliacoes.puladas += x.ents.length; continue; }
        const [[ja]] = await conn.query(`SELECT id FROM rh_canguru_novatos WHERE empresa_id = ? AND pessoa_id = ?`, [empresaId, pessoa.id]);
        if (ja) novatoId = ja.id;
        else {
          const [[pAdm]] = await conn.query(`SELECT data_admissao FROM pessoas WHERE id = ? AND empresa_id = ?`, [pessoa.id, empresaId]);
          const adm = pAdm?.data_admissao ? C.dataIso(pAdm.data_admissao) : null;
          const [ins] = await conn.query(
            `INSERT INTO rh_canguru_novatos (empresa_id, pessoa_id, matricula, site, servico, funcao, supervisor, coordenador, data_admissao, admissao_origem) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [empresaId, pessoa.id, ref.matricula || null, siteDoServico(mapaSite, ref.servico_arquivo), ref.servico_arquivo, null, ref.supervisor_nome, null, adm, adm ? "cadastro" : null]);
          novatoId = ins.insertId;
          await L.registrarNovato(conn, loteId, empresaId, novatoId, null, null);
        }
        rel.novatos.incluidos += 1;
      }
      for (const e of x.ents) {
        const [[ja]] = await conn.query(`SELECT * FROM rh_canguru_aval_sup WHERE novato_id = ? AND tipo = ?`, [novatoId, e.tipo]);
        const cols = `formulario_dias=?, respondida_em=?, supervisor_nome=?, supervisor_matricula=?, servico_arquivo=?, ${REQUISITOS.map((k) => `nota_${k}=?`).join(", ")}, media=?, zerada=?, sinais=?, sinais_lista=?, prioritario=?, prioritario_termos=?, detalhes=?, origem_arquivo=?, importado_por=?, lote_id=?`;
        const vals = [e.formulario_dias, e.respondida_em ? C.sqlDataHora(e.respondida_em) : null, e.supervisor_nome, e.supervisor_matricula, e.servico_arquivo, ...REQUISITOS.map((k) => e.notas[k]), e.media, e.zerada ? 1 : 0, e.sinais, e.sinais_lista || null, e.prioritario, e.prioritario_termos, JSON.stringify(e.detalhes), String(e.arquivo || "").slice(0, 200), usuario?.id || null, loteId];
        if (ja) { await conn.query(`UPDATE rh_canguru_aval_sup SET ${cols}, importado_em = CURRENT_TIMESTAMP WHERE id = ?`, [...vals, ja.id]); await L.registrarAvaliacao(conn, loteId, empresaId, "rh_canguru_aval_sup", ja.id, ja); rel.avaliacoes.atualizadas += 1; }
        else { const [insA] = await conn.query(`INSERT INTO rh_canguru_aval_sup SET empresa_id = ?, novato_id = ?, tipo = ?, ${cols}`, [empresaId, novatoId, e.tipo, ...vals]); await L.registrarAvaliacao(conn, loteId, empresaId, "rh_canguru_aval_sup", insA.insertId, null); rel.avaliacoes.importadas += 1; }
      }
    }
    rel.lote_id = await L.fecharLote(conn, loteId, { avaliacoes: rel.avaliacoes, novatos: rel.novatos });
  });
  return rel;
}

// ── Resultado (RH, gestor, relatórios) ────────────────────────────────
async function carregarRows(empresaId, f) {
  const params = [empresaId]; let where = `a.empresa_id = ?`;
  if (f.site) { where += ` AND n.site = ?`; params.push(f.site); }
  if (f.servico) { where += ` AND n.servico = ?`; params.push(f.servico); }
  if (f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de)) { where += ` AND a.respondida_em >= ?`; params.push(`${f.de} 00:00:00`); }
  if (f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate)) { where += ` AND a.respondida_em <= ?`; params.push(`${f.ate} 23:59:59`); }
  const [rows] = await pool.query(`SELECT a.*, n.site AS n_site, n.servico AS n_servico FROM rh_canguru_aval_sup a JOIN rh_canguru_novatos n ON n.id = a.novato_id AND n.empresa_id = a.empresa_id WHERE ${where}`, params);
  return rows.map((r) => ({ ...r, tipo: Number(r.tipo), media: r.media === null ? null : Number(r.media), zerada: !!r.zerada, site: r.n_site, servico: r.n_servico, supervisor: r.supervisor_nome || "Sem supervisor informado" }));
}

function agrupar(rows, campo, cfg, ocultar) {
  const m = new Map();
  for (const r of rows) { const k = r[campo] || null; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  const mk = (rotulo, rs, extra = {}) => {
    const novatos = new Set(rs.map((r) => r.novato_id)).size;
    const comSinal = rs.filter((r) => r.sinais > 0).length; const p = pct(comSinal, rs.length);
    return { rotulo, ...extra, novatos, respostas: rs.length, media: mediaDe(rs.map((r) => r.media)), com_sinal: comSinal, com_sinal_pct: p, risco: C.risco(p, cfg), poucos: novatos < cfg.min_grupo,
      por_etapa: Object.fromEntries(TIPOS.map((t) => { const e = rs.filter((r) => r.tipo === t); return [t, { respostas: e.length, media: mediaDe(e.map((r) => r.media)), com_sinal_pct: pct(e.filter((r) => r.sinais > 0).length, e.length) }]; })) };
  };
  let grupos = [...m.entries()].map(([k, rs]) => ({ k, rs }));
  const nov = (g) => new Set(g.rs.map((r) => r.novato_id)).size;
  const pequenos = ocultar ? grupos.filter((g) => nov(g) < cfg.min_grupo) : [];
  grupos = ocultar ? grupos.filter((g) => nov(g) >= cfg.min_grupo) : grupos;
  const linhas = grupos.map((g) => mk(campo === "site" ? C.rotuloSite(g.k) : g.k || "Sem informação", g.rs, { valor: g.k })).sort((a, b) => (b.com_sinal_pct ?? -1) - (a.com_sinal_pct ?? -1) || b.respostas - a.respostas);
  let demais = null;
  if (pequenos.length) { const rs = pequenos.flatMap((g) => g.rs); if (new Set(rs.map((r) => r.novato_id)).size >= cfg.min_grupo) demais = mk("Demais (grupos pequenos)", rs, { valor: null }); }
  return { linhas, demais, ocultos: pequenos.length };
}

/** Resultado agregado das respostas do supervisor. `nominal` = equipe do RH (vê grupos pequenos, relatos prioritários e o ranking por supervisor). */
async function resultadoSupervisor(empresaId, f = {}, nominal = false) {
  const cfg = await C.carregarConfig(empresaId);
  const ocultar = !nominal;
  const rows = await carregarRows(empresaId, f);
  const [sitesRows] = await pool.query(`SELECT DISTINCT n.site FROM rh_canguru_aval_sup a JOIN rh_canguru_novatos n ON n.id = a.novato_id WHERE a.empresa_id = ? AND n.site IS NOT NULL ORDER BY n.site`, [empresaId]);
  const [servRows] = await pool.query(`SELECT DISTINCT n.servico FROM rh_canguru_aval_sup a JOIN rh_canguru_novatos n ON n.id = a.novato_id WHERE a.empresa_id = ? AND n.servico IS NOT NULL ORDER BY n.servico`, [empresaId]);
  const filtros = { sites: sitesRows.map((s) => ({ valor: s.site, rotulo: C.rotuloSite(s.site) })), servicos: servRows.map((s) => s.servico) };
  const porNovato = new Map(); for (const r of rows) { if (!porNovato.has(r.novato_id)) porNovato.set(r.novato_id, []); porNovato.get(r.novato_id).push(r); }
  const novatos = [...porNovato.values()];
  const comSinal = (rs) => rs.filter((r) => r.sinais > 0).length;
  const geral = {
    avaliacoes: rows.length, novatos: novatos.length, media: mediaDe(rows.map((r) => r.media)),
    novatos_com_sinal: novatos.filter((rs) => comSinal(rs) >= 1).length, recorrentes: novatos.filter((rs) => comSinal(rs) >= 2).length,
    nas_tres: novatos.filter((rs) => rs.length === 3 && comSinal(rs) === 3).length, nas_tres_avaliacoes: novatos.filter((rs) => new Set(rs.map((r) => r.tipo)).size === 3).length,
    zeradas: novatos.filter((rs) => rs.some((r) => r.zerada)).length, prioritarios: nominal ? novatos.filter((rs) => rs.some((r) => r.prioritario)).length : null,
  };
  geral.novatos_com_sinal_pct = pct(geral.novatos_com_sinal, geral.novatos);
  const dias = C.etapasDe(cfg);
  const porReq = (rs) => Object.fromEntries(REQUISITOS.map((k) => [k, mediaDe(rs.filter((r) => !r.zerada).map((r) => r[`nota_${k}`]))]));
  const etapas = TIPOS.map((t) => { const rs = rows.filter((r) => r.tipo === t); return { tipo: t, dia: dias.find((e) => e.tipo === t).dia, respostas: rs.length, novatos: new Set(rs.map((r) => r.novato_id)).size, media: mediaDe(rs.map((r) => r.media)), com_sinal_pct: pct(comSinal(rs), rs.length), zeradas: rs.filter((r) => r.zerada).length, por_requisito: porReq(rs) }; });
  const requisitos = REQUISITOS.map((k) => {
    const v = rows.filter((r) => !r.zerada && r[`nota_${k}`] !== null && r[`nota_${k}`] !== undefined).map((r) => Number(r[`nota_${k}`]));
    return { chave: k, rotulo: REQ_ROTULO[k], respostas: v.length, media: mediaDe(v), baixa_pct: pct(v.filter((x) => x <= cfg.nota_sinal_max).length, v.length) };
  }).filter((x) => x.respostas > 0);
  const pares = novatos.filter((rs) => rs.length >= 2).map((rs) => [...rs].sort((a, b) => a.tipo - b.tipo)).map((rs) => [rs[0], rs[rs.length - 1]]);
  const dif = pares.filter(([a, b]) => a.media !== null && b.media !== null).map(([a, b]) => b.media - a.media);
  const evolucao = {
    novatos_com_duas_ou_mais: pares.length, saiu_do_sinal: pares.filter(([a, b]) => a.sinais > 0 && b.sinais === 0).length, entrou_no_sinal: pares.filter(([a, b]) => a.sinais === 0 && b.sinais > 0).length,
    manteve_sinal: pares.filter(([a, b]) => a.sinais > 0 && b.sinais > 0).length, sem_sinal: pares.filter(([a, b]) => a.sinais === 0 && b.sinais === 0).length, variacao_media: mediaDe(dif),
  };
  // Motivos citados nas notas baixas (campo “opção” do formulário)
  const cont = new Map(); let comOpcao = 0;
  for (const r of rows) {
    let det = []; try { det = JSON.parse(r.detalhes || "[]"); } catch (_) { det = []; }
    const ops = new Set(det.map((d) => d.o).filter(Boolean));
    if (ops.size) comOpcao += 1;
    for (const o of ops) cont.set(o, (cont.get(o) || 0) + 1);
  }
  let motivos = [...cont.entries()].map(([motivo, n]) => ({ motivo, n, pct: pct(n, comOpcao) })).sort((a, b) => b.n - a.n);
  if (ocultar) motivos = motivos.filter((i) => i.n >= cfg.min_grupo);
  motivos = motivos.slice(0, 10);
  const out = {
    visao: "supervisor", gerado_em: new Date().toISOString(),
    config: { nota_sinal_max: cfg.nota_sinal_max, risco_moderado_min: cfg.risco_moderado_min, risco_alto_min: cfg.risco_alto_min, min_grupo: cfg.min_grupo, dias },
    filtros_aplicados: { site: f.site || null, servico: f.servico || null, de: f.de || null, ate: f.ate || null }, filtros, nominal,
    geral, etapas, requisitos, evolucao, motivos, por_site: agrupar(rows, "site", cfg, ocultar), por_servico: agrupar(rows, "servico", cfg, ocultar),
    por_supervisor: nominal ? agrupar(rows, "supervisor", cfg, false) : null,
  };
  out.leitura = leitura(geral, requisitos, cfg);
  return out;
}

function leitura(g, requisitos, cfg) {
  if (!g.avaliacoes) return "Ainda não há avaliações do supervisor importadas para este recorte.";
  const partes = [`${g.novatos} novatos receberam ${g.avaliacoes} avaliações dos supervisores.`];
  if (g.media !== null) partes.push(`A média geral foi ${fmt(g.media)} (escala de 0 a 5).`);
  const fraco = [...requisitos].filter((r) => r.media !== null).sort((a, b) => a.media - b.media)[0];
  if (fraco) partes.push(`O requisito com a menor média é ${fraco.rotulo.toLowerCase()} (${fmt(fraco.media)}).`);
  partes.push(`${g.novatos_com_sinal} (${fmt(g.novatos_com_sinal_pct)}%) tiveram ao menos um requisito com nota ${cfg.nota_sinal_max} ou menos, ${g.recorrentes} em duas ou mais avaliações.`);
  if (g.zeradas) partes.push(`${g.zeradas} tiveram avaliação com todas as notas zeradas (abandono ou falta).`);
  return partes.join(" ");
}

// ── Comparativo entre períodos ────────────────────────────────────────
const LIMIAR_NOTA = 0.2, LIMIAR_PP = 2;
const delta = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : arred2(b - a));
const tend = (d, limiar, inverso = false) => (d === null ? null : Math.abs(d) < limiar ? "estavel" : (d > 0) !== inverso ? "melhorou" : "piorou");

async function compararSupervisor(empresaId, base, perA, perB) {
  const [A, B] = [await resultadoSupervisor(empresaId, { ...base, ...perA }, false), await resultadoSupervisor(empresaId, { ...base, ...perB }, false)];
  const cfg = await C.carregarConfig(empresaId);
  const g = (x) => ({ novatos: x.geral.novatos, avaliacoes: x.geral.avaliacoes, media: x.geral.media, com_sinal_pct: x.geral.novatos_com_sinal_pct, recorrentes: x.geral.recorrentes });
  const poucos = A.geral.novatos < cfg.min_grupo || B.geral.novatos < cfg.min_grupo;
  const dMedia = poucos ? null : delta(A.geral.media, B.geral.media), dSinal = poucos ? null : delta(A.geral.novatos_com_sinal_pct, B.geral.novatos_com_sinal_pct);
  const etapas = TIPOS.map((t) => {
    const a = A.etapas.find((e) => e.tipo === t), b = B.etapas.find((e) => e.tipo === t);
    const ok = a.novatos >= cfg.min_grupo && b.novatos >= cfg.min_grupo;
    const um = (k, lim, inv) => { const d = ok ? delta(a[k], b[k]) : null; return { a: ok ? a[k] : null, b: ok ? b[k] : null, delta: d, tendencia: tend(d, lim, inv) }; };
    return { tipo: t, dia: a.dia, a_respostas: a.respostas, b_respostas: b.respostas, poucos: !ok, media: um("media", LIMIAR_NOTA, false), com_sinal: um("com_sinal_pct", LIMIAR_PP, true) };
  });
  const requisitos = REQUISITOS.map((k) => {
    const a = A.requisitos.find((x) => x.chave === k), b = B.requisitos.find((x) => x.chave === k);
    if (!a || !b || poucos) return { chave: k, rotulo: REQ_ROTULO[k], a: null, b: null, delta: null, tendencia: null };
    const d = delta(a.media, b.media); return { chave: k, rotulo: REQ_ROTULO[k], a: a.media, b: b.media, delta: d, tendencia: tend(d, LIMIAR_NOTA) };
  }).filter((x) => x.a !== null || x.b !== null);
  const grupos = (campo) => {
    const mb = new Map(B[campo].linhas.map((l) => [l.rotulo, l]));
    return A[campo].linhas.filter((l) => mb.has(l.rotulo) && !l.poucos && !mb.get(l.rotulo).poucos).map((l) => {
      const b = mb.get(l.rotulo); const dm = delta(l.media, b.media), ds = delta(l.com_sinal_pct, b.com_sinal_pct);
      return { rotulo: l.rotulo, a_novatos: l.novatos, b_novatos: b.novatos, a_media: l.media, b_media: b.media, delta_media: dm, tendencia_media: tend(dm, LIMIAR_NOTA), a_sinal_pct: l.com_sinal_pct, b_sinal_pct: b.com_sinal_pct, delta_sinal: ds, tendencia_sinal: tend(ds, LIMIAR_PP, true) };
    }).sort((x, y) => (x.delta_media ?? 999) - (y.delta_media ?? 999));
  };
  const avisos = [`Variações de menos de ${String(LIMIAR_NOTA).replace(".", ",")} ponto na nota média e de menos de ${LIMIAR_PP} pontos percentuais no “% com sinal” são tratadas como estáveis.`, `Períodos, etapas ou grupos com menos de ${cfg.min_grupo} novatos não são comparados.`];
  const resumo = poucos ? "Um dos períodos tem poucos novatos para comparar com segurança."
    : `Nota média dos supervisores: ${fmt(A.geral.media)} no período anterior e ${fmt(B.geral.media)} no atual (${dMedia > 0 ? "+" : ""}${fmt(dMedia)}). Novatos com sinal de atenção: ${fmt(A.geral.novatos_com_sinal_pct)}% e ${fmt(B.geral.novatos_com_sinal_pct)}% (${dSinal > 0 ? "+" : ""}${fmt(dSinal)} p.p.).`;
  return { visao: "supervisor", periodo_a: perA, periodo_b: perB, geral: { a: g(A), b: g(B), delta_media: dMedia, tendencia_media: tend(dMedia, LIMIAR_NOTA), delta_sinal: dSinal, tendencia_sinal: tend(dSinal, LIMIAR_PP, true), poucos }, etapas, requisitos, por_site: grupos("por_site"), por_servico: grupos("por_servico"), resumo, avisos, filtros_aplicados: A.filtros_aplicados };
}

async function opcoesEscopoSupervisor(empresaId) {
  const [st] = await pool.query(`SELECT DISTINCT n.site FROM rh_canguru_aval_sup a JOIN rh_canguru_novatos n ON n.id = a.novato_id WHERE a.empresa_id = ? AND n.site IS NOT NULL ORDER BY n.site`, [empresaId]);
  const [sv] = await pool.query(`SELECT DISTINCT n.servico FROM rh_canguru_aval_sup a JOIN rh_canguru_novatos n ON n.id = a.novato_id WHERE a.empresa_id = ? AND n.servico IS NOT NULL ORDER BY n.servico`, [empresaId]);
  return { sites: st.map((x) => ({ valor: x.site, rotulo: C.rotuloSite(x.site) })), servicos: sv.map((x) => x.servico) };
}

module.exports = { importarSupervisor, resultadoSupervisor, compararSupervisor, opcoesEscopoSupervisor, requisitoDe, REQUISITOS, REQ_ROTULO };
