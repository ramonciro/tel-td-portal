/**
 * nuspPesquisaController.js — Pesquisa de riscos psicossociais (NUSPSI, Pacote 3, 11/2026)
 *
 * Duas camadas, como o desenho do módulo:
 *  - AGREGADA (resultados, exportar, listar): aberta a coordenador, analista e gestor. Só lê
 *    nusp_pesquisa_resultados, que já sai com supressão de células < 5 respondentes. Nunca traz nome.
 *  - RESTRITA (individuais, individual): SÓ o coordenador do Núcleo. Cada leitura (lista e detalhe)
 *    vai para nusp_acessos_log; o gestor, o analista e qualquer outro perfil recebem 403.
 * Respostas e escores por pessoa ficam cifrados no banco (ver services/nuspPesquisaService).
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const B = require("../lib/nuspBase");
const crypto = require("../lib/nuspCrypto");
const xl = require("../lib/excelExport");
const S = require("../services/nuspPesquisaService");
const { auditar, paginacao } = require("./nuspController");

const n = (v) => Number(v || 0);
const ehCoord = (c) => c.perfil === B.PERFIL_COORD;
const soCoord = (req, res) => {
  const c = B.contexto(req, res); if (!c) return null;
  if (!ehCoord(c)) { B.erro(res, 403, "Só o coordenador do Núcleo pode fazer isso."); return null; }
  return c;
};

async function carregarPesquisa(id, empresaId) {
  const [rows] = await pool.query(
    `SELECT id, nome, ciclo, DATE_FORMAT(data_referencia, '%Y-%m-%d') AS data_referencia, instrumento, status, total_respostas,
            DATE_FORMAT(calculado_em, '%Y-%m-%d %H:%i') AS calculado_em
       FROM nusp_pesquisas WHERE id = ? AND empresa_id = ?`, [id, empresaId]);
  return rows[0] || null;
}

// ── Lista de pesquisas (agregado) ─────────────────────────────────────────
async function listar(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, ciclo, DATE_FORMAT(data_referencia, '%Y-%m-%d') AS data_referencia, instrumento, status, total_respostas,
              DATE_FORMAT(calculado_em, '%Y-%m-%d %H:%i') AS calculado_em
         FROM nusp_pesquisas WHERE empresa_id = ? ORDER BY data_referencia DESC, id DESC`, [c.empresaId]);
    return res.json({ ok: true, itens: rows, chave_configurada: ehCoord(c) ? crypto.chaveConfigurada() : undefined, minimo_celula: B.MINIMO_CELULA });
  } catch (e) {
    console.error("[nusp.pesquisa.listar]", e);
    return B.erro(res, 500, "Erro ao listar as pesquisas");
  }
}

// ── Resultados agregados + farol por dimensão ─────────────────────────────
async function resultados(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    const [dimsCad] = await pool.query(`SELECT id, nome, ordem FROM nusp_dimensoes WHERE empresa_id = ? ORDER BY ordem, id`, [c.empresaId]);
    const [rows] = await pool.query(
      `SELECT dimensao_id, recorte, unidade_id, servico, rotulo, n_respondentes, pct_exposicao, classificacao, suprimido
         FROM nusp_pesquisa_resultados WHERE empresa_id = ? AND pesquisa_id = ?`, [c.empresaId, id]);
    const usadas = new Set(rows.map((r) => r.dimensao_id));
    const dimensoes = dimsCad.filter((d) => usadas.has(d.id)).map((d) => ({ id: d.id, nome: d.nome }));

    const grupos = new Map();
    for (const r of rows) {
      const k = `${r.recorte}|${r.unidade_id || ""}|${r.servico || ""}`;
      if (!grupos.has(k)) grupos.set(k, { recorte: r.recorte, id: r.unidade_id, rotulo: r.rotulo, n: r.suprimido ? null : n(r.n_respondentes), suprimido: !!r.suprimido, res: {} });
      grupos.get(k).res[r.dimensao_id] = { pct: r.pct_exposicao === null ? null : Number(r.pct_exposicao), classificacao: r.classificacao };
    }
    const todos = [...grupos.values()];
    const nacional = todos.find((g) => g.recorte === "nacional") || null;
    const unidades = todos.filter((g) => g.recorte === "unidade").sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    const servicos = todos.filter((g) => g.recorte === "servico").sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

    // Pesquisa anterior (comparativo nacional)
    const [ant] = await pool.query(
      `SELECT id, ciclo FROM nusp_pesquisas WHERE empresa_id = ? AND id <> ? AND (data_referencia < ? OR (data_referencia = ? AND id < ?))
        ORDER BY data_referencia DESC, id DESC LIMIT 1`, [c.empresaId, id, pesq.data_referencia, pesq.data_referencia, id]);
    const pctAnterior = new Map();
    if (ant[0]) {
      const [ra] = await pool.query(
        `SELECT dimensao_id, pct_exposicao FROM nusp_pesquisa_resultados WHERE empresa_id = ? AND pesquisa_id = ? AND recorte = 'nacional' AND suprimido = 0`, [c.empresaId, ant[0].id]);
      for (const r of ra) pctAnterior.set(r.dimensao_id, r.pct_exposicao === null ? null : Number(r.pct_exposicao));
    }

    // Planos de ação ligados a cada dimensão
    const [pl] = await pool.query(
      `SELECT dimensao_id,
              SUM(status IN ('pendente','em_andamento')) abertos,
              SUM(status IN ('pendente','em_andamento') AND prazo < CURDATE()) atrasados,
              SUM(status = 'concluida') concluidos, COUNT(*) total
         FROM nusp_planos_acao WHERE empresa_id = ? AND dimensao_id IS NOT NULL AND status <> 'cancelada' GROUP BY dimensao_id`, [c.empresaId]);
    const planosDim = new Map(pl.map((r) => [r.dimensao_id, { abertos: n(r.abertos), atrasados: n(r.atrasados), concluidos: n(r.concluidos), total: n(r.total) }]));

    const farol = dimensoes.map((d) => {
      const r = nacional?.res[d.id] || { pct: null, classificacao: null };
      const planos = planosDim.get(d.id) || { abertos: 0, atrasados: 0, concluidos: 0, total: 0 };
      const situacao = r.classificacao === "alto" ? (planos.abertos ? "em_tratamento" : "sem_plano")
        : r.classificacao === "moderado" ? (planos.abertos ? "em_tratamento" : "monitorar")
          : r.classificacao === "baixo" ? "ok" : "sem_dado";
      const ap = pctAnterior.get(d.id);
      const pct = r.pct === null ? null : Math.round(r.pct * 10) / 10;
      return {
        dimensao_id: d.id, dimensao: d.nome, pct, classificacao: r.classificacao,
        anterior_pct: ap === undefined ? null : ap, variacao: ap === undefined || ap === null || pct === null ? null : Math.round((pct - ap) * 10) / 10,
        planos, situacao,
      };
    });
    const resumo = {
      altas: farol.filter((f) => f.classificacao === "alto").length,
      moderadas: farol.filter((f) => f.classificacao === "moderado").length,
      baixas: farol.filter((f) => f.classificacao === "baixo").length,
      altas_sem_plano: farol.filter((f) => f.situacao === "sem_plano").length,
    };
    return res.json({
      ok: true, pesquisa: pesq, anterior: ant[0] ? { id: ant[0].id, ciclo: ant[0].ciclo } : null, minimo_celula: B.MINIMO_CELULA,
      dimensoes, nacional, unidades, servicos, farol, resumo,
      criterio: { baixo: "0% a 25%", moderado: "26% a 50%", alto: "acima de 50%" },
    });
  } catch (e) {
    console.error("[nusp.pesquisa.resultados]", e);
    return B.erro(res, 500, "Erro ao consultar os resultados da pesquisa");
  }
}

// ── Camada restrita: individual (só coordenador) ──────────────────────────
async function individuais(req, res) {
  const c = soCoord(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    const { limite, offset, pagina } = paginacao(req.query);
    const w = ["r.empresa_id = ?", "r.pesquisa_id = ?"]; const p = [c.empresaId, id];
    const un = Number(req.query.unidade_id); if (Number.isInteger(un) && un > 0) { w.push("r.unidade_id = ?"); p.push(un); }
    const sv = String(req.query.servico || "").trim(); if (sv) { w.push("r.servico = ?"); p.push(sv.slice(0, 150)); }
    const busca = String(req.query.busca || "").trim();
    if (busca) { w.push("(pe.nome LIKE ? OR pe.matricula LIKE ?)"); p.push(`%${busca.slice(0, 80)}%`, `%${busca.slice(0, 80)}%`); }
    const [[t]] = await pool.query(`SELECT COUNT(*) total FROM nusp_pesquisa_respostas r JOIN pessoas pe ON pe.id = r.pessoa_id WHERE ${w.join(" AND ")}`, p);
    const [rows] = await pool.query(
      `SELECT r.id, r.pessoa_id, pe.nome, pe.matricula, u.nome AS unidade, r.servico, r.funcao, DATE_FORMAT(r.respondida_em, '%Y-%m-%d') AS respondida_em
         FROM nusp_pesquisa_respostas r JOIN pessoas pe ON pe.id = r.pessoa_id LEFT JOIN nusp_unidades u ON u.id = r.unidade_id
        WHERE ${w.join(" AND ")} ORDER BY pe.nome LIMIT ? OFFSET ?`, [...p, limite, offset]);
    await B.registrarLeitura(req, c.empresaId, "pesquisa_individual_lista", id, `${rows.length} de ${n(t.total)} respostas`);
    return res.json({ ok: true, total: n(t.total), pagina, limite, itens: rows });
  } catch (e) {
    console.error("[nusp.pesquisa.individuais]", e);
    return B.erro(res, 500, "Erro ao listar as respostas individuais");
  }
}

async function individual(req, res) {
  const c = soCoord(req, res); if (!c) return;
  const id = Number(req.params.id); const rid = Number(req.params.rid);
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.pesquisa_id, r.pessoa_id, pe.nome, pe.matricula, u.nome AS unidade, r.site, r.servico, r.funcao, r.supervisor, r.coordenador, r.tipo_pesquisa,
              DATE_FORMAT(r.respondida_em, '%Y-%m-%d') AS respondida_em, r.dados_cifrados
         FROM nusp_pesquisa_respostas r JOIN pessoas pe ON pe.id = r.pessoa_id LEFT JOIN nusp_unidades u ON u.id = r.unidade_id
        WHERE r.id = ? AND r.pesquisa_id = ? AND r.empresa_id = ?`, [rid, id, c.empresaId]);
    const r = rows[0];
    if (!r) return B.erro(res, 404, "Resposta não encontrada");
    const d = S.decifrarDados(r.dados_cifrados, c.empresaId);
    if (d.erro === "SEM_CHAVE") return B.erro(res, 503, "Falta configurar a chave de criptografia (NUSP_CRYPTO_KEY) neste ambiente.", { codigo: "SEM_CHAVE" });
    if (d.erro) return B.erro(res, 500, "Não consegui abrir esta resposta, o conteúdo está ilegível.", { codigo: "ILEGIVEL" });
    const resp = d.dados.r || {}; const esc = d.dados.e || {};
    const perguntas = S.PERGUNTAS.map((p) => {
      const cl = S.classificarResposta(p.regra, resp[String(p.n)]);
      return {
        n: p.n, texto: p.texto, dimensao: p.dim ? S.DIMENSOES.find((x) => x.chave === p.dim).nome : null,
        resposta: resp[String(p.n)] || null, leitura: cl === "fav" ? "favoravel" : cl === "desf" ? "desfavoravel" : null,
      };
    });
    const dimensoes = S.DIMENSOES.map((x) => {
      const [f, dz] = esc[x.chave] || [0, 0];
      const pct = f + dz > 0 ? (dz / (f + dz)) * 100 : null;
      return { dimensao: x.nome, favoraveis: f, desfavoraveis: dz, pct: pct === null ? null : Math.round(pct * 10) / 10, classificacao: S.classificar(pct) };
    });
    await B.registrarLeitura(req, c.empresaId, "pesquisa_individual", rid, `pesquisa ${id}`);
    const { dados_cifrados, ...resto } = r;
    return res.json({ ok: true, resposta: resto, perguntas, dimensoes });
  } catch (e) {
    console.error("[nusp.pesquisa.individual]", e);
    return B.erro(res, 500, "Erro ao abrir a resposta");
  }
}

// ── Importação / manutenção (só coordenador) ──────────────────────────────
async function importar(req, res) {
  const c = soCoord(req, res); if (!c) return;
  try {
    if (!req.file?.buffer) return B.erro(res, 400, "Envie a planilha (.xlsx) no campo 'arquivo'");
    const q = { ...(req.body || {}), ...(req.query || {}) };
    const simular = String(q.simular) === "1";
    const criarPlanos = String(q.criar_planos ?? "1") !== "0";
    const rel = await S.importarPesquisa({
      empresaId: c.empresaId, usuario: req.user, buffer: req.file.buffer, simular,
      ciclo: q.ciclo, nome: q.nome, dataReferencia: q.data_referencia, criarPlanos,
    });
    if (!simular) {
      auditar(req, "importar", "nusp_pesquisa", rel.pesquisa.id || null,
        `Importou a pesquisa de riscos psicossociais "${rel.pesquisa.ciclo}": ${rel.linhas.importadas} ${rel.linhas.importadas === 1 ? "resposta" : "respostas"}`, null,
        { ciclo: rel.pesquisa.ciclo, respostas: rel.linhas.importadas, planos_criados: rel.planos.criados });
    }
    return res.json({ ok: true, ...rel });
  } catch (e) {
    console.error("[nusp.pesquisa.importar]", e);
    return res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : "Erro ao importar a pesquisa" });
  }
}

async function recalcular(req, res) {
  const c = soCoord(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    const r = await comTransacao((conn) => S.recalcularResultados(c.empresaId, id, conn));
    auditar(req, "editar", "nusp_pesquisa", id, `Recalculou os resultados da pesquisa "${pesq.ciclo}"`, null, r);
    return res.json({ ok: true, message: "Resultados recalculados", ...r });
  } catch (e) {
    if (e.codigo === "SEM_CHAVE") return B.erro(res, 503, "Falta configurar a chave de criptografia (NUSP_CRYPTO_KEY) neste ambiente.", { codigo: "SEM_CHAVE" });
    console.error("[nusp.pesquisa.recalcular]", e);
    return B.erro(res, 500, "Erro ao recalcular os resultados");
  }
}

async function planosSugeridos(req, res) {
  const c = soCoord(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    const r = await comTransacao((conn) => S.criarPlanosSugeridos(c.empresaId, req.user, pesq.ciclo, conn));
    auditar(req, "criar", "nusp_plano", null, `Criou ${r.criados} ${r.criados === 1 ? "plano sugerido" : "planos sugeridos"} a partir da pesquisa "${pesq.ciclo}"`, null, r);
    return res.json({ ok: true, message: r.criados ? `${r.criados} ${r.criados === 1 ? "plano sugerido criado" : "planos sugeridos criados"}` : "Os planos sugeridos já existem", ...r });
  } catch (e) {
    console.error("[nusp.pesquisa.planosSugeridos]", e);
    return B.erro(res, 500, "Erro ao criar os planos sugeridos");
  }
}

async function excluir(req, res) {
  const c = soCoord(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    await comTransacao(async (conn) => {
      await conn.query(`DELETE FROM nusp_pesquisa_respostas WHERE pesquisa_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_pesquisa_resultados WHERE pesquisa_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_pesquisas WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    });
    auditar(req, "excluir", "nusp_pesquisa", id, `Excluiu a pesquisa "${pesq.ciclo}" e todas as respostas dela`, { ciclo: pesq.ciclo, respostas: pesq.total_respostas }, null);
    return res.json({ ok: true, message: "Pesquisa excluída" });
  } catch (e) {
    console.error("[nusp.pesquisa.excluir]", e);
    return B.erro(res, 500, "Erro ao excluir a pesquisa");
  }
}

// ── Exportação (agregado) ─────────────────────────────────────────────────
async function exportar(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const pesq = await carregarPesquisa(id, c.empresaId);
    if (!pesq) return B.erro(res, 404, "Pesquisa não encontrada");
    const [dimsCad] = await pool.query(`SELECT id, nome FROM nusp_dimensoes WHERE empresa_id = ? ORDER BY ordem, id`, [c.empresaId]);
    const [rows] = await pool.query(
      `SELECT dimensao_id, recorte, unidade_id, servico, rotulo, n_respondentes, pct_exposicao, classificacao, suprimido
         FROM nusp_pesquisa_resultados WHERE empresa_id = ? AND pesquisa_id = ?`, [c.empresaId, id]);
    const dims = dimsCad.filter((d) => rows.some((r) => r.dimensao_id === d.id));
    const rot = { baixo: "Baixa", moderado: "Moderada", alto: "Alta" };
    const wb = xl.novoWorkbook();
    // Nacional: uma linha por dimensão
    const nac = rows.filter((r) => r.recorte === "nacional");
    xl.adicionarTabela(wb, {
      nomeAba: "Nacional",
      colunas: [
        { titulo: "Dimensão", chave: "dimensao", largura: 44 }, { titulo: "% de exposição", chave: "pct", formato: "decimal1", largura: 16 },
        { titulo: "Classificação", chave: "classificacao", largura: 16 }, { titulo: "Respondentes", chave: "n", largura: 14 },
      ],
      linhas: dims.map((d) => {
        const r = nac.find((x) => x.dimensao_id === d.id);
        return { dimensao: d.nome, pct: r && !r.suprimido ? Number(r.pct_exposicao) : null, classificacao: r?.classificacao ? rot[r.classificacao] : "—", n: r && !r.suprimido ? n(r.n_respondentes) : null };
      }),
    });
    // Unidade / Serviço: uma linha por grupo, uma coluna por dimensão
    for (const [recorte, aba, tituloGrupo] of [["unidade", "Por unidade", "Unidade"], ["servico", "Por serviço", "Serviço"]]) {
      const grupos = new Map();
      for (const r of rows.filter((x) => x.recorte === recorte)) {
        if (!grupos.has(r.rotulo)) grupos.set(r.rotulo, { grupo: r.rotulo, n: r.suprimido ? null : n(r.n_respondentes), obs: r.suprimido ? `Suprimido (menos de ${B.MINIMO_CELULA} respondentes)` : "" });
        grupos.get(r.rotulo)[`d${r.dimensao_id}`] = r.suprimido ? null : Number(r.pct_exposicao);
      }
      xl.adicionarTabela(wb, {
        nomeAba: aba,
        colunas: [
          { titulo: tituloGrupo, chave: "grupo", largura: 28 }, { titulo: "Respondentes", chave: "n", largura: 14 },
          ...dims.map((d) => ({ titulo: d.nome, chave: `d${d.id}`, formato: "decimal1", largura: 18 })),
          { titulo: "Observação", chave: "obs", largura: 36 },
        ],
        linhas: [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR")),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="nucleo_pesquisa_${String(pesq.ciclo).replace(/[^A-Za-z0-9_-]/g, "")}_${B.hojeISO()}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[nusp.pesquisa.exportar]", e);
    return B.erro(res, 500, "Erro ao exportar os resultados");
  }
}

module.exports = { listar, resultados, individuais, individual, importar, recalcular, planosSugeridos, excluir, exportar };
