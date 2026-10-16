/**
 * celulaBabyController.js — Célula baby (16/10/2026, pedido do Ramon)
 *
 * Acompanhamento da curva de aprendizagem, feito pelo PRÓPRIO instrutor, dos
 * treinandos aprovados na Avaliação Técnica, nos 7 primeiros dias de
 * operação. Regras decididas com o Ramon:
 *  - Abre sozinha ao concluir a turma de Avaliação Técnica (lib/celulaBaby.js).
 *  - Ao final da avaliação o instrutor define o resultado de cada pessoa:
 *    aprovado | em berço | reprovado (códigos internos: passou | em_berco | nao_seguiu). Só "aprovado" entra no acompanhamento.
 *  - Indicadores livres, definidos pelo instrutor (nome, unidade, sentido).
 *    Meta é opcional (uma meta de referência por indicador; sem meta a célula
 *    simplesmente não ganha cor).
 *  - 7 dias de OPERAÇÃO (D1..D7), numerados em sequência — não calendário.
 *  - O instrutor só vê/edita as células das próprias turmas. Coordenação e
 *    assistente de treinamento veem e editam todas. Supervisor/superintendente
 *    só leem. Treinando não tem acesso.
 */
const ExcelJS = require("exceljs");
const pool = require("../lib/db");
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente, filtroClientesSQL } = require("../lib/acessoCliente");
const { sincronizarCelulas } = require("../lib/celulaBaby");
const { registrarAuditoria } = require("../services/auditoria");

const RESULTADOS = ["passou", "em_berco", "nao_seguiu"];
const PARECERES = ["atingiu", "parcial", "abaixo"];
const DIAS = 7;
const GESTAO = ["coordenador", "assistente_treinamento", "super_admin"];

const chave = (s) => String(s || "").trim().toLowerCase();
const perfilDe = (req) => chave(req.user?.perfil);
const ehGestao = (req) => GESTAO.includes(perfilDe(req));
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });

function podeEditar(req, celula) {
  if (ehGestao(req)) return true;
  return perfilDe(req) === "instrutor" && !!celula.instrutor && chave(celula.instrutor) === chave(req.user?.nome);
}

function podeVer(req, celula) {
  if (ehGestao(req)) return true;
  const p = perfilDe(req);
  if (p === "instrutor") return podeEditar(req, celula);
  return usuarioTemAcessoAoCliente(req, celula.cliente);
}

function escopo(req) {
  return tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
}

