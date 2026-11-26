/**
 * preparar-banco.js — recria o banco de teste do zero: estrutura-base oficial + migrate.js.
 * Roda uma vez antes da suíte (`npm test` já faz isso). Seguro: ver helpers/ambiente.js.
 */
const fs = require("fs");
const path = require("path");
const { banco } = require("./helpers/ambiente");
const mysql = require("mysql2/promise");

async function main() {
  const admin = await mysql.createConnection({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    multipleStatements: false,
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${banco}\``);
  await admin.query(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4`);
  await admin.query(`USE \`${banco}\``);
  await admin.query("SET FOREIGN_KEY_CHECKS = 0");

  const sql = fs.readFileSync(path.join(__dirname, "..", "..", "database", "baseline", "estrutura_base.sql"), "utf8");
  // A estrutura-base garante: cada comando termina em ";" no fim da linha e não há ";" dentro de texto.
  const comandos = sql
    .split(/;[ \t]*\r?\n/)
    .map((c) => c.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const c of comandos) await admin.query(c);
  await admin.end();

  const { runMigrations } = require("../src/database/migrate");
  const log = console.log;
  console.log = () => {}; // o migrate.js é muito falante
  try {
    await runMigrations();
  } finally {
    console.log = log;
  }
  console.log(`Banco de teste "${banco}" pronto (${comandos.length} comandos da estrutura-base + migrações).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Falha ao preparar o banco de teste:", e);
  process.exit(1);
});
