/**
 * nuspBase.js — Núcleo de Saúde Psicossocial (NUSPSI), Pacote 1 (06/11/2026)
 *
 * Constantes, validações e helpers compartilhados pelos controllers do módulo.
 * CommonJS (nunca import/export).
 *
 * Isolamento: o módulo é independente do T&D (perfis próprios) e NÃO é
 * acessível ao super_admin — authorizeRoles deixa o super_admin passar em
 * qualquer rota, então o bloqueio é feito aqui, em contexto(): sem empresa
 * válida (ou super_admin) a resposta é 403, nunca "sem filtro de tenant".
 */
const pool = require("./db");

const PERFIL_COORD = "coordenador_nusp";
const PERFIL_ANALISTA = "analista_nusp";
const PERFIL_GESTOR = "gestor_nusp";
const PERFIS_NUSP = [PERFIL_COORD, PERFIL_ANALISTA, PERFIL_GESTOR];
const PERFIS_OPERACAO = [PERFIL_COORD, PERFIL_ANALISTA]; // veem e gravam dado operacional/nominal

const TIPOS_ATIVIDADE = [
  { value: "escuta_coletiva", label: "Escuta coletiva" },
  { value: "capacitacao", label: "Capacitação" },
  { value: "acao_intervencao", label: "Ação / intervenção" },
  { value: "reuniao", label: "Reunião / alinhamento" },
  { value: "monitoramento", label: "Monitoramento" },
  { value: "comunicacao", label: "Comunicação / campanha" },
  { value: "outros", label: "Outros" },
];
const FORMATOS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online ao vivo" },
  { value: "hibrido", label: "Híbrido" },
];
const STATUS_ATIVIDADE = [
  { value: "planejada", label: "Planejada" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];
const STATUS_PLANO = [
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];
const STATUS_MATERIAL = [
  { value: "em_producao", label: "Em produção" },
  { value: "concluido", label: "Concluído" },
];
const PRESENCAS = ["presente", "ausente", "justificado"];
const TIPOS_PROGRAMA = [
  { value: "nucleo", label: "Núcleo" },
  { value: "comite", label: "Comitê" },
  { value: "projeto", label: "Projeto" },
];

// ── Acolhimento individual (Pacote 2) ─────────────────────────────────
const CANAIS_ACOLHIMENTO = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online (videochamada)" },
  { value: "telefone", label: "Telefone" },
  { value: "email_fale_comigo", label: "E-mail / Fale Comigo" },
  { value: "nao_informado", label: "Não informado (histórico)" },
];
const ORIGENS_ACOLHIMENTO = [
  { value: "espontaneo", label: "Procura espontânea" },
  { value: "encaminhado", label: "Encaminhado" },
  { value: "busca_ativa", label: "Busca ativa" },
];
const STATUS_ACOLHIMENTO = [
  { value: "aberto", label: "Aberto" },
  { value: "em_acompanhamento", label: "Em acompanhamento" },
  { value: "encerrado", label: "Encerrado" },
];
const RESUMO_MAX = 500;
// Supressão de células pequenas: nenhum número derivado de acolhimento chega à
// diretoria com menos de 5 pessoas/registros por célula.
const MINIMO_CELULA = 5;

// Listas controladas iniciais (o coordenador edita em Cadastros). Só categorias gerais: sem diagnóstico.
const MOTIVOS_PADRAO = [
  "Relacionamento com a liderança",
  "Relacionamento com colegas",
  "Carga de trabalho e jornada",
  "Condições de trabalho",
  "Reconhecimento e carreira",
  "Questões pessoais ou familiares",
  "Bem-estar geral (relato sem detalhe clínico)",
  "Dúvida ou orientação",
  "Outros",
];
const ENCAMINHAMENTOS_PADRAO = [
  "Sem encaminhamento",
  "Retorno com o Núcleo",
  "Liderança / gestão",
  "RH / Gente e Cultura",
  "Serviço de saúde ocupacional (SESMT)",
  "Rede externa de saúde",
  "Canal de ética",
  "Outros",
];

const valores = (lista) => lista.map((i) => i.value);

