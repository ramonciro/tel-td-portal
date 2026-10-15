/**
 * trilhaPessoasController.js — Trilhas por pessoa (Fase 3, 16/10/2026).
 * Participantes de cada trilha e progresso por etapa, lançados pela Metodologia
 * (o treinando ainda não tem login). Rota montada com authorizeRoles("metodologia");
 * super_admin passa. Isolamento: trilha e pessoa sempre conferidas pelo ambiente
 * (empresa_id) — registro de outro ambiente responde 404 igual a inexistente.
 */
const db = require("../lib/db");
const {
  hojeBahia,
  chavesDaPessoa,
  buscarTrilha,
  buscarParticipanteDaTrilha,
  calcularMatriz,
  sincronizarComJornadas,
} = require("../lib/trilhaPessoa");

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v) {
  if (!DATA_ISO.test(String(v || ""))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function erro(res, status, message) {
  return res.status(status).json({ error: message });
}

function falha(res, contexto, e) {
  console.error(`[trilhaPessoas] ${contexto}:`, e.message || e);
  return res.status(500).json({ error: "Erro interno ao processar as trilhas por pessoa." });
}

function validarDataConclusao(valor) {
  const hoje = hojeBahia();
  const data = valor ? String(valor).slice(0, 10) : hoje;
  if (!dataValida(data)) return { erro: "Data de conclusão inválida." };
  if (data > hoje) return { erro: "A data de conclusão não pode ser futura." };
  return { data };
}

// ───────────────────────── matriz ─────────────────────────

async function matriz(req, res) {
  try {
    const trilha = await buscarTrilha(req, req.params.trilhaId);
    if (!trilha) return erro(res, 404, "Trilha não encontrada.");
    const m = await calcularMatriz(trilha, req.empresaId);
    return res.json({
      trilha: { id: trilha.id, titulo: trilha.titulo, cliente: trilha.cliente, status: trilha.status },
      ...m,
    });
  } catch (e) {
    return falha(res, "matriz", e);
  }
}

// ───────────────────────── participantes ─────────────────────────

// POST /trilhas/:trilhaId/sincronizar  { confirmar?: true }
async function sincronizar(req, res) {
  try {
    const trilha = await buscarTrilha(req, req.params.trilhaId);
    if (!trilha) return erro(res, 404, "Trilha não encontrada.");
    const aplicar = req.body?.confirmar === true;
    const r = await sincronizarComJornadas(trilha, { empresaId: req.empresaId, usuarioId: req.user?.id, aplicar });
    return res.json({ ...r, previa: !aplicar });
  } catch (e) {
    return falha(res, "sincronizar", e);
  }
}

// POST /trilhas/:trilhaId/participantes  { pessoa_id }
async function adicionarParticipante(req, res) {
  try {
    const trilha = await buscarTrilha(req, req.params.trilhaId);
    if (!trilha) return erro(res, 404, "Trilha não encontrada.");
    const pessoaId = Number(req.body?.pessoa_id);
    if (!pessoaId) return erro(res, 400, "Escolha a pessoa no cadastro.");
    if (!req.empresaId) return erro(res, 400, "Empresa não identificada.");

    const [pessoas] = await db.query(
      `SELECT id, nome, matricula FROM pessoas WHERE id = ? AND empresa_id = ? LIMIT 1`,
      [pessoaId, req.empresaId]
    );
    const pessoa = pessoas[0];
    if (!pessoa) return erro(res, 404, "Pessoa não encontrada.");

    const chaves = chavesDaPessoa({ pessoa_id: pessoa.id, matricula: pessoa.matricula });
    const [existentes] = await db.query(
      `SELECT id, chave, situacao FROM trilha_participantes WHERE trilha_id = ? AND chave IN (?)`,
      [trilha.id, chaves]
    );
    if (existentes.length) {
      const ex = existentes[0];
      if (ex.situacao === "ativo") return erro(res, 409, "Esta pessoa já está na trilha.");
      await db.query(
        `UPDATE trilha_participantes SET situacao = 'ativo', pessoa_id = ?, nome = ?, matricula = ? WHERE id = ?`,
        [pessoa.id, pessoa.nome, pessoa.matricula || null, ex.id]
      );
      return res.json({ ok: true, id: ex.id, reativado: true });
    }

    // dados de turma/cargo, quando a pessoa já está em alguma jornada
    const [jp] = await db.query(
      `SELECT turma, cargo FROM jornada_participantes WHERE pessoa_id = ? ORDER BY id DESC LIMIT 1`,
      [pessoa.id]
    );
    const [ins] = await db.query(
      `INSERT INTO trilha_participantes
         (empresa_id, trilha_id, chave, pessoa_id, nome, matricula, turma, cargo, origem, situacao, entrou_em, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'ativo', ?, ?)`,
      [trilha.empresa_id ?? req.empresaId, trilha.id, chaves[0], pessoa.id, pessoa.nome, pessoa.matricula || null, jp[0]?.turma || null, jp[0]?.cargo || null, hojeBahia(), req.user?.id || null]
    );
    return res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    return falha(res, "adicionarParticipante", e);
  }
}

// DELETE /participantes/:id  → tira da lista (o progresso lançado fica guardado)
async function removerParticipante(req, res) {
  try {
    const p = await buscarParticipanteDaTrilha(req, req.params.id);
    if (!p) return erro(res, 404, "Participante não encontrado.");
    await db.query(`UPDATE trilha_participantes SET situacao = 'removido' WHERE id = ?`, [p.id]);
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "removerParticipante", e);
  }
}

// POST /participantes/:id/reativar
async function reativarParticipante(req, res) {
  try {
    const p = await buscarParticipanteDaTrilha(req, req.params.id);
    if (!p) return erro(res, 404, "Participante não encontrado.");
    await db.query(`UPDATE trilha_participantes SET situacao = 'ativo' WHERE id = ?`, [p.id]);
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "reativarParticipante", e);
  }
}

