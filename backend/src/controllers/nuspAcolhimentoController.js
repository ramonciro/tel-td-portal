/**
 * nuspAcolhimentoController.js — Núcleo de Saúde Psicossocial (NUSPSI), Pacote 2 (11/2026)
 *
 * Acolhimento individual: camada RESTRITA.
 *   - Dados administrativos (data, canal, motivo, unidade, encaminhamento, retorno) + resumo curto
 *     (até 500 caracteres) guardado CIFRADO (AES-256-GCM, lib/nuspCrypto). Sem CID e sem conteúdo clínico.
 *   - Quem lê: coordenador_nusp (todos) e analista_nusp (só os que registrou ou de que é responsável).
 *     gestor_nusp, super_admin e os demais perfis recebem 403.
 *   - Toda leitura (lista e detalhe) vai para nusp_acessos_log; toda alteração, para a auditoria
 *     (sem o texto do resumo).
 *   - Indicadores (/acolhimentos/indicadores): AGREGADOS com supressão de células < 5, liberados também
 *     ao gestor_nusp. Nunca trazem nome, matrícula nem resumo.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const crypto = require("../lib/nuspCrypto");
const B = require("../lib/nuspBase");
const { pessoaPorMatricula, auditar, paginacao } = require("./nuspController");
const { matriculaParaComparar } = require("../services/pessoasService");

const ehCoord = (c) => c.perfil === B.PERFIL_COORD;
const n = (v) => Number(v || 0);

// O resumo é orientação geral, não prontuário: bloqueia o código CID e a sigla "CID".
const RE_CID = /\bCID\b|\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/;

const podeAcessar = (c, a) =>
  ehCoord(c) || Number(a.analista_id) === Number(c.user.id) || Number(a.criado_por_id) === Number(c.user.id);

const SEM_CHAVE_MSG =
  "A chave de criptografia do Núcleo não está configurada neste ambiente. Registre o acolhimento sem resumo ou avise o responsável técnico.";

async function nomeDoUsuario(id, empresaId) {
  const [r] = await pool.query(`SELECT nome FROM usuarios WHERE id = ? AND empresa_id = ? LIMIT 1`, [id, empresaId]);
  return r[0]?.nome || null;
}

async function conferirCadastros(d, empresaId, conn = pool) {
  if (!(await B.existeNaEmpresa("nusp_motivos", d.motivo_id, empresaId, conn))) return "Motivo inválido";
  if (!(await B.existeNaEmpresa("nusp_encaminhamentos", d.encaminhamento_id, empresaId, conn))) return "Encaminhamento inválido";
  if (!(await B.existeNaEmpresa("nusp_programas", d.programa_id, empresaId, conn))) return "Programa inválido";
  if (!(await B.existeNaEmpresa("nusp_unidades", d.unidade_id, empresaId, conn))) return "Unidade inválida";
  return null;
}

/** Valida o corpo. `resumo`: undefined = não mexer; "" = apagar; texto = (re)gravar. */
function validar(b, { atual = null } = {}) {
  const erros = [];
  const d = {};
  const dt = B.dataISO(b.data_acolhimento);
  if (!dt) erros.push("Data do acolhimento é obrigatória e deve ser válida");
  else if (dt > B.hojeISO()) erros.push("A data do acolhimento não pode ser futura");
  else if (dt < "2000-01-01") erros.push("Data do acolhimento inválida");
  d.data_acolhimento = dt || null;
  d.canal = B.opcao(b.canal, B.CANAIS_ACOLHIMENTO, "Canal", erros, { obrigatorio: true });
  d.origem = B.opcao(b.origem, B.ORIGENS_ACOLHIMENTO, "Origem", erros);
  d.status = B.opcao(b.status, B.STATUS_ACOLHIMENTO, "Status", erros, { padrao: atual?.status || "aberto" });
  d.motivo_id = B.inteiroOuNulo(b.motivo_id, "Motivo", erros);
  d.encaminhamento_id = B.inteiroOuNulo(b.encaminhamento_id, "Encaminhamento", erros);
  d.programa_id = B.inteiroOuNulo(b.programa_id, "Programa", erros);
  d.unidade_id = B.inteiroOuNulo(b.unidade_id, "Unidade", erros);
  const ret = B.dataISO(b.data_retorno);
  if (ret === undefined) erros.push("Data de retorno inválida");
  d.data_retorno = ret || null;
  if (d.data_retorno && d.data_acolhimento && d.data_retorno < d.data_acolhimento) erros.push("O retorno não pode ser anterior ao acolhimento");

  let resumo;
  if (b.resumo !== undefined) {
    const t = b.resumo === null ? "" : String(b.resumo).trim();
    if (t.length > B.RESUMO_MAX) erros.push(`O resumo deve ter no máximo ${B.RESUMO_MAX} caracteres`);
    else if (RE_CID.test(t)) erros.push("O resumo não deve conter código CID nem diagnóstico. Descreva só a orientação geral, sem detalhe clínico.");
    resumo = t;
  }
  return { erros, d, resumo };
}

