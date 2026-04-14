import { Router } from "express";
import multer from "multer";

import { login, alterarSenhaPrimeiroAcesso } from "../controllers/authController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import { getDashboardTreinamentos } from "../controllers/dashboardTreinamentosController.js";

import {
  listClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  migrarClientesCampos,
} from "../controllers/clientesController.js";

import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/usersController.js";

import {
  listTreinamentos,
  createTreinamento,
  updateTreinamento,
  deleteTreinamento,
  getTreinamentoById,
} from "../controllers/treinamentosController.js";

import {
  listPresencas,
  createPresenca,
  updatePresenca,
  deletePresenca,
  migrarPresencasStatus,
  getPresencasByTreinamento,
  savePresencasLote,
  deletePresencaByTreinamentoAndNome
} from "../controllers/presencasController.js";

import {
  listAvaliacoes,
  createAvaliacao,
  updateAvaliacao,
  deleteAvaliacao,
} from "../controllers/avaliacoesController.js";

import {
  listMateriaisAvaliativos,
  createMaterialAvaliativo,
  updateMaterialAvaliativo,
  deleteMaterialAvaliativo,
} from "../controllers/materiaisAvaliativosController.js";

import {
  listBiblioteca,
  createBiblioteca,
  updateBiblioteca,
  deleteBiblioteca,
} from "../controllers/bibliotecaController.js";

import {
  listTrilhas,
  createTrilha,
  updateTrilha,
  deleteTrilha,
} from "../controllers/trilhasController.js";

import {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
} from "../controllers/treinamentoParticipantesController.js";

import {
  listAvaliacoesTreinandos,
  createAvaliacaoTreinando,
} from "../controllers/avaliacoesTreinandosController.js";

import { authRequired } from "../middlewares/auth.js";
import pool from "../db.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* =========================
   AUTENTICAÇÃO
========================= */
router.post("/auth/login", login);
router.post("/auth/alterar-senha-primeiro-acesso", alterarSenhaPrimeiroAcesso);

/* =========================
   DASHBOARDS
========================= */
router.get("/dashboard", authRequired, getDashboard);
router.get("/dashboard/treinamentos", authRequired, getDashboardTreinamentos);

/* =========================
   CLIENTES
========================= */
router.get("/clientes", authRequired, listClientes);
router.post("/clientes", authRequired, createCliente);
router.put("/clientes/:id", authRequired, updateCliente);
router.delete("/clientes/:id", authRequired, deleteCliente);

/* rota de migração protegida */
router.get("/migracao-clientes-campos", authRequired, migrarClientesCampos);

/* =========================
   USUÁRIOS
   Mantive /users e adicionei /usuarios
   para compatibilidade com o frontend
========================= */
router.get("/users", authRequired, listUsers);
router.post("/users", authRequired, createUser);
router.put("/users/:id", authRequired, updateUser);
router.delete("/users/:id", authRequired, deleteUser);

router.get("/usuarios", authRequired, listUsers);
router.post("/usuarios", authRequired, createUser);
router.put("/usuarios/:id", authRequired, updateUser);
router.delete("/usuarios/:id", authRequired, deleteUser);

/* =========================
   TREINAMENTOS
========================= */
router.get("/treinamentos", authRequired, listTreinamentos);
router.get("/treinamentos/:id", authRequired, getTreinamentoById);
router.post("/treinamentos", authRequired, createTreinamento);
router.put("/treinamentos/:id", authRequired, updateTreinamento);
router.delete("/treinamentos/:id", authRequired, deleteTreinamento);

router.get(
  "/treinamentos/:id/participantes",
  authRequired,
  getParticipantesByTreinamento
);

router.post(
  "/treinamentos/importar-participantes",
  authRequired,
  upload.single("arquivo"),
  importarParticipantesExcel
);

router.post(
  "/treinamentos/salvar-chamada",
  authRequired,
  salvarChamadaParticipantes
);

/* =========================
   PRESENÇAS
========================= */
router.get("/presencas", authRequired, listPresencas);
router.get("/presencas/treinamento/:id", authRequired, getPresencasByTreinamento);
router.post("/presencas", authRequired, createPresenca);
router.post("/presencas/lote", authRequired, savePresencasLote);
router.put("/presencas/:id", authRequired, updatePresenca);
router.delete("/presencas/:id", authRequired, deletePresenca);
router.delete("/presencas/participante/remover", authRequired, deletePresencaByTreinamentoAndNome);
router.get("/migracao-presencas-status", authRequired, migrarPresencasStatus);

/* rota de migração protegida */
router.get("/migracao-presencas-status", authRequired, migrarPresencasStatus);

/* =========================
   AVALIAÇÕES
========================= */
router.get("/avaliacoes", authRequired, listAvaliacoes);
router.post("/avaliacoes", authRequired, createAvaliacao);
router.put("/avaliacoes/:id", authRequired, updateAvaliacao);
router.delete("/avaliacoes/:id", authRequired, deleteAvaliacao);

/* =========================
   NPS REAL DO TREINANDO
========================= */
router.get("/avaliacoes-treinandos", authRequired, listAvaliacoesTreinandos);
router.post("/avaliacoes-treinandos", authRequired, createAvaliacaoTreinando);

/* =========================
   MATERIAIS AVALIATIVOS
========================= */
router.get("/materiais-avaliativos", authRequired, listMateriaisAvaliativos);
router.post("/materiais-avaliativos", authRequired, createMaterialAvaliativo);
router.put("/materiais-avaliativos/:id", authRequired, updateMaterialAvaliativo);
router.delete("/materiais-avaliativos/:id", authRequired, deleteMaterialAvaliativo);

/* =========================
   BIBLIOTECA
========================= */
router.get("/biblioteca", authRequired, listBiblioteca);
router.post("/biblioteca", authRequired, createBiblioteca);
router.put("/biblioteca/:id", authRequired, updateBiblioteca);
router.delete("/biblioteca/:id", authRequired, deleteBiblioteca);

/* =========================
   TRILHAS
========================= */
router.get("/trilhas", authRequired, listTrilhas);
router.post("/trilhas", authRequired, createTrilha);
router.put("/trilhas/:id", authRequired, updateTrilha);
router.delete("/trilhas/:id", authRequired, deleteTrilha);

/* =========================
   MIGRAÇÃO DE USUÁRIOS
========================= */
router.get("/migracao-usuarios-primeiro-acesso", authRequired, async (req, res) => {
  try {
    try {
      await pool.query(
        `
        ALTER TABLE usuarios
        ADD COLUMN troca_senha_obrigatoria TINYINT(1) DEFAULT 1
        `
      );
    } catch {
      /* coluna já existe */
    }

    await pool.query(`
      UPDATE usuarios
      SET troca_senha_obrigatoria = 1
      WHERE troca_senha_obrigatoria IS NULL
    `);

    return res.json({
      ok: true,
      message: "Campo troca_senha_obrigatoria atualizado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao migrar usuários",
      error: error.message,
    });
  }
});

export default router;
