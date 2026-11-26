// Tela de saúde do sistema (O7, 26/11/2026): só o Super Admin enxerga; mostra jobs, backup, banco, versão e erros.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("http");
const F = require("./helpers/fabrica");
const { iniciar } = require("./helpers/servidor");
const registroJobs = require("../src/lib/registroJobs");

let api, sa, coord;

before(async () => {
  api = await iniciar();
  const A = await F.criarEmpresa();
  sa = await F.criarUsuario({ empresa_id: null, perfil: "super_admin" });
  coord = await F.criarUsuario({ empresa_id: A.id, perfil: "coordenador" });
});
after(async () => {
  await F.pool.query("DELETE FROM sistema_jobs WHERE chave IN ('lembretes','conquistas','rs_lixeira','radar_semanal')").catch(() => {});
  await api.fechar();
  await F.pool.end();
});

const saude = async () => (await api.get("/api/admin/saude", { token: sa.token })).json;
const job = (s, chave) => s.jobs.find((j) => j.chave === chave);

test("só o Super Admin acessa; os outros perfis e quem não está logado são barrados", async () => {
  assert.equal((await api.get("/api/admin/saude")).status, 401);
  for (const perfil of ["coordenador", "supervisor", "superintendente", "instrutor", "treinando"]) {
    const u = await F.criarUsuario({ empresa_id: coord.empresa_id, perfil });
    assert.equal((await api.get("/api/admin/saude", { token: u.token })).status, 403, `${perfil} não pode ver a saúde do sistema`);
  }
  assert.equal((await api.get("/api/admin/saude", { token: sa.token })).status, 200);
});

test("devolve versão, banco, backup, jobs e erros no formato esperado", async () => {
  const s = await saude();
  assert.equal(s.ok, true);
  assert.ok(["ok", "atencao", "critico"].includes(s.geral));
  assert.ok(s.versao.node.startsWith("v"));
  assert.equal(s.banco.responde, true);
  assert.equal(s.banco.migracoes, "ok");
  assert.equal(s.banco.migracoes_detalhe.registrado, true, "o controle de migrações aparece na tela de saúde");
  assert.ok(s.banco.migracoes_detalhe.numeradas_aplicadas >= 1);
  assert.ok(s.banco.migracoes_detalhe.legado, "o legado foi registrado na subida");
  assert.ok(Number.isFinite(s.banco.latencia_ms));
  assert.equal(s.backup.situacao, "desligado", "no teste as variáveis BACKUP_S3_* não existem");
  assert.equal(s.jobs.length, registroJobs.JOBS.length);
  for (const j of s.jobs) assert.ok(["ok", "erro", "atrasado", "sem_registro"].includes(j.situacao));
  assert.ok(Array.isArray(s.erros.itens));
});

test("um job que roda bem aparece como ok, com resumo e duração", async () => {
  const r = await registroJobs.executar("lembretes", async () => ({ enviados: 3 }));
  assert.deepEqual(r, { enviados: 3 }, "o job devolve o mesmo resultado de antes");
  const j = job(await saude(), "lembretes");
  assert.equal(j.situacao, "ok");
  assert.match(j.resumo, /enviados/);
  assert.ok(j.duracao_ms >= 0);
  assert.ok(j.ultima_execucao_em);
});

test("um job que falha aparece como erro, repassa o erro e o aviso geral muda", async () => {
  await assert.rejects(() => registroJobs.executar("rs_lixeira", async () => { throw new Error("banco caiu no meio"); }), /banco caiu no meio/);
  const s = await saude();
  const j = job(s, "rs_lixeira");
  assert.equal(j.situacao, "erro");
  assert.match(j.erro, /banco caiu/);
  assert.equal(s.geral, "atencao");
  assert.ok(s.erros.itens.some((e) => e.origem === "job:rs_lixeira"));
});

test("job que não roda há mais que o limite aparece como atrasado", async () => {
  await registroJobs.executar("conquistas", async () => ({ ok: true }));
  await F.pool.query("UPDATE sistema_jobs SET ultimo_ok_em = NOW() - INTERVAL 100 HOUR, ultima_execucao_em = NOW() - INTERVAL 100 HOUR WHERE chave = 'conquistas'");
  assert.equal(job(await saude(), "conquistas").situacao, "atrasado");
});

test("quando o job devolve { resumo }, só o resumo é guardado (não o objeto gigante)", async () => {
  await registroJobs.executar("radar_semanal", async () => ({ resumo: { itens: 4 }, itens: new Array(500).fill("x") }));
  const j = job(await saude(), "radar_semanal");
  assert.match(j.resumo, /"itens":4/);
  assert.ok(j.resumo.length < 100);
});

test("respostas 5xx são anotadas (método e rota, sem query string); respostas normais e o /api/health não", async () => {
  const app2 = express();
  app2.use(registroJobs.monitorar5xx);
  app2.get("/boom", (req, res) => res.status(500).json({ message: "falhou de propósito" }));
  app2.get("/ok", (req, res) => res.json({ ok: true }));
  app2.get("/api/health/x", (req, res) => res.status(503).json({ status: "fora" }));
  const srv = http.createServer(app2);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const antes = registroJobs.errosRecentes().total_5xx_desde_inicio;
  await fetch(`${base}/boom?cpf=12345678900`);
  await fetch(`${base}/ok`);
  await fetch(`${base}/api/health/x`);
  await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => srv.close(r));
  const e = registroJobs.errosRecentes();
  assert.equal(e.total_5xx_desde_inicio, antes + 1);
  assert.equal(e.itens[0].rota, "/boom");
  assert.equal(e.itens[0].metodo, "GET");
  assert.equal(e.itens[0].status, 500);
  assert.match(e.itens[0].mensagem, /falhou de propósito/);
  assert.ok(!JSON.stringify(e.itens[0]).includes("12345678900"), "a query string (CPF) não pode ser guardada");
});

test("a lista de erros recentes não passa de 30 itens", async () => {
  for (let i = 0; i < 40; i++) registroJobs.registrarErro({ origem: "teste", mensagem: `e${i}` });
  assert.equal(registroJobs.errosRecentes().itens.length, 30);
});
