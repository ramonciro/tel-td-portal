/**
 * Importação de provas feitas no papel (16/10/2026).
 *
 * Fluxo: o instrutor cria uma importação (lote) na turma, anexa a foto/PDF
 * digitalizado, lança por pessoa as respostas marcadas (corrige pelo gabarito
 * da prova cadastrada) ou a nota final, confere e CONFIRMA. Só a confirmação
 * mexe nas notas:
 *   - avaliacoes.nota_prova (escala 0–10) — o que Dashboard, Analytics e
 *     Certificados leem;
 *   - respostas_avaliativas (origem 'papel') — só para quem teve as respostas
 *     corrigidas pelo gabarito; conta como uma tentativa da prova.
 * A coordenação pode desfazer a importação (com Auditoria).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { registrarAuditoria } = require("../services/auditoria");
const { acesso } = require("./rotinaController");
const { pastaUploads, gerarQuery } = require("../lib/uploadAssinado");
const { condicaoIdentidade } = require("../lib/identidadeTreinando");
const { parseQuestoes } = require("../lib/correcaoProva");
const P = require("../lib/provasPapel");
const PL = require("../lib/planilhaNotasPapel");

const erro = (res, status, msg, extra = {}) => res.status(status).json({ ok: false, message: msg, error: msg, ...extra });
const texto = (v, max) => {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
/** DATE do MySQL pode vir como Date (fuso local) ou texto: devolve sempre AAAA-MM-DD. */
const dataISO = (v) => {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const p2 = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  }
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const pastaScans = () => path.join(pastaUploads(), "provas-papel");
const MAX_ARQUIVOS = 30;

/* ───────────────────────── acesso ───────────────────────── */

async function carregarLote(req, res, { editar = false } = {}) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    erro(res, 400, "Importação inválida.");
    return null;
  }
  const [rows] = await pool.query("SELECT * FROM prova_papel_lotes WHERE id = ? LIMIT 1", [id]);
  const lote = rows[0];
  const t = lote ? await acesso.buscarTurma(req, lote.treinamento_id) : null;
  if (!lote || !t) {
    erro(res, 404, "Importação não encontrada.");
    return null;
  }
  if (editar ? !acesso.podeEditarTurma(req, t) : !acesso.podeVerTurma(req, t)) {
    erro(res, 403, editar ? "Só o instrutor da turma ou a coordenação lançam provas em papel." : "Sem acesso a esta turma.");
    return null;
  }
  return { lote, t };
}

async function materialDoLote(lote) {
  if (!lote.material_id) return null;
  const [rows] = await pool.query(
    "SELECT id, treinamento_id, titulo, tipo, nota_maxima, questoes_json, tentativas_max FROM materiais_avaliativos WHERE id = ? LIMIT 1",
    [lote.material_id]
  );
  return rows[0] || null;
}

function resumoLote(l, extras = {}) {
  return {
    id: l.id, treinamento_id: l.treinamento_id, material_id: l.material_id || null, titulo: l.titulo,
    nota_maxima: Number(l.nota_maxima), data_aplicacao: dataISO(l.data_aplicacao),
    status: l.status, criado_por: l.criado_por, criado_em: l.criado_em,
    confirmado_por: l.confirmado_por, confirmado_em: l.confirmado_em, desfeito_por: l.desfeito_por, desfeito_em: l.desfeito_em,
    ...extras,
  };
}

/* ───────────────────────── turma: lista de importações e provas ───────────────────────── */

