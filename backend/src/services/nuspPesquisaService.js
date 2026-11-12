/**
 * nuspPesquisaService.js — Pesquisa de riscos psicossociais do Núcleo (NUSPSI, Pacote 3, 11/2026)
 *
 * Método (reproduz a planilha "DADOS FSA — PESQUISA DE RISCOS", aba CONSOLIDADO):
 *  - cada pergunta é classificada, resposta a resposta, como FAVORÁVEL ou DESFAVORÁVEL;
 *  - % de exposição da dimensão = desfavoráveis / (favoráveis + desfavoráveis), somando todas as
 *    respostas das perguntas da dimensão;
 *  - classificação: até 25% baixa, de 26% a 50% moderada, acima de 50% alta;
 *  - a pergunta 19 (fisioterapia / ginástica laboral) não pontua (não está em nenhuma dimensão da planilha);
 *  - "Desconheço" e "Às vezes" contam como desfavorável nas perguntas Sim/Não (é o que a planilha faz).
 *
 * Privacidade:
 *  - respostas pergunta a pergunta e escores por pessoa ficam CIFRADOS (contexto "pesquisa");
 *  - o agregado (nusp_pesquisa_resultados) é o único que a diretoria/analistas leem, com supressão de
 *    células com menos de MINIMO_CELULA respondentes e supressão complementar (não dá para descobrir
 *    uma célula suprimida por subtração);
 *  - o relatório da importação traz só números, nunca nome de pessoa.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const crypto = require("../lib/nuspCrypto");
const B = require("../lib/nuspBase");
const { resolverPessoa, matriculaParaComparar } = require("./pessoasService");

const CONTEXTO_CIFRA = "pesquisa";
const INSTRUMENTO = "FSA-24Q-v1";

// Dimensões na mesma ordem de B.DIMENSOES_PADRAO.
const DIMENSOES = [
  { chave: "jornada", nome: B.DIMENSOES_PADRAO[0] },
  { chave: "demandas", nome: B.DIMENSOES_PADRAO[1] },
  { chave: "autonomia", nome: B.DIMENSOES_PADRAO[2] },
  { chave: "conteudo", nome: B.DIMENSOES_PADRAO[3] },
  { chave: "reconhecimento", nome: B.DIMENSOES_PADRAO[4] },
  { chave: "condicoes", nome: B.DIMENSOES_PADRAO[5] },
  { chave: "saude_mental", nome: B.DIMENSOES_PADRAO[6] },
  { chave: "comunicacao", nome: B.DIMENSOES_PADRAO[7] },
  { chave: "relacionamentos", nome: B.DIMENSOES_PADRAO[8] },
  { chave: "saude_fisica", nome: B.DIMENSOES_PADRAO[9] },
  { chave: "suporte", nome: B.DIMENSOES_PADRAO[10] },
];

// regra: "concordo" (concordar é favorável) | "discordo" (discordar é favorável) |
//        "sim" (só "Sim" é favorável) | "nao" (só "Não" é favorável) | null (não pontua)
const PERGUNTAS = [
  { n: 1, dim: "jornada", regra: "concordo", texto: "Suas pausas para descanso te fazem se sentir confortável?" },
  { n: 2, dim: "jornada", regra: "discordo", texto: "Sente que sua carga horária é exaustiva?" },
  { n: 3, dim: "autonomia", regra: "concordo", texto: "Está de acordo com os horários estabelecidos para que você execute as suas funções?" },
  { n: 4, dim: "conteudo", regra: "discordo", texto: "Suas tarefas são muito repetitivas, por vezes causando tédio?" },
  { n: 5, dim: "jornada", regra: "nao", texto: "Você em algum momento trabalhou em turno oposto ao que foi contratado?" },
  { n: 6, dim: "demandas", regra: "discordo", texto: "Se sente pressionado com metas impossíveis de serem alcançadas?" },
  { n: 7, dim: "reconhecimento", regra: "concordo", texto: "Sua remuneração condiz com os serviços que você oferece à empresa?" },
  { n: 8, dim: "condicoes", regra: "concordo", texto: "Existe uma estrutura adequada para a realização de suas atividades?" },
  { n: 9, dim: "jornada", regra: "concordo", texto: "O tempo de descanso entre o fim da jornada de trabalho e o início da jornada no outro dia é suficiente?" },
  { n: 10, dim: "demandas", regra: "discordo", texto: "Você considera sua rotina de trabalho estressante?" },
  { n: 11, dim: "saude_mental", regra: "concordo", texto: "Considera que mentalmente você se sente bem para realizar suas funções?" },
  { n: 12, dim: "demandas", regra: "discordo", texto: "Se sente pressionado a entregar mais do que o esperado, tanto físico como mental?" },
  { n: 13, dim: "comunicacao", regra: "concordo", texto: "A comunicação no ambiente de trabalho é assertiva?" },
  { n: 14, dim: "demandas", regra: "discordo", texto: "A empresa exige mais do que o esperado de você, sobrecarregando seu emocional?" },
  { n: 15, dim: "conteudo", regra: "concordo", texto: "Você realiza as tarefas que tem domínio, ou sente que faz mais do que deveria?" },
  { n: 16, dim: "demandas", regra: "nao", texto: "Enquanto realiza suas tarefas, já se sentiu pressionado a ponto de sentir reações físicas?" },
  { n: 17, dim: "autonomia", regra: "concordo", texto: "Realiza suas tarefas sem pressão, com autonomia?" },
  { n: 18, dim: "saude_fisica", regra: "nao", texto: "Sente dores físicas após suas atividades?" },
  { n: 19, dim: null, regra: null, texto: "Participa com os profissionais de fisioterapia das ginásticas laborais?" },
  { n: 20, dim: "relacionamentos", regra: "concordo", texto: "Você considera boa suas relações com colegas de trabalho?" },
  { n: 21, dim: "relacionamentos", regra: "concordo", texto: "Você considera boa suas relações com seus líderes?" },
  { n: 22, dim: "suporte", regra: "sim", texto: "Você utiliza na plataforma do Lorni o canal sobre saúde mental?" },
  { n: 23, dim: "suporte", regra: "sim", texto: "Quando ocorrem rodas de conversas sobre saúde mental, você participa?" },
  { n: 24, dim: "suporte", regra: "sim", texto: "Concorda que a empresa tem atuado com projetos que visam o cuidado com a saúde mental?" },
];

// Rascunhos de plano de ação da planilha (aba PLANO DE AÇÃO). Entram "pendente", sem responsável.
// prazo: dias a partir da identificação, ou null quando a planilha traz periodicidade ("Mensal", "Contínuo"...).
const PLANOS_SUGERIDOS = [
  { dim: "saude_fisica", titulo: "Revisar postos e equipamentos de trabalho", prazoTxt: "Conforme cronograma", dias: null },
  { dim: "saude_fisica", titulo: "Reforçar orientações sobre postura e ergonomia", prazoTxt: "Mensal", dias: null },
  { dim: "suporte", titulo: "Campanha de comunicação sobre os recursos de saúde mental disponíveis", prazoTxt: "30 dias", dias: 30 },
  { dim: "suporte", titulo: "Divulgação periódica dos canais de apoio nos grupos corporativos e murais", prazoTxt: "Contínuo", dias: null },
  { dim: "suporte", titulo: "Inserir apresentação dos recursos de saúde mental na entrada de novos colaboradores", prazoTxt: "60 dias", dias: 60 },
  { dim: "suporte", titulo: "Realizar rodas de conversa temáticas com calendário fixo", prazoTxt: "Mensal", dias: null },
  { dim: "suporte", titulo: "Sensibilizar lideranças para encaminhamento de colaboradores aos recursos disponíveis", prazoTxt: "90 dias", dias: 90 },
  { dim: "conteudo", titulo: "Realizar diagnóstico com colaboradores e gestores para identificar atividades repetitivas e excesso de responsabilidades", prazoTxt: "60 dias", dias: 60 },
  { dim: "conteudo", titulo: "Revisar a distribuição das atividades por função", prazoTxt: "90 dias", dias: 90 },
  { dim: "conteudo", titulo: "Revisar descrições de cargo e atribuições", prazoTxt: "120 dias", dias: 120 },
  { dim: "conteudo", titulo: "Monitorar a percepção dos colaboradores sobre organização do trabalho", prazoTxt: "Semestral", dias: null },
  { dim: "reconhecimento", titulo: "Realizar diagnóstico complementar para compreender os fatores relacionados à percepção de reconhecimento e recompensa", prazoTxt: "60 dias", dias: 60 },
  { dim: "reconhecimento", titulo: "Revisar práticas de reconhecimento não financeiro", prazoTxt: "90 dias", dias: 90 },
  { dim: "reconhecimento", titulo: "Desenvolver ações de feedback estruturado entre líderes e equipes", prazoTxt: "Trimestral", dias: null },
  { dim: "reconhecimento", titulo: "Monitorar periodicamente a percepção de reconhecimento dos colaboradores", prazoTxt: "Semestral", dias: null },
  { dim: "demandas", titulo: "Realizar diagnóstico complementar com colaboradores e lideranças", prazoTxt: "60 dias", dias: 60 },
  { dim: "demandas", titulo: "Capacitar lideranças em gestão de equipes e prevenção de riscos psicossociais", prazoTxt: "120 dias", dias: 120 },
  { dim: "demandas", titulo: "Monitorar indicadores relacionados ao estresse ocupacional (absenteísmo, afastamentos e resultados das pesquisas)", prazoTxt: "Semestral", dias: null },
];

// ── Pontuação ─────────────────────────────────────────────────────────────
/** Normaliza o texto da resposta: "Concordo em Partes" -> "concordo em partes", "Às Vezes" -> "as vezes". */
const normResp = (v) => B.chave(v);

