import { Router } from "express";
import { login } from "../controllers/authController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import { listUsers } from "../controllers/usersController.js";
import { listClientes } from "../controllers/clientesController.js";
import { listTreinamentos } from "../controllers/treinamentosController.js";
import { authRequired } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/login", login);
router.get("/dashboard", authRequired, getDashboard);
router.get("/users", authRequired, listUsers);
router.get("/clientes", authRequired, listClientes);
router.get("/treinamentos", authRequired, listTreinamentos);

export default router;
