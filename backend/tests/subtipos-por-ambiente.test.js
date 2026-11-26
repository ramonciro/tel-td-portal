// Subtipos por ambiente (decisão do Ramon, 26/11/2026): cada ambiente tem o seu catálogo, e renomear/desativar
// um subtipo só mexe nas turmas, ações, jornadas e metas do próprio ambiente.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const F = require("./helpers/fabrica");
const { iniciar } = require("./helpers/servidor");
const subtipos = require("../src/lib/subtipos");

let api, A, B, ua, ub;

before(async () => {
  api = await iniciar();
  A = await F.criarEmpresa();
  B = await F.criarEmpresa();
  ua = await F.criarUsuario({ empresa_id: A.id, perfil: "coordenador" });
  ub = await F.criarUsuario({ empresa_id: B.id, perfil: "coordenador" });
});
after(async () => { await api.fechar(); await F.pool.end(); });

const lista = async (u, extra = "") => (await api.get(`/api/subtipos${extra}`, { token: u.token })).json;
const nomes = (l) => l.map((s) => s.nome).sort();

test("ambiente novo recebe uma cópia do catálogo modelo na primeira consulta", async () => {
  const la = await lista(ua);
  const lb = await lista(ub);
  assert.ok(la.length >= 7, "A deveria ter os subtipos iniciais");
  assert.deepEqual(nomes(la), nomes(lb));
  const [[{ n }]] = await F.pool.query("SELECT COUNT(*) AS n FROM subtipos WHERE empresa_id = ? AND chave_sistema = 'avaliacao_tecnica'", [A.id]);
  assert.equal(Number(n), 1, "o subtipo de sistema (Avaliação Técnica) também é copiado");
});

test("criar subtipo em A não aparece em B", async () => {
  const r = await api.post("/api/subtipos", { nome: "Só do A" }, { token: ua.token });
  assert.equal(r.status, 201);
  assert.ok(nomes(await lista(ua)).includes("Só do A"));
  assert.ok(!nomes(await lista(ub)).includes("Só do A"));
  // o mesmo nome pode existir nos dois ambientes
  const r2 = await api.post("/api/subtipos", { nome: "Só do A" }, { token: ub.token });
  assert.equal(r2.status, 201);
  // mas não duas vezes no mesmo ambiente
  const r3 = await api.post("/api/subtipos", { nome: "só do a" }, { token: ua.token });
  assert.equal(r3.status, 409);
});

test("renomear em A atualiza só as turmas de A (mesmo texto em B fica intacto)", async () => {
  const la = await lista(ua);
  const alvoA = la.find((s) => s.nome === "Treinamento Técnico");
  const turmaA = await F.criarTurma({ empresa_id: A.id, subtipo: "Treinamento Técnico" });
  const turmaB = await F.criarTurma({ empresa_id: B.id, subtipo: "Treinamento Técnico" });

  const r = await api.put(`/api/subtipos/${alvoA.id}`, { nome: "Capacitação Técnica" }, { token: ua.token });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.turmas_atualizadas, 1);

  const [[ta]] = await F.pool.query("SELECT subtipo FROM treinamentos WHERE id = ?", [turmaA.id]);
  const [[tb]] = await F.pool.query("SELECT subtipo FROM treinamentos WHERE id = ?", [turmaB.id]);
  assert.equal(ta.subtipo, "Capacitação Técnica");
  assert.equal(tb.subtipo, "Treinamento Técnico", "a turma do outro ambiente não pode mudar");
  assert.ok(nomes(await lista(ub)).includes("Treinamento Técnico"), "catálogo de B continua com o nome antigo");
  assert.ok(!nomes(await lista(ub)).includes("Capacitação Técnica"));
});

