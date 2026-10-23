/**
 * conteudoController.js — Produção de conteúdo (22/10/2026, pedido do Ramon)
 *
 * Substitui a planilha "Acompanhamento Analistas Conteudo". Regras decididas
 * com o Ramon:
 *  - O analista escolhe, por pedido, quem valida: Cliente (encaminhado por
 *    e-mail, controle fora do portal) ou Coordenação (interno).
 *  - Tempo por botões Iniciar/Concluir: o portal grava o horário no clique.
 *    Lançamento retroativo só com justificativa, e fica marcado "retroativo".
 *  - Analista vê TODOS os pedidos e edita só os seus. Coordenador, supervisor
 *    e assistente de treinamento veem e editam tudo. Superintendente só lê.
 *  - Prazo fixo por tipo (catálogo editado pela coordenação), em horas úteis.
 *    O tempo com o validador (espera do cliente) é medido à parte e não conta
 *    contra o analista.
 *  - Histórico da planilha: importado; os registros inconsistentes entram com
 *    revisao = 'pendente' e só contam nos indicadores depois de revisados.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { tenantScopeFor } = require("../lib/tenantScope");
const { registrarAuditoria } = require("../services/auditoria");
const C = require("../lib/conteudo");

const GESTAO = ["coordenador", "supervisor", "assistente_treinamento", "super_admin"];
const chave = (s) => String(s || "").trim().toLowerCase();
const perfilDe = (req) => chave(req.user?.perfil);
const ehGestao = (req) => GESTAO.includes(perfilDe(req));
const ehAnalista = (req) => perfilDe(req) === "analista_conteudo";
const erro = (res, status, msg, extra = {}) => res.status(status).json({ ok: false, message: msg, error: msg, ...extra });

const TIPOS_PADRAO = [
  // nome, criação h, validação h, postagem h, pontos  (prazos = P75 do histórico, em horas úteis)
  ["Cards para Reforço", 1, 0.5, 0.5, 1],
  ["Material para Postagem", 4, 0.5, 0.5, 2],
  ["Roteiro de Vídeo", 1, 0.5, 0.5, 2],
  ["Avaliações", 14, 1, 1, 5],
  ["Scripts de Atendimento", 9, 7, 0.5, 5],
  ["Material de Reciclagem", 9, 1, 1, 6],
  ["Material para Treinamento", 18, 2, 1, 8],
  ["Base de Soluções", 0, 0, 0, 3],
];

function escopo(req) {
  return tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
}
const filtroEmpresa = (empresaId, alias = "") =>
  empresaId ? { sql: ` AND ${alias}empresa_id = ?`, params: [empresaId] } : { sql: "", params: [] };

const FMT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

const SELECT_PEDIDO = `
  SELECT p.id, p.empresa_id, p.codigo_legado, p.cliente, p.tipo_id,
         COALESCE(t.nome, p.tipo_nome) AS tipo, p.titulo, p.descricao, p.solicitante,
         p.analista_id, p.analista_nome, ${FMT("p.aberto_em")} AS aberto_em,
         p.validador_tipo, p.status, p.origem, p.revisao, p.revisao_motivo,
         DATE_FORMAT(p.lembrar_em, '%Y-%m-%d') AS lembrar_em,
         ${FMT("p.concluido_em")} AS concluido_em, ${FMT("p.cancelado_em")} AS cancelado_em,
         p.cancelado_motivo, p.criado_por_id, p.treinamento_id, p.serie_id,
         s.nome AS serie_nome, tr.tema AS turma_tema, tr.cliente AS turma_cliente,
         DATE_FORMAT(COALESCE(tr.data_fim, tr.data_inicio, tr.data), '%Y-%m-%d') AS turma_fim,
         t.prazo_criacao_h, t.prazo_validacao_h, t.prazo_postagem_h, t.pontos
    FROM conteudo_pedidos p
    LEFT JOIN conteudo_tipos t ON t.id = p.tipo_id
    LEFT JOIN conteudo_series s ON s.id = p.serie_id
    LEFT JOIN treinamentos tr ON tr.id = p.treinamento_id`;

const SELECT_ETAPA = `
  SELECT e.id, e.pedido_id, e.etapa, e.rodada, ${FMT("e.inicio")} AS inicio, ${FMT("e.fim")} AS fim,
         e.resultado, e.retroativo, e.justificativa, e.observacao, e.usuario_id, u.nome AS usuario_nome
    FROM conteudo_etapas e
    LEFT JOIN usuarios u ON u.id = e.usuario_id`;

/* ---------------------------------------------------------------- permissões */

function souDono(req, p) {
  if (p.analista_id) return Number(p.analista_id) === Number(req.user?.id);
  // Pedido importado da planilha ainda sem vínculo: compara pelo primeiro nome.
  return !!p.analista_nome && C.primeiroNome(p.analista_nome) === C.primeiroNome(req.user?.nome);
}
const podeEditar = (req, p) => ehGestao(req) || (ehAnalista(req) && souDono(req, p));

/** Liga pedidos importados (sem analista_id) ao usuário analista de mesmo nome. */
async function vincularLegado(req) {
  if (!ehAnalista(req) || !req.user?.id) return;
  const pn = C.primeiroNome(req.user.nome);
  if (!pn) return;
  const empresaId = escopo(req);
  const f = filtroEmpresa(empresaId);
  try {
    await pool.query(
      `UPDATE conteudo_pedidos SET analista_id = ?, analista_nome = ?
        WHERE analista_id IS NULL AND analista_nome IS NOT NULL
          AND LOWER(SUBSTRING_INDEX(TRIM(analista_nome), ' ', 1)) = ?${f.sql}`,
      [req.user.id, req.user.nome, pn, ...f.params]
    );
  } catch (e) {
    /* melhor esforço */
  }
}

/* -------------------------------------------------------------------- tipos */