const SQL_LINHA = `
  a.id, a.data_acolhimento, a.canal, a.origem, a.status, a.data_retorno, a.analista_id, a.analista_nome, a.origem_registro,
  a.motivo_id, a.encaminhamento_id, a.programa_id, a.unidade_id, (a.resumo_cifrado IS NOT NULL) AS tem_resumo,
  p.nome AS pessoa_nome, p.matricula AS pessoa_matricula,
  m.nome AS motivo, e.nome AS encaminhamento, u.nome AS unidade, pr.nome AS programa`;
const SQL_JOINS = `
  FROM nusp_acolhimentos a
  JOIN pessoas p ON p.id = a.pessoa_id AND p.empresa_id = a.empresa_id
  LEFT JOIN nusp_motivos m ON m.id = a.motivo_id
  LEFT JOIN nusp_encaminhamentos e ON e.id = a.encaminhamento_id
  LEFT JOIN nusp_unidades u ON u.id = a.unidade_id
  LEFT JOIN nusp_programas pr ON pr.id = a.programa_id`;

function filtros(c, q, { restrito }) {
  const w = ["a.empresa_id = ?"];
  const p = [c.empresaId];
  const de = B.dataISO(q.de); const ate = B.dataISO(q.ate);
  if (de) { w.push("a.data_acolhimento >= ?"); p.push(de); }
  if (ate) { w.push("a.data_acolhimento <= ?"); p.push(ate); }
  for (const [campo, col] of [["programa_id", "a.programa_id"], ["unidade_id", "a.unidade_id"], ["motivo_id", "a.motivo_id"], ["encaminhamento_id", "a.encaminhamento_id"]]) {
    const v = parseInt(q[campo], 10);
    if (v > 0) { w.push(`${col} = ?`); p.push(v); }
  }
  if (q.canal && B.valores(B.CANAIS_ACOLHIMENTO).includes(String(q.canal))) { w.push("a.canal = ?"); p.push(String(q.canal)); }
  if (restrito) {
    if (q.status && B.valores(B.STATUS_ACOLHIMENTO).includes(String(q.status))) { w.push("a.status = ?"); p.push(String(q.status)); }
    if (ehCoord(c)) {
      const an = parseInt(q.analista_id, 10);
      if (an > 0) { w.push("a.analista_id = ?"); p.push(an); }
    } else {
      w.push("(a.analista_id = ? OR a.criado_por_id = ?)"); p.push(c.user.id, c.user.id);
    }
    const busca = String(q.q || "").trim();
    if (busca) { w.push("(p.matricula LIKE ? OR p.nome LIKE ?)"); p.push(`%${busca}%`, `%${busca}%`); }
  }
  return { where: w.join(" AND "), params: p };
}