async function buscarCelula(req, id) {
  const empresaId = escopo(req);
  const [rows] = await pool.query(
    `SELECT * FROM celulas_baby WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [id, empresaId] : [id]
  );
  return rows[0] || null;
}

function dataIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) < 1e9 ? v : NaN;
  let t = String(v).trim();
  // "1.234,5" (pt-BR) ou "12,5" -> ponto decimal; "12.5" fica como está
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : NaN;
}

function farolDe(c, agora = new Date()) {
  if (c.status === "encerrada") return { farol: "neutro", atrasada: false };
  const diasDesde = (d) => Math.floor((agora - new Date(d)) / 86400000);
  if (c.status === "a_configurar") {
    return { farol: diasDesde(c.created_at) > 2 ? "amarelo" : "neutro", atrasada: false };
  }
  const inicio = dataIso(c.data_inicio_operacao);
  if (!inicio) return { farol: "amarelo", atrasada: false };
  const desdeInicio = diasDesde(inicio + "T00:00:00");
  // 7 dias de operação + folga de fim de semana/feriado: passou de 10 dias corridos
  // sem encerrar é considerada atrasada.
  if (desdeInicio > 10) return { farol: "vermelho", atrasada: true };
  const lancados = Number(c.dias_lancados || 0);
  const ultimo = c.ultimo_lancamento ? diasDesde(c.ultimo_lancamento) : null;
  if (lancados < DIAS && ((ultimo === null && desdeInicio >= 1) || (ultimo !== null && ultimo > 2))) {
    return { farol: "amarelo", atrasada: false };
  }
  return { farol: "verde", atrasada: false };
}

/* ───────────────────────── listagem ───────────────────────── */

async function listar(req, res) {
  try {
    const empresaId = escopo(req);
    try {
      await sincronizarCelulas(empresaId);
    } catch (e) {
      console.error("[celulaBaby] sincronizar:", e.message || e);
    }

    const where = [];
    const params = [];
    if (empresaId) {
      where.push("c.empresa_id = ?");
      params.push(empresaId);
    }
    if (perfilDe(req) === "instrutor") {
      where.push("LOWER(TRIM(c.instrutor)) = ?");
      params.push(chave(req.user?.nome));
    } else if (!ehGestao(req)) {
      const f = filtroClientesSQL(req, "c.cliente");
      if (f) {
        where.push(f.sql);
        params.push(...f.params);
      }
    }

    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM celula_baby_pessoas p WHERE p.celula_id = c.id) AS total_pessoas,
              (SELECT COUNT(*) FROM celula_baby_pessoas p WHERE p.celula_id = c.id AND p.resultado = 'passou') AS passaram,
              (SELECT COUNT(*) FROM celula_baby_pessoas p WHERE p.celula_id = c.id AND p.resultado = 'em_berco') AS em_berco,
              (SELECT COUNT(*) FROM celula_baby_pessoas p WHERE p.celula_id = c.id AND p.resultado = 'nao_seguiu') AS nao_seguiu,
              (SELECT COUNT(*) FROM celula_baby_pessoas p WHERE p.celula_id = c.id AND p.resultado IS NULL) AS sem_resultado,
              (SELECT MAX(l.dia) FROM celula_baby_lancamentos l WHERE l.celula_id = c.id) AS dias_lancados,
              (SELECT MAX(l.updated_at) FROM celula_baby_lancamentos l WHERE l.celula_id = c.id) AS ultimo_lancamento
         FROM celulas_baby c
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY FIELD(c.status,'a_configurar','em_andamento','encerrada'), c.created_at DESC`,
      params
    );

    const celulas = rows.map((c) => {
      const f = farolDe(c);
      return {
        id: c.id,
        treinamento_id: c.treinamento_id,
        cliente: c.cliente,
        turma_nome: c.turma_nome,
        instrutor: c.instrutor,
        status: c.status,
        data_inicio_operacao: dataIso(c.data_inicio_operacao),
        total_pessoas: Number(c.total_pessoas),
        passaram: Number(c.passaram),
        em_berco: Number(c.em_berco),
        nao_seguiu: Number(c.nao_seguiu),
        sem_resultado: Number(c.sem_resultado),
        dias_lancados: Number(c.dias_lancados || 0),
        farol: f.farol,
        atrasada: f.atrasada,
        encerrada_em: c.encerrada_em,
        criada_em: c.created_at,
      };
    });

    return res.json({
      ok: true,
      celulas,
      contagem: {
        a_configurar: celulas.filter((c) => c.status === "a_configurar").length,
        em_andamento: celulas.filter((c) => c.status === "em_andamento").length,
        atrasadas: celulas.filter((c) => c.atrasada).length,
        encerradas: celulas.filter((c) => c.status === "encerrada").length,
      },
    });
  } catch (e) {
    console.error("[celulaBaby.listar]", e.message || e);
    return erro(res, 500, "Erro ao carregar as células baby.");
  }
}

/* ───────────────────────── detalhe ───────────────────────── */

