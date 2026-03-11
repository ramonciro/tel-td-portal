import pool from "../db.js";

export async function runMigration(req, res) {
  const key = req.query.key;

  if (key !== "TelTD2026") {
    return res.status(403).json({ ok: false, message: "Chave inválida" });
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(120),
        email VARCHAR(120) UNIQUE,
        senha VARCHAR(120),
        perfil VARCHAR(50),
        cliente VARCHAR(120),
        ativo BOOLEAN DEFAULT TRUE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(120)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS treinamentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tema VARCHAR(200),
        cliente VARCHAR(120),
        instrutor VARCHAR(120),
        data DATE,
        status VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS presencas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        treinamento_id INT,
        treinando_nome VARCHAR(120),
        presente BOOLEAN
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS avaliacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        treinamento_id INT,
        nota_nps INT,
        nota_qualidade INT,
        comentario TEXT
      )
    `);

    await pool.query(`
      INSERT INTO clientes (nome)
      SELECT * FROM (
        SELECT 'Agibank' AS nome UNION ALL
        SELECT 'Mercantil' UNION ALL
        SELECT 'Crea' UNION ALL
        SELECT 'Buser' UNION ALL
        SELECT 'Rede Américas' UNION ALL
        SELECT 'Prefeitura de Salvador' UNION ALL
        SELECT 'Claro' UNION ALL
        SELECT 'Hugsnet'
      ) AS tmp
      WHERE NOT EXISTS (
        SELECT 1 FROM clientes c WHERE c.nome = tmp.nome
      )
    `);

    await pool.query(`
      INSERT INTO usuarios (nome, email, senha, perfil, cliente, ativo)
      SELECT 'Ramon Ciro', 'admin@teltd.com', 'Tel@2026', 'COORDENADOR', 'GLOBAL', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM usuarios WHERE email = 'admin@teltd.com'
      )
    `);

    return res.json({
      ok: true,
      message: "Migração executada com sucesso",
      tabelas: ["usuarios", "clientes", "treinamentos", "presencas", "avaliacoes"]
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao executar migração",
      error: error.message
    });
  }
}
