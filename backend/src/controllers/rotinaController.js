/**
 * rotinaController.js — Rotina do instrutor (Fase 1, 16/10/2026, pedido do Ramon)
 *
 * Por turma:
 *  - Avaliação Técnica (subtipo de sistema): checklist Véspera/Início/Final,
 *    responsabilidades com prazo e farol, diário de bordo (um texto por dia).
 *  - Qualquer turma: o instrutor escolhe quais atividades do catálogo valem
 *    para ela e registra cada atividade (duração obrigatória). O que é
 *    registrado SOMA na CH do instrutor (ver services/capacidadeResolver.js).
 *  - Atividade avulsa (sem turma) em "Minhas atividades".
 *
 * Permissões: coordenação e assistente de treinamento veem/editam tudo;
 * instrutor só as próprias turmas (nome da turma = nome do usuário);
 * supervisor/superintendente só leem, dentro dos clientes a que têm acesso;
 * treinando não acessa.
 */
const ExcelJS = require("exceljs");
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const { ehSubtipoAvaliacaoTecnica } = require("../lib/subtipos");
const { registrarAuditoria } = require("../services/auditoria");
const R = require("../lib/rotina");
const AV = require("../lib/rotinaAvaliacao");

const GESTAO = ["coordenador", "assistente_treinamento", "super_admin"];
const RESPOSTAS = ["sim", "nao", "na"];
const ANCORAS = ["inicio", "fim", "continuo"];

const chave = (s) => String(s || "").trim().toLowerCase();
const perfilDe = (req) => chave(req.user?.perfil);
const ehGestao = (req) => GESTAO.includes(perfilDe(req));
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });
const escopo = (req) => tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
const texto = (v, max) => {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));

/* ───────────────────────── acesso à turma ───────────────────────── */

async function buscarTurma(req, id) {
  const empresaId = escopo(req);
  const [rows] = await pool.query(
    `SELECT * FROM treinamentos WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [id, empresaId] : [id]
  );
  return rows[0] || null;
}

function podeEditarTurma(req, t) {
  if (ehGestao(req)) return true;
  return perfilDe(req) === "instrutor" && !!t.instrutor && chave(t.instrutor) === chave(req.user?.nome);
}

function podeVerTurma(req, t) {
  if (ehGestao(req)) return true;
  if (perfilDe(req) === "instrutor") return podeEditarTurma(req, t);
  return usuarioTemAcessoAoCliente(req, t.cliente);
}

async function exigirTurma(req, res, { editar = false } = {}) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    erro(res, 400, "Turma inválida.");
    return null;
  }
  const t = await buscarTurma(req, id);
  if (!t) {
    erro(res, 404, "Turma não encontrada.");
    return null;
  }
  if (editar ? !podeEditarTurma(req, t) : !podeVerTurma(req, t)) {
    erro(res, 403, editar ? "Você só pode editar a rotina das suas próprias turmas." : "Sem acesso a esta turma.");
    return null;
  }
  return t;
}

/* ───────────────────────── estado da turma ───────────────────────── */

async function horasSalaDaTurma(t) {
  const [[a]] = await pool.query(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status_execucao,''))) = 'concluida'
                         THEN COALESCE(NULLIF(carga_horaria_real,0), carga_horaria_planejada, 0) ELSE 0 END),0) AS h
       FROM turma_aulas WHERE treinamento_id = ?`,
    [t.id]
  );
  if (Number(a.n)) return Number(a.h);
  const st = chave(t.status);
  if (st.includes("planej") || st.includes("cancel") || st === "agendado") return 0;
  return Number(t.carga_horaria || 0);
}

function diasEntre(ini, fim, limite = 90) {
  const dias = [];
  if (!ini) return dias;
  let d = ini;
  const f = fim || ini;
  while (d <= f && dias.length < limite) {
    dias.push(d);
    d = R.somarDias(d, 1);
  }
  return dias;
}

