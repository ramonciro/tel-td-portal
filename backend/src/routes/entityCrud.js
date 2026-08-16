/**
 * entityCrud.js
 *
 * Sprint 1 — Adicionado suporte a multi-tenancy via flag multiTenant.
 *
 * Quando multiTenant: true, o router:
 *   - GET /      → adiciona WHERE empresa_id = req.empresaId
 *   - POST /     → auto-injeta empresa_id = req.empresaId no INSERT
 *   - PUT /:id   → adiciona AND empresa_id = req.empresaId ao WHERE de segurança
 *   - DELETE /:id→ adiciona AND empresa_id = req.empresaId ao WHERE de segurança
 *
 * Isso garante que nenhum tenant leia ou escreva dados de outro tenant.
 * req.empresaId é populado pelo clientMiddleware (registrado globalmente no index.js).
 *
 * Compatibilidade: tabelas sem multiTenant continuam funcionando exatamente
 * como antes (zero breaking changes).
 */

const express = require("express");
const pool    = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");

function normalizeMiddlewares(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function createCrudRouter({
  table,
  fields,
  orderBy = "id DESC",
  listMiddlewares   = [],
  createMiddlewares = [],
  updateMiddlewares = [],
  deleteMiddlewares = [],
  auditoria   = null,
  multiTenant = false,  // Sprint 1: habilita filtro automático por empresa_id
}) {
  const router = express.Router();

  /* ─── LIST ──────────────────────────────────────────────── */
  router.get(
    "/",
    ...normalizeMiddlewares(listMiddlewares),
    async (req, res) => {
      try {
        const empresaId = multiTenant ? (req.empresaId ?? null) : null;

        let query  = `SELECT * FROM ${table}`;
        let params = [];

        if (multiTenant && empresaId !== null) {
          query  += ` WHERE empresa_id = ?`;
          params  = [empresaId];
        }

        query += ` ORDER BY ${orderBy}`;

        const [rows] = await pool.query(query, params);
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao listar ${table}` });
      }
    }
  );

  /* ─── CREATE ─────────────────────────────────────────────── */
  router.post(
    "/",
    ...normalizeMiddlewares(createMiddlewares),
    async (req, res) => {
      try {
        const data = { ...(req.body || {}) };

        // Sprint 1: injeta empresa_id automaticamente para tabelas multi-tenant
        if (multiTenant && req.empresaId) {
          data.empresa_id = req.empresaId;
        }

        // Considera empresa_id como campo válido mesmo que não esteja em `fields`
        const allFields = multiTenant && !fields.includes("empresa_id")
          ? [...fields, "empresa_id"]
          : fields;

        const cols = allFields.filter((f) =>
          Object.prototype.hasOwnProperty.call(data, f)
        );

        if (!cols.length) {
          return res.status(400).json({ message: "Nenhum campo válido enviado." });
        }

        const placeholders = cols.map(() => "?").join(", ");
        const values       = cols.map((c) => data[c]);

        const [result] = await pool.query(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
          values
        );

        if (auditoria) {
          registrarAuditoria({
            usuario:    req.user,
            acao:       "criar",
            entidade:   auditoria.entidade,
            entidadeId: result.insertId,
            resumo:     auditoria.resumoCriar
              ? auditoria.resumoCriar(data)
              : `${req.user?.nome || "Alguém"} criou ${auditoria.entidade} #${result.insertId}`,
            dadosDepois: data,
            ip: req.ip,
          });
        }

        res.status(201).json({ id: result.insertId, message: "Registro criado com sucesso." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao criar ${table}` });
      }
    }
  );

  /* ─── UPDATE ─────────────────────────────────────────────── */
  router.put(
    "/:id",
    ...normalizeMiddlewares(updateMiddlewares),
    async (req, res) => {
      try {
        const data    = { ...(req.body || {}) };
        const empresaId = multiTenant ? (req.empresaId ?? null) : null;

        const cols = fields.filter((f) =>
          Object.prototype.hasOwnProperty.call(data, f)
        );

        if (!cols.length) {
          return res.status(400).json({ message: "Nenhum campo válido enviado." });
        }

        // Busca o registro antes da edição (auditoria + check de tenant)
        let antes = null;
        if (auditoria || (multiTenant && empresaId)) {
          const tenantCheck = multiTenant && empresaId
            ? ` AND empresa_id = ${pool.escape(empresaId)}`
            : "";
          const [linhas] = await pool.query(
            `SELECT * FROM ${table} WHERE id = ?${tenantCheck}`,
            [req.params.id]
          );
          antes = linhas[0] || null;
          if (!antes) {
            return res.status(404).json({ message: "Registro não encontrado." });
          }
        }

        const setClause = cols.map((c) => `${c} = ?`).join(", ");
        const values    = [...cols.map((c) => data[c]), req.params.id];

        // Sprint 1: WHERE inclui empresa_id para impedir que um tenant
        // sobrescreva dados de outro mesmo com um id válido
        const tenantWhere = multiTenant && empresaId
          ? ` AND empresa_id = ${pool.escape(empresaId)}`
          : "";

        await pool.query(
          `UPDATE ${table} SET ${setClause} WHERE id = ?${tenantWhere}`,
          values
        );

        if (auditoria) {
          registrarAuditoria({
            usuario:    req.user,
            acao:       "editar",
            entidade:   auditoria.entidade,
            entidadeId: req.params.id,
            resumo:     auditoria.resumoEditar
              ? auditoria.resumoEditar(antes, data)
              : `${req.user?.nome || "Alguém"} editou ${auditoria.entidade} #${req.params.id}`,
            dadosAntes:  antes,
            dadosDepois: data,
            ip: req.ip,
          });
        }

        res.json({ message: "Registro atualizado com sucesso." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao atualizar ${table}` });
      }
    }
  );

  /* ─── DELETE ─────────────────────────────────────────────── */
  router.delete(
    "/:id",
    ...normalizeMiddlewares(deleteMiddlewares),
    async (req, res) => {
      try {
        const empresaId = multiTenant ? (req.empresaId ?? null) : null;

        let antes = null;
        if (auditoria || (multiTenant && empresaId)) {
          const tenantCheck = multiTenant && empresaId
            ? ` AND empresa_id = ${pool.escape(empresaId)}`
            : "";
          const [linhas] = await pool.query(
            `SELECT * FROM ${table} WHERE id = ?${tenantCheck}`,
            [req.params.id]
          );
          antes = linhas[0] || null;
          if (!antes) {
            return res.status(404).json({ message: "Registro não encontrado." });
          }
        }

        const tenantWhere = multiTenant && empresaId
          ? ` AND empresa_id = ${pool.escape(empresaId)}`
          : "";

        await pool.query(
          `DELETE FROM ${table} WHERE id = ?${tenantWhere}`,
          [req.params.id]
        );

        if (auditoria) {
          registrarAuditoria({
            usuario:    req.user,
            acao:       "excluir",
            entidade:   auditoria.entidade,
            entidadeId: req.params.id,
            resumo:     auditoria.resumoExcluir
              ? auditoria.resumoExcluir(antes)
              : `${req.user?.nome || "Alguém"} excluiu ${auditoria.entidade} #${req.params.id}`,
            dadosAntes: antes,
            ip: req.ip,
          });
        }

        res.json({ message: "Registro excluído com sucesso." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao excluir ${table}` });
      }
    }
  );

  return router;
}

module.exports = createCrudRouter;
