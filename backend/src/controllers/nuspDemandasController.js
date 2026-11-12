/**
 * nuspDemandasController.js — "Fale Comigo" do Núcleo (Pacote 4, 12/11/2026)
 *
 * Caixa de demandas com prazo em dias úteis (padrão 5). A analista registra; coordenador e analistas
 * leem o conteúdo; o gestor (diretoria) só recebe números agregados, nunca texto.
 * Farol do prazo: verde até o dia anterior, amarelo no último dia, vermelho depois.
 * O texto da demanda pode citar pessoas: a tela orienta a NÃO registrar dado de saúde (nada clínico).
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { registrarAuditoria } = require("../services/auditoria");
const B = require("../lib/nuspBase");
const { somarDiasUteis, diasUteisEntre } = require("../lib/diasUteis");

const n = (v) => Number(v || 0);
const ehCoord = (c) => c.perfil === B.PERFIL_COORD;
const ABERTAS = ["aberta", "em_andamento"];
const auditar = (req, acao, id, resumo) =>
  registrarAuditoria({ usuario: req.user, acao, entidade: "nusp_demanda", entidadeId: id, resumo, dadosAntes: null, dadosDepois: null, ip: req.ip });

const SQL_DEMANDA = `
  SELECT d.id, DATE_FORMAT(d.data_recebimento, '%Y-%m-%d') AS data_recebimento, d.canal, d.tipo, d.assunto, d.descricao, d.solicitante,
         d.unidade_id, u.nome AS unidade, d.prazo_dias_uteis, DATE_FORMAT(d.prazo_em, '%Y-%m-%d') AS prazo_em, d.status,
         d.resposta, DATE_FORMAT(d.respondida_em, '%Y-%m-%d') AS respondida_em, d.responsavel_id, d.responsavel_nome,
         d.criado_por_id, d.criado_por_nome, DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i') AS criado_em
    FROM nusp_demandas d LEFT JOIN nusp_unidades u ON u.id = d.unidade_id`;

/** Farol de uma demanda. Aberta: verde / amarelo (último dia) / vermelho (passou). Respondida: dentro ou fora do prazo. */
function farolDe(d, hoje) {
  if (d.status === "cancelada") return { farol: "cinza", dias: null, texto: "Cancelada" };
  if (d.status === "respondida") {
    const dentro = d.respondida_em && d.respondida_em <= d.prazo_em;
    return { farol: dentro ? "verde" : "vermelho", dias: null, texto: dentro ? "Respondida no prazo" : "Respondida fora do prazo" };
  }
  if (hoje < d.prazo_em) {
    const dias = diasUteisEntre(hoje, d.prazo_em);
    return { farol: "verde", dias, texto: dias === 1 ? "Falta 1 dia útil" : `Faltam ${dias} dias úteis` };
  }
  if (hoje === d.prazo_em) return { farol: "amarelo", dias: 0, texto: "Vence hoje" };
  const atraso = diasUteisEntre(d.prazo_em, hoje) || 1;
  return { farol: "vermelho", dias: -atraso, texto: atraso === 1 ? "Atrasada há 1 dia útil" : `Atrasada há ${atraso} dias úteis` };
}
const comFarol = (d, hoje) => ({ ...d, ...farolDe(d, hoje) });

async function carregar(id, empresaId, conn = pool) {
  const [rows] = await conn.query(`${SQL_DEMANDA} WHERE d.id = ? AND d.empresa_id = ?`, [id, empresaId]);
  return rows[0] || null;
}

const podeEditarCampos = (c, d) => ehCoord(c) || Number(d.criado_por_id) === Number(c.user.id) || Number(d.responsavel_id) === Number(c.user.id);

async function nomeDoUsuario(id, empresaId) {
  const [r] = await pool.query(`SELECT nome FROM usuarios WHERE id = ? AND empresa_id = ? LIMIT 1`, [id, empresaId]);
  return r[0]?.nome || null;
}