async function carregarDetalhe(celula) {
  const [pessoas] = await pool.query(
    `SELECT id, participante_id, pessoa_id, nome, matricula, resultado, parecer, observacao
       FROM celula_baby_pessoas WHERE celula_id = ? ORDER BY nome ASC`,
    [celula.id]
  );
  // Resultado definido na avaliação individual da Rotina do instrutor: a célula só lê.
  try {
    const [av] = await pool.query(
      `SELECT participante_id FROM rotina_avaliacao_individual WHERE treinamento_id = ? AND resultado IS NOT NULL`,
      [celula.treinamento_id]
    );
    const doAv = new Set(av.map((x) => Number(x.participante_id)));
    pessoas.forEach((p) => { p.resultado_da_avaliacao = doAv.has(Number(p.participante_id)); });
  } catch (_) {
    pessoas.forEach((p) => { p.resultado_da_avaliacao = false; });
  }
  const [indicadores] = await pool.query(
    `SELECT id, nome, unidade, sentido, meta, ordem FROM celula_baby_indicadores WHERE celula_id = ? ORDER BY ordem ASC, id ASC`,
    [celula.id]
  );
  const [lanc] = await pool.query(
    `SELECT indicador_id, pessoa_row_id, dia, valor FROM celula_baby_lancamentos WHERE celula_id = ?`,
    [celula.id]
  );
  return {
    pessoas,
    indicadores: indicadores.map((i) => ({ ...i, meta: i.meta === null ? null : Number(i.meta) })),
    lancamentos: lanc.map((l) => ({ ...l, valor: Number(l.valor) })),
  };
}

async function detalhar(req, res) {
  try {
    const celula = await buscarCelula(req, req.params.id);
    if (!celula || !podeVer(req, celula)) return erro(res, 404, "Célula não encontrada.");
    const det = await carregarDetalhe(celula);
    const [[agg]] = await pool.query(
      `SELECT MAX(dia) AS dias_lancados, MAX(updated_at) AS ultimo_lancamento FROM celula_baby_lancamentos WHERE celula_id = ?`,
      [celula.id]
    );
    const f = farolDe({ ...celula, ...agg });
    return res.json({
      ok: true,
      celula: {
        id: celula.id,
        treinamento_id: celula.treinamento_id,
        cliente: celula.cliente,
        turma_nome: celula.turma_nome,
        instrutor: celula.instrutor,
        status: celula.status,
        data_inicio_operacao: dataIso(celula.data_inicio_operacao),
        relatorio_final: celula.relatorio_final,
        iniciada_em: celula.iniciada_em,
        encerrada_em: celula.encerrada_em,
        farol: f.farol,
        atrasada: f.atrasada,
      },
      ...det,
      permissoes: { editar: podeEditar(req, celula), gestao: ehGestao(req) },
      dias: DIAS,
    });
  } catch (e) {
    console.error("[celulaBaby.detalhar]", e.message || e);
    return erro(res, 500, "Erro ao carregar a célula.");
  }
}

/* ───────────────────────── edição ───────────────────────── */

async function exigirEdicao(req, res) {
  const celula = await buscarCelula(req, req.params.id);
  if (!celula || !podeVer(req, celula)) {
    erro(res, 404, "Célula não encontrada.");
    return null;
  }
  if (!podeEditar(req, celula)) {
    erro(res, 403, "Só o instrutor da turma (ou a coordenação) pode alterar esta célula.");
    return null;
  }
  if (celula.status === "encerrada") {
    erro(res, 409, "Esta célula está encerrada. A coordenação pode reabrir se for preciso corrigir.");
    return null;
  }
  return celula;
}

async function atualizar(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    const b = req.body || {};
    const sets = [];
    const params = [];

    if (b.data_inicio_operacao !== undefined) {
      const d = b.data_inicio_operacao ? String(b.data_inicio_operacao).slice(0, 10) : null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return erro(res, 400, "Data de início inválida.");
      if (d && new Date(d + "T00:00:00") - new Date() > 30 * 86400000) {
        return erro(res, 400, "A data de início na operação está muito distante no futuro.");
      }
      sets.push("data_inicio_operacao = ?");
      params.push(d);
    }
    if (b.relatorio_final !== undefined) {
      const t = String(b.relatorio_final || "").slice(0, 8000);
      sets.push("relatorio_final = ?");
      params.push(t || null);
    }
    if (b.instrutor !== undefined) {
      if (!ehGestao(req)) return erro(res, 403, "Só a coordenação troca o instrutor da célula.");
      sets.push("instrutor = ?");
      params.push(String(b.instrutor || "").trim() || null);
    }
    if (!sets.length) return res.json({ ok: true });

    await pool.query(`UPDATE celulas_baby SET ${sets.join(", ")} WHERE id = ?`, [...params, celula.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.atualizar]", e.message || e);
    return erro(res, 500, "Erro ao salvar a célula.");
  }
}

