/**
 * Questionário de NPS do treinando (19/10/2026).
 *
 * Pedido do Ramon depois dos testes em produção: em vez de só uma nota de 0 a
 * 10, o operador responde um questionário. Formato definido por ele: "padrão
 * fixo" — a nota 0–10 de recomendação (é ela que gera o NPS e alimenta o
 * desempenho do instrutor, então não muda), 6 critérios de 1 a 5 e dois campos
 * de texto. As respostas dos critérios ficam em avaliacoes_treinandos.respostas_json.
 */

const CRITERIOS = [
  { chave: "conteudo",       rotulo: "Conteúdo do treinamento",            ajuda: "Os temas foram relevantes e bem explicados?" },
  { chave: "instrutor",      rotulo: "Instrutor (domínio e didática)",     ajuda: "O instrutor dominava o assunto e conduziu bem a turma?" },
  { chave: "material",       rotulo: "Material de apoio",                  ajuda: "Slides, apostilas, exercícios e provas ajudaram no aprendizado?" },
  { chave: "organizacao",    rotulo: "Organização e ambiente",             ajuda: "Sala, equipamentos, horário e condução do treinamento." },
  { chave: "duracao",        rotulo: "Duração e ritmo",                    ajuda: "A carga horária e o ritmo foram adequados?" },
  { chave: "aplicabilidade", rotulo: "Aplicação no dia a dia",             ajuda: "Você consegue usar o que aprendeu no seu trabalho?" },
];

const CHAVES = CRITERIOS.map((c) => c.chave);
const TEXTO_MAX = 1000;

/**
 * Valida e normaliza o que veio do navegador.
 * @returns {{ok:boolean, erro?:string, json?:string|null, comentario?:string|null}}
 */
function normalizarRespostas(body) {
  const entrada = body?.criterios;
  const melhor = String(body?.melhor ?? "").trim().slice(0, TEXTO_MAX);
  const melhorar = String(body?.melhorar ?? "").trim().slice(0, TEXTO_MAX);
  const comentarioLivre = String(body?.comentario ?? "").trim().slice(0, TEXTO_MAX);

  const criterios = {};
  if (entrada && typeof entrada === "object" && !Array.isArray(entrada)) {
    for (const chave of CHAVES) {
      if (entrada[chave] === undefined || entrada[chave] === null || entrada[chave] === "") continue;
      const n = Number(entrada[chave]);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return { ok: false, erro: "As notas dos critérios devem ser de 1 a 5." };
      }
      criterios[chave] = n;
    }
  }

  const temQuestionario = Object.keys(criterios).length > 0 || melhor || melhorar;
  if (!temQuestionario) return { ok: true, json: null, comentario: comentarioLivre || null };

  // comentario (campo antigo, exibido na lista e nos relatórios) passa a resumir os textos.
  const partes = [];
  if (comentarioLivre) partes.push(comentarioLivre);
  if (melhor) partes.push(`Melhor: ${melhor}`);
  if (melhorar) partes.push(`Melhorar: ${melhorar}`);

  return {
    ok: true,
    json: JSON.stringify({ versao: 1, criterios, melhor: melhor || null, melhorar: melhorar || null }),
    comentario: partes.join(" | ") || null,
  };
}

function lerRespostas(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

module.exports = { CRITERIOS, CHAVES, normalizarRespostas, lerRespostas };