async function montarEstado(req, t) {
  const avTec = await ehSubtipoAvaliacaoTecnica(t.subtipo);
  const empresaId = t.empresa_id || null;
  const modoEdicao = podeEditarTurma(req, t);
  if (modoEdicao) await R.inicializarTurma(t, avTec);
  else await R.garantirModelos(empresaId);

  const datas = await R.datasDaTurma(t);
  const hoje = R.hojeBR();

  // atividades do catálogo + marcação desta turma
  const cond = empresaId ? "c.empresa_id = ?" : "c.empresa_id IS NULL";
  const [catalogo] = await pool.query(
    `SELECT c.id, c.nome, c.descricao, c.pede_pessoa, c.minutos_padrao, c.tem_prazo_fim_turma, c.ativo, c.sistema,
            (SELECT COUNT(*) FROM rotina_turma_atividades x WHERE x.treinamento_id = ? AND x.catalogo_id = c.id) AS escolhida
       FROM rotina_atividades_catalogo c
      WHERE ${cond} ORDER BY c.nome`,
    [t.id, ...(empresaId ? [empresaId] : [])]
  );
  const atividades = catalogo
    .filter((c) => Number(c.ativo) === 1 || Number(c.escolhida) === 1)
    .map((c) => ({ ...c, escolhida: Number(c.escolhida) === 1 }));

  const [registros] = await pool.query(
    `SELECT r.*, b.titulo AS biblioteca_titulo
       FROM rotina_atividades_registros r
       LEFT JOIN biblioteca b ON b.id = r.biblioteca_id
      WHERE r.treinamento_id = ? ORDER BY r.data_atividade DESC, r.id DESC`,
    [t.id]
  );
  const horasAtiv = registros.reduce((s, r) => s + Number(r.minutos || 0), 0) / 60;
  const horasSala = await horasSalaDaTurma(t);

  // revisão do plano de aula: obrigatória ao concluir a turma
  const revisao = atividades.find((a) => Number(a.tem_prazo_fim_turma) === 1 && a.escolhida);
  let revisaoInfo = null;
  if (revisao) {
    const feita = registros.some((r) => Number(r.catalogo_id) === Number(revisao.id));
    const prazo = datas.fim ? R.somarDias(datas.fim, R.REVISAO_PRAZO_DIAS, true) : null;
    const dias = prazo ? R.diffDias(hoje, prazo) : null;
    let farol = "neutro";
    if (feita) farol = "verde";
    else if (prazo && datas.fim && hoje >= datas.fim) farol = dias > 0 ? "vermelho" : "amarelo";
    revisaoInfo = { catalogo_id: revisao.id, nome: revisao.nome, feita, prazo, farol, dias_atraso: dias > 0 && !feita ? dias : 0 };
  }

  const estado = {
    ok: true,
    modo: avTec ? "avaliacao_tecnica" : "formacao_continuada",
    pode_editar: modoEdicao,
    turma: {
      id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor, subtipo: t.subtipo, status: t.status,
      data_inicio: R.isoDia(datas.inicio), data_fim: R.isoDia(datas.fim),
    },
    hoje,
    horas: {
      sala: Number(horasSala.toFixed(2)),
      atividades: Number(horasAtiv.toFixed(2)),
      total: Number((horasSala + horasAtiv).toFixed(2)),
    },
    atividades,
    registros: registros.map((r) => ({
      id: r.id, catalogo_id: r.catalogo_id, tipo_nome: r.tipo_nome, data_atividade: R.isoDia(r.data_atividade),
      minutos: r.minutos, pessoa_nome: r.pessoa_nome, participante_id: r.participante_id, tema: r.tema,
      observacao: r.observacao, biblioteca_id: r.biblioteca_id, biblioteca_titulo: r.biblioteca_titulo,
      criado_por: r.criado_por,
    })),
    revisao_plano: revisaoInfo,
  };

  // participantes (para atividades que pedem pessoa)
  const [parts] = await pool.query(
    "SELECT id, nome FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome",
    [t.id]
  );
  estado.participantes = parts;

  // ritmo do mês (referência, não meta) para o cliente da turma
  try {
    const ym = hoje.slice(0, 7);
    const [rit] = await pool.query(
      `SELECT LOWER(TRIM(tipo_nome)) AS tipo, COUNT(*) AS qtd FROM rotina_atividades_registros
        WHERE cliente = ? AND DATE_FORMAT(data_atividade,'%Y-%m') = ?${empresaId ? " AND empresa_id = ?" : ""}
        GROUP BY LOWER(TRIM(tipo_nome))`,
      [t.cliente, ym, ...(empresaId ? [empresaId] : [])]
    );
    const mapa = new Map(rit.map((r) => [r.tipo, Number(r.qtd)]));
    estado.ritmo_mes = Object.entries(R.RITMO_REFERENCIA).map(([tipo, ref]) => ({
      tipo: catalogo.find((c) => chave(c.nome) === tipo)?.nome || tipo,
      referencia: ref.texto, qtd_mes: mapa.get(tipo) || 0, cliente: t.cliente,
    }));
  } catch (_) {
    estado.ritmo_mes = [];
  }

  if (avTec) {
    const [chk] = await pool.query(
      "SELECT id, etapa, ordem, texto, resposta, obs, respondido_por, respondido_em FROM rotina_checklist WHERE treinamento_id = ? ORDER BY FIELD(etapa,'vespera','inicio','final'), ordem",
      [t.id]
    );
    estado.checklist = R.ETAPAS.map((etapa) => {
      const itens = chk.filter((c) => c.etapa === etapa);
      return {
        etapa, rotulo: R.ROTULO_ETAPA[etapa], itens,
        respondidos: itens.filter((i) => i.resposta).length, total: itens.length,
      };
    });

    const [tar] = await pool.query(
      "SELECT * FROM rotina_tarefas WHERE treinamento_id = ? ORDER BY ordem",
      [t.id]
    );
    estado.tarefas = tar.map((x) => {
      const prazo = R.prazoDaTarefa(x, datas);
      return {
        id: x.id, item: x.item, o_que_fazer: x.o_que_fazer, ancora: x.ancora, prazo,
        feito: Number(x.feito) === 1, feito_em: x.feito_em, feito_por: x.feito_por,
        ...R.situacaoDaTarefa({ ...x, feito: Number(x.feito) === 1 }, prazo, hoje),
      };
    });

    // diário de bordo: um texto por dia da turma + contagem de presença
    const [diario] = await pool.query(
      "SELECT data_dia, texto, atualizado_por, updated_at FROM rotina_diario WHERE treinamento_id = ?",
      [t.id]
    );
    const dMap = new Map(diario.map((d) => [R.isoDia(d.data_dia), d]));
    let presMap = new Map();
    try {
      const [pres] = await pool.query(
        `SELECT data_aula, status, COUNT(*) AS n FROM presenca_aulas WHERE treinamento_id = ? GROUP BY data_aula, status`,
        [t.id]
      );
      for (const p of pres) {
        const k = R.isoDia(p.data_aula);
        const o = presMap.get(k) || { presentes: 0, ausentes: 0, justificados: 0, pendentes: 0 };
        const s = chave(p.status);
        if (s === "presente") o.presentes += Number(p.n);
        else if (s === "ausente") o.ausentes += Number(p.n);
        else if (s === "justificado") o.justificados += Number(p.n);
        else o.pendentes += Number(p.n);
        presMap.set(k, o);
      }
    } catch (_) {
      presMap = new Map();
    }
    const [aulas] = await pool.query("SELECT DISTINCT data_aula FROM turma_aulas WHERE treinamento_id = ?", [t.id]);
    const diasSet = new Set(aulas.map((a) => R.isoDia(a.data_aula)));
    if (!diasSet.size) diasEntre(datas.inicio, datas.fim).forEach((d) => diasSet.add(d));
    for (const k of dMap.keys()) diasSet.add(k);
    estado.diario = [...diasSet].sort().map((dia) => ({
      data: dia,
      texto: dMap.get(dia)?.texto || "",
      atualizado_por: dMap.get(dia)?.atualizado_por || null,
      atualizado_em: dMap.get(dia)?.updated_at || null,
      presenca: presMap.get(dia) || null,
      futuro: dia > hoje,
    }));

    // célula baby da turma (apenas para o atalho na tela)
    try {
      const [[cb]] = await pool.query("SELECT id, status FROM celulas_baby WHERE treinamento_id = ? LIMIT 1", [t.id]);
      estado.celula_baby = cb ? { id: cb.id, status: cb.status } : null;
    } catch (_) {
      estado.celula_baby = null;
    }
  }
  return estado;
}

async function estadoDaTurma(req, res) {
  try {
    const t = await exigirTurma(req, res);
    if (!t) return;
    return res.json(await montarEstado(req, t));
  } catch (e) {
    console.error("[rotina.estadoDaTurma]", e.message || e);
    return erro(res, 500, "Erro ao carregar a rotina da turma.");
  }
}

/* ───────────────────────── checklist / tarefas / diário ───────────────────────── */

async function responderChecklist(req, res) {
  try {
    const t = await exigirTurma(req, res, { editar: true });
    if (!t) return;
    const itemId = Number(req.params.itemId);
    const resposta = req.body?.resposta === null || req.body?.resposta === "" ? null : chave(req.body?.resposta);
    if (resposta !== null && !RESPOSTAS.includes(resposta)) return erro(res, 400, "Resposta inválida (use Sim, Não ou N/A).");
    const obs = texto(req.body?.obs, 1000);
    const [r] = await pool.query(
      `UPDATE rotina_checklist SET resposta = ?, obs = ?, respondido_por = ?, respondido_em = ${resposta ? "NOW()" : "NULL"}
        WHERE id = ? AND treinamento_id = ?`,
      [resposta, obs, resposta ? req.user?.nome || null : null, itemId, t.id]
    );
    if (!r.affectedRows) return erro(res, 404, "Item não encontrado.");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.responderChecklist]", e.message || e);
    return erro(res, 500, "Erro ao salvar o checklist.");
  }
}

