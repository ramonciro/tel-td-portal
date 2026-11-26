/**
 * ambiente.js — configura o ambiente dos testes ANTES de qualquer outro require do backend.
 *
 * Os testes usam um banco MySQL/MariaDB descartável. Variáveis (todas opcionais):
 *   TEST_MYSQLHOST (127.0.0.1), TEST_MYSQLPORT (3306), TEST_MYSQLUSER (root),
 *   TEST_MYSQLPASSWORD (""), TEST_MYSQLDATABASE (td_test)
 * As variáveis MYSQL* "normais" (as do Railway) são IGNORADAS de propósito, e os testes se recusam a rodar
 * contra um banco que não seja local ou cujo nome não contenha "test": nada aqui pode encostar no banco de produção.
 */
const host = process.env.TEST_MYSQLHOST || "127.0.0.1";
const banco = process.env.TEST_MYSQLDATABASE || "td_test";

if (!/^(127\.0\.0\.1|localhost|mysql|mariadb)$/i.test(host)) {
  throw new Error(`Testes só rodam em banco local (TEST_MYSQLHOST="${host}" recusado).`);
}
if (!/test/i.test(banco)) {
  throw new Error(`O nome do banco de teste precisa conter "test" (recebido "${banco}").`);
}

process.env.MYSQLHOST = host;
process.env.MYSQLPORT = process.env.TEST_MYSQLPORT || "3306";
process.env.MYSQLUSER = process.env.TEST_MYSQLUSER || "root";
process.env.MYSQLPASSWORD = process.env.TEST_MYSQLPASSWORD || "";
process.env.MYSQLDATABASE = banco;
process.env.JWT_SECRET = "segredo-somente-de-teste";
process.env.NODE_ENV = "test";
// Sem backup, e-mail nem integrações externas durante os testes.
for (const k of Object.keys(process.env)) {
  if (/^(BACKUP_S3_|SMTP_|RESEND_)/.test(k)) delete process.env[k];
}

module.exports = { host, banco };
