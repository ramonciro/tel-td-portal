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
 
// Rótulos amigáveis para os campos mais comuns — usados para transformar
// erros técnicos do MySQL em mensagens que a pessoa usuária entende.
const ROTULOS_CAMPO = {
  email: "e-mail",
  nome: "nome",
  empresa_id: "empresa",
  cliente: "cliente",
  perfil: "perfil",
};
 
function rotuloCampo(campo) {
  return ROTULOS_CAMPO[campo] || campo;
}
 
// Idem, mas para o nome da entidade (config.auditoria.entidade), que hoje é
// gravado sem acento em alguns pontos do código (ex.: "usuario").
const ROTULOS_ENTIDADE = {
  usuario: "usuário",
  treinamento: "treinamento",
  presenca: "presença",
  avaliacao: "avaliação",
  cliente: "cliente",
};
 
function rotuloEntidade(entidade) {
  return ROTULOS_ENTIDADE[entidade] || entidade || "registro";
}
 
/**
 * Traduz um erro de banco (duplicidade, referência inexistente, campo
 * obrigatório faltando) em uma mensagem clara para quem está usando o
 * formulário — em vez do genérico "Erro ao criar/atualizar <tabela>" que
 * não diz o que precisa ser corrigido.
 *
 * Retorna { status, message } sempre que reconhece o erro; retorna null
 * quando não é um caso conhecido, para o chamador aplicar o fallback atual.
 *
 * `entidade` (opcional, ex.: "usuário") deixa a frase mais natural quando
 * disponível (config.auditoria.entidade); sem ela, cai em "registro".
 */
function mensagemAmigavelErroBanco(error, entidadeBruta) {
  const codigo = error?.code;
  const entidade = rotuloEntidade(entidadeBruta);
 
  if (codigo === "ER_DUP_ENTRY") {
    const m = /for key '(?:[\w]+\.)?([\w]+)'/i.exec(error.sqlMessage || "");
    const campo = m ? rotuloCampo(m[1]) : null;
    return {
      status: 409,
      message: campo
        ? `Já existe um ${entidade} cadastrado com esse ${campo}.`
        : `Já existe um ${entidade} cadastrado com esses dados (valor duplicado).`,
    };
  }
 
  if (codigo === "ER_NO_REFERENCED_ROW_2" || codigo === "ER_NO_REFERENCED_ROW") {
    const m = /FOREIGN KEY \(`([\w]+)`\)/i.exec(error.sqlMessage || "");
    const campo = m ? rotuloCampo(m[1]) : null;
    return {
      status: 400,
      message: campo
        ? `O ${campo} informado não existe ou não é válido.`
        : "Um dos valores informados faz referência a um registro que não existe.",
    };
  }
 
  if (codigo === "ER_BAD_NULL_ERROR" || codigo === "ER_NO_DEFAULT_FOR_FIELD") {
    // ER_BAD_NULL_ERROR: campo enviado explicitamente como null.
    // ER_NO_DEFAULT_FOR_FIELD: campo obrigatório nem sequer foi enviado.
    const m = /(?:Column|Field) '([\w]+)'/i.exec(error.sqlMessage || "");
    const campo = m ? rotuloCampo(m[1]) : null;
    return {
      status: 400,
      message: campo
        ? `O campo "${campo}" é obrigatório.`
        : "Um campo obrigatório não foi preenchido.",
    };
  }
 
  if (codigo === "ER_DATA_TOO_LONG") {
    const m = /Data too long for column '([\w]+)'/i.exec(error.sqlMessage || "");
    const campo = m ? rotuloCampo(m[1]) : null;
    return {
      status: 400,
      message: campo
        ? `O valor informado para "${campo}" é maior do que o permitido.`
        : "Um dos valores informados é maior do que o permitido.",
    };
  }
 
  return null;
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
        const amigavel = mensagemAmigavelErroBanco(error, auditoria?.entidade);
        if (amigavel) return res.status(amigavel.status).json({ message: amigavel.message });
        res.status(500).json({ message: `Erro ao criar registro em ${table}.` });
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
        const amigavel = mensagemAmigavelErroBanco(error, auditoria?.entidade);
        if (amigavel) return res.status(amigavel.status).json({ message: amigavel.message });
        res.status(500).json({ message: `Erro ao atualizar registro em ${table}.` });
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
 