async function marcarTarefa(req, res) {
  try {
    const t = await exigirTurma(req, res, { editar: true });
    if (!t) return;
    const feito = req.body?.feito ? 1 : 0;
    const [r] = await pool.query(
      `UPDATE rotina_tarefas SET feito = ?, feito_em = ${feito ? "NOW()" : "NULL"}, feito_por = ? WHERE id = ? AND treinamento_id = ?`,
      [feito, feito ? req.user?.nome || null : null, Number(req.params.tarefaId), t.id]
    );
    if (!r.affectedRows) return erro(res, 404, "Responsabilidade não encontrada.");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.marcarTarefa]", e.message || e);
    return erro(res, 500, "Erro ao salvar a responsabilidade.");
  }
}

async function salvarDiario(req, res) {
  try {
    const t = await exigirTurma(req, res, { editar: true });
    if (!t) return;
    const dia = String(req.params.data || "");
    if (!dataValida(dia)) return erro(res, 400, "Data inválida.");
    if (dia > R.hojeBR()) return erro(res, 400, "Não é possível preencher o diário de um dia futuro.");
    const conteudo = texto(req.body?.texto, 8000);
    await pool.query(
      `INSERT INTO rotina_diario (empresa_id, treinamento_id, data_dia, texto, atualizado_por)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE texto = VALUES(texto), atualizado_por = VALUES(atualizado_por)`,
      [t.empresa_id || null, t.id, dia, conteudo, req.user?.nome || null]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.salvarDiario]", e.message || e);
    return erro(res, 500, "Erro ao salvar o diário de bordo.");
  }
}

/* ───────────────────────── atividades da turma ───────────────────────── */

async function escolherAtividades(req, res) {
  try {
    const t = await exigirTurma(req, res, { editar: true });
    if (!t) return;
    const ids = Array.isArray(req.body?.catalogo_ids) ? [...new Set(req.body.catalogo_ids.map(Number).filter((n) => n > 0))] : null;
    if (!ids) return erro(res, 400, "Envie a lista de atividades.");
    const avTec = await ehSubtipoAvaliacaoTecnica(t.subtipo);
    await R.inicializarTurma(t, avTec);
    const empresaId = t.empresa_id || null;
    const [validas] = await pool.query(
      `SELECT id, tem_prazo_fim_turma, ativo FROM rotina_atividades_catalogo WHERE ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"}`,
      empresaId ? [empresaId] : []
    );
    const validasMap = new Map(validas.map((v) => [v.id, v]));
    const final = ids.filter((id) => validasMap.has(id));
    // A revisão do plano de aula é obrigatória: não sai da turma.
    for (const v of validas) {
      if (Number(v.tem_prazo_fim_turma) === 1 && Number(v.ativo) === 1 && !final.includes(v.id)) final.push(v.id);
    }
    // Não deixa tirar uma atividade que já tem registro nesta turma.
    const [usadas] = await pool.query(
      "SELECT DISTINCT catalogo_id FROM rotina_atividades_registros WHERE treinamento_id = ? AND catalogo_id IS NOT NULL",
      [t.id]
    );
    for (const u of usadas) if (!final.includes(u.catalogo_id)) final.push(u.catalogo_id);

    await pool.query("DELETE FROM rotina_turma_atividades WHERE treinamento_id = ? AND catalogo_id <> 0", [t.id]);
    for (const id of final) {
      await pool.query("INSERT IGNORE INTO rotina_turma_atividades (treinamento_id, catalogo_id) VALUES (?,?)", [t.id, id]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.escolherAtividades]", e.message || e);
    return erro(res, 500, "Erro ao salvar as atividades da turma.");
  }
}

/* ───────────────────────── registros de atividade ───────────────────────── */

function lerRegistro(body) {
  const minutos = Number(body?.minutos);
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 720) {
    return { erro: "Informe a duração em minutos (de 1 a 720). Toda atividade precisa de duração para contar na CH." };
  }
  const data = String(body?.data_atividade || "");
  if (!dataValida(data)) return { erro: "Informe a data da atividade." };
  if (data > R.somarDias(R.hojeBR(), 1)) return { erro: "A data da atividade não pode ser futura." };
  return {
    minutos, data,
    pessoa_nome: texto(body?.pessoa_nome, 200),
    participante_id: Number(body?.participante_id) > 0 ? Number(body.participante_id) : null,
    tema: texto(body?.tema, 300),
    observacao: texto(body?.observacao, 3000),
    biblioteca_id: Number(body?.biblioteca_id) > 0 ? Number(body.biblioteca_id) : null,
  };
}

async function validarComum(req, res, dados, catalogoId, empresaId) {
  const [[cat]] = await pool.query(
    `SELECT * FROM rotina_atividades_catalogo WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [catalogoId, empresaId] : [catalogoId]
  );
  if (!cat) {
    erro(res, 400, "Tipo de atividade não encontrado no catálogo.");
    return null;
  }
  if (dados.biblioteca_id) {
    const [[b]] = await pool.query(
      `SELECT id FROM biblioteca WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
      empresaId ? [dados.biblioteca_id, empresaId] : [dados.biblioteca_id]
    );
    if (!b) {
      erro(res, 400, "Material da Biblioteca não encontrado.");
      return null;
    }
  }
  return cat;
}

async function criarRegistro(req, res) {
  try {
    const dados = lerRegistro(req.body);
    if (dados.erro) return erro(res, 400, dados.erro);
    const catalogoId = Number(req.body?.catalogo_id);
    if (!catalogoId) return erro(res, 400, "Escolha o tipo de atividade.");

    let t = null;
    let instrutor;
    let cliente = texto(req.body?.cliente, 150);
    let empresaId;
    if (req.body?.treinamento_id) {
      req.params.id = req.body.treinamento_id;
      t = await exigirTurma(req, res, { editar: true });
      if (!t) return;
      instrutor = texto(t.instrutor, 150);
      if (!instrutor) return erro(res, 400, "A turma não tem instrutor definido; defina o instrutor antes de registrar atividades.");
      cliente = texto(t.cliente, 150);
      empresaId = t.empresa_id || null;
    } else {
      // atividade avulsa: do próprio instrutor (ou, pela coordenação, de um instrutor informado)
      empresaId = escopo(req) || null;
      if (perfilDe(req) === "instrutor") instrutor = texto(req.user?.nome, 150);
      else if (ehGestao(req)) instrutor = texto(req.body?.instrutor, 150);
      else return erro(res, 403, "Sem permissão para registrar atividades.");
      if (!instrutor) return erro(res, 400, "Informe o instrutor da atividade.");
    }

    const cat = await validarComum(req, res, dados, catalogoId, empresaId);
    if (!cat) return;
    if (Number(cat.ativo) !== 1) return erro(res, 400, "Este tipo de atividade está desativado.");

    if (t && dados.participante_id) {
      const [[p]] = await pool.query(
        "SELECT id, nome FROM treinamento_participantes WHERE id = ? AND treinamento_id = ?",
        [dados.participante_id, t.id]
      );
      if (!p) return erro(res, 400, "Pessoa não pertence a esta turma.");
      dados.pessoa_nome = p.nome;
    }

    // Registro + marcação do tipo na turma: juntos ou nenhum (21/10/2026).
    const novoId = await comTransacao(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO rotina_atividades_registros
           (empresa_id, treinamento_id, catalogo_id, tipo_nome, data_atividade, minutos, instrutor, cliente,
            participante_id, pessoa_nome, tema, observacao, biblioteca_id, necessidade_id, criado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [empresaId, t ? t.id : null, cat.id, cat.nome, dados.data, dados.minutos, instrutor, cliente,
         dados.participante_id, dados.pessoa_nome, dados.tema, dados.observacao, dados.biblioteca_id,
         t?.necessidade_id || null, req.user?.nome || null]
      );
      if (t) {
        // garante que o tipo usado fique marcado na turma
        await conn.query("INSERT IGNORE INTO rotina_turma_atividades (treinamento_id, catalogo_id) VALUES (?,?)", [t.id, cat.id]);
      }
      return r.insertId;
    });
    return res.status(201).json({ ok: true, id: novoId });
  } catch (e) {
    console.error("[rotina.criarRegistro]", e.message || e);
    return erro(res, 500, "Erro ao registrar a atividade.");
  }
}

