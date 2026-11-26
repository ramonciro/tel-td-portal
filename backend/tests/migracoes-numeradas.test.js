// Controle de migrações (G7, 26/11/2026): cada migração numerada roda uma vez, em ordem, é registrada,
// falha de forma alta (não silenciosa) e duas instâncias subindo juntas não aplicam em duplicidade.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const F = require("./helpers/fabrica");
const { executarMigracoes, statusMigracoes, listarArquivos } = require("../src/database/runner");

const pool = F.pool;
let seq = 0;
const tabelasCriadas = [];
function novoCenario() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migr-"));
  const tabela = `schema_migrations_t${process.pid}_${++seq}`;
  tabelasCriadas.push(tabela);
  const ctr = { ordem: [] };
  const escrever = (nome, corpo) => fs.writeFileSync(path.join(dir, nome), corpo);
  // migração de teste: registra a ordem em global.__ctr_<tabela> e cria uma tabela marcadora
  const migracao = (marcador, { falha = false, atraso = 0 } = {}) => `
    module.exports = { descricao: "teste ${marcador}", async up({ pool }) {
      ${atraso ? `await new Promise((r) => setTimeout(r, ${atraso}));` : ""}
      ${falha ? `throw new Error("explodiu ${marcador}");` : ""}
      global.__ctr = global.__ctr || {}; (global.__ctr["${tabela}"] = global.__ctr["${tabela}"] || []).push("${marcador}");
    } };`;
  return { dir, tabela, escrever, migracao, execucoes: () => (global.__ctr && global.__ctr[tabela]) || [], opcoes: (extra = {}) => ({ pool, dir, tabela, legado: null, ...extra }) };
}

after(async () => {
  for (const t of tabelasCriadas) await pool.query(`DROP TABLE IF EXISTS \`${t}\``).catch(() => {});
  await pool.end();
});

test("aplica as pendentes em ordem, registra, e na segunda subida não repete nada", async () => {
  const c = novoCenario();
  c.escrever("0002_segunda.js", c.migracao("b"));
  c.escrever("0001_primeira.js", c.migracao("a"));
  c.escrever("LEIA-ME.md", "ignorado");
  const r1 = await executarMigracoes(c.opcoes());
  assert.equal(r1.aplicadas, 2);
  assert.deepEqual(c.execucoes(), ["a", "b"], "ordem pelo número, não pela ordem dos arquivos");
  const [reg] = await pool.query(`SELECT id, tipo, duracao_ms, checksum FROM \`${c.tabela}\` ORDER BY id`);
  assert.deepEqual(reg.map((x) => x.id), ["0001_primeira", "0002_segunda"]);
  assert.ok(reg.every((x) => x.tipo === "numerada" && x.checksum && x.checksum.length === 64));
  const r2 = await executarMigracoes(c.opcoes());
  assert.equal(r2.aplicadas, 0);
  assert.deepEqual(c.execucoes(), ["a", "b"], "nada rodou de novo");
  // chegando uma migração nova, só ela roda
  c.escrever("0003_terceira.js", c.migracao("c"));
  const r3 = await executarMigracoes(c.opcoes());
  assert.equal(r3.aplicadas, 1);
  assert.deepEqual(c.execucoes(), ["a", "b", "c"]);
});

test("migração que falha para tudo com o nome dela, não é registrada e é tentada de novo depois", async () => {
  const c = novoCenario();
  c.escrever("0001_ok.js", c.migracao("a"));
  c.escrever("0002_quebra.js", c.migracao("b", { falha: true }));
  c.escrever("0003_depois.js", c.migracao("c"));
  await assert.rejects(() => executarMigracoes(c.opcoes()), /Migração 0002_quebra falhou: explodiu b/);
  assert.deepEqual(c.execucoes(), ["a"], "a 0003 não roda depois de uma falha");
  const [reg] = await pool.query(`SELECT id FROM \`${c.tabela}\` ORDER BY id`);
  assert.deepEqual(reg.map((x) => x.id), ["0001_ok"], "só a que deu certo fica registrada");
  // corrigida a migração, a próxima subida a aplica (e a seguinte também)
  c.escrever("0002_quebra.js", c.migracao("b"));
  const r = await executarMigracoes(c.opcoes());
  assert.equal(r.aplicadas, 2);
  assert.deepEqual(c.execucoes(), ["a", "b", "c"]);
});

