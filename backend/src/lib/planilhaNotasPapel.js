/**
 * Importação de notas de prova em papel por planilha (16/10/2026).
 *
 * Funções puras (sem banco): lê o Excel/CSV, acha as colunas pelo cabeçalho e
 * casa cada linha com um participante da turma — primeiro pela matrícula, com o
 * nome como apoio. NÃO grava nada: devolve a pré-visualização para a tela
 * preencher o editor do rascunho; quem grava é o "Salvar rascunho" de sempre.
 */
const ExcelJS = require("exceljs");
const P = require("./provasPapel");

const MAX_LINHAS = 2000;

/* ───────────────────────── normalização ───────────────────────── */

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normTexto = (s) => semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();
/** Nome: sem acento/maiúscula/espaço duplicado/pontuação solta. */
const normNome = (s) => normTexto(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
/** Matrícula: só letras/números, sem zeros à esquerda ("00123" == "123", "123.0" == "123"). */
function normMatricula(v) {
  let t = String(v ?? "").trim();
  if (/^\d+\.0+$/.test(t)) t = t.replace(/\.0+$/, "");
  t = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  return t.replace(/^0+(?=.)/, "");
}

/* ───────────────────────── leitura do arquivo ───────────────────────── */

function valorCelula(c) {
  let v = c?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join("");
    else if (v.result !== undefined && v.result !== null) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else if (v.error) v = "";
    else v = "";
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "number" ? v : String(v).trim();
}

function parseCsv(texto) {
  const t = String(texto || "").replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] || "";
  const cont = (ch) => primeira.split(ch).length - 1;
  const delim = cont(";") >= cont(",") && cont(";") >= cont("\t") ? ";" : cont("\t") > cont(",") ? "\t" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === delim) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => String(x).trim() !== "")) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((x) => String(x).trim() !== "")) linhas.push(linha);
  return linhas.map((l) => l.map((x) => String(x).trim()));
}

/** @returns {Promise<{matriz:any[][], importacaoId:number|null}>} matriz = linhas da aba de notas */
async function lerArquivo(buffer, nomeArquivo) {
  const nome = String(nomeArquivo || "").toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    return { matriz: parseCsv(buffer.toString("utf8")), importacaoId: null };
  }
  if (nome.endsWith(".xls")) {
    throw Object.assign(new Error("Arquivo .xls antigo: salve como .xlsx (ou .csv) e envie de novo."), { amigavel: true });
  }
  if (!nome.endsWith(".xlsx") || buffer.slice(0, 2).toString("latin1") !== "PK") {
    throw Object.assign(new Error("Envie uma planilha .xlsx ou .csv."), { amigavel: true });
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw Object.assign(new Error("Não consegui abrir a planilha. Confira se o arquivo não está corrompido ou protegido por senha."), { amigavel: true });
  }
  const abas = wb.worksheets;
  if (!abas.length) throw Object.assign(new Error("A planilha está vazia."), { amigavel: true });
  const aba = abas.find((w) => normTexto(w.name) === "notas") || abas[0];
  const matriz = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    if (matriz.length >= MAX_LINHAS + 30) return;
    const celulas = [];
    for (let c = 1; c <= Math.max(row.cellCount, 1); c++) celulas.push(valorCelula(row.getCell(c)));
    matriz[row.number - 1] = celulas;
  });
  let importacaoId = null;
  const instr = abas.find((w) => normTexto(w.name).startsWith("instru"));
  if (instr) {
    instr.eachRow({ includeEmpty: false }, (row) => {
      const a = normTexto(valorCelula(row.getCell(1)));
      if (a.startsWith("importacao n")) {
        const n = Number(String(valorCelula(row.getCell(2))).replace(/\D/g, ""));
        if (n) importacaoId = n;
      }
    });
  }
  return { matriz: matriz.filter(Boolean), importacaoId };
}

/* ───────────────────────── colunas ───────────────────────── */

