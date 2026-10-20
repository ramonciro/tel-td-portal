/**
 * avisosRoutes.js — sino de avisos (21/10/2026). Cada pessoa só enxerga os próprios avisos.
 */
const express = require("express");
const svc = require("../services/avisosService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    await svc.sincronizar(req.user, req.empresaId ?? null, { forcar: req.query.atualizar === "1" });
    res.json(await svc.listar(req.user));
  } catch (e) {
    console.error("[avisos] listar:", e.message);
    // O sino nunca deve atrapalhar o resto do portal.
    res.json({ nao_lidos: 0, itens: [], indisponivel: true });
  }
});

router.post("/lidos", async (req, res) => {
  try {
    await svc.marcarTodosLidos(req.user);
    res.json({ ok: true });
  } catch (e) {
    console.error("[avisos] lidos:", e.message);
    res.status(500).json({ message: "Não foi possível marcar os avisos como lidos." });
  }
});

router.post("/:id/lido", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Aviso inválido." });
    await svc.marcarLido(req.user, id);
    res.json({ ok: true });
  } catch (e) {
    console.error("[avisos] lido:", e.message);
    res.status(500).json({ message: "Não foi possível marcar o aviso como lido." });
  }
});

module.exports = router;
