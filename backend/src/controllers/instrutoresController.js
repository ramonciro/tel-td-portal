/**
 * instrutoresController.js — Cadastro de instrutores (14/10/2026)
 *
 * Problema de origem: o instrutor era só texto livre em treinamentos.instrutor,
 * turma_aulas.instrutor_responsavel e capacidade_instrutor_mensal.instrutor.
 * Cada grafia diferente virava "um instrutor" e quem saía continuava aparecendo
 * até alguém tratar na migração. Agora existe um cadastro (instrutores +
 * instrutor_apelidos) e uma fila "Nomes a classificar" com os nomes que
 * aparecem no histórico e ainda não foram cadastrados.
 *
 * Situações: ativo | desligado | ignorado ("não é instrutor"). Desligado e
 * ignorado saem da lista de quem conta como instrutor hoje (capacidadeResolver),
 * mas o histórico de horas nunca é apagado.
 *
 * Escopo: sempre o tenant de quem está logado (req.empresaId). Leitura:
 * coordenador, supervisor, superintendente. Escrita: coordenador e
 * superintendente (ver index.js).
 */
const pool = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");

const SITUACOES = ["ativo", "desligado", "ignorado"];
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ");
// chave: só trim + minúsculas (igual ao LOWER(TRIM()) do SQL), para que a grafia
// "suja" (espaço duplicado etc.) apareça na fila e a unificação alcance a linha.
const chave = (s) => String(s || "").trim().toLowerCase();

const erro = (res, status, msg, extra = {}) => res.status(status).json({ ok: false, message: msg, ...extra });

// Nomes (e quantidade de turmas/aulas) que aparecem no histórico do tenant.
async function nomesDoHistorico(empresaId) {
  const [turmas] = await pool.query(
    `SELECT TRIM(instrutor) AS nome, COUNT(*) AS n FROM treinamentos
     WHERE empresa_id = ? AND instrutor IS NOT NULL AND TRIM(instrutor) <> '' GROUP BY TRIM(instrutor)`,
    [empresaId]
  );
  const [aulas] = await pool.query(
    `SELECT TRIM(a.instrutor_responsavel) AS nome, COUNT(*) AS n FROM turma_aulas a
     JOIN treinamentos t ON t.id = a.treinamento_id
     WHERE t.empresa_id = ? AND a.instrutor_responsavel IS NOT NULL AND TRIM(a.instrutor_responsavel) <> ''
     GROUP BY TRIM(a.instrutor_responsavel)`,
    [empresaId]
  );
  const [metas] = await pool.query(
    `SELECT TRIM(instrutor) AS nome, COUNT(*) AS n FROM capacidade_instrutor_mensal
     WHERE empresa_id = ? AND instrutor IS NOT NULL AND TRIM(instrutor) <> '' GROUP BY TRIM(instrutor)`,
    [empresaId]
  );
  const mapa = new Map(); // chave -> { nome (primeira grafia), turmas, aulas, metas }
  const somar = (linhas, campo) => {
    for (const l of linhas) {
      const k = chave(l.nome);
      if (!mapa.has(k)) mapa.set(k, { nome: String(l.nome).trim(), turmas: 0, aulas: 0, metas: 0 });
      mapa.get(k)[campo] += Number(l.n);
    }
  };
  somar(turmas, "turmas");
  somar(aulas, "aulas");
  somar(metas, "metas");
  return mapa;
}

async function carregarCadastro(empresaId) {
  const [instrutores] = await pool.query(
    "SELECT * FROM instrutores WHERE empresa_id = ? ORDER BY nome ASC",
    [empresaId]
  );
  const [apelidos] = await pool.query(
    "SELECT id, instrutor_id, apelido FROM instrutor_apelidos WHERE empresa_id = ? ORDER BY apelido ASC",
    [empresaId]
  );
  return { instrutores, apelidos };
}