test("um ambiente não consegue editar nem desativar subtipo de outro", async () => {
  const lb = await lista(ub);
  const alvoB = lb.find((s) => s.nome === "Outro");
  const r1 = await api.put(`/api/subtipos/${alvoB.id}`, { nome: "Invadido" }, { token: ua.token });
  assert.equal(r1.status, 404);
  const r2 = await api.del(`/api/subtipos/${alvoB.id}`, { token: ua.token });
  assert.equal(r2.status, 404);
  assert.ok(nomes(await lista(ub)).includes("Outro"));
});

test("desativar em A não desativa em B; o subtipo de sistema não pode ser desativado", async () => {
  const la = await lista(ua);
  const outroA = la.find((s) => s.nome === "Outro");
  const r = await api.del(`/api/subtipos/${outroA.id}`, { token: ua.token });
  assert.equal(r.status, 200);
  assert.ok(!nomes(await lista(ua)).includes("Outro"));
  assert.ok(nomes(await lista(ub)).includes("Outro"));

  const avA = la.find((s) => s.chave_sistema === "avaliacao_tecnica");
  const bloqueio = await api.del(`/api/subtipos/${avA.id}`, { token: ua.token });
  assert.equal(bloqueio.status, 409);
});

test("validação do subtipo de uma turma usa só o catálogo do ambiente", async () => {
  assert.equal(await subtipos.normalizeSubtipo("Só do A", null, A.id), "Só do A");
  assert.equal(await subtipos.normalizeSubtipo("Capacitação Técnica", null, A.id), "Capacitação Técnica");
  assert.equal(await subtipos.normalizeSubtipo("Capacitação Técnica", null, B.id), null, "B não tem esse subtipo");
  assert.equal(await subtipos.normalizeSubtipo("Treinamento Técnico", null, B.id), "Treinamento Técnico");
  // valor que a turma já tinha é preservado mesmo fora do catálogo ativo
  assert.equal(await subtipos.normalizeSubtipo("Outro", "Outro", A.id), "Outro");
});

test("a regra de Avaliação Técnica reconhece o nome renomeado de qualquer ambiente", async () => {
  const la = await lista(ua);
  const avA = la.find((s) => s.chave_sistema === "avaliacao_tecnica");
  await api.put(`/api/subtipos/${avA.id}`, { nome: "Seleção Técnica A" }, { token: ua.token });
  assert.equal(await subtipos.ehSubtipoAvaliacaoTecnica("Seleção Técnica A"), true);
  assert.equal(await subtipos.ehSubtipoAvaliacaoTecnica("Seleção Técnica A", A.id), true);
  assert.equal(await subtipos.ehSubtipoAvaliacaoTecnica("Seleção Técnica A", B.id), false, "no ambiente B esse nome não é Avaliação Técnica");
  assert.equal(await subtipos.ehSubtipoAvaliacaoTecnica("Avaliação Técnica", B.id), true);
  assert.equal(await subtipos.ehSubtipoAvaliacaoTecnica("Treinamento Técnico"), false);
});

test("a migração copia o catálogo modelo para ambientes que ainda não têm catálogo", async () => {
  const C = await F.criarEmpresa();
  const [[antes]] = await F.pool.query("SELECT COUNT(*) AS n FROM subtipos WHERE empresa_id = ?", [C.id]);
  assert.equal(Number(antes.n), 0);
  const { runMigrations } = require("../src/database/migrate");
  const log = console.log; console.log = () => {};
  try { await runMigrations(); } finally { console.log = log; }
  const [[depois]] = await F.pool.query("SELECT COUNT(*) AS n FROM subtipos WHERE empresa_id = ?", [C.id]);
  assert.ok(Number(depois.n) >= 7);
  // e é idempotente: rodar de novo não duplica
  console.log = () => {};
  try { await runMigrations(); } finally { console.log = log; }
  const [[dep2]] = await F.pool.query("SELECT COUNT(*) AS n FROM subtipos WHERE empresa_id = ?", [C.id]);
  assert.equal(Number(dep2.n), Number(depois.n));
});
