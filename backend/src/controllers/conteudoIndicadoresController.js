/**
 * conteudoIndicadoresController.js — Produção de conteúdo, Pacote 2 (23/10/2026)
 *
 * Indicadores (mediana, P90, % no prazo, retrabalho, espera do cliente, pontos),
 * exportação em Excel e o resumo mensal por cliente usado no Fechamento mensal.
 * A estatística fica em lib/conteudoIndicadores.js; aqui só há consulta e montagem.
 *
 * Quem vê o quê: coordenação e superintendente veem a equipe toda e cada analista;
 * o analista vê os totais da equipe e a PRÓPRIA linha (não a dos colegas).
 * Exportar em Excel é só da coordenação, supervisão, assistente e superintendente.
 */
const pool = require("../lib/db");
const C = require("../lib/conteudo");
const S = require("../lib/conteudoIndicadores");
const { registrarAuditoria } = require("../services/auditoria");
const { novoWorkbook, adicionarTabela, escreverTabela } = require("../lib/excelExport");

const ctrl = () => require("./conteudoController").interno; // carregado sob demanda (evita ciclo)
const chave = (s) => String(s || "").trim().toLowerCase();
const ehAnalista = (req) => chave(req.user?.perfil) === "analista_conteudo";
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Lê e valida os filtros. Devolve { filtros } ou { erro }. */
function lerFiltros(req) {
  const q = req.query || {};
  const ate = dataValida(q.ate) ? String(q.ate) : C.hojeBahia();
  const de = dataValida(q.de) ? String(q.de) : C.somarDias(ate, -89);
  if (de > ate) return { erro: "A data inicial não pode ser depois da final." };
  if (C.somarDias(de, 1100) < ate) return { erro: "Escolha um período de até 3 anos." };
  const filtros = { de, ate };
  if (q.analista_id) filtros.analista_id = Number(q.analista_id) || null;
  if (q.tipo_id) filtros.tipo_id = Number(q.tipo_id) || null;
  if (q.cliente) filtros.cliente = String(q.cliente).trim();
  if (ehAnalista(req)) {
    // O analista enxerga a equipe somada; ver outro analista isolado exporia a linha dele.
    if (filtros.analista_id && filtros.analista_id !== Number(req.user?.id)) {
      return { erro: "Você pode filtrar apenas pelos seus próprios pedidos." };
    }
  }
  return { filtros };
}

function condicoes(empresaId, filtros, alias = "p.") {
  const f = ctrl().filtroEmpresa(empresaId, alias);
  const cond = [`1=1${f.sql}`];
  const params = [...f.params];
  if (filtros.analista_id) cond.push(`${alias}analista_id = ?`), params.push(filtros.analista_id);
  if (filtros.tipo_id) cond.push(`${alias}tipo_id = ?`), params.push(filtros.tipo_id);
  if (filtros.cliente) cond.push(`LOWER(${alias}cliente) = LOWER(?)`), params.push(filtros.cliente);
  return { sql: cond.join(" AND "), params };
}

const ROTULO_SEM = "Sem analista";

