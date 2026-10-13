const crypto = require("crypto");
const db = require("../lib/db");
const { resolverPessoa } = require("../services/pessoasService");

// Oficina de Talentos (Metodologia) — Fase 1: GESTÃO (turmas, grade livre,
// inscritos, conferência, lista de espera, Excel). A parte pública
// (formulário de inscrição por link) fica em oficinaTalentosPublicController.js.
// Proposta: claude/proposta-oficina-de-talentos-2026-10-09.md.
//
// Regras aqui:
//  - Tudo filtrado por empresa (req.empresaId) no padrão do resto do módulo.
//    Super admin (empresaId null) enxerga tudo, mas NÃO cria turma: a turma
//    precisa pertencer a uma empresa, porque é o token dela que define o
//    ambiente da inscrição pública.
//  - Datas saem do banco já como 'YYYY-MM-DD' (DATE_FORMAT) para nunca
//    sofrerem deslocamento de fuso no navegador (bug "d-1" do R&S, 07/10).
//  - A grade (oficina_modulos) é livre: cada turma tem a sua, com a carga
//    horária que quiser — decisão do Ramon.

const STATUS_TURMA = ["rascunho", "inscricoes_abertas", "inscricoes_encerradas", "em_andamento", "encerrada"];
const MODALIDADES = ["presencial", "online", "hibrido"];
const STATUS_INSCRICAO = ["confirmado", "em_conferencia", "lista_espera", "cancelado", "desistente"];
// Status que ocupam vaga. Lista de espera, cancelado e desistente não ocupam.
const STATUS_OCUPAM_VAGA = ["confirmado", "em_conferencia"];

const CARGOS_ELEGIVEIS_PADRAO = ["Operador(a)", "Monitor(a)", "Instrutor(a)"];
const CARGOS_ALMEJADOS_PADRAO = ["Supervisor(a)", "Instrutor(a)", "Monitor(a)", "Analista", "Coordenador(a)", "Outro"];

const TURMA_COLUNAS = `
  t.id, t.empresa_id, t.nome, t.descricao, t.token,
  DATE_FORMAT(t.data_inicio, '%Y-%m-%d') AS data_inicio,
  DATE_FORMAT(t.data_fim, '%Y-%m-%d') AS data_fim,
  t.horario, t.modalidade, t.local_nome, t.endereco, t.vagas,
  DATE_FORMAT(t.inscricoes_ate, '%Y-%m-%d') AS inscricoes_ate,
  t.status, t.cargos_elegiveis, t.cargos_almejados, t.carga_horaria_prevista,
  t.created_at, t.updated_at
`;

function texto(v, max) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

function dataIso(v) {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function hora(v) {
  const s = String(v || "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

function numeroOuNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function listaTexto(v, padrao) {
  let itens = v;
  if (typeof itens === "string") itens = itens.split(/\r?\n/);
  if (!Array.isArray(itens)) return padrao;
  const limpos = [...new Set(itens.map((i) => String(i || "").trim()).filter(Boolean))].slice(0, 30);
  return limpos.length ? limpos : padrao;
}

function lerLista(json, padrao) {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) && arr.length ? arr : padrao;
  } catch {
    return padrao;
  }
}

function formatarTurma(t) {
  return {
    ...t,
    cargos_elegiveis: lerLista(t.cargos_elegiveis, CARGOS_ELEGIVEIS_PADRAO),
    cargos_almejados: lerLista(t.cargos_almejados, CARGOS_ALMEJADOS_PADRAO),
  };
}

function gerarToken() {
  return crypto.randomBytes(18).toString("hex");
}

function filtroTenant(req, alias = "t") {
  return req.empresaId ? { sql: ` AND ${alias}.empresa_id = ?`, params: [req.empresaId] } : { sql: "", params: [] };
}

async function buscarTurma(req, id) {
  const tenant = filtroTenant(req);
  const [rows] = await db.query(`SELECT ${TURMA_COLUNAS} FROM oficina_turmas t WHERE t.id = ?${tenant.sql}`, [
    id,
    ...tenant.params,
  ]);
  return rows[0] || null;
}

async function carregarModulos(turmaId) {
  const [rows] = await db.query(
    `SELECT id, ordem, titulo, DATE_FORMAT(data, '%Y-%m-%d') AS data, hora_inicio, hora_fim, carga_horaria
     FROM oficina_modulos WHERE turma_id = ? ORDER BY ordem ASC, id ASC`,
    [turmaId]
  );
  return rows.map((m) => ({ ...m, carga_horaria: m.carga_horaria === null ? null : Number(m.carga_horaria) }));
}

function normalizarModulos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((m, i) => ({
      ordem: i,
      titulo: texto(m?.titulo, 255),
      data: dataIso(m?.data),
      hora_inicio: hora(m?.hora_inicio),
      hora_fim: hora(m?.hora_fim),
      carga_horaria: numeroOuNull(m?.carga_horaria),
    }))
    .filter((m) => m.titulo)
    .slice(0, 60);
}

