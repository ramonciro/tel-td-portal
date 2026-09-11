const path = require("path");
const fs = require("fs");
const pool = require("../lib/db");
const { filtroClientesSQL } = require("../lib/acessoCliente");

const uploadDir = path.join(process.cwd(), "uploads", "biblioteca");

function garantirPastaUpload() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

async function listBiblioteca(req, res) {
  try {
    // Pacote 3 (acesso restrito por cliente, generalizar): a listagem nunca
    // recortava por cliente — qualquer instrutor/treinando via TODO
    // material da Biblioteca do tenant, inclusive de outros clientes.
    // Gestor (coordenador/supervisor/superintendente) continua vendo tudo.
    const condicoes = [];
    const params = [];

    if (req.empresaId) {
      condicoes.push("empresa_id = ?");
      params.push(req.empresaId);
    }

    const filtroCliente = filtroClientesSQL(req, "cliente");
    if (filtroCliente) {
      condicoes.push(filtroCliente.sql);
      params.push(...filtroCliente.params);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT
        id,
        titulo,
        tipo,
        cliente,
        categoria,
        publico,
        status,
        link_arquivo,
        descricao,
        created_at
      FROM biblioteca
      ${where}
      ORDER BY id DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error("[bibliotecaController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar biblioteca"});
  }
}

async function createBiblioteca(req, res) {
  try {
    const {
      titulo,
      tipo,
      cliente,
      categoria,
      publico,
      status,
      link_arquivo,
      descricao,
    } = req.body || {};

    if (!titulo || !tipo || !cliente) {
      return res.status(400).json({
        ok: false,
        message: "Preencha título, tipo e cliente",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO biblioteca
      (
        titulo,
        tipo,
        cliente,
        categoria,
        publico,
        status,
        link_arquivo,
        descricao,
        empresa_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        titulo,
        tipo,
        cliente,
        categoria || null,
        publico || null,
        status || "Publicado",
        link_arquivo || null,
        descricao || null,
        req.empresaId ?? null,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
    });
  } catch (error) {
    console.error("[bibliotecaController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar conteúdo"});
  }
}

async function updateBiblioteca(req, res) {
  try {
    const { id } = req.params;
    const {
      titulo,
      tipo,
      cliente,
      categoria,
      publico,
      status,
      link_arquivo,
      descricao,
    } = req.body || {};

    if (!titulo || !tipo || !cliente) {
      return res.status(400).json({
        ok: false,
        message: "Preencha título, tipo e cliente",
      });
    }

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const updateParams = [
      titulo,
      tipo,
      cliente,
      categoria || null,
      publico || null,
      status || "Publicado",
      link_arquivo || null,
      descricao || null,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    const [result] = await pool.query(
      `
      UPDATE biblioteca
      SET
        titulo = ?,
        tipo = ?,
        cliente = ?,
        categoria = ?,
        publico = ?,
        status = ?,
        link_arquivo = ?,
        descricao = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    if (req.empresaId && result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Conteúdo não encontrado." });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[bibliotecaController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar conteúdo"});
  }
}

async function deleteBiblioteca(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await pool.query(
      `SELECT link_arquivo FROM biblioteca WHERE id = ?${tenantCheck} LIMIT 1`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Conteúdo não encontrado." });
    }

    const link = String(rows[0].link_arquivo || "");
    if (link.includes("/uploads/biblioteca/")) {
      const fileName = link.split("/uploads/biblioteca/")[1];
      if (fileName) {
        const fullPath = path.join(uploadDir, fileName);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    await pool.query(`DELETE FROM biblioteca WHERE id = ?${tenantCheck}`, params);

    return res.json({ ok: true });
  } catch (error) {
    console.error("[bibliotecaController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir conteúdo"});
  }
}

async function uploadBibliotecaArquivo(req, res) {
  try {
    garantirPastaUpload();

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "Nenhum arquivo enviado",
      });
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const base = path
      .basename(req.file.originalname || "arquivo", ext)
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    const fileName = `${Date.now()}_${base}${ext}`;
    const fullPath = path.join(uploadDir, fileName);

    fs.writeFileSync(fullPath, req.file.buffer);

    const baseUrl =
      process.env.PUBLIC_BACKEND_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      `${req.protocol}://${req.get("host")}`;

    return res.status(201).json({
      ok: true,
      fileName,
      link_arquivo: `${baseUrl}/uploads/biblioteca/${fileName}`,
      message: "Arquivo enviado com sucesso",
    });
  } catch (error) {
    console.error("[bibliotecaController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao fazer upload do arquivo"});
  }
}

module.exports = {
  listBiblioteca,
  createBiblioteca,
  updateBiblioteca,
  deleteBiblioteca,
  uploadBibliotecaArquivo,
};