/** Calcula tudo. `linhas` traz os pedidos concluídos do período (para o Excel). */
async function montar(req, filtros) {
  const I = ctrl();
  const empresaId = I.escopo(req);
  await I.vincularLegado(req);
  const exp = await C.carregarExpediente(empresaId);
  const agora = C.agoraBahia();
  const w = condicoes(empresaId, filtros);

  /* concluídos no período (conta ou não nos indicadores) */
  const [rows] = await pool.query(
    `${I.SELECT_PEDIDO}
      WHERE ${w.sql} AND p.status = 'concluido' AND p.concluido_em >= ? AND p.concluido_em <= ?
      ORDER BY p.concluido_em DESC, p.id DESC LIMIT 5000`,
    [...w.params, `${filtros.de} 00:00:00`, `${filtros.ate} 23:59:59`]
  );
  const mapa = await I.etapasDe(rows.map((r) => r.id));
  const todos = rows.map((r) => I.enriquecer(r, mapa.get(r.id) || [], exp, agora));
  const contam = todos.filter((e) => e.conta_indicadores);
  const itens = contam.map((e) => ({ e, m: S.metricasDoPedido(e) }));

  const analistaChave = (e) => (e.analista_id ? `id:${e.analista_id}` : `n:${chave(e.analista_nome) || "sem"}`);
  const minhaChave = (e) => (e.analista_id ? Number(e.analista_id) === Number(req.user?.id) : C.primeiroNome(e.analista_nome) === C.primeiroNome(req.user?.nome));

  let porAnalista = S.agruparPor(itens.map(({ e, m }) => ({
    chave: analistaChave(e), rotulo: e.analista_nome || ROTULO_SEM, extra: { analista_id: e.analista_id || null, minha: ehAnalista(req) ? minhaChave(e) : undefined }, m,
  })));
  if (ehAnalista(req)) porAnalista = porAnalista.filter((a) => a.minha);

  const porTipo = S.agruparPor(itens.map(({ e, m }) => ({ chave: String(e.tipo_id || e.tipo), rotulo: e.tipo || "Sem tipo", extra: { tipo_id: e.tipo_id || null }, m })));
  const porCliente = S.agruparPor(itens.map(({ e, m }) => ({ chave: chave(e.cliente), rotulo: e.cliente || "Sem cliente", m })));

  /* por mês: entregas (concluídos) e entradas (pedidos abertos no mês) */
  const meses = S.mesesEntre(filtros.de, filtros.ate);
  const entregasMes = new Map();
  for (const { e, m } of itens) {
    const k = String(e.concluido_em).slice(0, 7);
    if (!entregasMes.has(k)) entregasMes.set(k, []);
    entregasMes.get(k).push(m);
  }
  const [ent] = await pool.query(
    `SELECT DATE_FORMAT(p.aberto_em, '%Y-%m') AS mes, COUNT(*) AS n FROM conteudo_pedidos p
      WHERE ${w.sql} AND p.status <> 'cancelado' AND COALESCE(p.revisao,'') NOT IN ('pendente','ignorado')
        AND p.aberto_em >= ? AND p.aberto_em <= ?
      GROUP BY mes`,
    [...w.params, `${filtros.de} 00:00:00`, `${filtros.ate} 23:59:59`]
  );
  const entradas = new Map(ent.map((r) => [r.mes, Number(r.n)]));
  let porMes = meses.map((mes) => ({ mes, entradas: entradas.get(mes) || 0, ...S.resumirGrupo(entregasMes.get(mes) || []) }));
  // "Tudo" não deve mostrar anos de meses vazios: corta as pontas sem nenhum pedido.
  const comDado = porMes.map((m, i) => (m.entradas || m.entregues ? i : -1)).filter((i) => i >= 0);
  if (comDado.length) porMes = porMes.slice(comDado[0], comDado[comDado.length - 1] + 1);

  /* situação de agora, nos mesmos filtros (sem período) */
  const [abertos] = await pool.query(
    `${I.SELECT_PEDIDO} WHERE ${w.sql} AND p.status IN (${C.STATUS_ABERTOS.map(() => "?").join(",")})`,
    [...w.params, ...C.STATUS_ABERTOS]
  );
  const mapaAb = await I.etapasDe(abertos.map((r) => r.id));
  let atrasados = 0, semRetorno = 0;
  for (const r of abertos) {
    const e = I.enriquecer(r, mapaAb.get(r.id) || [], exp, agora);
    if (e.atrasado) atrasados += 1;
    if (e.espera_cliente && e.etapa_atual?.dias_corridos >= 2) semRetorno += 1;
  }

  const foraDosIndicadores = todos.length - contam.length;
  const dados = {
    periodo: { de: filtros.de, ate: filtros.ate },
    filtros,
    geral: S.resumirGrupo(itens.map((i) => i.m)),
    agora: { abertos: abertos.length, atrasados, sem_retorno_cliente: semRetorno },
    fora_dos_indicadores: foraDosIndicadores,
    poucos_dados: itens.length < 5,
    por_analista: porAnalista,
    por_tipo: porTipo,
    por_cliente: porCliente,
    por_mes: porMes,
    visao: ehAnalista(req) ? "analista" : "gestao",
  };
  return { dados, todos, itens };
}

/** GET /api/conteudo/indicadores */
async function indicadores(req, res) {
  try {
    const l = lerFiltros(req);
    if (l.erro) return erro(res, 400, l.erro);
    const { dados } = await montar(req, l.filtros);
    return res.json(dados);
  } catch (e) {
    console.error("[conteudo] indicadores", e.message || e);
    return erro(res, 500, "Erro ao calcular os indicadores");
  }
}