async function gravarModulos(conn, turmaId, modulos) {
  await conn.query(`DELETE FROM oficina_modulos WHERE turma_id = ?`, [turmaId]);
  for (const m of modulos) {
    await conn.query(
      `INSERT INTO oficina_modulos (turma_id, ordem, titulo, data, hora_inicio, hora_fim, carga_horaria)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [turmaId, m.ordem, m.titulo, m.data, m.hora_inicio, m.hora_fim, m.carga_horaria]
    );
  }
}

function somaCargaHoraria(modulos, informada) {
  const soma = modulos.reduce((acc, m) => acc + (m.carga_horaria || 0), 0);
  return soma > 0 ? soma : informada;
}

// Lê e valida o corpo do formulário de turma. Devolve { erro } ou { dados }.
function validarCorpoTurma(body) {
  const nome = texto(body?.nome, 255);
  if (!nome) return { erro: "Informe o nome da turma." };

  const status = body?.status || "rascunho";
  if (!STATUS_TURMA.includes(status)) return { erro: "Situação da turma inválida." };

  const modalidade = body?.modalidade || "presencial";
  if (!MODALIDADES.includes(modalidade)) return { erro: "Modalidade inválida." };

  const dataInicio = dataIso(body?.data_inicio);
  const dataFim = dataIso(body?.data_fim);
  if (dataInicio && dataFim && dataFim < dataInicio) {
    return { erro: "A data de término não pode ser anterior à data de início." };
  }

  let vagas = null;
  if (body?.vagas !== "" && body?.vagas !== null && body?.vagas !== undefined) {
    vagas = parseInt(body.vagas, 10);
    if (!Number.isInteger(vagas) || vagas < 0) return { erro: "Número de vagas inválido." };
  }

  const modulos = normalizarModulos(body?.modulos);

  return {
    dados: {
      nome,
      descricao: texto(body?.descricao),
      data_inicio: dataInicio,
      data_fim: dataFim,
      horario: texto(body?.horario, 120),
      modalidade,
      local_nome: texto(body?.local_nome, 255),
      endereco: texto(body?.endereco, 500),
      vagas,
      inscricoes_ate: dataIso(body?.inscricoes_ate),
      status,
      cargos_elegiveis: listaTexto(body?.cargos_elegiveis, CARGOS_ELEGIVEIS_PADRAO),
      cargos_almejados: listaTexto(body?.cargos_almejados, CARGOS_ALMEJADOS_PADRAO),
      carga_horaria_prevista: somaCargaHoraria(modulos, numeroOuNull(body?.carga_horaria_prevista)),
      modulos: body?.modulos === undefined ? null : modulos,
    },
  };
}

/* ───────────────────────────── TURMAS ───────────────────────────── */

async function listarTurmas(req, res) {
  try {
    const tenant = filtroTenant(req);
    const [rows] = await db.query(
      `SELECT ${TURMA_COLUNAS},
         (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id) AS total_inscritos,
         (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status = 'confirmado') AS confirmados,
         (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status = 'em_conferencia') AS em_conferencia,
         (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status = 'lista_espera') AS lista_espera,
         (SELECT COUNT(*) FROM oficina_inscricoes i WHERE i.turma_id = t.id AND i.status IN ('cancelado','desistente')) AS cancelados
       FROM oficina_turmas t
       WHERE 1 = 1${tenant.sql}
       ORDER BY COALESCE(t.data_inicio, '9999-12-31') DESC, t.id DESC`,
      tenant.params
    );

    res.json(
      rows.map((t) => ({
        ...formatarTurma(t),
        total_inscritos: Number(t.total_inscritos),
        confirmados: Number(t.confirmados),
        em_conferencia: Number(t.em_conferencia),
        lista_espera: Number(t.lista_espera),
        cancelados: Number(t.cancelados),
      }))
    );
  } catch (error) {
    console.error("[oficina] listarTurmas:", error);
    res.status(500).json({ error: "Erro ao listar as turmas da Oficina." });
  }
}

async function detalharTurma(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const modulos = await carregarModulos(turma.id);
    const [porDia] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dia, COUNT(*) AS total
       FROM oficina_inscricoes WHERE turma_id = ? GROUP BY dia ORDER BY dia ASC`,
      [turma.id]
    );

    res.json({
      ...formatarTurma(turma),
      modulos,
      inscricoes_por_dia: porDia.map((d) => ({ dia: d.dia, total: Number(d.total) })),
    });
  } catch (error) {
    console.error("[oficina] detalharTurma:", error);
    res.status(500).json({ error: "Erro ao carregar a turma." });
  }
}

