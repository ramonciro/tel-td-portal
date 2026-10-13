/**
 * turmaPresencaGradeController.js — Treinamentos: grade de presença da turma
 * (pessoas × aulas), no mesmo modelo da chamada das jornadas (13/10/2026).
 *
 * Fonte dos dados (nada novo é criado, só lido/gravado o que já existe):
 *   - treinamento_participantes → quem é da turma (chave de presença = nome)
 *   - turma_aulas               → as aulas do cronograma (data, carga horária)
 *   - presenca_aulas            → a situação de cada pessoa em cada aula
 * Única coluna nova: treinamentos.presenca_minima_pct (migração passo 59).
 *
 * Regras (as mesmas das jornadas, decididas com o Ramon):
 *   - horas = soma da carga horária das aulas em que a pessoa esteve presente;
 *   - % presença = presentes ÷ (presentes + ausentes); justificada não soma
 *     horas e fica fora do cálculo;
 *   - aula já realizada sem lançamento = "pendente" (nunca vira falta sozinha);
 *   - lançamento só a partir da data da aula; justificativa obrigatória na
 *     falta justificada (regra já existente da chamada por aula);
 *   - presença mínima por turma (padrão 75%) pinta o farol.
 *
 * Isolamento: toda consulta passa pela turma (treinamentos.empresa_id);
 * turma de outro ambiente responde 404. A Assistente de Treinamento enxerga
 * qualquer ambiente, como na chamada por aula (tenantScopeFor). O CPF nunca
 * sai nestas respostas.
 */

const db = require("../lib/db");
const { tenantScopeFor } = require("../lib/tenantScope");
const { novoWorkbook, estilizarCabecalho, paraDate, FORMATO_DATA } = require("../lib/excelExport");

const CROSS_TENANT_ROLES = ["assistente_treinamento"];
const PRESENCA_MINIMA_PADRAO = 75;
const SITUACOES = ["presente", "justificado", "ausente"];
const LETRA = { presente: "P", justificado: "J", ausente: "F" };
const ROTULO_SITUACAO = { presente: "Presente", justificado: "Justificado", ausente: "Ausente" };
const ROTULO_FAROL = { verde: "Dentro do mínimo", vermelho: "Abaixo do mínimo", cinza: "Sem dados" };

// ───────────────────────── utilitários ─────────────────────────

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function formatarDataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function normalizarNome(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function arredondar(v, casas = 1) {
  if (v === null || v === undefined) return null;
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
}

function numeroOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function erro(res, status, message) {
  return res.status(status).json({ ok: false, message, error: message });
}

function falha(res, contexto, e) {
  console.error(`[turmaPresencaGrade] ${contexto}:`, e.message || e);
  return res.status(500).json({ ok: false, message: `Erro ao ${contexto}.`, error: `Erro ao ${contexto}.` });
}

function escopo(req) {
  return tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES }).empresaId;
}

// ───────────────────────── acesso a dados ─────────────────────────