async function carregarRegistro(req, res) {
  const empresaId = escopo(req);
  const [rows] = await pool.query(
    `SELECT * FROM rotina_atividades_registros WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [Number(req.params.id), empresaId] : [Number(req.params.id)]
  );
  const r = rows[0];
  if (!r) {
    erro(res, 404, "Registro não encontrado.");
    return null;
  }
  const dono = perfilDe(req) === "instrutor" && chave(r.instrutor) === chave(req.user?.nome);
  if (!ehGestao(req) && !dono) {
    erro(res, 403, "Você só pode alterar as suas próprias atividades.");
    return null;
  }
  return r;
}

async function editarRegistro(req, res) {
  try {
    const r = await carregarRegistro(req, res);
    if (!r) return;
    const dados = lerRegistro(req.body);
    if (dados.erro) return erro(res, 400, dados.erro);
    if (dados.biblioteca_id) {
      const empresaId = r.empresa_id || null;
      const [[b]] = await pool.query(
        `SELECT id FROM biblioteca WHERE id = ?${empresaId ? " AND empresa_id = ?" : ""} LIMIT 1`,
        empresaId ? [dados.biblioteca_id, empresaId] : [dados.biblioteca_id]
      );
      if (!b) return erro(res, 400, "Material da Biblioteca não encontrado.");
    }
    let pessoa = dados.pessoa_nome;
    let pid = dados.participante_id;
    if (r.treinamento_id && pid) {
      const [[p]] = await pool.query(
        "SELECT nome FROM treinamento_participantes WHERE id = ? AND treinamento_id = ?",
        [pid, r.treinamento_id]
      );
      if (!p) return erro(res, 400, "Pessoa não pertence a esta turma.");
      pessoa = p.nome;
    }
    await pool.query(
      `UPDATE rotina_atividades_registros
          SET data_atividade = ?, minutos = ?, participante_id = ?, pessoa_nome = ?, tema = ?, observacao = ?, biblioteca_id = ?
        WHERE id = ?`,
      [dados.data, dados.minutos, pid, pessoa, dados.tema, dados.observacao, dados.biblioteca_id, r.id]
    );
    if (Number(r.minutos) !== dados.minutos) {
      registrarAuditoria({
        usuario: req.user, acao: "editar", entidade: "rotina_atividade", entidadeId: r.id,
        resumo: `${req.user?.nome || "Alguém"} alterou a duração da atividade "${r.tipo_nome}" de ${r.instrutor}: ${r.minutos} → ${dados.minutos} min`,
        dadosAntes: { minutos: r.minutos }, dadosDepois: { minutos: dados.minutos }, ip: req.ip,
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.editarRegistro]", e.message || e);
    return erro(res, 500, "Erro ao editar a atividade.");
  }
}

async function excluirRegistro(req, res) {
  try {
    const r = await carregarRegistro(req, res);
    if (!r) return;
    await pool.query("DELETE FROM rotina_atividades_registros WHERE id = ?", [r.id]);
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "rotina_atividade", entidadeId: r.id,
      resumo: `${req.user?.nome || "Alguém"} excluiu a atividade "${r.tipo_nome}" de ${r.instrutor} (${r.minutos} min, ${R.isoDia(r.data_atividade)})`,
      dadosAntes: { tipo: r.tipo_nome, minutos: r.minutos, data: R.isoDia(r.data_atividade) }, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.excluirRegistro]", e.message || e);
    return erro(res, 500, "Erro ao excluir a atividade.");
  }
}

/* ───────────────────────── Minhas atividades ───────────────────────── */

function mesDe(req) {
  const m = String(req.query.mes || "");
  return /^\d{4}-\d{2}$/.test(m) ? m : R.hojeBR().slice(0, 7);
}

async function listarMinhas(req, res) {
  try {
    const empresaId = escopo(req);
    const mes = mesDe(req);
    const where = ["DATE_FORMAT(r.data_atividade,'%Y-%m') = ?"];
    const params = [mes];
    if (empresaId) {
      where.push("r.empresa_id = ?");
      params.push(empresaId);
    }
    let instrutorSel;
    if (perfilDe(req) === "instrutor") {
      instrutorSel = req.user?.nome;
      where.push("LOWER(TRIM(r.instrutor)) = ?");
      params.push(chave(instrutorSel));
    } else if (ehGestao(req)) {
      if (req.query.instrutor) {
        instrutorSel = String(req.query.instrutor);
        where.push("LOWER(TRIM(r.instrutor)) = ?");
        params.push(chave(instrutorSel));
      }
    } else {
      return erro(res, 403, "Sem permissão.");
    }
    const [rows] = await pool.query(
      `SELECT r.*, t.tema AS turma_tema, b.titulo AS biblioteca_titulo
         FROM rotina_atividades_registros r
         LEFT JOIN treinamentos t ON t.id = r.treinamento_id
         LEFT JOIN biblioteca b ON b.id = r.biblioteca_id
        WHERE ${where.join(" AND ")} ORDER BY r.data_atividade DESC, r.id DESC`,
      params
    );
    const porTipo = new Map();
    for (const r of rows) {
      const o = porTipo.get(r.tipo_nome) || { tipo: r.tipo_nome, qtd: 0, minutos: 0 };
      o.qtd += 1;
      o.minutos += Number(r.minutos);
      porTipo.set(r.tipo_nome, o);
    }
    const [catalogo] = await pool.query(
      `SELECT id, nome, descricao, pede_pessoa, minutos_padrao FROM rotina_atividades_catalogo
        WHERE ativo = 1 AND ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"} ORDER BY nome`,
      empresaId ? [empresaId] : []
    );
    return res.json({
      ok: true, mes, instrutor: instrutorSel || null, pode_registrar: perfilDe(req) === "instrutor" || ehGestao(req),
      total_minutos: rows.reduce((s, r) => s + Number(r.minutos), 0),
      por_tipo: [...porTipo.values()].sort((a, b) => b.minutos - a.minutos),
      catalogo,
      registros: rows.map((r) => ({
        id: r.id, treinamento_id: r.treinamento_id, turma_tema: r.turma_tema, catalogo_id: r.catalogo_id,
        tipo_nome: r.tipo_nome, data_atividade: R.isoDia(r.data_atividade), minutos: r.minutos, instrutor: r.instrutor,
        cliente: r.cliente, pessoa_nome: r.pessoa_nome, tema: r.tema, observacao: r.observacao,
        biblioteca_id: r.biblioteca_id, biblioteca_titulo: r.biblioteca_titulo,
      })),
    });
  } catch (e) {
    console.error("[rotina.listarMinhas]", e.message || e);
    return erro(res, 500, "Erro ao listar as atividades.");
  }
}

