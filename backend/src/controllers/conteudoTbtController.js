/**
 * conteudoTbtController.js — Produção de conteúdo, Pacote 3 (23/10/2026)
 *
 * #TBT e séries. Regra decidida com o Ramon: o material do #TBT nasce DEPOIS da
 * ação em piso (o instrutor abre e realiza a turma; o analista cria o material).
 * Então o portal não cria pedido sozinho: lista as TBT já realizadas sem material,
 * avisa no sino e abre o pedido com um clique, já ligado à turma e à série do cliente.
 *
 *  - Ver a lista, os números e as séries: quem lê Produção de conteúdo.
 *  - Marcar "Não precisa de material": quem escreve (analista, coordenação).
 *  - Criar/renomear/arquivar série: só o coordenador.
 */
const pool = require("../lib/db");
const { tenantScopeFor } = require("../lib/tenantScope");
const { registrarAuditoria } = require("../services/auditoria");
const C = require("../lib/conteudo");
const T = require("../lib/conteudoTbt");
const { mediana, r1 } = require("../lib/conteudoIndicadores");

const erro = (res, status, msg, extra = {}) => res.status(status).json({ ok: false, message: msg, error: msg, ...extra });
const escopo = (req) => tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
const filtroEmpresa = T.filtroEmpresa;
const FMT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;
const interno = () => require("./conteudoController").interno;

/* ------------------------------------------------------------------ pendentes */

async function pendentes(req, res) {
  try {
    const empresaId = escopo(req);
    const dias = Math.min(Math.max(Number(req.query?.dias) || T.DIAS_PADRAO, 1), T.DIAS_MAX);
    const itens = await T.tbtPendentes(empresaId, dias);
    const f = filtroEmpresa(empresaId);
    const [[d]] = await pool.query(`SELECT COUNT(*) AS n FROM conteudo_tbt_dispensas WHERE 1=1${f.sql}`, f.params);
    return res.json({ dias, total: itens.length, itens, dispensadas: Number(d.n || 0) });
  } catch (e) {
    console.error("[conteudo] tbt pendentes", e.message || e);
    return erro(res, 500, "Erro ao listar as TBT sem material");
  }
}

async function turmaDaEmpresa(empresaId, id) {
  const f = filtroEmpresa(empresaId);
  const [[t]] = await pool.query(
    `SELECT id, tema, cliente, empresa_id FROM treinamentos WHERE id = ?${f.sql} LIMIT 1`,
    [Number(id) || 0, ...f.params]
  );
  return t || null;
}

async function listarDispensadas(req, res) {
  try {
    const empresaId = escopo(req);
    const f = filtroEmpresa(empresaId, "d.");
    const [rows] = await pool.query(
      `SELECT d.treinamento_id AS id, d.motivo, d.usuario_nome, ${FMT("d.created_at")} AS em,
              t.tema, t.cliente, DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS realizada_em
         FROM conteudo_tbt_dispensas d
         LEFT JOIN treinamentos t ON t.id = d.treinamento_id
        WHERE 1=1${f.sql}
        ORDER BY d.created_at DESC, d.id DESC LIMIT 200`,
      f.params
    );
    return res.json(rows);
  } catch (e) {
    console.error("[conteudo] tbt dispensadas", e.message || e);
    return erro(res, 500, "Erro ao listar as turmas dispensadas");
  }
}

async function dispensar(req, res) {
  try {
    const empresaId = escopo(req);
    const t = await turmaDaEmpresa(empresaId, req.params.id);
    if (!t) return erro(res, 404, "Turma não encontrada");
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300) || null;
    await pool.query(
      `INSERT INTO conteudo_tbt_dispensas (empresa_id, treinamento_id, motivo, usuario_id, usuario_nome)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE motivo = VALUES(motivo), usuario_id = VALUES(usuario_id), usuario_nome = VALUES(usuario_nome)`,
      [t.empresa_id || empresaId || null, t.id, motivo, req.user?.id || null, req.user?.nome || null]
    );
    T.limparCache();
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_tbt", entidadeId: t.id,
      resumo: `Marcou "${t.tema}" (${t.cliente}) como não precisa de material${motivo ? `: ${motivo}` : ""}`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[conteudo] tbt dispensar", e.message || e);
    return erro(res, 500, "Erro ao salvar");
  }
}

async function desfazerDispensa(req, res) {
  try {
    const empresaId = escopo(req);
    const t = await turmaDaEmpresa(empresaId, req.params.id);
    if (!t) return erro(res, 404, "Turma não encontrada");
    await pool.query("DELETE FROM conteudo_tbt_dispensas WHERE treinamento_id = ?", [t.id]);
    T.limparCache();
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "conteudo_tbt", entidadeId: t.id,
      resumo: `Voltou "${t.tema}" (${t.cliente}) para a lista de TBT sem material`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[conteudo] tbt desfazer", e.message || e);
    return erro(res, 500, "Erro ao salvar");
  }
}

/* --------------------------------------------------------------------- turmas */