async function listarDaTurma(req, res) {
  try {
    const t = await acesso.exigirTurma(req, res);
    if (!t) return;
    const [lotes] = await pool.query(
      `SELECT l.*,
              (SELECT COUNT(*) FROM prova_papel_arquivos a WHERE a.lote_id = l.id) AS arquivos,
              (SELECT COUNT(*) FROM prova_papel_resultados r WHERE r.lote_id = l.id AND r.faltou = 0 AND r.nota_10 IS NOT NULL) AS lancados,
              (SELECT COUNT(*) FROM prova_papel_resultados r WHERE r.lote_id = l.id AND r.faltou = 1) AS faltaram,
              (SELECT ROUND(AVG(r.nota_10), 1) FROM prova_papel_resultados r WHERE r.lote_id = l.id AND r.faltou = 0 AND r.nota_10 IS NOT NULL) AS media_10
         FROM prova_papel_lotes l WHERE l.treinamento_id = ? ORDER BY l.id DESC`,
      [t.id]
    );
    const [materiais] = await pool.query(
      "SELECT id, titulo, tipo, nota_maxima, questoes_json FROM materiais_avaliativos WHERE treinamento_id = ? ORDER BY id DESC",
      [t.id]
    ).catch(() => [[]]);
    const [[cont]] = await pool.query("SELECT COUNT(*) AS n FROM treinamento_participantes WHERE treinamento_id = ?", [t.id]);
    return res.json({
      ok: true,
      turma: { id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor },
      participantes: Number(cont.n),
      provas: materiais.map((m) => ({
        id: m.id, titulo: m.titulo, tipo: m.tipo, nota_maxima: Number(m.nota_maxima || 0),
        total_questoes: parseQuestoes(m.questoes_json).length,
      })),
      lotes: lotes.map((l) => resumoLote(l, {
        arquivos: Number(l.arquivos), lancados: Number(l.lancados), faltaram: Number(l.faltaram),
        media_10: l.media_10 === null ? null : Number(l.media_10),
      })),
      pode_editar: acesso.podeEditarTurma(req, t),
      pode_desfazer: acesso.ehGestao(req),
    });
  } catch (e) {
    console.error("[provasPapel.listarDaTurma]", e.message || e);
    return erro(res, 500, "Erro ao carregar as importações da turma.");
  }
}

