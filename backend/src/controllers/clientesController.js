import pool from "../db.js";

export async function listClientes(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, nome, status, supervisor, observacoes
      FROM clientes
      ORDER BY nome ASC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar clientes",
      error: error.message,
    });
  }
}

export async function createClient(req, res) {
  try {
    const { nome, status, supervisor, observacoes } = req.body || {};

    if (!nome) {
      return res.status(400).json({
        ok: false,
        message: "Informe o nome do cliente",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO clientes (nome, status, supervisor, observacoes)
      VALUES (?, ?, ?, ?)
      `,
      [
        nome,
        status || "ativo",
        supervisor || null,
        observacoes || null,
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao criar cliente",
      error: error.message,
    });
  }
}

export async function updateClient(req, res) {
  try {
    const { id } = req.params;
    const { nome, status, supervisor, observacoes } = req.body || {};

    if (!nome) {
      return res.status(400).json({
        ok: false,
        message: "Informe o nome do cliente",
      });
    }

    await pool.query(
      `
      UPDATE clientes
      SET nome = ?, status = ?, supervisor = ?, observacoes = ?
      WHERE id = ?
      `,
      [
        nome,
        status || "ativo",
        supervisor || null,
        observacoes || null,
        id,
      ]
    );

    res.json({
      ok: true,
      message: "Cliente atualizado com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao atualizar cliente",
      error: error.message,
    });
  }
}

export async function deleteClient(req, res) {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM clientes WHERE id = ?", [id]);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao excluir cliente",
      error: error.message,
    });
  }
}

export async function migrarClientesCampos(req, res) {
  try {
    try {
      await pool.query("ALTER TABLE clientes ADD COLUMN status VARCHAR(20) DEFAULT 'ativo'");
    } catch {}
    try {
      await pool.query("ALTER TABLE clientes ADD COLUMN supervisor VARCHAR(120) NULL");
    } catch {}
    try {
      await pool.query("ALTER TABLE clientes ADD COLUMN observacoes TEXT NULL");
    } catch {}

    await pool.query(`
      UPDATE clientes
      SET status = 'ativo'
      WHERE status IS NULL OR status = ''
    `);

    res.json({
      ok: true,
      message: "Campos de clientes atualizados com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao migrar clientes",
      error: error.message,
    });
  }
}
