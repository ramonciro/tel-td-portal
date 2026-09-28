const pool = require("../lib/db");
const { pessoaIdDoUsuario } = require("../services/pessoasService");
const { condicaoIdentidade } = require("../lib/identidadeTreinando");

async function listAvaliacoesTreinandos(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();
    const treinamentoId = req.query?.treinamento_id ? Number(req.query.treinamento_id) : null;

    // LEFT JOIN + WHERE (em vez de INNER) preserva o comportamento anterior
    // para respostas cujo treinamento tenha sido excluído, mas isola por
    // tenant quando req.empresaId é real.
    const wheres = [];
    const params = [];

    if (req.empresaId) {
      wheres.push("t.empresa_id = ?");
      params.push(req.empresaId);
    }

    // Filtro opcional por turma — usado pela tela turma/[id]/nps para não
    // precisar trazer o NPS de todas as turmas do tenant só pra mostrar uma.
    if (treinamentoId) {
      wheres.push("at.treinamento_id = ?");
      params.push(treinamentoId);
    }

    // Bugfix (segurança): este endpoint permite o perfil "treinando" (porque
    // ele também é usado pra registrar a própria resposta via POST), mas até
    // aqui o GET só filtrava por tenant — um treinando autenticado recebia,
    // na resposta, o NPS (nome, comentário e nota) de TODAS as turmas do
    // cliente, mesmo que a tela só mostre esse dado pra coordenador/
    // supervisor/instrutor. Agora, pro perfil treinando, a consulta só
    // retorna as respostas que ele mesmo enviou.
    //
    // 25/09/2026: comparação trocada de nome exato pra pessoa_id (ver
    // identidadeTreinando.js) — fecha o risco de dois treinandos com o
    // mesmo nome verem a resposta um do outro.
    if (perfil === "treinando") {
      if (!nomeUsuario) {
        return res.status(400).json({ ok: false, message: "Usuário não identificado" });
      }
      const pessoaId = await pessoaIdDoUsuario(req.user?.id);
      const condicao = condicaoIdentidade("at", "treinando_nome", pessoaId, nomeUsuario);
      wheres.push(condicao.sql);
      params.push(...condicao.params);
    }

    const whereClause = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT
        at.id,
        at.treinamento_id,
        at.treinando_nome,
        at.nota_nps,
        at.comentario,
        at.created_at,
        t.tema,
        t.cliente,
        t.instrutor
      FROM avaliacoes_treinandos at
      LEFT JOIN treinamentos t ON t.id = at.treinamento_id
      ${whereClause}
      ORDER BY at.id DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error("[avaliacoesTreinandosController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar respostas de NPS"});
  }
}

async function listNpsDisponivel(req, res) {
  try {
    const nomeUsuario = String(req.user?.nome || "").trim();
    const perfil = String(req.user?.perfil || "").toLowerCase();

    if (!nomeUsuario) {
      return res.status(400).json({
        ok: false,
        message: "Usuário não identificado",
      });
    }

    // Para treinando: só mostra turmas em que ele participa e ainda não
    // respondeu. 25/09/2026: os dois casamentos (participa da turma / já
    // respondeu) agora preferem pessoa_id a nome exato (ver
    // identidadeTreinando.js) — mesma trava de LGPD do GET acima.
    if (perfil === "treinando") {
      const pessoaId = await pessoaIdDoUsuario(req.user?.id);
      const condTp = condicaoIdentidade("tp", "nome", pessoaId, nomeUsuario);
      const condAt = condicaoIdentidade("at", "treinando_nome", pessoaId, nomeUsuario);
      const tenantWhere = req.empresaId ? " AND t.empresa_id = ?" : "";
      const params = [...condTp.params, ...condAt.params, ...(req.empresaId ? [req.empresaId] : [])];

      const [rows] = await pool.query(
        `
        SELECT
          t.id,
          t.tema,
          t.cliente,
          t.instrutor,
          t.data,
          t.data_inicio,
          t.data_fim
        FROM treinamentos t
        INNER JOIN treinamento_participantes tp
          ON tp.treinamento_id = t.id
         AND ${condTp.sql}
        LEFT JOIN avaliacoes_treinandos at
          ON at.treinamento_id = t.id
         AND ${condAt.sql}
        WHERE at.id IS NULL${tenantWhere}
        ORDER BY COALESCE(t.data_fim, t.data_inicio, t.data) DESC, t.id DESC
        `,
        params
      );

      return res.json(rows);
    }

    // Para coord/sup/instrutor: retorna todas as turmas
    const tenantWhere = req.empresaId ? "WHERE empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await pool.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        data,
        data_inicio,
        data_fim
      FROM treinamentos
      ${tenantWhere}
      ORDER BY COALESCE(data_fim, data_inicio, data) DESC, id DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error("[avaliacoesTreinandosController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar NPS disponível"});
  }
}

