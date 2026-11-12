/**
 * rhBase.js — Módulo RH, Pacote 1 (12/11/2026)
 *
 * Constantes e helpers compartilhados pelos controllers do módulo RH (Clima organizacional e,
 * nos pacotes seguintes, Projeto Canguru). CommonJS (nunca import/export).
 *
 * Isolamento: o módulo é independente do T&D, do R&S e do Núcleo (perfis próprios) e NÃO é acessível
 * ao super_admin. authorizeRoles deixa o super_admin passar em qualquer rota, então o bloqueio é feito
 * aqui, em contexto(): sem empresa válida (ou super_admin) a resposta é 403, nunca "sem filtro de tenant".
 */
const pool = require("./db");
const N = require("./nuspBase");

const PERFIL_COORD = "coordenador_rh";
const PERFIL_ANALISTA = "analista_rh";
const PERFIL_GESTOR = "gestor_rh";
const PERFIS_RH = [PERFIL_COORD, PERFIL_ANALISTA, PERFIL_GESTOR];
const PERFIS_OPERACAO = [PERFIL_COORD, PERFIL_ANALISTA]; // importam, veem recorte por coordenação e dado nominal

// Escala da pesquisa de clima (Prime RH). Convenção do PCO: positivo = Concordo + Concordo Totalmente;
// negativo = Discordo + Discordo Totalmente; neutro inclui "Não Sei".
const CATEGORIAS = ["Concordo Totalmente", "Concordo", "Neutro", "Não Sei", "Discordo", "Discordo Totalmente"];
const IDX_POS = [0, 1];
const IDX_NEU = [2, 3];
const IDX_NEG = [4, 5];

const LIMITES_PADRAO = { farol_verde_min: 60, farol_amarelo_min: 40, min_recorte: 10 };
const MIN_RECORTE_MINIMO = 5; // o coordenador pode subir o mínimo, nunca baixar de 5

// Temas propostos e suas afirmações (índice 1..41 na ordem do questionário do Prime RH). O coordenador ajusta em Cadastros.
const TEMAS_PADRAO = [
  { nome: "Comunicação interna", perguntas: [1, 2, 3, 5] },
  { nome: "Direção e alta gestão", perguntas: [4, 15, 21] },
  { nome: "Liderança imediata", perguntas: [20, 22, 23, 24, 25, 26, 28] },
  { nome: "Metas, prioridades e rotina", perguntas: [6, 27, 29, 30] },
  { nome: "Carreira e remuneração", perguntas: [7, 8] },
  { nome: "Orgulho e satisfação com o trabalho", perguntas: [10, 12, 13] },
  { nome: "Recursos e inovação", perguntas: [11, 14] },
  { nome: "Ambiente físico", perguntas: [16, 17, 18, 19] },
  { nome: "Relacionamento e trabalho em equipe", perguntas: [31, 32, 33, 34, 35, 36] },
  { nome: "Áreas de apoio (DP, TI, Treinamento, SESMT)", perguntas: [9, 37, 38, 39, 40, 41] },
];
// Textos curtos das 41 afirmações (o texto original do questionário não é gravado).
const PERGUNTAS_CURTAS = {
  1: "Comunicação interna é adequada", 2: "Conheço o que outras áreas fazem", 3: "Meios de comunicação são claros e úteis",
  4: "Alta administração conhece os problemas", 5: "Conheço as campanhas motivacionais", 6: "Meu setor tem prioridades definidas",
  7: "Empresa possibilita ascensão profissional", 8: "Minha remuneração é adequada", 9: "DP esclarece minhas dúvidas",
  10: "Empresa tem imagem positiva no mercado", 11: "Ideias inovadoras são colocadas em prática", 12: "Tenho orgulho de trabalhar aqui",
  13: "Gosto das atividades que faço", 14: "Empresa dá recursos para melhorar meu trabalho", 15: "Direção se mobiliza para resolver problemas",
  16: "Ambiente: higiene", 17: "Ambiente: temperatura", 18: "Ambiente: nível de ruído", 19: "Ambiente: instalações",
  20: "Superior reconhece bons resultados", 21: "Empresa tem líderes qualificados", 22: "Avalio bem meu superior imediato",
  23: "Superior se mobiliza para resolver problemas", 24: "Superiores são receptivos a críticas", 25: "Superior transmite entusiasmo",
  26: "Diálogo com o superior é adequado", 27: "Existem reuniões no meu setor", 28: "Solicitações do superior são claras",
  29: "Conheço as metas esperadas de mim", 30: "Sinto-me motivado a cumprir as metas", 31: "Há respeito no ambiente de trabalho",
  32: "Há confiança no ambiente de trabalho", 33: "Relacionamento entre setores é adequado", 34: "Decisões da empresa são colocadas em prática por todos",
  35: "A competição é saudável", 36: "Problemas do setor são tratados pela equipe", 37: "TI atende com agilidade",
  38: "TI atende com cortesia", 39: "Treinamentos têm qualidade", 40: "SESMT atende com agilidade", 41: "SESMT atende com cortesia",
};
const AREAS = ["SMO (Saúde Ocupacional)", "SESMT (Segurança do Trabalho)", "Administrativa", "DP", "RH", "Treinamento", "TI", "Infraestrutura"];

