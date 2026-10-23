/**
 * fechamentoMensalController.js — Fechamento mensal por cliente (21/10/2026)
 *
 * Um resumo único do mês para cada cliente (operação): turmas encerradas, horas,
 * participantes, presença, NPS/qualidade/prova, pendências e comparação com o mês
 * anterior. "Fechar o mês" guarda uma foto (JSON) desse resumo — depois disso o
 * número não muda mais mesmo que alguém corrija dados antigos; "reabrir" apaga a
 * foto e volta a mostrar o cálculo ao vivo.
 *
 * Regra de pertencimento (para nada ser contado duas vezes): a turma pertence ao
 * mês em que ELA TERMINA (data fim; sem data fim, data de início). Turmas que
 * começaram no mês mas terminam depois aparecem à parte, como "continuam no mês
 * seguinte", sem entrar nos totais. Turmas canceladas não entram nos totais.
 *
 * Presença, status e horas vêm da mesma fonte do Dashboard (carregarTurmasEnriquecidas).
 */
const pool = require("../lib/db");
const { tenantScopeFor } = require("../lib/tenantScope");
const { registrarAuditoria } = require("../services/auditoria");
const { carregarTurmasEnriquecidas, parseHorasTexto } = require("./dashboardTreinamentosController");
const { todosOsInstrutores } = require("../lib/instrutoresTurma");
const { novoWorkbook, adicionarTabela, escreverTabela } = require("../lib/excelExport");

const CROSS = ["superintendente"];
const n = (v) => Number(v || 0);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function isoData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return [valor.getFullYear(), String(valor.getMonth() + 1).padStart(2, "0"), String(valor.getDate()).padStart(2, "0")].join("-");
  }
  return String(valor).slice(0, 10);
}

