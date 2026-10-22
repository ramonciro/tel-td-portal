/**
 * rotina.js — Rotina do instrutor (16/10/2026, pedido do Ramon)
 *
 * Base: planilhas "RESPONSABILIDADES DOS TUTORES" e "CHECK-LIST AVALIAÇÃO
 * TÉCNICA". Aqui ficam os modelos padrão (checklist, responsabilidades,
 * catálogo de atividades), as datas/prazos e o resumo por instrutor usado no
 * Desempenho do Instrutor.
 *
 * Regras:
 *  - Turma com subtipo de sistema Avaliação Técnica (chave `avaliacao_tecnica`)
 *    usa checklist (Véspera/Início/Final) + responsabilidades com prazo +
 *    diário de bordo. Qualquer outra turma usa só o registro de atividades.
 *  - Em toda turma o instrutor escolhe quais atividades do catálogo valem.
 *  - Toda atividade registrada tem duração e SOMA na CH do instrutor
 *    (services/capacidadeResolver.js, terceira origem da fonte de horas).
 *  - Checklist, responsabilidades, diário e avaliação NÃO somam horas: esse
 *    trabalho já está dentro da CH da turma.
 */
const pool = require("./db");
const { turmasPorInstrutorSql } = require("./instrutoresTurma");

/* ───────────────────────── modelos padrão ───────────────────────── */

const CHECKLIST_PADRAO = {
  vespera: [
    "Verificou os equipamentos (computadores, caixa de som e datashow) estão funcionando?",
    "Cobrou da supervisão a impressão da lista de presença / diário de bordo?",
    "Conferir o plano de aula?",
    "Fiquei ciente do período de treinamento e entrada na operação?",
    "Conferiu se os acessos ao Lorni já foram criados?",
    "Solicitei o agendamento da visita do SESMIT?",
    "Solicitei o agendamento da visita da QUALIDADE?",
    "Solicitei o agendamento da visita do ADM?",
  ],
  inicio: [
    "Cheguei pelo menos 10 minutos antes do horário inicial do treinamento?",
    "Peguei a lista de presença e diário de bordo?",
    "Recepcionei os candidatos de acordo com a lista de presença?",
    "Passei a lista já na primeira hora e sinalizei a gestão às 08:00 / 14:00 sobre as ausências para a solicitação de reposição?",
    "Houve divergência nos horários de trabalho dos candidatos?",
    "Sinalizei ao supervisor sobre as divergências?",
    "Repassei para o colega do turno oposto os assuntos abordados em sala?",
  ],
  final: [
    "Foi realizada a prova?",
    "Os candidatos alcançaram a média?",
    "Foi realizada a assinatura do contrato?",
    "Foi informado aos candidatos o prazo para reembolso?",
  ],
};

const ETAPAS = ["vespera", "inicio", "final"];
const ROTULO_ETAPA = { vespera: "Véspera", inicio: "Início", final: "Final" };

