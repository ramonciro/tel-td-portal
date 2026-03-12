import { Router } from "express";
import { login } from "../controllers/authController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import { listClientes } from "../controllers/clientesController.js";
import { listUsers, createUser } from "../controllers/usersController.js";
import { listTreinamentos, createTreinamento } from "../controllers/treinamentosController.js";
import { listPresencas, createPresenca } from "../controllers/presencasController.js";
import { listAvaliacoes, createAvaliacao } from "../controllers/avaliacoesController.js";
import { listMateriaisAvaliativos, createMaterialAvaliativo } from "../controllers/materiaisAvaliativosController.js";
import { authRequired } from "../middlewares/auth.js";
import pool from "../db.js";

const router = Router();

router.post("/auth/login", login);

router.get("/dashboard", authRequired, getDashboard);
router.get("/clientes", authRequired, listClientes);

router.get("/users", authRequired, listUsers);
router.post("/users", authRequired, createUser);

router.get("/treinamentos", authRequired, listTreinamentos);
router.post("/treinamentos", authRequired, createTreinamento);

router.get("/presencas", authRequired, listPresencas);
router.post("/presencas", authRequired, createPresenca);

router.get("/avaliacoes", authRequired, listAvaliacoes);
router.post("/avaliacoes", authRequired, createAvaliacao);

router.get("/materiais-avaliativos", authRequired, listMateriaisAvaliativos);
router.post("/materiais-avaliativos", authRequired, createMaterialAvaliativo);

router.get("/migracao-materiais-avaliativos", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS materiais_avaliativos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        treinamento_id INT,
        titulo VARCHAR(200),
        tipo VARCHAR(50),
        link_arquivo VARCHAR(255),
        observacao TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return res.json({ ok: true, message: "Tabela materiais_avaliativos criada com sucesso" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao criar tabela", error: error.message });
  }
});

export default router;