async function garantirTipos(empresaId) {
  const [[{ n }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM conteudo_tipos WHERE ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"}`,
    empresaId ? [empresaId] : []
  );
  if (n > 0) return;
  let ordem = 0;
  for (const [nome, c, v, po, pts] of TIPOS_PADRAO) {
    await pool.query(
      `INSERT IGNORE INTO conteudo_tipos (empresa_id, nome, prazo_criacao_h, prazo_validacao_h, prazo_postagem_h, pontos, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [empresaId || null, nome, c, v, po, pts, ordem++]
    );
  }
}

async function listarTipos(req, res) {
  try {
    const empresaId = escopo(req);
    await garantirTipos(empresaId);
    const f = filtroEmpresa(empresaId);
    const [rows] = await pool.query(
      `SELECT id, nome, prazo_criacao_h, prazo_validacao_h, prazo_postagem_h, pontos, ativo, ordem
         FROM conteudo_tipos WHERE 1=1${f.sql} ORDER BY ativo DESC, ordem ASC, nome ASC`,
      f.params
    );
    const [uso] = await pool.query(
      `SELECT tipo_id, COUNT(*) AS n FROM conteudo_pedidos WHERE tipo_id IS NOT NULL${f.sql} GROUP BY tipo_id`,
      f.params
    );
    const mapa = new Map(uso.map((u) => [u.tipo_id, Number(u.n)]));
    return res.json(
      rows.map((r) => ({
        ...r,
        prazo_criacao_h: Number(r.prazo_criacao_h),
        prazo_validacao_h: Number(r.prazo_validacao_h),
        prazo_postagem_h: Number(r.prazo_postagem_h),
        pontos: Number(r.pontos),
        ativo: Number(r.ativo),
        pedidos: mapa.get(r.id) || 0,
      }))
    );
  } catch (e) {
    console.error("[conteudo] listarTipos", e.message || e);
    return erro(res, 500, "Erro ao listar os tipos de material");
  }
}

function lerHoras(v, nome) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 999) throw Object.assign(new Error(`${nome} inválido`), { status: 400 });
  return Math.round(n * 100) / 100;
}

async function salvarTipo(req, res) {
  try {
    const empresaId = escopo(req);
    const id = req.params.id ? Number(req.params.id) : null;
    const b = req.body || {};
    const nome = String(b.nome || "").trim();
    if (!id && !nome) return erro(res, 400, "Informe o nome do tipo de material");
    if (nome.length > 120) return erro(res, 400, "Nome muito longo");
    const vals = {};
    if (nome) vals.nome = nome;
    if ("prazo_criacao_h" in b) vals.prazo_criacao_h = lerHoras(b.prazo_criacao_h, "Prazo de criação");
    if ("prazo_validacao_h" in b) vals.prazo_validacao_h = lerHoras(b.prazo_validacao_h, "Prazo de validação");
    if ("prazo_postagem_h" in b) vals.prazo_postagem_h = lerHoras(b.prazo_postagem_h, "Prazo de postagem");
    if ("pontos" in b) vals.pontos = lerHoras(b.pontos, "Pontos");
    if ("ativo" in b) vals.ativo = Number(b.ativo) ? 1 : 0;
    if ("ordem" in b) vals.ordem = Math.trunc(Number(b.ordem) || 0);

    if (!id) {
      await garantirTipos(empresaId);
      const f = filtroEmpresa(empresaId);
      const [[{ m }]] = await pool.query(`SELECT COALESCE(MAX(ordem),0)+1 AS m FROM conteudo_tipos WHERE 1=1${f.sql}`, f.params);
      const [r] = await pool.query(
        `INSERT INTO conteudo_tipos (empresa_id, nome, prazo_criacao_h, prazo_validacao_h, prazo_postagem_h, pontos, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [empresaId || null, nome, vals.prazo_criacao_h || 0, vals.prazo_validacao_h || 0, vals.prazo_postagem_h || 0, vals.pontos ?? 1, vals.ordem ?? m]
      );
      registrarAuditoria({
        usuario: req.user, acao: "criar", entidade: "conteudo_tipo", entidadeId: r.insertId,
        resumo: `Criou o tipo de material "${nome}"`, dadosDepois: vals, ip: req.ip,
      });
      return res.status(201).json({ ok: true, id: r.insertId });
    }

    const f = filtroEmpresa(empresaId);
    const [[antes]] = await pool.query(`SELECT * FROM conteudo_tipos WHERE id = ?${f.sql}`, [id, ...f.params]);
    if (!antes) return erro(res, 404, "Tipo não encontrado");
    const campos = Object.keys(vals);
    if (!campos.length) return erro(res, 400, "Nada para alterar");
    await pool.query(
      `UPDATE conteudo_tipos SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
      [...campos.map((c) => vals[c]), id]
    );
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_tipo", entidadeId: id,
      resumo: `Editou o tipo de material "${antes.nome}"`, dadosAntes: antes, dadosDepois: vals, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    if (e.status) return erro(res, e.status, e.message);
    if (e.code === "ER_DUP_ENTRY") return erro(res, 409, "Já existe um tipo com esse nome");
    console.error("[conteudo] salvarTipo", e.message || e);
    return erro(res, 500, "Erro ao salvar o tipo de material");
  }
}

/* ------------------------------------------------------------ apoio de telas */

async function listarAnalistas(req, res) {
  try {
    const empresaId = escopo(req);
    const f = filtroEmpresa(empresaId);
    const [rows] = await pool.query(
      `SELECT id, nome FROM usuarios WHERE perfil = 'analista_conteudo' AND (ativo IS NULL OR ativo = 1)${f.sql} ORDER BY nome`,
      f.params
    );
    return res.json(rows);
  } catch (e) {
    console.error("[conteudo] listarAnalistas", e.message || e);
    return erro(res, 500, "Erro ao listar analistas");
  }
}

async function listarClientes(req, res) {
  try {
    const empresaId = escopo(req);
    const f = filtroEmpresa(empresaId);
    const [a] = await pool.query(`SELECT DISTINCT cliente AS nome FROM conteudo_pedidos WHERE 1=1${f.sql}`, f.params);
    let b = [];
    try {
      const [rows] = await pool.query(`SELECT nome FROM clientes WHERE (status IS NULL OR status <> 'Inativo')${f.sql} ORDER BY nome`, f.params);
      b = rows;
    } catch (e) {
      /* clientes sem empresa_id ou sem status: tenta simples */
      try {
        const [rows] = await pool.query("SELECT nome FROM clientes ORDER BY nome");
        b = rows;
      } catch (e2) { /* sem tabela */ }
    }
    const visto = new Map();
    for (const r of [...a, ...b]) {
      const n = String(r.nome || "").trim();
      if (n && !visto.has(C.sansAcento(n))) visto.set(C.sansAcento(n), n);
    }
    return res.json([...visto.values()].sort((x, y) => x.localeCompare(y, "pt-BR")));
  } catch (e) {
    console.error("[conteudo] listarClientes", e.message || e);
    return erro(res, 500, "Erro ao listar clientes");
  }
}

/** Evita "mercantil" e "Mercantil" virarem dois clientes. */
async function clienteCanonico(empresaId, nome) {
  const limpo = String(nome || "").trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  const f = filtroEmpresa(empresaId);
  const [rows] = await pool.query(
    `SELECT cliente FROM conteudo_pedidos WHERE LOWER(cliente) = LOWER(?)${f.sql} LIMIT 1`,
    [limpo, ...f.params]
  );
  return rows[0]?.cliente || limpo;
}

/* ------------------------------------------------------ enriquecimento/cálculo */

async function etapasDe(ids) {
  if (!ids.length) return new Map();
  const [rows] = await pool.query(
    `${SELECT_ETAPA} WHERE e.pedido_id IN (${ids.map(() => "?").join(",")}) ORDER BY e.pedido_id, e.id`,
    ids
  );
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.pedido_id)) mapa.set(r.pedido_id, []);
    mapa.get(r.pedido_id).push({ ...r, retroativo: Number(r.retroativo) });
  }
  return mapa;
}

const PRAZO_CAMPO = { criacao: "prazo_criacao_h", validacao: "prazo_validacao_h", postagem: "prazo_postagem_h" };

function enriquecer(p, etapas, exp, agora) {
  const prazoDe = (et) => (p[PRAZO_CAMPO[et]] === null || p[PRAZO_CAMPO[et]] === undefined ? 0 : Number(p[PRAZO_CAMPO[et]]));
  const ets = etapas.map((e) => {
    const fimOuAgora = e.fim || agora;
    const hu = C.horasUteis(e.inicio, fimOuAgora, exp);
    return {
      ...e,
      aberta: !e.fim,
      horas_uteis: hu,
      horas_corridas: C.horasCorridas(e.inicio, fimOuAgora),
      inconsistente: !!(e.inicio && fimOuAgora && hu === null),
      prazo_h: prazoDe(e.etapa),
    };
  });
  const soma = (et, fechadas = true) =>
    ets.filter((e) => e.etapa === et && (!fechadas || e.fim) && e.horas_uteis !== null).reduce((s, e) => s + e.horas_uteis, 0);
  const atual = [...ets].reverse().find((e) => e.aberta) || null;
  let farol = "neutro";
  let espera_cliente = false;
  if (atual && !C.STATUS_FINAIS.includes(p.status)) {
    if (atual.etapa === "validacao" && p.validador_tipo === "cliente") {
      farol = "espera";
      espera_cliente = true;
    } else {
      farol = C.farolDe(atual.horas_uteis, atual.prazo_h);
    }
  }
  const rodadas = Math.max(1, ...ets.filter((e) => e.etapa === "criacao").map((e) => e.rodada));
  return {
    ...p,
    prazo_criacao_h: p.prazo_criacao_h === null ? null : Number(p.prazo_criacao_h),
    prazo_validacao_h: p.prazo_validacao_h === null ? null : Number(p.prazo_validacao_h),
    prazo_postagem_h: p.prazo_postagem_h === null ? null : Number(p.prazo_postagem_h),
    pontos: p.pontos === null ? null : Number(p.pontos),
    etapas: ets,
    etapa_atual: atual
      ? {
          etapa: atual.etapa,
          rodada: atual.rodada,
          inicio: atual.inicio,
          horas_uteis: atual.horas_uteis,
          horas_corridas: atual.horas_corridas,
          dias_corridos: atual.horas_corridas === null ? null : Math.floor(atual.horas_corridas / 24),
          prazo_h: atual.prazo_h,
        }
      : null,
    farol,
    atrasado: farol === "vermelho",
    espera_cliente,
    rodadas,
    retrabalho: rodadas > 1,
    horas_criacao: Math.round(soma("criacao") * 100) / 100,
    horas_validacao: Math.round(soma("validacao") * 100) / 100,
    horas_postagem: Math.round(soma("postagem") * 100) / 100,
    conta_indicadores: p.revisao !== "pendente" && p.revisao !== "ignorado" && p.status !== "cancelado",
  };
}

function acoesDisponiveis(req, p, etapas) {
  const out = [];
  const gestao = ehGestao(req);
  const edita = podeEditar(req, p);
  const abertaDe = (et) => etapas.some((e) => e.etapa === et && !e.fim);
  const s = p.status;
  if (!p.analista_id && !p.analista_nome && ehAnalista(req) && !C.STATUS_FINAIS.includes(s)) out.push("assumir");
  const semDono = !p.analista_id && !p.analista_nome;
  if (edita || (ehAnalista(req) && semDono)) {
    if (s === "a_fazer") out.push("iniciar_criacao");
    if (s === "em_criacao" && abertaDe("criacao")) out.push("concluir_criacao");
    if (s === "em_ajustes") out.push("iniciar_ajustes");
    if (s === "validado") out.push("iniciar_postagem", "concluir_sem_postagem");
    if (s === "em_postagem" && abertaDe("postagem")) out.push("concluir_postagem");
  }
  if (s === "em_validacao") {
    const podeValidar = p.validador_tipo === "interno" ? gestao : edita;
    if (podeValidar) out.push("aprovar", "pedir_ajustes");
    if (edita) out.push("lembrar");
  }
  if (edita && !C.STATUS_FINAIS.includes(s)) out.push("cancelar");
  if (gestao && s === "cancelado") out.push("reabrir");
  return out;
}

/* -------------------------------------------------------------------- listas */

async function listarPedidos(req, res) {
  try {
    const empresaId = escopo(req);
    await vincularLegado(req);
    const q = req.query || {};
    const f = filtroEmpresa(empresaId, "p.");
    const cond = [`1=1${f.sql}`];
    const params = [...f.params];
    const esc = String(q.escopo || "abertos");
    if (esc === "abertos") cond.push(`p.status IN (${C.STATUS_ABERTOS.map(() => "?").join(",")})`), params.push(...C.STATUS_ABERTOS);
    else if (esc === "concluidos") cond.push("p.status = 'concluido'");
    else if (esc === "cancelados") cond.push("p.status = 'cancelado'");
    if (q.status && C.STATUS_TODOS.includes(String(q.status))) cond.push("p.status = ?"), params.push(String(q.status));
    if (q.analista_id) cond.push("p.analista_id = ?"), params.push(Number(q.analista_id));
    if (q.meus === "1" && req.user?.id) cond.push("p.analista_id = ?"), params.push(req.user.id);
    if (q.cliente) cond.push("LOWER(p.cliente) = LOWER(?)"), params.push(String(q.cliente));
    if (q.tipo_id) cond.push("p.tipo_id = ?"), params.push(Number(q.tipo_id));
    if (q.revisar === "1") cond.push("p.revisao = 'pendente'");
    const de = C.normalizarDataHora(q.de ? `${q.de} 00:00` : null);
    const ate = C.normalizarDataHora(q.ate ? `${q.ate} 23:59` : null);
    if (de) cond.push("p.aberto_em >= ?"), params.push(de);
    if (ate) cond.push("p.aberto_em <= ?"), params.push(ate);
    if (q.q) {
      cond.push("(p.titulo LIKE ? OR p.cliente LIKE ? OR p.analista_nome LIKE ?)");
      const like = `%${String(q.q).trim()}%`;
      params.push(like, like, like);
    }
    const limite = Math.min(Math.max(Number(q.limite) || 600, 1), 2000);
    const [rows] = await pool.query(
      `${SELECT_PEDIDO} WHERE ${cond.join(" AND ")}
        ORDER BY (p.status IN ('concluido','cancelado')) ASC, p.aberto_em DESC, p.id DESC LIMIT ${limite}`,
      params
    );
    const exp = await C.carregarExpediente(empresaId);
    const agora = C.agoraBahia();
    const mapa = await etapasDe(rows.map((r) => r.id));
    const lista = rows.map((r) => {
      const e = enriquecer(r, mapa.get(r.id) || [], exp, agora);
      const { etapas, ...resto } = e;
      return {
        ...resto,
        pode_editar: podeEditar(req, r),
        sou_dono: souDono(req, r),
        acoes: acoesDisponiveis(req, r, mapa.get(r.id) || []),
      };
    });
    return res.json(lista);
  } catch (e) {
    console.error("[conteudo] listarPedidos", e.message || e);
    return erro(res, 500, "Erro ao listar os pedidos");
  }
}

async function buscarPedido(req, id) {
  const empresaId = escopo(req);
  const f = filtroEmpresa(empresaId, "p.");
  const [rows] = await pool.query(`${SELECT_PEDIDO} WHERE p.id = ?${f.sql} LIMIT 1`, [id, ...f.params]);
  return rows[0] || null;
}

async function detalharPedido(req, res) {
  try {
    const p = await buscarPedido(req, Number(req.params.id));
    if (!p) return erro(res, 404, "Pedido não encontrado");
    const exp = await C.carregarExpediente(escopo(req));
    const mapa = await etapasDe([p.id]);
    const e = enriquecer(p, mapa.get(p.id) || [], exp, C.agoraBahia());
    return res.json({
      ...e,
      pode_editar: podeEditar(req, p),
      sou_dono: souDono(req, p),
      acoes: acoesDisponiveis(req, p, mapa.get(p.id) || []),
      expediente: exp,
    });
  } catch (e) {
    console.error("[conteudo] detalharPedido", e.message || e);
    return erro(res, 500, "Erro ao abrir o pedido");
  }
}

async function resumo(req, res) {
  try {
    const empresaId = escopo(req);
    await vincularLegado(req);
    const f = filtroEmpresa(empresaId, "p.");
    const [rows] = await pool.query(
      `${SELECT_PEDIDO} WHERE p.status IN (${C.STATUS_ABERTOS.map(() => "?").join(",")})${f.sql}`,
      [...C.STATUS_ABERTOS, ...f.params]
    );
    const exp = await C.carregarExpediente(empresaId);
    const agora = C.agoraBahia();
    const mapa = await etapasDe(rows.map((r) => r.id));
    const porStatus = Object.fromEntries(C.STATUS_ABERTOS.map((s) => [s, 0]));
    const analistas = new Map();
    let atrasados = 0;
    let semRetorno = 0;
    let lembretes = 0;
    const hoje = C.hojeBahia();
    for (const r of rows) {
      const e = enriquecer(r, mapa.get(r.id) || [], exp, agora);
      porStatus[r.status]++;
      if (e.atrasado) atrasados++;
      if (e.espera_cliente && e.etapa_atual?.dias_corridos >= 2) semRetorno++;
      if (r.lembrar_em && r.lembrar_em <= hoje && r.status === "em_validacao") lembretes++;
      const chaveA = r.analista_id ? `id:${r.analista_id}` : r.analista_nome || "Sem analista";
      const a = analistas.get(chaveA) || { analista: r.analista_nome || "Sem analista", analista_id: r.analista_id, abertos: 0, atrasados: 0 };
      a.abertos++;
      if (e.atrasado) a.atrasados++;
      analistas.set(chaveA, a);
    }
    const [[rev]] = await pool.query(
      `SELECT COUNT(*) AS n FROM conteudo_pedidos p WHERE p.revisao = 'pendente'${f.sql}`,
      f.params
    );
    const mes = hoje.slice(0, 7);
    const [[conc]] = await pool.query(
      `SELECT COUNT(*) AS n FROM conteudo_pedidos p
        WHERE p.status = 'concluido' AND DATE_FORMAT(p.concluido_em, '%Y-%m') = ?${f.sql}`,
      [mes, ...f.params]
    );
    return res.json({
      abertos: rows.length,
      por_status: porStatus,
      atrasados,
      sem_retorno_cliente: semRetorno,
      lembretes_vencidos: lembretes,
      revisar: Number(rev.n),
      concluidos_no_mes: Number(conc.n),
      por_analista: [...analistas.values()].sort((a, b) => b.abertos - a.abertos),
    });
  } catch (e) {
    console.error("[conteudo] resumo", e.message || e);
    return erro(res, 500, "Erro ao montar o resumo");
  }
}

/* ------------------------------------------------------------ criar / editar */

async function resolverAnalista(req, empresaId, body, padraoSelf) {
  if (body.analista_id) {
    const f = filtroEmpresa(empresaId);
    const [[u]] = await pool.query(
      `SELECT id, nome FROM usuarios WHERE id = ? AND perfil = 'analista_conteudo'${f.sql} LIMIT 1`,
      [Number(body.analista_id), ...f.params]
    );
    if (!u) throw Object.assign(new Error("Analista não encontrado"), { status: 400 });
    return { id: u.id, nome: u.nome };
  }
  if (padraoSelf && ehAnalista(req)) return { id: req.user.id, nome: req.user.nome };
  return { id: null, nome: null };
}

/**
 * Turma e série do pedido (Pacote 3). A turma tem de ser da mesma empresa; a série, ativa.
 * Com turma e sem série informada, usa a série do cliente da turma (se houver).
 * `parcial` = só os campos presentes no corpo (edição).
 */
async function resolverVinculo(empresaId, b, cliente, parcial = false) {
  const T = require("../lib/conteudoTbt");
  const out = {};
  const temTurma = parcial ? "treinamento_id" in b : true;
  const temSerie = parcial ? "serie_id" in b : true;
  if (temTurma) {
    const id = Number(b.treinamento_id) || 0;
    if (b.treinamento_id === null || b.treinamento_id === "" || b.treinamento_id === undefined || id === 0) {
      out.treinamento_id = null;
    } else {
      const f = filtroEmpresa(empresaId);
      const [[t]] = await pool.query(`SELECT id, cliente FROM treinamentos WHERE id = ?${f.sql} LIMIT 1`, [id, ...f.params]);
      if (!t) throw Object.assign(new Error("Turma não encontrada"), { status: 400 });
      out.treinamento_id = t.id;
      out.turma_cliente = t.cliente;
    }
  }
  if (temSerie) {
    const id = Number(b.serie_id) || 0;
    if (!id) out.serie_id = null;
    else {
      const f = filtroEmpresa(empresaId);
      const [[s]] = await pool.query(`SELECT id FROM conteudo_series WHERE id = ? AND ativo = 1${f.sql} LIMIT 1`, [id, ...f.params]);
      if (!s) throw Object.assign(new Error("Série não encontrada"), { status: 400 });
      out.serie_id = s.id;
    }
  }
  // Sem série escolhida, mas com turma: usa a série do cliente.
  if (out.treinamento_id && !b.serie_id && (!parcial || temTurma)) {
    await T.garantirSeries(empresaId);
    const s = await T.serieDoCliente(empresaId, out.turma_cliente || cliente);
    if (s) out.serie_id = s.id;
  }
  if (out.serie_id === undefined && !parcial) out.serie_id = null;
  if (out.treinamento_id === undefined && !parcial) out.treinamento_id = null;
  return out;
}

async function criarPedido(req, res) {
  try {
    const empresaId = escopo(req);
    const b = req.body || {};
    const titulo = String(b.titulo || "").trim();
    const cliente = await clienteCanonico(empresaId, b.cliente);
    if (!titulo) return erro(res, 400, "Informe o título do pedido");
    if (titulo.length > 255) return erro(res, 400, "Título muito longo");
    if (!cliente) return erro(res, 400, "Informe o cliente");
    await garantirTipos(empresaId);
    const f = filtroEmpresa(empresaId);
    const [[tipo]] = await pool.query(`SELECT id, nome FROM conteudo_tipos WHERE id = ? AND ativo = 1${f.sql}`, [Number(b.tipo_id) || 0, ...f.params]);
    if (!tipo) return erro(res, 400, "Escolha o tipo de material");
    const validador = b.validador_tipo === "interno" ? "interno" : "cliente";
    // Analista só cria pedido para si; gestão escolhe (ou deixa na fila sem dono).
    const analista = ehGestao(req)
      ? await resolverAnalista(req, empresaId, b, false)
      : await resolverAnalista(req, empresaId, {}, true);
    let aberto = C.agoraBahia();
    let retroAbertura = false;
    if (b.aberto_em) {
      const n = C.normalizarDataHora(b.aberto_em);
      if (!n) return erro(res, 400, "Data de abertura inválida");
      if (n > C.agoraBahia()) return erro(res, 400, "A abertura não pode estar no futuro");
      aberto = n;
      retroAbertura = true;
    }
    const vinculo = await resolverVinculo(empresaId, b, cliente);
    const [r] = await pool.query(
      `INSERT INTO conteudo_pedidos
         (empresa_id, cliente, tipo_id, tipo_nome, titulo, descricao, solicitante, analista_id, analista_nome,
          aberto_em, validador_tipo, status, origem, criado_por_id, treinamento_id, serie_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'a_fazer', 'portal', ?, ?, ?)`,
      [
        empresaId || null, cliente, tipo.id, tipo.nome, titulo, String(b.descricao || "").trim() || null,
        String(b.solicitante || "").trim().slice(0, 150) || null, analista.id, analista.nome, aberto, validador, req.user?.id || null,
        vinculo.treinamento_id, vinculo.serie_id,
      ]
    );
    require("../lib/conteudoTbt").limparCache();
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "conteudo_pedido", entidadeId: r.insertId,
      resumo: `Abriu o pedido "${titulo}" (${cliente}, ${tipo.nome})${retroAbertura ? " com abertura retroativa" : ""}${vinculo.treinamento_id ? ` ligado à turma #${vinculo.treinamento_id}` : ""}`, ip: req.ip,
    });
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.status) return erro(res, e.status, e.message);
    console.error("[conteudo] criarPedido", e.message || e);
    return erro(res, 500, "Erro ao criar o pedido");
  }
}

async function atualizarPedido(req, res) {
  try {
    const empresaId = escopo(req);
    const p = await buscarPedido(req, Number(req.params.id));
    if (!p) return erro(res, 404, "Pedido não encontrado");
    if (!podeEditar(req, p)) return erro(res, 403, "Você só edita os seus pedidos.");
    const b = req.body || {};
    const vals = {};
    if ("titulo" in b) {
      const t = String(b.titulo || "").trim();
      if (!t || t.length > 255) return erro(res, 400, "Título inválido");
      vals.titulo = t;
    }
    if ("descricao" in b) vals.descricao = String(b.descricao || "").trim() || null;
    if ("solicitante" in b) vals.solicitante = String(b.solicitante || "").trim().slice(0, 150) || null;
    if ("cliente" in b) {
      const c = await clienteCanonico(empresaId, b.cliente);
      if (!c) return erro(res, 400, "Informe o cliente");
      vals.cliente = c;
    }
    if ("tipo_id" in b) {
      const f = filtroEmpresa(empresaId);
      const [[t]] = await pool.query(`SELECT id, nome FROM conteudo_tipos WHERE id = ?${f.sql}`, [Number(b.tipo_id) || 0, ...f.params]);
      if (!t) return erro(res, 400, "Tipo inválido");
      vals.tipo_id = t.id;
      vals.tipo_nome = t.nome;
    }
    if ("validador_tipo" in b) {
      vals.validador_tipo = b.validador_tipo === "interno" ? "interno" : "cliente";
      if (p.status === "em_validacao" && vals.validador_tipo !== p.validador_tipo && !ehGestao(req)) {
        return erro(res, 403, "Com o pedido em validação, só a coordenação troca quem valida.");
      }
    }
    if ("analista_id" in b) {
      if (!ehGestao(req)) return erro(res, 403, "Só a coordenação troca o analista do pedido.");
      const a = await resolverAnalista(req, empresaId, b, false);
      vals.analista_id = a.id;
      vals.analista_nome = a.nome;
    }
    if ("treinamento_id" in b || "serie_id" in b) {
      const v = await resolverVinculo(empresaId, b, vals.cliente || p.cliente, true);
      if ("treinamento_id" in v) vals.treinamento_id = v.treinamento_id;
      if ("serie_id" in v) vals.serie_id = v.serie_id;
    }
    if ("aberto_em" in b) {
      if (!ehGestao(req)) return erro(res, 403, "Só a coordenação corrige a data de abertura.");
      const n = C.normalizarDataHora(b.aberto_em);
      if (!n || n > C.agoraBahia()) return erro(res, 400, "Data de abertura inválida");
      vals.aberto_em = n;
    }
    const campos = Object.keys(vals);
    if (!campos.length) return erro(res, 400, "Nada para alterar");
    await pool.query(
      `UPDATE conteudo_pedidos SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
      [...campos.map((c) => vals[c]), p.id]
    );
    require("../lib/conteudoTbt").limparCache();
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_pedido", entidadeId: p.id,
      resumo: `Editou o pedido "${p.titulo}"`, dadosAntes: Object.fromEntries(campos.map((c) => [c, p[c]])), dadosDepois: vals, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    if (e.status) return erro(res, e.status, e.message);
    console.error("[conteudo] atualizarPedido", e.message || e);
    return erro(res, 500, "Erro ao salvar o pedido");
  }
}

/**
 * Exclui um pedido FINALIZADO (concluído ou cancelado) e as suas etapas. Coordenador exclui qualquer um;
 * o analista de conteúdo, só os seus.
 * Pedido em andamento precisa ser cancelado antes. A auditoria guarda uma foto do que foi apagado.
 */
async function excluirPedido(req, res) {
  try {
    const empresaId = escopo(req);
    const id = Number(req.params.id);
    const p = await buscarPedido(req, id);
    if (!p) return erro(res, 404, "Pedido não encontrado");
    if (!(perfilDe(req) === "coordenador" || perfilDe(req) === "super_admin" || (ehAnalista(req) && souDono(req, p)))) {
      return erro(res, 403, "Você só exclui os seus pedidos.");
    }
    if (!C.STATUS_FINAIS.includes(p.status)) return erro(res, 409, "Só dá para excluir pedido concluído ou cancelado. Cancele o pedido antes.");
    const mapa = await etapasDe([p.id]);
    const etapas = (mapa.get(p.id) || []).map((e) => ({ etapa: e.etapa, rodada: e.rodada, inicio: e.inicio, fim: e.fim, resultado: e.resultado }));
    await comTransacao(async (conn) => {
      await conn.query("DELETE FROM conteudo_etapas WHERE pedido_id = ?", [p.id]);
      const f = filtroEmpresa(empresaId);
      await conn.query(`DELETE FROM conteudo_pedidos WHERE id = ?${f.sql}`, [p.id, ...f.params]);
    });
    require("../lib/conteudoTbt").limparCache();
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "conteudo_pedido", entidadeId: p.id,
      resumo: `Excluiu o pedido ${p.status === "concluido" ? "concluído" : "cancelado"} "${p.titulo}" (${p.cliente}, ${p.tipo || "sem tipo"})`,
      dadosAntes: { codigo_legado: p.codigo_legado, cliente: p.cliente, tipo: p.tipo, titulo: p.titulo, analista: p.analista_nome, status: p.status, aberto_em: p.aberto_em, concluido_em: p.concluido_em, origem: p.origem, treinamento_id: p.treinamento_id, serie_id: p.serie_id, etapas },
      ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[conteudo] excluirPedido", e.message || e);
    return erro(res, 500, "Erro ao excluir o pedido");
  }
}

/* -------------------------------------------------------------------- ações */

/**
 * Horário do clique. Sem `quando` = agora. Com `quando` (lançamento
 * retroativo) exige justificativa, não aceita futuro nem horário anterior ao
 * evento anterior do pedido.
 */
function resolverQuando(body, agora, minimo) {
  if (!body.quando) return { quando: agora, retro: 0, justificativa: null };
  const n = C.normalizarDataHora(body.quando);
  if (!n) throw Object.assign(new Error("Data e hora inválidas"), { status: 400 });
  if (n > agora) throw Object.assign(new Error("O horário não pode estar no futuro"), { status: 400 });
  if (minimo && n < minimo) throw Object.assign(new Error(`O horário não pode ser anterior ao evento anterior (${minimo.slice(0, 16).replace("T", " ")})`), { status: 400 });
  const just = String(body.justificativa || "").trim();
  if (just.length < 5) throw Object.assign(new Error("Informe a justificativa do lançamento retroativo"), { status: 400 });
  return { quando: n, retro: 1, justificativa: just.slice(0, 500) };
}

async function executarAcao(req, res) {
  const id = Number(req.params.id);
  const b = req.body || {};
  const acao = String(b.acao || "");
  try {
    const empresaId = escopo(req);
    const resultado = await comTransacao(async (conn) => {
      const f = filtroEmpresa(empresaId, "p.");
      // Trava só a linha do pedido (duplo clique / dois acessos ao mesmo tempo).
      const [trava] = await conn.query(`SELECT p.id FROM conteudo_pedidos p WHERE p.id = ?${f.sql} FOR UPDATE`, [id, ...f.params]);
      if (!trava.length) throw Object.assign(new Error("Pedido não encontrado"), { status: 404 });
      const [[p]] = await conn.query(`${SELECT_PEDIDO} WHERE p.id = ?${f.sql} LIMIT 1`, [id, ...f.params]);
      const [etRows] = await conn.query(`${SELECT_ETAPA} WHERE e.pedido_id = ? ORDER BY e.id`, [id]);
      const etapas = etRows.map((r) => ({ ...r, retroativo: Number(r.retroativo) }));
      const permitidas = acoesDisponiveis(req, p, etapas);
      if (!permitidas.includes(acao)) {
        const msg =
          acao === "aprovar" || acao === "pedir_ajustes"
            ? p.validador_tipo === "interno" && !ehGestao(req)
              ? "A validação deste pedido é interna: só a coordenação registra."
              : "Este pedido não está em validação."
            : !podeEditar(req, p) && !(ehAnalista(req) && !p.analista_id && !p.analista_nome)
              ? "Você só altera os seus pedidos."
              : "Esta ação não está disponível no status atual do pedido.";
        throw Object.assign(new Error(msg), { status: 409 });
      }
      const agora = C.agoraBahia();
      const ultimoEvento = etapas.reduce((m, e) => {
        const x = e.fim || e.inicio || "";
        return x > m ? x : m;
      }, p.aberto_em);
      const aberta = (et) => [...etapas].reverse().find((e) => e.etapa === et && !e.fim);
      const uid = req.user?.id || null;
      const setStatus = (s, extra = "", extraParams = []) =>
        conn.query(`UPDATE conteudo_pedidos SET status = ?${extra} WHERE id = ?`, [s, ...extraParams, id]);

      // Pedido sem dono: quem inicia assume.
      if (acao === "assumir" || (acao === "iniciar_criacao" && !p.analista_id && !p.analista_nome && ehAnalista(req))) {
        await conn.query("UPDATE conteudo_pedidos SET analista_id = ?, analista_nome = ? WHERE id = ?", [req.user.id, req.user.nome, id]);
        p.analista_id = req.user.id;
        p.analista_nome = req.user.nome;
        if (acao === "assumir") return { resumo: "Assumiu o pedido" };
      }
      if (acao === "iniciar_criacao" && !p.analista_id && !p.analista_nome) {
        throw Object.assign(new Error("Defina o analista antes de iniciar."), { status: 409 });
      }

      if (acao === "iniciar_criacao" || acao === "iniciar_ajustes") {
        const w = resolverQuando(b, agora, acao === "iniciar_criacao" ? p.aberto_em : ultimoEvento);
        const rodada = acao === "iniciar_criacao" ? 1 : Math.max(1, ...etapas.filter((e) => e.etapa === "criacao").map((e) => e.rodada)) + 1;
        await conn.query(
          `INSERT INTO conteudo_etapas (pedido_id, etapa, rodada, inicio, retroativo, justificativa, usuario_id) VALUES (?, 'criacao', ?, ?, ?, ?, ?)`,
          [id, rodada, w.quando, w.retro, w.justificativa, uid]
        );
        await setStatus("em_criacao");
        return { resumo: acao === "iniciar_criacao" ? "Iniciou a criação" : `Iniciou os ajustes (rodada ${rodada})`, retro: w.retro };
      }

      if (acao === "concluir_criacao") {
        const ab = aberta("criacao");
        const w = resolverQuando(b, agora, ab.inicio);
        await conn.query("UPDATE conteudo_etapas SET fim = ?, retroativo = GREATEST(retroativo, ?), justificativa = COALESCE(?, justificativa) WHERE id = ?", [w.quando, w.retro, w.justificativa, ab.id]);
        // Concluir a criação = encaminhar para validação: a espera começa agora.
        await conn.query(
          `INSERT INTO conteudo_etapas (pedido_id, etapa, rodada, inicio, retroativo, justificativa, usuario_id) VALUES (?, 'validacao', ?, ?, ?, ?, ?)`,
          [id, ab.rodada, w.quando, w.retro, w.justificativa, uid]
        );
        await setStatus("em_validacao", ", lembrar_em = NULL");
        return { resumo: `Concluiu a criação e encaminhou para validação (${p.validador_tipo === "cliente" ? "cliente" : "coordenação"})`, retro: w.retro };
      }

      if (acao === "aprovar" || acao === "pedir_ajustes") {
        const ab = aberta("validacao");
        const w = resolverQuando(b, agora, ab.inicio);
        const ok = acao === "aprovar";
        await conn.query(
          "UPDATE conteudo_etapas SET fim = ?, resultado = ?, observacao = ?, retroativo = GREATEST(retroativo, ?), justificativa = COALESCE(?, justificativa) WHERE id = ?",
          [w.quando, ok ? "aprovado" : "ajustes", String(b.observacao || "").trim().slice(0, 500) || null, w.retro, w.justificativa, ab.id]
        );
        await setStatus(ok ? "validado" : "em_ajustes", ", lembrar_em = NULL");
        return { resumo: ok ? "Registrou a aprovação" : "Registrou pedido de ajustes", retro: w.retro };
      }

      if (acao === "iniciar_postagem") {
        const w = resolverQuando(b, agora, ultimoEvento);
        await conn.query(
          `INSERT INTO conteudo_etapas (pedido_id, etapa, rodada, inicio, retroativo, justificativa, usuario_id) VALUES (?, 'postagem', 1, ?, ?, ?, ?)`,
          [id, w.quando, w.retro, w.justificativa, uid]
        );
        await setStatus("em_postagem");
        return { resumo: "Iniciou a postagem/aplicação", retro: w.retro };
      }

      if (acao === "concluir_postagem") {
        const ab = aberta("postagem");
        const w = resolverQuando(b, agora, ab.inicio);
        await conn.query("UPDATE conteudo_etapas SET fim = ?, retroativo = GREATEST(retroativo, ?), justificativa = COALESCE(?, justificativa) WHERE id = ?", [w.quando, w.retro, w.justificativa, ab.id]);
        await setStatus("concluido", ", concluido_em = ?", [w.quando]);
        return { resumo: "Concluiu a postagem e finalizou o pedido", retro: w.retro };
      }

      if (acao === "concluir_sem_postagem") {
        const w = resolverQuando(b, agora, ultimoEvento);
        await setStatus("concluido", ", concluido_em = ?", [w.quando]);
        return { resumo: "Finalizou o pedido sem etapa de postagem", retro: w.retro };
      }

      if (acao === "lembrar") {
        const dias = Math.min(Math.max(Math.trunc(Number(b.dias) || 2), 1), 30);
        const quando = C.somarDias(C.hojeBahia(), dias);
        await conn.query("UPDATE conteudo_pedidos SET lembrar_em = ? WHERE id = ?", [quando, id]);
        return { resumo: `Pediu lembrete em ${dias} dia(s)`, quiet: true };
      }

      if (acao === "cancelar") {
        const motivo = String(b.motivo || "").trim();
        if (motivo.length < 3) throw Object.assign(new Error("Informe o motivo do cancelamento"), { status: 400 });
        await conn.query("UPDATE conteudo_etapas SET fim = ?, resultado = 'cancelado' WHERE pedido_id = ? AND fim IS NULL", [agora, id]);
        await setStatus("cancelado", ", cancelado_em = ?, cancelado_motivo = ?, lembrar_em = NULL", [agora, motivo.slice(0, 500)]);
        return { resumo: `Cancelou o pedido (${motivo.slice(0, 80)})` };
      }

      if (acao === "reabrir") {
        // As etapas que estavam em andamento ao cancelar voltam a andar.
        await conn.query("UPDATE conteudo_etapas SET fim = NULL, resultado = NULL WHERE pedido_id = ? AND resultado = 'cancelado'", [id]);
        const novas = etapas.map((e) => (e.resultado === "cancelado" ? { ...e, fim: null, resultado: null } : e));
        await setStatus(C.statusPelasEtapas(novas), ", cancelado_em = NULL, cancelado_motivo = NULL");
        return { resumo: "Reabriu o pedido cancelado" };
      }

      throw Object.assign(new Error("Ação desconhecida"), { status: 400 });
    });

    require("../lib/conteudoTbt").limparCache();
    if (!resultado.quiet) {
      registrarAuditoria({
        usuario: req.user, acao: "editar", entidade: "conteudo_pedido", entidadeId: id,
        resumo: `${resultado.resumo}${resultado.retro ? " (retroativo)" : ""}`, ip: req.ip,
      });
    }
    return res.json({ ok: true, message: resultado.resumo });
  } catch (e) {
    if (e.status) return erro(res, e.status, e.message);
    console.error("[conteudo] executarAcao", acao, e.message || e);
    return erro(res, 500, "Erro ao registrar a ação");
  }
}

/** Coordenação corrige o horário de uma etapa (exige justificativa; fica marcado retroativo). */
async function corrigirEtapa(req, res) {
  try {
    const empresaId = escopo(req);
    const etapaId = Number(req.params.id);
    const [[e]] = await pool.query(`${SELECT_ETAPA} WHERE e.id = ? LIMIT 1`, [etapaId]);
    if (!e) return erro(res, 404, "Etapa não encontrada");
    const p = await buscarPedido(req, e.pedido_id);
    if (!p) return erro(res, 404, "Pedido não encontrado");
    const b = req.body || {};
    const just = String(b.justificativa || "").trim();
    if (just.length < 5) return erro(res, 400, "Informe a justificativa da correção");
    const agora = C.agoraBahia();
    const ini = "inicio" in b ? C.normalizarDataHora(b.inicio) : e.inicio;
    const fim = "fim" in b ? (b.fim ? C.normalizarDataHora(b.fim) : null) : e.fim;
    if (!ini) return erro(res, 400, "Início inválido");
    if ("fim" in b && b.fim && !fim) return erro(res, 400, "Fim inválido");
    if (ini > agora || (fim && fim > agora)) return erro(res, 400, "O horário não pode estar no futuro");
    if (fim && fim < ini) return erro(res, 400, "O fim não pode ser antes do início");
    await pool.query("UPDATE conteudo_etapas SET inicio = ?, fim = ?, retroativo = 1, justificativa = ? WHERE id = ?", [ini, fim, just.slice(0, 500), etapaId]);
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_pedido", entidadeId: p.id,
      resumo: `Corrigiu o horário da etapa ${e.etapa} (rodada ${e.rodada}) do pedido "${p.titulo}": ${just.slice(0, 120)}`,
      dadosAntes: { inicio: e.inicio, fim: e.fim }, dadosDepois: { inicio: ini, fim }, ip: req.ip,
    });
    const revisao = await reavaliarRevisao(req, p);
    return res.json({ ok: true, ...revisao });
  } catch (e) {
    console.error("[conteudo] corrigirEtapa", e.message || e);
    return erro(res, 500, "Erro ao corrigir a etapa");
  }
}