// ancora: inicio = 1º dia da turma · fim = último dia · continuo = sem prazo fixo
const TAREFAS_PADRAO = [
  { item: "Sala de treinamento", o_que_fazer: "Conferir computadores, abrir chamado e cobrar a TI", ancora: "inicio", offset_dias: -3, dias_uteis: 1 },
  { item: "Plano de aula", o_que_fazer: "Manter e revisar continuamente", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Cadastro no Lorni", o_que_fazer: "Pedir o cadastro em lote aos analistas de conteúdo (reposição no 2º dia é individual)", ancora: "inicio", offset_dias: -1, dias_uteis: 1 },
  { item: "Visita das áreas", o_que_fazer: "Agendar e acompanhar as visitas no 1º dia", ancora: "inicio", offset_dias: 0, dias_uteis: 0 },
  { item: "Avaliar perfil dos candidatos", o_que_fazer: "Diariamente, seguindo a planilha", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Lista de presença online", o_que_fazer: "Lançar no mesmo dia e conferir o relatório no Portal T&D", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Diário de bordo", o_que_fazer: "Preencher todos os dias", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Grupo de WhatsApp", o_que_fazer: "Grupo silencioso, assistentes em todos; remover as pessoas antes de excluir", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Escutas na operação", o_que_fazer: "Simulação, se for implantação", ancora: "continuo", offset_dias: 0, dias_uteis: 0 },
  { item: "Prova", o_que_fazer: "Garantir no Lorni / Portal T&D, 1 dia antes de assinar o contrato", ancora: "fim", offset_dias: -1, dias_uteis: 0 },
  { item: "Assinatura do contrato", o_que_fazer: "Último dia; só quem vai assinar; documentos impressos", ancora: "fim", offset_dias: 0, dias_uteis: 0 },
  { item: "Alteração de cadastro no Lorni", o_que_fazer: "Trocar CPF por matrícula após o contrato", ancora: "fim", offset_dias: 1, dias_uteis: 1 },
  { item: "Suporte in loco", o_que_fazer: "Uma semana após a entrega à operação; tutor fica a CH completa; levantar dúvidas e mapear operadores com dificuldade (registre as horas em Atividades)", ancora: "fim", offset_dias: 1, dias_uteis: 1 },
  { item: "Formação continuada: cards", o_que_fazer: "Cards para o feed do Lorni após a Avaliação Técnica, durante o suporte in loco", ancora: "fim", offset_dias: 7, dias_uteis: 0 },
];

// pede_pessoa: a atividade se refere a uma pessoa da turma (escutas).
// tem_prazo_fim_turma: obrigatória ao concluir a turma (revisão do plano).
const CATALOGO_PADRAO = [
  { nome: "Escuta lado a lado", descricao: "Escutar o operador individualmente, no mínimo 30 minutos, anotando os pontos observados.", pede_pessoa: 1, minutos_padrao: 30 },
  { nome: "Escuta remota", descricao: "Escutar ligações gravadas para mapear algo geral entre os operadores.", pede_pessoa: 0, minutos_padrao: 60 },
  { nome: "Card (feed do Lorni)", descricao: "Material escrito para postagem no feed do Lorni.", pede_pessoa: 0, minutos_padrao: 45 },
  { nome: "Vídeo", descricao: "Vídeo para as estratégias de aprendizagem dos operadores.", pede_pessoa: 0, minutos_padrao: 180 },
  { nome: "Formulário (Google Forms)", descricao: "Pesquisa entre os operadores, sempre com um motivo definido.", pede_pessoa: 0, minutos_padrao: 30 },
  { nome: "Revisão do plano de aula", descricao: "Ajustar dinâmicas, ordem do conteúdo, incluir ou retirar da grade, ao concluir a turma.", pede_pessoa: 0, minutos_padrao: 60, tem_prazo_fim_turma: 1, marcada_padrao: 1, marcada_padrao_avtec: 1 },
  { nome: "Construção de treinamento", descricao: "Elaborar treinamentos próprios a partir dos temas identificados nas operações.", pede_pessoa: 0, minutos_padrao: 120 },
  { nome: "Produção de game", descricao: "Games para estimular o aprendizado dos operadores.", pede_pessoa: 0, minutos_padrao: 120 },
  { nome: "Capacitação do tutor", descricao: "Tempo dentro da carga horária para estudar e se capacitar na função.", pede_pessoa: 0, minutos_padrao: 60 },
  { nome: "Consultoria", descricao: "Diagnóstico das necessidades da operação e construção do plano de trabalho.", pede_pessoa: 0, minutos_padrao: 60 },
  { nome: "Suporte in loco", descricao: "Acompanhamento na operação após a entrega dos operadores (tutor fica a CH completa).", pede_pessoa: 0, minutos_padrao: 360, marcada_padrao_avtec: 1, sistema: 1 },
];

// Referência de ritmo mensal por operação (não é meta rígida).
const RITMO_REFERENCIA = {
  "vídeo": { qtd: 1, texto: "1 por mês" },
  "card (feed do lorni)": { qtd: 4, texto: "semanal" },
};

const REVISAO_PRAZO_DIAS = 2;

/* ───────────────────────── datas ───────────────────────── */

const isoDia = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

// "hoje" no fuso do Brasil (UTC-3), sem depender do fuso do servidor.
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function somarDias(iso, n, uteis = false) {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00Z");
  if (!uteis) {
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const passo = n >= 0 ? 1 : -1;
  let falta = Math.abs(n);
  while (falta > 0) {
    d.setUTCDate(d.getUTCDate() + passo);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) falta -= 1;
  }
  return d.toISOString().slice(0, 10);
}

function diffDias(a, b) {
  return Math.round((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000);
}

function prazoDaTarefa(t, datas) {
  if (t.ancora === "continuo" || !datas) return null;
  const base = t.ancora === "fim" ? datas.fim : datas.inicio;
  if (!base) return null;
  return somarDias(base, Number(t.offset_dias) || 0, !!t.dias_uteis);
}

function situacaoDaTarefa(t, prazo, hoje = hojeBR()) {
  if (t.feito) return { situacao: "feito", dias_atraso: 0 };
  if (!prazo) return { situacao: t.ancora === "continuo" ? "continuo" : "a_fazer", dias_atraso: 0 };
  const d = diffDias(hoje, prazo);
  if (d > 0) return { situacao: "atrasada", dias_atraso: d };
  if (d === 0) return { situacao: "vence_hoje", dias_atraso: 0 };
  if (d === -1) return { situacao: "vence_amanha", dias_atraso: 0 };
  return { situacao: "a_fazer", dias_atraso: 0 };
}

/* ───────────────────────── seeds ───────────────────────── */

const eq = (empresaId) => (empresaId ? ["empresa_id = ?", [empresaId]] : ["empresa_id IS NULL", []]);

async function garantirModelos(empresaId) {
  const [cond, p] = eq(empresaId);

  const [[c1]] = await pool.query(`SELECT COUNT(*) AS n FROM rotina_atividades_catalogo WHERE ${cond}`, p);
  if (!Number(c1.n)) {
    for (const a of CATALOGO_PADRAO) {
      await pool.query(
        `INSERT INTO rotina_atividades_catalogo
           (empresa_id, nome, descricao, pede_pessoa, minutos_padrao, tem_prazo_fim_turma, marcada_padrao, marcada_padrao_avtec, sistema, criado_por)
         VALUES (?,?,?,?,?,?,?,?,?, 'sistema')`,
        [empresaId || null, a.nome, a.descricao, a.pede_pessoa || 0, a.minutos_padrao || null,
         a.tem_prazo_fim_turma || 0, a.marcada_padrao || 0, a.marcada_padrao_avtec || 0, a.sistema || 0]
      );
    }
  }

  const [[c2]] = await pool.query(`SELECT COUNT(*) AS n FROM rotina_modelo_checklist WHERE ${cond}`, p);
  if (!Number(c2.n)) {
    for (const etapa of ETAPAS) {
      let ordem = 0;
      for (const texto of CHECKLIST_PADRAO[etapa]) {
        await pool.query(
          "INSERT INTO rotina_modelo_checklist (empresa_id, etapa, ordem, texto) VALUES (?,?,?,?)",
          [empresaId || null, etapa, ordem++, texto]
        );
      }
    }
  }

  const [[c3]] = await pool.query(`SELECT COUNT(*) AS n FROM rotina_modelo_tarefas WHERE ${cond}`, p);
  if (!Number(c3.n)) {
    let ordem = 0;
    for (const t of TAREFAS_PADRAO) {
      await pool.query(
        `INSERT INTO rotina_modelo_tarefas (empresa_id, ordem, item, o_que_fazer, ancora, offset_dias, dias_uteis)
         VALUES (?,?,?,?,?,?,?)`,
        [empresaId || null, ordem++, t.item, t.o_que_fazer, t.ancora, t.offset_dias, t.dias_uteis]
      );
    }
  }
}

/* ───────────────────────── turma ───────────────────────── */

async function datasDaTurma(t) {
  const [[r]] = await pool.query(
    "SELECT MIN(data_aula) AS ini, MAX(data_aula) AS fim, COUNT(*) AS n FROM turma_aulas WHERE treinamento_id = ?",
    [t.id]
  );
  const iniT = isoDia(t.data_inicio) || isoDia(t.data);
  const fimT = isoDia(t.data_fim) || iniT;
  const inicio = (Number(r.n) && isoDia(r.ini)) || iniT;
  const fim = (Number(r.n) && isoDia(r.fim)) || fimT;
  return { inicio, fim: fim && inicio && fim < inicio ? inicio : fim };
}

/**
 * Cria (uma vez) o que a turma precisa: seleção inicial de atividades e, se
 * for Avaliação Técnica, uma cópia do checklist e das responsabilidades.
 * Idempotente. Mudar o modelo depois NÃO altera turmas já abertas.
 */
async function inicializarTurma(t, avTec) {
  await garantirModelos(t.empresa_id || null);
  const [cond, p] = eq(t.empresa_id || null);

  const [[marca]] = await pool.query(
    "SELECT COUNT(*) AS n FROM rotina_turma_atividades WHERE treinamento_id = ? AND catalogo_id = 0",
    [t.id]
  );
  if (!Number(marca.n)) {
    const col = avTec ? "marcada_padrao_avtec" : "marcada_padrao";
    const [padrao] = await pool.query(
      `SELECT id FROM rotina_atividades_catalogo WHERE ${cond} AND ativo = 1 AND ${col} = 1`,
      p
    );
    for (const r of padrao) {
      await pool.query("INSERT IGNORE INTO rotina_turma_atividades (treinamento_id, catalogo_id) VALUES (?,?)", [t.id, r.id]);
    }
    await pool.query("INSERT IGNORE INTO rotina_turma_atividades (treinamento_id, catalogo_id) VALUES (?, 0)", [t.id]);
  }

  if (!avTec) return;

  const [[temCheck]] = await pool.query("SELECT COUNT(*) AS n FROM rotina_checklist WHERE treinamento_id = ?", [t.id]);
  if (!Number(temCheck.n)) {
    const [itens] = await pool.query(
      `SELECT etapa, texto FROM rotina_modelo_checklist WHERE ${cond} AND ativo = 1 ORDER BY etapa, ordem, id`,
      p
    );
    const ordemPorEtapa = {};
    for (const it of itens) {
      if (!ETAPAS.includes(it.etapa)) continue;
      const o = ordemPorEtapa[it.etapa] || 0;
      ordemPorEtapa[it.etapa] = o + 1;
      await pool.query(
        "INSERT IGNORE INTO rotina_checklist (empresa_id, treinamento_id, etapa, ordem, texto) VALUES (?,?,?,?,?)",
        [t.empresa_id || null, t.id, it.etapa, o, it.texto]
      );
    }
  }

  const [[temTar]] = await pool.query("SELECT COUNT(*) AS n FROM rotina_tarefas WHERE treinamento_id = ?", [t.id]);
  if (!Number(temTar.n)) {
    const [tarefas] = await pool.query(
      `SELECT item, o_que_fazer, ancora, offset_dias, dias_uteis FROM rotina_modelo_tarefas WHERE ${cond} AND ativo = 1 ORDER BY ordem, id`,
      p
    );
    let ordem = 0;
    for (const tr of tarefas) {
      await pool.query(
        `INSERT IGNORE INTO rotina_tarefas (empresa_id, treinamento_id, ordem, item, o_que_fazer, ancora, offset_dias, dias_uteis)
         VALUES (?,?,?,?,?,?,?,?)`,
        [t.empresa_id || null, t.id, ordem++, tr.item, tr.o_que_fazer, tr.ancora, tr.offset_dias, tr.dias_uteis]
      );
    }
  }
}

/* ───────────────────────── resumo por instrutor (Desempenho) ───────────────────────── */

/**
 * Indicadores da Rotina por instrutor, para o scorecard: horas e quantidade
 * de atividades no período, por tipo, revisões do plano feitas e aderência
 * (checklist respondido + responsabilidades feitas, nas turmas da Av. Técnica
 * do instrutor que começaram no período).
 */
async function getResumoRotinaPorInstrutor({ instrutores, meses, empresaId }) {
  const mapa = new Map(instrutores.map((n) => [n, {
    horas_atividades: 0, atividades_qtd: 0, por_tipo: [], revisoes_plano: 0, aderencia_pct: null,
  }]));
  if (!instrutores.length || !meses.length) return mapa;

  const mesesSql = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);
  const instSql = instrutores.map(() => "?").join(",");
  const tenantSql = empresaId ? " AND r.empresa_id = ?" : "";
  const tenantParams = empresaId ? [empresaId] : [];

  let rows = [];
  try {
    [rows] = await pool.query(
      `SELECT TRIM(r.instrutor) AS instrutor, r.tipo_nome, c.tem_prazo_fim_turma AS revisao,
              COUNT(*) AS qtd, SUM(r.minutos) AS minutos
         FROM rotina_atividades_registros r
         LEFT JOIN rotina_atividades_catalogo c ON c.id = r.catalogo_id
        WHERE TRIM(r.instrutor) IN (${instSql})
          AND (YEAR(r.data_atividade), MONTH(r.data_atividade)) IN (${mesesSql})${tenantSql}
        GROUP BY TRIM(r.instrutor), r.tipo_nome, c.tem_prazo_fim_turma`,
      [...instrutores, ...mesesParams, ...tenantParams]
    );
  } catch (e) {
    if (e && e.code === "ER_NO_SUCH_TABLE") return mapa;
    throw e;
  }
  for (const r of rows) {
    const acc = mapa.get(r.instrutor);
    if (!acc) continue;
    const horas = Number(r.minutos || 0) / 60;
    acc.horas_atividades += horas;
    acc.atividades_qtd += Number(r.qtd);
    acc.por_tipo.push({ tipo: r.tipo_nome, qtd: Number(r.qtd), horas: Number(horas.toFixed(2)) });
    if (Number(r.revisao) === 1) acc.revisoes_plano += Number(r.qtd);
  }
  for (const acc of mapa.values()) {
    acc.horas_atividades = Number(acc.horas_atividades.toFixed(2));
    acc.por_tipo.sort((a, b) => b.horas - a.horas);
  }

  // Aderência: turmas de Avaliação Técnica do instrutor com a rotina aberta.
  try {
    const hoje = hojeBR();
    const turmasPorInstrutor = await turmasPorInstrutorSql();
    const [turmas] = await pool.query(
      `SELECT t.instrutor_ref AS instrutor,
              (SELECT COUNT(*) FROM rotina_checklist c WHERE c.treinamento_id = t.id) AS check_total,
              (SELECT COUNT(*) FROM rotina_checklist c WHERE c.treinamento_id = t.id AND c.resposta IS NOT NULL) AS check_resp,
              (SELECT COUNT(*) FROM rotina_tarefas x WHERE x.treinamento_id = t.id AND x.feito = 1) AS tar_feitas
         FROM ${turmasPorInstrutor} t
        WHERE t.instrutor_ref IN (${instSql})
          AND (YEAR(COALESCE(t.data_inicio, t.data)), MONTH(COALESCE(t.data_inicio, t.data))) IN (${mesesSql})
          AND EXISTS (SELECT 1 FROM rotina_checklist c0 WHERE c0.treinamento_id = t.id)${empresaId ? " AND t.empresa_id = ?" : ""}`,
      [...instrutores, ...mesesParams, ...(empresaId ? [empresaId] : [])]
    );
    const soma = new Map();
    for (const t of turmas) {
      const s = soma.get(t.instrutor) || { num: 0, den: 0 };
      s.num += Number(t.check_resp) + Number(t.tar_feitas);
      s.den += Number(t.check_total) + Number(t.tar_feitas);
      soma.set(t.instrutor, s);
    }
    // Responsabilidades vencidas e não feitas entram só no denominador.
    const [venc] = await pool.query(
      `SELECT t.instrutor_ref AS instrutor, x.ancora, x.offset_dias, x.dias_uteis,
              COALESCE(t.data_inicio, t.data) AS ini, t.data_fim
         FROM rotina_tarefas x JOIN ${turmasPorInstrutor} t ON t.id = x.treinamento_id
        WHERE x.feito = 0 AND x.ancora <> 'continuo' AND t.instrutor_ref IN (${instSql})
          AND (YEAR(COALESCE(t.data_inicio, t.data)), MONTH(COALESCE(t.data_inicio, t.data))) IN (${mesesSql})${empresaId ? " AND t.empresa_id = ?" : ""}`,
      [...instrutores, ...mesesParams, ...(empresaId ? [empresaId] : [])]
    );
    for (const v of venc) {
      const datas = { inicio: isoDia(v.ini), fim: isoDia(v.data_fim) || isoDia(v.ini) };
      const prazo = prazoDaTarefa(v, datas);
      if (prazo && diffDias(hoje, prazo) > 0) {
        const s = soma.get(v.instrutor) || { num: 0, den: 0 };
        s.den += 1;
        soma.set(v.instrutor, s);
      }
    }
    for (const [nome, s] of soma) {
      const acc = mapa.get(nome);
      if (acc && s.den > 0) acc.aderencia_pct = Number(((s.num / s.den) * 100).toFixed(1));
    }
  } catch (e) {
    if (!(e && e.code === "ER_NO_SUCH_TABLE")) throw e;
  }
  return mapa;
}

module.exports = {
  CHECKLIST_PADRAO, ETAPAS, ROTULO_ETAPA, TAREFAS_PADRAO, CATALOGO_PADRAO, RITMO_REFERENCIA, REVISAO_PRAZO_DIAS,
  isoDia, hojeBR, somarDias, diffDias, prazoDaTarefa, situacaoDaTarefa,
  garantirModelos, datasDaTurma, inicializarTurma, getResumoRotinaPorInstrutor,
};
