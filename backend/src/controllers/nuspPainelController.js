/**
 * nuspPainelController.js — Painel da diretoria e exportação Excel do Núcleo (Pacote 1, 06/11/2026)
 *
 * O painel é AGREGADO: não devolve nome nem matrícula de participante, por isso
 * pode ser lido também pelo gestor_nusp (diretoria/superintendência).
 * A exportação de participantes (nominal) é só para coordenador_nusp/analista_nusp.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const B = require("../lib/nuspBase");
const { filtroAtividades, SQL_ATIVIDADE, SQL_PLANO } = require("./nuspController");
const { registrarAuditoria } = require("../services/auditoria");
const xl = require("../lib/excelExport");

const n = (v) => Number(v || 0);

function periodoPadrao(q) {
  const hoje = B.hojeISO();
  const de = B.dataISO(q.de) || `${hoje.slice(0, 4)}-01-01`;
  const ate = B.dataISO(q.ate) || hoje;
  return { de, ate };
}

async function painel(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    await B.garantirBase(c.empresaId);
    const { de, ate } = periodoPadrao(req.query);
    // Mesmos filtros da listagem de atividades; "cancelada" não entra nos números.
    const f = filtroAtividades(c, { ...req.query, de, ate });
    const baseW = `${f.where} AND a.status <> 'cancelada'`;
    const P = f.params;

    const [[tot]] = await pool.query(
      `SELECT COUNT(*) atividades,
              SUM(a.status = 'concluida') concluidas, SUM(a.status = 'em_andamento') em_andamento, SUM(a.status = 'planejada') planejadas,
              COALESCE(SUM(a.horas), 0) horas
         FROM nusp_atividades a WHERE ${baseW}`, P);
    const [[pes]] = await pool.query(
      `SELECT COUNT(DISTINCT pa.pessoa_id) pessoas, COUNT(*) participacoes
         FROM nusp_participacoes pa JOIN nusp_atividades a ON a.id = pa.atividade_id
        WHERE ${baseW} AND pa.presenca = 'presente'`, P);
    const [[leg]] = await pool.query(
      `SELECT COALESCE(SUM(a.pessoas_legado), 0) sem_lista
         FROM nusp_atividades a
        WHERE ${baseW} AND a.pessoas_legado IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM nusp_participacoes pa WHERE pa.atividade_id = a.id)`, P);
    const [[ev]] = await pool.query(
      `SELECT SUM(a.status = 'concluida') concluidas,
              SUM(a.status = 'concluida' AND EXISTS (SELECT 1 FROM nusp_evidencias e WHERE e.empresa_id = a.empresa_id AND e.entidade = 'atividade' AND e.entidade_id = a.id)) com_evidencia
         FROM nusp_atividades a WHERE ${baseW}`, P);

    // Agrupa por uma dimensão. As horas saem de uma consulta à parte para o JOIN com participações
    // (uma linha por participante) não multiplicar a soma.
    const porDimExato = async (campoNome, joinSql, chave) => {
      const [rows] = await pool.query(
        `SELECT COALESCE(${campoNome}, 'Não informado') AS nome, COUNT(DISTINCT a.id) AS atividades,
                COUNT(DISTINCT CASE WHEN pa.presenca = 'presente' THEN pa.pessoa_id END) AS pessoas
           FROM nusp_atividades a ${joinSql}
           LEFT JOIN nusp_participacoes pa ON pa.atividade_id = a.id
          WHERE ${baseW} GROUP BY ${chave} ORDER BY atividades DESC, nome`, P);
      // horas por grupo sem o efeito do JOIN com participações:
      const [h] = await pool.query(
        `SELECT COALESCE(${campoNome}, 'Não informado') AS nome, COALESCE(SUM(a.horas), 0) AS horas
           FROM nusp_atividades a ${joinSql} WHERE ${baseW} GROUP BY ${chave}`, P);
      const horas = new Map(h.map((r) => [r.nome, n(r.horas)]));
      return rows.map((r) => ({ nome: r.nome, atividades: n(r.atividades), horas: horas.get(r.nome) || 0, pessoas: n(r.pessoas) }));
    };

    const [programa, unidade, dimensao, analista] = await Promise.all([
      porDimExato("p.nome", "LEFT JOIN nusp_programas p ON p.id = a.programa_id", "a.programa_id, p.nome"),
      porDimExato("u.nome", "LEFT JOIN nusp_unidades u ON u.id = a.unidade_id", "a.unidade_id, u.nome"),
      porDimExato("d.nome", "LEFT JOIN nusp_dimensoes d ON d.id = a.dimensao_id", "a.dimensao_id, d.nome"),
      porDimExato("a.analista_nome", "", "a.analista_id, a.analista_nome"),
    ]);
    const [tipoRows] = await pool.query(
      `SELECT a.tipo, COUNT(*) atividades, COALESCE(SUM(a.horas), 0) horas FROM nusp_atividades a WHERE ${baseW} GROUP BY a.tipo ORDER BY atividades DESC`, P);
    const rotuloTipo = Object.fromEntries(B.TIPOS_ATIVIDADE.map((t) => [t.value, t.label]));
    const tipo = tipoRows.map((r) => ({ nome: rotuloTipo[r.tipo] || r.tipo, atividades: n(r.atividades), horas: n(r.horas) }));

    const [mesAtv] = await pool.query(
      `SELECT DATE_FORMAT(a.data_inicio, '%Y-%m') mes, COUNT(*) atividades, COALESCE(SUM(a.horas), 0) horas
         FROM nusp_atividades a WHERE ${baseW} GROUP BY mes ORDER BY mes`, P);
    const [mesPes] = await pool.query(
      `SELECT DATE_FORMAT(a.data_inicio, '%Y-%m') mes, COUNT(DISTINCT pa.pessoa_id) pessoas
         FROM nusp_participacoes pa JOIN nusp_atividades a ON a.id = pa.atividade_id
        WHERE ${baseW} AND pa.presenca = 'presente' GROUP BY mes`, P);
    const pesMes = new Map(mesPes.map((r) => [r.mes, n(r.pessoas)]));
    const serie = mesAtv.map((r) => ({ mes: r.mes, atividades: n(r.atividades), horas: n(r.horas), pessoas: pesMes.get(r.mes) || 0 }));

    // Planos de ação — posição atual (não depende do período), respeitando programa/unidade/dimensão.
    const wp = ["pl.empresa_id = ?"]; const pp = [c.empresaId];
    for (const k of ["programa_id", "unidade_id", "dimensao_id"]) {
      const v = Number(req.query[k]); if (Number.isInteger(v) && v > 0) { wp.push(`pl.${k} = ?`); pp.push(v); }
    }
    const whereP = wp.join(" AND ");
    const [[pl]] = await pool.query(
      `SELECT COUNT(*) total,
              SUM(pl.status IN ('pendente','em_andamento')) abertos,
              SUM(pl.status IN ('pendente','em_andamento') AND pl.prazo < CURDATE()) atrasados,
              SUM(pl.status IN ('pendente','em_andamento') AND pl.prazo >= CURDATE() AND pl.prazo <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)) vencendo_7d,
              SUM(pl.status = 'concluida') concluidos,
              SUM(pl.status = 'concluida' AND pl.concluido_em <= pl.prazo) concluidos_no_prazo,
              SUM(pl.status = 'cancelada') cancelados
         FROM nusp_planos_acao pl WHERE ${whereP}`, pp);
    const [farol] = await pool.query(
      `${SQL_PLANO} WHERE ${whereP} AND pl.status IN ('pendente','em_andamento')
        ORDER BY pl.prazo ASC, pl.id LIMIT 12`, pp);
    const planosFarol = farol.map((r) => {
      const dias = Math.round((new Date(`${r.prazo}T00:00:00`) - new Date(`${B.hojeISO()}T00:00:00`)) / 86400000);
      return {
        id: r.id, titulo: r.titulo, unidade: r.unidade, dimensao: r.dimensao, responsavel: r.responsavel_nome, prazo: r.prazo,
        status: r.status, pct: r.pct_conclusao, dias, farol: dias < 0 ? "vermelho" : dias <= 7 ? "amarelo" : "verde",
      };
    });
    const [planoDim] = await pool.query(
      `SELECT COALESCE(d.nome, 'Não informado') nome, COUNT(*) total, SUM(pl.status IN ('pendente','em_andamento')) abertos,
              SUM(pl.status IN ('pendente','em_andamento') AND pl.prazo < CURDATE()) atrasados
         FROM nusp_planos_acao pl LEFT JOIN nusp_dimensoes d ON d.id = pl.dimensao_id
        WHERE ${whereP} GROUP BY pl.dimensao_id, d.nome ORDER BY abertos DESC, total DESC`, pp);

    const concl = n(ev.concluidas);
    return res.json({
      periodo: { de, ate },
      kpis: {
        atividades: n(tot.atividades), concluidas: n(tot.concluidas), em_andamento: n(tot.em_andamento), planejadas: n(tot.planejadas),
        horas: Math.round(n(tot.horas) * 100) / 100,
        pessoas_unicas: n(pes.pessoas), participacoes: n(pes.participacoes), pessoas_sem_lista: n(leg.sem_lista),
        concluidas_com_evidencia: n(ev.com_evidencia),
        pct_com_evidencia: concl ? Math.round((n(ev.com_evidencia) / concl) * 1000) / 10 : null,
      },
      planos: {
        total: n(pl.total), abertos: n(pl.abertos), atrasados: n(pl.atrasados), vencendo_7d: n(pl.vencendo_7d),
        concluidos: n(pl.concluidos), concluidos_no_prazo: n(pl.concluidos_no_prazo), cancelados: n(pl.cancelados),
        pct_no_prazo: n(pl.concluidos) ? Math.round((n(pl.concluidos_no_prazo) / n(pl.concluidos)) * 1000) / 10 : null,
        farol: planosFarol, por_dimensao: planoDim.map((r) => ({ nome: r.nome, total: n(r.total), abertos: n(r.abertos), atrasados: n(r.atrasados) })),
      },
      por_mes: serie, por_programa: programa, por_unidade: unidade, por_dimensao: dimensao, por_tipo: tipo, por_analista: analista,
    });
  } catch (e) {
    console.error("[nusp.painel]", e);
    return B.erro(res, 500, "Erro ao montar o painel do Núcleo");
  }
}

async function exportar(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const tipo = String(req.query.tipo || "atividades");
  try {
    const wb = xl.novoWorkbook();
    let nome = "nucleo";
    if (tipo === "atividades") {
      const f = filtroAtividades(c, req.query);
      const [rows] = await pool.query(`${SQL_ATIVIDADE} WHERE ${f.where} ORDER BY a.data_inicio DESC, a.id DESC LIMIT 20000`, f.params);
      const rt = Object.fromEntries(B.TIPOS_ATIVIDADE.map((t) => [t.value, t.label]));
      const rs = Object.fromEntries(B.STATUS_ATIVIDADE.map((t) => [t.value, t.label]));
      const rf = Object.fromEntries(B.FORMATOS.map((t) => [t.value, t.label]));
      xl.adicionarTabela(wb, {
        nomeAba: "Atividades",
        colunas: [
          { titulo: "Data", chave: "data_inicio", formato: "data", largura: 12 }, { titulo: "Término", chave: "data_fim", formato: "data", largura: 12 },
          { titulo: "Programa", chave: "programa", largura: 26 }, { titulo: "Frente", chave: "frente", largura: 22 },
          { titulo: "Tipo", chave: "tipo", largura: 22 }, { titulo: "Dimensão", chave: "dimensao", largura: 34 },
          { titulo: "Unidade", chave: "unidade", largura: 16 }, { titulo: "Analista", chave: "analista_nome", largura: 22 },
          { titulo: "Tema", chave: "tema", largura: 40 }, { titulo: "Público", chave: "publico", largura: 22 },
          { titulo: "Pessoas (lista)", chave: "pessoas", formato: "inteiro", largura: 14 }, { titulo: "Pessoas (sem lista)", chave: "pessoas_legado", formato: "inteiro", largura: 16 },
          { titulo: "Horas", chave: "horas", formato: "decimal1", largura: 10 }, { titulo: "Formato", chave: "formato", largura: 16 },
          { titulo: "Status", chave: "status", largura: 14 }, { titulo: "Evidências", chave: "evidencias", formato: "inteiro", largura: 12 },
          { titulo: "Resultado", chave: "resultado", largura: 40 }, { titulo: "Próxima etapa", chave: "proxima_etapa", largura: 30 },
        ],
        linhas: rows.map((r) => ({ ...r, tipo: rt[r.tipo] || r.tipo, status: rs[r.status] || r.status, formato: rf[r.formato] || r.formato, horas: n(r.horas) })),
      });
      nome = "nucleo_atividades";
    } else if (tipo === "planos") {
      const [rows] = await pool.query(`${SQL_PLANO} WHERE pl.empresa_id = ? ORDER BY pl.prazo, pl.id LIMIT 20000`, [c.empresaId]);
      const rs = Object.fromEntries(B.STATUS_PLANO.map((t) => [t.value, t.label]));
      xl.adicionarTabela(wb, {
        nomeAba: "Planos de ação",
        colunas: [
          { titulo: "Plano", chave: "titulo", largura: 44 }, { titulo: "Programa", chave: "programa", largura: 26 },
          { titulo: "Dimensão", chave: "dimensao", largura: 34 }, { titulo: "Unidade", chave: "unidade", largura: 16 },
          { titulo: "Responsável", chave: "responsavel_nome", largura: 22 }, { titulo: "Identificação", chave: "data_identificacao", formato: "data", largura: 14 },
          { titulo: "Prazo", chave: "prazo", formato: "data", largura: 12 }, { titulo: "Status", chave: "status", largura: 14 },
          { titulo: "% conclusão", chave: "pct_conclusao", formato: "inteiro", largura: 12 }, { titulo: "Atrasado", chave: "atrasado_txt", largura: 10 },
          { titulo: "Concluído em", chave: "concluido_em", formato: "data", largura: 14 }, { titulo: "Evidências", chave: "evidencias", formato: "inteiro", largura: 12 },
          { titulo: "Próxima etapa", chave: "proxima_etapa", largura: 30 },
        ],
        linhas: rows.map((r) => ({ ...r, status: rs[r.status] || r.status, atrasado_txt: Number(r.atrasado) ? "Sim" : "Não" })),
      });
      nome = "nucleo_planos_de_acao";
    } else if (tipo === "participantes") {
      if (!B.PERFIS_OPERACAO.includes(c.perfil)) return B.erro(res, 403, "A exportação nominal de participantes não está disponível para este perfil.");
      const f = filtroAtividades(c, req.query);
      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(a.data_inicio, '%Y-%m-%d') AS data, a.tema, u.nome AS unidade, pa.matricula, pa.nome, pa.presenca, pa.concluiu
           FROM nusp_participacoes pa JOIN nusp_atividades a ON a.id = pa.atividade_id
           LEFT JOIN nusp_unidades u ON u.id = a.unidade_id
          WHERE ${f.where} ORDER BY a.data_inicio DESC, a.id DESC, pa.nome LIMIT 50000`, f.params);
      xl.adicionarTabela(wb, {
        nomeAba: "Participantes",
        colunas: [
          { titulo: "Data", chave: "data", formato: "data", largura: 12 }, { titulo: "Atividade", chave: "tema", largura: 40 },
          { titulo: "Unidade", chave: "unidade", largura: 16 }, { titulo: "Matrícula", chave: "matricula", largura: 14 },
          { titulo: "Nome", chave: "nome", largura: 36 }, { titulo: "Presença", chave: "presenca", largura: 14 },
          { titulo: "Concluiu", chave: "concluiu_txt", largura: 10 },
        ],
        linhas: rows.map((r) => ({ ...r, concluiu_txt: Number(r.concluiu) ? "Sim" : "Não" })),
      });
      nome = "nucleo_participantes";
      registrarAuditoria({ usuario: req.user, acao: "exportar", entidade: "nusp_participante", entidadeId: null, resumo: `Exportou a lista nominal de participantes do Núcleo (${rows.length} linhas)`, ip: req.ip });
    } else {
      return B.erro(res, 400, "Tipo de exportação inválido");
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}_${B.hojeISO()}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[nusp.exportar]", e);
    return B.erro(res, 500, "Erro ao exportar");
  }
}

module.exports = { painel, exportar };
