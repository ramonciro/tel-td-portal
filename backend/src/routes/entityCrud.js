const express = require("express");
const pool = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");

function normalizeMiddlewares(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function createCrudRouter({
  table,
  fields,
  orderBy = "id DESC",
  listMiddlewares = [],
  createMiddlewares = [],
  updateMiddlewares = [],
  deleteMiddlewares = [],
  // auditoria (opcional): { entidade, resumoCriar(dados), resumoEditar(antes,depois), resumoExcluir(antes) }
  // Quando presente, toda criação/edição/exclusão nesta tabela é registrada
  // em auditoria_log (backend/src/services/auditoria.js). Tabelas sem essa
  // opção continuam funcionando exatamente como antes — é 100% opt-in.
  auditoria = null,
}) {
  const router = express.Router();

  router.get(
    "/",
    ...normalizeMiddlewares(listMiddlewares),
    async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT * FROM ${table} ORDER BY ${orderBy}`
        );
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao listar ${table}` });
      }
    }
  );

  router.post(
    "/",
    ...normalizeMiddlewares(createMiddlewares),
    async (req, res) => {
      try {
        const data = req.body || {};
        const cols = fields.filter((f) =>
          Object.prototype.hasOwnProperty.call(data, f)
        );

        if (!cols.length) {
          return res
            .status(400)
            .json({ message: "Nenhum campo válido enviado" });
        }

        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map((c) => data[c]);

        const [result] = await pool.query(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
          values
        );

        if (auditoria) {
          registrarAuditoria({
            usuario: req.user,
            acao: "criar",
            entidade: auditoria.entidade,
            entidadeId: result.insertId,
            resumo: auditoria.resumoCriar
              ? auditoria.resumoCriar(data)
              : `${req.user?.nome || "Alguém"} criou ${auditoria.entidade} #${result.insertId}`,
            dadosDepois: data,
            ip: req.ip,
          });
        }

        res.status(201).json({
          id: result.insertId,
          message: "Registro criado com sucesso",
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao criar ${table}` });
      }
    }
  );

  router.put(
    "/:id",
    ...normalizeMiddlewares(updateMiddlewares),
    async (req, res) => {
      try {
        const data = req.body || {};
        const cols = fields.filter((f) =>
          Object.prototype.hasOwnProperty.call(data, f)
        );

        if (!cols.length) {
          return res
            .status(400)
            .json({ message: "Nenhum campo válido enviado" });
        }

        // busca o registro ANTES de alterar, só quando auditoria está ativa
        // nesta tabela (evita 1 SELECT extra por request nas tabelas sem
        // auditoria configurada).
        let antes = null;
        if (auditoria) {
          const [linhas] = await pool.query(
            `SELECT * FROM ${table} WHERE id = ?`,
            [req.params.id]
          );
          antes = linhas[0] || null;
        }

        const setClause = cols.map((c) => `${c} = ?`).join(", ");
        const values = cols.map((c) => data[c]);
        values.push(req.params.id);

        await pool.query(
          `UPDATE ${table} SET ${setClause} WHERE id = ?`,
          values
        );

        if (auditoria) {
          registrarAuditoria({
            usuario: req.user,
            acao: "editar",
            entidade: auditoria.entidade,
            entidadeId: req.params.id,
            resumo: auditoria.resumoEditar
              ? auditoria.resumoEditar(antes, data)
              : `${req.user?.nome || "Alguém"} editou ${auditoria.entidade} #${req.params.id}`,
            dadosAntes: antes,
            dadosDepois: data,
            ip: req.ip,
          });
        }

        res.json({ message: "Registro atualizado com sucesso" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao atualizar ${table}` });
      }
    }
  );

  router.delete(
    "/:id",
    ...normalizeMiddlewares(deleteMiddlewares),
    async (req, res) => {
      try {
        let antes = null;
        if (auditoria) {
          const [linhas] = await pool.query(
            `SELECT * FROM ${table} WHERE id = ?`,
            [req.params.id]
          );
          antes = linhas[0] || null;
        }

        await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);

        if (auditoria) {
          registrarAuditoria({
            usuario: req.user,
            acao: "excluir",
            entidade: auditoria.entidade,
            entidadeId: req.params.id,
            resumo: auditoria.resumoExcluir
              ? auditoria.resumoExcluir(antes)
              : `${req.user?.nome || "Alguém"} excluiu ${auditoria.entidade} #${req.params.id}`,
            dadosAntes: antes,
            ip: req.ip,
          });
        }

        res.json({ message: "Registro excluído com sucesso" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Erro ao excluir ${table}` });
      }
    }
  );

  return router;
}

module.exports = createCrudRouter;