/** Busca de turmas para o seletor do pedido (qualquer turma, não só TBT). */
async function buscarTurmas(req, res) {
  try {
    const empresaId = escopo(req);
    const f = filtroEmpresa(empresaId, "t.");
    const q = String(req.query?.q || "").trim();
    const cond = [`1=1${f.sql}`];
    const params = [...f.params];
    if (q) {
      cond.push("(t.tema LIKE ? OR t.cliente LIKE ? OR t.instrutor LIKE ? OR t.turma LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    } else {
      cond.push("COALESCE(t.data_fim, t.data_inicio, t.data) >= ?");
      params.push(C.somarDias(C.hojeBahia(), -120));
    }
    if (req.query?.cliente) cond.push("LOWER(t.cliente) = LOWER(?)"), params.push(String(req.query.cliente));
    const [rows] = await pool.query(
      `SELECT t.id, t.tema, t.cliente, t.instrutor, t.turma, t.status,
              DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS realizada_em,
              (SELECT COUNT(*) FROM treinamento_instrutores ti WHERE ti.treinamento_id = t.id) AS n_adicionais,
              (SELECT COUNT(*) FROM conteudo_pedidos p WHERE p.treinamento_id = t.id AND p.status <> 'cancelado') AS n_pedidos
         FROM treinamentos t
        WHERE ${cond.join(" AND ")}
        ORDER BY COALESCE(t.data_fim, t.data_inicio, t.data) DESC, t.id DESC LIMIT 40`,
      params
    );
    return res.json(
      rows.map((r) => ({
        id: r.id, tema: r.tema, cliente: r.cliente, instrutor: r.instrutor, turma: r.turma, status: r.status,
        realizada_em: r.realizada_em, tbt: /tbt/i.test(r.tema || "") || Number(r.n_adicionais) > 0, n_pedidos: Number(r.n_pedidos || 0),
      }))
    );
  } catch (e) {
    console.error("[conteudo] buscar turmas", e.message || e);
    return erro(res, 500, "Erro ao buscar as turmas");
  }
}

/** Materiais de conteúdo ligados a uma turma (cartão na página da turma). Poucos campos, só leitura. */
async function pedidosDaTurma(req, res) {
  try {
    const empresaId = escopo(req);
    const t = await turmaDaEmpresa(empresaId, req.params.id);
    if (!t) return erro(res, 404, "Turma não encontrada");
    const I = interno();
    const [rows] = await pool.query(`${I.SELECT_PEDIDO} WHERE p.treinamento_id = ? AND p.status <> 'cancelado' ORDER BY p.aberto_em DESC, p.id DESC`, [t.id]);
    const exp = await C.carregarExpediente(empresaId);
    const agora = C.agoraBahia();
    const mapa = await I.etapasDe(rows.map((r) => r.id));
    const pedidos = rows.map((r) => {
      const e = I.enriquecer(r, mapa.get(r.id) || [], exp, agora);
      return {
        id: e.id, titulo: e.titulo, tipo: e.tipo, status: e.status, analista_nome: e.analista_nome,
        serie_nome: e.serie_nome, farol: e.farol, concluido_em: e.concluido_em, aberto_em: e.aberto_em,
      };
    });
    const [dr] = await pool.query("SELECT motivo, usuario_nome FROM conteudo_tbt_dispensas WHERE treinamento_id = ? LIMIT 1", [t.id]);
    return res.json({ turma: { id: t.id, tema: t.tema, cliente: t.cliente }, pedidos, dispensada: dr[0] || null });
  } catch (e) {
    console.error("[conteudo] pedidos da turma", e.message || e);
    return erro(res, 500, "Erro ao buscar os materiais da turma");
  }
}

/* --------------------------------------------------------------------- séries */

async function listarSeries(req, res) {
  try {
    const empresaId = escopo(req);
    await interno().garantirTipos(empresaId);
    await T.garantirSeries(empresaId);
    const f = filtroEmpresa(empresaId);
    const [series] = await pool.query(
      `SELECT id, nome, cliente, gatilho, tipo_id, ativo FROM conteudo_series WHERE 1=1${f.sql} ORDER BY ativo DESC, nome ASC`,
      f.params
    );
    const fp = filtroEmpresa(empresaId, "p.");
    const [peds] = await pool.query(
      `SELECT p.serie_id, p.status, p.revisao, ${FMT("p.concluido_em")} AS concluido_em, ${FMT("p.aberto_em")} AS aberto_em,
              DATE_FORMAT(COALESCE(tr.data_fim, tr.data_inicio, tr.data), '%Y-%m-%d') AS turma_fim
         FROM conteudo_pedidos p
         LEFT JOIN treinamentos tr ON tr.id = p.treinamento_id
        WHERE p.serie_id IS NOT NULL${fp.sql}`,
      fp.params
    );
    const pend = await T.tbtPendentes(empresaId, T.DIAS_PADRAO);
    const hoje = C.hojeBahia();
    const corte90 = C.somarDias(hoje, -90);
    const [tipos] = await pool.query(`SELECT id, nome FROM conteudo_tipos WHERE 1=1${f.sql}`, f.params);
    const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]));
    const out = series.map((s) => {
      const meus = peds.filter((p) => Number(p.serie_id) === Number(s.id));
      const conc = meus.filter((p) => p.status === "concluido");
      const concUlt = conc.map((p) => p.concluido_em).filter(Boolean).sort().pop() || null;
      // Quanto o material demora depois da ação em piso: fim da turma → concluído, em dias corridos.
      const latencias = conc
        .filter((p) => p.turma_fim && p.concluido_em)
        .map((p) => (Date.parse(`${p.concluido_em.slice(0, 10)}T00:00:00Z`) - Date.parse(`${p.turma_fim}T00:00:00Z`)) / 86400000)
        .filter((v) => v >= 0);
      return {
        id: s.id, nome: s.nome, cliente: s.cliente, tipo_id: s.tipo_id, tipo: nomeTipo.get(s.tipo_id) || null, ativo: !!s.ativo,
        total: meus.filter((p) => p.status !== "cancelado").length,
        abertos: meus.filter((p) => C.STATUS_ABERTOS.includes(p.status)).length,
        concluidos: conc.length,
        concluidos_90d: conc.filter((p) => (p.concluido_em || "").slice(0, 10) >= corte90).length,
        ultimo_concluido_em: concUlt,
        aguardando_material: pend.filter((p) => p.serie && Number(p.serie.id) === Number(s.id)).length,
        da_turma_ao_material_dias: { n: latencias.length, mediana: latencias.length ? r1(mediana(latencias)) : null },
      };
    });
    const semSerie = pend.filter((p) => !p.serie).length;
    return res.json({ series: out, aguardando_sem_serie: semSerie });
  } catch (e) {
    console.error("[conteudo] listar séries", e.message || e);
    return erro(res, 500, "Erro ao listar as séries");
  }
}

