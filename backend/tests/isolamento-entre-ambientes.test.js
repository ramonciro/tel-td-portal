// Isolamento entre ambientes (multi-tenant): quem está logado no ambiente A NUNCA pode ver dado do ambiente B.
//
// Como funciona: o banco recebe dados "marcados" com um texto sentinela — um para o ambiente A, outro para o B —
// em todas as tabelas que têm empresa_id (varredura automática do banco) mais um conjunto realista de turma,
// aulas, participantes e presenças. Depois o teste chama TODAS as rotas GET da API logado como cada perfil do
// ambiente A (e, nas rotas com :id, tenta ids do ambiente B). Se o sentinela de B aparecer em alguma resposta, o teste
// falha apontando a rota. O sentinela de A precisa aparecer em várias respostas (prova de que o teste enxerga dados).
//
// Rotas que cruzam ambientes DE PROPÓSITO (assistente de treinamento, Super Admin) ficam de fora.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const F = require("./helpers/fabrica");
const { iniciar } = require("./helpers/servidor");
const { listar } = require("./helpers/rotas");
const { semearTodasAsTabelas } = require("./helpers/semente");
const { instalar: instalarEspia } = require("./helpers/espiaConsultas");
const fs = require("fs");
const path = require("path");

const ARQUIVO_BASELINE = path.join(__dirname, "consultas-sem-ambiente.baseline.json");

// Todos os perfis do sistema. Superintendente e Assistente de Treinamento veem outros ambientes DE PROPÓSITO em telas
// específicas (controllers com crossTenantRoles); para eles, mostrar dado do B só é aceito nas rotas listadas abaixo.
const PERFIS = [
  "coordenador", "supervisor", "instrutor", "treinando", "analista_conteudo", "metodologia",
  "coordenador_rs", "gestor_rs", "coordenador_nusp", "analista_nusp", "gestor_nusp",
  "coordenador_rh", "analista_rh", "gestor_rh", "cliente_rh", "coaching",
  "superintendente", "assistente_treinamento",
];
const CRUZA_DE_PROPOSITO = {
  superintendente: /^\/api\/(analytics|capacidade|desempenho-instrutor|frequencia-individual|presenca-resumo|mpt|dashboard)\b/,
  assistente_treinamento: /^\/api\/(celulas-baby|conteudo|presenca-resumo|preventivo|provas-papel|reembolso-transporte|rotina|treinamentos|treinamentos-instrutores|turma-aulas|turma-presenca|presenca-aulas|salas|instrutores-turma)\b/,
};
// Além do caminho, manda ids do ambiente B pela URL (?turma_id=, ?empresa_id=...): muita rota só consulta o banco com eles.
const QS = (b) => ["empresa_id", "ambiente_id", "tenant_id"].map((k) => `${k}=${b.empresa}`).concat(
  ["id", "turma_id", "treinamento_id", "pessoa_id", "cliente_id", "usuario_id", "aula_id", "participante_id", "instrutor_id", "user_id"]
    .map((k) => `${k}=${k === "turma_id" || k === "treinamento_id" ? b.turma : k === "cliente_id" ? b.cliente : k === "aula_id" ? b.aula : ["usuario_id", "user_id", "instrutor_id"].includes(k) ? b.usuario : b.pessoa}`)
).join("&");
const IGNORAR = /\/(logout|zerar|backup)\b|^\/api\/health/i;
// Públicas DE PROPÓSITO: /api/auth/ambientes alimenta o seletor de ambiente da tela de login (antes de logar), e devolve
// só nome, código, logo e cor. Se um dia isso deixar de ser desejado, tire a rota desta lista e o teste passa a cobrar.
const PUBLICAS_DE_PROPOSITO = new Set(["/api/auth/ambientes"]);

// Qualquer objeto da resposta com empresa_id numérico diferente do ambiente do usuário é vazamento, mesmo sem sentinela.
function linhasDeOutroAmbiente(no, meu) {
  if (Array.isArray(no)) return no.some((x) => linhasDeOutroAmbiente(x, meu));
  if (no && typeof no === "object") {
    if (typeof no.empresa_id === "number" && no.empresa_id !== meu) return true;
    return Object.values(no).some((x) => linhasDeOutroAmbiente(x, meu));
  }
  return false;
}

let api, A, B, sentA, sentB, usuarios, idsB, rotas, resultado, espia;

async function nucleo(emp, sent) {
  const cliente = await F.criarCliente(emp.id, `${sent}Cliente`);
  const turma = await F.criarTurma({ empresa_id: emp.id, tema: `${sent}Turma`, cliente: cliente.nome, subtipo: "Avaliação Técnica", instrutor: `${sent}Instrutor` });
  const aula = await F.criarAula(turma, "2026-11-10", 1);
  const pessoa = await F.criarParticipante(turma, `${sent}Pessoa`);
  await F.lancarPresenca(aula, pessoa, "ausente");
  const usuario = await F.criarUsuario({ empresa_id: emp.id, perfil: "coordenador", nome: `${sent}Usuario` });
  return { cliente: cliente.id, turma: turma.id, aula: aula.id, pessoa: pessoa.id, usuario: usuario.id, empresa: emp.id };
}