/** "fav" | "desf" | null (resposta vazia/desconhecida ou pergunta que não pontua). */
function classificarResposta(regra, resposta) {
  const r = normResp(resposta);
  if (!r || !regra) return null;
  const concorda = r.startsWith("concordo");
  const discorda = r.startsWith("discordo");
  if (regra === "concordo") return concorda ? "fav" : discorda ? "desf" : null;
  if (regra === "discordo") return discorda ? "fav" : concorda ? "desf" : null;
  const conhecida = r === "sim" || r === "nao" || r === "as vezes" || r === "desconheco";
  if (!conhecida) return null;
  if (regra === "sim") return r === "sim" ? "fav" : "desf";
  if (regra === "nao") return r === "nao" ? "fav" : "desf";
  return null;
}

/** respostas: { "1": "Concordo Plenamente", ... } -> { jornada: [fav, desf], ... } */
function escoresDe(respostas) {
  const e = {};
  for (const d of DIMENSOES) e[d.chave] = [0, 0];
  for (const p of PERGUNTAS) {
    if (!p.dim) continue;
    const c = classificarResposta(p.regra, respostas[String(p.n)]);
    if (c === "fav") e[p.dim][0] += 1;
    else if (c === "desf") e[p.dim][1] += 1;
  }
  return e;
}

