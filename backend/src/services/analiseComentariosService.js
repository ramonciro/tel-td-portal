/**
 * analiseComentariosService.js
 *
 * Fase 3 do roadmap de competitividade ("lacuna de diferenciação") —
 * "análise de comentários" das respostas de NPS do treinando. Por decisão
 * explícita do Ramon ("vamos seguir sem custo por enquanto"), NÃO usa
 * IA/LLM nenhuma: classifica cada comentário como positivo/negativo/neutro
 * por contagem de palavras-chave em português (lista fixa abaixo), com o
 * NPS numérico como critério de desempate quando o texto não bate com
 * nenhuma palavra da lista. Também extrai as palavras mais frequentes dos
 * comentários (excluindo palavras funcionais comuns) — um resumo rápido do
 * que os treinandos estão realmente dizendo, sem trocar nenhum dado com
 * serviço externo.
 *
 * Fonte dos comentários: avaliacoes_treinandos.comentario (resposta livre
 * do NPS, tela /responder-nps) — mesma tabela que a tela /nps já lista.
 * Calculado sob demanda (endpoint GET /api/analise-comentarios), nunca em
 * background — é uma consulta pontual da coordenação, não um número que
 * precise ficar sempre atualizado no Dashboard.
 */

const pool = require("../lib/db");

// Listas fixas, em português, no vocabulário de avaliação de treinamento —
// não é NLP, é contagem de ocorrência de expressão. Ajustável aqui sem
// mexer no resto do serviço.
const PALAVRAS_POSITIVAS = [
  "otimo", "otima", "excelente", "incrivel", "adorei", "gostei muito", "gostei", "recomendo",
  "recomendaria", "muito bom", "muito boa", "muito claro", "muito clara", "didatico", "didatica",
  "dinamico", "dinamica", "atencioso", "atenciosa", "paciente", "organizado", "organizada",
  "aprendi muito", "superou", "maravilhoso", "maravilhosa", "sensacional", "proveitoso", "proveitosa",
  "esclarecedor", "esclarecedora", "motivador", "motivadora", "envolvente", "interessante",
  "profissional", "competente", "qualificado", "qualificada", "satisfeito", "satisfeita",
  "parabens", "adorei", "top demais", "show de bola", "nota dez", "impecavel",
];

const PALAVRAS_NEGATIVAS = [
  "ruim", "pessimo", "pessima", "fraco", "fraca", "confuso", "confusa", "cansativo", "cansativa",
  "chato", "chata", "monotono", "monotona", "desorganizado", "desorganizada", "nao gostei",
  "nao recomendo", "nao aprendi", "rapido demais", "devagar demais", "muito lento", "muito lenta",
  "despreparado", "despreparada", "mal explicado", "mal explicada", "insatisfeito", "insatisfeita",
  "decepcionado", "decepcionada", "horrivel", "nao recomendaria", "perda de tempo", "sem paciencia",
  "faltou conteudo", "conteudo fraco",
];

// Palavras puramente funcionais (artigos, preposições, pronomes) — ficam de
// fora da contagem de frequência pra não poluir o resultado com "de", "que"
// etc. Mantidas em minúsculo e sem acento (mesma normalização usada abaixo).
const PALAVRAS_FUNCIONAIS = new Set([
  "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "que", "foi", "ser", "estava", "com",
  "para", "por", "um", "uma", "uns", "umas", "no", "na", "nos", "nas", "num", "numa", "se", "mais",
  "nao", "como", "mas", "ou", "ja", "so", "tao", "seu", "sua", "seus", "suas", "ao", "aos", "as",
  "pelo", "pela", "pelos", "pelas", "este", "esta", "esse", "essa", "isso", "isto", "tudo", "muito",
  "muita", "muitos", "muitas", "eu", "ele", "ela", "eles", "elas", "nos", "voce", "voces", "meu",
  "minha", "meus", "minhas", "tambem", "quando", "onde", "porque", "porque", "ate", "depois",
  "antes", "sobre", "sem", "entre", "sao", "era", "ter", "tem", "esta", "estao", "vai", "vao",
  "foi", "sido", "sendo", "isso", "aquele", "aquela", "aqueles", "aquelas",
]);

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Classifica um comentário em 'positivo' | 'negativo' | 'neutro'. Conta
 * quantas expressões de cada lista aparecem no texto; em empate (inclusive
 * 0 a 0 — comentário sem nenhuma palavra-chave conhecida), usa a nota NPS
 * como desempate (>=9 positivo, <=6 negativo, 7-8 neutro), só quando ela
 * foi informada.
 */