async function criarTurma(req, res) {
  if (!req.empresaId || req.empresaId < 0) {
    return res.status(400).json({
      error: "Entre em um ambiente (empresa) específico para criar uma turma da Oficina.",
    });
  }

  const { erro, dados } = validarCorpoTurma(req.body);
  if (erro) return res.status(400).json({ error: erro });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO oficina_turmas
        (empresa_id, nome, descricao, token, data_inicio, data_fim, horario, modalidade, local_nome, endereco,
         vagas, inscricoes_ate, status, cargos_elegiveis, cargos_almejados, carga_horaria_prevista, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.empresaId,
        dados.nome,
        dados.descricao,
        gerarToken(),
        dados.data_inicio,
        dados.data_fim,
        dados.horario,
        dados.modalidade,
        dados.local_nome,
        dados.endereco,
        dados.vagas,
        dados.inscricoes_ate,
        dados.status,
        JSON.stringify(dados.cargos_elegiveis),
        JSON.stringify(dados.cargos_almejados),
        dados.carga_horaria_prevista,
        req.user?.id ?? null,
      ]
    );

    if (dados.modulos) await gravarModulos(conn, result.insertId, dados.modulos);
    await conn.commit();

    req.params.id = result.insertId;
    return detalharTurma(req, res.status(201));
  } catch (error) {
    await conn.rollback();
    console.error("[oficina] criarTurma:", error);
    res.status(500).json({ error: "Erro ao criar a turma da Oficina." });
  } finally {
    conn.release();
  }
}

async function atualizarTurma(req, res) {
  const { erro, dados } = validarCorpoTurma(req.body);
  if (erro) return res.status(400).json({ error: erro });

  const conn = await db.getConnection();
  try {
    const existente = await buscarTurma(req, req.params.id);
    if (!existente) return res.status(404).json({ error: "Turma não encontrada." });

    await conn.beginTransaction();
    await conn.query(
      `UPDATE oficina_turmas SET
         nome = ?, descricao = ?, data_inicio = ?, data_fim = ?, horario = ?, modalidade = ?, local_nome = ?,
         endereco = ?, vagas = ?, inscricoes_ate = ?, status = ?, cargos_elegiveis = ?, cargos_almejados = ?,
         carga_horaria_prevista = ?
       WHERE id = ?`,
      [
        dados.nome,
        dados.descricao,
        dados.data_inicio,
        dados.data_fim,
        dados.horario,
        dados.modalidade,
        dados.local_nome,
        dados.endereco,
        dados.vagas,
        dados.inscricoes_ate,
        dados.status,
        JSON.stringify(dados.cargos_elegiveis),
        JSON.stringify(dados.cargos_almejados),
        dados.modulos ? dados.carga_horaria_prevista : numeroOuNull(existente.carga_horaria_prevista),
        existente.id,
      ]
    );

    if (dados.modulos) await gravarModulos(conn, existente.id, dados.modulos);
    await conn.commit();

    return detalharTurma(req, res);
  } catch (error) {
    await conn.rollback();
    console.error("[oficina] atualizarTurma:", error);
    res.status(500).json({ error: "Erro ao atualizar a turma da Oficina." });
  } finally {
    conn.release();
  }
}

