/**
 * relatorioTurmaService.js — Relatório geral da turma (27/10/2026)
 *
 * Reúne num objeto só tudo o que o portal sabe de uma turma: identificação,
 * execução do cronograma, presença (resumo e por participante), NPS, avaliações
 * e certificados. É a fonte única das três saídas: tela de impressão/PDF
 * (JSON direto), Excel da turma e Excel em lote.
 *
 * Não calcula nada novo: usa os mesmos resolvers do restante do portal
 * (presencaResolver para presença e horas) para os números baterem com o
 * Dashboard e a Gestão de Turmas.
 *
 * Privacidade: comentários do NPS saem SEM o nome de quem respondeu (o NPS é
 * respondido pelo treinando e lido pela equipe como voz da turma, não da pessoa).
 */
const pool = require("../lib/db");
const { getResumoPresenca, getFrequenciaPorParticipante } = require("./presencaResolver");
const { adicionaisDaTurma, todosOsInstrutores } = require("../lib/instrutoresTurma");
const { CRITERIOS: NPS_CRITERIOS, lerRespostas } = require("../lib/npsQuestionario");

const FREQUENCIA_MINIMA_PADRAO = 75;

const chave = (s) => String(s || "").trim().toLowerCase();
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const arred = (v, c = 1) => (v === null || v === undefined ? null : Math.round(Number(v) * 10 ** c) / 10 ** c);
const iso = (v) => {
  if (!v) return null;
  if (v instanceof Date) {
    return [v.getFullYear(), String(v.getMonth() + 1).padStart(2, "0"), String(v.getDate()).padStart(2, "0")].join("-");
  }
  return String(v).slice(0, 10);
};

const STATUS_AULA = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
};

function classeNps(nota) {
  const n = Number(nota || 0);
  if (n >= 9) return "promotor";
  if (n >= 7) return "neutro";
  return "detrator";
}


const dh = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};
async function seguro(fn, vazio = []) {
  try { return await fn(); } catch (_) { return vazio; }
}
const ETAPA_ROTULO = { vespera: "Véspera", inicio: "Início", final: "Final" };
const PERFIS_ROTINA = ["coordenador", "assistente_treinamento", "supervisor", "superintendente", "super_admin"];
const PERFIS_MURAL = ["coordenador", "supervisor", "instrutor", "analista_conteudo", "super_admin"];

/**
 * Registros da turma: diário de bordo, rotina do instrutor (checklist, tarefas,
 * avaliação individual, atividades), mural e justificativas de presença.
 * Cada bloco respeita quem pode ver aquilo na tela de origem:
 *  - rotina/diário: coordenação, assistente, supervisão, superintendência e o instrutor DA turma;
 *  - mural: coordenação, supervisão, instrutor e analista de conteúdo.
 * Bloco sem permissão vem null (a tela e o Excel simplesmente não mostram a seção).
 */