// Valida os campos de uma demanda. Devolve { erros, d }.
async function validar(b, c, atual = null) {
  const erros = []; const d = {};
  const hoje = B.hojeISO();
  const data = b.data_recebimento === undefined && atual ? atual.data_recebimento : (B.dataISO(b.data_recebimento) ?? (b.data_recebimento ? undefined : hoje));
  if (data === undefined) erros.push("Data de recebimento inválida"); else d.data_recebimento = data;
  if (d.data_recebimento && d.data_recebimento > hoje) erros.push("A data de recebimento não pode ser futura");
  d.canal = B.opcao(b.canal, B.CANAIS_DEMANDA, "Canal", erros, { padrao: atual?.canal || "fale_comigo" });
  d.tipo = B.opcao(b.tipo, B.TIPOS_DEMANDA, "Tipo", erros, { padrao: atual?.tipo || "duvida" });
  d.assunto = B.texto(b.assunto, 200, "Assunto", erros, { obrigatorio: true });
  d.descricao = B.texto(b.descricao, 1500, "Descrição", erros);
  d.solicitante = B.texto(b.solicitante, 150, "Solicitante", erros);
  d.unidade_id = B.inteiroOuNulo(b.unidade_id, "Unidade", erros);
  if (d.unidade_id && !(await B.existeNaEmpresa("nusp_unidades", d.unidade_id, c.empresaId))) erros.push("Unidade inválida");

  // Responsável: a analista que registra fica como responsável; o coordenador pode indicar outra pessoa da equipe.
  let resp = atual ? atual.responsavel_id : c.user.id;
  if (ehCoord(c) && b.responsavel_id !== undefined && b.responsavel_id !== "" && b.responsavel_id !== null) {
    resp = Number(b.responsavel_id);
    if (!Number.isInteger(resp) || resp <= 0 || !(await nomeDoUsuario(resp, c.empresaId))) { erros.push("Responsável inválido"); resp = atual ? atual.responsavel_id : c.user.id; }
  }
  d.responsavel_id = resp;

  // Prazo: padrão 5 dias úteis a partir do recebimento; só o coordenador ajusta a data.
  const dataBase = d.data_recebimento || hoje;
  const dias0 = atual ? atual.prazo_dias_uteis : B.PRAZO_DEMANDA_PADRAO;
  let prazo = atual && atual.data_recebimento === dataBase ? atual.prazo_em : somarDiasUteis(dataBase, B.PRAZO_DEMANDA_PADRAO);
  if (ehCoord(c) && b.prazo_em !== undefined && b.prazo_em !== "" && b.prazo_em !== null) {
    const p = B.dataISO(b.prazo_em);
    if (!p) erros.push("Prazo inválido");
    else if (p < dataBase) erros.push("O prazo não pode ser anterior à data de recebimento");
    else prazo = p;
  }
  d.prazo_em = prazo;
  d.prazo_dias_uteis = Math.min(127, diasUteisEntre(dataBase, prazo) || dias0);
  return { erros, d };
}