async function createAvaliacaoTreinando(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();

    let { treinamento_id, treinando_nome, nota_nps, comentario } = req.body || {};

    // 25/09/2026: pessoa_id só é gravado quando é o próprio treinando se
    // auto-registrando (é o único caso em que sabemos, com certeza, que
    // "quem está logado" e "de quem é este registro" são a mesma pessoa —
    // quando um coordenador registra em nome de um treinando via nome
    // digitado, continuamos sem essa garantia, então pessoa_id fica NULL
    // como já era o comportamento até aqui).
    let pessoaId = null;
    if (perfil === "treinando") {
      treinando_nome = nomeUsuario;
      pessoaId = await pessoaIdDoUsuario(req.user?.id);
    }

    if (!treinamento_id || !treinando_nome || nota_nps === undefined || nota_nps === null) {
      return res.status(400).json({
        ok: false,
        message: "Preencha todos os campos obrigatórios",
      });
    }

    nota_nps = Number(nota_nps);

    if (Number.isNaN(nota_nps) || nota_nps < 0 || nota_nps > 10) {
      return res.status(400).json({
        ok: false,
        message: "A nota NPS deve estar entre 0 e 10",
      });
    }

    if (req.empresaId) {
      const [treinamentoDoTenant] = await pool.query(
        `SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ?`,
        [treinamento_id, req.empresaId]
      );
      if (!treinamentoDoTenant.length) {
        return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
      }
    }

    // Se for treinando, valida se ele realmente pertence à turma (pessoa_id
    // quando disponível, nome como antes pra conta/participante antigo).
    if (perfil === "treinando") {
      const condTp = condicaoIdentidade("tp", "nome", pessoaId, nomeUsuario);
      const [participa] = await pool.query(
        `
        SELECT id AS id
        FROM treinamento_participantes tp
        WHERE tp.treinamento_id = ? AND ${condTp.sql}
        LIMIT 1
        `,
        [treinamento_id, ...condTp.params]
      );

      if (!participa.length) {
        return res.status(403).json({
          ok: false,
          message: "Você só pode avaliar treinamentos em que está participando",
        });
      }
    }

    // Checagem de duplicidade: usa pessoa_id quando a submissão é do
    // próprio treinando (mesma lógica de identidade acima); pra registro
    // feito por coordenador em nome de alguém, continua pelo nome exato,
    // como sempre foi.
    const condDuplicado = pessoaId
      ? condicaoIdentidade("avaliacoes_treinandos", "treinando_nome", pessoaId, treinando_nome)
      : { sql: "avaliacoes_treinandos.treinando_nome = ?", params: [treinando_nome] };
    const [duplicado] = await pool.query(
      `
      SELECT id
      FROM avaliacoes_treinandos
      WHERE treinamento_id = ?
        AND ${condDuplicado.sql}
      LIMIT 1
      `,
      [treinamento_id, ...condDuplicado.params]
    );

    if (duplicado.length) {
      return res.status(400).json({
        ok: false,
        message: "Esse treinando já respondeu o NPS dessa turma",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO avaliacoes_treinandos
      (treinamento_id, treinando_nome, nota_nps, comentario, pessoa_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [treinamento_id, treinando_nome, nota_nps, comentario || null, pessoaId]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "NPS enviado com sucesso",
    });
  } catch (error) {
    console.error("[avaliacoesTreinandosController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar NPS"});
  }
}

module.exports = {
  listAvaliacoesTreinandos,
  listNpsDisponivel,
  createAvaliacaoTreinando,
};