async function buscarTurma(req, id) {
  const turmaId = Number(id);
  if (!turmaId) return null;
  const empresaId = escopo(req);
  const tenant = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [turmaId, empresaId] : [turmaId];
  const [rows] = await db.query(
    `SELECT id, empresa_id, tema, cliente, instrutor, supervisor, turma, status, carga_horaria, presenca_minima_pct,
            DATE_FORMAT(COALESCE(data_inicio, data), '%Y-%m-%d') AS data_inicio, DATE_FORMAT(data_fim, '%Y-%m-%d') AS data_fim
     FROM treinamentos WHERE id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

// Aula + checagem de ambiente pela turma (turma_aulas.empresa_id não é
// gravado de forma confiável — mesmo motivo de presencaAulasController).
async function buscarAula(req, id) {
  const aulaId = Number(id);
  if (!aulaId) return null;
  const empresaId = escopo(req);
  const tenant = empresaId ? " AND t.empresa_id = ?" : "";
  const params = empresaId ? [aulaId, empresaId] : [aulaId];
  const [rows] = await db.query(
    `SELECT ta.id, ta.treinamento_id, DATE_FORMAT(ta.data_aula, '%Y-%m-%d') AS data, ta.status_execucao, t.empresa_id
     FROM turma_aulas ta JOIN treinamentos t ON t.id = ta.treinamento_id
     WHERE ta.id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function presencaMinimaDa(turma) {
  const v = numeroOuNull(turma.presenca_minima_pct);
  return v === null ? PRESENCA_MINIMA_PADRAO : v;
}

async function carregarAulas(turma) {
  const [rows] = await db.query(
    `SELECT id, DATE_FORMAT(data_aula, '%Y-%m-%d') AS data, dia_numero, ordem, titulo, carga_horaria_planejada, carga_horaria_real,
            status_execucao, instrutor_responsavel
     FROM turma_aulas
     WHERE treinamento_id = ? AND LOWER(TRIM(COALESCE(status_execucao, ''))) <> 'cancelada'
     ORDER BY data_aula ASC, dia_numero ASC, ordem ASC, id ASC`,
    [turma.id]
  );
  const aulas = rows.map((a, i) => {
    const real = numeroOuNull(a.carga_horaria_real);
    const plan = numeroOuNull(a.carga_horaria_planejada);
    return {
      id: a.id,
      data: a.data,
      titulo: String(a.titulo || "").trim() || `Dia ${a.dia_numero || i + 1}`,
      carga_horaria: real && real > 0 ? real : plan && plan > 0 ? plan : 0,
      status_execucao: a.status_execucao || "planejada",
      instrutor: a.instrutor_responsavel || null,
    };
  });
  // Cronograma sem horas por aula: divide a carga horária da turma entre as
  // aulas (estimativa, sinalizada na tela e no relatório).
  let horasEstimadas = false;
  const cargaTurma = numeroOuNull(turma.carga_horaria);
  if (aulas.length && aulas.every((a) => !a.carga_horaria) && cargaTurma && cargaTurma > 0) {
    const porAula = arredondar(cargaTurma / aulas.length, 2);
    aulas.forEach((a) => { a.carga_horaria = porAula; });
    horasEstimadas = true;
  }
  return { aulas, horasEstimadas };
}

async function carregarParticipantes(turma) {
  const [rows] = await db.query(
    `SELECT id, nome, matricula, turma, supervisor, operacao, pessoa_id
     FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome ASC, id ASC`,
    [turma.id]
  );
  return rows;
}

function calcularTotais(aulas, obterSituacao, hoje, presencaMinima) {
  let horas = 0, presentes = 0, justificados = 0, ausentes = 0, pendentes = 0;
  for (const a of aulas) {
    const sit = obterSituacao(a);
    if (sit === "presente") { presentes += 1; horas += a.carga_horaria; }
    else if (sit === "justificado") justificados += 1;
    else if (sit === "ausente") ausentes += 1;
    else if (a.data <= hoje) pendentes += 1;
  }
  const base = presentes + ausentes;
  const pct = base > 0 ? arredondar((presentes / base) * 100, 1) : null;
  const farol = pct === null ? "cinza" : pct >= presencaMinima ? "verde" : "vermelho";
  return { horas: arredondar(horas, 2), presentes, justificados, ausentes, pendentes, pct_presenca: pct, farol };
}

async function montarGrade(turma) {
  const hoje = hojeBahia();
  const presencaMinima = presencaMinimaDa(turma);
  const { aulas, horasEstimadas } = await carregarAulas(turma);
  const participantes = await carregarParticipantes(turma);

  const [regs] = await db.query(
    `SELECT turma_aula_id, treinando_nome, status, justificativa
     FROM presenca_aulas WHERE treinamento_id = ?`,
    [turma.id]
  );
  const aulaIds = new Set(aulas.map((a) => a.id));
  const idsPorNome = new Map();
  for (const p of participantes) {
    const k = normalizarNome(p.nome);
    if (!idsPorNome.has(k)) idsPorNome.set(k, []);
    idsPorNome.get(k).push(p.id);
  }
  const presencas = {};
  const justificativas = {};
  for (const r of regs) {
    if (!aulaIds.has(r.turma_aula_id)) continue;
    const sit = String(r.status || "").toLowerCase().trim();
    if (!SITUACOES.includes(sit)) continue; // "pendente" = não lançado
    for (const pid of idsPorNome.get(normalizarNome(r.treinando_nome)) || []) {
      presencas[`${r.turma_aula_id}:${pid}`] = sit;
      if (sit === "justificado" && r.justificativa) justificativas[`${r.turma_aula_id}:${pid}`] = r.justificativa;
    }
  }

  const linhas = participantes.map((p) => ({
    ...p,
    totais: calcularTotais(aulas, (a) => presencas[`${a.id}:${p.id}`] || null, hoje, presencaMinima),
  }));

  const porAula = aulas.map((a) => {
    let presentes = 0, justificados = 0, ausentes = 0;
    for (const p of participantes) {
      const s = presencas[`${a.id}:${p.id}`];
      if (s === "presente") presentes += 1;
      else if (s === "justificado") justificados += 1;
      else if (s === "ausente") ausentes += 1;
    }
    const lancados = presentes + justificados + ausentes;
    return {
      aula_id: a.id,
      presentes,
      justificados,
      ausentes,
      nao_lancados: a.data <= hoje ? participantes.length - lancados : 0,
    };
  });

  const comPct = linhas.filter((l) => l.totais.pct_presenca !== null);
  const resumo = {
    participantes: participantes.length,
    aulas: aulas.length,
    aulas_realizadas: aulas.filter((a) => a.data <= hoje).length,
    horas_aulas: arredondar(aulas.reduce((s, a) => s + a.carga_horaria, 0), 2),
    pct_medio: comPct.length ? arredondar(comPct.reduce((s, l) => s + l.totais.pct_presenca, 0) / comPct.length, 1) : null,
    abaixo_do_minimo: linhas.filter((l) => l.totais.farol === "vermelho").length,
    sem_lancamento: linhas.filter((l) => l.totais.pendentes > 0).length,
  };

  return {
    turma: {
      id: turma.id,
      tema: turma.tema,
      cliente: turma.cliente,
      instrutor: turma.instrutor,
      supervisor: turma.supervisor,
      turma: turma.turma,
      status: turma.status,
      carga_horaria: numeroOuNull(turma.carga_horaria),
      data_inicio: turma.data_inicio,
      data_fim: turma.data_fim,
      presenca_minima_pct: presencaMinima,
      presenca_minima_definida: numeroOuNull(turma.presenca_minima_pct) !== null,
    },
    hoje,
    horas_estimadas: horasEstimadas,
    aulas,
    participantes: linhas,
    presencas,
    justificativas,
    por_aula: porAula,
    resumo,
  };
}

// ───────────────────────── handlers ─────────────────────────

// GET /turmas/:id/grade
async function grade(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");
    return res.json(await montarGrade(turma));
  } catch (e) {
    return falha(res, "carregar a grade de presença da turma", e);
  }
}

// PUT /turmas/:id/config  { presenca_minima_pct }
async function salvarConfig(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");
    const bruto = req.body?.presenca_minima_pct;
    let valor = null;
    if (bruto !== null && bruto !== undefined && String(bruto).trim() !== "") {
      valor = numeroOuNull(bruto);
      if (valor === null || valor < 0 || valor > 100) return erro(res, 400, "Informe a presença mínima entre 0 e 100.");
    }
    await db.query(`UPDATE treinamentos SET presenca_minima_pct = ? WHERE id = ?`, [valor, turma.id]);
    return res.json({ ok: true, presenca_minima_pct: valor === null ? PRESENCA_MINIMA_PADRAO : valor });
  } catch (e) {
    return falha(res, "salvar a presença mínima", e);
  }
}