// ── Contexto de tenant ────────────────────────────────────────────────
/** Devolve { empresaId, user, perfil } ou responde 403 e devolve null. super_admin e requisições sem empresa válida NUNCA passam. */
function contexto(req, res) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  const empresaId = Number(req.empresaId);
  if (perfil === "super_admin" || !PERFIS_RH.includes(perfil) || !Number.isInteger(empresaId) || empresaId <= 0) {
    res.status(403).json({ ok: false, message: "Você não tem acesso ao módulo do RH." });
    return null;
  }
  return { empresaId, user: req.user, perfil };
}
/** Só coordenador e analista do RH. */
function contextoOperacao(req, res) {
  const c = contexto(req, res);
  if (!c) return null;
  if (!PERFIS_OPERACAO.includes(c.perfil)) {
    res.status(403).json({ ok: false, message: "Este conteúdo é só da equipe do RH." });
    return null;
  }
  return c;
}
/** Só o coordenador do RH. */
function contextoCoord(req, res) {
  const c = contexto(req, res);
  if (!c) return null;
  if (c.perfil !== PERFIL_COORD) {
    res.status(403).json({ ok: false, message: "Só o coordenador do RH pode fazer isso." });
    return null;
  }
  return c;
}

const erro = (res, status, message, extra = {}) => res.status(status).json({ ok: false, error: message, message, ...extra });

// ── Dados iniciais por empresa (preguiçoso e idempotente) ─────────────
const semeadas = new Set();
async function garantirBase(empresaId) {
  if (semeadas.has(empresaId)) return;
  await pool.query(
    `INSERT IGNORE INTO rh_config (empresa_id, farol_verde_min, farol_amarelo_min, min_recorte) VALUES (?, ?, ?, ?)`,
    [empresaId, LIMITES_PADRAO.farol_verde_min, LIMITES_PADRAO.farol_amarelo_min, LIMITES_PADRAO.min_recorte]
  );
  const [t] = await pool.query(`SELECT COUNT(*) n FROM rh_clima_temas WHERE empresa_id = ?`, [empresaId]);
  if (!Number(t[0].n)) {
    for (let i = 0; i < TEMAS_PADRAO.length; i++) {
      await pool.query(`INSERT IGNORE INTO rh_clima_temas (empresa_id, nome, ordem) VALUES (?, ?, ?)`, [empresaId, TEMAS_PADRAO[i].nome, i + 1]);
    }
  }
  const [p] = await pool.query(`SELECT COUNT(*) n FROM rh_clima_perguntas WHERE empresa_id = ?`, [empresaId]);
  if (!Number(p[0].n)) {
    const [temas] = await pool.query(`SELECT id, nome FROM rh_clima_temas WHERE empresa_id = ?`, [empresaId]);
    const idPorNome = new Map(temas.map((x) => [x.nome, x.id]));
    const temaDe = {};
    for (const tp of TEMAS_PADRAO) for (const q of tp.perguntas) temaDe[q] = idPorNome.get(tp.nome) || null;
    for (let q = 1; q <= 41; q++) {
      await pool.query(`INSERT IGNORE INTO rh_clima_perguntas (empresa_id, numero, texto, tema_id) VALUES (?, ?, ?, ?)`, [empresaId, q, PERGUNTAS_CURTAS[q], temaDe[q] ?? null]);
    }
  }
  semeadas.add(empresaId);
}

async function carregarConfig(empresaId) {
  await garantirBase(empresaId);
  const [[cfg]] = await pool.query(`SELECT farol_verde_min, farol_amarelo_min, min_recorte FROM rh_config WHERE empresa_id = ?`, [empresaId]);
  const [temas] = await pool.query(`SELECT id, nome, ordem, ativo FROM rh_clima_temas WHERE empresa_id = ? ORDER BY ordem, id`, [empresaId]);
  const [perguntas] = await pool.query(`SELECT numero, texto, tema_id FROM rh_clima_perguntas WHERE empresa_id = ? ORDER BY numero`, [empresaId]);
  return {
    limites: {
      farol_verde_min: Number(cfg?.farol_verde_min ?? LIMITES_PADRAO.farol_verde_min),
      farol_amarelo_min: Number(cfg?.farol_amarelo_min ?? LIMITES_PADRAO.farol_amarelo_min),
      min_recorte: Number(cfg?.min_recorte ?? LIMITES_PADRAO.min_recorte),
    },
    temas, perguntas,
  };
}

/** Registro de LEITURA de dado restrito. Nunca derruba a operação. */
async function registrarLeitura(req, empresaId, recurso, registroId = null, detalhe = null) {
  try {
    await pool.query(
      `INSERT INTO rh_acessos_log (empresa_id, usuario_id, usuario_nome, perfil, recurso, registro_id, detalhe, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [empresaId, req.user?.id ?? null, req.user?.nome ?? null, req.user?.perfil ?? null, recurso, registroId, detalhe, req.ip || null]
    );
  } catch (e) {
    console.error("[rh] falha ao registrar leitura:", e.message);
  }
}

module.exports = {
  PERFIL_COORD, PERFIL_ANALISTA, PERFIL_GESTOR, PERFIS_RH, PERFIS_OPERACAO,
  CATEGORIAS, IDX_POS, IDX_NEU, IDX_NEG, LIMITES_PADRAO, MIN_RECORTE_MINIMO, TEMAS_PADRAO, PERGUNTAS_CURTAS, AREAS,
  contexto, contextoOperacao, contextoCoord, erro, garantirBase, carregarConfig, registrarLeitura,
  chave: N.chave, dataISO: N.dataISO, texto: N.texto, hojeISO: N.hojeISO,
};
