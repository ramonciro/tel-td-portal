/**
 * instrutoresTurmaController.js — Instrutores adicionais da turma (TBT, 22/10/2026)
 *
 *   GET /api/treinamentos-instrutores        → { mapa: { [treinamento_id]: [nomes] } } (tenant inteiro)
 *   GET /api/treinamentos/:id/instrutores    → { principal, adicionais, todos }
 *   PUT /api/treinamentos/:id/instrutores    → { instrutores: [nomes] } troca a lista inteira
 *
 * Quem altera a lista: coordenação, supervisor e assistente de treinamento; o
 * instrutor principal da turma também (mas a tela só oferece a lista de nomes
 * à gestão). Cada nome precisa ser um instrutor cadastrado do mesmo ambiente.
 */
const pool = require("../lib/db");
const { tenantScopeFor } = require("../lib/tenantScope");
const { registrarAuditoria } = require("../services/auditoria");
const { chave, adicionaisDaTurma, todosOsInstrutores } = require("../lib/instrutoresTurma");

const GESTAO = ["coordenador", "supervisor", "assistente_treinamento", "super_admin"];
const MAX_ADICIONAIS = 10;
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });
const escopo = (req) => tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
const perfilDe = (req) => chave(req.user?.perfil);

async function buscarTurma(req, id) {
  const empresaId = escopo(req);
  const [rows] = await pool.query(
    `SELECT id, tema, cliente, instrutor, empresa_id FROM treinamentos WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [id, empresaId] : [id]
  );
  return rows[0] || null;
}

async function mapa(req, res) {
  try {
    const empresaId = escopo(req);
    const [rows] = await pool.query(
      `SELECT ti.treinamento_id, TRIM(ti.instrutor) AS instrutor
         FROM treinamento_instrutores ti
         JOIN treinamentos t ON t.id = ti.treinamento_id
        ${empresaId ? "WHERE t.empresa_id = ?" : ""}
        ORDER BY ti.treinamento_id, ti.id`,
      empresaId ? [empresaId] : []
    );
    const out = {};
    for (const r of rows) (out[r.treinamento_id] ||= []).push(r.instrutor);
    return res.json({ ok: true, mapa: out });
  } catch (e) {
    // tabela ainda não criada (backend subindo): a tela segue sem os adicionais
    return res.json({ ok: true, mapa: {} });
  }
}

async function obter(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return erro(res, 400, "Turma inválida.");
    const turma = await buscarTurma(req, id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");
    const adicionais = await adicionaisDaTurma(id);
    return res.json({ ok: true, principal: turma.instrutor || null, adicionais, todos: todosOsInstrutores(turma.instrutor, adicionais) });
  } catch (e) {
    console.error("[instrutoresTurma.obter]", e.message || e);
    return erro(res, 500, "Erro ao carregar os instrutores da turma.");
  }
}

async function salvar(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return erro(res, 400, "Turma inválida.");
    const turma = await buscarTurma(req, id);
    if (!turma) return erro(res, 404, "Turma não encontrada.");

    const ehGestao = GESTAO.includes(perfilDe(req));
    const ehPrincipal = perfilDe(req) === "instrutor" && chave(turma.instrutor) === chave(req.user?.nome);
    if (!ehGestao && !ehPrincipal) return erro(res, 403, "Sem permissão para alterar os instrutores desta turma.");

    const bruto = Array.isArray(req.body?.instrutores) ? req.body.instrutores : null;
    if (!bruto) return erro(res, 400, "Envie a lista de instrutores.");

    // limpa: sem vazio, sem repetido, sem o principal, só texto curto
    const vistos = new Set([chave(turma.instrutor)]);
    const nomes = [];
    for (const n of bruto) {
      const nome = String(n || "").trim().slice(0, 150);
      if (!nome || vistos.has(chave(nome))) continue;
      vistos.add(chave(nome));
      nomes.push(nome);
    }
    if (nomes.length > MAX_ADICIONAIS) return erro(res, 400, `No máximo ${MAX_ADICIONAIS} instrutores adicionais por turma.`);

    // cada nome precisa ser um instrutor cadastrado no mesmo ambiente da turma
    if (nomes.length) {
      const [validos] = await pool.query(
        `SELECT TRIM(nome) AS nome FROM usuarios
          WHERE LOWER(TRIM(perfil)) = 'instrutor'${turma.empresa_id ? " AND empresa_id = ?" : ""}
            AND LOWER(TRIM(nome)) IN (${nomes.map(() => "?").join(",")})`,
        turma.empresa_id ? [turma.empresa_id, ...nomes.map(chave)] : nomes.map(chave)
      );
      const porChave = new Map(validos.map((v) => [chave(v.nome), v.nome]));
      const invalidos = nomes.filter((n) => !porChave.has(chave(n)));
      if (invalidos.length) return erro(res, 400, `Não é instrutor cadastrado neste ambiente: ${invalidos.join(", ")}.`);
      for (let i = 0; i < nomes.length; i += 1) nomes[i] = porChave.get(chave(nomes[i])); // grafia oficial do cadastro
    }

    const antes = await adicionaisDaTurma(id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM treinamento_instrutores WHERE treinamento_id = ?", [id]);
      for (const nome of nomes) {
        await conn.query(
          "INSERT INTO treinamento_instrutores (empresa_id, treinamento_id, instrutor, criado_por) VALUES (?, ?, ?, ?)",
          [turma.empresa_id || null, id, nome, req.user?.nome || null]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "treinamento", entidadeId: id,
      resumo: `Instrutores adicionais da turma "${turma.tema || "?"}": ${nomes.length ? nomes.join(", ") : "nenhum"}`,
      dadosAntes: { instrutores_adicionais: antes }, dadosDepois: { instrutores_adicionais: nomes }, ip: req.ip,
    });

    return res.json({ ok: true, adicionais: nomes, todos: todosOsInstrutores(turma.instrutor, nomes) });
  } catch (e) {
    console.error("[instrutoresTurma.salvar]", e.message || e);
    return erro(res, 500, "Erro ao salvar os instrutores da turma.");
  }
}

module.exports = { mapa, obter, salvar };
