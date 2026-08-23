const express = require("express");
const router  = express.Router();
const pool    = require("../lib/db");

// Sprint 1 fix: todos os COUNTs filtrados por empresa_id quando disponível.
// req.empresaId é injetado pelo clientMiddleware (lê o JWT).
router.get("/", async (req, res) => {
  try {
    const eId = req.empresaId ?? null;

    // Helper: COUNT de qualquer tabela, com filtro de tenant opcional.
    // Se a coluna empresa_id não existir ainda (migration pendente),
    // cai no fallback sem filtro — preferível a quebrar o dashboard.
    async function countTenant(table, extraWhere = "") {
      try {
        const where = eId
          ? `WHERE empresa_id = ${pool.escape(eId)}${extraWhere ? " AND " + extraWhere : ""}`
          : extraWhere ? `WHERE ${extraWhere}` : "";
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS total FROM \`${table}\` ${where}`
        );
        return Number(row.total || 0);
      } catch (_) {
        // Tabela não existe ou empresa_id não existe ainda — retorna 0
        return 0;
      }
    }

    const [
      clientes,
      usuarios,
      treinamentos,
      presencas,
      avaliacoes,
      biblioteca,
      trilhas,
    ] = await Promise.all([
      countTenant("clientes"),
      countTenant("usuarios"),
      countTenant("treinamentos"),
      countTenant("presencas"),
      countTenant("avaliacoes"),
      countTenant("biblioteca_conteudos"),
      countTenant("trilhas_aprendizagem"),
    ]);

    return res.json({
      clientes,
      usuarios,
      treinamentos,
      presencas,
      avaliacoes,
      biblioteca,
      trilhas,
    });
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
    return res.status(500).json({
      message: "Erro ao carregar dashboard executivo",
      error: error.message,
    });
  }
});

module.exports = router;
