/**
 * registroJobs.js — "tela de saúde do sistema" (O7, 26/11/2026).
 *
 * Duas coisas, ambas só para o Super Admin enxergar em /admin/saude (GET /api/admin/saude):
 *  1. Quando cada job agendado rodou pela última vez e se deu certo. O registro fica numa tabela pequena
 *     (sistema_jobs), então SOBREVIVE aos reinícios e deploys. Gravar o registro NUNCA derruba o job:
 *     qualquer falha aqui é engolida (o job segue como antes).
 *  2. Os últimos erros do servidor (respostas 5xx, promessas rejeitadas, exceções), em memória, até 30.
 *     Zera a cada reinício. Guarda só método, rota (sem query string) e mensagem curta: sem dados de pessoas.
 */
const pool = require("./db");

// Catálogo dos jobs de jobs/scheduler.js. limiteHoras = quanto tempo sem rodar é tolerável antes de acusar "atrasado".
const JOBS = [
  { chave: "certificados", nome: "Certificados automáticos", quando: "Todo dia, 05h", limiteHoras: 30 },
  { chave: "celulas_baby", nome: "Células baby", quando: "Todo dia, 05h30", limiteHoras: 30 },
  { chave: "conquistas", nome: "Cálculo de conquistas", quando: "Todo dia, 06h", limiteHoras: 30 },
  { chave: "radar_sincronizacao", nome: "Radar: sincronização", quando: "Todo dia, 06h30 (Brasília)", limiteHoras: 30 },
  { chave: "pendencias", nome: "Resumo de pendências por e-mail", quando: "Dias úteis, 07h", limiteHoras: 80 },
  { chave: "rs_atrasadas", nome: "R&S: aviso de RPs atrasadas", quando: "Dias úteis, 07h10", limiteHoras: 80 },
  { chave: "radar_semanal", nome: "Radar: retrato semanal", quando: "Segunda, 07h (Brasília)", limiteHoras: 200 },
  { chave: "rs_lixeira", nome: "R&S: limpeza da lixeira", quando: "Todo dia, 04h", limiteHoras: 30 },
  { chave: "lembretes", nome: "Lembretes de aula", quando: "Todo dia, 17h", limiteHoras: 30 },
];

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sistema_jobs (
      chave VARCHAR(60) NOT NULL PRIMARY KEY,
      ultima_execucao_em DATETIME NULL,
      ultimo_ok_em DATETIME NULL,
      ok TINYINT(1) NOT NULL DEFAULT 1,
      duracao_ms INT NULL,
      resumo VARCHAR(500) NULL,
      erro VARCHAR(500) NULL,
      origem VARCHAR(30) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  tabelaPronta = true;
}

