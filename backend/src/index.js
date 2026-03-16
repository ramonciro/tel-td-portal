const express = require("express");
const cors = require("cors");
const multer = require("multer");

const db = require("./lib/db");
const createCrudRouter = require("./lib/createCrudRouter");

const {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
} = require("./controllers/treinamentoParticipantesController");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, message: "API online" });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao validar saúde da API",
      error: error.message,
    });
  }
});

/* DASHBOARD */
app.get("/api/dashboard", async (req, res) => {
  try {
    const [[clientes]] = await db.query(
      "SELECT COUNT(*) AS total FROM clientes"
    );
    const [[treinamentos]] = await db.query(
      "SELECT COUNT(*) AS total FROM treinamentos"
    );
    const [[presencas]] = await db.query(
      "SELECT COUNT(*) AS total FROM presencas"
    );
    const [[avaliacoes]] = await db.query(
      "SELECT COUNT(*) AS total FROM avaliacoes"
    );
    const [[biblioteca]] = await db.query(
      "SELECT COUNT(*) AS total FROM biblioteca"
    );
    const [[trilhas]] = await db.query(
      "SELECT COUNT(*) AS total FROM trilhas"
    );

    res.json({
      clientes: clientes.total || 0,
      treinamentos: treinamentos.total || 0,
      presencas: presencas.total || 0,
      avaliacoes: avaliacoes.total || 0,
      biblioteca: biblioteca.total || 0,
      trilhas: trilhas.total || 0,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard",
      error: error.message,
    });
  }
});

/* LOGIN */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({
        message: "Informe e-mail e senha",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        nome,
        email,
        senha,
        perfil,
        cliente,
        ativo,
        troca_senha_obrigatoria
      FROM usuarios
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      });
    }

    const user = rows[0];

    if (String(user.senha) !== String(senha)) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      });
    }

    if (Number(user.ativo) !== 1) {
      return res.status(403).json({
        message: "Usuário inativo",
      });
    }

    return res.json({
      token: `token-${user.id}`,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        cliente: user.cliente,
        ativo: user.ativo,
        troca_senha_obrigatoria: Number(user.troca_senha_obrigatoria) === 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao realizar login",
      error: error.message,
    });
  }
});

app.post("/api/auth/alterar-senha", async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({
        message: "Informe e-mail e nova senha",
      });
    }

    await db.query(
      `
      UPDATE usuarios
      SET senha = ?, troca_senha_obrigatoria = 0
      WHERE email = ?
      `,
      [novaSenha, email]
    );

    return res.json({
      ok: true,
      message: "Senha alterada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao alterar senha",
      error: error.message,
    });
  }
});

app.post("/api/auth/alterar-senha-primeiro-acesso", async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({
        message: "Informe e-mail e nova senha",
      });
    }

    await db.query(
      `
      UPDATE usuarios
      SET senha = ?, troca_senha_obrigatoria = 0
      WHERE email = ?
      `,
      [novaSenha, email]
    );

    return res.json({
      ok: true,
      message: "Senha alterada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao alterar senha de primeiro acesso",
      error: error.message,
    });
  }
});

/* MIGRAÇÕES */
app.get("/api/migracao-usuarios-primeiro-acesso", async (req, res) => {
  try {
    try {
      await db.query(
        `ALTER TABLE usuarios ADD COLUMN troca_senha_obrigatoria TINYINT(1) DEFAULT 1`
      );
    } catch (_) {}

    await db.query(`
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

app.get("/api/migracao-clientes-campos", async (req, res) => {
  try {
    try {
      await db.query(`ALTER TABLE clientes ADD COLUMN supervisor VARCHAR(150) NULL`);
    } catch (_) {}

    try {
      await db.query(`ALTER TABLE clientes ADD COLUMN observacoes TEXT NULL`);
    } catch (_) {}

    try {
      await db.query(`ALTER TABLE clientes ADD COLUMN status VARCHAR(30) NULL`);
    } catch (_) {}

    return res.json({
      ok: true,
      message: "Campos de clientes verificados com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro na migração de clientes",
      error: error.message,
    });
  }
});

app.get("/api/migracao-presencas-status", async (req, res) => {
  try {
    try {
      await db.query(`ALTER TABLE presencas ADD COLUMN status VARCHAR(20) NULL`);
    } catch (_) {}

    try {
      await db.query(`ALTER TABLE presencas ADD COLUMN justificativa TEXT NULL`);
    } catch (_) {}

    await db.query(`
      UPDATE presencas
      SET status = CASE
        WHEN status IS NOT NULL THEN status
        WHEN presente = 1 THEN 'presente'
        ELSE 'ausente'
      END
      WHERE status IS NULL
    `);

    return res.json({
      ok: true,
      message: "Migração de presenças concluída",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro na migração de presenças",
      error: error.message,
    });
  }
});

/* CRUD CLIENTES */
app.use(
  "/api/clientes",
  createCrudRouter({
    table: "clientes",
    fields: ["nome", "status", "supervisor", "observacoes"],
  })
);

/* CRUD USUÁRIOS */
app.use(
  "/api/users",
  createCrudRouter({
    table: "usuarios",
    fields: [
      "nome",
      "email",
      "senha",
      "perfil",
      "cliente",
      "ativo",
      "troca_senha_obrigatoria",
    ],
  })
);

/* TREINAMENTOS */
app.use(
  "/api/treinamentos",
  createCrudRouter({
    table: "treinamentos",
    fields: [
      "tema",
      "cliente",
      "instrutor",
      "data",
      "carga_horaria",
      "participantes",
      "publico",
      "status",
      "descricao",
      "supervisor",
    ],
  })
);

/* ROTA EXTRA: DETALHE DO TREINAMENTO */
app.get("/api/treinamentos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        data,
        carga_horaria,
        participantes,
        publico,
        status,
        descricao,
        supervisor
      FROM treinamentos
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Treinamento não encontrado",
      });
    }

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar treinamento",
      error: error.message,
    });
  }
});

/* PARTICIPANTES DA TURMA */
app.get(
  "/api/treinamentos/:id/participantes",
  getParticipantesByTreinamento
);

app.post(
  "/api/treinamentos/importar-participantes",
  upload.single("arquivo"),
  importarParticipantesExcel
);

app.post(
  "/api/treinamentos/salvar-chamada",
  salvarChamadaParticipantes
);

/* PRESENÇAS */
app.use(
  "/api/presencas",
  createCrudRouter({
    table: "presencas",
    fields: [
      "treinamento_id",
      "treinando_nome",
      "presente",
      "status",
      "justificativa",
    ],
  })
);

/* AVALIAÇÕES */
app.use(
  "/api/avaliacoes",
  createCrudRouter({
    table: "avaliacoes",
    fields: [
      "titulo",
      "nota_qualidade",
      "nota_nps",
      "comentario",
      "treinamento_id",
    ],
  })
);

/* MATERIAIS AVALIATIVOS */
app.use(
  "/api/materiais-avaliativos",
  createCrudRouter({
    table: "materiais_avaliativos",
    fields: ["titulo", "tipo", "cliente", "descricao", "link_arquivo", "status"],
  })
);

/* BIBLIOTECA */
app.use(
  "/api/biblioteca",
  createCrudRouter({
    table: "biblioteca",
    fields: ["titulo", "tipo", "cliente", "descricao", "link_arquivo", "status"],
  })
);

/* TRILHAS */
app.use(
  "/api/trilhas",
  createCrudRouter({
    table: "trilhas",
    fields: ["titulo", "cliente", "publico", "descricao", "status"],
  })
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