// GET /api/instrutores?situacao=ativo|desligado|ignorado|todos
async function listar(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const situacao = String(req.query.situacao || "ativo");
    const { instrutores, apelidos } = await carregarCadastro(empresaId);
    const historico = await nomesDoHistorico(empresaId);

    const [usuarios] = await pool.query(
      `SELECT id, nome, pessoa_id, ativo FROM usuarios
       WHERE empresa_id = ? AND LOWER(TRIM(perfil)) = 'instrutor'`,
      [empresaId]
    );
    const usuarioPorNome = new Map(usuarios.map((u) => [chave(u.nome), u]));

    const itens = instrutores
      .filter((i) => situacao === "todos" || i.situacao === situacao)
      .map((i) => {
        const aps = apelidos.filter((a) => a.instrutor_id === i.id);
        const nomes = [i.nome, ...aps.map((a) => a.apelido)].map(chave);
        let turmas = 0; let aulas = 0; let metas = 0;
        for (const k of new Set(nomes)) {
          const h = historico.get(k);
          if (h) { turmas += h.turmas; aulas += h.aulas; metas += h.metas; }
        }
        const u = usuarioPorNome.get(chave(i.nome)) || null;
        return {
          id: i.id, nome: i.nome, situacao: i.situacao,
          data_saida: i.data_saida, motivo: i.motivo, observacao: i.observacao,
          apelidos: aps.map((a) => ({ id: a.id, apelido: a.apelido })),
          turmas, aulas, metas,
          usuario: u ? { id: u.id, ativo: !!u.ativo, pessoa_id: u.pessoa_id || null } : null,
        };
      });

    const contagem = { ativo: 0, desligado: 0, ignorado: 0 };
    for (const i of instrutores) contagem[i.situacao] = (contagem[i.situacao] || 0) + 1;
    return res.json({ ok: true, itens, contagem });
  } catch (e) {
    console.error("[instrutoresController.listar]", e.message || e);
    return erro(res, 500, "Erro ao listar instrutores.");
  }
}

// GET /api/instrutores/opcoes — nomes ativos para os formulários (turma/cronograma)
async function opcoes(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const [rows] = await pool.query(
      "SELECT nome FROM instrutores WHERE empresa_id = ? AND situacao = 'ativo' ORDER BY nome ASC",
      [empresaId]
    );
    return res.json({ ok: true, nomes: rows.map((r) => r.nome) });
  } catch (e) {
    console.error("[instrutoresController.opcoes]", e.message || e);
    return res.json({ ok: true, nomes: [] }); // formulário segue com digitação livre
  }
}

// GET /api/instrutores/a-classificar — nomes do histórico fora do cadastro
async function aClassificar(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const { instrutores, apelidos } = await carregarCadastro(empresaId);
    const conhecidos = new Set([...instrutores.map((i) => chave(i.nome)), ...apelidos.map((a) => chave(a.apelido))]);
    const historico = await nomesDoHistorico(empresaId);
    const itens = [...historico.entries()]
      .filter(([k]) => !conhecidos.has(k))
      .map(([, v]) => v)
      .sort((a, b) => b.turmas + b.aulas - (a.turmas + a.aulas) || a.nome.localeCompare(b.nome, "pt-BR"));
    return res.json({ ok: true, itens });
  } catch (e) {
    console.error("[instrutoresController.aClassificar]", e.message || e);
    return erro(res, 500, "Erro ao listar nomes a classificar.");
  }
}

// POST /api/instrutores { nome, situacao?, motivo?, data_saida?, observacao? }
async function criar(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const nome = norm(req.body?.nome);
    const situacao = SITUACOES.includes(req.body?.situacao) ? req.body.situacao : "ativo";
    if (!nome) return erro(res, 400, "Informe o nome do instrutor.");
    if (nome.length > 150) return erro(res, 400, "Nome muito longo (máx. 150).");
    const [[ja]] = await pool.query(
      `SELECT i.id FROM instrutores i WHERE i.empresa_id = ? AND i.nome = ?
       UNION SELECT a.instrutor_id FROM instrutor_apelidos a WHERE a.empresa_id = ? AND a.apelido = ? LIMIT 1`,
      [empresaId, nome, empresaId, nome]
    );
    if (ja) return erro(res, 409, "Já existe um instrutor ou apelido com esse nome.");
    const [r] = await pool.query(
      `INSERT INTO instrutores (empresa_id, nome, situacao, motivo, data_saida, observacao, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [empresaId, nome, situacao, norm(req.body?.motivo).slice(0, 255) || null,
       req.body?.data_saida || null, norm(req.body?.observacao).slice(0, 2000) || null, req.user?.id || null]
    );
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "instrutor", entidadeId: r.insertId,
      resumo: `${req.user?.nome || "Alguém"} cadastrou o instrutor ${nome} (${situacao})`, ip: req.ip,
    });
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    console.error("[instrutoresController.criar]", e.message || e);
    return erro(res, 500, "Erro ao cadastrar instrutor.");
  }
}

// PUT /api/instrutores/:id { situacao?, motivo?, data_saida?, observacao? }
// O nome oficial só muda por "unificar" (reescreve o histórico junto).
async function atualizar(req, res) {
  try {
    const empresaId = req.empresaId;
    const id = Number(req.params.id);
    const [[antes]] = await pool.query("SELECT * FROM instrutores WHERE id = ? AND empresa_id = ?", [id, empresaId]);
    if (!antes) return erro(res, 404, "Instrutor não encontrado.");
    const b = req.body || {};
    const situacao = b.situacao === undefined ? antes.situacao : b.situacao;
    if (!SITUACOES.includes(situacao)) return erro(res, 400, "Situação inválida.");
    const motivo = b.motivo === undefined ? antes.motivo : (norm(b.motivo).slice(0, 255) || null);
    const observacao = b.observacao === undefined ? antes.observacao : (norm(b.observacao).slice(0, 2000) || null);
    let dataSaida = b.data_saida === undefined ? antes.data_saida : (b.data_saida || null);
    if (dataSaida && !/^\d{4}-\d{2}-\d{2}/.test(String(dataSaida instanceof Date ? dataSaida.toISOString() : dataSaida))) {
      return erro(res, 400, "Data de saída inválida (use AAAA-MM-DD).");
    }
    if (situacao === "ativo") dataSaida = null;
    await pool.query(
      "UPDATE instrutores SET situacao=?, motivo=?, data_saida=?, observacao=? WHERE id=? AND empresa_id=?",
      [situacao, situacao === "ativo" ? null : motivo, dataSaida, observacao, id, empresaId]
    );
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "instrutor", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} alterou o instrutor ${antes.nome}${antes.situacao !== situacao ? ` (${antes.situacao} → ${situacao})` : ""}`,
      dadosAntes: antes, dadosDepois: { situacao, motivo, data_saida: dataSaida, observacao }, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[instrutoresController.atualizar]", e.message || e);
    return erro(res, 500, "Erro ao atualizar instrutor.");
  }
}

