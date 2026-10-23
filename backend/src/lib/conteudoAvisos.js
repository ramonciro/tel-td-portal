/**
 * conteudoAvisos.js — avisos do sino para a Produção de conteúdo (Pacote 2, 23/10/2026)
 *
 * Mesmo modelo "aviso vivo" do avisosService: cada aviso tem uma chave e uma
 * quantidade, é recalculado a cada consulta e some sozinho quando deixa de valer.
 *
 *  - Analista de Conteúdo: os PRÓPRIOS pedidos atrasados, os que o cliente não
 *    respondeu há 2+ dias e os lembretes de cobrança que venceram.
 *  - Coordenação / supervisão / assistente: a equipe toda, mais pedidos sem
 *    analista e histórico esperando revisão.
 *  - Superintendente: só o que está atrasado (leitura).
 */
const pool = require("./db");
const C = require("./conteudo");

const PERFIS_GESTAO = ["coordenador", "supervisor", "assistente_treinamento"];
const PERFIS_CONTEUDO = [...PERFIS_GESTAO, "analista_conteudo", "superintendente"];

const norm = (v) => String(v || "").trim().toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const CACHE_MS = 60 * 1000;
const cache = new Map(); // empresaId -> { quando, itens }

/** Pedidos em aberto já com farol, uma vez por empresa por minuto. */
async function abertosDaEmpresa(empresaId) {
  const k = String(empresaId ?? "global");
  const c = cache.get(k);
  if (c && Date.now() - c.quando < CACHE_MS) return c.itens;
  const I = require("../controllers/conteudoController").interno;
  const f = I.filtroEmpresa(empresaId, "p.");
  const [rows] = await pool.query(
    `${I.SELECT_PEDIDO} WHERE p.status IN (${C.STATUS_ABERTOS.map(() => "?").join(",")})${f.sql}`,
    [...C.STATUS_ABERTOS, ...f.params]
  );
  const exp = await C.carregarExpediente(empresaId);
  const agora = C.agoraBahia();
  const mapa = await I.etapasDe(rows.map((r) => r.id));
  const itens = rows.map((r) => I.enriquecer(r, mapa.get(r.id) || [], exp, agora));
  cache.set(k, { quando: Date.now(), itens });
  if (cache.size > 200) cache.clear();
  return itens;
}

function meu(user, p) {
  if (p.analista_id) return Number(p.analista_id) === Number(user.id);
  return !!p.analista_nome && C.primeiroNome(p.analista_nome) === C.primeiroNome(user.nome);
}

const nomes = (lista, n = 3) => lista.slice(0, n).map((p) => p.titulo).join(" · ");

async function avisos(user, empresaId) {
  const perfil = norm(user.perfil);
  if (!PERFIS_CONTEUDO.includes(perfil)) return [];
  const todos = await abertosDaEmpresa(empresaId);
  const hoje = C.hojeBahia();
  const visiveis = perfil === "analista_conteudo" ? todos.filter((p) => meu(user, p)) : todos;
  const dele = perfil === "analista_conteudo";
  const out = [];

  const atrasados = visiveis.filter((p) => p.atrasado);
  if (atrasados.length) {
    out.push({
      chave: "conteudo-atrasados", tipo: "conteudo", gravidade: "atencao", valor: atrasados.length,
      titulo: dele
        ? `${plural(atrasados.length, "pedido seu atrasado", "pedidos seus atrasados")}`
        : `${plural(atrasados.length, "pedido de conteúdo atrasado", "pedidos de conteúdo atrasados")}`,
      mensagem: dele ? nomes(atrasados) : [...new Set(atrasados.map((p) => p.analista_nome || "Sem analista"))].slice(0, 4).join(" · "),
      link: "/conteudo",
    });
  }

  if (perfil === "superintendente") return out;

  const semRetorno = visiveis.filter((p) => p.espera_cliente && (p.etapa_atual?.dias_corridos ?? 0) >= 2);
  if (semRetorno.length) {
    out.push({
      chave: "conteudo-sem-retorno", tipo: "conteudo", gravidade: "info", valor: semRetorno.length,
      titulo: `${plural(semRetorno.length, "pedido sem retorno do cliente há 2+ dias", "pedidos sem retorno do cliente há 2+ dias")}`,
      mensagem: nomes(semRetorno), link: "/conteudo",
    });
  }

  const lembretes = visiveis.filter((p) => p.status === "em_validacao" && p.lembrar_em && p.lembrar_em <= hoje);
  if (lembretes.length) {
    out.push({
      chave: "conteudo-lembretes", tipo: "conteudo", gravidade: "atencao", valor: lembretes.length,
      titulo: `${plural(lembretes.length, "lembrete de cobrança venceu", "lembretes de cobrança venceram")}`,
      mensagem: nomes(lembretes), link: "/conteudo",
    });
  }

  if (!dele) {
    const semDono = todos.filter((p) => p.status === "a_fazer" && !p.analista_id && !p.analista_nome);
    if (semDono.length) {
      out.push({
        chave: "conteudo-sem-analista", tipo: "conteudo", gravidade: "info", valor: semDono.length,
        titulo: `${plural(semDono.length, "pedido de conteúdo sem analista", "pedidos de conteúdo sem analista")}`,
        mensagem: nomes(semDono), link: "/conteudo",
      });
    }
    const f = require("../controllers/conteudoController").interno.filtroEmpresa(empresaId);
    const [[rev]] = await pool.query(`SELECT COUNT(*) AS n FROM conteudo_pedidos WHERE revisao = 'pendente'${f.sql}`, f.params);
    const nRev = Number(rev.n || 0);
    if (nRev) {
      out.push({
        chave: "conteudo-revisar", tipo: "conteudo", gravidade: "info", valor: nRev,
        titulo: `${plural(nRev, "registro do histórico para revisar", "registros do histórico para revisar")}`,
        mensagem: "Ficam fora dos indicadores até a revisão.", link: "/conteudo",
      });
    }
  }
  return out;
}

module.exports = { avisos, PERFIS_CONTEUDO };
