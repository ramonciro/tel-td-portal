/**
 * conteudoIndicadores.js — Produção de conteúdo, Pacote 2 (23/10/2026)
 *
 * Estatística pura dos indicadores (sem banco), para ser testada à parte.
 *
 * Decisões:
 *  - Mediana e P90 em vez de média: um pedido de 1.041 h na planilha distorcia tudo.
 *    P90 = "método do posto mais próximo" (ceil(0,9·n)); com poucos dados cai no maior valor.
 *  - Esforço do analista = criação (todas as rodadas) + postagem, em horas úteis.
 *    Validação NÃO entra: com o cliente é espera, e com a coordenação não é trabalho do analista.
 *  - "No prazo" olha só o que o analista controla: a 1ª rodada de criação contra o prazo de criação
 *    do tipo e a postagem contra o prazo de postagem. Ajustes (rodadas seguintes) contam como
 *    retrabalho, não como atraso. Etapa com prazo 0 (sem prazo) não é julgada.
 *  - Espera do cliente = soma das validações do pedido, em DIAS CORRIDOS (é como o cliente vive o tempo).
 *  - Etapa com horário inconsistente (fim antes do início) fica de fora da conta daquela métrica.
 *  - Retrabalho e espera do cliente só são medidos nos pedidos feitos no portal: a planilha antiga
 *    não registrava ajustes nem separava quem validou.
 */

const r1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);

function limpar(arr) {
  return arr.filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
}