async function montarRegistros(id, t, instrutores, { perfil, nomeUsuario }) {
  const p = String(perfil || "").toLowerCase();
  const ehInstrutorDaTurma = p === "instrutor" && instrutores.some((n) => chave(n) === chave(nomeUsuario));
  const podeRotina = PERFIS_ROTINA.includes(p) || ehInstrutorDaTurma;
  const podeMural = PERFIS_MURAL.includes(p);

  const ocorrencias = await seguro(async () => {
    const [rows] = await pool.query(
      `SELECT data_aula, treinando_nome, status, justificativa
         FROM presenca_aulas
        WHERE treinamento_id = ? AND justificativa IS NOT NULL AND TRIM(justificativa) <> ''
        ORDER BY data_aula ASC, treinando_nome ASC`,
      [id]
    );
    return rows.map((r) => ({ data: iso(r.data_aula), participante: r.treinando_nome, status: String(r.status || "").toLowerCase(), justificativa: r.justificativa }));
  });

  const out = { diario: null, rotina: null, mural: null, ocorrencias_presenca: ocorrencias };

  if (podeMural) {
    out.mural = await seguro(async () => {
      const [rows] = await pool.query(
        "SELECT autor_nome, titulo, conteudo, fixado, criado_em FROM turma_publicacoes WHERE treinamento_id = ? ORDER BY criado_em ASC",
        [id]
      );
      return rows.map((r) => ({ data: dh(r.criado_em), autor: r.autor_nome || null, titulo: r.titulo || "Aviso", conteudo: r.conteudo || "", fixado: !!r.fixado }));
    });
  }

  if (podeRotina) {
    out.diario = await seguro(async () => {
      const [rows] = await pool.query(
        "SELECT data_dia, texto, atualizado_por, updated_at FROM rotina_diario WHERE treinamento_id = ? ORDER BY data_dia ASC",
        [id]
      );
      return rows
        .filter((r) => String(r.texto || "").trim())
        .map((r) => ({ data: iso(r.data_dia), texto: r.texto, atualizado_por: r.atualizado_por || null, atualizado_em: dh(r.updated_at) }));
    });

    const checklist = await seguro(async () => {
      const [rows] = await pool.query(
        "SELECT etapa, texto, resposta, obs, respondido_por, respondido_em FROM rotina_checklist WHERE treinamento_id = ? ORDER BY FIELD(etapa,'vespera','inicio','final'), ordem",
        [id]
      );
      return rows.map((r) => ({ etapa: ETAPA_ROTULO[r.etapa] || r.etapa, texto: r.texto, resposta: r.resposta || null, obs: r.obs || null, respondido_por: r.respondido_por || null, respondido_em: dh(r.respondido_em) }));
    });
    const tarefas = await seguro(async () => {
      const [rows] = await pool.query(
        "SELECT item, o_que_fazer, feito, feito_em, feito_por FROM rotina_tarefas WHERE treinamento_id = ? ORDER BY ordem",
        [id]
      );
      return rows.map((r) => ({ item: r.item, o_que_fazer: r.o_que_fazer || null, feito: Number(r.feito) === 1, feito_em: dh(r.feito_em), feito_por: r.feito_por || null }));
    });
    const avaliacaoIndividual = await seguro(async () => {
      const [rows] = await pool.query(
        `SELECT tp.nome, a.nota_pontualidade, a.nota_interesse, a.nota_comportamento, a.nota_quiz, a.nota_avaliacao_final, a.media, a.resultado, a.observacao
           FROM rotina_avaliacao_individual a
           JOIN treinamento_participantes tp ON tp.id = a.participante_id
          WHERE a.treinamento_id = ? ORDER BY tp.nome`,
        [id]
      );
      const ROT = { passou: "Passou", em_berco: "No berço", nao_seguiu: "Não seguiu" };
      return rows.map((r) => ({
        participante: r.nome,
        pontualidade: num(r.nota_pontualidade), interesse: num(r.nota_interesse), comportamento: num(r.nota_comportamento),
        quiz: num(r.nota_quiz), avaliacao_final: num(r.nota_avaliacao_final), media: num(r.media),
        resultado: ROT[r.resultado] || r.resultado || null, observacao: r.observacao || null,
      }));
    });
    const atividades = await seguro(async () => {
      const [rows] = await pool.query(
        `SELECT data_atividade, tipo_nome, minutos, instrutor, pessoa_nome, tema, observacao
           FROM rotina_atividades_registros WHERE treinamento_id = ? ORDER BY data_atividade ASC, id ASC`,
        [id]
      );
      return rows.map((r) => ({ data: iso(r.data_atividade), tipo: r.tipo_nome, minutos: num(r.minutos), instrutor: r.instrutor || null, pessoa: r.pessoa_nome || null, tema: r.tema || null, observacao: r.observacao || null }));
    });
    out.rotina = { checklist, tarefas, avaliacao_individual: avaliacaoIndividual, atividades };
  }
  return out;
}

