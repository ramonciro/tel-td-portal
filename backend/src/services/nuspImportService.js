/**
 * nuspImportService.js — importa a planilha "NUSPSI — Visão Nacional" (Pacote 1, 06/11/2026)
 *
 * Lê as abas "Base de Atividades", "Plano de Ação" e "Participantes" (cabeçalho na
 * linha 4) e grava nas tabelas nusp_*. Regras:
 *  - nada é inventado: o que não casa com os cadastros vira aviso no relatório;
 *  - IDs da planilha são ignorados (o portal gera os seus);
 *  - rodar de novo não duplica (chave: data + tema + unidade + público / título + unidade + datas);
 *  - "Escuta individual" NÃO entra como atividade nem participação: fica contada no
 *    relatório para virar acolhimento no Pacote 2 (camada restrita);
 *  - participante só entra com matrícula (ou nome que case com UMA pessoa do cadastro);
 *  - o relatório devolve números e linhas da planilha, nunca nomes de pessoas.
 * simular=true roda tudo sem gravar.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const B = require("../lib/nuspBase");
const { gravarParticipantes } = require("../controllers/nuspController");

const DIM_ALIAS = {
  "organizacao do trabalho": "Conteúdo e organização do trabalho",
  "relacoes socioprofissionais": "Relacionamentos interpessoais e liderança",
  "condicoes de trabalho": "Condições e recursos de trabalho",
  "reconhecimento e crescimento": "Reconhecimento e recompensa",
  "autonomia e participacao": "Autonomia e controle sobre o trabalho",
  "demandas e carga mental": "Demandas de trabalho e carga mental",
  "jornada de trabalho e recuperacao": "Jornada de trabalho e recuperação",
  "comunicacao organizacional": "Comunicação organizacional",
  "saude mental e bem-estar": "Saúde mental e bem-estar",
};
const TIPO_MAP = {
  "escuta coletiva": "escuta_coletiva",
  "capacitacao": "capacitacao",
  "acao / intervencao": "acao_intervencao",
  "reuniao / alinhamento": "reuniao",
  "monitoramento": "monitoramento",
  "diver+/comunicacao": "comunicacao",
  "outros": "outros",
};
const STATUS_ATV_MAP = { "concluida": "concluida", "em andamento": "em_andamento", "nao iniciada": "planejada", "pendente": "planejada", "cancelada": "cancelada" };
const FORMATO_MAP = (t) => {
  const k = B.chave(t);
  if (!k) return null;
  if (k.startsWith("presen")) return "presencial";
  if (k.startsWith("hibrid")) return "hibrido";
  if (k.startsWith("online")) return "online";
  return null;
};

const isPlaceholder = (v) => ["", "-", "...", "…", "n/a", "na"].includes(String(v ?? "").trim().toLowerCase());

function lerAba(XLSX, wb, nomes) {
  const nome = wb.SheetNames.find((n) => nomes.some((x) => B.chave(n) === B.chave(x)));
  if (!nome) return null;
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  const idx = linhas.findIndex((l) => l.filter((x) => String(x).trim() !== "").length >= 4);
  if (idx < 0) return { cab: [], linhas: [] };
  const cab = linhas[idx].map((x) => B.chave(x));
  return { cab, linhas: linhas.slice(idx + 1).map((l, i) => ({ n: idx + 2 + i, l })) };
}

const pegar = (aba, linha, prefixo) => {
  const i = aba.cab.findIndex((c) => c.startsWith(prefixo));
  return i >= 0 ? String(linha.l[i] ?? "").trim() : "";
};

function numero(v) {
  const t = String(v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

function pct(v) {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const tem = t.includes("%");
  const x = Number(t.replace("%", "").replace(",", "."));
  if (!Number.isFinite(x)) return 0;
  const val = tem ? x : x <= 1 ? x * 100 : x;
  return Math.max(0, Math.min(100, Math.round(val)));
}

async function importarPlanilha({ empresaId, usuario, buffer, simular }) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  await B.garantirBase(empresaId);

  const abaAtv = lerAba(XLSX, wb, ["Base de Atividades"]);
  const abaPlano = lerAba(XLSX, wb, ["Plano de Ação", "Plano de Acao"]);
  const abaPart = lerAba(XLSX, wb, ["Participantes"]);
  if (!abaAtv && !abaPlano && !abaPart) {
    const e = new Error("Não encontrei as abas 'Base de Atividades', 'Plano de Ação' ou 'Participantes'. Use a planilha NUSPSI — Visão Nacional.");
    e.status = 400;
    throw e;
  }

  const rel = {
    simulacao: !!simular,
    atividades: { lidas: 0, importadas: 0, ja_existiam: 0, escuta_individual_adiada: 0, sem_data_ou_tema: 0, sem_dimensao: 0, concluidas_sem_evidencia: 0, linhas_com_problema: [] },
    planos: { lidos: 0, importados: 0, ja_existiam: 0, sem_data_ou_prazo: 0, sem_dimensao: 0, concluidos_sem_evidencia: 0, linhas_com_problema: [] },
    participantes: { lidos: 0, gravados: 0, escuta_individual_adiada: 0, sem_atividade: 0, sem_matricula_sem_par: 0, erros: 0, linhas_com_problema: [] },
    unidades_novas: [],
    avisos: [],
  };
  const aviso = (t) => { if (!rel.avisos.includes(t)) rel.avisos.push(t); };

  // Cadastros da empresa
  const [unidades] = await pool.query(`SELECT id, nome FROM nusp_unidades WHERE empresa_id = ?`, [empresaId]);
  const mapUn = new Map(unidades.map((u) => [B.chave(u.nome), u.id]));
  const [dims] = await pool.query(`SELECT id, nome FROM nusp_dimensoes WHERE empresa_id = ?`, [empresaId]);
  const mapDim = new Map(dims.map((d) => [B.chave(d.nome), d.id]));
  const [progs] = await pool.query(`SELECT id, nome, tipo FROM nusp_programas WHERE empresa_id = ?`, [empresaId]);
  const progNucleo = progs.find((p) => p.tipo === "nucleo")?.id || null;
  const progDiver = progs.find((p) => B.chave(p.nome).startsWith("diver"))?.id || null;
  const [users] = await pool.query(`SELECT id, nome FROM usuarios WHERE empresa_id = ? AND LOWER(perfil) IN (?, ?)`, [empresaId, B.PERFIL_COORD, B.PERFIL_ANALISTA]);
  const mapUser = new Map(users.map((u) => [B.chave(u.nome), u]));

  const unidadesCriarNomes = new Set();
  const unidadeId = (nomeBruto) => {
    const nome = String(nomeBruto || "").trim().toUpperCase();
    if (!nome) return null;
    const k = B.chave(nome);
    if (mapUn.has(k)) return mapUn.get(k);
    if (!unidadesCriarNomes.has(nome)) { unidadesCriarNomes.add(nome); rel.unidades_novas.push(nome); }
    return `novo:${nome}`;
  };
  const dimensaoId = (nomeBruto) => {
    const k = B.chave(nomeBruto);
    if (!k) return null;
    if (mapDim.has(k)) return mapDim.get(k);
    const alias = DIM_ALIAS[k];
    if (alias && mapDim.has(B.chave(alias))) return mapDim.get(B.chave(alias));
    return undefined; // não casou
  };

  // ── 1) Atividades ──────────────────────────────────────────────────
  const atividades = [];
  const vistos = new Set();
  if (abaAtv) {
    for (const linha of abaAtv.linhas) {
      const tema = pegar(abaAtv, linha, "acao / tema");
      const dataBr = B.dataISO(pegar(abaAtv, linha, "data de inicio")) || B.dataISO(pegar(abaAtv, linha, "data"));
      if (!tema && !dataBr) continue; // linha vazia / fórmula em branco
      rel.atividades.lidas += 1;
      if (!tema || !dataBr) { rel.atividades.sem_data_ou_tema += 1; rel.atividades.linhas_com_problema.push(linha.n); continue; }
      const tipoTxt = B.chave(pegar(abaAtv, linha, "tipo de atividade"));
      if (tipoTxt === "escuta individual") { rel.atividades.escuta_individual_adiada += 1; continue; }
      const tipo = TIPO_MAP[tipoTxt] || "outros";
      if (!TIPO_MAP[tipoTxt]) aviso(`Tipo de atividade desconhecido ("${tipoTxt}") foi importado como "Outros".`);
      const publico = pegar(abaAtv, linha, "setor / publico") || null;
      const unid = unidadeId(pegar(abaAtv, linha, "site"));
      const dimTxt = pegar(abaAtv, linha, "dimensao");
      const dim = dimensaoId(dimTxt);
      if (dim === undefined) { rel.atividades.sem_dimensao += 1; aviso(`Dimensão sem correspondência: "${dimTxt}" (importada sem dimensão).`); }
      const statusTxt = B.chave(pegar(abaAtv, linha, "status"));
      const status = STATUS_ATV_MAP[statusTxt] || "planejada";
      const evid = pegar(abaAtv, linha, "evidencia");
      const evUrl = B.urlValida(evid) ? evid : null;
      const evTexto = !evUrl && !isPlaceholder(evid) ? evid : null;
      if (status === "concluida" && !evUrl) rel.atividades.concluidas_sem_evidencia += 1;
      const analistaTxt = pegar(abaAtv, linha, "analista");
      const usr = mapUser.get(B.chave(analistaTxt));
      const horas = numero(pegar(abaAtv, linha, "horas"));
      const pessoas = numero(pegar(abaAtv, linha, "n de pessoas") || pegar(abaAtv, linha, "no de pessoas") || pegar(abaAtv, linha, "nº de pessoas"));
      const obs = [pegar(abaAtv, linha, "observacoes"), evTexto ? `Evidência (texto da planilha): ${evTexto}` : ""].filter(Boolean).join(" | ").slice(0, 1000) || null;
      const fim = B.dataISO(pegar(abaAtv, linha, "data de termino"));
      const chaveDedup = [dataBr, B.chave(tema), String(unid), B.chave(publico)].join("|");
      if (vistos.has(chaveDedup)) { rel.atividades.ja_existiam += 1; continue; }
      vistos.add(chaveDedup);
      const nomeProg = `${tema} ${publico || ""}`;
      atividades.push({
        n: linha.n, chaveDedup, tema: tema.slice(0, 250), publico: publico ? publico.slice(0, 150) : null, tipo, data_inicio: dataBr, data_fim: fim && fim >= dataBr ? fim : null,
        horas: horas !== null && horas >= 0 && horas <= 999 ? horas : 0, formato: FORMATO_MAP(pegar(abaAtv, linha, "formato")), status,
        resultado: (pegar(abaAtv, linha, "andamento") || "").slice(0, 1000) || null, proxima_etapa: (pegar(abaAtv, linha, "prazo / proxima") || "").slice(0, 300).replace(/^-$/, "") || null,
        observacoes: obs, unid, dim: dim === undefined ? null : dim, usr, analistaTxt: analistaTxt.slice(0, 150) || null,
        pessoas_legado: pessoas !== null && pessoas >= 0 ? Math.round(pessoas) : null,
        programa_id: B.chave(nomeProg).includes("diver+") && progDiver ? progDiver : progNucleo, evUrl,
      });
    }
  }

  // ── 2) Planos ──────────────────────────────────────────────────────
  const planos = [];
  if (abaPlano) {
    const vistosP = new Set();
    for (const linha of abaPlano.linhas) {
      const titulo = pegar(abaPlano, linha, "plano de acao");
      if (!titulo) continue;
      rel.planos.lidos += 1;
      const ident = B.dataISO(pegar(abaPlano, linha, "data de identificacao"));
      const prazo = B.dataISO(pegar(abaPlano, linha, "prazo"));
      if (!ident || !prazo) { rel.planos.sem_data_ou_prazo += 1; rel.planos.linhas_com_problema.push(linha.n); continue; }
      const dimTxt = pegar(abaPlano, linha, "dimensao");
      const dim = dimensaoId(dimTxt);
      if (dim === undefined) { rel.planos.sem_dimensao += 1; aviso(`Dimensão sem correspondência: "${dimTxt}" (importada sem dimensão).`); }
      const status = STATUS_ATV_MAP[B.chave(pegar(abaPlano, linha, "status"))] || "pendente";
      const evid = pegar(abaPlano, linha, "evidencia");
      const evUrl = B.urlValida(evid) ? evid : null;
      const evTexto = !evUrl && !isPlaceholder(evid) ? evid : null;
      if (status === "concluida" && !evUrl) rel.planos.concluidos_sem_evidencia += 1;
      const analistaTxt = pegar(abaPlano, linha, "analista");
      const unid = unidadeId(pegar(abaPlano, linha, "site"));
      const k = [B.chave(titulo), String(unid), ident, prazo].join("|");
      if (vistosP.has(k)) { rel.planos.ja_existiam += 1; continue; }
      vistosP.add(k);
      const ult = B.dataISO(pegar(abaPlano, linha, "ultima atualizacao"));
      planos.push({
        n: linha.n, k, titulo: titulo.slice(0, 250), ident, prazo: prazo < ident ? ident : prazo, status,
        pct: status === "concluida" ? 100 : Math.min(99, pct(pegar(abaPlano, linha, "% de conclusao"))), unid, dim: dim === undefined ? null : dim,
        usr: mapUser.get(B.chave(analistaTxt)), analistaTxt: analistaTxt.slice(0, 150) || null,
        proxima_etapa: (pegar(abaPlano, linha, "proxima etapa") || "").slice(0, 300).replace(/^-$/, "") || null,
        observacoes: [pegar(abaPlano, linha, "observacoes"), evTexto ? `Evidência (texto da planilha): ${evTexto}` : ""].filter(Boolean).join(" | ").slice(0, 1000) || null,
        concluido_em: status === "concluida" ? (ult || prazo) : null, evUrl,
        programa_id: B.chave(titulo).includes("diver+") && progDiver ? progDiver : progNucleo,
      });
    }
  }

  // ── 3) Participantes: casa com as atividades lidas (data + público) ─
  const parts = [];
  if (abaPart) {
    const idxData = (a) => a.filter((x) => x.tipo === "capacitacao" || x.tipo === "escuta_coletiva" || x.tipo === "acao_intervencao");
    const porData = new Map();
    for (const a of idxData(atividades)) { if (!porData.has(a.data_inicio)) porData.set(a.data_inicio, []); porData.get(a.data_inicio).push(a); }
    for (const linha of abaPart.linhas) {
      const nome = pegar(abaPart, linha, "nome");
      const mat = pegar(abaPart, linha, "matricula");
      if (!nome && !mat) continue;
      rel.participantes.lidos += 1;
      const acao = B.chave(pegar(abaPart, linha, "acao realizada"));
      if (acao === "escuta individual") { rel.participantes.escuta_individual_adiada += 1; continue; }
      const turma = B.dataISO(pegar(abaPart, linha, "id da turma"));
      const publico = B.chave(pegar(abaPart, linha, "publico"));
      const cand = turma ? porData.get(turma) || [] : [];
      let alvo = cand.filter((a) => B.chave(a.publico) === publico);
      if (alvo.length !== 1) alvo = cand.length === 1 ? cand : [];
      if (alvo.length !== 1) { rel.participantes.sem_atividade += 1; if (rel.participantes.linhas_com_problema.length < 100) rel.participantes.linhas_com_problema.push(linha.n); continue; }
      const pres = B.chave(pegar(abaPart, linha, "presenca"));
      parts.push({
        n: linha.n, ativ: alvo[0], matricula: mat, nome,
        presenca: pres.startsWith("aus") ? "ausente" : pres.startsWith("just") ? "justificado" : "presente",
        concluiu: pres.startsWith("conclu"),
      });
    }
  }

  // ── Simulação: para aqui ───────────────────────────────────────────
  const novasUnidades = [...unidadesCriarNomes];
  if (simular) {
    rel.atividades.importadas = atividades.length;
    rel.planos.importados = planos.length;
    // Em simulação não consultamos nem criamos pessoas: só contamos o que tem matrícula.
    for (const p of parts) { if (p.matricula) rel.participantes.gravados += 1; else rel.participantes.sem_matricula_sem_par += 1; }
    rel.avisos.push("Simulação: nada foi gravado. Participantes sem matrícula só são conferidos contra o cadastro na importação real.");
    return rel;
  }

  // ── Gravação (atividades, planos, unidades novas) numa transação ──
  const idsAtividade = new Map();
  await comTransacao(async (conn) => {
    const mapNovo = new Map();
    for (const nome of novasUnidades) {
      const [r] = await conn.query(`INSERT INTO nusp_unidades (empresa_id, nome) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [empresaId, nome]);
      mapNovo.set(`novo:${nome}`, r.insertId);
    }
    const resolveU = (u) => (typeof u === "string" ? mapNovo.get(u) || null : u);

    for (const a of atividades) {
      const unid = resolveU(a.unid);
      const [existe] = await conn.query(
        `SELECT id FROM nusp_atividades WHERE empresa_id = ? AND origem = 'importacao' AND data_inicio = ? AND tema = ? AND (unidade_id <=> ?) AND (publico <=> ?) LIMIT 1`,
        [empresaId, a.data_inicio, a.tema, unid, a.publico]);
      if (existe.length) { rel.atividades.ja_existiam += 1; idsAtividade.set(a, existe[0].id); continue; }
      const [r] = await conn.query(
        `INSERT INTO nusp_atividades (empresa_id, programa_id, tipo, dimensao_id, unidade_id, analista_id, analista_nome, tema, publico, data_inicio, data_fim,
           horas, formato, status, resultado, proxima_etapa, observacoes, pessoas_legado, origem, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importacao', ?)`,
        [empresaId, a.programa_id, a.tipo, a.dim, unid, a.usr?.id || null, a.usr?.nome || a.analistaTxt, a.tema, a.publico, a.data_inicio, a.data_fim,
         a.horas, a.formato, a.status, a.resultado, a.proxima_etapa, a.observacoes, a.pessoas_legado, usuario.id]);
      idsAtividade.set(a, r.insertId);
      rel.atividades.importadas += 1;
      if (a.evUrl) await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'atividade', ?, 'Importada da planilha', ?, ?, ?)`, [empresaId, r.insertId, a.evUrl, usuario.id, usuario.nome || null]);
    }

    for (const p of planos) {
      const unid = resolveU(p.unid);
      const [existe] = await conn.query(
        `SELECT id FROM nusp_planos_acao WHERE empresa_id = ? AND origem = 'importacao' AND titulo = ? AND (unidade_id <=> ?) AND data_identificacao = ? AND prazo = ? LIMIT 1`,
        [empresaId, p.titulo, unid, p.ident, p.prazo]);
      if (existe.length) { rel.planos.ja_existiam += 1; continue; }
      const [r] = await conn.query(
        `INSERT INTO nusp_planos_acao (empresa_id, programa_id, dimensao_id, unidade_id, titulo, responsavel_id, responsavel_nome, data_identificacao, prazo,
           status, pct_conclusao, proxima_etapa, observacoes, concluido_em, origem, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importacao', ?)`,
        [empresaId, p.programa_id, p.dim, unid, p.titulo, p.usr?.id || null, p.usr?.nome || p.analistaTxt, p.ident, p.prazo, p.status, p.pct, p.proxima_etapa, p.observacoes, p.concluido_em, usuario.id]);
      rel.planos.importados += 1;
      await conn.query(`INSERT INTO nusp_planos_historico (empresa_id, plano_id, usuario_id, usuario_nome, status, pct_conclusao, texto) VALUES (?, ?, ?, ?, ?, ?, 'Importado da planilha')`, [empresaId, r.insertId, usuario.id, usuario.nome || null, p.status, p.pct]);
      if (p.evUrl) await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'plano', ?, 'Importada da planilha', ?, ?, ?)`, [empresaId, r.insertId, p.evUrl, usuario.id, usuario.nome || null]);
    }
  });

  // ── Participantes (cada linha numa transação própria) ─────────────
  const porAtividade = new Map();
  for (const p of parts) {
    const idReal = idsAtividade.get(p.ativ);
    if (!idReal) { rel.participantes.sem_atividade += 1; continue; }
    let { matricula } = p;
    if (!matricula) {
      const [ach] = await pool.query(`SELECT matricula FROM pessoas WHERE empresa_id = ? AND nome = ? AND matricula IS NOT NULL AND matricula <> ''`, [empresaId, p.nome]);
      if (ach.length === 1) matricula = ach[0].matricula;
      else { rel.participantes.sem_matricula_sem_par += 1; if (rel.participantes.linhas_com_problema.length < 100) rel.participantes.linhas_com_problema.push(p.n); continue; }
    }
    if (!porAtividade.has(idReal)) porAtividade.set(idReal, []);
    porAtividade.get(idReal).push({ linha: p.n, matricula, nome: p.nome, presenca: p.presenca, concluiu: p.concluiu });
  }
  for (const [idAtv, itens] of porAtividade) {
    const r = await gravarParticipantes(empresaId, idAtv, itens);
    rel.participantes.gravados += r.gravados;
    rel.participantes.erros += r.erros.length;
    for (const e of r.erros) if (rel.participantes.linhas_com_problema.length < 100) rel.participantes.linhas_com_problema.push(e.linha);
  }
  return rel;
}

module.exports = { importarPlanilha };
