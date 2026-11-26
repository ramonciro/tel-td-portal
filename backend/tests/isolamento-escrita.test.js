// Isolamento de ESCRITA entre ambientes: quem está logado no ambiente A não pode alterar, apagar nem recriar
// dado do ambiente B — nem tentando ids do B nas rotas POST/PUT/PATCH/DELETE, nem mandando empresa_id do B no corpo.
//
// Como funciona: o banco recebe dados do ambiente B em todas as tabelas com empresa_id; o teste tira uma "foto"
// (hash do conteúdo) de todas as linhas do B, dispara todas as rotas de escrita da API logado como perfis do A
// (com ids do B e corpo vazio ou com empresa_id do B) e tira outra foto. Qualquer diferença é falha.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const F = require("./helpers/fabrica");
const { iniciar } = require("./helpers/servidor");
const { listar } = require("./helpers/rotas");
const { semearTodasAsTabelas } = require("./helpers/semente");

const PERFIS = ["coordenador", "supervisor", "instrutor"];
// /api/auth muda a senha/sessão do próprio usuário; backup e zerar não fazem sentido aqui.
const IGNORAR = /^\/api\/auth\b|\/(logout|zerar|backup)\b/i;

let api, A, B, ids, tabelas, antes, depois, enviadas, uso;

async function foto() {
  const resultado = {};
  for (const t of tabelas) {
    const [rows] = await F.pool.query(`SELECT * FROM \`${t}\` WHERE empresa_id = ? ORDER BY 1`, [B.id]);
    resultado[t] = crypto.createHash("md5").update(JSON.stringify(rows)).digest("hex") + ":" + rows.length;
  }
  return resultado;
}

before(async () => {
  api = await iniciar();
  const marca = Math.random().toString(36).slice(2, 7).toUpperCase();
  A = await F.criarEmpresa(`ZZA${marca}Ambiente`);
  B = await F.criarEmpresa(`ZZB${marca}Ambiente`);
  const cliente = await F.criarCliente(B.id, `ZZB${marca}Cliente`);
  const turma = await F.criarTurma({ empresa_id: B.id, tema: `ZZB${marca}Turma`, cliente: cliente.nome, subtipo: "Avaliação Técnica" });
  const aula = await F.criarAula(turma, "2026-11-10", 1);
  const pessoa = await F.criarParticipante(turma, `ZZB${marca}Pessoa`);
  await F.lancarPresenca(aula, pessoa, "ausente");
  const usuarioB = await F.criarUsuario({ empresa_id: B.id, perfil: "coordenador", nome: `ZZB${marca}Usuario` });
  ids = [turma.id, cliente.id, pessoa.id, aula.id, usuarioB.id, B.id, 7002];
  await semearTodasAsTabelas(A.id, `ZZA${marca}`, 7001);
  await semearTodasAsTabelas(B.id, `ZZB${marca}`, 7002);

  const [t] = await F.pool.query("SELECT DISTINCT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'empresa_id' AND TABLE_NAME <> 'empresas' ORDER BY 1");
  tabelas = t.map((x) => x.t);
  antes = await foto();

  const rotas = listar(api.app).filter((r) => r.metodo !== "GET" && !IGNORAR.test(r.caminho));
  enviadas = 0;
  uso = { respostas: {} };
  for (const perfil of PERFIS) {
    const u = await F.criarUsuario({ empresa_id: A.id, perfil });
    for (const r of rotas) {
      const caminhos = r.caminho.includes(":") ? ids.map((id) => r.caminho.replace(/:[A-Za-z_]+\??/g, String(id))) : [r.caminho];
      for (const c of caminhos) {
        for (const corpo of [{}, { empresa_id: B.id, id: ids[0], treinamento_id: ids[0], cliente_id: ids[1] }]) {
          const m = r.metodo.toLowerCase();
          const resp = m === "delete" ? await api.del(c, { token: u.token }) : await api[m](c, corpo, { token: u.token });
          enviadas += 1;
          uso.respostas[resp.status] = (uso.respostas[resp.status] || 0) + 1;
        }
      }
    }
  }
  depois = await foto();
});
after(async () => { await api.fechar(); await F.pool.end(); });

test("o teste dispara centenas de requisições de escrita", () => {
  console.log(`# ${enviadas} requisições de escrita; respostas por status: ${JSON.stringify(uso.respostas)}`);
  assert.ok(enviadas > 500);
  assert.ok(tabelas.length >= 40);
});

test("NENHUMA linha do ambiente B foi alterada, apagada ou criada por usuários do ambiente A", () => {
  const diferentes = tabelas.filter((t) => antes[t] !== depois[t]).map((t) => `${t}: ${antes[t].split(":")[1]} -> ${depois[t].split(":")[1]} linhas`);
  assert.deepEqual(diferentes, [], `Tabelas do ambiente B que mudaram:\n${diferentes.join("\n")}`);
});

test("as rotas /api/admin/jobs/* (trabalho de TODOS os ambientes) só aceitam o Super Admin", async () => {
  const coord = await F.criarUsuario({ empresa_id: A.id, perfil: "coordenador" });
  const sup = await F.criarUsuario({ empresa_id: A.id, perfil: "superintendente" });
  const jobs = ["rodar-radar-semanal", "rodar-pendencias", "rodar-lembretes", "rodar-conquistas", "rodar-certificados-automaticos", "rodar-backup"];
  for (const j of jobs) {
    for (const u of [coord, sup]) {
      const r = await api.post(`/api/admin/jobs/${j}`, {}, { token: u.token });
      assert.equal(r.status, 403, `${u.perfil} não pode disparar ${j} (veio ${r.status})`);
    }
  }
});