async function exportarRegistros(req, res) {
  try {
    const empresaId = escopo(req);
    const mes = mesDe(req);
    const where = ["DATE_FORMAT(r.data_atividade,'%Y-%m') = ?"];
    const params = [mes];
    if (empresaId) {
      where.push("r.empresa_id = ?");
      params.push(empresaId);
    }
    if (perfilDe(req) === "instrutor") {
      where.push("LOWER(TRIM(r.instrutor)) = ?");
      params.push(chave(req.user?.nome));
    } else if (!ehGestao(req)) {
      return erro(res, 403, "Sem permissão.");
    }
    const [rows] = await pool.query(
      `SELECT r.*, t.tema AS turma_tema FROM rotina_atividades_registros r
         LEFT JOIN treinamentos t ON t.id = r.treinamento_id
        WHERE ${where.join(" AND ")} ORDER BY r.instrutor, r.data_atividade, r.id`,
      params
    );
    const XL = require("../lib/excelExport");
    const wb = XL.novoWorkbook();
    XL.adicionarTabela(wb, {
      nomeAba: `Atividades ${mes}`,
      colunas: [
        { titulo: "Data", chave: "data", formato: "data", largura: 12 },
        { titulo: "Instrutor", chave: "instrutor", largura: 26 },
        { titulo: "Atividade", chave: "tipo", largura: 28 },
        { titulo: "Turma", chave: "turma", largura: 32 },
        { titulo: "Cliente", chave: "cliente", largura: 22 },
        { titulo: "Minutos", chave: "minutos", formato: "inteiro", largura: 10 },
        { titulo: "Horas", chave: "horas", formato: "decimal1", largura: 9 },
        { titulo: "Pessoa", chave: "pessoa", largura: 26 },
        { titulo: "Tema", chave: "tema", largura: 30 },
        { titulo: "Observação", chave: "obs", largura: 40 },
      ],
      linhas: rows.map((r) => ({
        data: r.data_atividade, instrutor: r.instrutor, tipo: r.tipo_nome, turma: r.turma_tema || "(avulsa)",
        cliente: r.cliente, minutos: r.minutos, horas: Number(r.minutos) / 60, pessoa: r.pessoa_nome, tema: r.tema, obs: r.observacao,
      })),
      linhaTotal: { tipo: "Total", minutos: rows.reduce((s, r) => s + Number(r.minutos), 0), horas: rows.reduce((s, r) => s + Number(r.minutos), 0) / 60 },
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="atividades-instrutor-${mes}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[rotina.exportarRegistros]", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao exportar.");
  }
}

/* ───────────────────────── catálogo (admin) ───────────────────────── */

async function listarCatalogo(req, res) {
  try {
    const empresaId = escopo(req);
    await R.garantirModelos(empresaId || null);
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM rotina_atividades_registros r WHERE r.catalogo_id = c.id) AS registros_em_uso,
              (SELECT COUNT(*) FROM rotina_turma_atividades x WHERE x.catalogo_id = c.id) AS turmas_em_uso
         FROM rotina_atividades_catalogo c WHERE ${empresaId ? "c.empresa_id = ?" : "c.empresa_id IS NULL"} ORDER BY c.nome`,
      empresaId ? [empresaId] : []
    );
    return res.json({ ok: true, itens: rows, pode_editar: ehGestao(req) });
  } catch (e) {
    console.error("[rotina.listarCatalogo]", e.message || e);
    return erro(res, 500, "Erro ao listar o catálogo.");
  }
}

function lerCatalogo(body) {
  const nome = texto(body?.nome, 120);
  if (!nome) return { erro: "Informe o nome da atividade." };
  const minutos = body?.minutos_padrao === null || body?.minutos_padrao === "" || body?.minutos_padrao === undefined
    ? null : Number(body.minutos_padrao);
  if (minutos !== null && (!Number.isInteger(minutos) || minutos < 1 || minutos > 720)) return { erro: "Duração padrão inválida (1 a 720 minutos)." };
  return {
    nome, descricao: texto(body?.descricao, 1000), minutos_padrao: minutos,
    pede_pessoa: body?.pede_pessoa ? 1 : 0,
  };
}

async function criarCatalogo(req, res) {
  try {
    if (!ehGestao(req) && perfilDe(req) !== "instrutor") return erro(res, 403, "Sem permissão.");
    const d = lerCatalogo(req.body);
    if (d.erro) return erro(res, 400, d.erro);
    const empresaId = escopo(req) || null;
    const [dup] = await pool.query(
      `SELECT id FROM rotina_atividades_catalogo WHERE LOWER(TRIM(nome)) = ? AND ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"} LIMIT 1`,
      empresaId ? [chave(d.nome), empresaId] : [chave(d.nome)]
    );
    if (dup.length) return erro(res, 409, "Já existe uma atividade com esse nome.");
    const [r] = await pool.query(
      `INSERT INTO rotina_atividades_catalogo (empresa_id, nome, descricao, pede_pessoa, minutos_padrao, marcada_padrao, marcada_padrao_avtec, criado_por)
       VALUES (?,?,?,?,?,?,?,?)`,
      [empresaId, d.nome, d.descricao, d.pede_pessoa, d.minutos_padrao,
       ehGestao(req) && req.body?.marcada_padrao ? 1 : 0, ehGestao(req) && req.body?.marcada_padrao_avtec ? 1 : 0, req.user?.nome || null]
    );
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "rotina_catalogo", entidadeId: r.insertId,
      resumo: `${req.user?.nome || "Alguém"} criou a atividade "${d.nome}" no catálogo da Rotina do instrutor`, ip: req.ip,
    });
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    console.error("[rotina.criarCatalogo]", e.message || e);
    return erro(res, 500, "Erro ao criar a atividade.");
  }
}