/** pct em 0–100 (sem arredondar) -> "baixo" | "moderado" | "alto". */
function classificar(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return null;
  return pct <= 25 ? "baixo" : pct <= 50 ? "moderado" : "alto";
}

// ── Agregação com supressão ───────────────────────────────────────────────
/**
 * linhas: [{ unidade_id, servico, e: { chave: [fav, desf] } }]
 * Devolve grupos { recorte, unidade_id, servico, rotulo, n, suprimido, dims: { chave: { pct, classificacao } } }.
 * Supressão: n < minimo. Supressão complementar: numa partição (unidades, serviços, ou os serviços que existem
 * só dentro de uma unidade), as células suprimidas juntas precisam somar ao menos `minimo` respondentes; se não
 * somarem, a menor célula visível também é suprimida, até somarem. Assim, o que foi suprimido não pode ser
 * descoberto por subtração (total − visíveis) — nem o de uma pessoa sozinha.
 */
function agregar(linhas, { minimo = B.MINIMO_CELULA, rotulosUnidade = new Map() } = {}) {
  const novo = (recorte, unidade_id, servico, rotulo) => ({
    recorte, unidade_id, servico, rotulo, n: 0, soma: Object.fromEntries(DIMENSOES.map((d) => [d.chave, [0, 0]])), unidades: new Map(),
  });
  const acumula = (g, l) => {
    g.n += 1;
    for (const d of DIMENSOES) {
      const v = (l.e && l.e[d.chave]) || [0, 0];
      g.soma[d.chave][0] += v[0]; g.soma[d.chave][1] += v[1];
    }
  };
  const nacional = novo("nacional", null, null, "Nacional");
  const porUn = new Map(); const porSv = new Map();
  for (const l of linhas) {
    acumula(nacional, l);
    if (l.unidade_id) {
      if (!porUn.has(l.unidade_id)) porUn.set(l.unidade_id, novo("unidade", l.unidade_id, null, rotulosUnidade.get(l.unidade_id) || `Unidade ${l.unidade_id}`));
      acumula(porUn.get(l.unidade_id), l);
    }
    const sv = String(l.servico || "").trim();
    if (sv) {
      const k = B.chave(sv);
      if (!porSv.has(k)) porSv.set(k, novo("servico", null, sv, sv));
      acumula(porSv.get(k), l);
      const m = porSv.get(k).unidades; m.set(l.unidade_id || 0, (m.get(l.unidade_id || 0) || 0) + 1);
    }
  }
  // As células suprimidas de um conjunto precisam somar >= minimo; senão suprime a menor visível, e repete.
  const garantirUniao = (gs) => {
    for (;;) {
      const sup = gs.filter((g) => g.suprimido);
      if (!sup.length || sup.reduce((a, g) => a + g.n, 0) >= minimo) return;
      const visiveis = gs.filter((g) => !g.suprimido).sort((a, b) => a.n - b.n);
      if (!visiveis.length) return;
      visiveis[0].suprimido = true;
    }
  };
  const particao = (mapa) => {
    const gs = [...mapa.values()];
    gs.forEach((g) => { g.suprimido = g.n < minimo; });
    garantirUniao(gs);
    return gs;
  };
  nacional.suprimido = nacional.n < minimo;
  const gUn = particao(porUn);
  const gSv = particao(porSv);
  // Serviços que só existem numa unidade: unidade − serviços visíveis também não pode revelar os suprimidos.
  for (const u of gUn) {
    if (u.suprimido) continue;
    const unicos = gSv.filter((g) => g.unidades.size === 1 && g.unidades.has(u.unidade_id));
    garantirUniao(unicos);
  }
  garantirUniao(gSv);
  const grupos = [nacional, ...gUn, ...gSv];
  // Se o nacional está suprimido, tudo abaixo dele também.
  if (nacional.suprimido) grupos.forEach((g) => { g.suprimido = true; });
  for (const g of grupos) {
    g.dims = {};
    for (const d of DIMENSOES) {
      const [f, x] = g.soma[d.chave];
      const tot = f + x;
      const pct = !g.suprimido && tot > 0 ? (x / tot) * 100 : null;
      g.dims[d.chave] = { pct, classificacao: classificar(pct) };
    }
    delete g.soma; delete g.unidades;
  }
  return grupos;
}