async function validarAulaParaLancamento(req, res) {
  const aula = await buscarAula(req, req.params.id);
  if (!aula) { erro(res, 404, "Aula não encontrada."); return null; }
  if (String(aula.status_execucao || "").toLowerCase().trim() === "cancelada") { erro(res, 400, "Esta aula foi cancelada."); return null; }
  if (aula.data > hojeBahia()) { erro(res, 400, "A aula ainda não aconteceu — a presença só pode ser lançada a partir da data dela."); return null; }
  return aula;
}

const SQL_GRAVAR = `
  INSERT INTO presenca_aulas (turma_aula_id, treinamento_id, data_aula, treinando_nome, status, justificativa, empresa_id)
  VALUES ?
  ON DUPLICATE KEY UPDATE status = VALUES(status), justificativa = VALUES(justificativa), atualizado_em = CURRENT_TIMESTAMP`;

// PUT /aulas/:id/presenca  { participante_id, situacao: presente|justificado|ausente|null, justificativa? }
async function registrarPresenca(req, res) {
  try {
    const aula = await validarAulaParaLancamento(req, res);
    if (!aula) return undefined;
    const participanteId = Number(req.body?.participante_id);
    if (!participanteId) return erro(res, 400, "Participante inválido.");
    const [ps] = await db.query(`SELECT id, nome FROM treinamento_participantes WHERE id = ? AND treinamento_id = ? LIMIT 1`, [participanteId, aula.treinamento_id]);
    if (!ps.length) return erro(res, 404, "Participante não encontrado nesta turma.");

    const bruta = req.body?.situacao;
    const situacao = bruta === null || bruta === undefined || bruta === "" ? null : String(bruta).toLowerCase().trim();
    if (situacao !== null && !SITUACOES.includes(situacao)) return erro(res, 400, "Situação inválida. Use presente, justificado ou ausente.");
    const justificativa = situacao === "justificado" ? String(req.body?.justificativa || "").trim() : "";
    if (situacao === "justificado" && !justificativa) return erro(res, 400, "Informe a justificativa da falta justificada.");

    await db.query(SQL_GRAVAR, [[[aula.id, aula.treinamento_id, aula.data, ps[0].nome, situacao || "pendente", justificativa || null, aula.empresa_id || null]]]);
    return res.json({ ok: true, situacao, justificativa: justificativa || null });
  } catch (e) {
    return falha(res, "salvar a presença", e);
  }
}