/**
 * Depois de corrigir um horário, reavalia o pedido do histórico que estava "para revisar"
 * com as mesmas regras da importação. Sem motivos restantes, o aviso sai e o pedido passa a contar
 * nos indicadores; com motivos restantes, o aviso passa a listar só os que faltam.
 * Pedido que já foi revisado (ok/ignorado) não é mexido.
 */
async function reavaliarRevisao(req, p) {
  if (p.revisao !== "pendente") return { revisao: p.revisao || null };
  const [ets] = await pool.query(
    `SELECT etapa, rodada, ${FMT("inicio")} AS inicio, ${FMT("fim")} AS fim FROM conteudo_etapas WHERE pedido_id = ? ORDER BY rodada ASC, id ASC`,
    [p.id]
  );
  const reg = { etapas: {}, abertura: String(p.aberto_em || "").slice(0, 10) };
  for (const x of ets) if (!reg.etapas[x.etapa]) reg.etapas[x.etapa] = { inicio: x.inicio, fim: x.fim };
  const motivos = motivosDeRevisao(reg, null);
  if (motivos.length) {
    await pool.query("UPDATE conteudo_pedidos SET revisao_motivo = ? WHERE id = ?", [motivos.join("; ").slice(0, 500), p.id]);
    return { revisao: "pendente", revisao_motivo: motivos.join("; ") };
  }
  await pool.query(
    "UPDATE conteudo_pedidos SET revisao = 'ok', revisao_motivo = NULL, revisado_por_id = ?, revisado_em = ? WHERE id = ?",
    [req.user?.id || null, C.agoraBahia(), p.id]
  );
  registrarAuditoria({
    usuario: req.user, acao: "editar", entidade: "conteudo_pedido", entidadeId: p.id,
    resumo: `Revisão do histórico do pedido "${p.titulo}": o aviso saiu sozinho depois da correção do horário e o pedido passou a contar nos indicadores`,
    ip: req.ip,
  });
  return { revisao: "ok", revisao_resolvida: true };
}