/** GET /api/conteudo/exportar — Excel com resumo, quebras e a lista dos pedidos do período. */
async function exportar(req, res) {
  try {
    const l = lerFiltros(req);
    if (l.erro) return erro(res, 400, l.erro);
    const { dados, todos } = await montar(req, l.filtros);
    const wb = novoWorkbook();
    const g = dados.geral;
    const fmt = (iso) => iso.split("-").reverse().join("/");

    const ws = wb.addWorksheet("Resumo");
    ws.columns = [{ width: 50 }, { width: 16 }, { width: 16 }, { width: 16 }];
    const lin = (nome, valor, formato) => ({ nome, valor, formato });
    const linhas = [
      ["Pedidos entregues no período", g.entregues, "inteiro"],
      ["Pontos entregues", g.pontos, "decimal1"],
      ["Criação — mediana (h úteis, 1ª rodada)", g.criacao_h.mediana, "decimal1"],
      ["Criação — P90 (h úteis, 1ª rodada)", g.criacao_h.p90, "decimal1"],
      ["Esforço do analista — mediana (h úteis)", g.esforco_h.mediana, "decimal1"],
      ["Entregues no prazo (%)", g.no_prazo.pct, "inteiro"],
      ["Pedidos com retrabalho (%)", g.retrabalho.pct, "inteiro"],
      ["Rodadas por pedido (média)", g.retrabalho.rodadas_media, "decimal1"],
      ["Espera do cliente — mediana (dias)", g.espera_cliente_dias.mediana, "decimal1"],
      ["Espera do cliente — P90 (dias)", g.espera_cliente_dias.p90, "decimal1"],
      ["Validação da coordenação — mediana (h úteis)", g.validacao_interna_h.mediana, "decimal1"],
      ["Do pedido à entrega — mediana (dias)", g.ciclo_dias.mediana, "decimal1"],
      ["Em aberto agora", dados.agora.abertos, "inteiro"],
      ["Atrasados agora", dados.agora.atrasados, "inteiro"],
      ["Fora dos indicadores (histórico em revisão)", dados.fora_dos_indicadores, "inteiro"],
    ].map(([n, v, f]) => lin(n, v, f));
    escreverTabela(ws, {
      startRow: 1,
      titulo: `Produção de conteúdo — ${fmt(dados.periodo.de)} a ${fmt(dados.periodo.ate)}`,
      colunas: [{ titulo: "Indicador", chave: "nome" }, { titulo: "Valor", chave: "valor" }],
      linhas,
    });
    // formatos numéricos por linha (a tabela genérica usa um formato por coluna)
    linhas.forEach((x, i) => {
      const cell = ws.getCell(i + 3, 2);
      if (x.valor === null || x.valor === undefined) cell.value = "—";
      else cell.numFmt = x.formato === "decimal1" ? "0.0" : "#,##0";
    });

    const colunasGrupo = (rotulo) => [
      { titulo: rotulo, chave: "rotulo", largura: 34 },
      { titulo: "Entregues", chave: "entregues", formato: "inteiro" },
      { titulo: "Pontos", chave: "pontos", formato: "decimal1" },
      { titulo: "Criação mediana (h)", chave: "cri_med", formato: "decimal1" },
      { titulo: "Criação P90 (h)", chave: "cri_p90", formato: "decimal1" },
      { titulo: "No prazo (%)", chave: "no_prazo", formato: "inteiro" },
      { titulo: "Retrabalho (%)", chave: "retrabalho", formato: "inteiro" },
      { titulo: "Espera do cliente mediana (dias)", chave: "esp_med", formato: "decimal1", largura: 22 },
      { titulo: "Do pedido à entrega mediana (dias)", chave: "ciclo_med", formato: "decimal1", largura: 22 },
    ];
    const achatar = (x) => ({
      rotulo: x.rotulo || x.mes, entradas: x.entradas, entregues: x.entregues, pontos: x.pontos,
      cri_med: x.criacao_h.mediana, cri_p90: x.criacao_h.p90, no_prazo: x.no_prazo.pct, retrabalho: x.retrabalho.pct,
      esp_med: x.espera_cliente_dias.mediana, ciclo_med: x.ciclo_dias.mediana,
    });
    adicionarTabela(wb, { nomeAba: "Por analista", colunas: colunasGrupo("Analista"), linhas: dados.por_analista.map(achatar) });
    adicionarTabela(wb, { nomeAba: "Por tipo", colunas: colunasGrupo("Tipo de material"), linhas: dados.por_tipo.map(achatar) });
    adicionarTabela(wb, { nomeAba: "Por cliente", colunas: colunasGrupo("Cliente"), linhas: dados.por_cliente.map(achatar) });
    const colMes = colunasGrupo("Mês");
    colMes.splice(1, 0, { titulo: "Pedidos abertos no mês", chave: "entradas", formato: "inteiro", largura: 18 });
    adicionarTabela(wb, { nomeAba: "Por mês", colunas: colMes, linhas: dados.por_mes.map((x) => achatar({ ...x, rotulo: x.mes.split("-").reverse().join("/") })) });

    adicionarTabela(wb, {
      nomeAba: "Pedidos",
      colunas: [
        { titulo: "Cód. planilha", chave: "codigo_legado" },
        { titulo: "Cliente", chave: "cliente", largura: 22 },
        { titulo: "Tipo", chave: "tipo", largura: 26 },
        { titulo: "Título", chave: "titulo", largura: 44 },
        { titulo: "Analista", chave: "analista_nome", largura: 22 },
        { titulo: "Aberto em", chave: "aberto_em", formato: "data" },
        { titulo: "Concluído em", chave: "concluido_em", formato: "data" },
        { titulo: "Validador", chave: "validador", largura: 14 },
        { titulo: "Rodadas", chave: "rodadas", formato: "inteiro" },
        { titulo: "Criação 1ª rodada (h úteis)", chave: "criacao_h", formato: "decimal1", largura: 18 },
        { titulo: "Prazo de criação (h)", chave: "prazo_criacao_h", formato: "decimal1" },
        { titulo: "Postagem (h úteis)", chave: "postagem_h", formato: "decimal1" },
        { titulo: "Espera do cliente (dias)", chave: "espera", formato: "decimal1" },
        { titulo: "No prazo", chave: "no_prazo", largura: 10 },
        { titulo: "Pontos", chave: "pontos", formato: "decimal1" },
        { titulo: "Origem", chave: "origem", largura: 10 },
        { titulo: "Conta nos indicadores", chave: "conta", largura: 14 },
      ],
      linhas: todos.map((e) => {
        const m = S.metricasDoPedido(e);
        return {
          codigo_legado: e.codigo_legado, cliente: e.cliente, tipo: e.tipo, titulo: e.titulo, analista_nome: e.analista_nome,
          aberto_em: e.aberto_em, concluido_em: e.concluido_em, validador: e.validador_tipo === "cliente" ? "Cliente" : "Coordenação",
          rodadas: e.rodadas, criacao_h: m.criacao_h, prazo_criacao_h: e.prazo_criacao_h, postagem_h: m.postagem_h,
          espera: m.espera_cliente_dias, no_prazo: m.no_prazo === null ? "—" : m.no_prazo ? "Sim" : "Não",
          pontos: e.pontos, origem: e.origem === "planilha" ? "Planilha" : "Portal", conta: e.conta_indicadores ? "Sim" : "Não",
        };
      }),
    });

    const buf = await wb.xlsx.writeBuffer();
    registrarAuditoria({
      usuario: req.user, acao: "exportar", entidade: "conteudo_indicadores", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} exportou os indicadores de conteúdo (${dados.periodo.de} a ${dados.periodo.ate})`, ip: req.ip,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="producao-conteudo-${dados.periodo.de}-a-${dados.periodo.ate}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[conteudo] exportar", e.message || e);
    return erro(res, 500, "Erro ao exportar os indicadores");
  }
}

/**
 * Resumo de um cliente num mês (AAAA-MM), para o Fechamento mensal.
 * Conta os pedidos CONCLUÍDOS no mês. Devolve null se não houver nenhum.
 */
async function resumoMesCliente(empresaId, cliente, mes) {
  const I = ctrl();
  const f = I.filtroEmpresa(empresaId, "p.");
  const [ano, mm] = mes.split("-").map(Number);
  const ultimo = new Date(ano, mm, 0).getDate();
  const [rows] = await pool.query(
    `${I.SELECT_PEDIDO}
      WHERE LOWER(p.cliente) = LOWER(?) AND p.status = 'concluido' AND COALESCE(p.revisao,'') NOT IN ('pendente','ignorado')
        AND p.concluido_em >= ? AND p.concluido_em <= ?${f.sql}`,
    [cliente, `${mes}-01 00:00:00`, `${mes}-${String(ultimo).padStart(2, "0")} 23:59:59`, ...f.params]
  );
  if (!rows.length) return null;
  const exp = await C.carregarExpediente(empresaId);
  const agora = C.agoraBahia();
  const mapa = await I.etapasDe(rows.map((r) => r.id));
  const itens = rows.map((r) => {
    const e = I.enriquecer(r, mapa.get(r.id) || [], exp, agora);
    return { e, m: S.metricasDoPedido(e) };
  });
  const geral = S.resumirGrupo(itens.map((i) => i.m));
  const porTipo = S.agruparPor(itens.map(({ e, m }) => ({ chave: String(e.tipo_id || e.tipo), rotulo: e.tipo || "Sem tipo", m })))
    .map((t) => ({ tipo: t.rotulo, entregues: t.entregues, pontos: t.pontos }));
  return {
    entregues: geral.entregues,
    pontos: geral.pontos,
    criacao_mediana_h: geral.criacao_h.mediana,
    no_prazo_pct: geral.no_prazo.pct,
    retrabalho_pct: geral.retrabalho.pct,
    espera_cliente_mediana_dias: geral.espera_cliente_dias.mediana,
    por_tipo: porTipo,
  };
}

module.exports = { indicadores, exportar, resumoMesCliente, lerFiltros, montar };
