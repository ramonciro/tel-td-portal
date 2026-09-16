/**
 * excelExport.js — padrão de formatação dos exports em Excel (Pacote 3,
 * redesign de telas, 16/09/2026).
 *
 * Causa raiz do que Ramon apontou ("relatórios desconfigurados"): 5 das 6
 * exportações do sistema (Indicadores, Turmas recentes do Dashboard, R&S,
 * Scorecard por instrutor, Mapa de Desenvolvimento) usavam `xlsx` puro
 * (`aoa_to_sheet`, array de arrays) — dado cru na planilha, sem cabeçalho em
 * negrito, sem largura de coluna, datas e percentuais como texto solto. A
 * exceção era o Reembolso de Transporte (`reembolsoTransporteController.js`),
 * que já usa `exceljs` com formatação de verdade (fonte, cor de fundo,
 * `numFmt` de data/moeda).
 *
 * Este módulo generaliza esse padrão num lugar só, pra as outras 5
 * exportações não reimplementarem cada uma o próprio jeito de estilizar
 * cabeçalho/célula. Continua usando `exceljs` (já é dependência do backend
 * desde o pacote do Reembolso de Transporte — nenhuma dependência nova).
 *
 * O Reembolso de Transporte em si NÃO foi tocado neste pacote: o layout dele
 * é um formulário fixo (modelo real do financeiro, com merges e posições
 * específicas), não uma tabela — não há generalização que faça sentido ali
 * sem arriscar quebrar aquele layout específico.
 */
const ExcelJS = require("exceljs");

const COR_CABECALHO = "FFE2E8F0";
const FORMATO_MOEDA = '"R$" #,##0.00';
const FORMATO_DATA = "dd/mm/yyyy";

function novoWorkbook() {
  return new ExcelJS.Workbook();
}

// Converte "YYYY-MM-DD" (ou Date, ou datetime do MySQL) num Date "puro"
// (meia-noite local), pro Excel mostrar a data sem depender de fuso —
// mesmo padrão já usado em reembolsoTransporteController.js.
function paraDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    // já é Date (ex.: coluna DATE/DATETIME vinda do mysql2) — usa os
    // componentes UTC pra não deslocar dia por fuso.
    const ano = value.getUTCFullYear();
    const mes = value.getUTCMonth();
    const dia = value.getUTCDate();
    return new Date(ano, mes, dia);
  }
  const iso = String(value).slice(0, 10);
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia || Number.isNaN(ano)) return null;
  return new Date(ano, mes - 1, dia);
}

// Aplica negrito + fundo cinza-claro numa linha inteira (cabeçalho de tabela).
function estilizarCabecalho(ws, rowIndex, numCols) {
  const row = ws.getRow(rowIndex);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  row.height = 20;
}

// Escreve uma célula já formatada conforme o tipo da coluna. Retorna a
// célula (pra quem precisar aplicar negrito por cima, ex.: linha de total).
//
// formato: 'data' | 'moeda' | 'percentual' (valor chega em escala 0-100,
// igual à tela) | 'inteiro' | 'decimal1' (uma casa) | undefined (texto/valor cru)
function escreverCelula(ws, row, col, valor, formato) {
  const cell = ws.getCell(row, col);
  if (formato === "data") {
    const d = paraDate(valor);
    if (d) {
      cell.value = d;
      cell.numFmt = FORMATO_DATA;
    } else {
      cell.value = "";
    }
  } else if (formato === "moeda") {
    cell.value = valor == null || valor === "" ? 0 : Number(valor);
    cell.numFmt = FORMATO_MOEDA;
  } else if (formato === "percentual") {
    if (valor == null || valor === "") {
      cell.value = "";
    } else {
      cell.value = Number(valor) / 100;
      cell.numFmt = "0.0%";
    }
  } else if (formato === "inteiro") {
    cell.value = valor == null || valor === "" ? 0 : Number(valor);
    cell.numFmt = "#,##0";
  } else if (formato === "decimal1") {
    cell.value = valor == null || valor === "" ? "" : Number(valor);
    if (valor != null && valor !== "") cell.numFmt = "0.0";
  } else {
    cell.value = valor == null ? "" : valor;
  }
  return cell;
}

/**
 * Escreve uma tabela (título opcional + cabeçalho em negrito + linhas +
 * linha de total opcional em negrito) numa worksheet já existente, a partir
 * de `startRow`. Devolve a próxima linha livre — permite empilhar várias
 * tabelas na mesma aba (caso do "Dashboard" do R&S).
 *
 * colunas: [{ titulo, chave, formato? }]
 * linhas: array de objetos (lidos por `chave`)
 * linhaTotal: objeto no mesmo formato de `linhas`, opcional
 */
function escreverTabela(ws, { startRow = 1, colunas, linhas, linhaTotal, titulo }) {
  let row = startRow;

  if (titulo) {
    ws.mergeCells(row, 1, row, colunas.length);
    const cell = ws.getCell(row, 1);
    cell.value = titulo;
    cell.font = { bold: true, size: 12 };
    row += 1;
  }

  const headerRow = row;
  colunas.forEach((c, i) => {
    ws.getCell(headerRow, i + 1).value = c.titulo;
  });
  estilizarCabecalho(ws, headerRow, colunas.length);
  row += 1;

  linhas.forEach((linha) => {
    colunas.forEach((c, i) => escreverCelula(ws, row, i + 1, linha[c.chave], c.formato));
    row += 1;
  });

  if (linhaTotal) {
    colunas.forEach((c, i) => {
      const cell = escreverCelula(ws, row, i + 1, linhaTotal[c.chave], c.formato);
      cell.font = { bold: true };
    });
    row += 1;
  }

  return row;
}

/**
 * Cria uma nova worksheet já com largura de coluna, cabeçalho em negrito,
 * auto-filtro e congelamento da 1ª linha — o caso comum (uma tabela por aba).
 * Para abas com mais de uma tabela empilhada, use `escreverTabela`
 * diretamente sobre `workbook.addWorksheet(...)`.
 */
function adicionarTabela(workbook, { nomeAba, colunas, linhas, linhaTotal, congelar = true }) {
  const ws = workbook.addWorksheet(String(nomeAba || "Planilha").slice(0, 31));
  ws.columns = colunas.map((c) => ({ width: c.largura || Math.max(12, String(c.titulo).length + 4) }));

  escreverTabela(ws, { startRow: 1, colunas, linhas, linhaTotal });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  if (congelar) ws.views = [{ state: "frozen", ySplit: 1 }];

  return ws;
}

module.exports = {
  novoWorkbook,
  adicionarTabela,
  escreverTabela,
  estilizarCabecalho,
  escreverCelula,
  paraDate,
  COR_CABECALHO,
  FORMATO_MOEDA,
  FORMATO_DATA,
};
