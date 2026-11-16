/**
 * auditoriaParticipantesController.js — Auditoria de participantes por turma (16/11/2026).
 *
 * Origem: turma "JMA - RA" mostrava 11 participantes / 91% quando a lista tinha 10. O número gravado em
 * treinamentos.participantes não era atualizado quando alguém era excluído, e presenças de quem saiu da lista
 * continuavam sendo contadas. Este módulo permite conferir TODAS as turmas de uma vez e, se quiser, alinhar o número
 * gravado com a lista real.
 *
 *   GET  /api/treinamentos/auditoria-participantes[?so_divergentes=1][&formato=xlsx]   — só leitura
 *   POST /api/treinamentos/auditoria-participantes/sincronizar { confirmar: true, ids?: [] } — grava SÓ
 *        treinamentos.participantes (= ativos da lista), nas turmas que têm lista. Não apaga presença nem participante.
 *
 * Base adotada ("só quem está ativo na lista"): participante com desistencia_em preenchido não conta.
 */
const pool = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");
const { getResumoPresenca } = require("../services/presencaResolver");
const { recontarParticipantesDasTurmas } = require("../services/turmaRegras");
const { tenantScopeFor } = require("../lib/tenantScope");

const n = (v) => Number(v || 0);

async function montarAuditoria(empresaId) {
  const where = empresaId ? "WHERE t.empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];

  const [turmas] = await pool.query(
    `SELECT t.id, t.tema, t.cliente, t.status, COALESCE(t.data_inicio, t.data) AS inicio,
            COALESCE(t.participantes, 0) AS gravado,
            (SELECT COUNT(*) FROM treinamento_participantes p WHERE p.treinamento_id = t.id) AS lista_total,
            (SELECT COUNT(*) FROM treinamento_participantes p WHERE p.treinamento_id = t.id AND p.desistencia_em IS NULL) AS lista_ativos
       FROM treinamentos t ${where}
      ORDER BY COALESCE(t.data_inicio, t.data) DESC, t.id DESC`,
    params
  );
  if (!turmas.length) return [];
  const ids = turmas.map((t) => Number(t.id));
  const inIds = ids.map(() => "?").join(",");

  // Nomes com presença lançada (cronograma novo + legado) que NÃO estão ativos na lista da turma.
  const orfaos = new Map();
  for (const tabela of ["presenca_aulas", "presencas"]) {
    const [rows] = await pool.query(
      `SELECT x.treinamento_id, x.treinando_nome AS nome
         FROM ${tabela} x
        WHERE x.treinamento_id IN (${inIds})
          AND EXISTS (SELECT 1 FROM treinamento_participantes q WHERE q.treinamento_id = x.treinamento_id)
          AND NOT EXISTS (SELECT 1 FROM treinamento_participantes a
                           WHERE a.treinamento_id = x.treinamento_id AND a.nome = x.treinando_nome AND a.desistencia_em IS NULL)
        GROUP BY x.treinamento_id, x.treinando_nome`,
      ids
    );
    for (const r of rows) {
      const k = Number(r.treinamento_id);
      if (!orfaos.has(k)) orfaos.set(k, new Set());
      orfaos.get(k).add(r.nome);
    }
  }

  // O que a tela mostra hoje (mesma fonte do card de Gestão de Turmas).
  const mostrado = new Map();
  try {
    const dados = await getResumoPresenca({ empresaId });
    for (const it of Array.isArray(dados) ? dados : []) mostrado.set(Number(it.id), it);
  } catch (e) {
    console.error("[auditoriaParticipantes] resumo indisponível:", e.message || e);
  }

  return turmas.map((t) => {
    const id = Number(t.id);
    const r = mostrado.get(id);
    const previstos = r ? n(r.treinandos_previstos) : null;
    const confirmados = r ? n(r.treinandos_confirmados) : null;
    const pct = previstos > 0 ? Math.min(100, Math.round((confirmados / previstos) * 100)) : 0;
    const temLista = n(t.lista_total) > 0;
    const ativos = n(t.lista_ativos);
    const nomesOrfaos = [...(orfaos.get(id) || [])].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
    const contadorDivergente = temLista && n(t.gravado) !== ativos;
    const motivos = [];
    if (contadorDivergente) motivos.push(`número gravado (${n(t.gravado)}) ≠ lista ativa (${ativos})`);
    if (nomesOrfaos.length) motivos.push(`${nomesOrfaos.length} nome(s) com presença lançada mas fora da lista ativa (excluído ou desistente)`);
    if (previstos != null && temLista && previstos !== ativos) motivos.push(`tela mostra ${previstos}, lista tem ${ativos}`);
    if (previstos != null && confirmados > previstos) motivos.push("confirmados maior que previstos");
    return {
      id,
      turma: t.tema,
      cliente: t.cliente,
      status: t.status,
      inicio: t.inicio,
      tem_lista: temLista,
      numero_gravado: n(t.gravado),
      lista_total: n(t.lista_total),
      lista_ativos: ativos,
      desistentes: n(t.lista_total) - ativos,
      tela_previstos: previstos,
      tela_confirmados: confirmados,
      tela_pct: previstos == null ? null : pct,
      nomes_orfaos: nomesOrfaos,
      divergente: motivos.length > 0,
      motivo: motivos.join("; "),
      sincronizavel: contadorDivergente,
    };
  });
}