async function atualizarPessoa(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    const [[pessoa]] = await pool.query(
      `SELECT * FROM celula_baby_pessoas WHERE id = ? AND celula_id = ? LIMIT 1`,
      [req.params.pessoaId, celula.id]
    );
    if (!pessoa) return erro(res, 404, "Pessoa não encontrada nesta célula.");

    const b = req.body || {};
    const sets = [];
    const params = [];
    let resultado = pessoa.resultado;

    if (b.resultado !== undefined && b.resultado !== pessoa.resultado) {
      try {
        const [[av]] = await pool.query(
          `SELECT resultado FROM rotina_avaliacao_individual WHERE treinamento_id = ? AND participante_id = ? AND resultado IS NOT NULL LIMIT 1`,
          [celula.treinamento_id, pessoa.participante_id]
        );
        if (av) return erro(res, 409, "Este resultado vem da avaliação individual da turma. Altere em Turma > Rotina do instrutor > Avaliação individual.");
      } catch (_) { /* tabela ainda não existe: segue como antes */ }
    }
    if (b.resultado !== undefined) {
      const r = b.resultado === null || b.resultado === "" ? null : String(b.resultado);
      if (r !== null && !RESULTADOS.includes(r)) return erro(res, 400, "Resultado inválido.");
      if (pessoa.resultado === "passou" && r !== "passou") {
        const [[{ n }]] = await pool.query(
          `SELECT COUNT(*) AS n FROM celula_baby_lancamentos WHERE pessoa_row_id = ?`,
          [pessoa.id]
        );
        if (Number(n) > 0) {
          return erro(res, 409, "Esta pessoa já tem lançamentos. Apague os lançamentos antes de mudar o resultado.");
        }
      }
      resultado = r;
      sets.push("resultado = ?");
      params.push(r);
      if (r !== "passou") {
        sets.push("parecer = NULL");
      }
    }
    if (b.parecer !== undefined) {
      const p = b.parecer === null || b.parecer === "" ? null : String(b.parecer);
      if (p !== null && !PARECERES.includes(p)) return erro(res, 400, "Parecer inválido.");
      if (p !== null && resultado !== "passou") return erro(res, 400, "Parecer só vale para quem foi aprovado.");
      if (!sets.includes("parecer = NULL")) {
        sets.push("parecer = ?");
        params.push(p);
      }
    }
    if (b.observacao !== undefined) {
      sets.push("observacao = ?");
      params.push(String(b.observacao || "").slice(0, 1000) || null);
    }
    if (!sets.length) return res.json({ ok: true });

    await pool.query(`UPDATE celula_baby_pessoas SET ${sets.join(", ")} WHERE id = ?`, [...params, pessoa.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.atualizarPessoa]", e.message || e);
    return erro(res, 500, "Erro ao salvar a pessoa.");
  }
}

/* ───────────────────────── indicadores ───────────────────────── */

function lerIndicador(b) {
  const nome = String(b.nome || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!nome) return { erro: "Informe o nome do indicador." };
  const unidade = String(b.unidade || "").trim().slice(0, 30) || null;
  const sentido = b.sentido === "menor" ? "menor" : "maior";
  const meta = numero(b.meta);
  if (Number.isNaN(meta)) return { erro: "Meta inválida." };
  return { nome, unidade, sentido, meta };
}

