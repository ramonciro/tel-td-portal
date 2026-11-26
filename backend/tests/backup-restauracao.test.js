// Backup → restauração de ponta a ponta (26/11/2026).
// Achado: o dump gravava também o valor das colunas calculadas (GENERATED), o MySQL recusa isso no INSERT
// e a restauração parava no meio (todas as tabelas depois de "respostas_avaliativas" ficariam de fora).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const F = require("./helpers/fabrica");
const backup = require("../src/services/backupService");

const BANCO_DESTINO = "td_test_restauracao";
const SCRIPT = path.resolve(__dirname, "../src/scripts/restaurarBackup.js");
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "bk-test-"));
const dump = path.join(pasta, "dump.sql.gz");
let podeCriarBanco = true;

const colunas = "id, txt, js, HEX(bin) AS bin, dt, dec_, nul, ger";

before(async () => {
  await F.pool.query("DROP TABLE IF EXISTS zz_bk_a");
  await F.pool.query(
    `CREATE TABLE zz_bk_a (
       id INT AUTO_INCREMENT PRIMARY KEY, txt TEXT, js LONGTEXT, bin BLOB, dt DATETIME, dec_ DECIMAL(10,2),
       nul VARCHAR(10) NULL, ger INT GENERATED ALWAYS AS (CHAR_LENGTH(txt)) VIRTUAL
     ) DEFAULT CHARSET=utf8mb4`
  );
  await F.pool.query(
    "INSERT INTO zz_bk_a (txt, js, bin, dt, dec_, nul) VALUES (?,?,?,?,?,?), (?,?,?,?,?,?), (?,?,?,?,?,?)",
    [
      "Ação 😀 \"aspas\" 'apóstrofo' \\barra; ponto-e-vírgula", '{"a":[1,{"b":"çã"}]}', Buffer.from([0, 255, 16]), "2026-11-26 17:05:09", "1234.50", null,
      "linha1\nlinha2\r\nlinha3;", "[]", null, null, "-0.01", "x",
      "-- parece comentário", "{}", Buffer.alloc(0), "2026-01-01 00:00:00", "0", "",
    ]
  );
  await backup.gerarDump(dump);
  try {
    await F.pool.query(`DROP DATABASE IF EXISTS ${BANCO_DESTINO}`);
    await F.pool.query(`CREATE DATABASE ${BANCO_DESTINO} CHARACTER SET utf8mb4`);
  } catch {
    podeCriarBanco = false; // usuário de teste sem permissão para criar banco: pula a parte de restauração
  }
});

after(async () => {
  await F.pool.query("DROP TABLE IF EXISTS zz_bk_a").catch(() => {});
  await F.pool.query(`DROP DATABASE IF EXISTS ${BANCO_DESTINO}`).catch(() => {});
  await F.pool.end();
  fs.rmSync(pasta, { recursive: true, force: true });
});

const restaurar = (arquivo, extra = []) =>
  spawnSync(process.execPath, [SCRIPT, "--arquivo", arquivo, "--confirmo", ...extra], {
    env: { ...process.env, MYSQLDATABASE: BANCO_DESTINO },
    encoding: "utf8",
    timeout: 120000,
  });

test("o dump não grava o valor de colunas calculadas (o MySQL recusaria no INSERT)", () => {
  const sql = zlib.gunzipSync(fs.readFileSync(dump)).toString("utf8");
  const insert = sql.split("\n").find((l) => l.startsWith("INSERT INTO `zz_bk_a`"));
  assert.ok(insert, "a tabela de teste está no dump");
  assert.ok(!/`ger`/.test(insert), "a coluna calculada não entra no INSERT");
  assert.ok(/`txt`/.test(insert) && /`bin`/.test(insert));
  // a definição da tabela continua com a coluna calculada, para o banco recalcular
  assert.ok(/GENERATED ALWAYS AS/i.test(sql.split("\n").find((l) => l.startsWith("CREATE TABLE `zz_bk_a`"))));
});

test("tabela sem coluna calculada continua com SELECT *", async () => {
  const sel = await backup.sqlSelecionar(F.pool, "usuarios");
  assert.equal(sel, "SELECT * FROM `usuarios`");
});

test("restaura tudo, confere a contagem e os dados batem (acento, emoji, quebra de linha, binário, nulo, coluna calculada)", async (t) => {
  if (!podeCriarBanco) return t.skip("sem permissão para criar banco de destino");
  const r = restaurar(dump);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /CONFERE\./);
  assert.match(r.stdout, /Banco restaurado e conferido\./);

  const [origem] = await F.pool.query(`SELECT ${colunas} FROM zz_bk_a ORDER BY id`);
  const [destino] = await F.pool.query(`SELECT ${colunas} FROM ${BANCO_DESTINO}.zz_bk_a ORDER BY id`);
  assert.equal(destino.length, 3);
  assert.deepEqual(destino, origem);
  assert.equal(destino[0].ger, origem[0].ger, "a coluna calculada foi recalculada pelo banco");
});

test("backup cortado (sem a linha final de conferência) é recusado com mensagem clara", async (t) => {
  if (!podeCriarBanco) return t.skip("sem permissão para criar banco de destino");
  const texto = zlib.gunzipSync(fs.readFileSync(dump)).toString("utf8").split("\n").filter((l) => !l.startsWith("-- fim:")).join("\n");
  const cortado = path.join(pasta, "cortado.sql.gz");
  fs.writeFileSync(cortado, zlib.gzipSync(texto));
  const r = restaurar(cortado, ["--forcar"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cortado|incompleto/);
});

test("comando que falha no meio mostra qual foi e quantos já tinham rodado", async (t) => {
  if (!podeCriarBanco) return t.skip("sem permissão para criar banco de destino");
  const ruim = path.join(pasta, "ruim.sql.gz");
  fs.writeFileSync(ruim, zlib.gzipSync("SET NAMES utf8mb4;\nINSERT INTO tabela_que_nao_existe (a) VALUES (1);\n-- fim: 0 tabelas, 0 linhas\n"));
  const r = restaurar(ruim, ["--forcar"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Comando que falhou/);
  assert.match(r.stderr, /tabela_que_nao_existe/);
  assert.match(r.stderr, /1 comandos tinham rodado/);
});

test("conferência acusa divergência quando a contagem do backup não bate", async (t) => {
  if (!podeCriarBanco) return t.skip("sem permissão para criar banco de destino");
  const texto = zlib.gunzipSync(fs.readFileSync(dump)).toString("utf8").replace(/-- fim: (\d+) tabelas, (\d+) linhas/, (_, a, b) => `-- fim: ${a} tabelas, ${Number(b) + 5} linhas`);
  const falso = path.join(pasta, "falso.sql.gz");
  fs.writeFileSync(falso, zlib.gzipSync(texto));
  const r = restaurar(falso, ["--forcar"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DIVERGE\./);
});