// As 11 dimensões da pesquisa de riscos psicossociais (aba "CLASSIFICAÇÃO DAS
// PERGUNTAS" da pesquisa do Núcleo). Planilha e pesquisa passam a usar a mesma lista.
const DIMENSOES_PADRAO = [
  "Jornada de trabalho e recuperação",
  "Demandas de trabalho e carga mental",
  "Autonomia e controle sobre o trabalho",
  "Conteúdo e organização do trabalho",
  "Reconhecimento e recompensa",
  "Condições e recursos de trabalho",
  "Saúde mental e bem-estar",
  "Comunicação organizacional",
  "Relacionamentos interpessoais e liderança",
  "Saúde física relacionada ao trabalho",
  "Suporte organizacional em saúde mental",
];

// Programas iniciais (o coordenador pode renomear, desativar e criar outros).
const PROGRAMAS_PADRAO = [
  { nome: "Núcleo de Saúde Psicossocial", tipo: "nucleo", frentes: [] },
  { nome: "Diver+", tipo: "comite", frentes: [] },
  { nome: "Bem Me Quero", tipo: "projeto", frentes: ["Fale Comigo", "Acolhimento", "Comitê de Saúde Mental"] },
];

// ── Contexto de tenant ────────────────────────────────────────────────
/**
 * Devolve { empresaId, user, perfil } ou responde 403 e devolve null.
 * super_admin e requisições sem empresa válida NUNCA passam.
 */
function contexto(req, res) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  const empresaId = Number(req.empresaId);
  if (perfil === "super_admin" || !PERFIS_NUSP.includes(perfil) || !Number.isInteger(empresaId) || empresaId <= 0) {
    res.status(403).json({ ok: false, message: "Você não tem acesso ao módulo do Núcleo." });
    return null;
  }
  return { empresaId, user: req.user, perfil };
}

/** Camada restrita: só coordenador e analista do Núcleo (o gestor e qualquer outro perfil recebem 403). */
function contextoRestrito(req, res) {
  const c = contexto(req, res);
  if (!c) return null;
  if (!PERFIS_OPERACAO.includes(c.perfil)) {
    res.status(403).json({ ok: false, message: "Este conteúdo é só da equipe técnica do Núcleo." });
    return null;
  }
  return c;
}

const erro = (res, status, message, extra = {}) => res.status(status).json({ ok: false, error: message, message, ...extra });

// ── Validação ─────────────────────────────────────────────────────────
function dataISO(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return undefined;
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function texto(v, max, campo, erros, { obrigatorio = false } = {}) {
  const t = v === null || v === undefined ? "" : String(v).trim();
  if (!t) {
    if (obrigatorio) erros.push(`${campo} é obrigatório`);
    return null;
  }
  if (t.length > max) {
    erros.push(`${campo} deve ter no máximo ${max} caracteres`);
    return t.slice(0, max);
  }
  return t;
}

function inteiroOuNulo(v, campo, erros) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    erros.push(`${campo} inválido`);
    return null;
  }
  return n;
}

function opcao(v, lista, campo, erros, { obrigatorio = false, padrao = null } = {}) {
  const t = v === null || v === undefined || v === "" ? padrao : String(v).trim();
  if (!t) {
    if (obrigatorio) erros.push(`${campo} é obrigatório`);
    return null;
  }
  if (!valores(lista).includes(t)) {
    erros.push(`${campo} inválido`);
    return null;
  }
  return t;
}

