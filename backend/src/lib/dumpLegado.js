/**
 * dumpLegado.js — lê dumps ANTIGOS do backup (feitos antes de 26/11/2026).
 *
 * Esses dumps gravavam também o valor das colunas calculadas (GENERATED, ex.:
 * respostas_avaliativas.treinando_nome_legado). O MySQL recusa valor nelas num INSERT
 * ("The value specified for generated column ... is not allowed"), então a restauração
 * parava na primeira tabela com coluna calculada. Aqui o INSERT é reescrito sem essas
 * colunas (o banco recalcula). Dumps novos já saem sem elas e passam direto.
 *
 * O formato do dump é o gerado por services/backupService.js: uma instrução por linha,
 *   INSERT INTO `tabela` (`a`,`b`,...) VALUES (v1,v2,...),(v1,v2,...);
 * com textos entre aspas simples (escape por barra invertida ou aspas dobradas),
 * binários como X'hex', números e NULL.
 */

/** Divide o conteúdo "v1,v2,v3" de UMA tupla em valores, respeitando textos entre aspas. */
function dividirValores(corpo) {
  const valores = [];
  let ini = 0;
  let emTexto = false;
  for (let i = 0; i < corpo.length; i++) {
    const ch = corpo[i];
    if (emTexto) {
      if (ch === "\\") i += 1; // pula o caractere escapado
      else if (ch === "'") emTexto = false; // '' (aspas dobradas) fecha e reabre: o resultado é o mesmo
    } else if (ch === "'") emTexto = true;
    else if (ch === ",") {
      valores.push(corpo.slice(ini, i));
      ini = i + 1;
    }
  }
  valores.push(corpo.slice(ini));
  return valores;
}

/** Percorre "(...),(...),(...)" e devolve o conteúdo de cada tupla (sem os parênteses externos). */
function dividirTuplas(texto) {
  const tuplas = [];
  let emTexto = false;
  let profundidade = 0;
  let ini = -1;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (emTexto) {
      if (ch === "\\") i += 1;
      else if (ch === "'") emTexto = false;
      continue;
    }
    if (ch === "'") emTexto = true;
    else if (ch === "(") {
      if (profundidade === 0) ini = i + 1;
      profundidade += 1;
    } else if (ch === ")") {
      profundidade -= 1;
      if (profundidade === 0) tuplas.push(texto.slice(ini, i));
    }
  }
  if (emTexto || profundidade !== 0) throw new Error("INSERT do dump com texto ou parênteses sem fechar.");
  return tuplas;
}

const nomeSemCrase = (c) => c.trim().replace(/^`|`$/g, "").replace(/``/g, "`");

/**
 * Se o INSERT é da tabela `tabela` e inclui colunas calculadas, devolve o INSERT sem elas;
 * senão devolve o mesmo texto. `geradas` é um Set com os nomes das colunas calculadas.
 */
function removerColunasGeradas(sql, geradas) {
  if (!geradas || !geradas.size) return { sql, removidas: [] };
  const m = sql.match(/^INSERT INTO (`(?:[^`]|``)+`) \((.*?)\) VALUES /s);
  if (!m) return { sql, removidas: [] };
  const colunas = m[2].split(",");
  const descartar = new Set();
  colunas.forEach((c, i) => { if (geradas.has(nomeSemCrase(c))) descartar.add(i); });
  if (!descartar.size) return { sql, removidas: [] };

  const resto = sql.slice(m[0].length).replace(/;\s*$/, "");
  const tuplas = dividirTuplas(resto).map((t) => {
    const v = dividirValores(t);
    if (v.length !== colunas.length) throw new Error(`INSERT do dump com ${v.length} valores para ${colunas.length} colunas.`);
    return "(" + v.filter((_, i) => !descartar.has(i)).join(",") + ")";
  });
  const novasColunas = colunas.filter((_, i) => !descartar.has(i)).join(",");
  return {
    sql: `INSERT INTO ${m[1]} (${novasColunas}) VALUES ${tuplas.join(",")};`,
    removidas: [...descartar].map((i) => nomeSemCrase(colunas[i])),
  };
}

/** Nome da tabela de um "CREATE TABLE `nome` (...)" (ou null). */
function tabelaDoCreate(sql) {
  const m = sql.match(/^CREATE TABLE (?:IF NOT EXISTS )?`((?:[^`]|``)+)`/);
  return m ? m[1].replace(/``/g, "`") : null;
}

/** Nome da tabela de um "INSERT INTO `nome` ..." (ou null). */
function tabelaDoInsert(sql) {
  const m = sql.match(/^INSERT INTO `((?:[^`]|``)+)`/);
  return m ? m[1].replace(/``/g, "`") : null;
}

module.exports = { dividirValores, dividirTuplas, removerColunasGeradas, tabelaDoCreate, tabelaDoInsert };