const SINONIMOS = {
  matricula: ["matricula", "mat", "registro", "re", "codigo"],
  nome: ["nome", "treinando", "colaborador", "participante", "aluno", "nome completo", "funcionario"],
  faltou: ["faltou", "falta", "ausente", "ausencia"],
  nota: ["nota", "nota final", "resultado", "nota da prova", "pontuacao"],
  respostas: ["respostas", "resposta", "gabarito", "marcadas", "letras", "alternativas"],
};
const limparCab = (v) => normTexto(String(v).replace(/\(.*?\)/g, "")).replace(/[^a-z0-9 ]/g, "").trim();

/** Procura o cabeçalho nas primeiras linhas. */
function acharColunas(matriz) {
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const cols = {};
    (matriz[i] || []).forEach((cel, j) => {
      const h = limparCab(cel);
      if (!h) return;
      for (const [campo, lista] of Object.entries(SINONIMOS)) {
        if (cols[campo] === undefined && lista.includes(h)) cols[campo] = j;
      }
    });
    const temId = cols.nome !== undefined || cols.matricula !== undefined;
    const temValor = cols.nota !== undefined || cols.respostas !== undefined || cols.faltou !== undefined;
    if (temId && temValor) return { linhaCabecalho: i, cols };
  }
  return null;
}

const TRUE_FALTOU = new Set(["s", "sim", "x", "1", "true", "verdadeiro", "faltou", "falta", "ausente"]);
const ehFaltou = (v) => TRUE_FALTOU.has(normTexto(v));

/* ───────────────────────── interpretação ───────────────────────── */

/**
 * @param {{matriz:any[][]}} arq
 * @param {{id:number, nome:string, matricula?:string}[]} participantes
 * @param {{totalQuestoes:number, temGabarito:boolean, notaMaxima:number}} prova
 */
