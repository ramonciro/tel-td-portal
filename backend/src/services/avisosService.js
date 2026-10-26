/**
 * avisosService.js — sino de avisos dentro do portal (21/10/2026)
 *
 * Alternativa aos e-mails (que dependem da verificação de domínio no serviço de
 * envio): o mesmo tipo de pendência que vai no resumo diário aparece num sino no
 * cabeçalho, para cada perfil, sem enviar nada para fora.
 *
 * Modelo "aviso vivo": cada aviso tem uma chave (ex.: "chamadas-pendentes") e um
 * valor (quantidade). A cada consulta o portal recalcula o que está pendente para
 * a pessoa e:
 *   - cria/atualiza os avisos que continuam valendo;
 *   - volta a marcar como NÃO lido se o aviso reapareceu ou se a quantidade subiu;
 *   - marca como resolvido o que deixou de ser verdade (some do sino).
 * O cálculo pesado (resumo da empresa) é guardado em memória por 10 minutos.
 */
const pool = require("../lib/db");
const { mapaAdicionais, adicionaisDisponiveis } = require("../lib/instrutoresTurma");

const CACHE_RESUMO_MS = 10 * 60 * 1000;
const cacheResumo = new Map(); // empresaId -> { quando, dados }
const ultimaSync = new Map(); // usuarioId -> timestamp
const SYNC_MIN_MS = 60 * 1000;

const PERFIS_GESTAO = ["coordenador", "supervisor", "superintendente"];