// Cria uma nova turma a partir de uma existente (como "duplicar evento" do
// Doity): mantém texto, local, vagas, listas de cargos e a grade (títulos e
// carga horária), mas zera datas, entra como rascunho e ganha token novo.
async function duplicarTurma(req, res) {
  const conn = await db.getConnection();
  try {
    const origem = await buscarTurma(req, req.params.id);
    if (!origem) return res.status(404).json({ error: "Turma não encontrada." });

    const modulos = (await carregarModulos(origem.id)).map((m, i) => ({
      ordem: i,
      titulo: m.titulo,
      data: null,
      hora_inicio: m.hora_inicio,
      hora_fim: m.hora_fim,
      carga_horaria: m.carga_horaria,
    }));

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO oficina_turmas
        (empresa_id, nome, descricao, token, horario, modalidade, local_nome, endereco, vagas, status,
         cargos_elegiveis, cargos_almejados, carga_horaria_prevista, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?, ?)`,
      [
        origem.empresa_id,
        `${origem.nome} (cópia)`.slice(0, 255),
        origem.descricao,
        gerarToken(),
        origem.horario,
        origem.modalidade,
        origem.local_nome,
        origem.endereco,
        origem.vagas,
        origem.cargos_elegiveis,
        origem.cargos_almejados,
        origem.carga_horaria_prevista,
        req.user?.id ?? null,
      ]
    );
    await gravarModulos(conn, result.insertId, modulos);
    await conn.commit();

    req.params.id = result.insertId;
    return detalharTurma(req, res.status(201));
  } catch (error) {
    await conn.rollback();
    console.error("[oficina] duplicarTurma:", error);
    res.status(500).json({ error: "Erro ao duplicar a turma da Oficina." });
  } finally {
    conn.release();
  }
}

async function excluirTurma(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM oficina_inscricoes WHERE turma_id = ?`, [
      turma.id,
    ]);
    if (Number(total) > 0) {
      return res.status(409).json({
        error: "Esta turma já tem inscrições e não pode ser excluída. Encerre a turma para preservar o histórico.",
      });
    }

    await db.query(`DELETE FROM oficina_turmas WHERE id = ?`, [turma.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("[oficina] excluirTurma:", error);
    res.status(500).json({ error: "Erro ao excluir a turma da Oficina." });
  }
}

/* ─────────────────────────── INSCRIÇÕES ─────────────────────────── */

const INSCRICAO_COLUNAS = `
  i.id, i.turma_id, i.pessoa_id, i.usuario_id, i.nome, i.email, i.cpf, i.matricula, i.escolaridade,
  i.horario_trabalho, i.cargo_atual, i.cargo_almejado, i.cargo_almejado_outro, i.status, i.vinculo,
  i.motivo_conferencia, i.created_at
`;

async function listarInscricoes(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const [rows] = await db.query(
      `SELECT ${INSCRICAO_COLUNAS} FROM oficina_inscricoes i WHERE i.turma_id = ? ORDER BY i.created_at ASC, i.id ASC`,
      [turma.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("[oficina] listarInscricoes:", error);
    res.status(500).json({ error: "Erro ao listar as inscrições." });
  }
}

async function alterarStatusInscricao(req, res) {
  try {
    const { status, forcar } = req.body || {};
    if (!STATUS_INSCRICAO.includes(status)) {
      return res.status(400).json({ error: "Situação da inscrição inválida." });
    }

    const tenant = filtroTenant(req, "t");
    const [rows] = await db.query(
      `SELECT i.*, t.vagas
       FROM oficina_inscricoes i JOIN oficina_turmas t ON t.id = i.turma_id
       WHERE i.id = ?${tenant.sql}`,
      [req.params.id, ...tenant.params]
    );
    const inscricao = rows[0];
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada." });

    // Controle de vagas: só barra quando a pessoa passa a OCUPAR vaga que não
    // ocupava antes (ex.: lista de espera → confirmado). Quem já ocupa vaga e
    // só muda entre confirmado/em conferência não altera a contagem.
    const ocupavaAntes = STATUS_OCUPAM_VAGA.includes(inscricao.status);
    const ocuparaDepois = STATUS_OCUPAM_VAGA.includes(status);
    if (!ocupavaAntes && ocuparaDepois && inscricao.vagas !== null && !forcar) {
      const [[{ ocupadas }]] = await db.query(
        `SELECT COUNT(*) AS ocupadas FROM oficina_inscricoes WHERE turma_id = ? AND status IN ('confirmado','em_conferencia')`,
        [inscricao.turma_id]
      );
      if (Number(ocupadas) >= inscricao.vagas) {
        return res.status(409).json({
          codigo: "SEM_VAGA",
          error: "As vagas desta turma já estão preenchidas. Confirme novamente para ampliar além do limite.",
        });
      }
    }

    // Confirmar uma inscrição que não casou com o cadastro é uma decisão
    // humana da Metodologia: aí sim a pessoa entra no cadastro único
    // (resolverPessoa nunca duplica — casa por CPF dentro da empresa).
    let pessoaId = inscricao.pessoa_id;
    let vinculo = inscricao.vinculo;
    if (status === "confirmado" && !pessoaId) {
      const { pessoa } = await resolverPessoa({
        empresaId: inscricao.empresa_id,
        nome: inscricao.nome,
        cpf: inscricao.cpf,
        matricula: inscricao.matricula,
      });
      pessoaId = pessoa.id;
      vinculo = "manual";
    }

    await db.query(
      `UPDATE oficina_inscricoes SET status = ?, pessoa_id = ?, vinculo = ?, decidido_por_id = ? WHERE id = ?`,
      [status, pessoaId, vinculo, req.user?.id ?? null, inscricao.id]
    );

    const [atualizada] = await db.query(`SELECT ${INSCRICAO_COLUNAS} FROM oficina_inscricoes i WHERE i.id = ?`, [
      inscricao.id,
    ]);
    res.json(atualizada[0]);
  } catch (error) {
    console.error("[oficina] alterarStatusInscricao:", error);
    res.status(500).json({ error: "Erro ao atualizar a inscrição." });
  }
}

const ROTULO_STATUS_INSCRICAO = {
  confirmado: "Confirmado",
  em_conferencia: "Em conferência",
  lista_espera: "Lista de espera",
  cancelado: "Cancelado",
  desistente: "Desistente",
};

function formatarCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

async function exportarInscricoes(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const [rows] = await db.query(
      `SELECT ${INSCRICAO_COLUNAS} FROM oficina_inscricoes i WHERE i.turma_id = ? ORDER BY i.nome ASC`,
      [turma.id]
    );

    const { novoWorkbook, adicionarTabela } = require("../lib/excelExport");
    const wb = novoWorkbook();

    adicionarTabela(wb, {
      nomeAba: "Inscritos",
      colunas: [
        { titulo: "Nº", chave: "n", largura: 6, formato: "inteiro" },
        { titulo: "Nome", chave: "nome", largura: 34 },
        { titulo: "Matrícula", chave: "matricula", largura: 13 },
        { titulo: "CPF", chave: "cpf", largura: 16 },
        { titulo: "E-mail", chave: "email", largura: 30 },
        { titulo: "Escolaridade", chave: "escolaridade", largura: 26 },
        { titulo: "Horário de trabalho", chave: "horario_trabalho", largura: 20 },
        { titulo: "Cargo atual", chave: "cargo_atual", largura: 18 },
        { titulo: "Cargo almejado", chave: "cargo_almejado", largura: 22 },
        { titulo: "Situação", chave: "situacao", largura: 16 },
        { titulo: "Vínculo ao cadastro", chave: "vinculo", largura: 20 },
        { titulo: "Observação", chave: "motivo", largura: 36 },
        { titulo: "Inscrito em", chave: "criado", largura: 18 },
      ],
      linhas: rows.map((r, idx) => ({
        n: idx + 1,
        nome: r.nome,
        matricula: r.matricula,
        cpf: formatarCpf(r.cpf),
        email: r.email || "",
        escolaridade: r.escolaridade || "",
        horario_trabalho: r.horario_trabalho || "",
        cargo_atual: r.cargo_atual || "",
        cargo_almejado: r.cargo_almejado === "Outro" && r.cargo_almejado_outro ? `Outro: ${r.cargo_almejado_outro}` : r.cargo_almejado || "",
        situacao: ROTULO_STATUS_INSCRICAO[r.status] || r.status,
        vinculo: r.pessoa_id ? (r.vinculo === "manual" ? "Confirmado pela Metodologia" : "Matrícula + CPF") : "Sem vínculo",
        motivo: r.motivo_conferencia || "",
        criado: r.created_at ? new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "",
      })),
    });

    const buffer = await wb.xlsx.writeBuffer();
    const nomeArquivo = `oficina-talentos-turma-${turma.id}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("[oficina] exportarInscricoes:", error);
    res.status(500).json({ error: "Erro ao exportar as inscrições." });
  }
}

module.exports = {
  listarTurmas,
  detalharTurma,
  criarTurma,
  atualizarTurma,
  duplicarTurma,
  excluirTurma,
  listarInscricoes,
  alterarStatusInscricao,
  exportarInscricoes,
  // compartilhados com o controller público
  CARGOS_ELEGIVEIS_PADRAO,
  CARGOS_ALMEJADOS_PADRAO,
  STATUS_OCUPAM_VAGA,
  lerLista,
};