function interpretar(arq, participantes, prova) {
  const achou = acharColunas(arq.matriz);
  if (!achou) {
    return {
      ok: false,
      erro: "Não encontrei as colunas da planilha. Use o modelo baixado do Portal, ou uma planilha com cabeçalho Nome (ou Matrícula) e Nota (ou Respostas / Faltou).",
    };
  }
  const { cols, linhaCabecalho } = achou;
  const porMat = new Map();
  const porNome = new Map();
  for (const p of participantes) {
    const m = normMatricula(p.matricula);
    if (m) { if (!porMat.has(m)) porMat.set(m, []); porMat.get(m).push(p); }
    const n = normNome(p.nome);
    if (n) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(p); }
  }

  const problemas = [];
  const linhas = [];
  const usados = new Map(); // participante_id -> nº da linha
  const resumo = { lidas: 0, aplicaveis: 0, faltaram: 0, sem_lancamento: 0, avisos: 0, erros: 0, fora_da_planilha: 0 };
  const add = (tipo, linha, nome, mensagem) => {
    problemas.push({ tipo, linha, nome, mensagem });
    if (tipo === "erro") resumo.erros += 1; else resumo.avisos += 1;
  };

  for (let i = linhaCabecalho + 1; i < arq.matriz.length; i++) {
    const r = arq.matriz[i];
    if (!r) continue;
    const g = (c) => (c === undefined ? "" : r[c] === undefined || r[c] === null ? "" : r[c]);
    const matriculaPl = String(g(cols.matricula)).trim();
    const nomePl = String(g(cols.nome)).trim();
    const faltouPl = ehFaltou(g(cols.faltou));
    const respostasPl = String(g(cols.respostas)).trim();
    const notaBruta = g(cols.nota);
    const notaPl = String(notaBruta).trim();
    if (!matriculaPl && !nomePl && !respostasPl && !notaPl && !faltouPl) continue; // linha em branco
    const numLinha = i + 1;
    resumo.lidas += 1;
    if (resumo.lidas > MAX_LINHAS) {
      add("erro", numLinha, nomePl, `Limite de ${MAX_LINHAS} linhas por planilha excedido; o restante foi ignorado.`);
      break;
    }
    const rotulo = nomePl || matriculaPl || `linha ${numLinha}`;

    // 1) quem é
    let p = null;
    const mNorm = normMatricula(matriculaPl);
    if (mNorm) {
      const cand = porMat.get(mNorm) || [];
      if (cand.length === 1) {
        p = cand[0];
        if (nomePl && normNome(nomePl) !== normNome(p.nome)) {
          add("aviso", numLinha, rotulo, `A matrícula ${matriculaPl} é de “${p.nome}”, mas a planilha traz “${nomePl}”. Conferi pela matrícula.`);
        }
      } else if (cand.length > 1) {
        const doNome = cand.filter((x) => normNome(x.nome) === normNome(nomePl));
        if (doNome.length === 1) p = doNome[0];
        else { add("erro", numLinha, rotulo, `A matrícula ${matriculaPl} aparece em mais de um treinando da turma.`); continue; }
      }
    }
    if (!p && nomePl) {
      const cand = porNome.get(normNome(nomePl)) || [];
      if (cand.length === 1) {
        p = cand[0];
        add("aviso", numLinha, rotulo, mNorm
          ? `Matrícula ${matriculaPl} não confere com a turma; casei pelo nome com “${p.nome}”.`
          : `Sem matrícula; casei pelo nome com “${p.nome}”.`);
      } else if (cand.length > 1) {
        add("erro", numLinha, rotulo, "Há mais de um treinando com esse nome na turma; informe a matrícula.");
        continue;
      }
    }
    if (!p) {
      add("erro", numLinha, rotulo, "Não encontrei este treinando na turma.");
      continue;
    }
    if (usados.has(p.id)) {
      add("erro", numLinha, rotulo, `“${p.nome}” já veio na linha ${usados.get(p.id)} da planilha; esta foi ignorada.`);
      continue;
    }

    // 2) o que lançar
    let lanc = null;
    if (faltouPl) {
      lanc = { participante_id: p.id, faltou: true, respostas: "", nota: "" };
      if (respostasPl || notaPl) add("aviso", numLinha, rotulo, "Marcado como faltou: a nota/respostas da linha foram ignoradas.");
    } else if (respostasPl) {
      if (!prova.temGabarito) {
        add("erro", numLinha, rotulo, "Esta prova não tem gabarito cadastrado: informe a nota, não as respostas.");
        continue;
      }
      const lido = P.lerRespostas(respostasPl, prova.totalQuestoes);
      if (!lido.ok) { add("erro", numLinha, rotulo, lido.erro); continue; }
      lanc = { participante_id: p.id, faltou: false, respostas: lido.letras.map((x) => x || "-").join(""), nota: "" };
      if (notaPl) add("aviso", numLinha, rotulo, "Vieram respostas e nota; a nota foi ignorada (o Portal corrige pelo gabarito).");
    } else if (notaPl) {
      const n = P.lerNota(typeof notaBruta === "number" ? String(notaBruta) : notaPl, prova.notaMaxima);
      if (!n.ok) { add("erro", numLinha, rotulo, `${n.erro} (valor: “${notaPl}”)`); continue; }
      lanc = { participante_id: p.id, faltou: false, respostas: "", nota: String(n.nota).replace(".", ",") };
    } else {
      resumo.sem_lancamento += 1;
      usados.set(p.id, numLinha);
      continue;
    }
    usados.set(p.id, numLinha);
    linhas.push(lanc);
    resumo.aplicaveis += 1;
    if (lanc.faltou) resumo.faltaram += 1;
  }

  const fora = participantes.filter((p) => !usados.has(p.id));
  resumo.fora_da_planilha = fora.length;
  return {
    ok: true,
    linhas,
    resumo,
    problemas: problemas.slice(0, 200),
    problemas_total: problemas.length,
    nao_listados: fora.slice(0, 50).map((p) => p.nome),
  };
}

module.exports = {
  MAX_LINHAS, normTexto, normNome, normMatricula, parseCsv, lerArquivo, acharColunas, interpretar,
};
