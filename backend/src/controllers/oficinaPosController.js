/**
 * oficinaPosController.js — Oficina de Talentos: depois do encontro (21/10/2026)
 *
 * Reúne o que a Metodologia acompanha depois que a turma acontece:
 *  - Avaliação de reação por módulo (nota 1 a 5 + comentário), respondida pelo
 *    próprio participante na página pública. Para a gestão ela é ANÔNIMA:
 *    aparecem médias, distribuição e comentários, nunca o nome de quem avaliou.
 *  - Acompanhamento pós-oficina aos 30, 60 e 90 dias do fim da turma, para quem
 *    concluiu (certificado emitido): o gestor diz se a pessoa evoluiu, manteve
 *    ou precisa de apoio.
 *  - Banco de talentos: concluintes ainda não promovidos, com o cargo almejado
 *    e as RPs abertas do R&S que combinam com ele (só cargo, local e prazo).
 *
 * Acesso: só perfil metodologia (montado em index.js junto das demais rotas da Oficina).
 */
const db = require("../lib/db");
const { buscarTurma, filtroTenant } = require("./oficinaTalentosController");
const { cargoAlmejadoRotulo } = require("./oficinaIndicadoresController");

const MARCOS = [30, 60, 90];
const RESULTADOS = ["evoluiu", "manteve", "precisa_apoio"];
const STATUS_ACOMP = ["pendente", "realizado", "dispensado"];

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
const somarDias = (iso, d) => {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

/* ───────────────────────── Avaliação de reação ───────────────────────── */

// GET /api/oficina-talentos/reacoes?turma_id=
async function reacoes(req, res) {
  try {
    const turma = await buscarTurma(req, Number(req.query.turma_id));
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const [modulos] = await db.query(
      `SELECT id, ordem, titulo, DATE_FORMAT(data, '%Y-%m-%d') AS data FROM oficina_modulos WHERE turma_id = ? ORDER BY ordem, id`,
      [turma.id]
    );
    const [pres] = await db.query(`SELECT modulo_id, COUNT(*) AS n FROM oficina_presencas WHERE turma_id = ? GROUP BY modulo_id`, [turma.id]);
    const [reac] = await db.query(
      `SELECT modulo_id, nota, comentario, DATE_FORMAT(created_at, '%Y-%m-%d') AS dia FROM oficina_reacoes WHERE turma_id = ? ORDER BY created_at DESC`,
      [turma.id]
    );
    const presentes = new Map(pres.map((p) => [Number(p.modulo_id), Number(p.n)]));
    let somaGeral = 0, totalGeral = 0;
    const lista = modulos.map((m) => {
      const rs = reac.filter((r) => Number(r.modulo_id) === Number(m.id));
      const dist = [1, 2, 3, 4, 5].map((n) => rs.filter((r) => r.nota === n).length);
      const soma = rs.reduce((a, r) => a + r.nota, 0);
      somaGeral += soma; totalGeral += rs.length;
      const pres_m = presentes.get(Number(m.id)) || 0;
      return {
        id: m.id, titulo: m.titulo, data: m.data, presentes: pres_m, respostas: rs.length,
        taxa_resposta: pres_m ? Math.round((rs.length / pres_m) * 100) : null,
        media: rs.length ? Math.round((soma / rs.length) * 10) / 10 : null,
        distribuicao: dist,
        comentarios: rs.filter((r) => r.comentario).map((r) => ({ nota: r.nota, texto: r.comentario, dia: r.dia })),
      };
    });
    res.json({
      turma: { id: turma.id, nome: turma.nome, token: turma.token },
      geral: { respostas: totalGeral, media: totalGeral ? Math.round((somaGeral / totalGeral) * 10) / 10 : null },
      modulos: lista,
    });
  } catch (e) {
    console.error("[oficina] reacoes:", e);
    res.status(500).json({ error: "Erro ao carregar as avaliações dos módulos." });
  }
}

/* ───────────────────── Acompanhamento 30/60/90 dias ───────────────────── */

// Cria as linhas que faltam para quem concluiu (idempotente: UNIQUE por inscrição + marco).
async function sincronizarAcompanhamentos(empresaId) {
  await db.query(
    `INSERT IGNORE INTO oficina_acompanhamentos (empresa_id, turma_id, inscricao_id, marco, data_prevista)
     SELECT i.empresa_id, i.turma_id, i.id, m.marco, DATE_ADD(COALESCE(t.data_fim, t.data_inicio), INTERVAL m.marco DAY)
       FROM oficina_inscricoes i
       JOIN oficina_turmas t ON t.id = i.turma_id
       JOIN (SELECT 30 AS marco UNION ALL SELECT 60 UNION ALL SELECT 90) m
      WHERE i.status = 'concluido' AND COALESCE(t.data_fim, t.data_inicio) IS NOT NULL
        ${empresaId ? "AND t.empresa_id = ?" : ""}`,
    empresaId ? [empresaId] : []
  );
}

function situacaoDoAcomp(a, hoje) {
  if (a.status === "realizado") return "realizado";
  if (a.status === "dispensado") return "dispensado";
  if (a.data_prevista < hoje) return "atrasado";
  if (a.data_prevista <= somarDias(hoje, 7)) return "a_vencer";
  return "futuro";
}

// GET /api/oficina-talentos/acompanhamentos?turma_id=&situacao=
async function acompanhamentos(req, res) {
  try {
    await sincronizarAcompanhamentos(req.empresaId || null);
    const tenant = filtroTenant(req, "t");
    const params = [...tenant.params];
    let filtroTurma = "";
    if (req.query.turma_id) { filtroTurma = " AND a.turma_id = ?"; params.push(Number(req.query.turma_id)); }
    const [rows] = await db.query(
      `SELECT a.id, a.turma_id, a.inscricao_id, a.marco, DATE_FORMAT(a.data_prevista, '%Y-%m-%d') AS data_prevista,
              a.status, a.resultado, a.gestor_nome, a.observacao, DATE_FORMAT(a.registrado_em, '%Y-%m-%d') AS registrado_em,
              i.nome, i.cargo_atual, t.nome AS turma_nome
         FROM oficina_acompanhamentos a
         JOIN oficina_inscricoes i ON i.id = a.inscricao_id AND i.status = 'concluido'
         JOIN oficina_turmas t ON t.id = a.turma_id
        WHERE 1=1${tenant.sql}${filtroTurma}
        ORDER BY a.data_prevista ASC, i.nome ASC, a.marco ASC`,
      params
    );
    const hoje = hojeISO();
    let itens = rows.map((a) => ({ ...a, situacao: situacaoDoAcomp(a, hoje) }));
    const resumo = { atrasado: 0, a_vencer: 0, futuro: 0, realizado: 0, dispensado: 0 };
    itens.forEach((a) => { resumo[a.situacao] += 1; });
    const filtro = String(req.query.situacao || "");
    if (filtro && resumo[filtro] !== undefined) itens = itens.filter((a) => a.situacao === filtro);
    res.json({ resumo, itens });
  } catch (e) {
    console.error("[oficina] acompanhamentos:", e);
    res.status(500).json({ error: "Erro ao carregar os acompanhamentos." });
  }
}

// PUT /api/oficina-talentos/acompanhamentos/:id  { status, resultado, gestor_nome, observacao }
async function atualizarAcompanhamento(req, res) {
  try {
    const { status, resultado, gestor_nome, observacao } = req.body || {};
    if (!STATUS_ACOMP.includes(status)) return res.status(400).json({ error: "Situação inválida." });
    if (status === "realizado" && !RESULTADOS.includes(resultado)) {
      return res.status(400).json({ error: "Informe o resultado: evoluiu, manteve ou precisa de apoio." });
    }
    const tenant = filtroTenant(req, "t");
    const [rows] = await db.query(
      `SELECT a.id FROM oficina_acompanhamentos a JOIN oficina_turmas t ON t.id = a.turma_id WHERE a.id = ?${tenant.sql}`,
      [Number(req.params.id), ...tenant.params]
    );
    if (!rows.length) return res.status(404).json({ error: "Acompanhamento não encontrado." });
    const feito = status !== "pendente";
    await db.query(
      `UPDATE oficina_acompanhamentos
          SET status = ?, resultado = ?, gestor_nome = ?, observacao = ?,
              registrado_por_id = ?, registrado_em = ${feito ? "NOW()" : "NULL"}
        WHERE id = ?`,
      [status, status === "realizado" ? resultado : null, String(gestor_nome || "").trim().slice(0, 150) || null,
        String(observacao || "").trim().slice(0, 1000) || null, feito ? req.user?.id ?? null : null, Number(req.params.id)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[oficina] atualizarAcompanhamento:", e);
    res.status(500).json({ error: "Erro ao salvar o acompanhamento." });
  }
}

/* ─────────────────────────── Banco de talentos ─────────────────────────── */

function combina(cargoAlmejado, cargoRp) {
  const a = semAcento(cargoAlmejado), b = semAcento(cargoRp);
  if (!a || !b || a === "nao informado") return false;
  return (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

// GET /api/oficina-talentos/banco-talentos?turma_id=
async function bancoTalentos(req, res) {
  try {
    const tenant = filtroTenant(req, "t");
    const params = [...tenant.params];
    let filtroTurma = "";
    if (req.query.turma_id) { filtroTurma = " AND i.turma_id = ?"; params.push(Number(req.query.turma_id)); }
    const [rows] = await db.query(
      `SELECT i.id, i.nome, i.cargo_atual, i.cargo_almejado, i.cargo_almejado_outro, i.turma_id, t.nome AS turma_nome,
              c.percentual_presenca, DATE_FORMAT(c.emitido_em, '%Y-%m-%d') AS concluido_em
         FROM oficina_inscricoes i
         JOIN oficina_turmas t ON t.id = i.turma_id
         LEFT JOIN oficina_certificados c ON c.inscricao_id = i.id
        WHERE i.status = 'concluido' AND i.promovido_em IS NULL${tenant.sql}${filtroTurma}
        ORDER BY c.emitido_em DESC, i.nome`,
      params
    );

    let rps = [];
    if (req.empresaId) {
      try {
        [rps] = await db.query(
          `SELECT id, produto, cargo, site, setor, hcs,
                  DATEDIFF(CURDATE(), COALESCE(data_recebimento, mes_referencia)) AS dias
             FROM rps
            WHERE empresa_id = ? AND excluido_em IS NULL AND status = 'EM ANDAMENTO'`,
          [req.empresaId]
        );
      } catch (_) { rps = []; }
    }

    const talentos = rows.map((r) => {
      const cargo = cargoAlmejadoRotulo(r.cargo_almejado, r.cargo_almejado_outro);
      const vagas = rps.filter((p) => combina(cargo, p.cargo) || combina(cargo, p.produto))
        .sort((a, b) => Number(b.dias) - Number(a.dias)).slice(0, 3)
        .map((p) => ({ id: p.id, cargo: p.cargo || p.produto, site: p.site, setor: p.setor === "OPERACIONAL" ? "Operacional" : "Estratégico", dias: Number(p.dias) || 0 }));
      return {
        inscricao_id: r.id, nome: r.nome, cargo_atual: r.cargo_atual, cargo_almejado: cargo,
        turma_id: r.turma_id, turma_nome: r.turma_nome,
        presenca_pct: r.percentual_presenca === null ? null : Number(r.percentual_presenca), concluido_em: r.concluido_em,
        vagas_compativeis: vagas,
      };
    });
    res.json({
      total: talentos.length,
      com_vaga_compativel: talentos.filter((t) => t.vagas_compativeis.length).length,
      rps_abertas: rps.length,
      talentos,
    });
  } catch (e) {
    console.error("[oficina] bancoTalentos:", e);
    res.status(500).json({ error: "Erro ao carregar o banco de talentos." });
  }
}

/* ───────────────────────── Alertas (sino e tela) ───────────────────────── */

// Devolve avisos prontos para o sino (services/avisosService.js) — calculados por empresa.
async function alertasOficina(empresaId) {
  if (!empresaId) return [];
  const out = [];
  const hoje = hojeISO();
  const [turmas] = await db.query(
    `SELECT t.id, t.nome, t.vagas, t.status, DATE_FORMAT(t.inscricoes_ate, '%Y-%m-%d') AS inscricoes_ate,
            (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status IN ('confirmado','em_conferencia','concluido')) AS ocupadas,
            (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status = 'lista_espera') AS espera,
            (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status = 'em_conferencia') AS conferencia
       FROM oficina_turmas t
      WHERE t.empresa_id = ? AND t.status IN ('inscricoes_abertas','inscricoes_encerradas','em_andamento')`,
    [empresaId]
  );

  const vagaAberta = turmas.filter((t) => t.vagas !== null && Number(t.ocupadas) < t.vagas && Number(t.espera) > 0);
  if (vagaAberta.length) {
    out.push({ chave: "oficina-vaga-aberta", tipo: "oficina", gravidade: "atencao", valor: vagaAberta.length,
      titulo: `${vagaAberta.length === 1 ? "Turma com vaga aberta e lista de espera" : vagaAberta.length + " turmas com vaga aberta e lista de espera"}`,
      mensagem: vagaAberta.slice(0, 2).map((t) => `${t.nome}: ${t.espera} aguardando`).join(" · "), link: "/oficina-talentos" });
  }
  const conf = turmas.reduce((a, t) => a + Number(t.conferencia), 0);
  if (conf) {
    out.push({ chave: "oficina-conferencia", tipo: "oficina", gravidade: "info", valor: conf,
      titulo: `${conf} ${conf === 1 ? "inscrição aguardando conferência" : "inscrições aguardando conferência"}`,
      mensagem: "Matrícula/CPF não bateram ou o cargo está fora da lista elegível.", link: "/oficina-talentos" });
  }
  const poucas = turmas.filter((t) => t.status === "inscricoes_abertas" && t.vagas && t.inscricoes_ate
    && t.inscricoes_ate >= hoje && t.inscricoes_ate <= somarDias(hoje, 3) && Number(t.ocupadas) / t.vagas < 0.7);
  if (poucas.length) {
    out.push({ chave: "oficina-poucas-inscricoes", tipo: "oficina", gravidade: "atencao", valor: poucas.length,
      titulo: `${poucas.length === 1 ? "Inscrições terminam em até 3 dias com vagas sobrando" : poucas.length + " turmas terminam as inscrições em até 3 dias com vagas sobrando"}`,
      mensagem: poucas.slice(0, 2).map((t) => `${t.nome}: ${t.ocupadas}/${t.vagas}`).join(" · "), link: "/oficina-talentos" });
  }

  // Risco de desistência: confirmados que não foram ao primeiro módulo já realizado.
  const emAndamento = turmas.filter((t) => t.status === "em_andamento");
  let faltaram = 0; const nomesFaltaram = [];
  for (const t of emAndamento) {
    const [mod] = await db.query(
      `SELECT id FROM oficina_modulos WHERE turma_id = ? AND data IS NOT NULL AND data < ? ORDER BY data, ordem, id LIMIT 1`, [t.id, hoje]
    );
    if (!mod.length) continue;
    const [[r]] = await db.query(
      `SELECT COUNT(*) AS n FROM oficina_inscricoes i
        WHERE i.turma_id = ? AND i.status = 'confirmado'
          AND NOT EXISTS (SELECT 1 FROM oficina_presencas p WHERE p.modulo_id = ? AND p.inscricao_id = i.id)`,
      [t.id, mod[0].id]
    );
    if (Number(r.n)) { faltaram += Number(r.n); nomesFaltaram.push(`${t.nome}: ${r.n}`); }
  }
  if (faltaram) {
    out.push({ chave: "oficina-risco-desistencia", tipo: "oficina", gravidade: "atencao", valor: faltaram,
      titulo: `${faltaram} ${faltaram === 1 ? "confirmado faltou" : "confirmados faltaram"} ao primeiro módulo`,
      mensagem: `Risco de desistência — vale um contato. ${nomesFaltaram.slice(0, 2).join(" · ")}`, link: "/oficina-talentos" });
  }

  await sincronizarAcompanhamentos(empresaId);
  const [[atr]] = await db.query(
    `SELECT COUNT(*) AS n FROM oficina_acompanhamentos a JOIN oficina_inscricoes i ON i.id = a.inscricao_id AND i.status = 'concluido'
      WHERE a.empresa_id = ? AND a.status = 'pendente' AND a.data_prevista < ?`, [empresaId, hoje]
  );
  if (Number(atr.n)) {
    out.push({ chave: "oficina-acomp-atrasado", tipo: "oficina", gravidade: "atencao", valor: Number(atr.n),
      titulo: `${atr.n} ${Number(atr.n) === 1 ? "acompanhamento pós-oficina atrasado" : "acompanhamentos pós-oficina atrasados"}`,
      mensagem: "Retornos de 30/60/90 dias com o gestor ainda pendentes.", link: "/oficina-talentos" });
  }
  return out;
}

module.exports = {
  reacoes, acompanhamentos, atualizarAcompanhamento, bancoTalentos, alertasOficina,
  sincronizarAcompanhamentos, MARCOS,
};