// POST /aulas/:id/presenca-lote  { situacao: "presente" } — só quem ainda não foi lançado.
async function presencaEmLote(req, res) {
  try {
    const aula = await validarAulaParaLancamento(req, res);
    if (!aula) return undefined;
    const situacao = String(req.body?.situacao || "presente").toLowerCase().trim();
    if (situacao !== "presente") return erro(res, 400, "O lançamento em lote aceita apenas \"presente\".");

    const [ps] = await db.query(`SELECT id, nome FROM treinamento_participantes WHERE treinamento_id = ?`, [aula.treinamento_id]);
    const [regs] = await db.query(`SELECT treinando_nome, status FROM presenca_aulas WHERE turma_aula_id = ?`, [aula.id]);
    const jaLancados = new Set(
      regs.filter((r) => SITUACOES.includes(String(r.status || "").toLowerCase().trim())).map((r) => normalizarNome(r.treinando_nome))
    );
    const nomes = [];
    const vistos = new Set();
    for (const p of ps) {
      const k = normalizarNome(p.nome);
      if (jaLancados.has(k) || vistos.has(k)) continue;
      vistos.add(k);
      nomes.push(p.nome);
    }
    if (nomes.length) {
      await db.query(SQL_GRAVAR, [nomes.map((nome) => [aula.id, aula.treinamento_id, aula.data, nome, "presente", null, aula.empresa_id || null])]);
    }
    return res.json({ ok: true, alterados: nomes.length });
  } catch (e) {
    return falha(res, "marcar presença em lote", e);
  }
}

