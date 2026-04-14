const pool = require("../lib/db");

async function listClientes(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, nome, segmento, status, gestor, descricao
      FROM clientes ORDER BY nome ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar clientes", error: error.message });
  }
}

async function createCliente(req, res) {
  try {
    const { nome, segmento, status, gestor, descricao } = req.body || {};

    if (!nome) {
      return res.status(400).json({ ok: false, message: "Informe o nome do cliente" });
    }

    const [result] = await pool.query(
      `INSERT INTO clientes (nome, segmento, status, gestor, descricao) VALUES (?, ?, ?, ?, ?)`,
      [nome, segmento || null, status || "ativo", gestor || null, descricao || null]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar cliente", error: error.message });
  }
}

async function updateCliente(req, res) {
  try {
    const { id } = req.params;
    const { nome, segmento, status, gestor, descricao } = req.body || {};

    if (!nome) {
      return res.status(400).json({ ok: false, message: "Informe o nome do cliente" });
    }

    await pool.query(
      `UPDATE clientes SET nome = ?, segmento = ?, status = ?, gestor = ?, descricao = ? WHERE id = ?`,
      [nome, segmento || null, status || "ativo", gestor || null, descricao || null, id]
    );

    res.json({ ok: true, message: "Cliente atualizado com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar cliente", error: error.message });
  }
}

async function deleteCliente(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM clientes WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir cliente", error: error.message });
  }
}

async function migrarClientesCampos(req, res) {
  try {
    try { await pool.query("ALTER TABLE clientes ADD COLUMN segmento VARCHAR(100) DEFAULT NULL"); } catch {}
    try { await pool.query("ALTER TABLE clientes ADD COLUMN gestor VARCHAR(150) DEFAULT NULL"); } catch {}
    try { await pool.query("ALTER TABLE clientes ADD COLUMN descricao TEXT DEFAULT NULL"); } catch {}
    res.json({ ok: true, message: "Campos de clientes atualizados com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao migrar clientes", error: error.message });
  }
}

module.exports = { listClientes, createCliente, updateCliente, deleteCliente, migrarClientesCampos };