async function salvarSerie(req, res) {
  try {
    const empresaId = escopo(req);
    const b = req.body || {};
    const id = Number(req.params.id) || 0;
    const f = filtroEmpresa(empresaId);
    let atual = null;
    if (id) {
      const [[s]] = await pool.query(`SELECT * FROM conteudo_series WHERE id = ?${f.sql} LIMIT 1`, [id, ...f.params]);
      if (!s) return erro(res, 404, "Série não encontrada");
      atual = s;
    }
    const nome = "nome" in b ? String(b.nome || "").trim() : atual?.nome;
    const cliente = "cliente" in b ? String(b.cliente || "").trim() : atual?.cliente;
    if (!nome || nome.length > 120) return erro(res, 400, "Informe o nome da série");
    if (!cliente) return erro(res, 400, "Informe o cliente da série");
    let tipoId = atual ? atual.tipo_id : null;
    if ("tipo_id" in b) {
      if (b.tipo_id) {
        const [[t]] = await pool.query(`SELECT id FROM conteudo_tipos WHERE id = ?${f.sql} LIMIT 1`, [Number(b.tipo_id), ...f.params]);
        if (!t) return erro(res, 400, "Tipo inválido");
        tipoId = t.id;
      } else tipoId = null;
    }
    const ativo = "ativo" in b ? (b.ativo ? 1 : 0) : atual ? atual.ativo : 1;
    const [rep] = await pool.query(
      `SELECT id FROM conteudo_series WHERE LOWER(nome) = LOWER(?) AND id <> ?${f.sql} LIMIT 1`,
      [nome, id, ...f.params]
    );
    if (rep.length) return erro(res, 400, "Já existe uma série com esse nome");
    if (id) {
      await pool.query("UPDATE conteudo_series SET nome = ?, cliente = ?, tipo_id = ?, ativo = ? WHERE id = ?", [nome, cliente, tipoId, ativo, id]);
    } else {
      const [r] = await pool.query(
        "INSERT INTO conteudo_series (empresa_id, nome, cliente, gatilho, tipo_id, ativo) VALUES (?, ?, ?, 'tbt', ?, ?)",
        [empresaId || null, nome, cliente, tipoId, ativo]
      );
      req.params.id = r.insertId;
    }
    T.limparCache();
    registrarAuditoria({
      usuario: req.user, acao: id ? "editar" : "criar", entidade: "conteudo_serie", entidadeId: id || req.params.id,
      resumo: `${id ? "Editou" : "Criou"} a série "${nome}" (${cliente})${ativo ? "" : " — arquivada"}`, ip: req.ip,
    });
    return res.status(id ? 200 : 201).json({ ok: true, id: id || req.params.id });
  } catch (e) {
    console.error("[conteudo] salvar série", e.message || e);
    return erro(res, 500, "Erro ao salvar a série");
  }
}

module.exports = { pendentes, listarDispensadas, dispensar, desfazerDispensa, buscarTurmas, pedidosDaTurma, listarSeries, salvarSerie };