test("o legado roda a cada subida; passos que 'não concluíram e seguiram' são contados e registrados", async () => {
  const c = novoCenario();
  let chamadas = 0;
  const legado = async () => {
    chamadas += 1;
    console.log("  ↳ passo bom: ok");
    console.log("  ↳ alinhamento das datas não concluído (erro x) — seguindo");
  };
  const silenciar = console.log; console.log = () => {};
  const warn = console.warn; console.warn = () => {};
  let r1, r2;
  try {
    r1 = await executarMigracoes(c.opcoes({ legado }));
    r2 = await executarMigracoes(c.opcoes({ legado }));
  } finally { console.log = silenciar; console.warn = warn; }
  assert.equal(chamadas, 2, "o legado continua rodando em toda subida (inclui acertos de dados recorrentes)");
  assert.equal(r1.avisosLegado.length, 1);
  const st = await statusMigracoes({ pool, tabela: c.tabela });
  assert.equal(st.registrado, true);
  assert.equal(st.legado.avisos, 1);
  assert.match(st.legado.detalhe, /alinhamento das datas/);
  assert.ok(st.legado.duracao_ms >= 0);
  assert.ok(r2);
});

test("erro no legado interrompe a subida (como antes) e o console.log volta ao normal", async () => {
  const c = novoCenario();
  const original = console.log;
  await assert.rejects(() => executarMigracoes(c.opcoes({ legado: async () => { throw new Error("legado quebrou"); } })), /legado quebrou/);
  assert.equal(console.log, original, "o console.log não pode ficar trocado depois de um erro");
});

test("arquivo numerado que mudou depois de aplicado não roda de novo e é apontado", async () => {
  const c = novoCenario();
  c.escrever("0001_a.js", c.migracao("a"));
  await executarMigracoes(c.opcoes());
  c.escrever("0001_a.js", c.migracao("a") + "\n// alguém mexeu\n");
  const warn = console.warn; console.warn = () => {};
  let r;
  try { r = await executarMigracoes(c.opcoes()); } finally { console.warn = warn; }
  assert.equal(r.aplicadas, 0);
  assert.deepEqual(r.alteradas, ["0001_a"]);
  assert.deepEqual(c.execucoes(), ["a"]);
  const st = await statusMigracoes({ pool, tabela: c.tabela });
  assert.deepEqual(st.alteradas_depois_de_aplicadas, ["0001_a"]);
});

test("nome de arquivo inválido ou número repetido é recusado antes de mexer no banco", async () => {
  const c1 = novoCenario();
  c1.escrever("nova_migracao.js", c1.migracao("x"));
  assert.throws(() => listarArquivos(c1.dir), /nome inválido/);
  await assert.rejects(() => executarMigracoes(c1.opcoes()), /nome inválido/);
  const c2 = novoCenario();
  c2.escrever("0001_a.js", c2.migracao("a"));
  c2.escrever("0001_b.js", c2.migracao("b"));
  await assert.rejects(() => executarMigracoes(c2.opcoes()), /mesmo número 0001/);
  const [t] = await pool.query("SHOW TABLES LIKE ?", [c2.tabela]);
  assert.equal(t.length, 0, "nem a tabela de controle foi criada");
});

test("duas instâncias subindo juntas: cada migração é aplicada uma única vez", async () => {
  const c = novoCenario();
  c.escrever("0001_lenta.js", c.migracao("lenta", { atraso: 400 }));
  const [r1, r2] = await Promise.all([executarMigracoes(c.opcoes()), executarMigracoes(c.opcoes())]);
  assert.equal(r1.aplicadas + r2.aplicadas, 1);
  assert.deepEqual(c.execucoes(), ["lenta"]);
});

test("no banco de teste, o controle real já aplicou o legado e a 0001 (tabela sistema_jobs existe)", async () => {
  const st = await statusMigracoes({ pool });
  assert.equal(st.registrado, true);
  assert.ok(st.legado, "o legado foi registrado");
  assert.ok(st.numeradas_aplicadas >= 1);
  const [t] = await pool.query("SHOW TABLES LIKE 'sistema_jobs'");
  assert.equal(t.length, 1);
});