async function criarIndicador(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    const d = lerIndicador(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    const [[{ ordem }]] = await pool.query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM celula_baby_indicadores WHERE celula_id = ?`,
      [celula.id]
    );
    const [r] = await pool.query(
      `INSERT INTO celula_baby_indicadores (celula_id, nome, unidade, sentido, meta, ordem) VALUES (?, ?, ?, ?, ?, ?)`,
      [celula.id, d.nome, d.unidade, d.sentido, d.meta, ordem]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return erro(res, 409, "Já existe um indicador com esse nome nesta célula.");
    console.error("[celulaBaby.criarIndicador]", e.message || e);
    return erro(res, 500, "Erro ao criar o indicador.");
  }
}

async function editarIndicador(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    const d = lerIndicador(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    const [r] = await pool.query(
      `UPDATE celula_baby_indicadores SET nome = ?, unidade = ?, sentido = ?, meta = ? WHERE id = ? AND celula_id = ?`,
      [d.nome, d.unidade, d.sentido, d.meta, req.params.indicadorId, celula.id]
    );
    if (!r.affectedRows) return erro(res, 404, "Indicador não encontrado.");
    return res.json({ ok: true });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return erro(res, 409, "Já existe um indicador com esse nome nesta célula.");
    console.error("[celulaBaby.editarIndicador]", e.message || e);
    return erro(res, 500, "Erro ao salvar o indicador.");
  }
}

async function excluirIndicador(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    await pool.query(`DELETE FROM celula_baby_lancamentos WHERE indicador_id = ? AND celula_id = ?`, [
      req.params.indicadorId,
      celula.id,
    ]);
    const [r] = await pool.query(`DELETE FROM celula_baby_indicadores WHERE id = ? AND celula_id = ?`, [
      req.params.indicadorId,
      celula.id,
    ]);
    if (!r.affectedRows) return erro(res, 404, "Indicador não encontrado.");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.excluirIndicador]", e.message || e);
    return erro(res, 500, "Erro ao excluir o indicador.");
  }
}

// Copia os indicadores da última célula do mesmo cliente que tenha indicadores.
async function copiarIndicadores(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    const [[origem]] = await pool.query(
      `SELECT c.id FROM celulas_baby c
        WHERE c.id <> ? AND c.empresa_id <=> ? AND LOWER(TRIM(COALESCE(c.cliente,''))) = ?
          AND EXISTS (SELECT 1 FROM celula_baby_indicadores i WHERE i.celula_id = c.id)
        ORDER BY c.created_at DESC LIMIT 1`,
      [celula.id, celula.empresa_id, chave(celula.cliente)]
    );
    if (!origem) return erro(res, 404, "Não há célula anterior deste cliente com indicadores para copiar.");
    const [r] = await pool.query(
      `INSERT IGNORE INTO celula_baby_indicadores (celula_id, nome, unidade, sentido, meta, ordem)
       SELECT ?, nome, unidade, sentido, meta, ordem FROM celula_baby_indicadores WHERE celula_id = ?`,
      [celula.id, origem.id]
    );
    return res.json({ ok: true, copiados: r.affectedRows });
  } catch (e) {
    console.error("[celulaBaby.copiarIndicadores]", e.message || e);
    return erro(res, 500, "Erro ao copiar os indicadores.");
  }
}

/* ───────────────────────── lançamentos ───────────────────────── */

async function salvarLancamentos(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    if (celula.status !== "em_andamento") {
      return erro(res, 409, "Inicie o acompanhamento antes de lançar os indicadores.");
    }
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 500) : [];
    if (!itens.length) return res.json({ ok: true, salvos: 0 });

    const [pessoas] = await pool.query(
      `SELECT id FROM celula_baby_pessoas WHERE celula_id = ? AND resultado = 'passou'`,
      [celula.id]
    );
    const [inds] = await pool.query(`SELECT id FROM celula_baby_indicadores WHERE celula_id = ?`, [celula.id]);
    const okPessoa = new Set(pessoas.map((p) => Number(p.id)));
    const okInd = new Set(inds.map((i) => Number(i.id)));

    let salvos = 0;
    for (const it of itens) {
      const pessoaId = Number(it.pessoa_row_id);
      const indId = Number(it.indicador_id);
      const dia = Number(it.dia);
      if (!okPessoa.has(pessoaId) || !okInd.has(indId) || !Number.isInteger(dia) || dia < 1 || dia > DIAS) {
        return erro(res, 400, "Lançamento inválido (pessoa, indicador ou dia).");
      }
      const valor = numero(it.valor);
      if (Number.isNaN(valor)) return erro(res, 400, "Valor inválido.");
      if (valor === null) {
        await pool.query(
          `DELETE FROM celula_baby_lancamentos WHERE indicador_id = ? AND pessoa_row_id = ? AND dia = ?`,
          [indId, pessoaId, dia]
        );
      } else {
        await pool.query(
          `INSERT INTO celula_baby_lancamentos (celula_id, indicador_id, pessoa_row_id, dia, valor, lancado_por_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor), lancado_por_id = VALUES(lancado_por_id)`,
          [celula.id, indId, pessoaId, dia, valor, req.user?.id || null]
        );
      }
      salvos += 1;
    }
    return res.json({ ok: true, salvos });
  } catch (e) {
    console.error("[celulaBaby.salvarLancamentos]", e.message || e);
    return erro(res, 500, "Erro ao salvar os lançamentos.");
  }
}

/* ───────────────────────── ciclo de vida ───────────────────────── */

async function iniciar(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    if (celula.status !== "a_configurar") return erro(res, 409, "Esta célula já foi iniciada.");
    if (!celula.data_inicio_operacao) return erro(res, 400, "Informe a data de início na operação.");
    const [[{ n }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM celula_baby_pessoas WHERE celula_id = ? AND resultado = 'passou'`,
      [celula.id]
    );
    if (!Number(n)) return erro(res, 400, "Marque pelo menos uma pessoa como “Aprovado” para iniciar o acompanhamento.");
    await pool.query(`UPDATE celulas_baby SET status = 'em_andamento', iniciada_em = NOW() WHERE id = ?`, [celula.id]);
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "celula_baby", entidadeId: celula.id,
      resumo: `${req.user?.nome || "Alguém"} iniciou a célula baby da turma ${celula.turma_nome} (${n} pessoa(s))`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.iniciar]", e.message || e);
    return erro(res, 500, "Erro ao iniciar a célula.");
  }
}

