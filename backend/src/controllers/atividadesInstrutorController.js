/**
 * atividadesInstrutorController.js
 *
 * Versão em banco da "Planilha_Operacional_Treinamento_Mercantil.xlsx": cada
 * instrutor lança suas atividades (CH programada x realizada), e este
 * controller expõe tanto o CRUD dos lançamentos quanto as mesmas visões
 * agregadas que existiam na planilha (Painel, Capacity x Consumido, Ranking,
 * Aderência por Tema, Distribuição por Célula, Alertas) — agora calculadas
 * ao vivo a partir dos dados do portal em vez de depender de fórmulas de
 * Excel mantidas manualmente por cada instrutor.
 *
 * Regra de negócio (a mesma da aba "Instruções" da planilha original):
 * não lance aqui uma atividade que já existe como turma formal em
 * `treinamentos` — turmas formais já entram na CH efetiva via
 * turma_aulas.carga_horaria_real (ver capacidadeResolver.js). Isto evita
 * contar a mesma CH duas vezes.
 */

const pool = require("../lib/db");
const {
  diasUteisDoMes,
  statusOcupacao,
  getRegraPadrao,
  listarInstrutoresConhecidos,
} = require("../services/capacidadeResolver");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function diffDiasInclusive(inicio, fim) {
  const d1 = new Date(`${toDateOnly(inicio)}T00:00:00Z`);
  const d2 = new Date(`${toDateOnly(fim || inicio)}T00:00:00Z`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

// CH(h) = diferença entre hora fim e hora início, em horas. Mesma fórmula da
// planilha original (=(hora_fim-hora_inicio)*24). Se a hora fim vier "antes"
// da hora início (ex.: atividade que atravessa a meia-noite), soma 24h em vez
// de gerar um número negativo — a planilha original não cobria esse caso e
// teria devolvido CH negativa.
function calcularChHoras(horaInicio, horaFim) {
  if (!horaInicio || !horaFim) return 0;
  const [h1, m1] = String(horaInicio).split(":").map(Number);
  const [h2, m2] = String(horaFim).split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return 0;
  let minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutos < 0) minutos += 24 * 60;
  return Number((minutos / 60).toFixed(2));
}

// Mesma classificação de célula da planilha original (aba de cada
// instrutor, coluna "Célula", calculada a partir do Canal).
function classificarCelula(canal) {
  const valor = String(canal || "").trim();
  const principal = ["SAC/0800/Chat", "Central Cartões", "Retenção"];
  const suporte = ["Qualidade"];
  const especial = ["Reclame Aqui / RA", "Redes Sociais / NPS"];
  if (principal.includes(valor)) return "Célula Principal";
  if (suporte.includes(valor)) return "Célula de Suporte";
  if (especial.includes(valor)) return "Célula Especial";
  if (!valor) return "";
  return "Outro";
}

function tenantWhere(empresaId, alias = "") {
  const coluna = alias ? `${alias}.empresa_id` : "empresa_id";
  return empresaId ? `${coluna} = ${pool.escape(empresaId)}` : "1=1";
}

function podeGerenciarTodos(perfil) {
  return ["coordenador", "supervisor", "superintendente", "super_admin"].includes(
    String(perfil || "").trim().toLowerCase()
  );
}

function montarDerivados(body) {
  const dataInicio = toDateOnly(body.data_inicio);
  const dataFim = toDateOnly(body.data_fim) || dataInicio;
  const numDias = diffDiasInclusive(dataInicio, dataFim);
  const chHoras = body.ch_horas != null && body.ch_horas !== ""
    ? Number(body.ch_horas)
    : calcularChHoras(body.hora_inicio, body.hora_fim);
  const hcProgramado = Number(body.hc_programado || 0);
  const hcRealizado = Number(body.hc_realizado || 0);
  const celula = body.celula || classificarCelula(body.canal);
  const mesRef = dataInicio ? dataInicio.slice(0, 7) : null;

  return {
    data_inicio: dataInicio,
    data_fim: dataFim,
    num_dias: numDias,
    ch_horas: chHoras,
    hc_programado: hcProgramado,
    hc_realizado: hcRealizado,
    celula,
    mes_ref: mesRef,
  };
}

async function listar(req, res) {
  try {
    const q = req.query || {};
    const conditions = [tenantWhere(req.empresaId)];
    const params = [];

    const podeVerTodos = podeGerenciarTodos(req.user?.perfil);
    const instrutorFiltro = podeVerTodos ? q.instrutor : req.user?.nome;

    if (instrutorFiltro) {
      conditions.push("instrutor = ?");
      params.push(instrutorFiltro);
    }
    if (q.mes_ref) {
      conditions.push("mes_ref = ?");
      params.push(q.mes_ref);
    }
    if (q.cliente) {
      conditions.push("cliente = ?");
      params.push(q.cliente);
    }
    if (q.status) {
      conditions.push("LOWER(status) = ?");
      params.push(String(q.status).toLowerCase());
    }
    if (q.data_inicio) {
      conditions.push("data_inicio >= ?");
      params.push(q.data_inicio);
    }
    if (q.data_fim) {
      conditions.push("COALESCE(data_fim, data_inicio) <= ?");
      params.push(q.data_fim);
    }

    const [rows] = await pool.query(
      `SELECT * FROM atividades_instrutor WHERE ${conditions.join(" AND ")}
       ORDER BY data_inicio DESC, id DESC`,
      params
    );

    return res.json({ ok: true, itens: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar lançamentos.", error: error.message });
  }
}

async function criar(req, res) {
  try {
    const body = req.body || {};
    const podeEscolherInstrutor = podeGerenciarTodos(req.user?.perfil);
    const instrutor = podeEscolherInstrutor && body.instrutor ? body.instrutor : req.user?.nome;

    if (!instrutor) {
      return res.status(400).json({ ok: false, message: "Informe o instrutor." });
    }
    if (!body.data_inicio || !body.tema) {
      return res.status(400).json({ ok: false, message: "Informe ao menos Data Início e Tema." });
    }

    const derivados = montarDerivados(body);

    const [result] = await pool.query(
      `INSERT INTO atividades_instrutor
        (empresa_id, instrutor, cliente, operacao, data_inicio, data_fim, tema, tipo_atividade,
         canal, celula, hora_inicio, hora_fim, ch_horas, num_dias, hc_programado, hc_realizado,
         status, local, mes_ref, observacoes, treinamento_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.empresaId || null,
        instrutor,
        body.cliente || null,
        body.operacao || null,
        derivados.data_inicio,
        derivados.data_fim,
        body.tema,
        body.tipo_atividade || null,
        body.canal || null,
        derivados.celula || null,
        body.hora_inicio || null,
        body.hora_fim || null,
        derivados.ch_horas,
        derivados.num_dias,
        derivados.hc_programado,
        derivados.hc_realizado,
        body.status || "programado",
        body.local || null,
        derivados.mes_ref,
        body.observacoes || null,
        body.treinamento_id || null,
        req.user?.nome || req.user?.email || null,
      ]
    );

    return res.json({ ok: true, id: result.insertId, message: "Atividade lançada com sucesso." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao lançar atividade.", error: error.message });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const [existentes] = await pool.query(
      `SELECT * FROM atividades_instrutor WHERE id = ? AND ${tenantWhere(req.empresaId)}`,
      [id]
    );
    const atual = existentes[0];
    if (!atual) {
      return res.status(404).json({ ok: false, message: "Lançamento não encontrado." });
    }

    const podeEditarTodos = podeGerenciarTodos(req.user?.perfil);
    if (!podeEditarTodos && atual.instrutor !== req.user?.nome) {
      return res.status(403).json({ ok: false, message: "Você só pode editar seus próprios lançamentos." });
    }

    const mesclado = { ...atual, ...body };
    const derivados = montarDerivados(mesclado);

    await pool.query(
      `UPDATE atividades_instrutor SET
         cliente = ?, operacao = ?, data_inicio = ?, data_fim = ?, tema = ?, tipo_atividade = ?,
         canal = ?, celula = ?, hora_inicio = ?, hora_fim = ?, ch_horas = ?, num_dias = ?,
         hc_programado = ?, hc_realizado = ?, status = ?, local = ?, mes_ref = ?, observacoes = ?
       WHERE id = ?`,
      [
        mesclado.cliente || null,
        mesclado.operacao || null,
        derivados.data_inicio,
        derivados.data_fim,
        mesclado.tema,
        mesclado.tipo_atividade || null,
        mesclado.canal || null,
        derivados.celula || null,
        mesclado.hora_inicio || null,
        mesclado.hora_fim || null,
        derivados.ch_horas,
        derivados.num_dias,
        derivados.hc_programado,
        derivados.hc_realizado,
        mesclado.status || "programado",
        mesclado.local || null,
        derivados.mes_ref,
        mesclado.observacoes || null,
        id,
      ]
    );

    return res.json({ ok: true, message: "Lançamento atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao atualizar lançamento.", error: error.message });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [existentes] = await pool.query(
      `SELECT instrutor FROM atividades_instrutor WHERE id = ? AND ${tenantWhere(req.empresaId)}`,
      [id]
    );
    const atual = existentes[0];
    if (!atual) {
      return res.status(404).json({ ok: false, message: "Lançamento não encontrado." });
    }
    if (!podeGerenciarTodos(req.user?.perfil) && atual.instrutor !== req.user?.nome) {
      return res.status(403).json({ ok: false, message: "Você só pode excluir seus próprios lançamentos." });
    }
    await pool.query(`DELETE FROM atividades_instrutor WHERE id = ?`, [id]);
    return res.json({ ok: true, message: "Lançamento excluído." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao excluir lançamento.", error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Visões agregadas — equivalentes às abas Painel / Capacity x Consumido /
// Ranking Instrutores / Aderência por Tema / Distribuição por Célula /
// Alertas da planilha original, agora somando também a CH das turmas formais
// (turma_aulas) via capacidadeResolver, para refletir a CH efetiva real do
// time — não só o que foi lançado manualmente.
// ---------------------------------------------------------------------------

async function getPainel(req, res) {
  try {
    const { getCapacidadeVsRealizado } = require("../services/capacidadeResolver");
    const q = req.query || {};
    const hoje = new Date();
    const meses = [];
    const totalMeses = Number(q.meses || 3);
    const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    for (let i = totalMeses - 1; i >= 0; i -= 1) {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() - i);
      meses.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
    }

    const regra = await getRegraPadrao();
    const instrutores = q.instrutor ? [q.instrutor] : await listarInstrutoresConhecidos();

    const linhasPorMes = [];
    for (const { ano, mes } of meses) {
      const itens = await getCapacidadeVsRealizado({ ano, mes, instrutor: q.instrutor || undefined });
      const capacidadeNominal = itens.reduce((acc, i) => acc + i.capacidade_horas, 0);
      const hcRealizado = itens.reduce((acc, i) => acc + i.horas_realizadas, 0);
      const desvio = Number((hcRealizado - capacidadeNominal).toFixed(2));
      const ocupacaoPct = capacidadeNominal > 0 ? Number(((hcRealizado / capacidadeNominal) * 100).toFixed(1)) : 0;
      const { emoji } = statusOcupacao(capacidadeNominal > 0 ? ocupacaoPct : null);
      linhasPorMes.push({
        mes: `${ano}-${pad2(mes)}`,
        mes_extenso: new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
        capacidade_nominal: Number(capacidadeNominal.toFixed(2)),
        hc_programado: null, // não há "programado" agregado sem dupla contagem entre turmas e lançamentos avulsos
        hc_realizado: Number(hcRealizado.toFixed(2)),
        desvio,
        ocupacao_pct: ocupacaoPct,
        status_emoji: emoji,
      });
    }

    const capacidadeTotalPeriodo = linhasPorMes.reduce((acc, l) => acc + l.capacidade_nominal, 0);
    const hcRealizadoPeriodo = linhasPorMes.reduce((acc, l) => acc + l.hc_realizado, 0);
    const capacidadePorInstrutorMes = instrutores.length
      ? Number((diasUteisDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, !!regra.considerar_domingo) * Number(regra.horas_dia_padrao)).toFixed(2))
      : 0;

    const [[hcProgramadoRow]] = await pool.query(
      `SELECT COALESCE(SUM(hc_programado), 0) AS total FROM atividades_instrutor
       WHERE mes_ref IN (${meses.map(() => "?").join(",")}) AND ${tenantWhere(req.empresaId)}`,
      meses.map((m) => `${m.ano}-${pad2(m.mes)}`)
    );

    return res.json({
      ok: true,
      periodo: { meses: linhasPorMes.map((l) => l.mes), total_dias: totalMeses * 30 },
      indicadores: {
        capacidade_nominal_periodo: Number(capacidadeTotalPeriodo.toFixed(2)),
        capacidade_mensal_time: instrutores.length ? Number((capacidadePorInstrutorMes * instrutores.length).toFixed(2)) : 0,
        capacidade_por_instrutor: capacidadePorInstrutorMes,
        hc_programado_periodo: Number(hcProgramadoRow.total),
        hc_realizado_periodo: Number(hcRealizadoPeriodo.toFixed(2)),
        aderencia_geral_pct: Number(hcProgramadoRow.total) > 0
          ? Number(((hcRealizadoPeriodo / Number(hcProgramadoRow.total)) * 100).toFixed(1))
          : null,
        ocupacao_time_pct: capacidadeTotalPeriodo > 0
          ? Number(((hcRealizadoPeriodo / capacidadeTotalPeriodo) * 100).toFixed(1))
          : 0,
      },
      por_mes: linhasPorMes,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar painel de capacidade.", error: error.message });
  }
}

async function getCapacityConsumido(req, res) {
  try {
    const { getCapacidadeVsRealizado } = require("../services/capacidadeResolver");
    const q = req.query || {};
    const hoje = new Date();
    const totalMeses = Number(q.meses || 3);
    const meses = [];
    const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    for (let i = totalMeses - 1; i >= 0; i -= 1) {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() - i);
      meses.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
    }

    const instrutores = await listarInstrutoresConhecidos();
    const porInstrutor = new Map(instrutores.map((nome) => [nome, { instrutor: nome, meses: {}, total_90d: 0, capacidade_90d: 0 }]));

    for (const { ano, mes } of meses) {
      const itens = await getCapacidadeVsRealizado({ ano, mes });
      for (const item of itens) {
        const linha = porInstrutor.get(item.instrutor);
        if (!linha) continue;
        linha.meses[`${ano}-${pad2(mes)}`] = item.horas_realizadas;
        linha.total_90d += item.horas_realizadas;
        linha.capacidade_90d += item.capacidade_horas;
      }
    }

    const linhas = Array.from(porInstrutor.values()).map((linha) => ({
      ...linha,
      total_90d: Number(linha.total_90d.toFixed(2)),
      capacidade_90d: Number(linha.capacidade_90d.toFixed(2)),
      ocupacao_pct: linha.capacidade_90d > 0 ? Number(((linha.total_90d / linha.capacidade_90d) * 100).toFixed(1)) : 0,
    }));

    return res.json({ ok: true, meses: meses.map((m) => `${m.ano}-${pad2(m.mes)}`), itens: linhas });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar capacity x consumido.", error: error.message });
  }
}

async function getRanking(req, res) {
  try {
    const { getCapacidadeVsRealizado } = require("../services/capacidadeResolver");
    const q = req.query || {};
    const totalMeses = Number(q.meses || 3);
    const hoje = new Date();
    const meses = [];
    const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    for (let i = totalMeses - 1; i >= 0; i -= 1) {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() - i);
      meses.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
    }

    const acumulado = new Map();
    for (const { ano, mes } of meses) {
      const itens = await getCapacidadeVsRealizado({ ano, mes });
      for (const item of itens) {
        const atual = acumulado.get(item.instrutor) || { instrutor: item.instrutor, horas: 0, capacidade: 0 };
        atual.horas += item.horas_realizadas;
        atual.capacidade += item.capacidade_horas;
        acumulado.set(item.instrutor, atual);
      }
    }

    const ranking = Array.from(acumulado.values())
      .map((item) => ({
        instrutor: item.instrutor,
        horas_realizadas: Number(item.horas.toFixed(2)),
        pct_capacidade: item.capacidade > 0 ? Number(((item.horas / item.capacidade) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.horas_realizadas - a.horas_realizadas)
      .map((item, index) => ({ posicao: index + 1, ...item }));

    return res.json({ ok: true, itens: ranking });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar ranking de instrutores.", error: error.message });
  }
}

async function getAderenciaPorTema(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         tema,
         COUNT(*) AS qtd_atividades,
         COALESCE(SUM(hc_programado), 0) AS hc_programado,
         COALESCE(SUM(hc_realizado), 0) AS hc_realizado
       FROM atividades_instrutor
       WHERE ${tenantWhere(req.empresaId)}
       GROUP BY tema
       ORDER BY hc_realizado DESC`
    );

    const itens = rows.map((r) => {
      const programado = Number(r.hc_programado);
      const realizado = Number(r.hc_realizado);
      const aderencia = programado > 0 ? Number(((realizado / programado) * 100).toFixed(1)) : null;
      return {
        tema: r.tema,
        qtd_atividades: Number(r.qtd_atividades),
        hc_programado: programado,
        hc_realizado: realizado,
        aderencia_pct: aderencia,
      };
    });

    return res.json({ ok: true, itens });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar aderência por tema.", error: error.message });
  }
}

async function getDistribuicaoPorCelula(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         COALESCE(NULLIF(celula, ''), 'Outro') AS celula,
         COALESCE(SUM(hc_realizado), 0) AS horas
       FROM atividades_instrutor
       WHERE ${tenantWhere(req.empresaId)}
       GROUP BY COALESCE(NULLIF(celula, ''), 'Outro')`
    );

    const total = rows.reduce((acc, r) => acc + Number(r.horas), 0);
    const itens = rows
      .map((r) => ({
        celula: r.celula,
        horas: Number(r.horas),
        pct_sobre_total: total > 0 ? Number(((Number(r.horas) / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.horas - a.horas);

    return res.json({ ok: true, itens, total_horas: Number(total.toFixed(2)) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar distribuição por célula.", error: error.message });
  }
}

async function getAlertas(req, res) {
  try {
    const { getCapacidadeVsRealizado } = require("../services/capacidadeResolver");
    const hoje = new Date();
    const itens = await getCapacidadeVsRealizado({ ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 });
    const alertas = itens
      .filter((item) => item.status_ocupacao !== "saudavel")
      .map((item) => ({
        instrutor: item.instrutor,
        ocupacao_pct: item.ocupacao_pct,
        status: item.status_ocupacao,
        status_emoji: item.status_emoji,
      }))
      .sort((a, b) => (b.ocupacao_pct || 0) - (a.ocupacao_pct || 0));

    return res.json({ ok: true, itens: alertas, todos: itens });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar alertas de ocupação.", error: error.message });
  }
}

module.exports = {
  listar,
  criar,
  atualizar,
  excluir,
  getPainel,
  getCapacityConsumido,
  getRanking,
  getAderenciaPorTema,
  getDistribuicaoPorCelula,
  getAlertas,
};
