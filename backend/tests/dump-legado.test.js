// Leitor de dumps antigos (26/11/2026): tira o valor das colunas calculadas do INSERT sem tocar no resto.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dividirValores, dividirTuplas, removerColunasGeradas, tabelaDoCreate, tabelaDoInsert } = require("../src/lib/dumpLegado");

const G = new Set(["ger"]);

test("divide valores respeitando vírgulas, parênteses e aspas dentro do texto", () => {
  const v = dividirValores("1,'a, (b) \\'c\\' d','it''s',NULL,X'00ff',-0.5");
  assert.deepEqual(v, ["1", "'a, (b) \\'c\\' d'", "'it''s'", "NULL", "X'00ff'", "-0.5"]);
});

test("divide tuplas mesmo com ')' e '(' dentro de texto", () => {
  const t = dividirTuplas("(1,'x),(y'),(2,'z')");
  assert.deepEqual(t, ["1,'x),(y'", "2,'z'"]);
});

test("remove a coluna calculada no meio e no fim, em todas as linhas", () => {
  const sql = "INSERT INTO `t` (`id`,`ger`,`txt`) VALUES (1,63,'a, b'),(2,NULL,'c\\nd');";
  const r = removerColunasGeradas(sql, G);
  assert.equal(r.sql, "INSERT INTO `t` (`id`,`txt`) VALUES (1,'a, b'),(2,'c\\nd');");
  assert.deepEqual(r.removidas, ["ger"]);

  const fim = removerColunasGeradas("INSERT INTO `t` (`id`,`txt`,`ger`) VALUES (1,'x',9);", G);
  assert.equal(fim.sql, "INSERT INTO `t` (`id`,`txt`) VALUES (1,'x');");
});

test("texto com ') VALUES (' e barras não confunde a leitura", () => {
  const sql = "INSERT INTO `t` (`id`,`txt`,`ger`) VALUES (1,'fim) VALUES (2,3\\\\',5);";
  const r = removerColunasGeradas(sql, G);
  assert.equal(r.sql, "INSERT INTO `t` (`id`,`txt`) VALUES (1,'fim) VALUES (2,3\\\\');");
});

test("nome de coluna com crase e valores binários/nulos", () => {
  const sql = "INSERT INTO `t` (`a``b`,`ger`,`bin`) VALUES (X'00ff10',NULL,X''),(NULL,7,NULL);";
  const r = removerColunasGeradas(sql, new Set(["ger"]));
  assert.equal(r.sql, "INSERT INTO `t` (`a``b`,`bin`) VALUES (X'00ff10',X''),(NULL,NULL);");
});

test("sem coluna calculada no INSERT (dump novo) devolve exatamente o mesmo texto", () => {
  const sql = "INSERT INTO `t` (`id`,`txt`) VALUES (1,'a'),(2,'b');";
  assert.equal(removerColunasGeradas(sql, G).sql, sql);
  assert.equal(removerColunasGeradas(sql, new Set()).sql, sql);
  assert.equal(removerColunasGeradas(sql, undefined).sql, sql);
});

test("quantidade de valores diferente da de colunas ou texto sem fechar: erro claro, nunca grava errado", () => {
  assert.throws(() => removerColunasGeradas("INSERT INTO `t` (`id`,`ger`) VALUES (1,2,3);", G), /3 valores para 2 colunas/);
  assert.throws(() => removerColunasGeradas("INSERT INTO `t` (`id`,`ger`) VALUES (1,'aberto);", G), /sem fechar/);
});

test("nomes de tabela nos comandos", () => {
  assert.equal(tabelaDoCreate("CREATE TABLE `respostas_avaliativas` (   `id` int"), "respostas_avaliativas");
  assert.equal(tabelaDoCreate("DROP TABLE IF EXISTS `x`;"), null);
  assert.equal(tabelaDoInsert("INSERT INTO `a``b` (`x`) VALUES (1);"), "a`b");
  assert.equal(tabelaDoInsert("SET NAMES utf8mb4;"), null);
});

test("teste de estresse: 3000 linhas com textos cheios de caracteres difíceis, escapados pelo mesmo driver do backup", () => {
  const mysql = require("mysql2");
  const alfabeto = ["'", '"', "\\", ",", "(", ")", ";", "\n", "\r", "\0", "\x1a", "`", "😀", "ã", "ç", " ", "a", "Z", "9", "--", ") VALUES (", "'),('", "NULL"];
  let semente = 12345; // gerador determinístico: o teste sempre repete igual
  const rnd = (n) => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente % n; };
  const texto = () => Array.from({ length: rnd(12) }, () => alfabeto[rnd(alfabeto.length)]).join("");
  const valor = () => {
    const k = rnd(6);
    if (k === 0) return null;
    if (k === 1) return rnd(100000) - 500;
    if (k === 2) return Buffer.from(Array.from({ length: rnd(5) }, () => rnd(256)));
    return texto();
  };
  const linhas = Array.from({ length: 3000 }, () => [rnd(1e6), valor(), valor(), 99, valor()]);
  // colunas: id, a, b, ger (calculada, posição 3), c
  const completo = "INSERT INTO `t` (`id`,`a`,`b`,`ger`,`c`) VALUES " + linhas.map((l) => "(" + l.map((v) => mysql.escape(v)).join(",") + ")").join(",") + ";";
  const esperado = "INSERT INTO `t` (`id`,`a`,`b`,`c`) VALUES " + linhas.map((l) => "(" + [l[0], l[1], l[2], l[4]].map((v) => mysql.escape(v)).join(",") + ")").join(",") + ";";
  const r = removerColunasGeradas(completo, G2);
  assert.equal(r.sql, esperado);
});
const G2 = new Set(["ger"]);