// ───────────────────────── progresso ─────────────────────────

async function etapaDaTrilha(trilhaId, etapaId) {
  const id = Number(etapaId);
  if (!id) return null;
  const [rows] = await db.query(`SELECT id, titulo FROM trilha_etapas WHERE id = ? AND trilha_id = ? LIMIT 1`, [id, trilhaId]);
  return rows[0] || null;
}

// PUT /participantes/:id/etapas/:etapaId  { concluida, data_conclusao?, observacao? }
async function salvarEtapa(req, res) {
  try {
    const p = await buscarParticipanteDaTrilha(req, req.params.id);
    if (!p) return erro(res, 404, "Participante não encontrado.");
    const etapa = await etapaDaTrilha(p.trilha_id, req.params.etapaId);
    if (!etapa) return erro(res, 404, "Etapa não encontrada nesta trilha.");

    const body = req.body || {};
    if (body.concluida === false) {
      await db.query(`DELETE FROM trilha_progresso_pessoa WHERE trilha_participante_id = ? AND etapa_id = ?`, [p.id, etapa.id]);
      return res.json({ ok: true, removido: true });
    }
    if (body.concluida !== true) return erro(res, 400, "Informe se a etapa foi concluída.");

    const v = validarDataConclusao(body.data_conclusao);
    if (v.erro) return erro(res, 400, v.erro);
    const observacao = body.observacao === undefined || body.observacao === null ? null : String(body.observacao).trim();
    if (observacao && observacao.length > 500) return erro(res, 400, "A observação aceita no máximo 500 caracteres.");

    await db.query(
      `INSERT INTO trilha_progresso_pessoa
         (empresa_id, trilha_id, trilha_participante_id, etapa_id, data_conclusao, observacao, origem, lancado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
       ON DUPLICATE KEY UPDATE data_conclusao = VALUES(data_conclusao), observacao = VALUES(observacao), lancado_por_id = VALUES(lancado_por_id)`,
      [p.empresa_id ?? req.empresaId ?? null, p.trilha_id, p.id, etapa.id, v.data, observacao || null, req.user?.id || null]
    );
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "salvarEtapa", e);
  }
}