async function listar(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId && String(req.user?.perfil || "").toLowerCase() !== "super_admin") {
      return res.status(400).json({ ok: false, message: "Empresa não identificada." });
    }
    let itens = await montarAuditoria(empresaId);
    const resumo = {
      turmas: itens.length,
      divergentes: itens.filter((i) => i.divergente).length,
      sincronizaveis: itens.filter((i) => i.sincronizavel).length,
      com_presenca_orfa: itens.filter((i) => i.nomes_orfaos.length).length,
    };
    if (String(req.query.so_divergentes || "") === "1") itens = itens.filter((i) => i.divergente);

    if (String(req.query.formato || "").toLowerCase() === "xlsx") {
      const { novoWorkbook, adicionarTabela } = require("../lib/excelExport");
      const wb = novoWorkbook();
      adicionarTabela(wb, {
        nomeAba: "Auditoria de participantes",
        colunas: [
          { titulo: "ID", chave: "id", largura: 8, formato: "inteiro" },
          { titulo: "Turma", chave: "turma", largura: 32 },
          { titulo: "Cliente", chave: "cliente", largura: 18 },
          { titulo: "Status", chave: "status", largura: 14 },
          { titulo: "Início", chave: "inicio", largura: 12, formato: "data" },
          { titulo: "Número gravado", chave: "numero_gravado", largura: 14, formato: "inteiro" },
          { titulo: "Lista ativa", chave: "lista_ativos", largura: 12, formato: "inteiro" },
          { titulo: "Desistentes", chave: "desistentes", largura: 12, formato: "inteiro" },
          { titulo: "Tela: previstos", chave: "tela_previstos", largura: 14, formato: "inteiro" },
          { titulo: "Tela: confirmados", chave: "tela_confirmados", largura: 16, formato: "inteiro" },
          { titulo: "Tela: %", chave: "tela_pct", largura: 10, formato: "inteiro" },
          { titulo: "Divergente?", chave: "divergente_txt", largura: 12 },
          { titulo: "Motivo", chave: "motivo", largura: 50 },
          { titulo: "Nomes com presença fora da lista", chave: "orfaos_txt", largura: 50 },
        ],
        linhas: itens.map((i) => ({ ...i, divergente_txt: i.divergente ? "Sim" : "Não", orfaos_txt: i.nomes_orfaos.join(", ") })),
      });
      const buf = await wb.xlsx.writeBuffer();
      registrarAuditoria({
        usuario: req.user, acao: "exportar", entidade: "treinamento", entidadeId: null,
        resumo: `${req.user?.nome || "Alguém"} exportou a auditoria de participantes por turma (${itens.length} linha(s), ${resumo.divergentes} divergente(s))`,
        ip: req.ip,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="auditoria-participantes-turmas.xlsx"');
      return res.send(Buffer.from(buf));
    }

    return res.json({ ok: true, resumo, itens });
  } catch (e) {
    console.error("[auditoriaParticipantes.listar]", e.message || e);
    return res.status(500).json({ ok: false, message: "Erro ao auditar os participantes das turmas." });
  }
}

async function sincronizar(req, res) {
  if (req.body?.confirmar !== true) {
    return res.status(400).json({ ok: false, message: "Confirmação ausente. Revise a auditoria e confirme a sincronização." });
  }
  const conn = await pool.getConnection();
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId && String(req.user?.perfil || "").toLowerCase() !== "super_admin") {
      conn.release();
      return res.status(400).json({ ok: false, message: "Empresa não identificada." });
    }
    const auditoria = await montarAuditoria(empresaId);
    const pedidos = Array.isArray(req.body?.ids) ? new Set(req.body.ids.map(Number)) : null;
    const alvo = auditoria.filter((i) => i.sincronizavel && (!pedidos || pedidos.has(i.id)));

    await conn.beginTransaction();
    await recontarParticipantesDasTurmas(conn, alvo.map((i) => i.id), { soComLista: true });
    await conn.commit();

    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "treinamento", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} sincronizou o número de participantes de ${alvo.length} turma(s) com a lista ativa`,
      dadosAntes: alvo.map((i) => ({ id: i.id, turma: i.turma, de: i.numero_gravado, para: i.lista_ativos })),
      ip: req.ip,
    });
    return res.json({
      ok: true,
      atualizadas: alvo.length,
      alteracoes: alvo.map((i) => ({ id: i.id, turma: i.turma, de: i.numero_gravado, para: i.lista_ativos })),
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error("[auditoriaParticipantes.sincronizar]", e.message || e);
    return res.status(500).json({ ok: false, message: "Erro ao sincronizar os participantes das turmas." });
  } finally {
    conn.release();
  }
}

module.exports = { listar, sincronizar, montarAuditoria };