function curto(valor, max) {
  if (valor === undefined || valor === null) return null;
  const s = typeof valor === "string" ? valor : (() => { try { return JSON.stringify(valor); } catch { return String(valor); } })();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

async function gravar(chave, { ok, duracaoMs, resumo, erro, origem }) {
  try {
    await garantirTabela();
    await pool.query(
      `INSERT INTO sistema_jobs (chave, ultima_execucao_em, ultimo_ok_em, ok, duracao_ms, resumo, erro, origem)
       VALUES (?, NOW(), ${ok ? "NOW()" : "NULL"}, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ultima_execucao_em = NOW(),
         ultimo_ok_em = ${ok ? "NOW()" : "ultimo_ok_em"},
         ok = VALUES(ok), duracao_ms = VALUES(duracao_ms), resumo = VALUES(resumo), erro = VALUES(erro), origem = VALUES(origem)`,
      [chave, ok ? 1 : 0, duracaoMs, ok ? curto(resumo, 500) : null, ok ? null : curto(erro, 500), origem || "agendado"]
    );
  } catch (e) {
    console.error("[registroJobs] não consegui gravar o registro do job", chave + ":", e.message);
  }
}

// Roda o job e registra o resultado. Devolve o que o job devolveu e repassa o erro (o chamador trata como antes).
async function executar(chave, fn, origem = "agendado") {
  const inicio = Date.now();
  try {
    const resultado = await fn();
    await gravar(chave, { ok: true, duracaoMs: Date.now() - inicio, resumo: resultado && typeof resultado === "object" && resultado.resumo !== undefined ? resultado.resumo : resultado, origem });
    return resultado;
  } catch (erro) {
    registrarErro({ origem: `job:${chave}`, mensagem: erro && erro.message });
    await gravar(chave, { ok: false, duracaoMs: Date.now() - inicio, erro: erro && erro.message, origem });
    throw erro;
  }
}

// Hora do servidor em ms; o MySQL devolve DATETIME no fuso da conexão, então comparamos pelo próprio banco.
async function listarRegistros() {
  try {
    await garantirTabela();
    const [rows] = await pool.query(
      `SELECT chave, ultima_execucao_em, ultimo_ok_em, ok, duracao_ms, resumo, erro, origem,
              TIMESTAMPDIFF(MINUTE, ultima_execucao_em, NOW()) AS min_desde_ultima,
              TIMESTAMPDIFF(MINUTE, ultimo_ok_em, NOW()) AS min_desde_ok
         FROM sistema_jobs`
    );
    return Object.fromEntries(rows.map((r) => [r.chave, r]));
  } catch (e) {
    return {};
  }
}

function situacaoDoJob(def, r) {
  if (!r) return "sem_registro";
  if (!r.ok) return "erro";
  const horas = r.min_desde_ok === null || r.min_desde_ok === undefined ? null : r.min_desde_ok / 60;
  if (horas !== null && horas > def.limiteHoras) return "atrasado";
  return "ok";
}

async function resumoDosJobs() {
  const regs = await listarRegistros();
  return JOBS.map((def) => {
    const r = regs[def.chave] || null;
    return {
      chave: def.chave,
      nome: def.nome,
      quando: def.quando,
      limite_horas: def.limiteHoras,
      situacao: situacaoDoJob(def, r),
      ultima_execucao_em: r ? r.ultima_execucao_em : null,
      horas_desde_ultima: r && r.min_desde_ultima !== null ? Math.round((r.min_desde_ultima / 60) * 10) / 10 : null,
      ultimo_ok_em: r ? r.ultimo_ok_em : null,
      duracao_ms: r ? r.duracao_ms : null,
      resumo: r ? r.resumo : null,
      erro: r ? r.erro : null,
      origem: r ? r.origem : null,
    };
  });
}

// ── Erros recentes (memória) ────────────────────────────────────────────────
const MAX_ERROS = 30;
const erros = [];
let total5xx = 0;
let totalErros = 0;
const inicioContagem = Date.now();

function registrarErro({ origem, metodo, rota, status, mensagem }) {
  totalErros += 1;
  if (status && status >= 500) total5xx += 1;
  erros.unshift({
    quando: new Date().toISOString(),
    origem: curto(origem, 60) || "servidor",
    metodo: metodo || null,
    rota: curto(rota, 160),
    status: status || null,
    mensagem: curto(mensagem, 200),
  });
  if (erros.length > MAX_ERROS) erros.length = MAX_ERROS;
}

// Middleware: anota toda resposta 5xx (menos as rotas de saúde, que o monitor externo consulta o tempo todo).
function monitorar5xx(req, res, next) {
  const jsonOriginal = res.json;
  res.json = function (corpo) {
    if (res.statusCode >= 500 && corpo && typeof corpo.message === "string") res.locals.erroMensagem = corpo.message;
    return jsonOriginal.call(this, corpo);
  };
  res.on("finish", () => {
    if (res.statusCode >= 500 && !req.path.startsWith("/api/health")) {
      registrarErro({
        origem: "http",
        metodo: req.method,
        rota: (req.baseUrl || "") + (req.route && req.route.path ? req.route.path : req.path),
        status: res.statusCode,
        mensagem: res.locals && res.locals.erroMensagem,
      });
    }
  });
  next();
}

function errosRecentes() {
  return { itens: erros.slice(), total_desde_inicio: totalErros, total_5xx_desde_inicio: total5xx, desde: new Date(inicioContagem).toISOString() };
}

module.exports = { JOBS, executar, resumoDosJobs, registrarErro, monitorar5xx, errosRecentes };