async function criarLote(req, res) {
  try {
    const t = await acesso.exigirTurma(req, res, { editar: true });
    if (!t) return;
    const b = req.body || {};
    let material = null;
    if (b.material_id) {
      const [m] = await pool.query(
        "SELECT id, titulo, nota_maxima, questoes_json FROM materiais_avaliativos WHERE id = ? AND treinamento_id = ? LIMIT 1",
        [Number(b.material_id), t.id]
      );
      material = m[0];
      if (!material) return erro(res, 400, "Essa prova não pertence a esta turma.");
      if (!parseQuestoes(material.questoes_json).length) return erro(res, 400, "Essa prova não tem questões cadastradas. Use “prova só de papel” e lance a nota.");
    }
    const titulo = texto(b.titulo, 200) || (material ? texto(material.titulo, 200) : null);
    if (!titulo) return erro(res, 400, "Informe o título da prova.");
    let notaMaxima = material ? Number(material.nota_maxima) : Number(String(b.nota_maxima ?? 10).replace(",", "."));
    if (!(notaMaxima > 0) || notaMaxima > 1000) return erro(res, 400, "A nota máxima precisa ser maior que zero.");
    if (b.data_aplicacao && !dataValida(b.data_aplicacao)) return erro(res, 400, "Data da aplicação inválida.");
    const [r] = await pool.query(
      `INSERT INTO prova_papel_lotes (empresa_id, treinamento_id, material_id, titulo, nota_maxima, data_aplicacao, criado_por)
       VALUES (?,?,?,?,?,?,?)`,
      [t.empresa_id || null, t.id, material ? material.id : null, titulo, notaMaxima, b.data_aplicacao || null, req.user?.nome || null]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    console.error("[provasPapel.criarLote]", e.message || e);
    return erro(res, 500, "Erro ao criar a importação.");
  }
}

/* ───────────────────────── editor do lote ───────────────────────── */

async function montarEditor(lote, t) {
  const material = await materialDoLote(lote);
  const [parts] = await pool.query(
    `SELECT p.id AS participante_id, p.nome, p.matricula, p.pessoa_id,
            r.faltou, r.respostas_texto, r.acertos, r.total_questoes, r.nota_original, r.nota_10
       FROM treinamento_participantes p
       LEFT JOIN prova_papel_resultados r ON r.lote_id = ? AND r.participante_id = p.id
      WHERE p.treinamento_id = ? ORDER BY p.nome`,
    [lote.id, t.id]
  );
  // Nota que a pessoa já tem lançada com o mesmo título (para avisar antes de sobrescrever).
  const [atuais] = await pool.query(
    "SELECT treinando_nome, nota_prova FROM avaliacoes WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?)) AND nota_prova IS NOT NULL",
    [t.id, lote.titulo]
  );
  const porNome = new Map(atuais.map((a) => [P.chaveNome(a.treinando_nome), Number(a.nota_prova)]));
  const [arquivos] = await pool.query(
    "SELECT id, nome_original, tipo, tamanho, enviado_por, criado_em FROM prova_papel_arquivos WHERE lote_id = ? ORDER BY id",
    [lote.id]
  );
  const total = material ? parseQuestoes(material.questoes_json).length : 0;
  return {
    lote: resumoLote(lote),
    material: material
      ? { id: material.id, titulo: material.titulo, total_questoes: total, sem_gabarito: P.questoesSemGabarito(material) }
      : null,
    linhas: parts.map((p) => ({
      participante_id: p.participante_id, nome: p.nome, matricula: p.matricula,
      faltou: !!p.faltou, respostas: p.respostas_texto || "",
      acertos: p.acertos === null || p.acertos === undefined ? null : Number(p.acertos),
      total_questoes: p.total_questoes === null || p.total_questoes === undefined ? null : Number(p.total_questoes),
      nota: p.nota_original === null || p.nota_original === undefined ? null : Number(p.nota_original),
      nota_10: p.nota_10 === null || p.nota_10 === undefined ? null : Number(p.nota_10),
      nota_atual: porNome.has(P.chaveNome(p.nome)) ? porNome.get(P.chaveNome(p.nome)) : null,
    })),
    arquivos: arquivos.map((a) => ({
      id: a.id, nome: a.nome_original, tipo: a.tipo, tamanho: a.tamanho, enviado_por: a.enviado_por, criado_em: a.criado_em,
    })),
  };
}

async function obterLote(req, res) {
  try {
    const ctx = await carregarLote(req, res);
    if (!ctx) return;
    const ed = await montarEditor(ctx.lote, ctx.t);
    const podeEditarTurma = acesso.podeEditarTurma(req, ctx.t);
    return res.json({
      ok: true, turma: { id: ctx.t.id, tema: ctx.t.tema, cliente: ctx.t.cliente }, ...ed,
      pode_editar: podeEditarTurma && ctx.lote.status === "rascunho",
      pode_anexar: podeEditarTurma && ctx.lote.status !== "desfeito",
      pode_desfazer: acesso.ehGestao(req) && ctx.lote.status === "confirmado",
      pode_excluir: podeEditarTurma && ctx.lote.status === "rascunho",
    });
  } catch (e) {
    console.error("[provasPapel.obterLote]", e.message || e);
    return erro(res, 500, "Erro ao carregar a importação.");
  }
}

async function salvarLote(req, res) {
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    const { lote, t } = ctx;
    if (lote.status !== "rascunho") return erro(res, 409, "Esta importação já foi confirmada. Peça à coordenação para desfazer se precisar corrigir.");
    const b = req.body || {};
    const material = await materialDoLote(lote);

    // cabeçalho
    let titulo = lote.titulo;
    let notaMaxima = Number(lote.nota_maxima);
    let data = dataISO(lote.data_aplicacao);
    if (b.titulo !== undefined) {
      titulo = texto(b.titulo, 200);
      if (!titulo) return erro(res, 400, "Informe o título da prova.");
    }
    if (b.nota_maxima !== undefined && !material) {
      notaMaxima = Number(String(b.nota_maxima).replace(",", "."));
      if (!(notaMaxima > 0) || notaMaxima > 1000) return erro(res, 400, "A nota máxima precisa ser maior que zero.");
    }
    if (b.data_aplicacao !== undefined) {
      if (b.data_aplicacao && !dataValida(b.data_aplicacao)) return erro(res, 400, "Data da aplicação inválida.");
      data = b.data_aplicacao || null;
    }

    // linhas
    const [parts] = await pool.query("SELECT id, nome, pessoa_id FROM treinamento_participantes WHERE treinamento_id = ?", [t.id]);
    const porId = new Map(parts.map((p) => [Number(p.id), p]));
    const totalQ = material ? parseQuestoes(material.questoes_json).length : 0;
    const entrada = Array.isArray(b.linhas) ? b.linhas : [];
    const erros = [];
    const paraGravar = [];
    let salvas = 0;

    for (const l of entrada) {
      const pid = Number(l?.participante_id);
      const p = porId.get(pid);
      if (!p) { erros.push({ participante_id: pid, nome: "?", erro: "Participante não pertence a esta turma." }); continue; }
      const faltou = !!l.faltou;
      let acertos = null, totalQuestoes = null, notaOriginal = null, respostasTexto = null;

      if (!faltou) {
        const respostas = String(l.respostas || "").trim();
        if (respostas) {
          if (!material) { erros.push({ participante_id: pid, nome: p.nome, erro: "Esta prova não tem gabarito cadastrado: informe a nota." }); continue; }
          const lido = P.lerRespostas(respostas, totalQ);
          if (!lido.ok) { erros.push({ participante_id: pid, nome: p.nome, erro: lido.erro }); continue; }
          const corr = P.corrigirLetras(material, lido.letras);
          if (!corr.ok) { erros.push({ participante_id: pid, nome: p.nome, erro: corr.erro }); continue; }
          acertos = corr.acertos; totalQuestoes = corr.total_questoes; notaOriginal = corr.nota_original;
          respostasTexto = lido.letras.map((x) => x || "-").join("");
        } else {
          const n = P.lerNota(l.nota, notaMaxima);
          if (!n.ok) { erros.push({ participante_id: pid, nome: p.nome, erro: n.erro }); continue; }
          notaOriginal = n.nota;
        }
      }
      const nota10 = faltou ? null : P.converterNota10(notaOriginal, notaMaxima);
      paraGravar.push([lote.id, pid, p.pessoa_id || null, p.nome, faltou ? 1 : 0, respostasTexto, acertos, totalQuestoes, notaOriginal, nota10]);
      salvas += 1;
    }

    // Linhas + cabeçalho numa transação só: ou grava tudo, ou nada (21/10/2026).
    await comTransacao(async (conn) => {
      for (const valores of paraGravar) {
        await conn.query(
          `INSERT INTO prova_papel_resultados
             (lote_id, participante_id, pessoa_id, nome, faltou, respostas_texto, acertos, total_questoes, nota_original, nota_10)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE pessoa_id = VALUES(pessoa_id), nome = VALUES(nome), faltou = VALUES(faltou),
             respostas_texto = VALUES(respostas_texto), acertos = VALUES(acertos), total_questoes = VALUES(total_questoes),
             nota_original = VALUES(nota_original), nota_10 = VALUES(nota_10)`,
          valores
        );
      }
      await conn.query(
        "UPDATE prova_papel_lotes SET titulo = ?, nota_maxima = ?, data_aplicacao = ? WHERE id = ?",
        [titulo, notaMaxima, data, lote.id]
      );
    });
    return res.json({ ok: true, salvas, erros });
  } catch (e) {
    console.error("[provasPapel.salvarLote]", e.message || e);
    return erro(res, 500, "Erro ao salvar a importação.");
  }
}