function urlValida(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === "http:" || x.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Itens de cadastro que precisam pertencer à empresa ────────────────
async function existeNaEmpresa(tabela, id, empresaId, conn = pool) {
  if (id === null || id === undefined) return true;
  const [rows] = await conn.query(`SELECT id FROM ${tabela} WHERE id = ? AND empresa_id = ? LIMIT 1`, [id, empresaId]);
  return rows.length > 0;
}

/** Confere que programa/frente/dimensão/unidade informados são da empresa. Devolve mensagem de erro ou null. */
async function conferirReferencias({ programa_id, frente_id, dimensao_id, unidade_id }, empresaId, conn = pool) {
  if (!(await existeNaEmpresa("nusp_programas", programa_id, empresaId, conn))) return "Programa inválido";
  if (!(await existeNaEmpresa("nusp_dimensoes", dimensao_id, empresaId, conn))) return "Dimensão inválida";
  if (!(await existeNaEmpresa("nusp_unidades", unidade_id, empresaId, conn))) return "Unidade inválida";
  if (frente_id) {
    const [rows] = await conn.query(`SELECT programa_id FROM nusp_frentes WHERE id = ? AND empresa_id = ? LIMIT 1`, [frente_id, empresaId]);
    if (!rows.length) return "Frente inválida";
    if (programa_id && Number(rows[0].programa_id) !== Number(programa_id)) return "A frente não pertence ao programa escolhido";
  }
  return null;
}

// ── Dados iniciais por empresa (preguiçoso e idempotente) ─────────────
const semeadas = new Set();
async function garantirBase(empresaId) {
  if (semeadas.has(empresaId)) return;
  const [d] = await pool.query(`SELECT COUNT(*) n FROM nusp_dimensoes WHERE empresa_id = ?`, [empresaId]);
  if (!Number(d[0].n)) {
    for (let i = 0; i < DIMENSOES_PADRAO.length; i++) {
      await pool.query(`INSERT IGNORE INTO nusp_dimensoes (empresa_id, nome, ordem) VALUES (?, ?, ?)`, [empresaId, DIMENSOES_PADRAO[i], i + 1]);
    }
  }
  const [p] = await pool.query(`SELECT COUNT(*) n FROM nusp_programas WHERE empresa_id = ?`, [empresaId]);
  if (!Number(p[0].n)) {
    for (const prog of PROGRAMAS_PADRAO) {
      const [r] = await pool.query(`INSERT IGNORE INTO nusp_programas (empresa_id, nome, tipo) VALUES (?, ?, ?)`, [empresaId, prog.nome, prog.tipo]);
      if (r.insertId) {
        for (const f of prog.frentes) {
          await pool.query(`INSERT IGNORE INTO nusp_frentes (empresa_id, programa_id, nome) VALUES (?, ?, ?)`, [empresaId, r.insertId, f]);
        }
      }
    }
  }
  const [m] = await pool.query(`SELECT COUNT(*) n FROM nusp_motivos WHERE empresa_id = ?`, [empresaId]);
  if (!Number(m[0].n)) {
    for (let i = 0; i < MOTIVOS_PADRAO.length; i++) {
      await pool.query(`INSERT IGNORE INTO nusp_motivos (empresa_id, nome, ordem) VALUES (?, ?, ?)`, [empresaId, MOTIVOS_PADRAO[i], i + 1]);
    }
  }
  const [en] = await pool.query(`SELECT COUNT(*) n FROM nusp_encaminhamentos WHERE empresa_id = ?`, [empresaId]);
  if (!Number(en[0].n)) {
    for (let i = 0; i < ENCAMINHAMENTOS_PADRAO.length; i++) {
      await pool.query(`INSERT IGNORE INTO nusp_encaminhamentos (empresa_id, nome, ordem) VALUES (?, ?, ?)`, [empresaId, ENCAMINHAMENTOS_PADRAO[i], i + 1]);
    }
  }
  semeadas.add(empresaId);
}

// ── Comparação sem acento/maiúscula (importador e buscas) ─────────────
function chave(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Registro de LEITURA de dado restrito (usado a partir do pacote 2). Nunca derruba a operação.
async function registrarLeitura(req, empresaId, recurso, registroId = null, detalhe = null) {
  try {
    await pool.query(
      `INSERT INTO nusp_acessos_log (empresa_id, usuario_id, usuario_nome, perfil, recurso, registro_id, detalhe, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [empresaId, req.user?.id ?? null, req.user?.nome ?? null, req.user?.perfil ?? null, recurso, registroId, detalhe, req.ip || null]
    );
  } catch (e) {
    console.error("[nusp] falha ao registrar leitura:", e.message);
  }
}

module.exports = {
  PERFIL_COORD, PERFIL_ANALISTA, PERFIL_GESTOR, PERFIS_NUSP, PERFIS_OPERACAO,
  TIPOS_ATIVIDADE, FORMATOS, STATUS_ATIVIDADE, STATUS_PLANO, STATUS_MATERIAL, PRESENCAS, TIPOS_PROGRAMA,
  DIMENSOES_PADRAO, PROGRAMAS_PADRAO,
  CANAIS_ACOLHIMENTO, ORIGENS_ACOLHIMENTO, STATUS_ACOLHIMENTO, RESUMO_MAX, MINIMO_CELULA, MOTIVOS_PADRAO, ENCAMINHAMENTOS_PADRAO,
  contexto, contextoRestrito, erro, dataISO, texto, inteiroOuNulo, opcao, urlValida, hojeISO, valores,
  existeNaEmpresa, conferirReferencias, garantirBase, chave, registrarLeitura,
};
