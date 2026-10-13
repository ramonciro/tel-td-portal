const db = require("../lib/db");
const { filtroTenant } = require("./oficinaTalentosController");

// Oficina de Talentos — Fase 3: promoção e indicadores (13/10/2026).
//
// Funil pedido pelo Ramon: inscritos → concluintes → promovidos (e para qual
// cargo). Definições usadas aqui (e mostradas na tela):
//  - Inscritos:     toda inscrição registrada (qualquer situação).
//  - Participantes: inscrição confirmada ou concluída (ocupou vaga e foi aceita).
//  - Concluintes:   inscrição "concluído" = certificado emitido (participação +
//                   presença mínima + carga horária — regra da Fase 2).
//  - Promovidos:    concluintes com promovido_em preenchido pela Metodologia.
// A promoção só pode ser registrada em inscrição concluída, para o funil nunca
// ter mais promovidos do que concluintes.

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v) {
  if (!DATA_ISO.test(String(v || ""))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

// Rótulo do cargo almejado: "Outro" vira o texto livre digitado.
function cargoAlmejadoRotulo(cargo, outro) {
  const base = String(cargo || "").trim();
  if (base.toLowerCase() === "outro") return String(outro || "").trim() || "Outro";
  return base || "Não informado";
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/* ───────────────────── Registrar / desfazer promoção ───────────────────── */

// PUT /api/oficina-talentos/inscricoes/:id/promocao
// body: { promovido: true, cargo_promovido, data, observacao } | { promovido: false }
async function registrarPromocao(req, res) {
  try {
    const { promovido, cargo_promovido, data, observacao } = req.body || {};

    const tenant = filtroTenant(req, "t");
    const [rows] = await db.query(
      `SELECT i.id, i.status, i.cargo_almejado, i.cargo_almejado_outro,
              DATE_FORMAT(t.data_inicio, '%Y-%m-%d') AS turma_inicio
       FROM oficina_inscricoes i JOIN oficina_turmas t ON t.id = i.turma_id
       WHERE i.id = ?${tenant.sql}`,
      [req.params.id, ...tenant.params]
    );
    const inscricao = rows[0];
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada." });

    if (promovido === false) {
      await db.query(
        `UPDATE oficina_inscricoes
         SET promovido_em = NULL, cargo_promovido = NULL, promocao_obs = NULL, promovido_por_id = NULL
         WHERE id = ?`,
        [inscricao.id]
      );
      return res.json({ ok: true, promovido: false });
    }

    if (inscricao.status !== "concluido") {
      return res.status(409).json({
        error: "A promoção só pode ser registrada para quem concluiu a oficina (certificado emitido).",
      });
    }

    const cargo = String(cargo_promovido || "").trim().slice(0, 150);
    if (!cargo) return res.status(400).json({ error: "Informe o cargo assumido na promoção." });

    const dataPromocao = data ? String(data) : hojeISO();
    if (!dataValida(dataPromocao)) return res.status(400).json({ error: "Data da promoção inválida." });
    if (inscricao.turma_inicio && dataPromocao < inscricao.turma_inicio) {
      return res.status(400).json({ error: "A data da promoção não pode ser anterior ao início da oficina." });
    }

    const obs = String(observacao || "").trim().slice(0, 255) || null;
    await db.query(
      `UPDATE oficina_inscricoes
       SET promovido_em = ?, cargo_promovido = ?, promocao_obs = ?, promovido_por_id = ?
       WHERE id = ?`,
      [dataPromocao, cargo, obs, req.user?.id ?? null, inscricao.id]
    );
    res.json({ ok: true, promovido: true, promovido_em: dataPromocao, cargo_promovido: cargo, promocao_obs: obs });
  } catch (error) {
    console.error("[oficina] registrarPromocao:", error);
    res.status(500).json({ error: "Erro ao registrar a promoção." });
  }
}

/* ───────────────────────────── Indicadores ───────────────────────────── */

// GET /api/oficina-talentos/indicadores?turma_id=&de=YYYY-MM-DD&ate=YYYY-MM-DD
// "de/ate" filtram pela data de início da turma.
async function indicadores(req, res) {
  try {
    const tenant = filtroTenant(req, "t");
    const where = [`1=1${tenant.sql}`];
    const params = [...tenant.params];

    if (req.query.turma_id) {
      where.push("t.id = ?");
      params.push(Number(req.query.turma_id) || 0);
    }
    if (req.query.de) {
      if (!dataValida(req.query.de)) return res.status(400).json({ error: "Data inicial inválida." });
      where.push("t.data_inicio >= ?");
      params.push(req.query.de);
    }
    if (req.query.ate) {
      if (!dataValida(req.query.ate)) return res.status(400).json({ error: "Data final inválida." });
      where.push("t.data_inicio <= ?");
      params.push(req.query.ate);
    }

    const [rows] = await db.query(
      `SELECT i.id, i.turma_id, i.status, i.cargo_almejado, i.cargo_almejado_outro,
              DATE_FORMAT(i.promovido_em, '%Y-%m-%d') AS promovido_em, i.cargo_promovido,
              t.nome AS turma_nome, DATE_FORMAT(t.data_inicio, '%Y-%m-%d') AS turma_inicio,
              DATE_FORMAT(t.data_fim, '%Y-%m-%d') AS turma_fim, t.status AS turma_status
       FROM oficina_inscricoes i
       JOIN oficina_turmas t ON t.id = i.turma_id
       WHERE ${where.join(" AND ")}
       ORDER BY t.data_inicio DESC, t.id DESC`,
      params
    );

    const PARTICIPANTE = new Set(["confirmado", "concluido"]);
    const novoBloco = () => ({ inscritos: 0, participantes: 0, concluintes: 0, promovidos: 0 });
    const somar = (b, r) => {
      b.inscritos += 1;
      if (PARTICIPANTE.has(r.status)) b.participantes += 1;
      if (r.status === "concluido") b.concluintes += 1;
      if (r.status === "concluido" && r.promovido_em) b.promovidos += 1;
    };

    const funil = novoBloco();
    const situacoes = { lista_espera: 0, em_conferencia: 0, cancelado: 0, desistente: 0 };
    const porCargo = new Map();
    const porTurma = new Map();
    const promovidosPorCargo = new Map();
    const intervalos = [];
    let promovidosNoCargoAlmejado = 0;

    for (const r of rows) {
      somar(funil, r);
      if (r.status in situacoes) situacoes[r.status] += 1;

      const rotulo = cargoAlmejadoRotulo(r.cargo_almejado, r.cargo_almejado_outro);
      const chaveCargo = norm(rotulo);
      if (!porCargo.has(chaveCargo)) porCargo.set(chaveCargo, { cargo: rotulo, ...novoBloco(), no_cargo_almejado: 0 });
      somar(porCargo.get(chaveCargo), r);

      if (!porTurma.has(r.turma_id)) {
        porTurma.set(r.turma_id, {
          turma_id: r.turma_id,
          nome: r.turma_nome,
          data_inicio: r.turma_inicio,
          status: r.turma_status,
          ...novoBloco(),
        });
      }
      somar(porTurma.get(r.turma_id), r);

      if (r.status === "concluido" && r.promovido_em) {
        const cargoProm = String(r.cargo_promovido || "").trim() || "Não informado";
        const k = norm(cargoProm);
        if (!promovidosPorCargo.has(k)) promovidosPorCargo.set(k, { cargo: cargoProm, total: 0 });
        promovidosPorCargo.get(k).total += 1;

        if (norm(r.cargo_promovido) === chaveCargo) {
          promovidosNoCargoAlmejado += 1;
          porCargo.get(chaveCargo).no_cargo_almejado += 1;
        }

        // Dias entre o fim da oficina (ou início, se não há fim) e a promoção.
        const ref = r.turma_fim || r.turma_inicio;
        if (ref) {
          const dias = Math.round((Date.parse(`${r.promovido_em}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / 86400000);
          if (Number.isFinite(dias) && dias >= 0) intervalos.push(dias);
        }
      }
    }

    const comTaxas = (b) => ({
      ...b,
      taxa_conclusao: pct(b.concluintes, b.participantes),
      taxa_promocao: pct(b.promovidos, b.concluintes),
    });

    const ordenar = (a, b) => b.inscritos - a.inscritos || String(a.cargo || a.nome).localeCompare(String(b.cargo || b.nome));

    res.json({
      definicoes: {
        inscritos: "Todas as inscrições registradas.",
        participantes: "Inscrições confirmadas ou concluídas.",
        concluintes: "Quem recebeu certificado (participação + presença mínima + carga horária).",
        promovidos: "Concluintes com promoção registrada pela Metodologia.",
      },
      funil: {
        ...comTaxas(funil),
        taxa_participacao: pct(funil.participantes, funil.inscritos),
        promovidos_no_cargo_almejado: promovidosNoCargoAlmejado,
        tempo_medio_ate_promocao_dias: intervalos.length
          ? Math.round(intervalos.reduce((a, n) => a + n, 0) / intervalos.length)
          : null,
      },
      situacoes,
      por_cargo_almejado: [...porCargo.values()].map(comTaxas).sort(ordenar),
      por_turma: [...porTurma.values()].map(comTaxas),
      promovidos_por_cargo: [...promovidosPorCargo.values()].sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    console.error("[oficina] indicadores:", error);
    res.status(500).json({ error: "Erro ao calcular os indicadores." });
  }
}

/* ─────────────── Bloco "Oficina de Talentos" no Perfil 360 ─────────────── */

// Histórico da pessoa na Oficina, sempre filtrado por pessoa_id + empresa_id.
// Quem decide se o bloco vai na resposta é o pessoasController (perfil de
// acesso): cargo almejado e promoção são dados sensíveis de carreira e o
// supervisor direto não vê (decisão de 13/10/2026).
async function blocoOficinaDaPessoa(pessoaId, empresaId) {
  const [inscricoes] = await db.query(
    `SELECT i.id AS inscricao_id, i.turma_id, i.status, i.cargo_atual, i.cargo_almejado, i.cargo_almejado_outro,
            DATE_FORMAT(i.promovido_em, '%Y-%m-%d') AS promovido_em, i.cargo_promovido, i.promocao_obs,
            i.created_at AS inscrito_em,
            t.nome AS turma_nome, DATE_FORMAT(t.data_inicio, '%Y-%m-%d') AS data_inicio,
            DATE_FORMAT(t.data_fim, '%Y-%m-%d') AS data_fim, t.presenca_minima,
            c.codigo AS certificado_codigo, c.carga_horaria AS certificado_ch,
            c.percentual_presenca AS certificado_percentual,
            DATE_FORMAT(c.emitido_em, '%Y-%m-%d') AS certificado_emitido_em
     FROM oficina_inscricoes i
     JOIN oficina_turmas t ON t.id = i.turma_id
     LEFT JOIN oficina_certificados c ON c.inscricao_id = i.id
     WHERE i.pessoa_id = ? AND t.empresa_id = ?
     ORDER BY COALESCE(t.data_inicio, DATE(i.created_at)) DESC, i.id DESC`,
    [pessoaId, empresaId]
  );
  if (!inscricoes.length) return { inscricoes: [], resumo: { inscricoes: 0, concluidas: 0, promovido: false } };

  const turmaIds = [...new Set(inscricoes.map((i) => i.turma_id))];
  const marcas = turmaIds.map(() => "?").join(",");
  const [modulos] = await db.query(
    `SELECT id, turma_id, carga_horaria FROM oficina_modulos WHERE turma_id IN (${marcas})`,
    turmaIds
  );
  const inscIds = inscricoes.map((i) => i.inscricao_id);
  const [presencas] = await db.query(
    `SELECT inscricao_id, modulo_id FROM oficina_presencas WHERE inscricao_id IN (${inscIds.map(() => "?").join(",")})`,
    inscIds
  );

  const modulosPorTurma = new Map();
  modulos.forEach((m) => {
    if (!modulosPorTurma.has(m.turma_id)) modulosPorTurma.set(m.turma_id, []);
    modulosPorTurma.get(m.turma_id).push(m);
  });
  const presentesPorInsc = new Map();
  presencas.forEach((p) => {
    if (!presentesPorInsc.has(p.inscricao_id)) presentesPorInsc.set(p.inscricao_id, new Set());
    presentesPorInsc.get(p.inscricao_id).add(p.modulo_id);
  });

  const itens = inscricoes.map((i) => {
    const mods = modulosPorTurma.get(i.turma_id) || [];
    const temCh = mods.some((m) => Number(m.carga_horaria) > 0);
    const peso = (m) => (temCh ? Number(m.carga_horaria) || 0 : 1);
    const total = mods.reduce((a, m) => a + peso(m), 0);
    const presentes = presentesPorInsc.get(i.inscricao_id) || new Set();
    const feito = mods.filter((m) => presentes.has(m.id)).reduce((a, m) => a + peso(m), 0);
    const percentual = total > 0 ? Math.round((feito / total) * 10000) / 100 : null;
    return {
      inscricao_id: i.inscricao_id,
      turma_id: i.turma_id,
      turma_nome: i.turma_nome,
      data_inicio: i.data_inicio,
      data_fim: i.data_fim,
      status: i.status,
      cargo_atual: i.cargo_atual,
      cargo_almejado: cargoAlmejadoRotulo(i.cargo_almejado, i.cargo_almejado_outro),
      modulos_total: mods.length,
      modulos_presentes: mods.filter((m) => presentes.has(m.id)).length,
      percentual_presenca: percentual,
      presenca_minima: Number(i.presenca_minima),
      certificado: i.certificado_codigo
        ? {
            codigo: i.certificado_codigo,
            carga_horaria: i.certificado_ch === null ? null : Number(i.certificado_ch),
            emitido_em: i.certificado_emitido_em,
          }
        : null,
      promocao: i.promovido_em
        ? { data: i.promovido_em, cargo: i.cargo_promovido, observacao: i.promocao_obs }
        : null,
    };
  });

  return {
    inscricoes: itens,
    resumo: {
      inscricoes: itens.length,
      concluidas: itens.filter((i) => i.status === "concluido").length,
      promovido: itens.some((i) => i.promocao),
    },
  };
}

module.exports = { registrarPromocao, indicadores, blocoOficinaDaPessoa, cargoAlmejadoRotulo };