// Conta (e, se confirmado, reescreve) o histórico de um nome para o nome oficial.
async function reescreverHistorico(conn, empresaId, de, para, aplicar) {
  const r = { turmas: 0, aulas: 0, metas: 0, metas_conflito: 0 };
  const [[t]] = await conn.query(
    "SELECT COUNT(*) n FROM treinamentos WHERE empresa_id = ? AND LOWER(TRIM(instrutor)) = LOWER(TRIM(?)) AND instrutor <> ?",
    [empresaId, de, para]
  );
  const [[a]] = await conn.query(
    `SELECT COUNT(*) n FROM turma_aulas a JOIN treinamentos t ON t.id = a.treinamento_id
     WHERE t.empresa_id = ? AND LOWER(TRIM(a.instrutor_responsavel)) = LOWER(TRIM(?)) AND a.instrutor_responsavel <> ?`,
    [empresaId, de, para]
  );
  const [[m]] = await conn.query(
    "SELECT COUNT(*) n FROM capacidade_instrutor_mensal WHERE empresa_id = ? AND LOWER(TRIM(instrutor)) = LOWER(TRIM(?)) AND instrutor <> ?",
    [empresaId, de, para]
  );
  r.turmas = Number(t.n); r.aulas = Number(a.n); r.metas = Number(m.n);
  if (!aplicar) return r;
  await conn.query(
    "UPDATE treinamentos SET instrutor = ? WHERE empresa_id = ? AND LOWER(TRIM(instrutor)) = LOWER(TRIM(?))",
    [para, empresaId, de]
  );
  await conn.query(
    `UPDATE turma_aulas a JOIN treinamentos t ON t.id = a.treinamento_id
     SET a.instrutor_responsavel = ?
     WHERE t.empresa_id = ? AND LOWER(TRIM(a.instrutor_responsavel)) = LOWER(TRIM(?))`,
    [para, empresaId, de]
  );
  // UPDATE IGNORE: se já existir meta do mês no nome oficial, a dele prevalece.
  await conn.query(
    "UPDATE IGNORE capacidade_instrutor_mensal SET instrutor = ? WHERE empresa_id = ? AND LOWER(TRIM(instrutor)) = LOWER(TRIM(?))",
    [para, empresaId, de]
  );
  const [[resto]] = await conn.query(
    "SELECT COUNT(*) n FROM capacidade_instrutor_mensal WHERE empresa_id = ? AND LOWER(TRIM(instrutor)) = LOWER(TRIM(?)) AND instrutor <> ?",
    [empresaId, de, para]
  );
  r.metas_conflito = Number(resto.n);
  return r;
}