function mesValido(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || "")); }
function mesAnterior(m) {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(a, mm - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function limitesDoMes(m) {
  const [a, mm] = m.split("-").map(Number);
  const ultimo = new Date(a, mm, 0).getDate();
  return { ini: `${m}-01`, fim: `${m}-${String(ultimo).padStart(2, "0")}` };
}

function escopo(req) {
  return tenantScopeFor(req, { crossTenantRoles: CROSS }).empresaId;
}

async function calcularMes(req, cliente, mes) {
  const { ini, fim } = limitesDoMes(mes);
  const sub = { user: req.user, empresaId: req.empresaId, query: { cliente } };
  const { enriched } = await carregarTurmasEnriquecidas(sub);

  const periodoDe = (t) => {
    const i = isoData(t.data_inicio) || isoData(t.data);
    const f = isoData(t.data_fim) || i;
    return { i, f };
  };
  const cancelada = (t) => /cancel/i.test(String(t.status_canonico || t.status || ""));

  const turmasMes = [];
  const continuam = [];
  let canceladas = 0;
  for (const t of enriched) {
    const { i, f } = periodoDe(t);
    if (!i && !f) continue;
    if (f >= ini && f <= fim) {
      if (cancelada(t)) { canceladas += 1; continue; }
      turmasMes.push(t);
    } else if (i && i <= fim && f > fim && !cancelada(t)) {
      continuam.push(t);
    }
  }

  // Avaliações dessas turmas
  const ids = turmasMes.map((t) => Number(t.id));
  let porTurma = new Map();
  let nps = { total: 0, promotores: 0, detratores: 0, soma: 0, qual: [], prova: [] };
  if (ids.length) {
    const [av] = await pool.query(
      `SELECT treinamento_id, nota_nps, nota_qualidade, nota_prova FROM avaliacoes WHERE treinamento_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    for (const a of av) {
      const k = Number(a.treinamento_id);
      if (!porTurma.has(k)) porTurma.set(k, { nps: [], qual: [], prova: [] });
      const g = porTurma.get(k);
      if (a.nota_nps != null) {
        const v = Number(a.nota_nps);
        g.nps.push(v); nps.total += 1; nps.soma += v;
        if (v >= 9) nps.promotores += 1;
        if (v < 7) nps.detratores += 1;
      }
      if (a.nota_qualidade != null) { g.qual.push(Number(a.nota_qualidade)); nps.qual.push(Number(a.nota_qualidade)); }
      if (a.nota_prova != null) { g.prova.push(Number(a.nota_prova)); nps.prova.push(Number(a.nota_prova)); }
    }
  }
  const media = (arr) => (arr.length ? r1(arr.reduce((x, y) => x + y, 0) / arr.length) : null);

  let horasTurma = 0, horasTrein = 0, participantes = 0, pres = 0, ause = 0, chamadasPend = 0;
  const instrutores = new Set();
  const turmas = turmasMes.map((t) => {
    const ch = parseHorasTexto(t.carga_horaria);
    const part = n(t.presenca?.baseParticipantes) || n(t.roster_total);
    const { i, f } = periodoDe(t);
    horasTurma += ch; horasTrein += ch * part; participantes += part;
    pres += n(t.presenca?.diasPresente); ause += n(t.presenca?.diasAusente);
    if (t.status_canonico === "Chamada pendente") chamadasPend += 1;
    // TBT: o resumo conta a ação uma vez (horas, participantes); os instrutores envolvidos são todos.
    const nomesInstrutores = todosOsInstrutores(t.instrutor, t.instrutores_adicionais || []);
    nomesInstrutores.forEach((nm) => instrutores.add(nm));
    const g = porTurma.get(Number(t.id));
    return {
      id: t.id, tema: t.tema, instrutor: nomesInstrutores.join(", "), inicio: i, fim: f, carga_horaria: ch,
      participantes: part, presenca_pct: n(t.presenca?.diasPresente) + n(t.presenca?.diasAusente) > 0 ? n(t.presenca.taxaPresenca) : null,
      nps_media: g ? media(g.nps) : null, status: t.status_canonico || "",
    };
  });

  // Produção de conteúdo do cliente no mês (Pacote 2). Melhor esforço: nunca derruba o fechamento.
  let conteudo = null;
  try {
    conteudo = await require("./conteudoIndicadoresController").resumoMesCliente(escopo(req), cliente, mes);
  } catch (e) {
    console.error("[fechamento] conteúdo:", e.message);
  }

  const kpis = {
    turmas_encerradas: turmas.length,
    turmas_canceladas: canceladas,
    continuam_proximo_mes: continuam.length,
    horas_turma: r1(horasTurma),
    horas_treinamento: r1(horasTrein),
    participantes,
    presenca_pct: pres + ause > 0 ? Math.round((pres / (pres + ause)) * 100) : null,
    nps_respostas: nps.total,
    nps_score: nps.total ? Math.round(((nps.promotores - nps.detratores) / nps.total) * 100) : null,
    nps_media: nps.total ? r1(nps.soma / nps.total) : null,
    qualidade_media: media(nps.qual),
    prova_media: media(nps.prova),
    instrutores: instrutores.size,
    chamadas_pendentes: chamadasPend,
  };
  return {
    kpis,
    turmas: turmas.sort((a, b) => String(a.fim).localeCompare(String(b.fim)) || String(a.tema).localeCompare(String(b.tema))),
    continuam: continuam.map((t) => ({ id: t.id, tema: t.tema, instrutor: todosOsInstrutores(t.instrutor, t.instrutores_adicionais || []).join(", "), fim: periodoDe(t).f })),
    instrutores: [...instrutores].sort(),
    conteudo,
  };
}

function variacoes(atual, anterior) {
  const v = {};
  for (const k of ["turmas_encerradas", "horas_turma", "horas_treinamento", "participantes", "presenca_pct", "nps_score", "nps_media", "qualidade_media", "prova_media"]) {
    const a = atual[k], b = anterior[k];
    v[k] = a == null || b == null ? null : r1(a - b);
  }
  return v;
}

async function buscarFechado(empresaId, cliente, mes) {
  const [r] = await pool.query(
    `SELECT * FROM fechamentos_mensais WHERE empresa_id = ? AND cliente = ? AND mes = ? LIMIT 1`,
    [empresaId, cliente, mes]
  );
  if (!r.length) return null;
  let dados = null;
  try { dados = JSON.parse(r[0].dados_json); } catch (_) { dados = null; }
  return { id: r[0].id, fechado_em: r[0].fechado_em, fechado_por_nome: r[0].fechado_por_nome, observacao: r[0].observacao, dados };
}

async function validarCliente(req, cliente) {
  const emp = escopo(req);
  const [r] = await pool.query(
    `SELECT 1 FROM treinamentos WHERE cliente = ? ${emp ? "AND empresa_id = ?" : ""} LIMIT 1`,
    emp ? [cliente, emp] : [cliente]
  );
  return r.length > 0;
}

function lerParametros(req, fonte) {
  const mes = String(fonte.mes || "").trim();
  const cliente = String(fonte.cliente || "").trim();
  if (!mesValido(mes)) return { erro: "Informe o mês no formato AAAA-MM." };
  if (!cliente) return { erro: "Escolha o cliente." };
  return { mes, cliente };
}

// Empresa "dona" do fechamento: a do usuário; superintendente (sem empresa) só lê, não fecha.
function empresaDoFechamento(req) { return req.empresaId || null; }

/** GET /api/fechamento-mensal/panorama?mes= — todos os clientes do mês e se já foram fechados. */
async function panorama(req, res) {
  try {
    const mes = String(req.query.mes || "");
    if (!mesValido(mes)) return res.status(400).json({ message: "Informe o mês no formato AAAA-MM." });
    const emp = escopo(req);
    const { ini, fim } = limitesDoMes(mes);
    const [clientes] = await pool.query(
      `SELECT cliente, COUNT(*) AS turmas FROM treinamentos
        WHERE cliente IS NOT NULL AND TRIM(cliente) <> '' ${emp ? "AND empresa_id = ?" : ""}
          AND DATE(COALESCE(data_fim, data_inicio, data)) BETWEEN ? AND ?
          AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
        GROUP BY cliente ORDER BY cliente`,
      emp ? [emp, ini, fim] : [ini, fim]
    );
    const todos = await pool.query(
      `SELECT DISTINCT cliente FROM treinamentos WHERE cliente IS NOT NULL AND TRIM(cliente) <> '' ${emp ? "AND empresa_id = ?" : ""} ORDER BY cliente`,
      emp ? [emp] : []
    );
    const [fechados] = await pool.query(
      `SELECT cliente, fechado_em, fechado_por_nome FROM fechamentos_mensais WHERE mes = ? ${emp ? "AND empresa_id = ?" : ""}`,
      emp ? [mes, emp] : [mes]
    );
    const mapaF = new Map(fechados.map((f) => [f.cliente, f]));
    const mapaT = new Map(clientes.map((c) => [c.cliente, Number(c.turmas)]));
    const nomes = [...new Set([...todos[0].map((c) => c.cliente), ...clientes.map((c) => c.cliente)])];
    res.json({
      mes,
      clientes: nomes.map((c) => ({
        cliente: c, turmas_no_mes: mapaT.get(c) || 0,
        fechado: mapaF.has(c), fechado_em: mapaF.get(c)?.fechado_em || null, fechado_por_nome: mapaF.get(c)?.fechado_por_nome || null,
      })),
    });
  } catch (e) {
    console.error("[fechamento] panorama:", e.message);
    res.status(500).json({ message: "Erro ao carregar o panorama do mês." });
  }
}

/** GET /api/fechamento-mensal?mes=&cliente= */
async function obter(req, res) {
  try {
    const p = lerParametros(req, req.query);
    if (p.erro) return res.status(400).json({ message: p.erro });
    if (!(await validarCliente(req, p.cliente))) return res.status(404).json({ message: "Cliente não encontrado." });
    const [atual, anterior] = await Promise.all([calcularMes(req, p.cliente, p.mes), calcularMes(req, p.cliente, mesAnterior(p.mes))]);
    const emp = empresaDoFechamento(req);
    const fechado = emp ? await buscarFechado(emp, p.cliente, p.mes) : null;
    res.json({
      mes: p.mes, mes_anterior: mesAnterior(p.mes), cliente: p.cliente,
      ao_vivo: { ...atual, anterior: anterior.kpis, variacao: variacoes(atual.kpis, anterior.kpis) },
      fechado,
    });
  } catch (e) {
    console.error("[fechamento] obter:", e.message);
    res.status(500).json({ message: "Erro ao calcular o fechamento do mês." });
  }
}

/** POST /api/fechamento-mensal { mes, cliente, observacao } */
async function fechar(req, res) {
  try {
    const p = lerParametros(req, req.body || {});
    if (p.erro) return res.status(400).json({ message: p.erro });
    const emp = empresaDoFechamento(req);
    if (!emp) return res.status(400).json({ message: "Seu usuário não está vinculado a uma empresa para fechar o mês." });
    if (!(await validarCliente(req, p.cliente))) return res.status(404).json({ message: "Cliente não encontrado." });
    if (await buscarFechado(emp, p.cliente, p.mes)) return res.status(409).json({ message: "Este mês já está fechado para o cliente. Reabra para refazer." });
    const [atual, anterior] = await Promise.all([calcularMes(req, p.cliente, p.mes), calcularMes(req, p.cliente, mesAnterior(p.mes))]);
    const dados = { ...atual, anterior: anterior.kpis, variacao: variacoes(atual.kpis, anterior.kpis) };
    const obs = String(req.body?.observacao || "").trim().slice(0, 1000) || null;
    await pool.query(
      `INSERT INTO fechamentos_mensais (empresa_id, cliente, mes, dados_json, observacao, fechado_por, fechado_por_nome)
       VALUES (?,?,?,?,?,?,?)`,
      [emp, p.cliente, p.mes, JSON.stringify(dados), obs, req.user?.id || null, req.user?.nome || null]
    );
    registrarAuditoria({ usuario: req.user, acao: "fechar_mes", entidade: "fechamento_mensal", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} fechou ${p.mes} de ${p.cliente}`, ip: req.ip });
    res.status(201).json({ ok: true, fechado: await buscarFechado(emp, p.cliente, p.mes) });
  } catch (e) {
    console.error("[fechamento] fechar:", e.message);
    res.status(500).json({ message: "Erro ao fechar o mês." });
  }
}

/** DELETE /api/fechamento-mensal?mes=&cliente= — reabre */
async function reabrir(req, res) {
  try {
    const p = lerParametros(req, req.query);
    if (p.erro) return res.status(400).json({ message: p.erro });
    const emp = empresaDoFechamento(req);
    if (!emp) return res.status(400).json({ message: "Seu usuário não está vinculado a uma empresa." });
    const [r] = await pool.query(`DELETE FROM fechamentos_mensais WHERE empresa_id = ? AND cliente = ? AND mes = ?`, [emp, p.cliente, p.mes]);
    if (!r.affectedRows) return res.status(404).json({ message: "Este mês não estava fechado." });
    registrarAuditoria({ usuario: req.user, acao: "reabrir_mes", entidade: "fechamento_mensal", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} reabriu ${p.mes} de ${p.cliente}`, ip: req.ip });
    res.json({ ok: true });
  } catch (e) {
    console.error("[fechamento] reabrir:", e.message);
    res.status(500).json({ message: "Erro ao reabrir o mês." });
  }
}

/** GET /api/fechamento-mensal/exportar?mes=&cliente= — usa a foto, se fechado; senão o cálculo ao vivo. */
async function exportar(req, res) {
  try {
    const p = lerParametros(req, req.query);
    if (p.erro) return res.status(400).json({ message: p.erro });
    if (!(await validarCliente(req, p.cliente))) return res.status(404).json({ message: "Cliente não encontrado." });
    const emp = empresaDoFechamento(req);
    const fechado = emp ? await buscarFechado(emp, p.cliente, p.mes) : null;
    let dados = fechado?.dados;
    if (!dados) {
      const [atual, anterior] = await Promise.all([calcularMes(req, p.cliente, p.mes), calcularMes(req, p.cliente, mesAnterior(p.mes))]);
      dados = { ...atual, anterior: anterior.kpis, variacao: variacoes(atual.kpis, anterior.kpis) };
    }
    const k = dados.kpis, a = dados.anterior || {}, v = dados.variacao || {};
    const wb = novoWorkbook();
    const fmtMes = p.mes.split("-").reverse().join("/");
    const ind = [
      ["Turmas encerradas no mês", "turmas_encerradas", "inteiro"],
      ["Turmas canceladas", "turmas_canceladas", "inteiro"],
      ["Continuam no mês seguinte", "continuam_proximo_mes", "inteiro"],
      ["Horas de turma", "horas_turma", "decimal1"],
      ["Horas de treinamento (horas × participantes)", "horas_treinamento", "decimal1"],
      ["Participantes", "participantes", "inteiro"],
      ["Presença (%)", "presenca_pct", "inteiro"],
      ["NPS (score)", "nps_score", "inteiro"],
      ["NPS (média das notas)", "nps_media", "decimal1"],
      ["Qualidade (média)", "qualidade_media", "decimal1"],
      ["Prova (média)", "prova_media", "decimal1"],
      ["Instrutores envolvidos", "instrutores", "inteiro"],
      ["Chamadas pendentes", "chamadas_pendentes", "inteiro"],
    ];
    const wsResumo = wb.addWorksheet("Resumo");
    wsResumo.columns = [{ width: 46 }, { width: 14 }, { width: 14 }, { width: 12 }];
    const proxima = escreverTabela(wsResumo, {
      startRow: 1,
      titulo: `Fechamento ${fmtMes} — ${p.cliente}${fechado ? ` (fechado em ${new Date(fechado.fechado_em).toLocaleDateString("pt-BR")} por ${fechado.fechado_por_nome || "—"})` : " (prévia, mês ainda aberto)"}`,
      colunas: [
        { titulo: "Indicador", chave: "ind" },
        { titulo: "Mês", chave: "atual" },
        { titulo: "Mês anterior", chave: "ant" },
        { titulo: "Variação", chave: "var" },
      ],
      linhas: ind.map(([nome, chave]) => ({ ind: nome, atual: k[chave] ?? "—", ant: a[chave] ?? "—", var: v[chave] ?? "—" })),
    });
    if (fechado?.observacao) wsResumo.getCell(proxima + 1, 1).value = `Observação: ${fechado.observacao}`;
    adicionarTabela(wb, {
      nomeAba: "Turmas",
      colunas: [
        { titulo: "Turma", chave: "tema", largura: 40 }, { titulo: "Instrutor", chave: "instrutor", largura: 24 },
        { titulo: "Início", chave: "inicio", formato: "data" }, { titulo: "Fim", chave: "fim", formato: "data" },
        { titulo: "Carga horária (h)", chave: "carga_horaria", formato: "decimal1" },
        { titulo: "Participantes", chave: "participantes", formato: "inteiro" },
        { titulo: "Presença (%)", chave: "presenca_pct", formato: "inteiro" },
        { titulo: "NPS (média)", chave: "nps_media", formato: "decimal1" },
        { titulo: "Situação", chave: "status", largura: 18 },
      ],
      linhas: dados.turmas || [],
    });
    if (dados.conteudo && dados.conteudo.entregues > 0) {
      const c = dados.conteudo;
      const wsC = wb.addWorksheet("Conteúdo");
      wsC.columns = [{ width: 46 }, { width: 16 }];
      const prox = escreverTabela(wsC, {
        startRow: 1,
        titulo: `Produção de conteúdo — ${fmtMes} — ${p.cliente}`,
        colunas: [{ titulo: "Indicador", chave: "nome" }, { titulo: "Valor", chave: "valor" }],
        linhas: [
          { nome: "Pedidos entregues", valor: c.entregues },
          { nome: "Pontos entregues", valor: c.pontos },
          { nome: "Criação — mediana (h úteis)", valor: c.criacao_mediana_h ?? "—" },
          { nome: "Entregues no prazo (%)", valor: c.no_prazo_pct ?? "—" },
          { nome: "Pedidos com retrabalho (%)", valor: c.retrabalho_pct ?? "—" },
          { nome: "Espera do cliente — mediana (dias)", valor: c.espera_cliente_mediana_dias ?? "—" },
        ],
      });
      escreverTabela(wsC, {
        startRow: prox + 1,
        colunas: [{ titulo: "Tipo de material", chave: "tipo" }, { titulo: "Entregues", chave: "entregues", formato: "inteiro" }],
        linhas: c.por_tipo || [],
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    registrarAuditoria({ usuario: req.user, acao: "exportar", entidade: "fechamento_mensal", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} exportou o fechamento ${p.mes} de ${p.cliente}`, ip: req.ip });
    const nomeArq = `fechamento-${p.mes}-${p.cliente.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArq}"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[fechamento] exportar:", e.message);
    res.status(500).json({ message: "Erro ao exportar o fechamento." });
  }
}

module.exports = { panorama, obter, fechar, reabrir, exportar, calcularMes };