async function encerrar(req, res) {
  try {
    const celula = await exigirEdicao(req, res);
    if (!celula) return;
    if (celula.status !== "em_andamento") return erro(res, 409, "Só uma célula em andamento pode ser encerrada.");
    const [[{ n }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM celula_baby_pessoas WHERE celula_id = ? AND resultado = 'passou' AND parecer IS NULL`,
      [celula.id]
    );
    if (Number(n) > 0 && !req.body?.confirmar) {
      return res.status(409).json({
        ok: false,
        precisa_confirmar: true,
        message: `${n} pessoa(s) ainda estão sem parecer. Encerrar assim mesmo?`,
      });
    }
    const relatorio = req.body?.relatorio_final !== undefined
      ? String(req.body.relatorio_final || "").slice(0, 8000) || null
      : celula.relatorio_final;
    await pool.query(
      `UPDATE celulas_baby SET status = 'encerrada', encerrada_em = NOW(), encerrada_por_id = ?, relatorio_final = ? WHERE id = ?`,
      [req.user?.id || null, relatorio, celula.id]
    );
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "celula_baby", entidadeId: celula.id,
      resumo: `${req.user?.nome || "Alguém"} encerrou a célula baby da turma ${celula.turma_nome}`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.encerrar]", e.message || e);
    return erro(res, 500, "Erro ao encerrar a célula.");
  }
}

async function reabrir(req, res) {
  try {
    const celula = await buscarCelula(req, req.params.id);
    if (!celula) return erro(res, 404, "Célula não encontrada.");
    if (!ehGestao(req)) return erro(res, 403, "Só a coordenação reabre uma célula encerrada.");
    if (celula.status !== "encerrada") return erro(res, 409, "A célula não está encerrada.");
    await pool.query(`UPDATE celulas_baby SET status = 'em_andamento', encerrada_em = NULL, encerrada_por_id = NULL WHERE id = ?`, [celula.id]);
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "celula_baby", entidadeId: celula.id,
      resumo: `${req.user?.nome || "Alguém"} reabriu a célula baby da turma ${celula.turma_nome}`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[celulaBaby.reabrir]", e.message || e);
    return erro(res, 500, "Erro ao reabrir a célula.");
  }
}

/* ───────────────────────── exportação ───────────────────────── */

const ROTULO_RESULTADO = { passou: "Aprovado", em_berco: "Em berço", nao_seguiu: "Reprovado" };
const ROTULO_PARECER = { atingiu: "Atingiu a curva", parcial: "Parcial", abaixo: "Abaixo da curva" };

async function exportar(req, res) {
  try {
    const celula = await buscarCelula(req, req.params.id);
    if (!celula || !podeVer(req, celula)) return erro(res, 404, "Célula não encontrada.");
    const det = await carregarDetalhe(celula);

    const wb = new ExcelJS.Workbook();
    const cab = (ws) => {
      const r = ws.getRow(1);
      r.font = { bold: true, color: { argb: "FFFFFFFF" } };
      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1220" } };
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    const w1 = wb.addWorksheet("Pessoas");
    w1.columns = [
      { header: "Nome", key: "nome", width: 34 },
      { header: "Matrícula", key: "matricula", width: 14 },
      { header: "Resultado da avaliação técnica", key: "resultado", width: 28 },
      { header: "Parecer da curva", key: "parecer", width: 20 },
      { header: "Observação", key: "obs", width: 50 },
    ];
    det.pessoas.forEach((p) =>
      w1.addRow({
        nome: p.nome, matricula: p.matricula || "",
        resultado: ROTULO_RESULTADO[p.resultado] || "Sem resultado",
        parecer: ROTULO_PARECER[p.parecer] || "", obs: p.observacao || "",
      })
    );
    cab(w1);

    const w2 = wb.addWorksheet("Lançamentos");
    const cols = [
      { header: "Pessoa", key: "pessoa", width: 34 },
      { header: "Indicador", key: "ind", width: 26 },
      { header: "Unidade", key: "un", width: 10 },
      { header: "Meta", key: "meta", width: 10 },
    ];
    for (let d = 1; d <= DIAS; d++) cols.push({ header: `D${d}`, key: `d${d}`, width: 10 });
    cols.push({ header: "Média", key: "media", width: 10 });
    w2.columns = cols;
    const passou = det.pessoas.filter((p) => p.resultado === "passou");
    for (const ind of det.indicadores) {
      for (const p of passou) {
        const linha = { pessoa: p.nome, ind: ind.nome, un: ind.unidade || "", meta: ind.meta ?? "" };
        const vals = [];
        for (let d = 1; d <= DIAS; d++) {
          const l = det.lancamentos.find((x) => x.indicador_id === ind.id && x.pessoa_row_id === p.id && x.dia === d);
          linha[`d${d}`] = l ? l.valor : "";
          if (l) vals.push(l.valor);
        }
        linha.media = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : "";
        w2.addRow(linha);
      }
    }
    cab(w2);

    const w3 = wb.addWorksheet("Relatório final");
    w3.columns = [{ header: "Célula baby", key: "a", width: 110 }];
    w3.addRow({ a: `Turma: ${celula.turma_nome || ""}  |  Cliente: ${celula.cliente || ""}  |  Instrutor: ${celula.instrutor || ""}` });
    w3.addRow({ a: `Início na operação: ${dataIso(celula.data_inicio_operacao) || "—"}  |  Situação: ${celula.status}` });
    w3.addRow({ a: "" });
    w3.addRow({ a: celula.relatorio_final || "(sem relatório final)" });
    w3.getRow(4).alignment = { wrapText: true, vertical: "top" };
    cab(w3);

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="celula-baby-${celula.id}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[celulaBaby.exportar]", e.message || e);
    return erro(res, 500, "Erro ao exportar a célula.");
  }
}

module.exports = {
  listar, detalhar, atualizar, atualizarPessoa,
  criarIndicador, editarIndicador, excluirIndicador, copiarIndicadores,
  salvarLancamentos, iniciar, encerrar, reabrir, exportar,
};
