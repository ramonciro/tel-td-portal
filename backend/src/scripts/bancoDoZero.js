#!/usr/bin/env node
/**
 * bancoDoZero.js — cria um banco NOVO do Portal T&D do zero (04/11/2026).
 *
 * O migrate.js só EVOLUI um banco que já existe (algumas tabelas antigas, como
 * materiais_avaliativos e respostas_avaliativas, nunca foram criadas por ele).
 * Este script fecha a lacuna, em 3 passos:
 *   1. aplica a estrutura-base oficial (database/baseline/estrutura_base.sql);
 *   2. roda o migrate.js, que completa e ajusta o que for preciso;
 *   3. (opcional) cria o ambiente inicial e o primeiro super administrador.
 *
 * Usa as mesmas variáveis do servidor: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD,
 * MYSQLDATABASE e MYSQLPORT — o banco de DESTINO. Crie o banco vazio antes
 * (CREATE DATABASE ... CHARACTER SET utf8mb4).
 *
 * Exemplos (a partir da pasta backend/):
 *   node src/scripts/bancoDoZero.js --confirmo
 *   BOOTSTRAP_ADMIN_EMAIL=voce@empresa.com BOOTSTRAP_ADMIN_SENHA='...' \
 *     BOOTSTRAP_EMPRESA_NOME='Comércio' BOOTSTRAP_EMPRESA_CODIGO=comercio \
 *     node src/scripts/bancoDoZero.js --confirmo
 *
 * Segurança: nada é feito sem --confirmo. Se o banco de destino já tiver
 * tabelas, também é preciso --forcar (a estrutura-base só cria o que falta e
 * nunca apaga nada, mas assim ninguém roda isto na produção sem querer).
 * A senha do administrador vem só da variável de ambiente e nunca é impressa.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const tem = (f) => args.includes(f);

const ARQUIVO_BASE = path.resolve(__dirname, "../../../database/baseline/estrutura_base.sql");

function lerComandos(arquivo) {
  const texto = fs
    .readFileSync(arquivo, "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  return texto
    .split(/;\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
}

async function main() {
  if (!tem("--confirmo")) {
    console.log("Este script cria a estrutura do Portal T&D no banco definido em MYSQLDATABASE.");
    console.log("Rode de novo com --confirmo para executar.");
    process.exit(1);
  }
  for (const v of ["MYSQLHOST", "MYSQLUSER", "MYSQLDATABASE"]) {
    if (!process.env[v]) throw new Error(`Variável ${v} não definida.`);
  }

  const pool = require("../lib/db");
  const { runMigrations } = require("../database/migrate");

  const [[{ n: existentes }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
  );
  console.log(`Banco de destino: ${process.env.MYSQLDATABASE} em ${process.env.MYSQLHOST} (${existentes} tabela(s) hoje)`);
  if (existentes > 0 && !tem("--forcar")) {
    console.log("O banco de destino NÃO está vazio. Nada foi feito. Use --forcar só se tiver certeza.");
    await pool.end();
    process.exit(2);
  }

  // 1. estrutura-base
  const comandos = lerComandos(ARQUIVO_BASE);
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const sql of comandos) await conn.query(sql);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
  console.log(`1/3 estrutura-base aplicada (${comandos.length} comandos)`);

  // 2. migrações
  await runMigrations();
  console.log("2/3 migrações aplicadas");

  // conferência: nenhuma chave antiga para a tabela legada
  const [fkLegada] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'treinamentos'
        AND COLUMN_NAME = 'necessidade_id' AND REFERENCED_TABLE_NAME = 'necessidades'`
  );
  if (fkLegada.length) throw new Error("A chave antiga treinamentos.necessidade_id → necessidades ainda existe.");

  // 3. ambiente inicial + primeiro super administrador (opcional)
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
  const senha = process.env.BOOTSTRAP_ADMIN_SENHA || "";
  if (email || senha) {
    if (!email || senha.length < 6) {
      throw new Error("Para criar o administrador, defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_SENHA (6+ caracteres).");
    }
    const bcrypt = require("bcryptjs");
    const nomeEmpresa = (process.env.BOOTSTRAP_EMPRESA_NOME || "Comércio").trim();
    const codigoEmpresa = (process.env.BOOTSTRAP_EMPRESA_CODIGO || "comercio").trim().toLowerCase();
    const nomeAdmin = (process.env.BOOTSTRAP_ADMIN_NOME || "Administrador").trim();

    let [empresas] = await pool.query("SELECT id FROM empresas WHERE codigo = ? LIMIT 1", [codigoEmpresa]);
    if (!empresas.length) {
      await pool.query("INSERT INTO empresas (nome, codigo, ativo) VALUES (?, ?, 1)", [nomeEmpresa, codigoEmpresa]);
      console.log(`   ambiente criado: ${nomeEmpresa} (${codigoEmpresa})`);
    }
    const [existe] = await pool.query("SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
    if (existe.length) {
      console.log("   administrador já existia; nada alterado");
    } else {
      const hash = await bcrypt.hash(senha, 10);
      await pool.query(
        `INSERT INTO usuarios (empresa_id, nome, email, senha, perfil, ativo, troca_senha_obrigatoria, super_admin)
         VALUES (NULL, ?, ?, ?, 'super_admin', 1, 0, 1)`,
        [nomeAdmin, email, hash]
      );
      console.log(`   super administrador criado: ${email}`);
    }
  }

  const [[{ n: tabelas }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
  );
  console.log(`3/3 pronto: ${tabelas} tabelas no banco.`);
  await pool.end();
}

main().catch((e) => {
  console.error("Falhou:", e.message);
  process.exit(1);
});