// POST /api/instrutores/classificar
// { nome, acao: "novo" | "mesmo_que" | "desligado" | "ignorar", instrutor_id?, confirmar? }
// "mesmo_que" sem confirmar só devolve a prévia (quantas turmas/aulas/metas mudam).
async function classificar(req, res) {
  let conn;
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const nome = String(req.body?.nome || "").trim();
    const acao = req.body?.acao;
    if (!nome) return erro(res, 400, "Informe o nome a classificar.");
    if (!["novo", "mesmo_que", "desligado", "ignorar"].includes(acao)) return erro(res, 400, "Ação inválida.");

    const historico = await nomesDoHistorico(empresaId);
    if (!historico.has(chave(nome))) return erro(res, 404, "Esse nome não aparece mais no histórico.");

    if (acao === "mesmo_que") {
      const [[alvo]] = await pool.query("SELECT * FROM instrutores WHERE id = ? AND empresa_id = ?", [Number(req.body?.instrutor_id), empresaId]);
      if (!alvo) return erro(res, 400, "Escolha o instrutor oficial.");
      if (chave(alvo.nome) === chave(nome)) return erro(res, 400, "Esse já é o nome oficial.");
      if (!req.body?.confirmar) {
        const previa = await reescreverHistorico(pool, empresaId, nome, alvo.nome, false);
        return res.json({ ok: true, previa, oficial: alvo.nome });
      }
      conn = await pool.getConnection();
      await conn.beginTransaction();
      await conn.query(
        "INSERT IGNORE INTO instrutor_apelidos (empresa_id, instrutor_id, apelido) VALUES (?,?,?)",
        [empresaId, alvo.id, nome]
      );
      const feito = await reescreverHistorico(conn, empresaId, nome, alvo.nome, true);
      await conn.commit(); conn.release(); conn = null;
      registrarAuditoria({
        usuario: req.user, acao: "editar", entidade: "instrutor", entidadeId: alvo.id,
        resumo: `${req.user?.nome || "Alguém"} unificou "${nome}" em "${alvo.nome}" (${feito.turmas} turma(s), ${feito.aulas} aula(s), ${feito.metas} meta(s))`,
        dadosDepois: { de: nome, para: alvo.nome, ...feito }, ip: req.ip,
      });
      return res.json({ ok: true, feito });
    }

    const situacao = acao === "novo" ? "ativo" : acao === "desligado" ? "desligado" : "ignorado";
    await pool.query(
      `INSERT IGNORE INTO instrutores (empresa_id, nome, situacao, motivo, created_by) VALUES (?,?,?,?,?)`,
      [empresaId, historico.get(chave(nome)).nome, situacao,
       acao === "desligado" ? "Marcado como desligado ao classificar nomes" : acao === "ignorar" ? "Não é instrutor" : null,
       req.user?.id || null]
    );
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "instrutor", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} classificou "${nome}" como ${situacao}`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* ignora */ } conn.release(); }
    console.error("[instrutoresController.classificar]", e.message || e);
    return erro(res, 500, "Erro ao classificar o nome. Nada foi alterado.");
  }
}

// POST /api/instrutores/cadastrar-todos — atalho: todos os nomes pendentes viram instrutor ativo
async function cadastrarTodos(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) return erro(res, 400, "Empresa não identificada.");
    const { instrutores, apelidos } = await carregarCadastro(empresaId);
    const conhecidos = new Set([...instrutores.map((i) => chave(i.nome)), ...apelidos.map((a) => chave(a.apelido))]);
    const historico = await nomesDoHistorico(empresaId);
    const pendentes = [...historico.entries()].filter(([k]) => !conhecidos.has(k)).map(([, v]) => v.nome);
    for (const nome of pendentes) {
      await pool.query(
        "INSERT IGNORE INTO instrutores (empresa_id, nome, situacao, created_by) VALUES (?,?, 'ativo', ?)",
        [empresaId, nome, req.user?.id || null]
      );
    }
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "instrutor", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} cadastrou ${pendentes.length} instrutor(es) de uma vez a partir do histórico`, ip: req.ip,
    });
    return res.json({ ok: true, cadastrados: pendentes.length });
  } catch (e) {
    console.error("[instrutoresController.cadastrarTodos]", e.message || e);
    return erro(res, 500, "Erro ao cadastrar os nomes.");
  }
}

// DELETE /api/instrutores/apelidos/:id — desfaz só o apelido (não desfaz o histórico já reescrito)
async function removerApelido(req, res) {
  try {
    const [r] = await pool.query("DELETE FROM instrutor_apelidos WHERE id = ? AND empresa_id = ?", [Number(req.params.id), req.empresaId]);
    if (!r.affectedRows) return erro(res, 404, "Apelido não encontrado.");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[instrutoresController.removerApelido]", e.message || e);
    return erro(res, 500, "Erro ao remover apelido.");
  }
}

module.exports = { listar, opcoes, aClassificar, criar, atualizar, classificar, cadastrarTodos, removerApelido };