// ── Lista ─────────────────────────────────────────────────────────────
async function listar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    const q = req.query; const hoje = B.hojeISO();
    const w = ["d.empresa_id = ?"]; const p = [c.empresaId];
    if (q.status === "abertas") w.push("d.status IN ('aberta','em_andamento')");
    else if (q.status && B.valores(B.STATUS_DEMANDA).includes(String(q.status))) { w.push("d.status = ?"); p.push(String(q.status)); }
    const f = String(q.farol || "");
    if (f === "verde") { w.push("d.status IN ('aberta','em_andamento') AND d.prazo_em > ?"); p.push(hoje); }
    else if (f === "amarelo") { w.push("d.status IN ('aberta','em_andamento') AND d.prazo_em = ?"); p.push(hoje); }
    else if (f === "vermelho") { w.push("d.status IN ('aberta','em_andamento') AND d.prazo_em < ?"); p.push(hoje); }
    if (q.canal && B.valores(B.CANAIS_DEMANDA).includes(String(q.canal))) { w.push("d.canal = ?"); p.push(String(q.canal)); }
    if (q.tipo && B.valores(B.TIPOS_DEMANDA).includes(String(q.tipo))) { w.push("d.tipo = ?"); p.push(String(q.tipo)); }
    const un = Number(q.unidade_id); if (Number.isInteger(un) && un > 0) { w.push("d.unidade_id = ?"); p.push(un); }
    if (q.analista) { w.push("d.responsavel_nome = ?"); p.push(String(q.analista).trim().slice(0, 150)); }
    const de = B.dataISO(q.de), ate = B.dataISO(q.ate);
    if (de) { w.push("d.data_recebimento >= ?"); p.push(de); }
    if (ate) { w.push("d.data_recebimento <= ?"); p.push(ate); }
    if (q.q) { const t = `%${String(q.q).trim().slice(0, 80)}%`; w.push("(d.assunto LIKE ? OR d.descricao LIKE ? OR d.solicitante LIKE ?)"); p.push(t, t, t); }
    const where = w.join(" AND ");
    const limite = Math.min(Math.max(parseInt(q.limite, 10) || 50, 1), 200);
    const pagina = Math.max(parseInt(q.pagina, 10) || 1, 1);
    const [itens] = await pool.query(
      `${SQL_DEMANDA} WHERE ${where}
        ORDER BY (d.status IN ('respondida','cancelada')), d.prazo_em, d.id DESC LIMIT ? OFFSET ?`, [...p, limite, (pagina - 1) * limite]);
    const [[tot]] = await pool.query(`SELECT COUNT(*) n FROM nusp_demandas d WHERE ${where}`, p);
    // Situação atual da caixa (não depende dos filtros): é o que a equipe precisa ver todo dia.
    const [[sit]] = await pool.query(
      `SELECT SUM(status IN ('aberta','em_andamento')) abertas,
              SUM(status IN ('aberta','em_andamento') AND prazo_em = ?) vencem_hoje,
              SUM(status IN ('aberta','em_andamento') AND prazo_em < ?) atrasadas
         FROM nusp_demandas WHERE empresa_id = ?`, [hoje, hoje, c.empresaId]);
    return res.json({
      itens: itens.map((d) => comFarol(d, hoje)), total: n(tot.n), limite,
      situacao: { abertas: n(sit.abertas), vencem_hoje: n(sit.vencem_hoje), atrasadas: n(sit.atrasadas) },
    });
  } catch (e) {
    console.error("[nusp.demandas.listar]", e);
    return B.erro(res, 500, "Erro ao listar as demandas do Fale Comigo");
  }
}

async function detalhe(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    const d = await carregar(Number(req.params.id), c.empresaId);
    if (!d) return B.erro(res, 404, "Demanda não encontrada");
    const [hist] = await pool.query(
      `SELECT usuario_nome, acao, status, texto, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS quando
         FROM nusp_demandas_historico WHERE demanda_id = ? AND empresa_id = ? ORDER BY id DESC LIMIT 100`, [d.id, c.empresaId]);
    await B.registrarLeitura(req, c.empresaId, "demanda", d.id, null);
    return res.json({ ...comFarol(d, B.hojeISO()), historico: hist, pode_editar: podeEditarCampos(c, d) && (ABERTAS.includes(d.status) || ehCoord(c)), pode_reabrir: ehCoord(c) });
  } catch (e) {
    console.error("[nusp.demandas.detalhe]", e);
    return B.erro(res, 500, "Erro ao carregar a demanda");
  }
}