// ── Leitura/gravação do conteúdo cifrado ──────────────────────────────────
function cifrarDados(dados, empresaId) {
  return crypto.cifrar(JSON.stringify(dados), empresaId, CONTEXTO_CIFRA);
}

/** { dados } ou { erro: "SEM_CHAVE" | "ILEGIVEL" } */
function decifrarDados(valor, empresaId) {
  const r = crypto.decifrar(valor, empresaId, CONTEXTO_CIFRA);
  if (r.erro) return { erro: r.erro };
  try { return { dados: JSON.parse(r.texto) }; } catch (_) { return { erro: "ILEGIVEL" }; }
}

/** Recalcula (e grava) os resultados agregados de uma pesquisa a partir das respostas cifradas. */
async function recalcularResultados(empresaId, pesquisaId, conn = pool) {
  if (!crypto.chaveConfigurada()) { const e = new Error("NUSP_CRYPTO_KEY não configurada"); e.codigo = "SEM_CHAVE"; throw e; }
  const [rows] = await conn.query(
    `SELECT unidade_id, servico, dados_cifrados FROM nusp_pesquisa_respostas WHERE empresa_id = ? AND pesquisa_id = ?`, [empresaId, pesquisaId]);
  const linhas = [];
  for (const r of rows) {
    const d = decifrarDados(r.dados_cifrados, empresaId);
    if (d.erro) { const e = new Error("Resposta ilegível"); e.codigo = d.erro; throw e; }
    linhas.push({ unidade_id: r.unidade_id, servico: r.servico, e: d.dados.e || {} });
  }
  const [uns] = await conn.query(`SELECT id, nome FROM nusp_unidades WHERE empresa_id = ?`, [empresaId]);
  const grupos = agregar(linhas, { rotulosUnidade: new Map(uns.map((u) => [u.id, u.nome])) });
  const [dims] = await conn.query(`SELECT id, nome FROM nusp_dimensoes WHERE empresa_id = ?`, [empresaId]);
  const mapDim = new Map(dims.map((d) => [B.chave(d.nome), d.id]));
  await conn.query(`DELETE FROM nusp_pesquisa_resultados WHERE empresa_id = ? AND pesquisa_id = ?`, [empresaId, pesquisaId]);
  const vals = [];
  for (const g of grupos) {
    for (const d of DIMENSOES) {
      const dimId = mapDim.get(B.chave(d.nome));
      if (!dimId) continue;
      const x = g.dims[d.chave];
      vals.push([empresaId, pesquisaId, dimId, g.recorte, g.unidade_id, g.servico, g.rotulo, g.suprimido ? 0 : g.n,
        x.pct === null ? null : Math.round(x.pct * 10) / 10, x.classificacao, g.suprimido ? 1 : 0]);
    }
  }
  for (let i = 0; i < vals.length; i += 500) {
    await conn.query(
      `INSERT INTO nusp_pesquisa_resultados (empresa_id, pesquisa_id, dimensao_id, recorte, unidade_id, servico, rotulo, n_respondentes, pct_exposicao, classificacao, suprimido) VALUES ?`,
      [vals.slice(i, i + 500)]);
  }
  await conn.query(`UPDATE nusp_pesquisas SET total_respostas = ?, calculado_em = NOW() WHERE id = ? AND empresa_id = ?`, [linhas.length, pesquisaId, empresaId]);
  return { respostas: linhas.length, grupos: grupos.length };
}