// GET /turmas/:id/participantes/:pid/extrato
async function extratoParticipante(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");
    const pid = Number(req.params.pid);
    const g = await montarGrade(turma);
    const p = g.participantes.find((x) => x.id === pid);
    if (!p) return erro(res, 404, "Participante não encontrado nesta turma.");
    const aulas = g.aulas.map((a) => {
      const sit = g.presencas[`${a.id}:${p.id}`] || null;
      return {
        id: a.id,
        data: a.data,
        titulo: a.titulo,
        carga_horaria: a.carga_horaria,
        realizada: a.data <= g.hoje,
        situacao: sit,
        justificativa: g.justificativas[`${a.id}:${p.id}`] || null,
        horas_creditadas: sit === "presente" ? a.carga_horaria : 0,
      };
    });
    return res.json({
      turma: g.turma,
      horas_estimadas: g.horas_estimadas,
      participante: { id: p.id, nome: p.nome, matricula: p.matricula, turma: p.turma, supervisor: p.supervisor, operacao: p.operacao, pessoa_id: p.pessoa_id },
      aulas,
      totais: p.totais,
    });
  } catch (e) {
    return falha(res, "carregar o extrato da pessoa", e);
  }
}

// GET /turmas/:id/exportar
async function exportar(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");
    const g = await montarGrade(turma);
    const cfg = g.turma;

    const [reg] = await db.query(
      `SELECT turma_aula_id, treinando_nome, atualizado_em FROM presenca_aulas WHERE treinamento_id = ?`,
      [turma.id]
    );
    const atualizadoEm = new Map(reg.map((r) => [`${r.turma_aula_id}:${normalizarNome(r.treinando_nome)}`, r.atualizado_em]));

    const wb = novoWorkbook();

    // Aba 1 — grade pessoa × aula.
    const ws = wb.addWorksheet("Presença");
    const fixas = ["Nome", "Matrícula", "Turma", "Supervisor", "Operação"];
    const cabecalho = [
      ...fixas,
      ...g.aulas.map((a) => `${formatarDataBR(a.data)} — ${a.titulo}`),
      "Horas realizadas", "Presentes", "Justificadas", "Ausências", "Sem lançamento", "% Presença", "Situação da presença",
    ];
    cabecalho.forEach((c, i) => { ws.getCell(1, i + 1).value = c; });
    estilizarCabecalho(ws, 1, cabecalho.length);
    ws.getRow(1).height = 34;
    g.participantes.forEach((p, r) => {
      const linha = r + 2;
      const valores = [p.nome, p.matricula || "", p.turma || "", p.supervisor || "", p.operacao || ""];
      g.aulas.forEach((a) => {
        const sit = g.presencas[`${a.id}:${p.id}`];
        valores.push(sit ? LETRA[sit] : "");
      });
      const t = p.totais;
      valores.push(t.horas, t.presentes, t.justificados, t.ausentes, t.pendentes, t.pct_presenca === null ? "" : t.pct_presenca / 100, `${ROTULO_FAROL[t.farol]} (mín. ${cfg.presenca_minima_pct}%)`);
      const base = fixas.length + g.aulas.length;
      valores.forEach((v, i) => {
        const cell = ws.getCell(linha, i + 1);
        cell.value = v;
        const col = i + 1;
        if (col > fixas.length && col <= base) cell.alignment = { horizontal: "center" };
        if (col === base + 6) cell.numFmt = "0.0%";
      });
    });
    ws.columns = cabecalho.map((_, i) => ({ width: i === 0 ? 34 : i < fixas.length ? 16 : i < fixas.length + g.aulas.length ? 14 : 16 }));
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cabecalho.length } };

    // Aba 2 — aulas.
    const wa = wb.addWorksheet("Aulas");
    const colsA = ["Data", "Aula", "Carga horária (h)", "Situação da aula", "Instrutor", "Presentes", "Justificados", "Ausentes", "Não lançados"];
    colsA.forEach((c, i) => { wa.getCell(1, i + 1).value = c; });
    estilizarCabecalho(wa, 1, colsA.length);
    g.aulas.forEach((a, r) => {
      const t = g.por_aula[r];
      const linha = r + 2;
      wa.getCell(linha, 1).value = paraDate(a.data);
      wa.getCell(linha, 1).numFmt = FORMATO_DATA;
      [a.titulo, a.carga_horaria, a.data <= g.hoje ? "Realizada" : "Agendada", a.instrutor || "", t.presentes, t.justificados, t.ausentes, t.nao_lancados].forEach((v, i) => {
        wa.getCell(linha, i + 2).value = v;
      });
    });
    wa.columns = [12, 36, 16, 16, 26, 11, 13, 10, 13].map((width) => ({ width }));
    wa.views = [{ state: "frozen", ySplit: 1 }];

    // Aba 3 — registro individual (evidência por pessoa × aula).
    const wr = wb.addWorksheet("Registro (evidência)");
    const colsR = ["Nome", "Matrícula", "Data", "Aula", "Carga horária (h)", "Situação", "Horas creditadas", "Justificativa", "Atualizado em"];
    colsR.forEach((c, i) => { wr.getCell(1, i + 1).value = c; });
    estilizarCabecalho(wr, 1, colsR.length);
    let rr = 2;
    for (const p of g.participantes) {
      for (const a of g.aulas) {
        const sit = g.presencas[`${a.id}:${p.id}`];
        if (!sit) continue;
        const quando = atualizadoEm.get(`${a.id}:${normalizarNome(p.nome)}`);
        const vals = [
          p.nome, p.matricula || "", paraDate(a.data), a.titulo, a.carga_horaria, ROTULO_SITUACAO[sit], sit === "presente" ? a.carga_horaria : 0,
          g.justificativas[`${a.id}:${p.id}`] || "",
          quando ? new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "",
        ];
        vals.forEach((v, i) => { wr.getCell(rr, i + 1).value = v; });
        wr.getCell(rr, 3).numFmt = FORMATO_DATA;
        rr += 1;
      }
    }
    wr.columns = [34, 14, 12, 34, 16, 14, 16, 40, 20].map((width) => ({ width }));
    wr.views = [{ state: "frozen", ySplit: 1 }];
    wr.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsR.length } };

    // Aba 4 — resumo e critérios.
    const wm = wb.addWorksheet("Resumo");
    const linhasResumo = [
      ["Turma", cfg.tema],
      ["Cliente", cfg.cliente || ""],
      ["Instrutor", cfg.instrutor || ""],
      ["Período", [formatarDataBR(cfg.data_inicio), formatarDataBR(cfg.data_fim)].filter(Boolean).join(" a ")],
      ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })],
      ["Participantes", g.resumo.participantes],
      ["Aulas cadastradas / já realizadas", `${g.resumo.aulas} / ${g.resumo.aulas_realizadas}`],
      ["Carga horária total das aulas (h)", g.resumo.horas_aulas],
      ["Presença mínima exigida", `${cfg.presenca_minima_pct}%`],
      ["Pessoas abaixo da presença mínima", g.resumo.abaixo_do_minimo],
      ["Pessoas com aula realizada sem lançamento", g.resumo.sem_lancamento],
      ["Presença média", g.resumo.pct_medio === null ? "—" : `${g.resumo.pct_medio}%`],
      [],
      ["Como os números são calculados"],
      ["Horas realizadas = soma da carga horária das aulas em que a pessoa esteve presente."],
      ["% de presença = presentes ÷ (presentes + ausentes) nas aulas já lançadas. Falta justificada não soma horas e fica fora do cálculo."],
      ["Aula já realizada sem lançamento não é contada como falta."],
      ["Legenda da grade: P = presente · J = justificado · F = ausente · vazio = não lançado."],
    ];
    if (g.horas_estimadas) linhasResumo.push(["Atenção: as aulas não têm carga horária própria; a carga horária da turma foi dividida igualmente entre elas (estimativa)."]);
    linhasResumo.forEach((l, i) => {
      l.forEach((v, c) => { wm.getCell(i + 1, c + 1).value = v; });
      if (l.length === 2) wm.getCell(i + 1, 1).font = { bold: true };
    });
    wm.getCell(linhasResumo.findIndex((l) => l[0] === "Como os números são calculados") + 1, 1).font = { bold: true };
    wm.columns = [{ width: 46 }, { width: 50 }];

    const slug = String(cfg.tema || "turma").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "turma";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="presenca-${slug}-${hojeBahia()}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[turmaPresencaGrade] exportar:", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao exportar a presença da turma.");
    return res.end();
  }
}

module.exports = { grade, salvarConfig, registrarPresenca, presencaEmLote, extratoParticipante, exportar };