function classificarComentario(texto, notaNps) {
  const normalizado = normalizar(texto);
  let pontosPositivos = 0;
  let pontosNegativos = 0;

  for (const expressao of PALAVRAS_POSITIVAS) {
    if (normalizado.includes(normalizar(expressao))) pontosPositivos += 1;
  }
  for (const expressao of PALAVRAS_NEGATIVAS) {
    if (normalizado.includes(normalizar(expressao))) pontosNegativos += 1;
  }

  if (pontosPositivos > pontosNegativos) return "positivo";
  if (pontosNegativos > pontosPositivos) return "negativo";

  const nota = notaNps === null || notaNps === undefined ? null : Number(notaNps);
  if (nota !== null && !Number.isNaN(nota)) {
    if (nota >= 9) return "positivo";
    if (nota <= 6) return "negativo";
  }
  return "neutro";
}

/** Conta as palavras mais frequentes entre os comentários (>=4 letras, sem palavras funcionais). */
function extrairPalavrasFrequentes(comentarios, limite = 15) {
  const contagem = new Map();
  for (const c of comentarios) {
    const normalizado = normalizar(c.texto);
    const palavras = normalizado.match(/[a-z]+/g) || [];
    for (const palavra of palavras) {
      if (palavra.length < 4 || PALAVRAS_FUNCIONAIS.has(palavra)) continue;
      contagem.set(palavra, (contagem.get(palavra) || 0) + 1);
    }
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([palavra, ocorrencias]) => ({ palavra, ocorrencias }));
}

/**
 * Busca os comentários de NPS conforme os filtros e devolve a análise
 * completa. Filtros opcionais: treinamentoId, instrutor, cliente,
 * inicio/fim (data do envio do NPS).
 */
async function getAnaliseComentarios({ empresaId, treinamentoId, instrutor, cliente, inicio, fim } = {}) {
  const wheres = ["at.comentario IS NOT NULL", "TRIM(at.comentario) <> ''"];
  const params = [];

  if (empresaId) { wheres.push("t.empresa_id = ?"); params.push(empresaId); }
  if (treinamentoId) { wheres.push("t.id = ?"); params.push(treinamentoId); }
  if (instrutor) { wheres.push("LOWER(TRIM(t.instrutor)) = LOWER(TRIM(?))"); params.push(instrutor); }
  if (cliente) { wheres.push("t.cliente = ?"); params.push(cliente); }
  if (inicio) { wheres.push("DATE(at.created_at) >= ?"); params.push(inicio); }
  if (fim) { wheres.push("DATE(at.created_at) <= ?"); params.push(fim); }

  const [rows] = await pool.query(
    `
    SELECT at.comentario AS texto, at.nota_nps, at.treinando_nome, at.created_at,
           t.tema, t.cliente, t.instrutor
    FROM avaliacoes_treinandos at
    INNER JOIN treinamentos t ON t.id = at.treinamento_id
    WHERE ${wheres.join(" AND ")}
    ORDER BY at.created_at DESC
    `,
    params
  );

  const classificados = rows.map((r) => ({ ...r, sentimento: classificarComentario(r.texto, r.nota_nps) }));
  const positivos = classificados.filter((c) => c.sentimento === "positivo");
  const negativos = classificados.filter((c) => c.sentimento === "negativo");
  const neutros = classificados.filter((c) => c.sentimento === "neutro");
  const total = classificados.length;

  return {
    total_comentarios: total,
    positivos: positivos.length,
    neutros: neutros.length,
    negativos: negativos.length,
    percentual_positivos: total ? Math.round((positivos.length / total) * 100) : 0,
    percentual_negativos: total ? Math.round((negativos.length / total) * 100) : 0,
    palavras_frequentes: extrairPalavrasFrequentes(classificados),
    exemplos_positivos: positivos.slice(0, 3).map((c) => ({ texto: c.texto, treinando: c.treinando_nome, tema: c.tema })),
    exemplos_negativos: negativos.slice(0, 3).map((c) => ({ texto: c.texto, treinando: c.treinando_nome, tema: c.tema })),
  };
}

module.exports = { getAnaliseComentarios, classificarComentario, extrairPalavrasFrequentes };