// ═══════════════════════════════════════════════════════════════════════
// Camada restrita
// ═══════════════════════════════════════════════════════════════════════
async function listar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    await B.garantirBase(c.empresaId);
    const f = filtros(c, req.query, { restrito: true });
    const { limite, offset, pagina } = paginacao(req.query);
    const [[t]] = await pool.query(`SELECT COUNT(*) total ${SQL_JOINS} WHERE ${f.where}`, f.params);
    const [rows] = await pool.query(
      `SELECT ${SQL_LINHA} ${SQL_JOINS} WHERE ${f.where} ORDER BY a.data_acolhimento DESC, a.id DESC LIMIT ? OFFSET ?`,
      [...f.params, limite, offset]
    );
    await B.registrarLeitura(req, c.empresaId, "acolhimento_lista", null, `${rows.length} de ${n(t.total)} registro(s)`);
    return res.json({
      ok: true, total: n(t.total), pagina, limite, chave_configurada: crypto.chaveConfigurada(),
      itens: rows.map((r) => ({ ...r, tem_resumo: !!r.tem_resumo })),
    });
  } catch (e) {
    console.error("[nusp.acolhimento.listar]", e);
    return B.erro(res, 500, "Erro ao listar os acolhimentos");
  }
}

async function carregar(id, empresaId) {
  const [r] = await pool.query(`SELECT * FROM nusp_acolhimentos WHERE id = ? AND empresa_id = ? LIMIT 1`, [id, empresaId]);
  return r[0] || null;
}

async function detalhe(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    const id = parseInt(req.params.id, 10);
    const a = id > 0 ? await carregar(id, c.empresaId) : null;
    // Registro de outro analista responde igual a "não existe": não confirma que ele está lá.
    if (!a || !podeAcessar(c, a)) return B.erro(res, 404, "Acolhimento não encontrado");
    const [rows] = await pool.query(`SELECT ${SQL_LINHA} ${SQL_JOINS} WHERE a.id = ? AND a.empresa_id = ?`, [id, c.empresaId]);
    const item = { ...rows[0], tem_resumo: !!rows[0].tem_resumo, resumo: null, resumo_indisponivel: null };
    if (a.resumo_cifrado) {
      const r = crypto.decifrar(a.resumo_cifrado, c.empresaId);
      if (r.erro) item.resumo_indisponivel = r.erro;
      else item.resumo = r.texto;
    }
    await B.registrarLeitura(req, c.empresaId, "acolhimento", id, a.resumo_cifrado ? "com resumo" : "sem resumo");
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("[nusp.acolhimento.detalhe]", e);
    return B.erro(res, 500, "Erro ao abrir o acolhimento");
  }
}