/** Relatório de UMA turma. Devolve null se a turma não existe (ou é de outro ambiente). */
async function montarRelatorioTurma(treinamentoId, { empresaId, perfil, nomeUsuario } = {}) {
  const id = Number(treinamentoId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [trs] = await pool.query(
    `SELECT t.*, s.nome AS sala_nome
       FROM treinamentos t
       LEFT JOIN salas s ON s.id = t.sala_id
      WHERE t.id = ?${empresaId ? " AND t.empresa_id = ?" : ""} LIMIT 1`,
    empresaId ? [id, empresaId] : [id]
  );
  const t = trs[0];
  if (!t) return null;

  const [adicionais, resumos, freq, aulas, roster, avTrein, provas, certs] = await Promise.all([
    adicionaisDaTurma(id),
    getResumoPresenca({ treinamentoId: id, empresaId }),
    getFrequenciaPorParticipante({ treinamentoId: id, empresaId }),
    pool.query(
      `SELECT dia_numero, data_aula, titulo, status_execucao, carga_horaria_planejada, carga_horaria_real,
              instrutor_responsavel, conteudo_ministrado, conteudo_planejado, observacoes_execucao, reprogramada, motivo_reprogramacao
         FROM turma_aulas WHERE treinamento_id = ? ORDER BY dia_numero ASC, ordem ASC, id ASC`,
      [id]
    ).then(([r]) => r),
    pool.query(
      `SELECT nome, matricula, operacao, supervisor, status_presenca, justificativa
         FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome ASC`,
      [id]
    ).then(([r]) => r),
    pool.query(
      `SELECT nota_nps, comentario, respostas_json FROM avaliacoes_treinandos
        WHERE treinamento_id = ? AND nota_nps IS NOT NULL`,
      [id]
    ).then(([r]) => r),
    pool.query(
      `SELECT treinando_nome, titulo, nota_qualidade, nota_prova
         FROM avaliacoes WHERE treinamento_id = ? ORDER BY titulo ASC, treinando_nome ASC`,
      [id]
    ).then(([r]) => r),
    pool.query(
      `SELECT usuario_nome, frequencia_percentual, nota_final, emitido_em
         FROM certificados WHERE treinamento_id = ?`,
      [id]
    ).then(([r]) => r),
  ]);

  const resumo = resumos[0] || {};
  const minimo = num(t.presenca_minima_pct) > 0 ? Number(t.presenca_minima_pct) : FREQUENCIA_MINIMA_PADRAO;

  // --- Cronograma ---
  const cronograma = aulas.map((a) => {
    const status = String(a.status_execucao || "planejada").toLowerCase();
    return {
      dia: Number(a.dia_numero) || null,
      data: iso(a.data_aula),
      titulo: a.titulo || null,
      status,
      status_rotulo: STATUS_AULA[status] || status,
      ch_planejada: num(a.carga_horaria_planejada) ?? 0,
      ch_real: num(a.carga_horaria_real),
      instrutor: a.instrutor_responsavel || null,
      conteudo: a.conteudo_ministrado || a.conteudo_planejado || null,
      reprogramada: !!a.reprogramada,
      motivo_reprogramacao: a.motivo_reprogramacao || null,
      observacoes: a.observacoes_execucao || null,
    };
  });
  const contaStatus = (s) => cronograma.filter((a) => a.status === s).length;
  const execucao = {
    dias_planejados: cronograma.length,
    dias_concluidos: contaStatus("concluida"),
    dias_em_andamento: contaStatus("em_andamento"),
    dias_reprogramados: cronograma.filter((a) => a.reprogramada || a.status === "reprogramada").length,
    dias_cancelados: contaStatus("cancelada"),
    horas_planejadas: arred(num(resumo.horas_planejadas) ?? num(t.carga_horaria) ?? 0, 2),
    horas_aplicadas: arred(num(resumo.horas_aplicadas) ?? 0, 2),
  };
  execucao.aderencia_horas_pct = execucao.horas_planejadas > 0
    ? arred((execucao.horas_aplicadas / execucao.horas_planejadas) * 100, 1)
    : null;

  // --- Presença ---
  const presenca = {
    previstos: Number(resumo.treinandos_previstos ?? t.participantes ?? 0) || 0,
    confirmados: Number(resumo.treinandos_confirmados ?? roster.length) || 0,
    presentes_pessoas: Number(resumo.presentes_pessoas || 0),
    ausentes_pessoas: Number(resumo.ausentes_pessoas || 0),
    justificados_pessoas: Number(resumo.justificados_pessoas || 0),
    pendentes_pessoas: Number(resumo.pendentes_pessoas || 0),
    taxa_presenca_pessoas: num(resumo.taxa_presenca_pessoas),
    taxa_presenca_registros: num(resumo.taxa_presenca),
    taxa_execucao_chamada: num(resumo.taxa_execucao),
    origem: resumo.origem_frequencia || "sem_dados",
    minimo_pct: minimo,
  };

  // --- Participantes: roster + quem aparece só na chamada ---
  const freqPorNome = new Map(freq.map((f) => [chave(f.treinando_nome), f]));
  const notasPorNome = new Map();
  for (const a of provas) {
    const k = chave(a.treinando_nome);
    const acc = notasPorNome.get(k) || { prova: [], qualidade: [] };
    if (num(a.nota_prova) !== null) acc.prova.push(Number(a.nota_prova));
    if (num(a.nota_qualidade) !== null) acc.qualidade.push(Number(a.nota_qualidade));
    notasPorNome.set(k, acc);
  }
  const certPorNome = new Map(certs.map((c) => [chave(c.usuario_nome), c]));
  const media = (l) => (l && l.length ? arred(l.reduce((s, x) => s + x, 0) / l.length, 1) : null);

  const vistos = new Set();
  const base = [];
  for (const r of roster) {
    vistos.add(chave(r.nome));
    base.push({ nome: r.nome, matricula: r.matricula || null, operacao: r.operacao || null, supervisor: r.supervisor || null, justificativa: r.justificativa || null });
  }
  for (const f of freq) {
    if (vistos.has(chave(f.treinando_nome))) continue;
    vistos.add(chave(f.treinando_nome));
    base.push({ nome: f.treinando_nome, matricula: null, operacao: null, supervisor: null, justificativa: null, fora_da_lista: true });
  }
  const participantes = base.map((p) => {
    const f = freqPorNome.get(chave(p.nome));
    const n = notasPorNome.get(chave(p.nome));
    const c = certPorNome.get(chave(p.nome));
    const computaveis = f ? f.presentes + f.ausentes : 0;
    return {
      ...p,
      dias_presentes: f ? f.presentes : 0,
      dias_ausentes: f ? f.ausentes : 0,
      dias_justificados: f ? f.justificados : 0,
      dias_pendentes: f ? f.pendentes : 0,
      frequencia_pct: f && computaveis > 0 ? f.frequencia_percentual : null,
      abaixo_do_minimo: f && computaveis > 0 ? f.frequencia_percentual < minimo : false,
      nota_prova: media(n?.prova),
      nota_qualidade: media(n?.qualidade),
      certificado: c ? iso(c.emitido_em) : null,
    };
  });

  // --- NPS ---
  const totalNps = avTrein.length;
  let prom = 0, neut = 0, detr = 0, soma = 0;
  const crit = {};
  const comentarios = [];
  for (const r of avTrein) {
    const nota = Number(r.nota_nps);
    soma += nota;
    const cl = classeNps(nota);
    if (cl === "promotor") prom += 1; else if (cl === "neutro") neut += 1; else detr += 1;
    const q = lerRespostas(r.respostas_json);
    for (const [k, v] of Object.entries(q?.criterios || {})) {
      const x = Number(v);
      if (!Number.isFinite(x)) continue;
      (crit[k] = crit[k] || { soma: 0, n: 0 });
      crit[k].soma += x;
      crit[k].n += 1;
    }
    const txt = String(r.comentario || "").trim();
    if (txt) comentarios.push({ nota, classe: cl, texto: txt });
  }
  comentarios.sort((a, b) => a.nota - b.nota);
  const nps = {
    respostas: totalNps,
    nota_media: totalNps ? arred(soma / totalNps, 2) : null,
    nps_score: totalNps ? arred(((prom - detr) / totalNps) * 100, 1) : null,
    promotores: prom,
    neutros: neut,
    detratores: detr,
    criterios: NPS_CRITERIOS.filter((c) => crit[c.chave]?.n).map((c) => ({
      chave: c.chave,
      rotulo: c.rotulo,
      media: arred(crit[c.chave].soma / crit[c.chave].n, 2),
      respostas: crit[c.chave].n,
    })),
    comentarios,
    taxa_resposta_pct: presenca.confirmados > 0 ? arred((totalNps / presenca.confirmados) * 100, 1) : null,
  };

  // --- Avaliações (provas) ---
  const notasProva = provas.map((a) => num(a.nota_prova)).filter((x) => x !== null);
  const avaliacoes = {
    lancadas: provas.length,
    com_nota: notasProva.length,
    media_prova: media(notasProva),
    itens: provas.map((a) => ({
      participante: a.treinando_nome || null,
      titulo: a.titulo || null,
      nota_prova: num(a.nota_prova),
      nota_qualidade: num(a.nota_qualidade),
    })),
  };

  const instrutoresTurma = todosOsInstrutores(t.instrutor, adicionais);
  const registros = await montarRegistros(id, t, instrutoresTurma, { perfil, nomeUsuario });

  return {
    gerado_em: new Date().toISOString(),
    turma: {
      id,
      tema: t.tema,
      cliente: t.cliente || null,
      subtipo: t.subtipo || null,
      publico: t.publico || null,
      descricao: t.descricao || null,
      status: t.status || null,
      status_turma: resumo.status_turma || null,
      classificacao: resumo.classificacao || null,
      instrutores: instrutoresTurma,
      supervisor: t.supervisor || null,
      sala: t.sala_outro_local || t.sala_nome || null,
      data_inicio: iso(t.data_inicio || t.data),
      data_fim: iso(t.data_fim),
      hora_inicio: t.hora_inicio ? String(t.hora_inicio).slice(0, 5) : null,
      hora_fim: t.hora_fim ? String(t.hora_fim).slice(0, 5) : null,
      carga_horaria: num(t.carga_horaria),
    },
    execucao,
    cronograma,
    presenca,
    participantes,
    nps,
    avaliacoes,
    certificados: { emitidos: certs.length },
    registros,
  };
}

/** Vários relatórios, na ordem pedida; ignora ids inexistentes. */
async function montarRelatoriosTurmas(ids, { empresaId, filtro, perfil, nomeUsuario } = {}) {
  const out = [];
  for (const id of ids) {
    const r = await montarRelatorioTurma(id, { empresaId, perfil, nomeUsuario });
    if (r && (!filtro || filtro(r))) out.push(r);
  }
  return out;
}

module.exports = { montarRelatorioTurma, montarRelatoriosTurmas, FREQUENCIA_MINIMA_PADRAO };