// POST /trilhas/:trilhaId/etapas/:etapaId/marcar-todos  { data_conclusao?, confirmar? }
// Só preenche quem ainda não tem lançamento; prévia por padrão.
async function marcarTodos(req, res) {
  try {
    const trilha = await buscarTrilha(req, req.params.trilhaId);
    if (!trilha) return erro(res, 404, "Trilha não encontrada.");
    const etapa = await etapaDaTrilha(trilha.id, req.params.etapaId);
    if (!etapa) return erro(res, 404, "Etapa não encontrada nesta trilha.");
    const v = validarDataConclusao(req.body?.data_conclusao);
    if (v.erro) return erro(res, 400, v.erro);

    const [pendentes] = await db.query(
      `SELECT tp.id, tp.nome FROM trilha_participantes tp
       WHERE tp.trilha_id = ? AND tp.situacao = 'ativo'
         AND NOT EXISTS (SELECT 1 FROM trilha_progresso_pessoa pp WHERE pp.trilha_participante_id = tp.id AND pp.etapa_id = ?)
       ORDER BY tp.nome ASC`,
      [trilha.id, etapa.id]
    );
    if (req.body?.confirmar !== true) {
      return res.json({ ok: true, previa: true, total: pendentes.length, etapa: etapa.titulo, data_conclusao: v.data, nomes: pendentes.slice(0, 50).map((x) => x.nome) });
    }
    for (const x of pendentes) {
      await db.query(
        `INSERT IGNORE INTO trilha_progresso_pessoa
           (empresa_id, trilha_id, trilha_participante_id, etapa_id, data_conclusao, origem, lancado_por_id)
         VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
        [trilha.empresa_id ?? req.empresaId ?? null, trilha.id, x.id, etapa.id, v.data, req.user?.id || null]
      );
    }
    return res.json({ ok: true, aplicadas: pendentes.length, etapa: etapa.titulo, data_conclusao: v.data });
  } catch (e) {
    return falha(res, "marcarTodos", e);
  }
}

// ───────────────────────── exportação ─────────────────────────

// GET /trilhas/:trilhaId/exportar
async function exportar(req, res) {
  try {
    const trilha = await buscarTrilha(req, req.params.trilhaId);
    if (!trilha) return erro(res, 404, "Trilha não encontrada.");
    const m = await calcularMatriz(trilha, req.empresaId);
    const { novoWorkbook, adicionarTabela, paraDate } = require("../lib/excelExport");
    const wb = novoWorkbook();

    const colunas = [
      { titulo: "Nome", chave: "nome", largura: 34 },
      { titulo: "Matrícula", chave: "matricula", largura: 14 },
      { titulo: "Turma", chave: "turma", largura: 18 },
      { titulo: "Cargo", chave: "cargo", largura: 22 },
      { titulo: "Origem", chave: "origem", largura: 14 },
      ...m.etapas.map((e) => ({ titulo: e.titulo, chave: `e${e.id}`, largura: 18, formato: "data" })),
      { titulo: "Etapas concluídas", chave: "concluidas", largura: 14, formato: "inteiro" },
      { titulo: "% concluído", chave: "pct", largura: 12, formato: "percentual" },
    ];
    adicionarTabela(wb, {
      nomeAba: "Progresso",
      colunas,
      linhas: m.participantes.map((p) => {
        const linha = {
          nome: p.nome,
          matricula: p.matricula,
          turma: p.turma,
          cargo: p.cargo,
          origem: p.origem === "jornada" ? "Jornada" : "Inclusão manual",
          concluidas: p.concluidas,
          pct: p.pct,
        };
        for (const e of m.etapas) linha[`e${e.id}`] = p.etapas[e.id]?.data_conclusao || null;
        return linha;
      }),
    });

    const registros = [];
    for (const p of m.participantes) {
      for (const e of m.etapas) {
        const c = p.etapas[e.id];
        if (c?.concluida) registros.push({ nome: p.nome, matricula: p.matricula, etapa: e.titulo, data: c.data_conclusao, observacao: c.observacao || "" });
      }
    }
    adicionarTabela(wb, {
      nomeAba: "Registro (evidência)",
      colunas: [
        { titulo: "Nome", chave: "nome", largura: 34 },
        { titulo: "Matrícula", chave: "matricula", largura: 14 },
        { titulo: "Etapa da trilha", chave: "etapa", largura: 36 },
        { titulo: "Data de conclusão", chave: "data", largura: 16, formato: "data" },
        { titulo: "Observação", chave: "observacao", largura: 50 },
      ],
      linhas: registros,
    });

    const ws = wb.addWorksheet("Resumo");
    const linhas = [
      ["Trilha", trilha.titulo],
      ["Cliente", trilha.cliente || ""],
      ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })],
      ["Participantes ativos", m.totais.participantes],
      ["Etapas da trilha", m.totais.etapas],
      ["% médio de conclusão", m.totais.pct_medio === null ? "—" : `${m.totais.pct_medio}%`],
      ["Concluíram todas as etapas", m.totais.concluiram_todas],
      ["Sem nenhuma etapa lançada", m.totais.sem_lancamento],
      ["Jornadas ligadas à trilha", m.jornadas.length ? m.jornadas.map((j) => j.nome).join("; ") : "nenhuma"],
      [],
      ["Como os números são calculados"],
      ["% concluído = etapas concluídas ÷ etapas da trilha. A conclusão é lançada pela Metodologia, pessoa a pessoa, com a data."],
    ];
    linhas.forEach((l, i) => {
      l.forEach((v, c) => { ws.getCell(i + 1, c + 1).value = v; });
      if (l.length === 2) ws.getCell(i + 1, 1).font = { bold: true };
    });
    ws.getCell(11, 1).font = { bold: true };
    ws.columns = [{ width: 36 }, { width: 60 }];
    void paraDate;

    const nome = String(trilha.titulo || "trilha")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "trilha";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="trilha-pessoas-${nome}-${hojeBahia()}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[trilhaPessoas] exportar:", e.message || e);
    if (!res.headersSent) return res.status(500).json({ error: "Erro ao exportar o progresso da trilha." });
    return res.end();
  }
}

module.exports = {
  matriz,
  sincronizar,
  adicionarParticipante,
  removerParticipante,
  reativarParticipante,
  salvarEtapa,
  marcarTodos,
  exportar,
};
