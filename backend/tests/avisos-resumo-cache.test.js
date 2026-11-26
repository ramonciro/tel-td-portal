// Sino de avisos (G10, 26/11/2026): o resumo da empresa não pode ser refeito por todo mundo ao mesmo tempo
// e, vencido há pouco, não faz ninguém esperar a conta pesada.
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const F = require("./helpers/fabrica");

const digestPath = require.resolve("../src/jobs/pendenciasDigest");
const svc = require("../src/services/avisosService");

let chamadas, liberar, falhar;
function trocarResumo() {
  chamadas = 0; falhar = false;
  require.cache[digestPath].exports.montarResumoEmpresa = async (empresaId) => {
    chamadas += 1;
    const n = chamadas;
    await new Promise((r) => { liberar = r; setTimeout(r, 30); });
    if (falhar) throw new Error("banco fora");
    return { empresaId, n };
  };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

after(async () => { await F.pool.end(); });
beforeEach(() => { require(digestPath); trocarResumo(); svc._limparCacheResumo(); });

test("30 pessoas ao mesmo tempo com cache vazio: a conta é feita uma vez só", async () => {
  const rs = await Promise.all(Array.from({ length: 30 }, () => svc._resumoEmpresa(7)));
  assert.equal(chamadas, 1);
  assert.ok(rs.every((r) => r.n === 1));
});

test("com cache válido não refaz a conta", async () => {
  await svc._resumoEmpresa(7);
  await svc._resumoEmpresa(7);
  assert.equal(chamadas, 1);
});

test("empresas diferentes não dividem o resultado", async () => {
  const [a, b] = await Promise.all([svc._resumoEmpresa(1), svc._resumoEmpresa(2)]);
  assert.equal(chamadas, 2);
  assert.equal(a.empresaId, 1);
  assert.equal(b.empresaId, 2);
});

test("cache vencido há pouco: responde na hora com o valor antigo e atualiza por trás", async () => {
  const real = Date.now;
  const t0 = real();
  Date.now = () => t0;
  try {
    await svc._resumoEmpresa(7); // n=1
    Date.now = () => t0 + 11 * 60 * 1000; // passou dos 10 min, dentro de 1 h
    const ini = real();
    const r = await svc._resumoEmpresa(7);
    assert.equal(r.n, 1, "devolve o valor antigo");
    assert.ok(real() - ini < 20, "sem esperar a conta pesada");
    await esperar(60);
    assert.equal(chamadas, 2, "atualizou por trás");
    assert.equal((await svc._resumoEmpresa(7)).n, 2, "a próxima já vem atualizada");
  } finally { Date.now = real; }
});

test("cache vencido há muito (mais de 1 h): espera a conta nova", async () => {
  const real = Date.now;
  const t0 = real();
  Date.now = () => t0;
  try {
    await svc._resumoEmpresa(7);
    Date.now = () => t0 + 61 * 60 * 1000;
    const r = await svc._resumoEmpresa(7);
    assert.equal(r.n, 2);
  } finally { Date.now = real; }
});

test("falha na atualização por trás não derruba nem apaga o valor antigo", async () => {
  const real = Date.now;
  const t0 = real();
  Date.now = () => t0;
  try {
    await svc._resumoEmpresa(7);
    Date.now = () => t0 + 11 * 60 * 1000;
    falhar = true;
    const r = await svc._resumoEmpresa(7);
    assert.equal(r.n, 1);
    await esperar(60);
    assert.equal((await svc._resumoEmpresa(7)).n, 1, "continua com o valor antigo");
    falhar = false;
    await esperar(5);
    // e na próxima tentativa volta a atualizar
    await svc._resumoEmpresa(7);
    await esperar(60);
    assert.equal((await svc._resumoEmpresa(7)).n, 3);
  } finally { Date.now = real; }
});

test("falha sem cache nenhum: o erro aparece (a rota já trata e devolve o sino vazio)", async () => {
  falhar = true;
  await assert.rejects(() => svc._resumoEmpresa(9), /banco fora/);
  falhar = false;
  assert.equal((await svc._resumoEmpresa(9)).n, 2, "e a próxima tentativa funciona");
});
