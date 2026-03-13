import { Router } from "express";
import { login, alterarSenhaPrimeiroAcesso } from "../controllers/authController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import {
  listClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  migrarClientesCampos
} from "../controllers/clientesController.js";
import { listUsers, createUser, updateUser, deleteUser } from "../controllers/usersController.js";
import { listTreinamentos, createTreinamento, updateTreinamento, deleteTreinamento } from "../controllers/treinamentosController.js";
import { listPresencas, createPresenca, updatePresenca, deletePresenca, migrarPresencasStatus } from "../controllers/presencasController.js";
import { listAvaliacoes, createAvaliacao, updateAvaliacao, deleteAvaliacao } from "../controllers/avaliacoesController.js";
import {
  listMateriaisAvaliativos,
  createMaterialAvaliativo,
  updateMaterialAvaliativo,
  deleteMaterialAvaliativo
} from "../controllers/materiaisAvaliativosController.js";
import { listBiblioteca, createBiblioteca, updateBiblioteca, deleteBiblioteca } from "../controllers/bibliotecaController.js";
import { listTrilhas, createTrilha, updateTrilha, deleteTrilha } from "../controllers/trilhasController.js";
import { authRequired } from "../middlewares/auth.js";
import pool from "../db.js";

const router = Router();

router.post("/auth/login", login);
router.post("/auth/alterar-senha-primeiro-acesso", alterarSenhaPrimeiroAcesso);

router.get("/dashboard", authRequired, getDashboard);

router.get("/clientes", authRequired, listClientes);
router.post("/clientes", authRequired, createCliente);
router.put("/clientes/:id", authRequired, updateCliente);
router.delete("/clientes/:id", authRequired, deleteCliente);
router.get("/migracao-clientes-campos", migrarClientesCampos);

router.get("/users", authRequired, listUsers);
router.post("/users", authRequired, createUser);
router.put("/users/:id", authRequired, updateUser);
router.delete("/users/:id", authRequired, deleteUser);

router.get("/treinamentos", authRequired, listTreinamentos);
router.post("/treinamentos", authRequired, createTreinamento);
router.put("/treinamentos/:id", authRequired, updateTreinamento);
router.delete("/treinamentos/:id", authRequired, deleteTreinamento);

router.get("/presencas", authRequired, listPresencas);
router.post("/presencas", authRequired, createPresenca);
router.put("/presencas/:id", authRequired, updatePresenca);
router.delete("/presencas/:id", authRequired, deletePresenca);
router.get("/migracao-presencas-status", migrarPresencasStatus);

router.get("/avaliacoes", authRequired, listAvaliacoes);
router.post("/avaliacoes", authRequired, createAvaliacao);
router.put("/avaliacoes/:id", authRequired, updateAvaliacao);
router.delete("/avaliacoes/:id", authRequired, deleteAvaliacao);

router.get("/materiais-avaliativos", authRequired, listMateriaisAvaliativos);
router.post("/materiais-avaliativos", authRequired, createMaterialAvaliativo);
router.put("/materiais-avaliativos/:id", authRequired, updateMaterialAvaliativo);
router.delete("/materiais-avaliativos/:id", authRequired, deleteMaterialAvaliativo);

router.get("/biblioteca", authRequired, listBiblioteca);
router.post("/biblioteca", authRequired, createBiblioteca);
router.put("/biblioteca/:id", authRequired, updateBiblioteca);
router.delete("/biblioteca/:id", authRequired, deleteBiblioteca);

router.get("/trilhas", authRequired, listTrilhas);
router.post("/trilhas", authRequired, createTrilha);
router.put("/trilhas/:id", authRequired, updateTrilha);
router.delete("/trilhas/:id", authRequired, deleteTrilha);

router.get("/migracao-usuarios-primeiro-acesso", async (req, res) => {
  try {
    try {
      await pool.query(`ALTER TABLE usuarios ADD COLUMN troca_senha_obrigatoria TINYINT(1) DEFAULT 1`);
    } catch {}
    await pool.query(`
      UPDATE usuarios
      SET troca_senha_obrigatoria = 1
      WHERE troca_senha_obrigatoria IS NULL
    `);
    return res.json({ ok: true, message: "Campo troca_senha_obrigatoria atualizado com sucesso" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao migrar usuários", error: error.message });
  }
});

export default router;