before(async () => {
  api = await iniciar();
  const marca = Math.random().toString(36).slice(2, 7).toUpperCase();
  sentA = `ZZA${marca}`;
  sentB = `ZZB${marca}`;
  A = await F.criarEmpresa(`${sentA}Ambiente`);
  B = await F.criarEmpresa(`${sentB}Ambiente`);
  const nA = await nucleo(A, sentA);
  idsB = await nucleo(B, sentB);
  const sa = await semearTodasAsTabelas(A.id, sentA, 7001);
  const sb = await semearTodasAsTabelas(B.id, sentB, 7002);
  console.log(`# sementes: ${sa.tabelas.length} tabelas no ambiente A, ${sb.tabelas.length} no B (${sb.falhas.length} tabelas não aceitaram a linha genérica)`);

  usuarios = {};
  for (const p of PERFIS) usuarios[p] = await F.criarUsuario({ empresa_id: A.id, perfil: p, nome: `${sentA}${p}` });

  rotas = listar(api.app).filter((r) => r.metodo === "GET" && !IGNORAR.test(r.caminho));
  const candidatosB = [idsB.turma, idsB.cliente, idsB.pessoa, idsB.aula, idsB.usuario, idsB.empresa];
  void nA;

  const [tabs] = await F.pool.query("SELECT DISTINCT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'empresa_id'");
  espia = instalarEspia(F.pool, new Set(tabs.map((x) => String(x.t).toLowerCase())), A.id);

  resultado = { vazamentos: [], chamadas: 0, comDadosDeA: new Set(), erros500: new Set() };
  for (const perfil of PERFIS) {
    const token = usuarios[perfil].token;
    espia.pausar(!!CRUZA_DE_PROPOSITO[perfil]); // a catraca vale para quem NÃO deve cruzar ambientes
    for (const r of rotas) {
      const temParam = r.caminho.includes(":");
      const caminhos = temParam
        ? candidatosB.map((id) => r.caminho.replace(/:[A-Za-z_]+\??/g, String(id)))
        : [r.caminho];
      for (const c of caminhos.flatMap((x) => [x, `${x}?${QS(idsB)}`])) {
        espia.definirRota(`GET ${r.caminho}`);
        const resp = await api.get(c, { token });
        resultado.chamadas += 1;
        if (resp.status >= 500) resultado.erros500.add(`${r.caminho} (${perfil})`);
        const liberada = CRUZA_DE_PROPOSITO[perfil] && CRUZA_DE_PROPOSITO[perfil].test(r.caminho);
        if (!PUBLICAS_DE_PROPOSITO.has(r.caminho) && !liberada) {
          if (resp.texto.includes(sentB)) resultado.vazamentos.push(`${perfil} -> GET ${c} [${resp.status}] (texto do ambiente B na resposta)`);
          else if (resp.json && linhasDeOutroAmbiente(resp.json, A.id)) resultado.vazamentos.push(`${perfil} -> GET ${c} [${resp.status}] (linha com empresa_id de outro ambiente)`);
        }
        if (!temParam && resp.texto.includes(sentA)) resultado.comDadosDeA.add(r.caminho);
      }
    }
  }
});
after(async () => { await api.fechar(); await F.pool.end(); });

test("a semente cobre o banco: dezenas de tabelas receberam dados dos dois ambientes", async () => {
  const [[{ n }]] = await F.pool.query(
    "SELECT COUNT(DISTINCT TABLE_NAME) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'empresa_id'"
  );
  assert.ok(Number(n) >= 40, `esperava 40+ tabelas com empresa_id, achei ${n}`);
});

test("o teste enxerga dados: várias rotas do ambiente A devolvem o sentinela do próprio A", () => {
  assert.ok(resultado.comDadosDeA.size >= 10, `só ${resultado.comDadosDeA.size} rotas devolveram dados do A — o teste não está enxergando o banco`);
});

test("a lista pública de ambientes expõe só nome, código, logo e cor", async () => {
  const r = await api.get("/api/auth/ambientes");
  assert.equal(r.status, 200);
  for (const e of r.json) assert.deepEqual(Object.keys(e).sort(), ["codigo", "cor_primaria", "logo_url", "nome"]);
});

test("NENHUMA rota GET devolve dado do ambiente B para usuários do ambiente A", () => {
  console.log(`# ${resultado.chamadas} chamadas em ${rotas.length} rotas GET × ${PERFIS.length} perfis; rotas com erro 5xx: ${resultado.erros500.size}; rotas que devolveram dados do próprio ambiente: ${resultado.comDadosDeA.size}`);
  assert.deepEqual(resultado.vazamentos, [], `Vazamento entre ambientes:\n${resultado.vazamentos.join("\n")}`);
});

test("catraca: nenhuma consulta NOVA toca tabela de ambiente sem filtrar por empresa_id", () => {
  const atuais = Object.fromEntries([...espia.registro.entries()].sort());
  if (process.env.UPDATE_BASELINE === "1") {
    fs.writeFileSync(ARQUIVO_BASELINE, JSON.stringify(atuais, null, 2) + "\n");
    console.log(`# baseline gravado: ${Object.keys(atuais).length} consultas`);
    return;
  }
  const conhecidas = fs.existsSync(ARQUIVO_BASELINE) ? JSON.parse(fs.readFileSync(ARQUIVO_BASELINE, "utf8")) : {};
  const novas = Object.keys(atuais).filter((sig) => !(sig in conhecidas));
  assert.deepEqual(
    novas.map((sig) => `${atuais[sig]}\n      ${sig}`),
    [],
    "Consulta nova em tabela de ambiente SEM filtro por empresa_id (veja a lista). Se o filtro faltou, corrija; se a consulta é segura " +
      "(ex.: o id já foi validado antes), rode `UPDATE_BASELINE=1 npm test` para registrá-la."
  );
});