async function criar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    const { erros, d } = await validar(req.body || {}, c, null);
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    const respNome = d.responsavel_id === c.user.id ? (c.user.nome || null) : await nomeDoUsuario(d.responsavel_id, c.empresaId);
    const id = await comTransacao(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO nusp_demandas (empresa_id, data_recebimento, canal, tipo, assunto, descricao, solicitante, unidade_id, prazo_dias_uteis, prazo_em,
           status, responsavel_id, responsavel_nome, criado_por_id, criado_por_nome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?, ?)`,
        [c.empresaId, d.data_recebimento, d.canal, d.tipo, d.assunto, d.descricao, d.solicitante, d.unidade_id, d.prazo_dias_uteis, d.prazo_em,
         d.responsavel_id, respNome, c.user.id, c.user.nome || null]);
      await conn.query(`INSERT INTO nusp_demandas_historico (empresa_id, demanda_id, usuario_id, usuario_nome, acao, status, texto) VALUES (?, ?, ?, ?, 'registrou', 'aberta', ?)`,
        [c.empresaId, r.insertId, c.user.id, c.user.nome || null, `Prazo até ${d.prazo_em.split("-").reverse().join("/")}`]);
      return r.insertId;
    });
    auditar(req, "criar", id, "Registrou uma demanda do Fale Comigo");
    return res.status(201).json({ id, prazo_em: d.prazo_em, message: "Demanda registrada" });
  } catch (e) {
    console.error("[nusp.demandas.criar]", e);
    return B.erro(res, 500, "Erro ao registrar a demanda");
  }
}

async function editar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregar(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Demanda não encontrada");
    if (!podeEditarCampos(c, atual)) return B.erro(res, 403, "Você só pode editar as demandas que registrou ou pelas quais é responsável.");
    if (!ABERTAS.includes(atual.status) && !ehCoord(c)) return B.erro(res, 400, "Esta demanda já foi encerrada. Só o coordenador pode reabrir ou ajustar.");
    const { erros, d } = await validar(req.body || {}, c, atual);
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    const respNome = d.responsavel_id === atual.responsavel_id ? atual.responsavel_nome : await nomeDoUsuario(d.responsavel_id, c.empresaId);
    const mudouPrazo = d.prazo_em !== atual.prazo_em;
    await comTransacao(async (conn) => {
      await conn.query(
        `UPDATE nusp_demandas SET data_recebimento = ?, canal = ?, tipo = ?, assunto = ?, descricao = ?, solicitante = ?, unidade_id = ?,
           prazo_dias_uteis = ?, prazo_em = ?, responsavel_id = ?, responsavel_nome = ? WHERE id = ? AND empresa_id = ?`,
        [d.data_recebimento, d.canal, d.tipo, d.assunto, d.descricao, d.solicitante, d.unidade_id, d.prazo_dias_uteis, d.prazo_em, d.responsavel_id, respNome, id, c.empresaId]);
      await conn.query(`INSERT INTO nusp_demandas_historico (empresa_id, demanda_id, usuario_id, usuario_nome, acao, status, texto) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.empresaId, id, c.user.id, c.user.nome || null, mudouPrazo ? "prazo" : "edicao", atual.status,
         mudouPrazo ? `Prazo ajustado de ${atual.prazo_em.split("-").reverse().join("/")} para ${d.prazo_em.split("-").reverse().join("/")}` : "Dados da demanda atualizados"]);
    });
    auditar(req, "editar", id, mudouPrazo ? "Ajustou o prazo de uma demanda do Fale Comigo" : "Editou uma demanda do Fale Comigo");
    return res.json({ message: "Demanda atualizada" });
  } catch (e) {
    console.error("[nusp.demandas.editar]", e);
    return B.erro(res, 500, "Erro ao atualizar a demanda");
  }
}

// Muda a situação: assumir (em andamento), responder, cancelar ou (coordenador) reabrir.
async function mudarStatus(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregar(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Demanda não encontrada");
    const novo = String(req.body?.status || "");
    if (!B.valores(B.STATUS_DEMANDA).includes(novo)) return B.erro(res, 400, "Situação inválida");
    const erros = [];
    const resposta = B.texto(req.body?.resposta, 2000, "Resposta", erros);
    const motivo = B.texto(req.body?.comentario, 300, "Comentário", erros);
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    const aberta = ABERTAS.includes(atual.status);
    if (!aberta && novo !== "em_andamento") return B.erro(res, 400, "Esta demanda já foi encerrada. Só o coordenador pode reabrir.");
    if (!aberta && !ehCoord(c)) return B.erro(res, 403, "Só o coordenador pode reabrir uma demanda encerrada.");
    if (novo === "aberta") return B.erro(res, 400, "Escolha “Em andamento”, “Respondida” ou “Cancelada”.");
    if (novo === "respondida" && (!resposta || resposta.length < 10)) return B.erro(res, 400, "Escreva um resumo da resposta dada (pelo menos 10 caracteres).");
    if (novo === "cancelada" && !motivo) return B.erro(res, 400, "Informe o motivo do cancelamento.");
    const hoje = B.hojeISO();
    const respondidaEm = novo === "respondida" ? hoje : null;
    await comTransacao(async (conn) => {
      await conn.query(
        `UPDATE nusp_demandas SET status = ?, resposta = ?, respondida_em = ? WHERE id = ? AND empresa_id = ?`,
        [novo, novo === "respondida" ? resposta : atual.resposta, respondidaEm, id, c.empresaId]);
      const texto = novo === "respondida" ? "Respondeu a demanda" : novo === "cancelada" ? `Cancelou: ${motivo}` : aberta ? "Assumiu a demanda" : "Reabriu a demanda";
      await conn.query(`INSERT INTO nusp_demandas_historico (empresa_id, demanda_id, usuario_id, usuario_nome, acao, status, texto) VALUES (?, ?, ?, ?, 'status', ?, ?)`,
        [c.empresaId, id, c.user.id, c.user.nome || null, novo, texto]);
    });
    auditar(req, "editar", id, `Mudou uma demanda do Fale Comigo para "${novo}"`);
    return res.json({ message: novo === "respondida" ? "Demanda respondida" : "Situação atualizada" });
  } catch (e) {
    console.error("[nusp.demandas.mudarStatus]", e);
    return B.erro(res, 500, "Erro ao atualizar a situação da demanda");
  }
}