async function definirRevisao(req, res) {
  try {
    const p = await buscarPedido(req, Number(req.params.id));
    if (!p) return erro(res, 404, "Pedido não encontrado");
    const valor = String(req.body?.revisao || "");
    if (!["ok", "ignorado", "pendente"].includes(valor)) return erro(res, 400, "Revisão inválida");
    await pool.query(
      "UPDATE conteudo_pedidos SET revisao = ?, revisado_por_id = ?, revisado_em = ? WHERE id = ?",
      [valor, req.user?.id || null, C.agoraBahia(), p.id]
    );
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_pedido", entidadeId: p.id,
      resumo: `Revisão do histórico do pedido "${p.titulo}": ${valor === "ok" ? "validado para os indicadores" : valor === "ignorado" ? "fora dos indicadores" : "voltou para revisar"}`,
      ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[conteudo] definirRevisao", e.message || e);
    return erro(res, 500, "Erro ao salvar a revisão");
  }
}

/* ------------------------------------------------------------- expediente */

async function lerExpediente(req, res) {
  try {
    return res.json(await C.carregarExpediente(escopo(req)));
  } catch (e) {
    return erro(res, 500, "Erro ao ler o expediente");
  }
}

async function salvarExpediente(req, res) {
  try {
    const atual = await C.carregarExpediente(escopo(req));
    const novo = { ...atual };
    for (const k of Object.keys(C.EXPEDIENTE_PADRAO)) if (k in (req.body || {})) novo[k] = String(req.body[k]).trim();
    if (!C.expedienteValido(novo)) return erro(res, 400, "Horários inválidos. Use HH:MM, com a manhã antes da tarde, e dias de 0 (domingo) a 6.");
    const emp = escopo(req) || 0;
    for (const [k, v] of Object.entries(novo)) {
      await pool.query(
        "INSERT INTO conteudo_config (empresa_id, chave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [emp, k, v]
      );
    }
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_config", entidadeId: emp,
      resumo: "Alterou o expediente usado nos prazos da produção de conteúdo", dadosAntes: atual, dadosDepois: novo, ip: req.ip,
    });
    return res.json({ ok: true, expediente: novo });
  } catch (e) {
    console.error("[conteudo] salvarExpediente", e.message || e);
    return erro(res, 500, "Erro ao salvar o expediente");
  }
}