const norm = (v) => String(v || "").trim().toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function hojeISO(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

async function resumoEmpresa(empresaId) {
  const chave = String(empresaId ?? "global");
  const c = cacheResumo.get(chave);
  if (c && Date.now() - c.quando < CACHE_RESUMO_MS) return c.dados;
  const { montarResumoEmpresa } = require("../jobs/pendenciasDigest");
  const dados = await montarResumoEmpresa(empresaId);
  cacheResumo.set(chave, { quando: Date.now(), dados });
  return dados;
}

async function pessoaDoUsuario(userId) {
  const [r] = await pool.query("SELECT pessoa_id FROM usuarios WHERE id = ? LIMIT 1", [userId]);
  return r[0]?.pessoa_id || null;
}

/* ─── fontes por perfil ─────────────────────────────────────────────────── */

async function avisosGestao(user, empresaId, { completo }) {
  const r = await resumoEmpresa(empresaId);
  const out = [];
  if (r.chamadasPendentes.length) {
    out.push({ chave: "chamadas-pendentes", tipo: "presenca", gravidade: "atencao", valor: r.chamadasPendentes.length,
      titulo: `${plural(r.chamadasPendentes.length, "turma com chamada pendente", "turmas com chamada pendente")}`,
      mensagem: r.chamadasPendentes.slice(0, 3).map((t) => t.tema).join(" · "), link: "/presencas" });
  }
  if (completo && r.turmasCriticas.length) {
    out.push({ chave: "turmas-criticas", tipo: "presenca", gravidade: "critico", valor: r.turmasCriticas.length,
      titulo: `${plural(r.turmasCriticas.length, "turma em situação crítica", "turmas em situação crítica")}`,
      mensagem: "Presença abaixo do esperado — veja o detalhe em Presenças.", link: "/presencas" });
  }
  const venc = (r.rotina || []).filter((i) => i.severidade === "vermelho");
  if (completo && venc.length) {
    out.push({ chave: "rotina-atrasada", tipo: "rotina", gravidade: "atencao", valor: venc.length,
      titulo: `${plural(venc.length, "pendência atrasada na rotina dos instrutores", "pendências atrasadas na rotina dos instrutores")}`,
      mensagem: "Diário de bordo, avaliação individual ou provas em papel paradas.", link: "/rotina-aderencia" });
  }
  if (completo && r.capacidade.length) {
    out.push({ chave: "capacidade", tipo: "capacidade", gravidade: "info", valor: r.capacidade.length,
      titulo: `${plural(r.capacidade.length, "instrutor fora da ocupação saudável", "instrutores fora da ocupação saudável")}`,
      mensagem: r.capacidade.slice(0, 3).map((i) => i.instrutor).join(" · "), link: "/capacidade" });
  }
  return out;
}

async function avisosCodigosAcesso(empresaId) {
  const [r] = await pool.query(
    `SELECT SUM(troca_senha_obrigatoria = 1 AND codigo_acesso IS NULL) AS sem_codigo,
            SUM(troca_senha_obrigatoria = 1 AND codigo_acesso IS NOT NULL AND codigo_acesso_expira < NOW()) AS vencidos
       FROM usuarios WHERE perfil = 'treinando' AND ativo = 1 ${empresaId ? "AND empresa_id = ?" : ""}`,
    empresaId ? [empresaId] : []
  );
  const sem = Number(r[0]?.sem_codigo || 0);
  const venc = Number(r[0]?.vencidos || 0);
  const total = sem + venc;
  if (!total) return [];
  return [{ chave: "codigos-acesso", tipo: "acesso", gravidade: "info", valor: total,
    titulo: `${plural(total, "treinando precisa de código de acesso", "treinandos precisam de código de acesso")}`,
    mensagem: `${sem} sem código (senha antiga) · ${venc} com código vencido.`, link: "/usuarios/acessos" }];
}

async function avisosInstrutor(user, empresaId) {
  const out = [];
  const r = await resumoEmpresa(empresaId);
  // TBT: quem é instrutor adicional da turma também recebe o aviso dela.
  const adic = await mapaAdicionais(empresaId);
  const meu = (turmaId, principal) => norm(principal) === norm(user.nome) || (adic.get(Number(turmaId)) || []).some((n) => norm(n) === norm(user.nome));
  const minhas = r.chamadasPendentes.filter((t) => meu(t.id, t.instrutor));
  if (minhas.length) {
    out.push({ chave: "chamadas-pendentes", tipo: "presenca", gravidade: "atencao", valor: minhas.length,
      titulo: `${plural(minhas.length, "chamada pendente", "chamadas pendentes")}`,
      mensagem: minhas.slice(0, 3).map((t) => t.tema).join(" · "), link: "/presencas" });
  }
  const pend = (r.rotina || []).filter((i) => meu(i.turma_id, i.instrutor));
  if (pend.length) {
    const atras = pend.filter((i) => i.severidade === "vermelho").length;
    out.push({ chave: "rotina-pendente", tipo: "rotina", gravidade: atras ? "atencao" : "info", valor: pend.length,
      titulo: `${plural(pend.length, "pendência na sua rotina", "pendências na sua rotina")}${atras ? ` (${atras} atrasada${atras > 1 ? "s" : ""})` : ""}`,
      mensagem: pend.slice(0, 2).map((i) => `${i.tema}: ${i.texto}`).join(" · "), link: "/minhas-atividades" });
  }
  const comAdic = await adicionaisDisponiveis();
  const [aulas] = await pool.query(
    `SELECT ta.data_aula, t.tema, t.cliente FROM turma_aulas ta JOIN treinamentos t ON t.id = ta.treinamento_id
      WHERE ta.data_aula BETWEEN ? AND ? AND ta.status_execucao NOT IN ('cancelada','concluida')
        AND (LOWER(TRIM(ta.instrutor_responsavel)) = ?${comAdic ? ` OR EXISTS (SELECT 1 FROM treinamento_instrutores ti
              WHERE ti.treinamento_id = t.id AND LOWER(TRIM(ti.instrutor)) = ?)` : ""})
        ${empresaId ? "AND t.empresa_id = ?" : ""}
      ORDER BY ta.data_aula`,
    [hojeISO(0), hojeISO(1), norm(user.nome), ...(comAdic ? [norm(user.nome)] : []), ...(empresaId ? [empresaId] : [])]
  );
  if (aulas.length) {
    out.push({ chave: "aulas-proximas", tipo: "aula", gravidade: "info", valor: aulas.length,
      titulo: `${plural(aulas.length, "aula", "aulas")} hoje ou amanhã`,
      mensagem: aulas.slice(0, 3).map((a) => `${a.tema}${a.cliente ? " — " + a.cliente : ""}`).join(" · "), link: "/minhas-turmas" });
  }
  return out;
}

async function avisosTreinando(user, empresaId) {
  const out = [];
  const pessoaId = await pessoaDoUsuario(user.id);
  const filtroPart = pessoaId ? "(tp.pessoa_id = ? OR (tp.pessoa_id IS NULL AND LOWER(TRIM(tp.nome)) = ?))" : "LOWER(TRIM(tp.nome)) = ?";
  const paramsPart = pessoaId ? [pessoaId, norm(user.nome)] : [norm(user.nome)];
  const emp = empresaId ? "AND t.empresa_id = ?" : "";
  const pEmp = empresaId ? [empresaId] : [];

  const [aulas] = await pool.query(
    `SELECT DISTINCT ta.id, ta.data_aula, t.tema FROM turma_aulas ta
       JOIN treinamentos t ON t.id = ta.treinamento_id
       JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      WHERE ${filtroPart} ${emp} AND ta.data_aula BETWEEN ? AND ?
        AND ta.status_execucao NOT IN ('cancelada','concluida')
      ORDER BY ta.data_aula`,
    [...paramsPart, ...pEmp, hojeISO(0), hojeISO(1)]
  );
  if (aulas.length) {
    const hoje = aulas.some((a) => String(a.data_aula).slice(0, 10) === hojeISO(0) || new Date(a.data_aula).toDateString() === new Date().toDateString());
    out.push({ chave: "aulas-proximas", tipo: "aula", gravidade: "info", valor: aulas.length,
      titulo: hoje ? "Você tem aula hoje" : "Você tem aula amanhã",
      mensagem: [...new Set(aulas.map((a) => a.tema))].slice(0, 3).join(" · "), link: "/minhas-turmas" });
  }

  try {
    const [pubs] = await pool.query(
      `SELECT COUNT(DISTINCT tpub.id) AS n FROM turma_publicacoes tpub
         JOIN treinamentos t ON t.id = tpub.treinamento_id
         JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
        WHERE ${filtroPart} ${emp} AND tpub.criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [...paramsPart, ...pEmp]
    );
    const n = Number(pubs[0]?.n || 0);
    if (n) out.push({ chave: "mural-novo", tipo: "mural", gravidade: "info", valor: n,
      titulo: `${plural(n, "recado novo no mural da sua turma", "recados novos no mural das suas turmas")}`,
      mensagem: "Publicados nos últimos 7 dias.", link: "/minhas-turmas" });
  } catch (_) { /* tabela do mural ainda não existe: sem aviso */ }

  const [certs] = await pool.query(
    `SELECT COUNT(*) AS n FROM certificados
      WHERE emitido_em >= DATE_SUB(NOW(), INTERVAL 14 DAY) ${empresaId ? "AND empresa_id = ?" : ""}
        AND ((usuario_email IS NOT NULL AND usuario_email = ?) OR (usuario_email IS NULL AND LOWER(TRIM(usuario_nome)) = ?))`,
    [...(empresaId ? [empresaId] : []), user.email || "", norm(user.nome)]
  );
  const nc = Number(certs[0]?.n || 0);
  if (nc) out.push({ chave: "certificado-novo", tipo: "certificado", gravidade: "info", valor: nc,
    titulo: `${plural(nc, "certificado disponível", "certificados disponíveis")}`,
    mensagem: "Emitidos nos últimos 14 dias.", link: "/certificados" });
  return out;
}

async function avisosRS(user, empresaId) {
  if (!empresaId) return [];
  const { listarAtrasadas } = require("../jobs/rsAtrasadasDigest");
  const itens = await listarAtrasadas(empresaId);
  if (!itens.length) return [];
  return [{ chave: "rps-atrasadas", tipo: "rs", gravidade: "atencao", valor: itens.length,
    titulo: `${plural(itens.length, "RP em andamento além do prazo", "RPs em andamento além do prazo")}`,
    mensagem: itens.slice(0, 2).map((r) => `${r.produto} · ${r.site} (${r.dias} dias)`).join(" · "), link: "/rs/rps" }];
}


/* ─── Radar preventivo (Pacote 1): prontidão da turma + risco de certificação ─── */
const CACHE_PREV_MS = 5 * 60 * 1000;
const cachePrev = new Map();

async function avisosPreventivo(user, empresaId) {
  const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
  const P = require("./preventivoService");
  const instrutor = norm(user.perfil) === "instrutor" ? user.nome : undefined;
  const k = `${empresaId ?? "g"}|${instrutor || ""}|${norm(user.perfil)}|${norm(user.cliente)}`;
  const c = cachePrev.get(k);
  let dados;
  if (c && Date.now() - c.quando < CACHE_PREV_MS) dados = c.dados;
  else {
    const podeVer = (t) => usuarioTemAcessoAoCliente({ user }, t.cliente);
    const [pr, rc] = await Promise.all([
      P.calcularProntidao({ empresaId, instrutor, podeVer, dias: 7 }),
      P.calcularRiscoCertificacao({ empresaId, instrutor, podeVer }),
    ]);
    dados = { pr, rc };
    cachePrev.set(k, { quando: Date.now(), dados });
    if (cachePrev.size > 500) cachePrev.clear();
  }
  const out = [];
  const { pr, rc } = dados;
  if (pr.turmas.length) {
    const graves = pr.turmas.filter((t) => t.gravidade === "critica").length;
    out.push({ chave: "prontidao-turmas", tipo: "prontidao", gravidade: graves ? "critico" : "atencao", valor: pr.turmas.length,
      titulo: `${plural(pr.turmas.length, "turma começa em até 7 dias com pendência", "turmas começam em até 7 dias com pendência")}`,
      mensagem: pr.turmas.slice(0, 3).map((t) => `${t.tema} (${t.dias_para_inicio === 0 ? "hoje" : `em ${t.dias_para_inicio}d`}): ${t.itens[0].titulo.toLowerCase()}`).join(" · "),
      link: "/radar" });
  }
  const urgentes = rc.resumo.pessoas_perderam + rc.resumo.pessoas_no_limite;
  if (urgentes) {
    out.push({ chave: "risco-certificacao", tipo: "certificacao", gravidade: rc.resumo.pessoas_perderam ? "critico" : "atencao", valor: urgentes,
      titulo: `${plural(urgentes, "participante em risco de não certificar", "participantes em risco de não certificar")}`,
      mensagem: `${rc.resumo.pessoas_perderam} já não alcançam a presença mínima · ${rc.resumo.pessoas_no_limite} no limite. ${rc.turmas.slice(0, 2).map((t) => t.tema).join(" · ")}`,
      link: "/radar" });
  }
  return out;
}

/* ─── Radar preventivo (Pacote 2): carga futura e demanda do R&S (só gestão e assistente) ─── */
async function avisosPreventivoCarga(user, empresaId) {
  const C = require("./preventivoCargaService");
  const k = `carga|${empresaId ?? "g"}`;
  const c = cachePrev.get(k);
  let dados;
  if (c && Date.now() - c.quando < CACHE_PREV_MS) dados = c.dados;
  else {
    const [cf, rs] = await Promise.all([C.calcularCargaFutura({ empresaId }), C.calcularDemandaRS({ empresaId })]);
    dados = { cf, rs };
    cachePrev.set(k, { quando: Date.now(), dados });
  }
  const { cf, rs } = dados;
  const out = [];
  const alertas = cf.resumo.alertas;
  if (alertas) {
    const crit = cf.instrutores.some((i) => i.gravidade === "critica");
    const partes = [];
    if (cf.resumo.instrutores_sobrecarga) partes.push(`${plural(cf.resumo.instrutores_sobrecarga, "instrutor em sobrecarga", "instrutores em sobrecarga")}`);
    if (cf.resumo.instrutores_semana_pico) partes.push(`${plural(cf.resumo.instrutores_semana_pico, "com semana de pico", "com semana de pico")}`);
    if (cf.resumo.salas_saturadas) partes.push(`${plural(cf.resumo.salas_saturadas, "sala saturada", "salas saturadas")}`);
    out.push({ chave: "carga-futura", tipo: "carga", gravidade: crit ? "critico" : "atencao", valor: alertas,
      titulo: `${plural(alertas, "alerta de carga futura (instrutores e salas)", "alertas de carga futura (instrutores e salas)")}`,
      mensagem: partes.join(" · ") || cf.instrutores.filter((i) => i.gravidade).slice(0, 3).map((i) => i.instrutor).join(" · "), link: "/radar?aba=carga" });
  }
  const semTurma = rs.resumo.avaliacoes_sem_turma;
  const bercoAlto = rs.berco.filter((b) => b.gravidade === "alta").length;
  if (semTurma || bercoAlto) {
    const partes = [];
    if (semTurma) partes.push(`${plural(semTurma, "Avaliação Técnica do R&S sem turma agendada", "Avaliações Técnicas do R&S sem turma agendada")} (${rs.resumo.candidatos_sem_turma} candidato(s))`);
    if (bercoAlto) partes.push(`${plural(bercoAlto, "berço parado há 30 dias ou mais", "berços parados há 30 dias ou mais")}`);
    const crit = rs.avaliacoes.some((a) => a.gravidade === "critica");
    out.push({ chave: "demanda-rs", tipo: "demanda_rs", gravidade: crit ? "critico" : "atencao", valor: semTurma + bercoAlto,
      titulo: `R&S pede turma: ${partes[0]}`, mensagem: partes.join(" · "), link: "/radar?aba=rs" });
  }
  return out;
}

const FONTES_EXTRAS = []; // outros módulos (ex.: Oficina de Talentos) registram aqui
function registrarFonte(fn) { FONTES_EXTRAS.push(fn); }

async function calcular(user, empresaId) {
  const perfil = norm(user.perfil);
  const out = [];
  if (PERFIS_GESTAO.includes(perfil)) out.push(...(await avisosGestao(user, empresaId, { completo: true })));
  if (["coordenador", "supervisor", "assistente_treinamento"].includes(perfil)) out.push(...(await avisosCodigosAcesso(empresaId)));
  if (perfil === "assistente_treinamento") out.push(...(await avisosGestao(user, empresaId, { completo: false })));
  if (perfil === "instrutor") out.push(...(await avisosInstrutor(user, empresaId)));
  if ([...PERFIS_GESTAO, "assistente_treinamento", "instrutor"].includes(perfil)) {
    try { out.push(...(await avisosPreventivo(user, empresaId))); }
    catch (e) { console.error("[avisos] preventivo:", e.message); }
  }
  if ([...PERFIS_GESTAO, "assistente_treinamento"].includes(perfil)) {
    try { out.push(...(await avisosPreventivoCarga(user, empresaId))); }
    catch (e) { console.error("[avisos] preventivo carga:", e.message); }
  }
  if (perfil === "treinando") out.push(...(await avisosTreinando(user, empresaId)));
  if (["coordenador_rs", "gestor_rs"].includes(perfil)) out.push(...(await avisosRS(user, empresaId)));
  if (perfil === "metodologia") out.push(...(await require("../controllers/oficinaPosController").alertasOficina(empresaId)));
  if (require("../lib/conteudoAvisos").PERFIS_CONTEUDO.includes(perfil)) {
    try { out.push(...(await require("../lib/conteudoAvisos").avisos(user, empresaId))); }
    catch (e) { console.error("[avisos] conteúdo:", e.message); }
  }
  for (const fn of FONTES_EXTRAS) {
    try { out.push(...(await fn(user, empresaId)) || []); } catch (e) { console.error("[avisos] fonte extra:", e.message); }
  }
  return out;
}

async function sincronizar(user, empresaId, { forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar && agora - (ultimaSync.get(user.id) || 0) < SYNC_MIN_MS) return;
  ultimaSync.set(user.id, agora);
  if (ultimaSync.size > 5000) ultimaSync.clear();

  const ativos = await calcular(user, empresaId);
  for (const a of ativos) {
    // A ordem das atribuições importa: lido_em é decidido com os valores ANTIGOS.
    await pool.query(
      `INSERT INTO avisos (empresa_id, usuario_id, tipo, gravidade, titulo, mensagem, link, chave, valor)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         lido_em = IF(resolvido_em IS NOT NULL OR VALUES(valor) > valor, NULL, lido_em),
         resolvido_em = NULL,
         tipo = VALUES(tipo), gravidade = VALUES(gravidade), titulo = VALUES(titulo),
         mensagem = VALUES(mensagem), link = VALUES(link), valor = VALUES(valor)`,
      [empresaId || null, user.id, a.tipo, a.gravidade || "info", a.titulo.slice(0, 200), (a.mensagem || "").slice(0, 500) || null, a.link || null, a.chave, a.valor || 0]
    );
  }
  const chaves = ativos.map((a) => a.chave);
  await pool.query(
    `UPDATE avisos SET resolvido_em = NOW()
      WHERE usuario_id = ? AND resolvido_em IS NULL ${chaves.length ? `AND chave NOT IN (${chaves.map(() => "?").join(",")})` : ""}`,
    [user.id, ...chaves]
  );
}

const ORDEM_GRAV = "FIELD(gravidade,'critico','atencao','info')";

async function listar(user) {
  const [itens] = await pool.query(
    `SELECT id, tipo, gravidade, titulo, mensagem, link, valor, lido_em, created_at
       FROM avisos WHERE usuario_id = ? AND resolvido_em IS NULL
      ORDER BY (lido_em IS NULL) DESC, ${ORDEM_GRAV}, created_at DESC LIMIT 50`,
    [user.id]
  );
  return { nao_lidos: itens.filter((i) => !i.lido_em).length, itens };
}

async function marcarLido(user, id) {
  await pool.query("UPDATE avisos SET lido_em = NOW() WHERE usuario_id = ? AND id = ? AND lido_em IS NULL", [user.id, id]);
}
async function marcarTodosLidos(user) {
  await pool.query("UPDATE avisos SET lido_em = NOW() WHERE usuario_id = ? AND lido_em IS NULL AND resolvido_em IS NULL", [user.id]);
}

module.exports = { sincronizar, listar, marcarLido, marcarTodosLidos, calcular, registrarFonte };
