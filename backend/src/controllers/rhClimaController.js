/**
 * rhClimaController.js — Pesquisa de Clima Organizacional do RH (Pacotes 1 e 2, 12/11/2026)
 *
 * Perfis: coordenador_rh (tudo, inclusive cadastro de temas e exclusão), analista_rh (importa, lê tudo, gera relatórios)
 * e gestor_rh (só leitura; não vê o recorte por coordenação nem o relatório "RH interno").
 * A pesquisa é anônima: nada daqui devolve nome, login, matrícula ou resposta individual.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const R = require("../lib/rhBase");
const xl = require("../lib/excelExport");
const S = require("../services/rhClimaService");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });

const ehOperacao = (c) => R.PERFIS_OPERACAO.includes(c.perfil);
const num = (v) => (v === null || v === undefined ? null : Number(v));

async function ciclo(c, req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { R.erro(res, 404, "Ciclo não encontrado"); return null; }
  const x = await S.carregarCiclo(c.empresaId, id);
  if (!x) { R.erro(res, 404, "Ciclo não encontrado"); return null; }
  return x;
}

// ── Lista, importação e exclusão ──────────────────────────────────────
async function listar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    await R.garantirBase(c.empresaId);
    return res.json({ ok: true, ciclos: await S.listarCiclos(c.empresaId) });
  } catch (e) {
    console.error("[rh.clima.listar]", e);
    return R.erro(res, 500, "Erro ao listar os ciclos");
  }
}

async function importar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    if (!req.file?.buffer) return R.erro(res, 400, "Envie a planilha (.xlsx) no campo 'arquivo'");
    const q = { ...(req.body || {}), ...(req.query || {}) };
    const simular = String(q.simular) === "1";
    const rel = await S.importarClima({
      empresaId: c.empresaId, usuario: req.user, buffer: req.file.buffer, simular,
      nome: q.nome, cliente: q.cliente, substituir: String(q.substituir) === "1",
    });
    if (!simular) {
      auditar(req, "importar", "rh_clima_ciclo", rel.ciclo.id || null,
        `Importou a pesquisa de clima "${rel.ciclo.nome}": ${rel.linhas.respondentes} respondentes`, null,
        { ciclo: rel.ciclo.nome, respondentes: rel.linhas.respondentes, duplicados_removidos: rel.linhas.duplicados_removidos });
    }
    return res.json({ ok: true, ...rel });
  } catch (e) {
    if (!e.status) console.error("[rh.clima.importar]", e);
    return res.status(e.status || 500).json({ ok: false, codigo: e.codigo, message: e.status ? e.message : "Erro ao importar a pesquisa" });
  }
}

async function excluir(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const x = await ciclo(c, req, res); if (!x) return;
    await pool.query(`DELETE FROM rh_clima_resultados WHERE empresa_id = ? AND ciclo_id = ?`, [c.empresaId, x.id]);
    await pool.query(`DELETE FROM rh_clima_ciclos WHERE empresa_id = ? AND id = ?`, [c.empresaId, x.id]);
    auditar(req, "excluir", "rh_clima_ciclo", x.id, `Excluiu a pesquisa de clima "${x.nome}"`, { nome: x.nome, respondentes: x.n_respondentes }, null);
    return res.json({ ok: true, message: "Ciclo excluído" });
  } catch (e) {
    console.error("[rh.clima.excluir]", e);
    return R.erro(res, 500, "Erro ao excluir o ciclo");
  }
}

// ── Resultado e recortes ──────────────────────────────────────────────
async function resultado(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const x = await ciclo(c, req, res); if (!x) return;
    const r = await S.resultadoGeral(c.empresaId, x);
    if (!r) return R.erro(res, 404, "Este ciclo não tem resultado calculado");
    return res.json({ ok: true, ...r, recortes_disponiveis: S.tiposRecorte().filter((t) => !t.restrito || ehOperacao(c)) });
  } catch (e) {
    console.error("[rh.clima.resultado]", e);
    return R.erro(res, 500, "Erro ao carregar o resultado");
  }
}

async function recortes(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const x = await ciclo(c, req, res); if (!x) return;
    const tipo = String(req.query.tipo || "servico");
    const def = S.RECORTES.find((d) => d.tipo === tipo);
    if (!def) return R.erro(res, 400, "Recorte inválido");
    if (def.restrito && !ehOperacao(c)) return R.erro(res, 403, "O recorte por coordenação é só da equipe do RH.");
    const r = await S.recorte(c.empresaId, x, tipo);
    return res.json({ ok: true, ciclo: x, ...r, tipos: S.tiposRecorte().filter((t) => !t.restrito || ehOperacao(c)) });
  } catch (e) {
    console.error("[rh.clima.recortes]", e);
    return res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : "Erro ao carregar o recorte" });
  }
}

// ── Painel ────────────────────────────────────────────────────────────
async function painel(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    await R.garantirBase(c.empresaId);
    const ciclos = await S.listarCiclos(c.empresaId);
    let atual = null;
    if (ciclos.length) {
      const r = await S.resultadoGeral(c.empresaId, ciclos[0]);
      if (r) {
        const ordenados = [...r.temas].filter((t) => t.pos_pct !== null).sort((a, b) => a.pos_pct - b.pos_pct);
        atual = {
          ciclo: ciclos[0], resumo: r.resumo, limites: r.limites,
          kpis: { respondentes: r.n, pos_pct: r.geral.pos_pct, neg_pct: r.geral.neg_pct, neu_pct: r.geral.neu_pct, nota_media: r.nota_media, temas_vermelhos: r.temas.filter((t) => t.farol === "vermelho").length, total_temas: r.temas.length },
          atencao: ordenados.slice(0, 3), melhores: [...ordenados].reverse().slice(0, 3),
        };
      }
    }
    return res.json({ ok: true, atual, historico: ciclos });
  } catch (e) {
    console.error("[rh.painel]", e);
    return R.erro(res, 500, "Erro ao carregar o painel");
  }
}

// ── Cadastros: temas, afirmações e limites do farol ───────────────────
async function obterConfig(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const cfg = await R.carregarConfig(c.empresaId);
    return res.json({ ok: true, ...cfg, minimo_absoluto: R.MIN_RECORTE_MINIMO });
  } catch (e) {
    console.error("[rh.config]", e);
    return R.erro(res, 500, "Erro ao carregar os cadastros");
  }
}

async function salvarLimites(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const verde = Number(req.body?.farol_verde_min), amarelo = Number(req.body?.farol_amarelo_min), minimo = parseInt(req.body?.min_recorte, 10);
    const erros = [];
    if (!Number.isFinite(verde) || verde <= 0 || verde > 100) erros.push("O limite do verde deve estar entre 0 e 100");
    if (!Number.isFinite(amarelo) || amarelo < 0 || amarelo >= verde) erros.push("O limite do amarelo deve ser menor que o do verde");
    if (!Number.isInteger(minimo) || minimo < R.MIN_RECORTE_MINIMO) erros.push(`O mínimo de pessoas por recorte não pode ser menor que ${R.MIN_RECORTE_MINIMO}`);
    if (erros.length) return R.erro(res, 400, erros.join(". "));
    const antes = (await R.carregarConfig(c.empresaId)).limites;
    await pool.query(`UPDATE rh_config SET farol_verde_min = ?, farol_amarelo_min = ?, min_recorte = ? WHERE empresa_id = ?`, [verde, amarelo, minimo, c.empresaId]);
    auditar(req, "editar", "rh_config", c.empresaId, "Alterou os limites do farol e o mínimo por recorte do clima", antes, { farol_verde_min: verde, farol_amarelo_min: amarelo, min_recorte: minimo });
    return res.json({ ok: true, message: "Limites salvos. O mínimo por recorte vale para as próximas importações." });
  } catch (e) {
    console.error("[rh.config.limites]", e);
    return R.erro(res, 500, "Erro ao salvar os limites");
  }
}

async function criarTema(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const nome = String(req.body?.nome || "").trim();
    if (!nome) return R.erro(res, 400, "Informe o nome do tema");
    if (nome.length > 150) return R.erro(res, 400, "O nome do tema deve ter no máximo 150 caracteres");
    await R.garantirBase(c.empresaId);
    const [[m]] = await pool.query(`SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM rh_clima_temas WHERE empresa_id = ?`, [c.empresaId]);
    try {
      const [r] = await pool.query(`INSERT INTO rh_clima_temas (empresa_id, nome, ordem) VALUES (?, ?, ?)`, [c.empresaId, nome, m.prox]);
      auditar(req, "criar", "rh_clima_tema", r.insertId, `Criou o tema "${nome}"`, null, { nome });
      return res.status(201).json({ ok: true, id: r.insertId, message: "Tema criado" });
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return R.erro(res, 409, "Já existe um tema com esse nome");
      throw e;
    }
  } catch (e) {
    console.error("[rh.tema.criar]", e);
    return R.erro(res, 500, "Erro ao criar o tema");
  }
}

async function editarTema(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT id, nome, ativo FROM rh_clima_temas WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    if (!rows.length) return R.erro(res, 404, "Tema não encontrado");
    const nome = req.body?.nome !== undefined ? String(req.body.nome).trim() : rows[0].nome;
    const ativo = req.body?.ativo !== undefined ? (req.body.ativo ? 1 : 0) : rows[0].ativo;
    if (!nome || nome.length > 150) return R.erro(res, 400, "Nome do tema inválido");
    try {
      await pool.query(`UPDATE rh_clima_temas SET nome = ?, ativo = ? WHERE id = ? AND empresa_id = ?`, [nome, ativo, id, c.empresaId]);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return R.erro(res, 409, "Já existe um tema com esse nome");
      throw e;
    }
    auditar(req, "editar", "rh_clima_tema", id, `Editou o tema "${nome}"`, { nome: rows[0].nome, ativo: rows[0].ativo }, { nome, ativo });
    return res.json({ ok: true, message: "Tema salvo" });
  } catch (e) {
    console.error("[rh.tema.editar]", e);
    return R.erro(res, 500, "Erro ao salvar o tema");
  }
}

async function ligarAfirmacao(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const numero = Number(req.params.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 41) return R.erro(res, 404, "Afirmação não encontrada");
    const temaId = req.body?.tema_id === null || req.body?.tema_id === "" || req.body?.tema_id === undefined ? null : Number(req.body.tema_id);
    if (temaId !== null) {
      const [t] = await pool.query(`SELECT id FROM rh_clima_temas WHERE id = ? AND empresa_id = ?`, [temaId, c.empresaId]);
      if (!t.length) return R.erro(res, 400, "Tema inválido");
    }
    await R.garantirBase(c.empresaId);
    await pool.query(`UPDATE rh_clima_perguntas SET tema_id = ? WHERE empresa_id = ? AND numero = ?`, [temaId, c.empresaId, numero]);
    auditar(req, "editar", "rh_clima_pergunta", numero, `Ligou a afirmação ${numero} ao tema ${temaId ?? "(nenhum)"}`, null, { numero, tema_id: temaId });
    return res.json({ ok: true, message: "Afirmação salva" });
  } catch (e) {
    console.error("[rh.pergunta.ligar]", e);
    return R.erro(res, 500, "Erro ao salvar a afirmação");
  }
}

// ── Relatório (tela, Excel e impressão/PDF) ───────────────────────────
const PUBLICOS = {
  cliente: { rotulo: "Cliente", recortes: ["servico", "tempo", "faixa", "genero"] },
  diretoria: { rotulo: "Diretoria", recortes: ["servico", "tempo", "faixa", "genero", "cargo"] },
  rh: { rotulo: "RH interno", recortes: ["servico", "tempo", "faixa", "genero", "cargo", "coordenacao"] },
};
const SECOES = ["resumo", "temas", "afirmacoes", "notas", "perfil", "recortes"];

async function montarRelatorio(c, x, publico, secoes, recortesPedidos) {
  const def = PUBLICOS[publico];
  const base = await S.resultadoGeral(c.empresaId, x);
  const rel = { ciclo: x, publico, publico_rotulo: def.rotulo, secoes, tema_nomes: base.temas.map((t) => ({ id: t.id, nome: t.nome })), gerado_em: new Date().toISOString(), limites: base.limites, n: base.n };
  if (secoes.includes("resumo")) rel.resumo = { texto: base.resumo, geral: base.geral, nota_media: base.nota_media, temas_vermelhos: base.temas.filter((t) => t.farol === "vermelho").length, total_temas: base.temas.length };
  if (secoes.includes("temas")) rel.temas = [...base.temas].sort((a, b) => (b.pos_pct ?? -1) - (a.pos_pct ?? -1));
  if (secoes.includes("afirmacoes")) {
    const v = base.perguntas.filter((p) => p.pos_pct !== null).sort((a, b) => b.pos_pct - a.pos_pct);
    rel.afirmacoes = { melhores: v.slice(0, 5), piores: v.slice(-5).reverse(), todas: base.perguntas };
  }
  if (secoes.includes("notas")) rel.notas = base.notas;
  if (secoes.includes("perfil")) rel.perfil = base.perfil;
  if (secoes.includes("recortes")) {
    const tipos = (recortesPedidos.length ? recortesPedidos : def.recortes).filter((t) => def.recortes.includes(t));
    rel.recortes = [];
    for (const t of tipos) rel.recortes.push(await S.recorte(c.empresaId, x, t));
  }
  return rel;
}

function parametrosRelatorio(c, req, res) {
  const publico = String(req.query.publico || "diretoria");
  if (!PUBLICOS[publico]) { R.erro(res, 400, "Público inválido"); return null; }
  if (publico === "rh" && !ehOperacao(c)) { R.erro(res, 403, "O relatório do RH interno é só da equipe do RH."); return null; }
  const secoes = String(req.query.secoes || SECOES.join(",")).split(",").map((s) => s.trim()).filter((s) => SECOES.includes(s));
  if (!secoes.length) { R.erro(res, 400, "Escolha pelo menos uma seção"); return null; }
  const recortesPedidos = String(req.query.recortes || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { publico, secoes, recortesPedidos };
}

async function relatorio(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const x = await ciclo(c, req, res); if (!x) return;
    const p = parametrosRelatorio(c, req, res); if (!p) return;
    const rel = await montarRelatorio(c, x, p.publico, p.secoes, p.recortesPedidos);
    return res.json({ ok: true, publicos: Object.entries(PUBLICOS).filter(([k]) => k !== "rh" || ehOperacao(c)).map(([valor, d]) => ({ valor, rotulo: d.rotulo })), ...rel });
  } catch (e) {
    console.error("[rh.clima.relatorio]", e);
    return R.erro(res, 500, "Erro ao montar o relatório");
  }
}

async function exportar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const x = await ciclo(c, req, res); if (!x) return;
    const p = parametrosRelatorio(c, req, res); if (!p) return;
    const rel = await montarRelatorio(c, x, p.publico, p.secoes, p.recortesPedidos);
    const wb = xl.novoWorkbook();
    const FAROL = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };
    xl.adicionarTabela(wb, {
      nomeAba: "Resumo",
      colunas: [{ titulo: "Item", chave: "item", largura: 34 }, { titulo: "Valor", chave: "valor", largura: 70 }],
      linhas: [
        { item: "Pesquisa", valor: x.nome }, { item: "Cliente", valor: x.cliente || "—" }, { item: "Respondentes", valor: x.n_respondentes },
        { item: "Período das respostas", valor: x.data_ini && x.data_fim ? `${x.data_ini} a ${x.data_fim}` : "—" }, { item: "Relatório para", valor: rel.publico_rotulo },
        ...(rel.resumo ? [{ item: "Respostas positivas (%)", valor: Number(rel.resumo.geral.pos_pct.toFixed(1)) }, { item: "Respostas negativas (%)", valor: Number(rel.resumo.geral.neg_pct.toFixed(1)) }, { item: "Nota média das áreas (0 a 10)", valor: rel.resumo.nota_media === null ? "—" : Number(rel.resumo.nota_media.toFixed(1)) }, { item: "Leitura", valor: rel.resumo.texto }] : []),
        { item: "Como ler", valor: `Positivo = Concordo + Concordo Totalmente. Negativo = Discordo + Discordo Totalmente. Neutro inclui Não Sei. Farol: verde a partir de ${rel.limites.farol_verde_min}% positivo, amarelo a partir de ${rel.limites.farol_amarelo_min}%, vermelho abaixo. Grupos com menos de ${rel.limites.min_recorte} pessoas não aparecem.` },
      ],
    });
    if (rel.temas) {
      xl.adicionarTabela(wb, {
        nomeAba: "Temas",
        colunas: [{ titulo: "Tema", chave: "nome", largura: 46 }, { titulo: "Afirmações", chave: "n_afirmacoes", largura: 12 }, { titulo: "Positivas (%)", chave: "pos", formato: "decimal1", largura: 14 }, { titulo: "Neutras (%)", chave: "neu", formato: "decimal1", largura: 14 }, { titulo: "Negativas (%)", chave: "neg", formato: "decimal1", largura: 14 }, { titulo: "Farol", chave: "farol", largura: 12 }],
        linhas: rel.temas.map((t) => ({ nome: t.nome, n_afirmacoes: t.n_afirmacoes, pos: num(t.pos_pct), neu: num(t.neu_pct), neg: num(t.neg_pct), farol: FAROL[t.farol] || "—" })),
      });
    }
    if (rel.afirmacoes) {
      const tema = new Map(rel.tema_nomes.map((t) => [t.id, t.nome]));
      xl.adicionarTabela(wb, {
        nomeAba: "Afirmações",
        colunas: [{ titulo: "Nº", chave: "numero", largura: 6 }, { titulo: "Afirmação", chave: "texto", largura: 52 }, { titulo: "Tema", chave: "tema", largura: 38 }, { titulo: "Positivas (%)", chave: "pos", formato: "decimal1", largura: 14 }, { titulo: "Neutras (%)", chave: "neu", formato: "decimal1", largura: 14 }, { titulo: "Negativas (%)", chave: "neg", formato: "decimal1", largura: 14 }],
        linhas: rel.afirmacoes.todas.map((p2) => ({ numero: p2.numero, texto: p2.texto, tema: tema.get(p2.tema_id) || "—", pos: num(p2.pos_pct), neu: num(p2.neu_pct), neg: num(p2.neg_pct) })),
      });
    }
    if (rel.notas) {
      xl.adicionarTabela(wb, {
        nomeAba: "Áreas de apoio",
        colunas: [{ titulo: "Área", chave: "area", largura: 34 }, { titulo: "Nota média (0 a 10)", chave: "media", formato: "decimal1", largura: 20 }, { titulo: "Notas 9 e 10 (%)", chave: "alta", formato: "decimal1", largura: 18 }, { titulo: "Notas até 6 (%)", chave: "baixa", formato: "decimal1", largura: 18 }],
        linhas: rel.notas.map((a) => ({ area: a.area, media: num(a.media), alta: num(a.pct_9_10), baixa: num(a.pct_0_6) })),
      });
    }
    if (rel.perfil) {
      const linhas = [];
      const nomes = { tempo: "Tempo de casa", faixa: "Faixa etária", genero: "Gênero", escolaridade: "Escolaridade", estado_civil: "Estado civil", cargo: "Cargo/posição", servico: "Serviço" };
      for (const [k, itens] of Object.entries(rel.perfil)) for (const i of itens) linhas.push({ grupo: nomes[k] || k, rotulo: i.rotulo, n: i.n, pct: Number(i.pct.toFixed(1)) });
      xl.adicionarTabela(wb, {
        nomeAba: "Perfil de quem respondeu",
        colunas: [{ titulo: "Perfil", chave: "grupo", largura: 22 }, { titulo: "Grupo", chave: "rotulo", largura: 40 }, { titulo: "Respondentes", chave: "n", largura: 14 }, { titulo: "% do total", chave: "pct", formato: "decimal1", largura: 12 }],
        linhas,
      });
    }
    for (const rc of rel.recortes || []) {
      xl.adicionarTabela(wb, {
        nomeAba: `Por ${rc.nome}`.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31),
        colunas: [{ titulo: rc.nome, chave: "rotulo", largura: 34 }, { titulo: "Respondentes", chave: "n", largura: 14 }, { titulo: "Positivas (%)", chave: "pos", formato: "decimal1", largura: 14 }, { titulo: "Farol", chave: "farol", largura: 12 }, ...rc.temas.map((t) => ({ titulo: `${t.nome} (% pos.)`, chave: `t${t.id}`, formato: "decimal1", largura: 22 }))],
        linhas: [{ rotulo: "Geral", n: rc.geral.n, pos: num(rc.geral.pos_pct), farol: FAROL[rc.geral.farol] || "—", ...Object.fromEntries(rc.geral.temas.map((t) => [`t${t.id}`, num(t.pos_pct)])) }]
          .concat(rc.grupos.map((g) => ({ rotulo: g.rotulo, n: g.n, pos: num(g.pos_pct), farol: FAROL[g.farol] || "—", ...Object.fromEntries(g.temas.map((t) => [`t${t.id}`, num(t.pos_pct)])) }))),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    const slug = String(x.nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="clima_${slug}_${p.publico}_${R.hojeISO()}.xlsx"`);
    auditar(req, "exportar", "rh_clima_ciclo", x.id, `Exportou o relatório de clima "${x.nome}" para ${rel.publico_rotulo}`, null, { publico: p.publico, secoes: p.secoes });
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[rh.clima.exportar]", e);
    return R.erro(res, 500, "Erro ao exportar o relatório");
  }
}

module.exports = { listar, importar, excluir, resultado, recortes, painel, obterConfig, salvarLimites, criarTema, editarTema, ligarAfirmacao, relatorio, exportar };