async function excluir(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregar(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Demanda não encontrada");
    await comTransacao(async (conn) => {
      await conn.query(`DELETE FROM nusp_demandas_historico WHERE demanda_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_demandas WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    });
    auditar(req, "excluir", id, "Excluiu uma demanda do Fale Comigo");
    return res.json({ message: "Demanda excluída" });
  } catch (e) {
    console.error("[nusp.demandas.excluir]", e);
    return B.erro(res, 500, "Erro ao excluir a demanda");
  }
}

// ── Indicadores (todos os perfis do Núcleo; só números, sem texto nem quebra por pessoa) ──
async function calcularIndicadores(empresaId, de, ate) {
  const hoje = B.hojeISO();
  const [[rec]] = await pool.query(
    `SELECT COUNT(*) recebidas, SUM(status = 'respondida') respondidas
       FROM nusp_demandas WHERE empresa_id = ? AND status <> 'cancelada' AND data_recebimento BETWEEN ? AND ?`, [empresaId, de, ate]);
  const [resp] = await pool.query(
    `SELECT DATE_FORMAT(data_recebimento, '%Y-%m-%d') AS rec, DATE_FORMAT(respondida_em, '%Y-%m-%d') AS resp, DATE_FORMAT(prazo_em, '%Y-%m-%d') AS prazo
       FROM nusp_demandas WHERE empresa_id = ? AND status = 'respondida' AND respondida_em IS NOT NULL AND data_recebimento BETWEEN ? AND ?`, [empresaId, de, ate]);
  const [[sit]] = await pool.query(
    `SELECT SUM(status IN ('aberta','em_andamento')) em_aberto,
            SUM(status IN ('aberta','em_andamento') AND prazo_em < ?) atrasadas
       FROM nusp_demandas WHERE empresa_id = ?`, [hoje, empresaId]);
  const dias = resp.map((r) => diasUteisEntre(r.rec, r.resp));
  const noPrazo = resp.filter((r) => r.resp <= r.prazo).length;
  return {
    periodo: { de, ate },
    recebidas: n(rec.recebidas), respondidas: n(rec.respondidas),
    em_aberto: n(sit.em_aberto), atrasadas: n(sit.atrasadas),
    tempo_medio_dias_uteis: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
    pct_no_prazo: resp.length ? Math.round((noPrazo / resp.length) * 1000) / 10 : null,
  };
}

async function indicadores(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const hoje = B.hojeISO();
    const de = B.dataISO(req.query.de) || `${hoje.slice(0, 4)}-01-01`;
    const ate = B.dataISO(req.query.ate) || hoje;
    return res.json({ ok: true, ...(await calcularIndicadores(c.empresaId, de, ate)) });
  } catch (e) {
    console.error("[nusp.demandas.indicadores]", e);
    return B.erro(res, 500, "Erro ao calcular os números do Fale Comigo");
  }
}

module.exports = { listar, detalhe, criar, editar, mudarStatus, excluir, indicadores, calcularIndicadores, farolDe };