async function criar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    await B.garantirBase(c.empresaId);
    const b = req.body || {};
    const { erros, d, resumo } = validar(b);
    const mat = String(b.matricula || "").trim();
    if (!mat) erros.push("Matrícula é obrigatória");
    if (resumo && !crypto.chaveConfigurada()) return B.erro(res, 503, SEM_CHAVE_MSG, { codigo: "SEM_CHAVE" });
    let analistaId = c.user.id;
    if (ehCoord(c) && b.analista_id) {
      analistaId = B.inteiroOuNulo(b.analista_id, "Analista", erros);
    }
    if (!erros.length) {
      const e1 = await conferirCadastros(d, c.empresaId);
      if (e1) erros.push(e1);
      if (ehCoord(c) && analistaId && !(await nomeDoUsuario(analistaId, c.empresaId))) erros.push("Analista inválido");
    }
    if (erros.length) return B.erro(res, 400, erros[0], { erros });

    const analistaNome = (await nomeDoUsuario(analistaId, c.empresaId)) || c.user.nome || null;
    const cifrado = resumo ? crypto.cifrar(resumo, c.empresaId) : null;
    let id = null;
    let falha = null;
    await comTransacao(async (conn) => {
      const r = await pessoaPorMatricula(conn, c.empresaId, mat, b.nome);
      if (r.erro) { falha = r.erro; return; }
      const [ins] = await conn.query(
        `INSERT INTO nusp_acolhimentos (empresa_id, pessoa_id, data_acolhimento, canal, origem, motivo_id, unidade_id, programa_id, encaminhamento_id,
           resumo_cifrado, resumo_ver, data_retorno, status, analista_id, analista_nome, origem_registro, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
        [c.empresaId, r.pessoa.id, d.data_acolhimento, d.canal, d.origem, d.motivo_id, d.unidade_id, d.programa_id, d.encaminhamento_id,
         cifrado, crypto.VERSAO, d.data_retorno, d.status, analistaId, analistaNome, c.user.id]
      );
      id = ins.insertId;
    });
    if (falha) return B.erro(res, 400, falha);
    // A auditoria registra o fato, nunca o texto do resumo nem o nome da pessoa.
    auditar(req, "criar", "nusp_acolhimento", id, "Registrou acolhimento individual no Núcleo", null, { ...d, resumo_registrado: !!cifrado });
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e.codigo === "SEM_CHAVE") return B.erro(res, 503, SEM_CHAVE_MSG, { codigo: "SEM_CHAVE" });
    console.error("[nusp.acolhimento.criar]", e);
    return B.erro(res, 500, "Erro ao registrar o acolhimento");
  }
}

async function editar(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    const id = parseInt(req.params.id, 10);
    const a = id > 0 ? await carregar(id, c.empresaId) : null;
    if (!a || !podeAcessar(c, a)) return B.erro(res, 404, "Acolhimento não encontrado");
    const b = req.body || {};
    const { erros, d, resumo } = validar({ ...b, data_acolhimento: b.data_acolhimento ?? a.data_acolhimento }, { atual: a });
    if (resumo && !crypto.chaveConfigurada()) return B.erro(res, 503, SEM_CHAVE_MSG, { codigo: "SEM_CHAVE" });
    let analistaId = a.analista_id;
    let analistaNome = a.analista_nome;
    if (ehCoord(c) && b.analista_id !== undefined && b.analista_id !== "" && Number(b.analista_id) !== Number(a.analista_id)) {
      const novo = B.inteiroOuNulo(b.analista_id, "Analista", erros);
      const nome = novo ? await nomeDoUsuario(novo, c.empresaId) : null;
      if (novo && !nome) erros.push("Analista inválido");
      else if (novo) { analistaId = novo; analistaNome = nome; }
    }
    if (!erros.length) {
      const e1 = await conferirCadastros(d, c.empresaId);
      if (e1) erros.push(e1);
    }
    if (erros.length) return B.erro(res, 400, erros[0], { erros });

    let cifrado = a.resumo_cifrado;
    let resumoMudou = false;
    if (resumo !== undefined) {
      cifrado = resumo ? crypto.cifrar(resumo, c.empresaId) : null;
      resumoMudou = true;
    }
    // Ficha de pessoa sem matrícula (importada por nome): permite completar a matrícula, se ninguém mais a usa.
    const novaMat = String(b.matricula || "").trim();
    if (novaMat) {
      const [pr] = await pool.query(`SELECT id, matricula FROM pessoas WHERE id = ? AND empresa_id = ? LIMIT 1`, [a.pessoa_id, c.empresaId]);
      if (pr[0] && !String(pr[0].matricula || "").trim()) {
        const norm = matriculaParaComparar(novaMat);
        const [outras] = await pool.query(`SELECT id, matricula FROM pessoas WHERE empresa_id = ? AND id <> ? AND matricula IS NOT NULL AND matricula <> ''`, [c.empresaId, a.pessoa_id]);
        if (outras.some((o) => matriculaParaComparar(o.matricula) === norm)) return B.erro(res, 400, "Essa matrícula já pertence a outra pessoa do cadastro.");
        await pool.query(`UPDATE pessoas SET matricula = ? WHERE id = ? AND empresa_id = ?`, [novaMat, a.pessoa_id, c.empresaId]);
        auditar(req, "editar", "pessoa", a.pessoa_id, "Completou a matrícula de pessoa atendida no Núcleo", null, { matricula_completada: true });
      }
    }
    await pool.query(
      `UPDATE nusp_acolhimentos SET data_acolhimento = ?, canal = ?, origem = ?, motivo_id = ?, unidade_id = ?, programa_id = ?, encaminhamento_id = ?,
         data_retorno = ?, status = ?, analista_id = ?, analista_nome = ?, resumo_cifrado = ?, resumo_ver = ? WHERE id = ? AND empresa_id = ?`,
      [d.data_acolhimento, d.canal, d.origem, d.motivo_id, d.unidade_id, d.programa_id, d.encaminhamento_id, d.data_retorno, d.status,
       analistaId, analistaNome, cifrado, crypto.VERSAO, id, c.empresaId]
    );
    const { resumo_cifrado, ...antes } = a;
    auditar(req, "editar", "nusp_acolhimento", id, "Editou acolhimento individual no Núcleo", antes, { ...d, resumo_alterado: resumoMudou });
    return res.json({ ok: true });
  } catch (e) {
    if (e.codigo === "SEM_CHAVE") return B.erro(res, 503, SEM_CHAVE_MSG, { codigo: "SEM_CHAVE" });
    console.error("[nusp.acolhimento.editar]", e);
    return B.erro(res, 500, "Erro ao editar o acolhimento");
  }
}

async function excluir(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    if (!ehCoord(c)) return B.erro(res, 403, "Só o coordenador do Núcleo exclui acolhimentos.");
    const id = parseInt(req.params.id, 10);
    const a = id > 0 ? await carregar(id, c.empresaId) : null;
    if (!a) return B.erro(res, 404, "Acolhimento não encontrado");
    await pool.query(`DELETE FROM nusp_acolhimentos WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    const { resumo_cifrado, ...antes } = a;
    auditar(req, "excluir", "nusp_acolhimento", id, "Excluiu acolhimento individual do Núcleo", antes, null);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[nusp.acolhimento.excluir]", e);
    return B.erro(res, 500, "Erro ao excluir o acolhimento");
  }
}

/** Registro de leituras restritas (só coordenador). */
async function acessos(req, res) {
  const c = B.contextoRestrito(req, res); if (!c) return;
  try {
    if (!ehCoord(c)) return B.erro(res, 403, "Só o coordenador do Núcleo consulta o registro de acessos.");
    const { limite, offset, pagina } = paginacao(req.query);
    const w = ["empresa_id = ?"]; const p = [c.empresaId];
    const rec = String(req.query.recurso || "").trim();
    if (rec) { w.push("recurso = ?"); p.push(rec); }
    const us = parseInt(req.query.usuario_id, 10);
    if (us > 0) { w.push("usuario_id = ?"); p.push(us); }
    const de = B.dataISO(req.query.de); const ate = B.dataISO(req.query.ate);
    if (de) { w.push("created_at >= ?"); p.push(`${de} 00:00:00`); }
    if (ate) { w.push("created_at <= ?"); p.push(`${ate} 23:59:59`); }
    const [[t]] = await pool.query(`SELECT COUNT(*) total FROM nusp_acessos_log WHERE ${w.join(" AND ")}`, p);
    const [rows] = await pool.query(
      `SELECT id, usuario_id, usuario_nome, perfil, recurso, registro_id, detalhe, created_at FROM nusp_acessos_log
        WHERE ${w.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`, [...p, limite, offset]);
    return res.json({ ok: true, total: n(t.total), pagina, limite, itens: rows });
  } catch (e) {
    console.error("[nusp.acolhimento.acessos]", e);
    return B.erro(res, 500, "Erro ao consultar o registro de acessos");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Indicadores agregados (supressão de células < MINIMO_CELULA)
// ═══════════════════════════════════════════════════════════════════════
/**
 * Recebe [{nome, n}] e devolve {linhas, demais, oculto}.
 * Células com menos de `min` registros são reunidas numa linha "Demais" que só aparece se somar
 * `min` ou mais e tiver ao menos 2 categorias; quando só uma célula ficaria escondida, a menor das
 * visíveis é reunida junto (supressão complementar), para o total não revelar o valor escondido.
 */
function suprimir(rows, min, rotuloDemais) {
  const pequenos = rows.filter((r) => r.n < min);
  if (!pequenos.length) return { linhas: rows, demais: null, oculto: false };
  const ord = [...rows].sort((a, b) => a.n - b.n);
  const dobrados = new Set();
  let soma = 0;
  for (const r of ord) {
    if (r.n < min || dobrados.size < 2 || soma < min) { dobrados.add(r); soma += r.n; } else break;
  }
  const linhas = rows.filter((r) => !dobrados.has(r));
  if (soma < min) return { linhas: [], demais: null, oculto: true };
  return { linhas, demais: { nome: rotuloDemais, n: soma, categorias: dobrados.size }, oculto: false };
}

async function indicadores(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    await B.garantirBase(c.empresaId);
    const hoje = B.hojeISO();
    const q = { ...req.query, de: B.dataISO(req.query.de) || `${hoje.slice(0, 4)}-01-01`, ate: B.dataISO(req.query.ate) || hoje };
    const f = filtros(c, q, { restrito: false });
    const MIN = B.MINIMO_CELULA;
    const [[tot]] = await pool.query(
      `SELECT COUNT(*) registros, COUNT(DISTINCT a.pessoa_id) pessoas FROM nusp_acolhimentos a WHERE ${f.where}`, f.params);
    const base = { ok: true, minimo: MIN, periodo: { de: q.de, ate: q.ate } };
    if (n(tot.registros) < MIN) {
      return res.json({ ...base, insuficiente: true, total: null, pessoas: null, recorrentes: null, por_mes: null, por_unidade: null, por_programa: null, por_motivo: null, por_canal: null, por_encaminhamento: null });
    }
    const [[rec]] = await pool.query(
      `SELECT COUNT(*) pessoas FROM (SELECT a.pessoa_id FROM nusp_acolhimentos a WHERE ${f.where} GROUP BY a.pessoa_id HAVING COUNT(*) >= 2) x`, f.params);
    const agrupar = async (sqlNome, joins, chave, rotulo, ordem = "n DESC, nome") => {
      const [rows] = await pool.query(
        `SELECT ${sqlNome} AS nome, COUNT(*) AS n FROM nusp_acolhimentos a ${joins} WHERE ${f.where} GROUP BY ${chave} ORDER BY ${ordem}`, f.params);
      return suprimir(rows.map((r) => ({ nome: r.nome, n: n(r.n) })), MIN, rotulo);
    };
    const rotCanal = Object.fromEntries(B.CANAIS_ACOLHIMENTO.map((x) => [x.value, x.label]));
    const [mes, unidade, programa, motivo, canal, enc] = await Promise.all([
      agrupar("DATE_FORMAT(a.data_acolhimento, '%Y-%m')", "", "DATE_FORMAT(a.data_acolhimento, '%Y-%m')", "Demais meses (cada um com menos de 5)", "nome"),
      agrupar("COALESCE(u.nome, 'Não informada')", "LEFT JOIN nusp_unidades u ON u.id = a.unidade_id", "a.unidade_id, u.nome", "Demais unidades (cada uma com menos de 5)"),
      agrupar("COALESCE(p.nome, 'Não informado')", "LEFT JOIN nusp_programas p ON p.id = a.programa_id", "a.programa_id, p.nome", "Demais programas (cada um com menos de 5)"),
      agrupar("COALESCE(m.nome, 'Não informado')", "LEFT JOIN nusp_motivos m ON m.id = a.motivo_id", "a.motivo_id, m.nome", "Demais motivos (cada um com menos de 5)"),
      agrupar("a.canal", "", "a.canal", "Demais canais (cada um com menos de 5)"),
      agrupar("COALESCE(e.nome, 'Não informado')", "LEFT JOIN nusp_encaminhamentos e ON e.id = a.encaminhamento_id", "a.encaminhamento_id, e.nome", "Demais encaminhamentos (cada um com menos de 5)"),
    ]);
    canal.linhas = canal.linhas.map((r) => ({ ...r, nome: rotCanal[r.nome] || r.nome }));
    return res.json({
      ...base, insuficiente: false,
      total: n(tot.registros),
      pessoas: n(tot.pessoas) >= MIN ? n(tot.pessoas) : null,
      recorrentes: n(rec.pessoas) >= MIN ? n(rec.pessoas) : null,
      por_mes: mes, por_unidade: unidade, por_programa: programa, por_motivo: motivo, por_canal: canal, por_encaminhamento: enc,
    });
  } catch (e) {
    console.error("[nusp.acolhimento.indicadores]", e);
    return B.erro(res, 500, "Erro ao calcular os indicadores de acolhimento");
  }
}

module.exports = { listar, detalhe, criar, editar, excluir, acessos, indicadores, suprimir };
