// Radar × R&S: o R&S atende a empresa toda (as RPs não têm "ambiente" próprio); cada ambiente do T&D só enxerga
// as RPs dos SEUS clientes. Clientes cadastrados pelo R&S (origem = 'rs') não são clientes do T&D.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const F = require("./helpers/fabrica");
const { iniciar } = require("./helpers/servidor");
const { calcularDemandaRS } = require("../src/services/preventivoCargaService");

let api, A, B, RS, ua, tag;

const diaFuturo = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

async function criarRp({ empresa_id, produto, cliente_id = null, dias = 5 }) {
  const [r] = await F.pool.query(
    `INSERT INTO rps (empresa_id, mes_referencia, site, setor, produto, cargo, chamado, status, hcs, hcs_com_to, inicio_av_tecnica, final_av_tecnica, cliente_id)
     VALUES (?, CURDATE(), 'Salvador', 'OPERACIONAL', ?, 'Operador', ?, 'EM ANDAMENTO', 10, 10, ?, ?, ?)`,
    [empresa_id, produto, `CH-${Math.random().toString(36).slice(2, 8)}`, diaFuturo(dias), diaFuturo(dias + 3), cliente_id]
  );
  return r.insertId;
}

before(async () => {
  api = await iniciar();
  tag = F.unico("rt").replace(/[^a-z0-9]/gi, "");
  A = await F.criarEmpresa();
  B = await F.criarEmpresa();
  RS = await F.criarEmpresa(); // onde o R&S grava as RPs (o R&S não tem ambiente próprio de verdade)
  ua = await F.criarUsuario({ empresa_id: A.id });
});
after(async () => { await api.fechar(); await F.pool.end(); });

test("cada ambiente vê só as RPs dos seus clientes", async () => {
  const cliA = await F.criarCliente(A.id, `Alfa${tag} Seguros`);
  await F.criarCliente(B.id, `Beta${tag} Telecom`);
  const rpAlfa = await criarRp({ empresa_id: RS.id, produto: `Alfa${tag} Seguros` });
  const rpBeta = await criarRp({ empresa_id: RS.id, produto: `Beta${tag} Telecom` });
  const rpDesconhecida = await criarRp({ empresa_id: RS.id, produto: `Gama${tag} Varejo` });

  const dA = await calcularDemandaRS({ empresaId: A.id });
  const idsA = dA.avaliacoes.map((x) => x.rp_id);
  assert.ok(idsA.includes(rpAlfa), "A vê a RP do cliente dele");
  assert.ok(!idsA.includes(rpBeta), "A não vê a RP do cliente de B");
  assert.ok(!idsA.includes(rpDesconhecida), "A não vê RP de cliente que não é dele");
  assert.equal(dA.avaliacoes.find((x) => x.rp_id === rpAlfa).cliente_ambiente, cliA.nome);

  const dB = await calcularDemandaRS({ empresaId: B.id });
  const idsB = dB.avaliacoes.map((x) => x.rp_id);
  assert.ok(idsB.includes(rpBeta));
  assert.ok(!idsB.includes(rpAlfa));
});

test("o vínculo da RP com o cliente (cliente_id) vale mais que o nome do produto", async () => {
  const cli = await F.criarCliente(A.id, `Delta${tag}`);
  const rp = await criarRp({ empresa_id: RS.id, produto: "Nome totalmente diferente", cliente_id: cli.id });
  const d = await calcularDemandaRS({ empresaId: A.id });
  assert.ok(d.avaliacoes.some((x) => x.rp_id === rp));
});

test("cliente cadastrado pelo R&S (origem = 'rs') não é cliente do T&D: não puxa RPs nem aparece no menu Clientes", async () => {
  const nome = `ClienteRS${tag}`;
  const cli = await F.criarCliente(A.id, nome);
  await F.pool.query("UPDATE clientes SET origem = 'rs' WHERE id = ?", [cli.id]);
  const rp = await criarRp({ empresa_id: RS.id, produto: nome });
  const d = await calcularDemandaRS({ empresaId: A.id });
  assert.ok(!d.avaliacoes.some((x) => x.rp_id === rp), "RP de cliente do R&S não entra no Radar do T&D");

  const r = await api.get("/api/clientes", { token: ua.token });
  assert.equal(r.status, 200);
  assert.ok(!r.texto.includes(nome), "o menu Clientes do T&D não lista cliente criado pelo R&S");
});

test("ambiente sem clientes do T&D cadastrados não recebe nada do R&S", async () => {
  const vazio = await F.criarEmpresa();
  await criarRp({ empresa_id: RS.id, produto: `Qualquer${tag}` });
  const d = await calcularDemandaRS({ empresaId: vazio.id });
  assert.equal(d.avaliacoes.length, 0);
  assert.equal(d.berco.length, 0);
});

test("RP cancelada ou excluída não entra", async () => {
  const cli = await F.criarCliente(A.id, `Epsilon${tag}`);
  const cancelada = await criarRp({ empresa_id: RS.id, produto: cli.nome });
  const excluida = await criarRp({ empresa_id: RS.id, produto: cli.nome });
  await F.pool.query("UPDATE rps SET status = 'CANCELADA' WHERE id = ?", [cancelada]);
  await F.pool.query("UPDATE rps SET excluido_em = NOW() WHERE id = ?", [excluida]);
  const ids = (await calcularDemandaRS({ empresaId: A.id })).avaliacoes.map((x) => x.rp_id);
  assert.ok(!ids.includes(cancelada));
  assert.ok(!ids.includes(excluida));
});