async function editarCatalogo(req, res) {
  try {
    const empresaId = escopo(req) || null;
    const id = Number(req.params.id);
    const [[atual]] = await pool.query(
      `SELECT * FROM rotina_atividades_catalogo WHERE id = ? AND ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"}`,
      empresaId ? [id, empresaId] : [id]
    );
    if (!atual) return erro(res, 404, "Atividade não encontrada.");
    const d = lerCatalogo(req.body);
    if (d.erro) return erro(res, 400, d.erro);
    const [dup] = await pool.query(
      `SELECT id FROM rotina_atividades_catalogo WHERE LOWER(TRIM(nome)) = ? AND id <> ? AND ${empresaId ? "empresa_id = ?" : "empresa_id IS NULL"} LIMIT 1`,
      empresaId ? [chave(d.nome), id, empresaId] : [chave(d.nome), id]
    );
    if (dup.length) return erro(res, 409, "Já existe uma atividade com esse nome.");
    // Revisão do plano e atividades de sistema: não podem ser desativadas.
    const ativo = req.body?.ativo === undefined ? Number(atual.ativo) : req.body.ativo ? 1 : 0;
    if (!ativo && (Number(atual.tem_prazo_fim_turma) === 1 || Number(atual.sistema) === 1)) {
      return erro(res, 400, "Esta atividade faz parte do sistema e não pode ser desativada.");
    }
    const marcadaPadrao = req.body?.marcada_padrao === undefined ? Number(atual.marcada_padrao) : req.body.marcada_padrao ? 1 : 0;
    const marcadaAv = req.body?.marcada_padrao_avtec === undefined ? Number(atual.marcada_padrao_avtec) : req.body.marcada_padrao_avtec ? 1 : 0;
    await comTransacao(async (conn) => {
      await conn.query(
        `UPDATE rotina_atividades_catalogo
            SET nome = ?, descricao = ?, pede_pessoa = ?, minutos_padrao = ?, ativo = ?, marcada_padrao = ?, marcada_padrao_avtec = ?
          WHERE id = ?`,
        [d.nome, d.descricao, d.pede_pessoa, d.minutos_padrao, ativo, marcadaPadrao, marcadaAv, id]
      );
      if (d.nome !== atual.nome) {
        // o nome denormalizado nos registros acompanha o catálogo
        await conn.query("UPDATE rotina_atividades_registros SET tipo_nome = ? WHERE catalogo_id = ?", [d.nome, id]);
      }
    });
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "rotina_catalogo", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} alterou a atividade "${atual.nome}" do catálogo da Rotina do instrutor`,
      dadosAntes: { nome: atual.nome, ativo: atual.ativo }, dadosDepois: { nome: d.nome, ativo }, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.editarCatalogo]", e.message || e);
    return erro(res, 500, "Erro ao editar a atividade.");
  }
}

/* ───────────────────────── modelos (checklist / responsabilidades) ───────────────────────── */

async function obterModelos(req, res) {
  try {
    const empresaId = escopo(req) || null;
    await R.garantirModelos(empresaId);
    const cond = empresaId ? "empresa_id = ?" : "empresa_id IS NULL";
    const p = empresaId ? [empresaId] : [];
    const [checklist] = await pool.query(
      `SELECT id, etapa, ordem, texto FROM rotina_modelo_checklist WHERE ${cond} AND ativo = 1 ORDER BY FIELD(etapa,'vespera','inicio','final'), ordem, id`, p
    );
    const [tarefas] = await pool.query(
      `SELECT id, ordem, item, o_que_fazer, ancora, offset_dias, dias_uteis FROM rotina_modelo_tarefas WHERE ${cond} AND ativo = 1 ORDER BY ordem, id`, p
    );
    return res.json({ ok: true, checklist, tarefas, etapas: R.ETAPAS.map((e) => ({ etapa: e, rotulo: R.ROTULO_ETAPA[e] })) });
  } catch (e) {
    console.error("[rotina.obterModelos]", e.message || e);
    return erro(res, 500, "Erro ao carregar os modelos.");
  }
}

async function salvarModelos(req, res) {
  const conn = await pool.getConnection();
  try {
    const empresaId = escopo(req) || null;
    const cl = Array.isArray(req.body?.checklist) ? req.body.checklist : null;
    const tf = Array.isArray(req.body?.tarefas) ? req.body.tarefas : null;
    if (!cl || !tf) return erro(res, 400, "Envie o checklist e as responsabilidades.");
    const checklist = [];
    for (const it of cl) {
      const etapa = chave(it?.etapa);
      const tx = texto(it?.texto, 500);
      if (!R.ETAPAS.includes(etapa) || !tx) return erro(res, 400, "Há item de checklist sem texto ou com etapa inválida.");
      checklist.push({ etapa, texto: tx });
    }
    const tarefas = [];
    for (const it of tf) {
      const item = texto(it?.item, 200);
      const ancora = chave(it?.ancora);
      const off = Number(it?.offset_dias || 0);
      if (!item || !ANCORAS.includes(ancora) || !Number.isInteger(off) || Math.abs(off) > 60) {
        return erro(res, 400, "Há responsabilidade sem nome ou com prazo inválido.");
      }
      tarefas.push({ item, o_que_fazer: texto(it?.o_que_fazer, 600), ancora, offset_dias: ancora === "continuo" ? 0 : off, dias_uteis: it?.dias_uteis ? 1 : 0 });
    }
    if (!checklist.length || !tarefas.length) return erro(res, 400, "O modelo não pode ficar vazio.");

    await conn.beginTransaction();
    const cond = empresaId ? "empresa_id = ?" : "empresa_id IS NULL";
    const p = empresaId ? [empresaId] : [];
    await conn.query(`DELETE FROM rotina_modelo_checklist WHERE ${cond}`, p);
    await conn.query(`DELETE FROM rotina_modelo_tarefas WHERE ${cond}`, p);
    const ordemEtapa = {};
    for (const it of checklist) {
      const o = ordemEtapa[it.etapa] || 0;
      ordemEtapa[it.etapa] = o + 1;
      await conn.query("INSERT INTO rotina_modelo_checklist (empresa_id, etapa, ordem, texto) VALUES (?,?,?,?)", [empresaId, it.etapa, o, it.texto]);
    }
    let ordem = 0;
    for (const it of tarefas) {
      await conn.query(
        "INSERT INTO rotina_modelo_tarefas (empresa_id, ordem, item, o_que_fazer, ancora, offset_dias, dias_uteis) VALUES (?,?,?,?,?,?,?)",
        [empresaId, ordem++, it.item, it.o_que_fazer, it.ancora, it.offset_dias, it.dias_uteis]
      );
    }
    await conn.commit();
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "rotina_modelo", entidadeId: empresaId,
      resumo: `${req.user?.nome || "Alguém"} atualizou o modelo de checklist/responsabilidades da Rotina do instrutor (${checklist.length} itens, ${tarefas.length} responsabilidades). Turmas já abertas não mudam.`,
      ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    console.error("[rotina.salvarModelos]", e.message || e);
    return erro(res, 500, "Erro ao salvar os modelos.");
  } finally {
    conn.release();
  }
}

/* ───────────────────────── avaliação individual (Fase 2) ───────────────────────── */

async function turmaDeAvTec(req, res, { editar = false } = {}) {
  const t = await exigirTurma(req, res, { editar });
  if (!t) return null;
  if (!(await ehSubtipoAvaliacaoTecnica(t.subtipo))) {
    erro(res, 404, "A avaliação individual existe só em turmas de Avaliação Técnica.");
    return null;
  }
  return t;
}

async function carregarAvaliacao(t) {
  const [rows] = await pool.query(
    `SELECT p.id AS participante_id, p.nome, p.matricula, p.pessoa_id,
            a.nota_pontualidade, a.nota_interesse, a.nota_comportamento, a.nota_quiz, a.nota_avaliacao_final,
            a.media, a.resultado, a.observacao, a.atualizado_por, a.updated_at
       FROM treinamento_participantes p
       LEFT JOIN rotina_avaliacao_individual a ON a.treinamento_id = p.treinamento_id AND a.participante_id = p.id
      WHERE p.treinamento_id = ? ORDER BY p.nome`,
    [t.id]
  );
  const [regRows] = await pool.query("SELECT registrada_por, registrada_em FROM rotina_avaliacao_registro WHERE treinamento_id = ?", [t.id]);
  const registro = regRows[0] || null;
  // Provas em papel já confirmadas: aparecem como referência ao lado das notas
  // (não preenchem nada sozinhas — a escala daqui é 5–10).
  const papel = new Map();
  try {
    const [pp] = await pool.query(
      `SELECT r.participante_id, l.titulo, l.id AS lote_id, r.nota_10
         FROM prova_papel_resultados r
         JOIN prova_papel_lotes l ON l.id = r.lote_id
        WHERE l.treinamento_id = ? AND l.status = 'confirmado' AND r.faltou = 0 AND r.nota_10 IS NOT NULL
        ORDER BY l.id`,
      [t.id]
    );
    pp.forEach((x) => {
      const lista = papel.get(Number(x.participante_id)) || [];
      lista.push({ titulo: x.titulo, nota: Number(x.nota_10) });
      papel.set(Number(x.participante_id), lista);
    });
  } catch (_) { /* tabela ainda não existe: segue sem a referência */ }
  return { rows, registro, papel };
}

function linhaParaApi(r) {
  const notas = {};
  AV.CRITERIOS.forEach((c) => { notas[c.chave] = r[c.coluna] === null || r[c.coluna] === undefined ? null : Number(r[c.coluna]); });
  return {
    participante_id: r.participante_id, nome: r.nome, matricula: r.matricula, notas,
    media: r.media === null || r.media === undefined ? null : Number(r.media),
    resultado: r.resultado || null, observacao: r.observacao || "", atualizado_por: r.atualizado_por || null,
  };
}

async function obterAvaliacao(req, res) {
  try {
    const t = await turmaDeAvTec(req, res);
    if (!t) return;
    const { rows, registro, papel } = await carregarAvaliacao(t);
    const linhas = rows.map((r) => ({ ...linhaParaApi(r), provas_papel: papel.get(Number(r.participante_id)) || [] }));
    const cont = { passou: 0, em_berco: 0, nao_seguiu: 0, sem_resultado: 0 };
    linhas.forEach((l) => { if (l.resultado) cont[l.resultado] += 1; else cont.sem_resultado += 1; });
    const sit = await AV.situacaoNaCelula(t.id, 0);
    const podeEditarTurma_ = podeEditarTurma(req, t);
    return res.json({
      ok: true,
      turma: { id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor },
      criterios: AV.CRITERIOS.map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
      nota_min: AV.NOTA_MIN, nota_max: AV.NOTA_MAX, media_minima: AV.MEDIA_MINIMA,
      linhas, contagem: cont,
      registro: registro ? { registrada_por: registro.registrada_por, registrada_em: registro.registrada_em } : null,
      celula: sit.celula ? { id: sit.celula.id, status: sit.celula.status } : null,
      pode_editar: podeEditarTurma_ && (!registro || ehGestao(req)),
      pode_reabrir: ehGestao(req) && !!registro,
      so_leitura_motivo: !podeEditarTurma_ ? "perfil" : registro && !ehGestao(req) ? "registrada" : null,
    });
  } catch (e) {
    console.error("[rotina.obterAvaliacao]", e.message || e);
    return erro(res, 500, "Erro ao carregar a avaliação individual.");
  }
}

async function salvarAvaliacao(req, res) {
  try {
    const t = await turmaDeAvTec(req, res, { editar: true });
    if (!t) return;
    const registrar = !!req.body?.registrar;
    const entrada = Array.isArray(req.body?.linhas) ? req.body.linhas : [];

    const { rows, registro } = await carregarAvaliacao(t);
    if (registro && !ehGestao(req)) {
      return erro(res, 403, "A avaliação já foi registrada. Peça à coordenação para reabrir.");
    }
    const atuais = new Map(rows.map((r) => [Number(r.participante_id), linhaParaApi(r)]));
    const dados = new Map(rows.map((r) => [Number(r.participante_id), r]));

    // 1) valida e mescla o que chegou com o que já está salvo
    const finais = new Map([...atuais].map(([k, v]) => [k, { ...v, notas: { ...v.notas } }]));
    const alteradas = [];
    for (const l of entrada) {
      const pid = Number(l?.participante_id);
      if (!atuais.has(pid)) return erro(res, 400, "Há candidato que não pertence a esta turma.");
      const alvo = finais.get(pid);
      for (const c of AV.CRITERIOS) {
        if (l.notas && l.notas[c.chave] !== undefined) {
          const n = l.notas[c.chave] === null || l.notas[c.chave] === "" ? null : Number(l.notas[c.chave]);
          if (!AV.notaValida(n)) return erro(res, 400, `Nota inválida em ${c.rotulo}: use números inteiros de ${AV.NOTA_MIN} a ${AV.NOTA_MAX}.`);
          alvo.notas[c.chave] = n;
        }
      }
      if (l.resultado !== undefined) {
        const r = l.resultado === null || l.resultado === "" ? null : String(l.resultado);
        if (r !== null && !AV.RESULTADOS.includes(r)) return erro(res, 400, "Resultado inválido.");
        alvo.resultado = r;
      }
      if (l.observacao !== undefined) alvo.observacao = String(l.observacao || "").trim().slice(0, 1000);
      alvo.media = AV.calcularMedia(alvo.notas);
      alteradas.push(pid);
    }

    // 2) para registrar, tudo precisa estar completo
    if (registrar) {
      if (!finais.size) return erro(res, 400, "Esta turma não tem candidatos para avaliar.");
      const faltas = [];
      for (const l of finais.values()) {
        if (l.media === null) faltas.push(`${l.nome} (faltam notas)`);
        else if (!l.resultado) faltas.push(`${l.nome} (falta o resultado)`);
        else if (l.media < AV.MEDIA_MINIMA && !l.observacao) faltas.push(`${l.nome} (média abaixo de ${AV.MEDIA_MINIMA} pede observação)`);
      }
      if (faltas.length) {
        return erro(res, 400, `Para registrar, complete: ${faltas.slice(0, 5).join("; ")}${faltas.length > 5 ? ` e mais ${faltas.length - 5}` : ""}.`);
      }
    }

    // 3) regras da célula baby para quem mudou de resultado
    const mudancas = [];
    for (const pid of alteradas) {
      const antes = atuais.get(pid).resultado;
      const depois = finais.get(pid).resultado;
      if (antes === depois) continue;
      const sit = await AV.situacaoNaCelula(t.id, pid);
      if (sit.celula && sit.celula.status !== "a_configurar" && !ehGestao(req)) {
        return erro(res, 403, "A célula baby já foi iniciada: só a coordenação altera o resultado.");
      }
      if (sit.pessoa && sit.pessoa.resultado === "passou" && depois !== "passou" && sit.lancamentos > 0) {
        return erro(res, 409, `${finais.get(pid).nome} já tem lançamentos na célula baby. Apague os lançamentos antes de mudar o resultado.`);
      }
      mudancas.push({ pid, antes, depois, travada: !!(sit.celula && sit.celula.status !== "a_configurar") });
    }

    // 4) grava — notas de todos + registro da avaliação numa transação só (21/10/2026)
    await comTransacao(async (conn) => {
      for (const pid of alteradas) {
        const l = finais.get(pid);
        await conn.query(
          `INSERT INTO rotina_avaliacao_individual
             (empresa_id, treinamento_id, participante_id, nota_pontualidade, nota_interesse, nota_comportamento, nota_quiz,
              nota_avaliacao_final, media, resultado, observacao, atualizado_por)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE nota_pontualidade = VALUES(nota_pontualidade), nota_interesse = VALUES(nota_interesse),
             nota_comportamento = VALUES(nota_comportamento), nota_quiz = VALUES(nota_quiz),
             nota_avaliacao_final = VALUES(nota_avaliacao_final), media = VALUES(media), resultado = VALUES(resultado),
             observacao = VALUES(observacao), atualizado_por = VALUES(atualizado_por)`,
          [t.empresa_id || null, t.id, pid, l.notas.pontualidade, l.notas.interesse, l.notas.comportamento, l.notas.quiz,
           l.notas.avaliacao_final, l.media, l.resultado, l.observacao || null, req.user?.nome || null]
        );
      }
      if (registrar) {
        await conn.query(
          `INSERT INTO rotina_avaliacao_registro (treinamento_id, empresa_id, registrada_por, registrada_em) VALUES (?,?,?, NOW())
           ON DUPLICATE KEY UPDATE registrada_por = VALUES(registrada_por), registrada_em = NOW()`,
          [t.id, t.empresa_id || null, req.user?.nome || null]
        );
      }
    });

    // Depois de registrada, qualquer mudança de nota/observação também fica na Auditoria.
    if (registro) {
      for (const pid of alteradas) {
        const a = atuais.get(pid);
        const f = finais.get(pid);
        const mudouNota = AV.CRITERIOS.some((c) => (a.notas[c.chave] ?? null) !== (f.notas[c.chave] ?? null));
        const mudouObs = (a.observacao || "") !== (f.observacao || "");
        const mudouResultado = a.resultado !== f.resultado;
        // a mudança de resultado já é auditada no passo 5
        if ((mudouNota || mudouObs) && !mudouResultado) {
          registrarAuditoria({
            usuario: req.user, acao: "editar", entidade: "rotina_avaliacao", entidadeId: t.id,
            resumo: `${req.user?.nome || "Alguém"} alterou notas/observação de ${f.nome} na avaliação individual já registrada da turma ${t.tema}`,
            dadosAntes: { notas: a.notas, media: a.media, observacao: a.observacao || null },
            dadosDepois: { notas: f.notas, media: f.media, observacao: f.observacao || null }, ip: req.ip,
          });
        }
      }
    }

    // 5) célula baby lê o resultado
    let naCelula = 0;
    for (const m of mudancas) {
      const [[p]] = await pool.query("SELECT id, nome, matricula, pessoa_id FROM treinamento_participantes WHERE id = ?", [m.pid]);
      if (p && (await AV.aplicarResultadoNaCelula(t, p, m.depois))) naCelula += 1;
      if (m.travada || registro) {
        registrarAuditoria({
          usuario: req.user, acao: "editar", entidade: "rotina_avaliacao", entidadeId: t.id,
          resumo: `${req.user?.nome || "Alguém"} alterou o resultado de ${finais.get(m.pid).nome} na avaliação individual da turma ${t.tema}: ${AV.ROTULO_RESULTADO[m.antes] || "—"} → ${AV.ROTULO_RESULTADO[m.depois] || "—"}`,
          dadosAntes: { resultado: m.antes }, dadosDepois: { resultado: m.depois }, ip: req.ip,
        });
      }
    }

    if (registrar) {
      registrarAuditoria({
        usuario: req.user, acao: "editar", entidade: "rotina_avaliacao", entidadeId: t.id,
        resumo: `${req.user?.nome || "Alguém"} registrou a avaliação individual da turma ${t.tema} (${finais.size} candidato(s))`, ip: req.ip,
      });
    }
    return res.json({ ok: true, celula_atualizada: naCelula });
  } catch (e) {
    console.error("[rotina.salvarAvaliacao]", e.message || e);
    return erro(res, 500, "Erro ao salvar a avaliação individual.");
  }
}

async function reabrirAvaliacao(req, res) {
  try {
    const t = await turmaDeAvTec(req, res, { editar: true });
    if (!t) return;
    const [r] = await pool.query("DELETE FROM rotina_avaliacao_registro WHERE treinamento_id = ?", [t.id]);
    if (!r.affectedRows) return erro(res, 409, "A avaliação ainda não foi registrada.");
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "rotina_avaliacao", entidadeId: t.id,
      resumo: `${req.user?.nome || "Alguém"} reabriu a avaliação individual da turma ${t.tema}`, ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[rotina.reabrirAvaliacao]", e.message || e);
    return erro(res, 500, "Erro ao reabrir a avaliação.");
  }
}

async function exportarAvaliacao(req, res) {
  try {
    const t = await turmaDeAvTec(req, res);
    if (!t) return;
    const { rows } = await carregarAvaliacao(t);
    const XL = require("../lib/excelExport");
    const wb = XL.novoWorkbook();
    const colunas = [
      { titulo: "Candidato", chave: "nome", largura: 32 },
      { titulo: "Matrícula", chave: "matricula", largura: 14 },
      ...AV.CRITERIOS.map((c) => ({ titulo: c.rotulo, chave: c.chave, formato: "inteiro", largura: 16 })),
      { titulo: "Média", chave: "media", formato: "decimal1", largura: 9 },
      { titulo: "Resultado", chave: "resultado", largura: 13 },
      { titulo: "Observação", chave: "observacao", largura: 50 },
    ];
    XL.adicionarTabela(wb, {
      nomeAba: "Avaliação individual",
      colunas,
      linhas: rows.map((r) => {
        const l = linhaParaApi(r);
        const linha = { nome: l.nome, matricula: l.matricula || "", media: l.media, resultado: AV.ROTULO_RESULTADO[l.resultado] || "", observacao: l.observacao };
        AV.CRITERIOS.forEach((c) => { linha[c.chave] = l.notas[c.chave]; });
        return linha;
      }),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="avaliacao-individual-turma-${t.id}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[rotina.exportarAvaliacao]", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao exportar.");
  }
}

// Reaproveitado pela importação de provas em papel (mesmas regras de acesso à turma).
const acesso = { buscarTurma, podeEditarTurma, podeVerTurma, ehGestao, exigirTurma, escopo };

module.exports = {
  acesso,
  estadoDaTurma, responderChecklist, marcarTarefa, salvarDiario, escolherAtividades,
  criarRegistro, editarRegistro, excluirRegistro, listarMinhas, exportarRegistros,
  listarCatalogo, criarCatalogo, editarCatalogo, obterModelos, salvarModelos,
  obterAvaliacao, salvarAvaliacao, reabrirAvaliacao, exportarAvaliacao,
};