async function excluirLote(req, res) {
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    if (ctx.lote.status !== "rascunho") return erro(res, 409, "Só importações em rascunho podem ser excluídas.");
    const [arqs] = await pool.query("SELECT arquivo FROM prova_papel_arquivos WHERE lote_id = ?", [ctx.lote.id]);
    // Banco primeiro, numa transação; os arquivos só saem do disco depois que deu certo (21/10/2026).
    await comTransacao(async (conn) => {
      await conn.query("DELETE FROM prova_papel_arquivos WHERE lote_id = ?", [ctx.lote.id]);
      await conn.query("DELETE FROM prova_papel_resultados WHERE lote_id = ?", [ctx.lote.id]);
      await conn.query("DELETE FROM prova_papel_lotes WHERE id = ?", [ctx.lote.id]);
    });
    arqs.forEach((a) => { try { fs.unlinkSync(path.join(pastaScans(), path.basename(a.arquivo))); } catch (_) { /* já não existe */ } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[provasPapel.excluirLote]", e.message || e);
    return erro(res, 500, "Erro ao excluir a importação.");
  }
}

/* ───────────────────────── confirmar / desfazer ───────────────────────── */

async function confirmarLote(req, res) {
  let conn;
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    const { lote, t } = ctx;
    if (lote.status !== "rascunho") return erro(res, 409, "Esta importação já foi confirmada.");

    const [parts] = await pool.query("SELECT id, nome FROM treinamento_participantes WHERE treinamento_id = ?", [t.id]);
    const [resultados] = await pool.query("SELECT * FROM prova_papel_resultados WHERE lote_id = ?", [lote.id]);
    const porPart = new Map(resultados.map((r) => [Number(r.participante_id), r]));
    const pendentes = parts.filter((p) => {
      const r = porPart.get(Number(p.id));
      return !r || (!r.faltou && r.nota_10 === null);
    });
    if (pendentes.length) {
      const nomes = pendentes.slice(0, 5).map((p) => p.nome).join("; ");
      return erro(res, 400, `Falta lançar a nota ou marcar “faltou” para: ${nomes}${pendentes.length > 5 ? ` e mais ${pendentes.length - 5}` : ""}.`);
    }
    const lancados = resultados.filter((r) => !r.faltou && r.nota_10 !== null);
    if (!lancados.length) return erro(res, 400, "Nenhuma nota lançada nesta importação.");

    const material = await materialDoLote(lote);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    let atualizadas = 0, criadas = 0, tentativas = 0;

    for (const r of lancados) {
      const [ex] = await conn.query(
        `SELECT id, nota_prova FROM avaliacoes
          WHERE treinamento_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?)) AND LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?))
          ORDER BY id LIMIT 1`,
        [t.id, lote.titulo, r.nome]
      );
      let avaliacaoId, criada = 0, anterior = null;
      if (ex.length) {
        avaliacaoId = ex[0].id;
        anterior = ex[0].nota_prova === null ? null : Number(ex[0].nota_prova);
        await conn.query("UPDATE avaliacoes SET nota_prova = ? WHERE id = ?", [r.nota_10, avaliacaoId]);
        atualizadas += 1;
      } else {
        const [ins] = await conn.query(
          "INSERT INTO avaliacoes (empresa_id, treinamento_id, titulo, treinando_nome, nota_prova, observacoes) VALUES (?,?,?,?,?,?)",
          [t.empresa_id || null, t.id, lote.titulo, r.nome, r.nota_10, `Prova em papel (importação #${lote.id})`]
        );
        avaliacaoId = ins.insertId;
        criada = 1;
        criadas += 1;
      }

      let respostaId = null;
      if (material && r.acertos !== null) {
        const cond = condicaoIdentidade("respostas_avaliativas", "treinando_nome", r.pessoa_id || null, r.nome);
        const [uso] = await conn.query(
          `SELECT COALESCE(MAX(tentativa), 0) AS ultima FROM respostas_avaliativas WHERE material_id = ? AND ${cond.sql}`,
          [material.id, ...cond.params]
        );
        const tentativa = Number(uso[0].ultima || 0) + 1;
        const letras = String(r.respostas_texto || "").split("");
        const respostasJson = JSON.stringify(Object.fromEntries(letras.map((l, i) => [i, l === "-" ? "" : l])));
        const percentual = Number(lote.nota_maxima) > 0 ? P.arred2((Number(r.nota_original) / Number(lote.nota_maxima)) * 100) : 0;
        const [insR] = await conn.query(
          `INSERT INTO respostas_avaliativas
             (material_id, treinamento_id, treinando_nome, respostas_json, acertos, total_questoes, percentual, nota_final,
              pessoa_id, tentativa, origem, lote_papel_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [material.id, t.id, r.nome, respostasJson, r.acertos, r.total_questoes, percentual, r.nota_original,
           r.pessoa_id || null, tentativa, "papel", lote.id]
        );
        respostaId = insR.insertId;
        tentativas += 1;
      }
      await conn.query(
        "UPDATE prova_papel_resultados SET avaliacao_id = ?, avaliacao_criada = ?, nota_anterior = ?, resposta_id = ? WHERE id = ?",
        [avaliacaoId, criada, anterior, respostaId, r.id]
      );
    }

    await conn.query(
      "UPDATE prova_papel_lotes SET status = 'confirmado', confirmado_por = ?, confirmado_em = NOW() WHERE id = ?",
      [req.user?.nome || null, lote.id]
    );
    await conn.commit();

    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "prova_papel", entidadeId: lote.id,
      resumo: `${req.user?.nome || "Alguém"} importou a prova em papel “${lote.titulo}” da turma ${t.tema}: ${lancados.length} nota(s), ${resultados.filter((r) => r.faltou).length} falta(s)`,
      dadosDepois: { lote: lote.id, notas: lancados.length, atualizadas, criadas, tentativas }, ip: req.ip,
    });
    return res.json({ ok: true, notas: lancados.length, atualizadas, criadas, tentativas });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* segue */ } }
    if (e && e.code === "ER_DUP_ENTRY") return erro(res, 409, "Já existe uma tentativa registrada para algum treinando nesta prova. Atualize a página e tente de novo.");
    console.error("[provasPapel.confirmarLote]", e.message || e);
    return erro(res, 500, "Erro ao confirmar a importação. Nada foi gravado.");
  } finally {
    if (conn) conn.release();
  }
}

async function desfazerLote(req, res) {
  let conn;
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    if (!acesso.ehGestao(req)) return erro(res, 403, "Só a coordenação desfaz uma importação.");
    const { lote, t } = ctx;
    if (lote.status !== "confirmado") return erro(res, 409, "Só importações confirmadas podem ser desfeitas.");
    const [resultados] = await pool.query("SELECT * FROM prova_papel_resultados WHERE lote_id = ?", [lote.id]);

    conn = await pool.getConnection();
    await conn.beginTransaction();
    let restauradas = 0, removidas = 0, preservadas = 0;
    for (const r of resultados) {
      if (r.avaliacao_id) {
        const [[a]] = await conn.query("SELECT id, nota_prova, nota_nps, nota_qualidade, comentario FROM avaliacoes WHERE id = ?", [r.avaliacao_id]);
        if (a) {
          const igual = a.nota_prova !== null && Math.abs(Number(a.nota_prova) - Number(r.nota_10)) < 0.005;
          if (!igual) {
            preservadas += 1; // alguém corrigiu a nota depois da importação: não mexe
          } else if (r.avaliacao_criada && a.nota_nps === null && a.nota_qualidade === null && !a.comentario) {
            await conn.query("DELETE FROM avaliacoes WHERE id = ?", [a.id]);
            removidas += 1;
          } else {
            await conn.query("UPDATE avaliacoes SET nota_prova = ? WHERE id = ?", [r.avaliacao_criada ? null : r.nota_anterior, a.id]);
            restauradas += 1;
          }
        }
      }
      if (r.resposta_id) await conn.query("DELETE FROM respostas_avaliativas WHERE id = ? AND origem = 'papel'", [r.resposta_id]);
    }
    await conn.query(
      "UPDATE prova_papel_lotes SET status = 'desfeito', desfeito_por = ?, desfeito_em = NOW() WHERE id = ?",
      [req.user?.nome || null, lote.id]
    );
    await conn.commit();
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "prova_papel", entidadeId: lote.id,
      resumo: `${req.user?.nome || "Alguém"} desfez a importação da prova em papel “${lote.titulo}” da turma ${t.tema} (${removidas + restauradas} nota(s) revertida(s), ${preservadas} preservada(s))`,
      ip: req.ip,
    });
    return res.json({ ok: true, removidas, restauradas, preservadas });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* segue */ } }
    console.error("[provasPapel.desfazerLote]", e.message || e);
    return erro(res, 500, "Erro ao desfazer a importação. Nada foi alterado.");
  } finally {
    if (conn) conn.release();
  }
}

/* ───────────────────────── anexos (foto / PDF) ───────────────────────── */

const TIPOS = {
  ".jpg": { mime: "image/jpeg", ok: (b) => b[0] === 0xff && b[1] === 0xd8 },
  ".jpeg": { mime: "image/jpeg", ok: (b) => b[0] === 0xff && b[1] === 0xd8 },
  ".png": { mime: "image/png", ok: (b) => b[0] === 0x89 && b.slice(1, 4).toString() === "PNG" },
  ".webp": { mime: "image/webp", ok: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
  ".pdf": { mime: "application/pdf", ok: (b) => b.slice(0, 4).toString() === "%PDF" },
};

async function anexarArquivo(req, res) {
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    if (ctx.lote.status === "desfeito") return erro(res, 409, "Esta importação foi desfeita.");
    if (!req.file) return erro(res, 400, "Nenhum arquivo enviado.");
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const tipo = TIPOS[ext];
    if (!tipo || !tipo.ok(req.file.buffer)) return erro(res, 400, "Envie uma foto (JPG, PNG ou WEBP) ou um PDF.");
    const [[c]] = await pool.query("SELECT COUNT(*) AS n FROM prova_papel_arquivos WHERE lote_id = ?", [ctx.lote.id]);
    if (Number(c.n) >= MAX_ARQUIVOS) return erro(res, 400, `Limite de ${MAX_ARQUIVOS} arquivos por importação.`);

    fs.mkdirSync(pastaScans(), { recursive: true });
    const base = path.basename(req.file.originalname || "prova", ext).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
    const arquivo = `${Date.now()}_${crypto.randomBytes(16).toString("hex")}_${base}${ext}`;
    fs.writeFileSync(path.join(pastaScans(), arquivo), req.file.buffer);
    const [r] = await pool.query(
      "INSERT INTO prova_papel_arquivos (lote_id, nome_original, arquivo, tipo, tamanho, enviado_por) VALUES (?,?,?,?,?,?)",
      [ctx.lote.id, texto(req.file.originalname, 255), arquivo, tipo.mime, req.file.size, req.user?.nome || null]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    console.error("[provasPapel.anexarArquivo]", e.message || e);
    return erro(res, 500, "Erro ao anexar o arquivo.");
  }
}

async function carregarArquivo(req, res, { editar = false } = {}) {
  const ctx = await carregarLote(req, res, { editar });
  if (!ctx) return null;
  const aid = Number(req.params.arquivoId);
  const [rows] = await pool.query("SELECT * FROM prova_papel_arquivos WHERE id = ? AND lote_id = ? LIMIT 1", [aid, ctx.lote.id]);
  if (!rows.length) {
    erro(res, 404, "Arquivo não encontrado.");
    return null;
  }
  return { ...ctx, arq: rows[0] };
}

async function removerArquivo(req, res) {
  try {
    const ctx = await carregarArquivo(req, res, { editar: true });
    if (!ctx) return;
    if (ctx.lote.status !== "rascunho" && !acesso.ehGestao(req)) return erro(res, 403, "Depois de confirmada, só a coordenação remove anexos.");
    try { fs.unlinkSync(path.join(pastaScans(), path.basename(ctx.arq.arquivo))); } catch (_) { /* já não existe */ }
    await pool.query("DELETE FROM prova_papel_arquivos WHERE id = ?", [ctx.arq.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[provasPapel.removerArquivo]", e.message || e);
    return erro(res, 500, "Erro ao remover o arquivo.");
  }
}

// Link assinado (5 min) — mesma regra da Biblioteca: o /uploads só abre com assinatura.
async function urlArquivo(req, res) {
  try {
    const ctx = await carregarArquivo(req, res);
    if (!ctx) return;
    const nome = path.basename(ctx.arq.arquivo);
    if (!fs.existsSync(path.join(pastaScans(), nome))) {
      return erro(res, 404, "O arquivo não está mais no servidor. Anexe de novo.");
    }
    const baseUrl = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    const caminho = `/provas-papel/${nome}`;
    return res.json({ ok: true, url: `${baseUrl}/uploads${encodeURI(caminho)}?${gerarQuery(caminho)}`, tipo: ctx.arq.tipo, expira_em_segundos: 300 });
  } catch (e) {
    console.error("[provasPapel.urlArquivo]", e.message || e);
    return erro(res, 500, "Erro ao gerar o link do arquivo.");
  }
}

/* ───────────────────────── Excel ───────────────────────── */

async function exportarLote(req, res) {
  try {
    const ctx = await carregarLote(req, res);
    if (!ctx) return;
    const ed = await montarEditor(ctx.lote, ctx.t);
    const XL = require("../lib/excelExport");
    const wb = XL.novoWorkbook();
    XL.adicionarTabela(wb, {
      nomeAba: "Prova em papel",
      colunas: [
        { titulo: "Treinando", chave: "nome", largura: 34 },
        { titulo: "Matrícula", chave: "matricula", largura: 14 },
        { titulo: "Situação", chave: "situacao", largura: 14 },
        { titulo: "Acertos", chave: "acertos", formato: "inteiro", largura: 10 },
        { titulo: "Questões", chave: "total", formato: "inteiro", largura: 10 },
        { titulo: `Nota (máx. ${ed.lote.nota_maxima})`, chave: "nota", formato: "decimal1", largura: 16 },
        { titulo: "Nota 0–10", chave: "nota_10", formato: "decimal1", largura: 12 },
        { titulo: "Resultado", chave: "resultado", largura: 12 },
      ],
      linhas: ed.linhas.map((l) => ({
        nome: l.nome, matricula: l.matricula || "",
        situacao: l.faltou ? "Faltou" : l.nota_10 === null ? "Sem lançamento" : "Lançada",
        acertos: l.acertos, total: l.total_questoes, nota: l.nota, nota_10: l.nota_10,
        resultado: l.faltou || l.nota_10 === null ? "" : l.nota_10 >= 6 ? "Aprovado" : "Reprovado",
      })),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="prova-papel-${ctx.lote.id}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[provasPapel.exportarLote]", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao exportar.");
  }
}

/* ───────────────────── planilha de notas (modelo + leitura) ───────────────────── */

/** Baixa o modelo: treinandos da turma já listados; o instrutor só preenche. */
async function modeloPlanilha(req, res) {
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    const ed = await montarEditor(ctx.lote, ctx.t);
    const comGabarito = !!ed.material;
    const XL = require("../lib/excelExport");
    const wb = XL.novoWorkbook();
    const ws = wb.addWorksheet("Notas");
    const cols = [
      { header: "Matrícula", key: "matricula", width: 14 },
      { header: "Nome", key: "nome", width: 38 },
      { header: "Faltou (S/N)", key: "faltou", width: 14 },
      { header: `Nota (0 a ${Number(ed.lote.nota_maxima)})`, key: "nota", width: 16 },
    ];
    if (comGabarito) cols.push({ header: "Respostas", key: "respostas", width: 28 });
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ed.linhas.forEach((l) => {
      const row = ws.addRow({
        matricula: l.matricula || "", nome: l.nome, faltou: l.faltou ? "S" : "",
        nota: l.respostas ? null : l.nota, respostas: l.respostas || "",
      });
      row.getCell(1).numFmt = "@";
      row.getCell(4).numFmt = "0.00";
      row.getCell(3).dataValidation = { type: "list", allowBlank: true, formulae: ['"S,N"'] };
      row.getCell(4).dataValidation = {
        type: "decimal", operator: "between", allowBlank: true, formulae: [0, Number(ed.lote.nota_maxima)],
        showErrorMessage: true, errorTitle: "Nota inválida", error: `Use um valor de 0 a ${Number(ed.lote.nota_maxima)}.`,
      };
    });
    const ins = wb.addWorksheet("Instruções");
    ins.columns = [{ width: 26 }, { width: 90 }];
    const dados = [
      ["Importação nº", String(ed.lote.id)],
      ["Prova", ed.lote.titulo],
      ["Turma", ctx.t.tema || ""],
      ["Nota máxima", String(Number(ed.lote.nota_maxima))],
      [],
      ["Como preencher", "Na aba “Notas”, preencha a Nota de cada treinando (aceita vírgula) ou marque S em “Faltou”."],
      ["", comGabarito
        ? `Se tiver as letras marcadas, preencha “Respostas” (${ed.material.total_questoes} letras, ex.: ABCDDACB; use - para em branco) e deixe a nota vazia: o Portal corrige pelo gabarito.`
        : "Esta prova não tem gabarito cadastrado: informe só a nota."],
      ["", "Não altere a Matrícula nem o Nome. Linhas sem nota, sem respostas e sem “S” em Faltou ficam sem lançamento."],
      ["", "Depois envie o arquivo em “Importar notas por planilha”. Você confere tudo na tela antes de salvar e confirmar."],
    ];
    dados.forEach((d) => ins.addRow(d));
    ins.getColumn(1).font = { bold: true };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="modelo-notas-prova-papel-${ctx.lote.id}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[provasPapel.modeloPlanilha]", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao gerar o modelo.");
  }
}

/** Lê a planilha e devolve a pré-visualização. Não grava nada: a tela preenche o rascunho. */
async function lerPlanilha(req, res) {
  try {
    const ctx = await carregarLote(req, res, { editar: true });
    if (!ctx) return;
    const { lote, t } = ctx;
    if (lote.status !== "rascunho") return erro(res, 409, "Esta importação já foi confirmada. Peça à coordenação para desfazer se precisar corrigir.");
    if (!req.file?.buffer?.length) return erro(res, 400, "Envie a planilha preenchida (.xlsx ou .csv).");
    const material = await materialDoLote(lote);
    const [parts] = await pool.query("SELECT id, nome, matricula FROM treinamento_participantes WHERE treinamento_id = ?", [t.id]);
    let arq;
    try {
      arq = await PL.lerArquivo(req.file.buffer, req.file.originalname);
    } catch (e) {
      if (e.amigavel) return erro(res, 400, e.message);
      throw e;
    }
    const r = PL.interpretar(arq, parts, {
      totalQuestoes: material ? parseQuestoes(material.questoes_json).length : 0,
      temGabarito: !!material,
      notaMaxima: Number(lote.nota_maxima),
    });
    if (!r.ok) return erro(res, 400, r.erro);
    if (arq.importacaoId && arq.importacaoId !== lote.id) {
      r.problemas.unshift({ tipo: "aviso", linha: null, nome: "", mensagem: `Este modelo foi gerado para a importação nº ${arq.importacaoId}, não para a nº ${lote.id}. Confira se é a planilha certa.` });
      r.resumo.avisos += 1;
    }
    return res.json({ ok: true, arquivo: req.file.originalname, ...r });
  } catch (e) {
    console.error("[provasPapel.lerPlanilha]", e.message || e);
    return erro(res, 500, "Erro ao ler a planilha.");
  }
}

module.exports = {
  listarDaTurma, criarLote, obterLote, salvarLote, excluirLote, confirmarLote, desfazerLote,
  anexarArquivo, removerArquivo, urlArquivo, exportarLote, modeloPlanilha, lerPlanilha,
};