function mediana(arr) {
  const a = limpar(arr).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentil(arr, p) {
  const a = limpar(arr).sort((x, y) => x - y);
  if (!a.length) return null;
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
}

function soma(arr) {
  return limpar(arr).reduce((s, v) => s + v, 0);
}

function media(arr) {
  const a = limpar(arr);
  return a.length ? soma(a) / a.length : null;
}

/** Série { n, mediana, p90 } arredondada. */
function serie(arr, casas = 1) {
  const a = limpar(arr);
  const arred = casas === 2 ? r2 : r1;
  return { n: a.length, mediana: arred(mediana(a)), p90: arred(percentil(a, 90)) };
}

/**
 * Métricas de um pedido CONCLUÍDO já enriquecido (saída de `enriquecer` do controller).
 * Devolve só números/booleanos, prontos para agregar.
 */
function metricasDoPedido(e) {
  const etapas = e.etapas || [];
  const fechada = (x) => x.fim && x.horas_uteis !== null && !x.inconsistente;

  const cri1 = etapas.find((x) => x.etapa === "criacao" && Number(x.rodada) === 1 && fechada(x));
  const pos = etapas.find((x) => x.etapa === "postagem" && fechada(x));

  const prazoCri = Number(e.prazo_criacao_h || 0);
  const prazoPos = Number(e.prazo_postagem_h || 0);

  const julgamentos = [];
  if (cri1 && prazoCri > 0) julgamentos.push(cri1.horas_uteis <= prazoCri);
  if (pos && prazoPos > 0) julgamentos.push(pos.horas_uteis <= prazoPos);

  const validacoes = etapas.filter((x) => x.etapa === "validacao" && x.fim && x.horas_corridas !== null);
  const esperaDias = validacoes.length ? soma(validacoes.map((x) => x.horas_corridas)) / 24 : null;
  const valInternaH = validacoes.length ? soma(validacoes.filter(() => e.validador_tipo !== "cliente").map((x) => x.horas_uteis)) : null;

  const criTodas = etapas.filter((x) => x.etapa === "criacao" && fechada(x));
  const posTodas = etapas.filter((x) => x.etapa === "postagem" && fechada(x));
  const esforco = criTodas.length || posTodas.length ? soma(criTodas.map((x) => x.horas_uteis)) + soma(posTodas.map((x) => x.horas_uteis)) : null;

  let cicloDias = null;
  if (e.aberto_em && e.concluido_em) {
    const { horasCorridas } = require("./conteudo");
    const h = horasCorridas(e.aberto_em, e.concluido_em);
    cicloDias = h === null ? null : h / 24;
  }

  // Pacote 3: da ação em piso (fim da turma) até o material concluído, em dias corridos.
  let turmaAoMaterial = null;
  if (e.turma_fim && e.concluido_em) {
    const d = (Date.parse(`${String(e.concluido_em).slice(0, 10)}T00:00:00Z`) - Date.parse(`${e.turma_fim}T00:00:00Z`)) / 86400000;
    turmaAoMaterial = d >= 0 ? d : null;
  }

  return {
    turma_ao_material_dias: turmaAoMaterial,
    criacao_h: cri1 ? cri1.horas_uteis : null,
    postagem_h: pos ? pos.horas_uteis : null,
    esforco_h: esforco,
    no_prazo: julgamentos.length ? julgamentos.every(Boolean) : null,
    // O histórico da planilha não registra pedidos de ajuste: tudo viria como "1 rodada" e o
    // retrabalho apareceria como 0%, o que seria falso. Só o que nasceu no portal é medido.
    rodadas: e.origem === "planilha" ? null : Number(e.rodadas || 1),
    retrabalho: e.origem === "planilha" ? null : Number(e.rodadas || 1) > 1,
    // No histórico da planilha todo pedido foi importado como "validação do cliente" e o tempo da
    // coluna de validação não distingue quem validou: não dá para falar em espera do cliente.
    espera_cliente_dias: e.origem !== "planilha" && e.validador_tipo === "cliente" ? esperaDias : null,
    validacao_interna_h: e.origem !== "planilha" && e.validador_tipo !== "cliente" ? valInternaH : null,
    ciclo_dias: cicloDias,
    pontos: e.pontos === null || e.pontos === undefined ? 0 : Number(e.pontos),
  };
}

/** Agrega uma lista de métricas (uma por pedido concluído). */
function resumirGrupo(metricas) {
  const julg = metricas.filter((m) => m.no_prazo !== null);
  const noPrazo = julg.filter((m) => m.no_prazo).length;
  return {
    entregues: metricas.length,
    pontos: r1(soma(metricas.map((m) => m.pontos))),
    criacao_h: serie(metricas.map((m) => m.criacao_h)),
    esforco_h: serie(metricas.map((m) => m.esforco_h)),
    no_prazo: { n: julg.length, ok: noPrazo, pct: julg.length ? Math.round((noPrazo / julg.length) * 100) : null },
    retrabalho: (() => {
      const medidos = metricas.filter((m) => m.retrabalho !== null);
      const com = medidos.filter((m) => m.retrabalho).length;
      return {
        n: medidos.length,
        pedidos: com,
        pct: medidos.length ? Math.round((com / medidos.length) * 100) : null,
        rodadas_media: r2(media(medidos.map((m) => m.rodadas))),
      };
    })(),
    espera_cliente_dias: serie(metricas.map((m) => m.espera_cliente_dias), 2),
    validacao_interna_h: serie(metricas.map((m) => m.validacao_interna_h)),
    ciclo_dias: serie(metricas.map((m) => m.ciclo_dias), 2),
    turma_ao_material_dias: serie(metricas.map((m) => m.turma_ao_material_dias), 1),
  };
}

/** Agrupa itens ({ chave, rotulo, m }) e resume cada grupo, do maior para o menor número de entregas. */
function agruparPor(itens) {
  const mapa = new Map();
  for (const it of itens) {
    const g = mapa.get(it.chave) || { chave: it.chave, rotulo: it.rotulo, extra: it.extra || {}, ms: [] };
    g.ms.push(it.m);
    mapa.set(it.chave, g);
  }
  return [...mapa.values()]
    .map((g) => ({ chave: g.chave, rotulo: g.rotulo, ...g.extra, ...resumirGrupo(g.ms) }))
    .sort((a, b) => b.entregues - a.entregues || String(a.rotulo).localeCompare(String(b.rotulo), "pt-BR"));
}

/** Lista "AAAA-MM" do mês de `de` ao mês de `ate` (datas "AAAA-MM-DD"). Limita a 36 meses. */
function mesesEntre(de, ate) {
  const [a1, m1] = de.slice(0, 7).split("-").map(Number);
  const [a2, m2] = ate.slice(0, 7).split("-").map(Number);
  const out = [];
  let a = a1, m = m1;
  while ((a < a2 || (a === a2 && m <= m2)) && out.length < 36) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

module.exports = { mediana, percentil, media, soma, serie, metricasDoPedido, resumirGrupo, agruparPor, mesesEntre, r1, r2 };