// ── Planos de ação sugeridos ──────────────────────────────────────────────
function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Cria os rascunhos (status pendente, sem responsável) que ainda não existem. Idempotente por dimensão + título. */
async function criarPlanosSugeridos(empresaId, usuario, ciclo, conn = pool) {
  const hoje = B.hojeISO();
  const [dims] = await conn.query(`SELECT id, nome FROM nusp_dimensoes WHERE empresa_id = ?`, [empresaId]);
  const mapDim = new Map(dims.map((d) => [B.chave(d.nome), d.id]));
  const [progs] = await conn.query(`SELECT id FROM nusp_programas WHERE empresa_id = ? AND tipo = 'nucleo' ORDER BY id LIMIT 1`, [empresaId]);
  const programaId = progs[0]?.id || null;
  let criados = 0; let jaExistiam = 0;
  for (const p of PLANOS_SUGERIDOS) {
    const dimNome = DIMENSOES.find((d) => d.chave === p.dim).nome;
    const dimId = mapDim.get(B.chave(dimNome)) || null;
    if (!dimId) continue;
    const [ex] = await conn.query(
      `SELECT id FROM nusp_planos_acao WHERE empresa_id = ? AND dimensao_id = ? AND titulo = ? AND origem = 'pesquisa' LIMIT 1`, [empresaId, dimId, p.titulo]);
    if (ex.length) { jaExistiam += 1; continue; }
    const prazo = p.dias ? somarDias(hoje, p.dias) : null;
    const desc = `Rascunho sugerido a partir da pesquisa de riscos psicossociais (${ciclo}). Prazo indicado na planilha: ${p.prazoTxt}. `
      + (p.dias ? "A data de prazo foi estimada a partir dele; ajuste conforme o cronograma." : "A planilha traz periodicidade, não data: defina o prazo ao assumir o plano.");
    const [r] = await conn.query(
      `INSERT INTO nusp_planos_acao (empresa_id, programa_id, dimensao_id, unidade_id, titulo, descricao, responsavel_id, responsavel_nome,
         data_identificacao, prazo, status, pct_conclusao, origem, criado_por_id)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, 'pendente', 0, 'pesquisa', ?)`,
      [empresaId, programaId, dimId, p.titulo, desc, hoje, prazo, usuario?.id || null]);
    await conn.query(
      `INSERT INTO nusp_planos_historico (empresa_id, plano_id, usuario_id, usuario_nome, status, pct_conclusao, texto) VALUES (?, ?, ?, ?, 'pendente', 0, ?)`,
      [empresaId, r.insertId, usuario?.id || null, usuario?.nome || null, "Rascunho criado a partir da pesquisa de riscos psicossociais"]);
    criados += 1;
  }
  return { criados, ja_existiam: jaExistiam };
}

// ── Leitura da planilha ───────────────────────────────────────────────────
function dataPlanilha(v) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const iso = B.dataISO(t);
  if (iso) return iso;
  const m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})(?:[T ,].*)?$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return B.dataISO(`${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`) || null;
}

function lerBase(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const preferida = wb.SheetNames.find((n) => B.chave(n) === "base de dados");
  const candidatas = preferida ? [preferida, ...wb.SheetNames.filter((n) => n !== preferida)] : wb.SheetNames;
  for (const nome of candidatas) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    const idx = linhas.findIndex((l) => l.filter((x) => String(x).trim() !== "").length >= 8);
    if (idx < 0) continue;
    const cab = linhas[idx].map((x) => B.chave(x));
    if (!cab.includes("matricula")) continue;
    return { cab, linhas: linhas.slice(idx + 1).map((l, i) => ({ n: idx + 2 + i, l })), nomeAba: nome };
  }
  return null;
}

const cabecalhoIdx = (cab, ...nomes) => cab.findIndex((c) => nomes.includes(c));
const txt = (v, max) => { const t = String(v ?? "").trim().replace(/\s+/g, " "); return t ? t.slice(0, max) : null; };

/**
 * Importa a base de respostas. simular=true não grava nada (devolve o mesmo relatório + o resultado nacional
 * calculado, para conferir com a planilha). Re-importar o mesmo ciclo SUBSTITUI as respostas dele.
 */
