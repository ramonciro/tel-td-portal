// Leitura do "Relatório de dados cadastrais" (arquivo geral do RM, exportado como .xls mas na verdade uma tabela HTML) NO NAVEGADOR.
// O arquivo passa de 40 MB e traz CPF, RG, endereço, telefones e nascimento. Nada disso sai do computador: daqui saem só duas planilhas
// pequenas (CSV, datas no formato aaaa-mm-dd para não haver troca de dia e mês) com o que o turnover precisa: desligamentos e quadro mensal (headcount de fim de mês, calculado pelas datas de admissão e demissão).

const ENTIDADES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
const limpar = (s) => decodificar(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
const norm = (s) => limpar(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const RE_CELULA = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;

/** "dd/mm/aaaa hh:mm:ss" → "aaaa-mm-dd" (ou null se não for uma data de verdade). */
export function dataIsoDe(s) {
  const m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const csvCel = (v) => { const t = String(v ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csv = (cab, linhas) => "﻿" + [cab, ...linhas].map((l) => l.map(csvCel).join(",")).join("\r\n");
const fimDoMes = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const proximoMes = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

const COLUNAS = { mat: "MATRICULA", nome: "NOME", cargo: "FUNCAO", sup: "SUPERVISOR", coord: "COORDENADOR", status: "STATUS", adm: "DATAADMISSAO", dem: "DATADEMISSAO", motivo: "MOTIVODEMISSAO", servico: "SERVICO", filial: "FILIAL" };

/**
 * Lê o arquivo e devolve { resumo, arquivos: { desligamentos: File, quadro: File } }.
 * desde: "aaaa-mm-dd": só desligamentos a partir dessa data entram (o quadro começa no mês dela).
 */
export async function lerRelatorioCadastral(file, { desde, hojeIso }) {
  const texto = await file.text();
  const linhasHtml = texto.split(/<\/tr>/i);
  const celulas = (l) => { const out = []; let m; RE_CELULA.lastIndex = 0; while ((m = RE_CELULA.exec(l))) out.push(m[1]); return out; };
  let cab = null; let i = 0;
  for (; i < linhasHtml.length && !cab; i += 1) { const c = celulas(linhasHtml[i]); if (c.length > 5) cab = c.map(norm); }
  if (!cab) throw new Error("Não encontrei a tabela no arquivo. Envie o Relatório de dados cadastrais exportado do sistema.");
  const idx = {}; for (const [k, nome] of Object.entries(COLUNAS)) idx[k] = cab.indexOf(nome);
  const faltam = ["mat", "adm", "dem"].filter((k) => idx[k] < 0).map((k) => COLUNAS[k]);
  if (faltam.length) throw new Error(`O arquivo não tem as colunas ${faltam.join(", ")}. Confira se é o Relatório de dados cadastrais.`);
  const pega = (c, k) => (idx[k] >= 0 && c[idx[k]] !== undefined ? limpar(c[idx[k]]) : "");

  const pessoas = []; let lidas = 0; let semAdmissao = 0;
  for (; i < linhasHtml.length; i += 1) {
    const c = celulas(linhasHtml[i]); if (c.length < cab.length - 2) continue;
    lidas += 1;
    const adm = dataIsoDe(pega(c, "adm")); const demTxt = pega(c, "dem"); const dem = demTxt ? dataIsoDe(demTxt) : null;
    if (!adm) { semAdmissao += 1; continue; }
    pessoas.push({ mat: pega(c, "mat"), nome: pega(c, "nome"), cargo: pega(c, "cargo"), sup: pega(c, "sup"), coord: pega(c, "coord"), status: pega(c, "status"), adm, dem, demTxt, motivo: pega(c, "motivo"), servico: pega(c, "servico"), filial: pega(c, "filial") });
  }
  if (!pessoas.length) throw new Error("O arquivo não tem nenhuma linha com data de admissão.");

  // ── Desligamentos
  const desligs = []; let futuros = 0; let demAntes = 0; let foraDoPeriodo = 0;
  for (const p of pessoas) {
    if (!p.dem) continue;
    if (p.dem > hojeIso) { futuros += 1; continue; }
    if (p.dem < desde) { foraDoPeriodo += 1; continue; }
    if (p.dem < p.adm) demAntes += 1;
    desligs.push(p);
  }
  const linhasDesl = desligs.map((p) => [p.mat, p.nome, p.cargo, p.servico, p.filial, p.coord, p.sup, p.adm, p.dem, p.motivo, p.motivo]);
  const csvDesl = csv(["Matrícula", "Nome", "Cargo", "Serviço", "Site", "Coordenador", "Supervisor", "Data de admissão", "Data do desligamento", "Tipo", "Motivo"], linhasDesl);

  // ── Quadro mensal: quem estava no quadro no fim de cada mês (no mês corrente, até hoje)
  const mesIni = desde.slice(0, 7); const mesFim = hojeIso.slice(0, 7);
  const meses = []; for (let m = mesIni; m <= mesFim && meses.length < 120; m = proximoMes(m)) meses.push(m);
  const linhasQ = [];
  for (const m of meses) {
    const ref = fimDoMes(m) > hojeIso ? hojeIso : fimDoMes(m);
    const geral = { n: 0 }; const porServ = new Map(); const porSite = new Map();
    for (const p of pessoas) {
      if (p.adm > ref || (p.dem && p.dem <= ref)) continue;
      geral.n += 1;
      if (p.servico) porServ.set(p.servico, (porServ.get(p.servico) || 0) + 1);
      if (p.filial) porSite.set(p.filial, (porSite.get(p.filial) || 0) + 1);
    }
    linhasQ.push([m, geral.n, "", ""]);
    for (const [k, v] of porServ) linhasQ.push([m, v, k, ""]);
    for (const [k, v] of porSite) linhasQ.push([m, v, "", k]);
  }
  const csvQuadro = csv(["Competência", "Headcount", "Serviço", "Site"], linhasQ);
  const ultimo = linhasQ.filter((l) => l[2] === "" && l[3] === "").pop();
  const ativosHoje = pessoas.filter((p) => p.adm <= hojeIso && !p.dem).length;
  return {
    resumo: { lidas, pessoas: pessoas.length, semAdmissao, ativos: ativosHoje, desligamentos: desligs.length, foraDoPeriodo, futuros, demAntes, meses: meses.length, de: meses[0], ate: meses[meses.length - 1], headcountAtual: ultimo ? ultimo[1] : null, linhasQuadro: linhasQ.length,
      tamanhoOriginalMb: Math.round((file.size / 1048576) * 10) / 10, tamanhoEnvioKb: Math.round((csvDesl.length + csvQuadro.length) / 1024) },
    arquivos: { desligamentos: new File([csvDesl], "desligamentos_do_cadastral.csv", { type: "text/csv" }), quadro: new File([csvQuadro], "quadro_do_cadastral.csv", { type: "text/csv" }) },
  };
}