/* ----------------------------------------------------- importação do histórico */

const ARQUIVO_HISTORICO = path.join(__dirname, "..", "database", "seeds", "conteudo_historico.json");

/** Regras que mandam um registro para revisão antes de entrar nos indicadores. */
function motivosDeRevisao(reg, exp) {
  const m = [];
  const rotulo = { criacao: "criação", validacao: "validação", postagem: "postagem" };
  for (const [nome, e] of Object.entries(reg.etapas || {})) {
    if (e.inicio && e.fim) {
      const h = C.horasCorridas(e.inicio, e.fim);
      if (h === null) m.push(`${rotulo[nome]} termina antes de começar`);
      else if (h > 200) m.push(`${rotulo[nome]} com ${Math.round(h)}h corridas`);
    }
  }
  const c = reg.etapas?.criacao;
  if (c?.inicio) {
    const dow = new Date(C.paraMs(c.inicio)).getUTCDay();
    if (dow === 0) m.push("criação iniciada num domingo");
    if (reg.abertura && C.paraMs(c.inicio) - C.paraMs(`${reg.abertura} 00:00:00`) < -3 * 86400000) m.push("criação iniciada muito antes da abertura do pedido");
  }
  return m;
}

async function importarHistorico(req, res) {
  try {
    const empresaId = escopo(req);
    const confirmar = req.body?.confirmar === true || req.query.confirmar === "1";
    if (!fs.existsSync(ARQUIVO_HISTORICO)) return erro(res, 404, "Arquivo do histórico não encontrado no servidor");
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, "utf8"));
    const exp = await C.carregarExpediente(empresaId);
    const f = filtroEmpresa(empresaId);
    const [ja] = await pool.query(`SELECT codigo_legado FROM conteudo_pedidos WHERE codigo_legado IS NOT NULL${f.sql}`, f.params);
    const existentes = new Set(ja.map((r) => Number(r.codigo_legado)));
    const novos = dados.filter((d) => !existentes.has(Number(d.id)));
    const aRevisar = novos.map((d) => ({ d, motivos: motivosDeRevisao(d, exp) })).filter((x) => x.motivos.length);
    const previa = {
      no_arquivo: dados.length,
      ja_importados: dados.length - novos.length,
      a_importar: novos.length,
      a_revisar: aRevisar.map((x) => ({ id: x.d.id, analista: x.d.analista, cliente: x.d.cliente, titulo: x.d.titulo, motivos: x.motivos })),
    };
    if (!confirmar) return res.json({ ok: true, simulacao: true, ...previa });

    await garantirTipos(empresaId);
    const [tiposRows] = await pool.query(`SELECT id, nome FROM conteudo_tipos WHERE 1=1${f.sql}`, f.params);
    const tipoPorNome = new Map(tiposRows.map((t) => [C.sansAcento(t.nome), t]));
    const [analistas] = await pool.query(
      `SELECT id, nome FROM usuarios WHERE perfil = 'analista_conteudo'${f.sql}`,
      f.params
    );

    const importados = await comTransacao(async (conn) => {
      let n = 0;
      for (const d of novos) {
        let tipo = tipoPorNome.get(C.sansAcento(d.tipo));
        if (!tipo) {
          const [r] = await conn.query(
            "INSERT INTO conteudo_tipos (empresa_id, nome, ordem) VALUES (?, ?, 99)",
            [empresaId || null, String(d.tipo || "Outro").slice(0, 120)]
          );
          tipo = { id: r.insertId, nome: d.tipo };
          tipoPorNome.set(C.sansAcento(d.tipo), tipo);
        }
        const ets = [];
        for (const nome of ["criacao", "validacao", "postagem"]) {
          const e = d.etapas?.[nome];
          if (e && e.inicio) ets.push({ etapa: nome, rodada: 1, inicio: e.inicio, fim: e.fim || null, resultado: null });
        }
        // Criação concluída sem validação registrada: a espera começa no fim da criação.
        if (ets.length === 1 && ets[0].etapa === "criacao" && ets[0].fim) {
          ets.push({ etapa: "validacao", rodada: 1, inicio: ets[0].fim, fim: null, resultado: null });
        }
        const status = C.statusPelasEtapas(ets.map((e, i) => ({ ...e, id: i })));
        const motivos = motivosDeRevisao(d, exp);
        const dono = analistas.find((a) => C.primeiroNome(a.nome) === C.primeiroNome(d.analista));
        const titulo = typeof d.titulo === "string" && d.titulo.trim() ? d.titulo.trim().slice(0, 255) : `Pedido ${d.id} da planilha (sem título)`;
        const concluidoEm = status === "concluido" ? ets.find((e) => e.etapa === "postagem")?.fim || null : null;
        const [r] = await conn.query(
          `INSERT INTO conteudo_pedidos
             (empresa_id, codigo_legado, cliente, tipo_id, tipo_nome, titulo, analista_id, analista_nome, aberto_em,
              validador_tipo, status, origem, revisao, revisao_motivo, concluido_em, criado_por_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cliente', ?, 'planilha', ?, ?, ?, ?)`,
          [
            empresaId || null, d.id, d.cliente, tipo.id, tipo.nome, titulo, dono?.id || null, d.analista, `${d.abertura} 00:00:00`,
            status, motivos.length ? "pendente" : null, motivos.length ? motivos.join("; ").slice(0, 500) : null, concluidoEm, req.user?.id || null,
          ]
        );
        for (const e of ets) {
          await conn.query(
            `INSERT INTO conteudo_etapas (pedido_id, etapa, rodada, inicio, fim, resultado, retroativo, justificativa)
             VALUES (?, ?, ?, ?, ?, NULL, 1, 'Importado da planilha de acompanhamento')`,
            [r.insertId, e.etapa, e.rodada, e.inicio, e.fim]
          );
        }
        n++;
      }
      return n;
    });
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "conteudo_pedido", entidadeId: null,
      resumo: `Importou ${importados} pedido(s) do histórico da planilha (${previa.a_revisar.length} para revisar)`, ip: req.ip,
    });
    return res.json({ ok: true, simulacao: false, importados, ...previa });
  } catch (e) {
    console.error("[conteudo] importarHistorico", e.message || e);
    return erro(res, 500, "Erro ao importar o histórico");
  }
}

module.exports = {
  excluirPedido,
  listarTipos,
  salvarTipo,
  listarAnalistas,
  listarClientes,
  listarPedidos,
  detalharPedido,
  resumo,
  criarPedido,
  atualizarPedido,
  executarAcao,
  corrigirEtapa,
  definirRevisao,
  lerExpediente,
  salvarExpediente,
  importarHistorico,
  // Reaproveitados pelos indicadores, avisos e Fechamento mensal (Pacote 2).
  interno: { enriquecer, etapasDe, SELECT_PEDIDO, escopo, filtroEmpresa, vincularLegado, garantirTipos, GESTAO },
};