async function importarPesquisa({ empresaId, usuario, buffer, simular, ciclo, nome, dataReferencia, criarPlanos = true }) {
  const XLSX = require("xlsx");
  await B.garantirBase(empresaId);
  const cicloTxt = txt(ciclo, 40);
  if (!cicloTxt) { const e = new Error("Informe o ciclo da pesquisa (ex.: 2026-1)."); e.status = 400; throw e; }
  if (!simular && !crypto.chaveConfigurada()) {
    const e = new Error("A chave de cifra (NUSP_CRYPTO_KEY) não está configurada neste ambiente: a pesquisa não pode ser gravada."); e.status = 503; throw e;
  }
  const base = lerBase(XLSX, buffer);
  if (!base) { const e = new Error("Não encontrei a aba de respostas (precisa ter a coluna Matrícula). Use a aba 'BASE DE DADOS' da planilha da pesquisa."); e.status = 400; throw e; }

  const cab = base.cab;
  const iMat = cabecalhoIdx(cab, "matricula");
  const iNome = cabecalhoIdx(cab, "nome");
  const iData = cabecalhoIdx(cab, "data e hora", "data");
  const iSite = cabecalhoIdx(cab, "site", "unidade");
  const iFunc = cabecalhoIdx(cab, "funcao");
  const iServ = cabecalhoIdx(cab, "servico");
  const iSup = cabecalhoIdx(cab, "supervisor");
  const iCoord = cabecalhoIdx(cab, "coordenador");
  const iTipo = cabecalhoIdx(cab, "tipo de pesquisa");
  const colPergunta = new Map();
  const faltando = [];
  for (const p of PERGUNTAS) {
    const i = cab.findIndex((c) => c === B.chave(p.texto));
    if (i >= 0) colPergunta.set(p.n, i); else faltando.push(p.n);
  }
  const pontuaveisFaltando = faltando.filter((n) => PERGUNTAS.find((p) => p.n === n).dim);
  if (pontuaveisFaltando.length) {
    const e = new Error(`A planilha não traz ${pontuaveisFaltando.length} pergunta(s) do instrumento (nº ${pontuaveisFaltando.join(", ")}). Confira o cabeçalho da aba.`);
    e.status = 400; throw e;
  }

  const rel = {
    simulacao: !!simular,
    pesquisa: { ciclo: cicloTxt, nome: txt(nome, 150) || `Pesquisa de riscos psicossociais ${cicloTxt}`, instrumento: INSTRUMENTO, ja_existia: false, respostas_anteriores_substituidas: 0 },
    linhas: { lidas: 0, importadas: 0, vazias: 0, sem_matricula: 0, duplicadas_no_arquivo: 0, sem_nenhuma_resposta: 0, resposta_nao_reconhecida: 0, linhas_com_problema: [] },
    pessoas: { ja_cadastradas: 0, novas: 0, ambiguas: 0 },
    unidades_novas: [],
    sites: [],
    servicos: { total: 0, abaixo_do_minimo: 0 },
    minimo_celula: B.MINIMO_CELULA,
    nacional: [],
    planos: { solicitado: !!criarPlanos, criados: 0, ja_existiam: 0 },
    avisos: [],
  };
  if (faltando.length) rel.avisos.push(`Pergunta(s) ${faltando.join(", ")} sem coluna na planilha (não pontuam).`);
  const aviso = (t) => { if (!rel.avisos.includes(t)) rel.avisos.push(t); };
  const problema = (n) => { if (rel.linhas.linhas_com_problema.length < 100) rel.linhas.linhas_com_problema.push(n); };

  // 1) Lê e valida as linhas; duplicadas (mesma matrícula) ficam com a mais recente.
  const porMat = new Map();
  for (const linha of base.linhas) {
    const get = (i) => (i >= 0 ? linha.l[i] : "");
    if (linha.l.every((x) => String(x).trim() === "")) { rel.linhas.vazias += 1; continue; }
    rel.linhas.lidas += 1;
    const matricula = txt(get(iMat), 100);
    if (!matricula) { rel.linhas.sem_matricula += 1; problema(linha.n); continue; }
    const respostas = {};
    let algumaResposta = false; let naoReconhecida = false;
    for (const p of PERGUNTAS) {
      const bruto = txt(get(colPergunta.get(p.n) ?? -1), 40);
      if (!bruto) continue;
      respostas[String(p.n)] = bruto;
      algumaResposta = true;
      if (p.regra && classificarResposta(p.regra, bruto) === null) naoReconhecida = true;
    }
    if (!algumaResposta) { rel.linhas.sem_nenhuma_resposta += 1; problema(linha.n); continue; }
    if (naoReconhecida) { rel.linhas.resposta_nao_reconhecida += 1; problema(linha.n); }
    const item = {
      n: linha.n, matricula, norm: matriculaParaComparar(matricula), nome: txt(get(iNome), 255), respostas,
      data: dataPlanilha(get(iData)), site: txt(get(iSite), 120), funcao: txt(get(iFunc), 150), servico: txt(get(iServ), 150),
      supervisor: txt(get(iSup), 150), coordenador: txt(get(iCoord), 150), tipo: txt(get(iTipo), 60),
    };
    const ant = porMat.get(item.norm);
    if (ant) {
      rel.linhas.duplicadas_no_arquivo += 1; problema(linha.n);
      if ((item.data || "") >= (ant.data || "")) porMat.set(item.norm, item);
    } else porMat.set(item.norm, item);
  }
  const itens = [...porMat.values()];
  rel.linhas.importadas = itens.length;
  if (!itens.length) { const e = new Error("Nenhuma resposta válida encontrada na planilha."); e.status = 400; throw e; }
  if (rel.linhas.duplicadas_no_arquivo) aviso("Há matrículas repetidas na planilha: vale a resposta mais recente de cada pessoa.");
  if (rel.linhas.resposta_nao_reconhecida) aviso("Algumas respostas não seguem as opções do instrumento e não foram contadas na pontuação.");

  // 2) Unidades (Site) — as que não existem são criadas ao gravar; o relatório as lista.
  const [unidades] = await pool.query(`SELECT id, nome FROM nusp_unidades WHERE empresa_id = ?`, [empresaId]);
  const mapUn = new Map(unidades.map((u) => [B.chave(u.nome), u.id]));
  const novasUn = new Map();
  const contaSite = new Map();
  for (const it of itens) {
    const nomeUn = String(it.site || "").trim().toUpperCase();
    const k = nomeUn ? B.chave(nomeUn) : "";
    contaSite.set(nomeUn || "(sem site)", (contaSite.get(nomeUn || "(sem site)") || 0) + 1);
    if (!nomeUn) { it.unidadeRef = null; continue; }
    if (mapUn.has(k)) it.unidadeRef = mapUn.get(k);
    else { it.unidadeRef = `novo:${nomeUn}`; novasUn.set(nomeUn, true); }
  }
  rel.unidades_novas = [...novasUn.keys()];
  rel.sites = [...contaSite.entries()].map(([site, n]) => ({ site, respondentes: n })).sort((a, b) => b.respondentes - a.respondentes);
  if (rel.unidades_novas.length) aviso("Alguns sites ainda não existem em Cadastros > Unidades e serão criados. Se for o mesmo local com outro nome, renomeie a unidade em Cadastros depois — os dados acompanham.");
  if (itens.some((i) => !i.site)) aviso("Há respostas sem Site: entram só no resultado nacional e por serviço.");

  // 3) Pessoas: por matrícula. Quem já está no cadastro entra direto; os demais passam pela regra de identidade.
  const [pessoas] = await pool.query(`SELECT id, matricula FROM pessoas WHERE empresa_id = ? AND matricula IS NOT NULL AND matricula <> ''`, [empresaId]);
  const porMatricula = new Map();
  for (const p of pessoas) {
    const k = matriculaParaComparar(p.matricula);
    if (!porMatricula.has(k)) porMatricula.set(k, []);
    porMatricula.get(k).push(p.id);
  }
  for (const it of itens) {
    const achadas = porMatricula.get(it.norm) || [];
    if (achadas.length === 1) { it.pessoaId = achadas[0]; rel.pessoas.ja_cadastradas += 1; }
    else if (achadas.length === 0) rel.pessoas.novas += 1;
    else rel.pessoas.ambiguas += 1;
  }

  // 4) Escores + agregado em memória (serve à simulação e confere com a planilha)
  for (const it of itens) it.e = escoresDe(it.respostas);
  const [dimsCad] = await pool.query(`SELECT id, nome FROM nusp_dimensoes WHERE empresa_id = ?`, [empresaId]);
  const mapDim = new Map(dimsCad.map((d) => [B.chave(d.nome), d.id]));
  const rotulos = new Map(unidades.map((u) => [u.id, u.nome]));
  const linhasAgg = itens.map((i) => ({ unidade_id: typeof i.unidadeRef === "number" ? i.unidadeRef : null, servico: i.servico, e: i.e }));
  const prePrev = agregar(linhasAgg, { rotulosUnidade: rotulos });
  const nac = prePrev.find((g) => g.recorte === "nacional");
  rel.nacional = DIMENSOES.map((d) => ({
    dimensao: d.nome, pct: nac.dims[d.chave].pct === null ? null : Math.round(nac.dims[d.chave].pct * 10) / 10, classificacao: nac.dims[d.chave].classificacao,
  }));
  const servicosGrupos = prePrev.filter((g) => g.recorte === "servico");
  rel.servicos.total = servicosGrupos.length;
  rel.servicos.abaixo_do_minimo = servicosGrupos.filter((g) => g.n < B.MINIMO_CELULA).length;
  const [exRows] = await pool.query(`SELECT id FROM nusp_pesquisas WHERE empresa_id = ? AND ciclo = ? LIMIT 1`, [empresaId, cicloTxt]);
  const ex = exRows[0] || {};
  if (ex.id) {
    rel.pesquisa.ja_existia = true;
    const [[c]] = await pool.query(`SELECT COUNT(*) n FROM nusp_pesquisa_respostas WHERE empresa_id = ? AND pesquisa_id = ?`, [empresaId, ex.id]);
    rel.pesquisa.respostas_anteriores_substituidas = Number(c.n);
    aviso("Já existe uma pesquisa com este ciclo: as respostas dela serão SUBSTITUÍDAS pelas desta planilha.");
  }
  if (simular) return rel;

  // 5) Gravação
  const dataRef = B.dataISO(dataReferencia) || itens.map((i) => i.data).filter(Boolean).sort().pop() || B.hojeISO();
  let pesquisaId = ex.id || null;
  await comTransacao(async (conn) => {
    const mapNovo = new Map();
    for (const nomeUn of rel.unidades_novas) {
      const [r] = await conn.query(`INSERT INTO nusp_unidades (empresa_id, nome) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [empresaId, nomeUn]);
      mapNovo.set(`novo:${nomeUn}`, r.insertId);
    }
    if (pesquisaId) {
      await conn.query(`UPDATE nusp_pesquisas SET nome = ?, data_referencia = ?, instrumento = ? WHERE id = ? AND empresa_id = ?`, [rel.pesquisa.nome, dataRef, INSTRUMENTO, pesquisaId, empresaId]);
      await conn.query(`DELETE FROM nusp_pesquisa_respostas WHERE empresa_id = ? AND pesquisa_id = ?`, [empresaId, pesquisaId]);
    } else {
      const [r] = await conn.query(
        `INSERT INTO nusp_pesquisas (empresa_id, nome, ciclo, data_referencia, instrumento, status, criado_por_id) VALUES (?, ?, ?, ?, ?, 'ativa', ?)`,
        [empresaId, rel.pesquisa.nome, cicloTxt, dataRef, INSTRUMENTO, usuario?.id || null]);
      pesquisaId = r.insertId;
    }
    for (const it of itens) if (typeof it.unidadeRef === "string") it.unidadeRef = mapNovo.get(it.unidadeRef) || null;
  });

  // Pessoas novas (cada uma na sua transação, como no importador de escutas: erro numa não derruba as demais).
  for (const it of itens) {
    if (it.pessoaId) continue;
    try {
      await comTransacao(async (conn) => {
        const r = await resolverPessoa({ empresaId, nome: it.nome || `Matrícula ${it.matricula}`, matricula: it.matricula, cliente: null }, conn);
        it.pessoaId = r.pessoa ? r.pessoa.id : null;
      });
    } catch (e) {
      console.error("[nusp.pesquisa.pessoa]", e.message);
      it.pessoaId = null;
    }
  }
  const semPessoa = itens.filter((i) => !i.pessoaId);
  if (semPessoa.length) {
    rel.linhas.importadas -= semPessoa.length;
    semPessoa.forEach((i) => problema(i.n));
    aviso(`${semPessoa.length} resposta(s) não puderam ser vinculadas a uma pessoa e ficaram de fora.`);
  }
  const gravar = itens.filter((i) => i.pessoaId);
  for (let i = 0; i < gravar.length; i += 200) {
    const lote = gravar.slice(i, i + 200);
    const vals = lote.map((it) => [
      empresaId, pesquisaId, it.pessoaId, typeof it.unidadeRef === "number" ? it.unidadeRef : null, it.site, it.servico, it.funcao, it.supervisor, it.coordenador, it.tipo,
      it.data ? `${it.data} 00:00:00` : null, cifrarDados({ v: 1, r: it.respostas, e: it.e }, empresaId), 1,
    ]);
    await pool.query(
      `INSERT INTO nusp_pesquisa_respostas (empresa_id, pesquisa_id, pessoa_id, unidade_id, site, servico, funcao, supervisor, coordenador, tipo_pesquisa, respondida_em, dados_cifrados, dados_ver)
       VALUES ? ON DUPLICATE KEY UPDATE unidade_id = VALUES(unidade_id), site = VALUES(site), servico = VALUES(servico), funcao = VALUES(funcao),
         supervisor = VALUES(supervisor), coordenador = VALUES(coordenador), tipo_pesquisa = VALUES(tipo_pesquisa), respondida_em = VALUES(respondida_em),
         dados_cifrados = VALUES(dados_cifrados), dados_ver = VALUES(dados_ver)`, [vals]);
  }
  await recalcularResultados(empresaId, pesquisaId);
  rel.pesquisa.id = pesquisaId;
  if (criarPlanos && mapDim.size) {
    const p = await criarPlanosSugeridos(empresaId, usuario, cicloTxt);
    rel.planos.criados = p.criados; rel.planos.ja_existiam = p.ja_existiam;
  }
  return rel;
}

module.exports = {
  DIMENSOES, PERGUNTAS, PLANOS_SUGERIDOS, INSTRUMENTO, CONTEXTO_CIFRA,
  classificarResposta, escoresDe, classificar, agregar,
  cifrarDados, decifrarDados, recalcularResultados, criarPlanosSugeridos, importarPesquisa,
};
