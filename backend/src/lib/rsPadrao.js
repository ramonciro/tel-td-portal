/**
 * rsPadrao.js — grafia padrão dos nomes do módulo R&S (20/10/2026).
 *
 * Problema: a importação gravava SITE/PRODUTO/CARGO em MAIÚSCULAS e o formulário
 * gravava como o usuário digitava ("Salvador", "SALVADOR", "salvador"). O banco
 * ignora maiúsculas nas comparações, então os totais fechavam, mas a tela mostrava
 * variações e nomes quase iguais ("Feira" x "Feira de Santana") ficavam separados.
 *
 * Decisão do Ramon: tudo com inicial maiúscula ("Feira de Santana"), com uma lista
 * curta de siglas que continuam em maiúsculas (IBM, RH, TI...).
 */
const db = require("./db");

// Siglas que mantêm todas as letras maiúsculas. Para incluir outra, basta acrescentar aqui.
const SIGLAS = new Set([
  "IBM", "TI", "RH", "TO", "SAC", "CRM", "BPO", "CEO", "SP", "BA", "RJ", "MG", "PE", "DF",
  "EAD", "PJ", "CLT", "SMS", "QA", "CPF", "CNPJ", "SLA", "KPI", "DP", "BI", "UTI", "PCD", "PME",
]);
// Palavras de ligação ficam em minúsculas (exceto no início do nome). "A" e "O" ficam de fora de propósito: "Banco A", "Plano A".
const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"]);

function tituloPadrao(texto) {
  const limpo = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  return limpo
    .split(" ")
    .map((palavra, i) =>
      palavra
        .split(/([-/.])/)
        .map((seg) => {
          if (seg === "-" || seg === "/" || seg === "." || seg === "") return seg;
          const maiusc = seg.toUpperCase();
          const minusc = seg.toLowerCase();
          if (SIGLAS.has(maiusc)) return maiusc;
          if (/\d/.test(seg)) return maiusc; // "3M", "A2"
          if (i > 0 && LIGACOES.has(minusc)) return minusc;
          return minusc.charAt(0).toUpperCase() + minusc.slice(1);
        })
        .join("")
    )
    .join(" ");
}

/** Chave de comparação: sem acento, sem maiúsculas, espaços únicos. */
function chaveNormal(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Sites conhecidos da empresa: os do cadastro (ativos) e os que já aparecem em RPs
 * (fora da lixeira). Nomes iguais (ignorando maiúsculas/acentos) viram um só; vale a
 * grafia do cadastro, ou a grafia padrão quando só existe nas RPs.
 * Devolve [{ nome, chave, cadastrado, id, ativo, rps }]
 */
async function listarSites(empresa_id, { incluirInativos = false } = {}) {
  const [cad] = await db.query("SELECT id, nome, ativo FROM rs_sites WHERE empresa_id = ? ORDER BY nome", [empresa_id]);
  const [usados] = await db
    .query("SELECT site AS nome, COUNT(*) AS rps FROM rps WHERE empresa_id = ? AND excluido_em IS NULL AND site <> '' GROUP BY site", [empresa_id])
    .catch(() => [[]]);
  const mapa = new Map();
  for (const s of cad) {
    const chave = chaveNormal(s.nome);
    if (!chave) continue;
    const atual = mapa.get(chave);
    // Se houver dois cadastros com a mesma chave, o ativo e o mais antigo valem.
    if (atual && (atual.ativo || !s.ativo)) continue;
    mapa.set(chave, { nome: s.nome, chave, cadastrado: true, id: s.id, ativo: !!s.ativo, rps: 0 });
  }
  for (const u of usados) {
    const chave = chaveNormal(u.nome);
    if (!chave) continue;
    const ex = mapa.get(chave);
    if (ex) ex.rps += Number(u.rps) || 0;
    else mapa.set(chave, { nome: tituloPadrao(u.nome), chave, cadastrado: false, id: null, ativo: true, rps: Number(u.rps) || 0 });
  }
  return [...mapa.values()]
    .filter((s) => incluirInativos || s.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Acha o site pelo nome digitado. Devolve o nome canônico ou null (site desconhecido). */
async function resolverSite(empresa_id, nomeDigitado) {
  const chave = chaveNormal(nomeDigitado);
  if (!chave) return null;
  const sites = await listarSites(empresa_id);
  const achado = sites.find((s) => s.chave === chave);
  return achado ? achado.nome : null;
}

module.exports = { SIGLAS, tituloPadrao, chaveNormal, listarSites, resolverSite };
