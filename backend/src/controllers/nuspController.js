/**
 * nuspController.js — Núcleo de Saúde Psicossocial (NUSPSI), Pacote 1 (06/11/2026)
 *
 * Cadastros, atividades, participações, evidências, planos de ação e materiais.
 * Painel e exportação ficam em nuspPainelController.js; a importação da
 * planilha antiga, em services/nuspImportService.js.
 * CommonJS — nunca usar import/export.
 *
 * Regras de acesso (rotas em index.js + checagens aqui):
 *   coordenador_nusp : tudo do módulo, inclusive cadastros e exclusões.
 *   analista_nusp    : lança e edita o que é seu (atividades, planos, evidências, participações).
 *   gestor_nusp      : só leitura AGREGADA — nunca recebe nome de participante.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { registrarAuditoria } = require("../services/auditoria");
const { resolverPessoa, matriculaParaComparar } = require("../services/pessoasService");
const B = require("../lib/nuspBase");

const LIMITE_PADRAO = 50;
const LIMITE_MAX = 200;

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });

const ehCoord = (c) => c.perfil === B.PERFIL_COORD;
const ehOperacao = (c) => B.PERFIS_OPERACAO.includes(c.perfil);

function paginacao(q) {
  const limite = Math.min(Math.max(parseInt(q.limite, 10) || LIMITE_PADRAO, 1), LIMITE_MAX);
  const pagina = Math.max(parseInt(q.pagina, 10) || 1, 1);
  return { limite, offset: (pagina - 1) * limite, pagina };
}

// ═══════════════════════════════════════════════════════════════════════
// CADASTROS
// ═══════════════════════════════════════════════════════════════════════
async function obterCadastros(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    await B.garantirBase(c.empresaId);
    const [unidades] = await pool.query(`SELECT id, nome, cliente, ativo FROM nusp_unidades WHERE empresa_id = ? ORDER BY nome`, [c.empresaId]);
    const [programas] = await pool.query(`SELECT id, nome, tipo, descricao, ativo FROM nusp_programas WHERE empresa_id = ? ORDER BY FIELD(tipo,'nucleo','comite','projeto'), nome`, [c.empresaId]);
    const [frentes] = await pool.query(`SELECT id, programa_id, nome, ativo FROM nusp_frentes WHERE empresa_id = ? ORDER BY nome`, [c.empresaId]);
    const [dimensoes] = await pool.query(`SELECT id, nome, ordem, ativo FROM nusp_dimensoes WHERE empresa_id = ? ORDER BY ordem, nome`, [c.empresaId]);
    const [analistas] = await pool.query(
      `SELECT id, nome, perfil FROM usuarios
        WHERE empresa_id = ? AND LOWER(perfil) IN (?, ?) AND (ativo IS NULL OR ativo <> 0) ORDER BY nome`,
      [c.empresaId, B.PERFIL_COORD, B.PERFIL_ANALISTA]
    );
    return res.json({
      unidades, programas, frentes, dimensoes, analistas,
      tipos: B.TIPOS_ATIVIDADE, formatos: B.FORMATOS, status_atividade: B.STATUS_ATIVIDADE,
      status_plano: B.STATUS_PLANO, status_material: B.STATUS_MATERIAL, tipos_programa: B.TIPOS_PROGRAMA,
    });
  } catch (e) {
    console.error("[nusp.obterCadastros]", e);
    return B.erro(res, 500, "Erro ao carregar os cadastros do Núcleo");
  }
}

const CADASTROS = {
  unidades: { tabela: "nusp_unidades", rotulo: "unidade", campos: ["nome", "cliente"], unico: "nome" },
  programas: { tabela: "nusp_programas", rotulo: "programa", campos: ["nome", "tipo", "descricao"], unico: "nome" },
  frentes: { tabela: "nusp_frentes", rotulo: "frente", campos: ["nome", "programa_id"], unico: "nome" },
  dimensoes: { tabela: "nusp_dimensoes", rotulo: "dimensão", campos: ["nome", "ordem"], unico: "nome" },
};

function validarCadastro(tipo, b, erros) {
  const d = {};
  d.nome = B.texto(b.nome, tipo === "unidades" ? 120 : 150, "Nome", erros, { obrigatorio: true });
  if (tipo === "unidades") d.cliente = B.texto(b.cliente, 150, "Cliente", erros);
  if (tipo === "programas") {
    d.tipo = B.opcao(b.tipo, B.TIPOS_PROGRAMA, "Tipo", erros, { padrao: "comite" });
    d.descricao = B.texto(b.descricao, 1000, "Descrição", erros);
  }
  if (tipo === "frentes") d.programa_id = B.inteiroOuNulo(b.programa_id, "Programa", erros);
  if (tipo === "dimensoes") {
    const o = Number(b.ordem ?? 0);
    d.ordem = Number.isInteger(o) && o >= 0 && o <= 999 ? o : 0;
  }
  if ("ativo" in b) d.ativo = String(b.ativo) === "0" || b.ativo === false ? 0 : 1;
  return d;
}

async function criarCadastro(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const tipo = req.params.tipo; const def = CADASTROS[tipo];
  if (!def) return B.erro(res, 404, "Cadastro desconhecido");
  const erros = []; const d = validarCadastro(tipo, req.body || {}, erros);
  if (tipo === "frentes" && !d.programa_id) erros.push("Programa é obrigatório");
  if (erros.length) return B.erro(res, 400, erros.join("; "));
  try {
    if (tipo === "frentes" && !(await B.existeNaEmpresa("nusp_programas", d.programa_id, c.empresaId))) return B.erro(res, 400, "Programa inválido");
    const cols = Object.keys(d).filter((k) => d[k] !== undefined);
    const [r] = await pool.query(
      `INSERT INTO ${def.tabela} (empresa_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`,
      [c.empresaId, ...cols.map((k) => d[k])]
    );
    auditar(req, "criar", `nusp_${tipo}`, r.insertId, `Cadastrou ${def.rotulo} "${d.nome}" no Núcleo`, null, d);
    return res.status(201).json({ id: r.insertId, message: "Cadastro criado" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return B.erro(res, 409, `Já existe ${def.rotulo} com esse nome`);
    console.error("[nusp.criarCadastro]", e);
    return B.erro(res, 500, "Erro ao salvar o cadastro");
  }
}

async function editarCadastro(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const tipo = req.params.tipo; const def = CADASTROS[tipo];
  if (!def) return B.erro(res, 404, "Cadastro desconhecido");
  const id = Number(req.params.id);
  const erros = []; const d = validarCadastro(tipo, req.body || {}, erros);
  if (erros.length) return B.erro(res, 400, erros.join("; "));
  try {
    const [antes] = await pool.query(`SELECT * FROM ${def.tabela} WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    if (!antes.length) return B.erro(res, 404, "Registro não encontrado");
    if (tipo === "frentes" && d.programa_id && !(await B.existeNaEmpresa("nusp_programas", d.programa_id, c.empresaId))) return B.erro(res, 400, "Programa inválido");
    const cols = Object.keys(d).filter((k) => d[k] !== undefined);
    await pool.query(`UPDATE ${def.tabela} SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND empresa_id = ?`, [...cols.map((k) => d[k]), id, c.empresaId]);
    auditar(req, "editar", `nusp_${tipo}`, id, `Editou ${def.rotulo} "${d.nome}" no Núcleo`, antes[0], d);
    return res.json({ message: "Cadastro atualizado" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return B.erro(res, 409, `Já existe ${def.rotulo} com esse nome`);
    console.error("[nusp.editarCadastro]", e);
    return B.erro(res, 500, "Erro ao atualizar o cadastro");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ATIVIDADES
// ═══════════════════════════════════════════════════════════════════════
const SQL_ATIVIDADE = `
  SELECT a.id, a.programa_id, p.nome AS programa, a.frente_id, f.nome AS frente, a.tipo,
         a.dimensao_id, d.nome AS dimensao, a.unidade_id, u.nome AS unidade,
         a.analista_id, a.analista_nome, a.tema, a.publico,
         DATE_FORMAT(a.data_inicio, '%Y-%m-%d') AS data_inicio, DATE_FORMAT(a.data_fim, '%Y-%m-%d') AS data_fim,
         a.horas, a.formato, a.status, a.resultado, a.proxima_etapa, a.observacoes, a.pessoas_legado, a.origem, a.criado_por_id,
         (SELECT COUNT(*) FROM nusp_participacoes pa WHERE pa.atividade_id = a.id AND pa.presenca = 'presente') AS pessoas,
         (SELECT COUNT(*) FROM nusp_evidencias e WHERE e.empresa_id = a.empresa_id AND e.entidade = 'atividade' AND e.entidade_id = a.id) AS evidencias
    FROM nusp_atividades a
    LEFT JOIN nusp_programas p ON p.id = a.programa_id
    LEFT JOIN nusp_frentes f ON f.id = a.frente_id
    LEFT JOIN nusp_dimensoes d ON d.id = a.dimensao_id
    LEFT JOIN nusp_unidades u ON u.id = a.unidade_id`;

function filtroAtividades(c, q) {
  const w = ["a.empresa_id = ?"]; const p = [c.empresaId];
  const de = B.dataISO(q.de); const ate = B.dataISO(q.ate);
  if (de) { w.push("a.data_inicio >= ?"); p.push(de); }
  if (ate) { w.push("a.data_inicio <= ?"); p.push(ate); }
  for (const k of ["programa_id", "unidade_id", "dimensao_id", "analista_id", "frente_id"]) {
    const n = Number(q[k]); if (Number.isInteger(n) && n > 0) { w.push(`a.${k} = ?`); p.push(n); }
  }
  if (q.tipo && B.valores(B.TIPOS_ATIVIDADE).includes(String(q.tipo))) { w.push("a.tipo = ?"); p.push(String(q.tipo)); }
  if (q.status && B.valores(B.STATUS_ATIVIDADE).includes(String(q.status))) { w.push("a.status = ?"); p.push(String(q.status)); }
  if (q.q) { w.push("(a.tema LIKE ? OR a.publico LIKE ?)"); const t = `%${String(q.q).trim().slice(0, 80)}%`; p.push(t, t); }
  if (String(q.sem_evidencia) === "1") w.push("a.status = 'concluida' AND NOT EXISTS (SELECT 1 FROM nusp_evidencias e WHERE e.empresa_id = a.empresa_id AND e.entidade = 'atividade' AND e.entidade_id = a.id)");
  return { where: w.join(" AND "), params: p };
}

async function listarAtividades(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const { where, params } = filtroAtividades(c, req.query);
    const { limite, offset } = paginacao(req.query);
    const [itens] = await pool.query(`${SQL_ATIVIDADE} WHERE ${where} ORDER BY a.data_inicio DESC, a.id DESC LIMIT ? OFFSET ?`, [...params, limite, offset]);
    const [tot] = await pool.query(`SELECT COUNT(*) n FROM nusp_atividades a WHERE ${where}`, params);
    return res.json({ itens, total: Number(tot[0].n), limite });
  } catch (e) {
    console.error("[nusp.listarAtividades]", e);
    return B.erro(res, 500, "Erro ao listar as atividades");
  }
}

async function carregarAtividade(id, empresaId) {
  const [rows] = await pool.query(`${SQL_ATIVIDADE} WHERE a.id = ? AND a.empresa_id = ?`, [id, empresaId]);
  return rows[0] || null;
}

async function evidenciasDe(entidade, id, empresaId) {
  const [rows] = await pool.query(
    `SELECT id, titulo, url, criado_por_nome, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS criado_em
       FROM nusp_evidencias WHERE empresa_id = ? AND entidade = ? AND entidade_id = ? ORDER BY id`,
    [empresaId, entidade, id]
  );
  return rows;
}

async function detalheAtividade(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const a = await carregarAtividade(Number(req.params.id), c.empresaId);
    if (!a) return B.erro(res, 404, "Atividade não encontrada");
    a.lista_evidencias = await evidenciasDe("atividade", a.id, c.empresaId);
    // Gestor (diretoria) nunca recebe nome nem matrícula de participante.
    if (ehOperacao(c)) {
      const [pa] = await pool.query(
        `SELECT id, pessoa_id, nome, matricula, presenca, concluiu FROM nusp_participacoes
          WHERE atividade_id = ? AND empresa_id = ? ORDER BY nome`, [a.id, c.empresaId]);
      a.participantes = pa;
    }
    a.pode_editar = podeEditarAtividade(c, a);
    return res.json(a);
  } catch (e) {
    console.error("[nusp.detalheAtividade]", e);
    return B.erro(res, 500, "Erro ao carregar a atividade");
  }
}

function podeEditarAtividade(c, a) {
  if (ehCoord(c)) return true;
  if (c.perfil !== B.PERFIL_ANALISTA) return false;
  return Number(a.analista_id) === Number(c.user.id) || Number(a.criado_por_id) === Number(c.user.id);
}

async function nomeDoUsuario(id, empresaId) {
  const [r] = await pool.query(`SELECT nome FROM usuarios WHERE id = ? AND empresa_id = ? LIMIT 1`, [id, empresaId]);
  return r[0]?.nome || null;
}

async function validarAtividade(b, c, { atual = null } = {}) {
  const erros = [];
  const d = {};
  d.tipo = B.opcao(b.tipo, B.TIPOS_ATIVIDADE, "Tipo", erros, { obrigatorio: true });
  d.tema = B.texto(b.tema, 250, "Tema", erros, { obrigatorio: true });
  d.publico = B.texto(b.publico, 150, "Público atendido", erros);
  const ini = B.dataISO(b.data_inicio); if (!ini) erros.push("Data de início é obrigatória e deve ser válida"); d.data_inicio = ini || null;
  const fim = B.dataISO(b.data_fim); if (fim === undefined) erros.push("Data de término inválida"); d.data_fim = fim || null;
  if (d.data_inicio && d.data_fim && d.data_fim < d.data_inicio) erros.push("A data de término não pode ser anterior à de início");
  const h = b.horas === "" || b.horas === null || b.horas === undefined ? 0 : Number(String(b.horas).replace(",", "."));
  if (!Number.isFinite(h) || h < 0 || h > 999) erros.push("Horas deve ser um número entre 0 e 999"); d.horas = Number.isFinite(h) ? Math.round(h * 100) / 100 : 0;
  d.formato = B.opcao(b.formato, B.FORMATOS, "Formato", erros);
  d.status = B.opcao(b.status, B.STATUS_ATIVIDADE, "Status", erros, { padrao: atual?.status || "planejada" });
  d.resultado = B.texto(b.resultado, 1000, "Resultado", erros);
  d.proxima_etapa = B.texto(b.proxima_etapa, 300, "Próxima etapa", erros);
  d.observacoes = B.texto(b.observacoes, 1000, "Observações", erros);
  d.programa_id = B.inteiroOuNulo(b.programa_id, "Programa", erros);
  d.frente_id = B.inteiroOuNulo(b.frente_id, "Frente", erros);
  d.dimensao_id = B.inteiroOuNulo(b.dimensao_id, "Dimensão", erros);
  d.unidade_id = B.inteiroOuNulo(b.unidade_id, "Unidade", erros);
  // Analista: o coordenador pode atribuir a outro; o analista sempre fica com ele mesmo.
  let analista = ehCoord(c) ? B.inteiroOuNulo(b.analista_id, "Analista", erros) : null;
  d.analista_id = analista || atual?.analista_id || c.user.id;
  const urlEv = b.evidencia_url ? String(b.evidencia_url).trim() : "";
  if (urlEv && !B.urlValida(urlEv)) erros.push("O link da evidência deve começar com http:// ou https://");
  if (!erros.length) {
    const ref = await B.conferirReferencias(d, c.empresaId);
    if (ref) erros.push(ref);
    if (ehCoord(c) && analista && !(await nomeDoUsuario(analista, c.empresaId))) erros.push("Analista inválido");
  }
  return { erros, d, urlEv, tituloEv: b.evidencia_titulo ? String(b.evidencia_titulo).trim().slice(0, 200) : null };
}

async function criarAtividade(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const { erros, d, urlEv, tituloEv } = await validarAtividade(req.body || {}, c);
    if (!erros.length && d.status === "concluida" && !urlEv) erros.push("Para concluir, anexe ao menos uma evidência (link da lista de presença, ata, foto ou registro).");
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    d.analista_nome = await nomeDoUsuario(d.analista_id, c.empresaId);
    const id = await comTransacao(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO nusp_atividades (empresa_id, programa_id, frente_id, tipo, dimensao_id, unidade_id, analista_id, analista_nome, tema, publico,
           data_inicio, data_fim, horas, formato, status, resultado, proxima_etapa, observacoes, origem, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
        [c.empresaId, d.programa_id, d.frente_id, d.tipo, d.dimensao_id, d.unidade_id, d.analista_id, d.analista_nome, d.tema, d.publico,
         d.data_inicio, d.data_fim, d.horas, d.formato, d.status, d.resultado, d.proxima_etapa, d.observacoes, c.user.id]
      );
      if (urlEv) {
        await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'atividade', ?, ?, ?, ?, ?)`,
          [c.empresaId, r.insertId, tituloEv, urlEv, c.user.id, c.user.nome || null]);
      }
      return r.insertId;
    });
    auditar(req, "criar", "nusp_atividade", id, `Registrou atividade "${d.tema}" (${d.tipo}) no Núcleo`, null, d);
    return res.status(201).json({ id, message: "Atividade registrada" });
  } catch (e) {
    console.error("[nusp.criarAtividade]", e);
    return B.erro(res, 500, "Erro ao registrar a atividade");
  }
}

async function editarAtividade(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregarAtividade(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Atividade não encontrada");
    if (!podeEditarAtividade(c, atual)) return B.erro(res, 403, "Você só pode editar as atividades que você registrou ou das quais é responsável.");
    const { erros, d, urlEv, tituloEv } = await validarAtividade(req.body || {}, c, { atual });
    if (!erros.length && d.status === "concluida" && !urlEv && Number(atual.evidencias) === 0) {
      erros.push("Para concluir, anexe ao menos uma evidência (link da lista de presença, ata, foto ou registro).");
    }
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    d.analista_nome = d.analista_id === atual.analista_id ? atual.analista_nome : await nomeDoUsuario(d.analista_id, c.empresaId);
    await comTransacao(async (conn) => {
      await conn.query(
        `UPDATE nusp_atividades SET programa_id = ?, frente_id = ?, tipo = ?, dimensao_id = ?, unidade_id = ?, analista_id = ?, analista_nome = ?, tema = ?, publico = ?,
           data_inicio = ?, data_fim = ?, horas = ?, formato = ?, status = ?, resultado = ?, proxima_etapa = ?, observacoes = ? WHERE id = ? AND empresa_id = ?`,
        [d.programa_id, d.frente_id, d.tipo, d.dimensao_id, d.unidade_id, d.analista_id, d.analista_nome, d.tema, d.publico,
         d.data_inicio, d.data_fim, d.horas, d.formato, d.status, d.resultado, d.proxima_etapa, d.observacoes, id, c.empresaId]
      );
      if (urlEv) {
        await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'atividade', ?, ?, ?, ?, ?)`,
          [c.empresaId, id, tituloEv, urlEv, c.user.id, c.user.nome || null]);
      }
    });
    auditar(req, "editar", "nusp_atividade", id, `Editou a atividade "${d.tema}" do Núcleo`, atual, d);
    return res.json({ message: "Atividade atualizada" });
  } catch (e) {
    console.error("[nusp.editarAtividade]", e);
    return B.erro(res, 500, "Erro ao atualizar a atividade");
  }
}

async function excluirAtividade(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregarAtividade(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Atividade não encontrada");
    if (!podeEditarAtividade(c, atual)) return B.erro(res, 403, "Você só pode excluir as atividades que você registrou.");
    await comTransacao(async (conn) => {
      await conn.query(`DELETE FROM nusp_participacoes WHERE atividade_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_evidencias WHERE entidade = 'atividade' AND entidade_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_atividades WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    });
    auditar(req, "excluir", "nusp_atividade", id, `Excluiu a atividade "${atual.tema}" do Núcleo`, atual, null);
    return res.json({ message: "Atividade excluída" });
  } catch (e) {
    console.error("[nusp.excluirAtividade]", e);
    return B.erro(res, 500, "Erro ao excluir a atividade");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PARTICIPAÇÕES (matrícula obrigatória)
// ═══════════════════════════════════════════════════════════════════════
/** Acha a pessoa pela matrícula; se vier nome, usa o Cadastro Único (resolverPessoa) para casar ou criar. */
async function pessoaPorMatricula(conn, empresaId, matricula, nome) {
  const mat = String(matricula || "").trim();
  if (!mat) return { erro: "Matrícula obrigatória" };
  if (nome && String(nome).trim()) {
    const r = await resolverPessoa({ empresaId, nome: String(nome).trim(), matricula: mat, cliente: null }, conn);
    return { pessoa: r.pessoa, criada: r.criada };
  }
  const norm = matriculaParaComparar(mat);
  const [rows] = await conn.query(`SELECT * FROM pessoas WHERE empresa_id = ? AND (matricula = ? OR matricula = ?)`, [empresaId, mat, norm]);
  const achadas = rows.filter((p) => matriculaParaComparar(p.matricula) === norm);
  if (achadas.length === 1) return { pessoa: achadas[0], criada: false };
  if (achadas.length > 1) return { erro: "Há mais de uma pessoa com essa matrícula; informe também o nome" };
  return { erro: "Matrícula não encontrada no cadastro; informe também o nome" };
}

/** Grava a lista de participantes. Cada item é independente: erro numa linha não derruba as demais. */
async function gravarParticipantes(empresaId, atividadeId, itens) {
  const resumo = { gravados: 0, novos: 0, pessoas_criadas: 0, erros: [] };
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i] || {};
    const linha = it.linha || i + 1;
    const presenca = B.PRESENCAS.includes(String(it.presenca || "presente")) ? String(it.presenca || "presente") : "presente";
    try {
      await comTransacao(async (conn) => {
        const r = await pessoaPorMatricula(conn, empresaId, it.matricula, it.nome);
        if (r.erro) { resumo.erros.push({ linha, matricula: String(it.matricula || ""), motivo: r.erro }); return; }
        const p = r.pessoa;
        const [ex] = await conn.query(`SELECT id FROM nusp_participacoes WHERE atividade_id = ? AND pessoa_id = ?`, [atividadeId, p.id]);
        await conn.query(
          `INSERT INTO nusp_participacoes (empresa_id, atividade_id, pessoa_id, nome, matricula, presenca, concluiu)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE presenca = VALUES(presenca), concluiu = VALUES(concluiu), nome = VALUES(nome), matricula = VALUES(matricula)`,
          [empresaId, atividadeId, p.id, p.nome, String(p.matricula || it.matricula).trim(), presenca, it.concluiu ? 1 : 0]
        );
        resumo.gravados += 1;
        if (!ex.length) resumo.novos += 1;
        if (r.criada) resumo.pessoas_criadas += 1;
      });
    } catch (e) {
      console.error("[nusp.gravarParticipantes]", e.message);
      resumo.erros.push({ linha, matricula: String(it.matricula || ""), motivo: "Erro ao gravar esta linha" });
    }
  }
  return resumo;
}

async function atividadeEditavel(req, res, c) {
  const a = await carregarAtividade(Number(req.params.id), c.empresaId);
  if (!a) { B.erro(res, 404, "Atividade não encontrada"); return null; }
  if (!podeEditarAtividade(c, a)) { B.erro(res, 403, "Você só pode alterar as atividades que você registrou ou das quais é responsável."); return null; }
  return a;
}

async function adicionarParticipantes(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const a = await atividadeEditavel(req, res, c); if (!a) return;
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (!itens.length) return B.erro(res, 400, "Informe ao menos um participante");
    if (itens.length > 500) return B.erro(res, 400, "Envie no máximo 500 participantes por vez");
    const resumo = await gravarParticipantes(c.empresaId, a.id, itens);
    auditar(req, "criar", "nusp_participacao", a.id, `Lançou ${resumo.gravados} participante(s) na atividade "${a.tema}" do Núcleo`, null, { gravados: resumo.gravados, erros: resumo.erros.length });
    return res.json({ message: "Participantes processados", ...resumo });
  } catch (e) {
    console.error("[nusp.adicionarParticipantes]", e);
    return B.erro(res, 500, "Erro ao lançar os participantes");
  }
}

async function importarParticipantes(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const a = await atividadeEditavel(req, res, c); if (!a) return;
    if (!req.file?.buffer) return B.erro(res, 400, "Envie a planilha (.xlsx) no campo 'arquivo'");
    const XLSX = require("xlsx");
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    // Acha a linha de cabeçalho (primeira que contenha "matrícula").
    const idxCab = linhas.findIndex((l) => l.some((x) => B.chave(x).startsWith("matricula")));
    if (idxCab < 0) return B.erro(res, 400, "Não encontrei a coluna Matrícula. A planilha precisa ter os cabeçalhos Matrícula e Nome.");
    const cab = linhas[idxCab].map((x) => B.chave(x));
    const col = (pref) => cab.findIndex((x) => x.startsWith(pref));
    const cMat = col("matricula"), cNome = col("nome"), cPres = col("presenca"), cConc = col("conclu");
    const itens = [];
    for (let i = idxCab + 1; i < linhas.length; i++) {
      const l = linhas[i];
      const mat = String(l[cMat] ?? "").trim();
      const nome = cNome >= 0 ? String(l[cNome] ?? "").trim() : "";
      if (!mat && !nome) continue;
      let presenca = "presente";
      if (cPres >= 0) {
        const t = B.chave(l[cPres]);
        presenca = t.startsWith("aus") || t === "faltou" || t === "f" ? "ausente" : t.startsWith("just") ? "justificado" : "presente";
      }
      const concluiu = cConc >= 0 ? ["sim", "s", "1", "concluida", "concluido", "true"].includes(B.chave(l[cConc])) : presenca === "presente";
      itens.push({ linha: i + 1, matricula: mat, nome, presenca, concluiu });
    }
    if (!itens.length) return B.erro(res, 400, "A planilha não tem participantes abaixo do cabeçalho");
    if (itens.length > 2000) return B.erro(res, 400, "A planilha tem mais de 2000 linhas; divida em partes");
    const resumo = await gravarParticipantes(c.empresaId, a.id, itens);
    auditar(req, "criar", "nusp_participacao", a.id, `Importou ${resumo.gravados} participante(s) por planilha na atividade "${a.tema}" do Núcleo`, null, { gravados: resumo.gravados, erros: resumo.erros.length });
    return res.json({ message: "Planilha processada", total_linhas: itens.length, ...resumo });
  } catch (e) {
    console.error("[nusp.importarParticipantes]", e);
    return B.erro(res, 500, "Erro ao importar a planilha de participantes");
  }
}

async function editarParticipacao(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(`SELECT * FROM nusp_participacoes WHERE id = ? AND empresa_id = ?`, [Number(req.params.id), c.empresaId]);
    if (!rows.length) return B.erro(res, 404, "Participação não encontrada");
    const a = await carregarAtividade(rows[0].atividade_id, c.empresaId);
    if (!a || !podeEditarAtividade(c, a)) return B.erro(res, 403, "Você não pode alterar esta atividade.");
    const presenca = B.PRESENCAS.includes(String(req.body?.presenca)) ? String(req.body.presenca) : rows[0].presenca;
    const concluiu = "concluiu" in (req.body || {}) ? (req.body.concluiu ? 1 : 0) : rows[0].concluiu;
    await pool.query(`UPDATE nusp_participacoes SET presenca = ?, concluiu = ? WHERE id = ? AND empresa_id = ?`, [presenca, concluiu, rows[0].id, c.empresaId]);
    return res.json({ message: "Participação atualizada" });
  } catch (e) {
    console.error("[nusp.editarParticipacao]", e);
    return B.erro(res, 500, "Erro ao atualizar a participação");
  }
}

async function removerParticipacao(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(`SELECT * FROM nusp_participacoes WHERE id = ? AND empresa_id = ?`, [Number(req.params.id), c.empresaId]);
    if (!rows.length) return B.erro(res, 404, "Participação não encontrada");
    const a = await carregarAtividade(rows[0].atividade_id, c.empresaId);
    if (!a || !podeEditarAtividade(c, a)) return B.erro(res, 403, "Você não pode alterar esta atividade.");
    await pool.query(`DELETE FROM nusp_participacoes WHERE id = ? AND empresa_id = ?`, [rows[0].id, c.empresaId]);
    auditar(req, "excluir", "nusp_participacao", rows[0].id, `Removeu um participante da atividade "${a.tema}" do Núcleo`, null, null);
    return res.json({ message: "Participante removido" });
  } catch (e) {
    console.error("[nusp.removerParticipacao]", e);
    return B.erro(res, 500, "Erro ao remover o participante");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EVIDÊNCIAS (links)
// ═══════════════════════════════════════════════════════════════════════
async function donoDaEntidade(c, entidade, id) {
  if (entidade === "atividade") {
    const a = await carregarAtividade(id, c.empresaId);
    return a ? { ok: podeEditarAtividade(c, a), concluida: a.status === "concluida" } : null;
  }
  const p = await carregarPlano(id, c.empresaId);
  return p ? { ok: podeEditarPlano(c, p), concluida: p.status === "concluida" } : null;
}

async function adicionarEvidencia(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const entidade = String(req.body?.entidade || ""); const id = Number(req.body?.entidade_id);
  if (!["atividade", "plano"].includes(entidade) || !Number.isInteger(id)) return B.erro(res, 400, "Evidência inválida");
  const url = String(req.body?.url || "").trim();
  if (!B.urlValida(url) || url.length > 600) return B.erro(res, 400, "O link da evidência deve começar com http:// ou https://");
  try {
    const dono = await donoDaEntidade(c, entidade, id);
    if (!dono) return B.erro(res, 404, "Registro não encontrado");
    if (!dono.ok) return B.erro(res, 403, "Você não pode anexar evidência a este registro.");
    const titulo = req.body?.titulo ? String(req.body.titulo).trim().slice(0, 200) : null;
    const [r] = await pool.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.empresaId, entidade, id, titulo, url, c.user.id, c.user.nome || null]);
    auditar(req, "criar", "nusp_evidencia", r.insertId, `Anexou evidência a ${entidade} #${id} do Núcleo`, null, { entidade, id });
    return res.status(201).json({ id: r.insertId, message: "Evidência anexada" });
  } catch (e) {
    console.error("[nusp.adicionarEvidencia]", e);
    return B.erro(res, 500, "Erro ao anexar a evidência");
  }
}

async function removerEvidencia(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(`SELECT * FROM nusp_evidencias WHERE id = ? AND empresa_id = ?`, [Number(req.params.id), c.empresaId]);
    if (!rows.length) return B.erro(res, 404, "Evidência não encontrada");
    const ev = rows[0];
    const dono = await donoDaEntidade(c, ev.entidade, ev.entidade_id);
    if (!dono || !dono.ok) return B.erro(res, 403, "Você não pode alterar este registro.");
    if (dono.concluida) {
      const [n] = await pool.query(`SELECT COUNT(*) n FROM nusp_evidencias WHERE empresa_id = ? AND entidade = ? AND entidade_id = ?`, [c.empresaId, ev.entidade, ev.entidade_id]);
      if (Number(n[0].n) <= 1) return B.erro(res, 400, "Este registro está concluído e precisa de ao menos uma evidência. Reabra-o antes de remover.");
    }
    await pool.query(`DELETE FROM nusp_evidencias WHERE id = ? AND empresa_id = ?`, [ev.id, c.empresaId]);
    auditar(req, "excluir", "nusp_evidencia", ev.id, `Removeu evidência de ${ev.entidade} #${ev.entidade_id} do Núcleo`, ev, null);
    return res.json({ message: "Evidência removida" });
  } catch (e) {
    console.error("[nusp.removerEvidencia]", e);
    return B.erro(res, 500, "Erro ao remover a evidência");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PLANOS DE AÇÃO
// ═══════════════════════════════════════════════════════════════════════
const SQL_PLANO = `
  SELECT pl.id, pl.programa_id, p.nome AS programa, pl.dimensao_id, d.nome AS dimensao, pl.unidade_id, u.nome AS unidade,
         pl.titulo, pl.descricao, pl.responsavel_id, pl.responsavel_nome,
         DATE_FORMAT(pl.data_identificacao, '%Y-%m-%d') AS data_identificacao, DATE_FORMAT(pl.prazo, '%Y-%m-%d') AS prazo,
         pl.status, pl.pct_conclusao, pl.proxima_etapa, pl.observacoes, DATE_FORMAT(pl.concluido_em, '%Y-%m-%d') AS concluido_em,
         pl.origem, pl.criado_por_id,
         DATE_FORMAT(pl.updated_at, '%Y-%m-%d') AS atualizado_em,
         (pl.status NOT IN ('concluida','cancelada') AND pl.prazo < CURDATE()) AS atrasado,
         (SELECT COUNT(*) FROM nusp_evidencias e WHERE e.empresa_id = pl.empresa_id AND e.entidade = 'plano' AND e.entidade_id = pl.id) AS evidencias
    FROM nusp_planos_acao pl
    LEFT JOIN nusp_programas p ON p.id = pl.programa_id
    LEFT JOIN nusp_dimensoes d ON d.id = pl.dimensao_id
    LEFT JOIN nusp_unidades u ON u.id = pl.unidade_id`;

async function carregarPlano(id, empresaId) {
  const [rows] = await pool.query(`${SQL_PLANO} WHERE pl.id = ? AND pl.empresa_id = ?`, [id, empresaId]);
  return rows[0] || null;
}

function podeEditarPlano(c, p) {
  if (ehCoord(c)) return true;
  if (c.perfil !== B.PERFIL_ANALISTA) return false;
  return Number(p.responsavel_id) === Number(c.user.id) || Number(p.criado_por_id) === Number(c.user.id);
}

async function listarPlanos(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const q = req.query; const w = ["pl.empresa_id = ?"]; const p = [c.empresaId];
    for (const k of ["programa_id", "unidade_id", "dimensao_id", "responsavel_id"]) {
      const n = Number(q[k]); if (Number.isInteger(n) && n > 0) { w.push(`pl.${k} = ?`); p.push(n); }
    }
    if (q.status && B.valores(B.STATUS_PLANO).includes(String(q.status))) { w.push("pl.status = ?"); p.push(String(q.status)); }
    if (String(q.atrasados) === "1") w.push("pl.status NOT IN ('concluida','cancelada') AND pl.prazo < CURDATE()");
    if (String(q.abertos) === "1") w.push("pl.status IN ('pendente','em_andamento')");
    if (q.q) { w.push("pl.titulo LIKE ?"); p.push(`%${String(q.q).trim().slice(0, 80)}%`); }
    const where = w.join(" AND ");
    const { limite, offset } = paginacao(q);
    const [itens] = await pool.query(`${SQL_PLANO} WHERE ${where} ORDER BY (pl.status IN ('concluida','cancelada')), pl.prazo, pl.id DESC LIMIT ? OFFSET ?`, [...p, limite, offset]);
    const [tot] = await pool.query(`SELECT COUNT(*) n FROM nusp_planos_acao pl WHERE ${where}`, p);
    return res.json({ itens, total: Number(tot[0].n), limite });
  } catch (e) {
    console.error("[nusp.listarPlanos]", e);
    return B.erro(res, 500, "Erro ao listar os planos de ação");
  }
}

async function detalhePlano(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const pl = await carregarPlano(Number(req.params.id), c.empresaId);
    if (!pl) return B.erro(res, 404, "Plano não encontrado");
    pl.lista_evidencias = await evidenciasDe("plano", pl.id, c.empresaId);
    const [hist] = await pool.query(
      `SELECT usuario_nome, status, pct_conclusao, texto, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS quando
         FROM nusp_planos_historico WHERE plano_id = ? AND empresa_id = ? ORDER BY id DESC LIMIT 100`, [pl.id, c.empresaId]);
    pl.historico = hist;
    pl.pode_editar = podeEditarPlano(c, pl);
    return res.json(pl);
  } catch (e) {
    console.error("[nusp.detalhePlano]", e);
    return B.erro(res, 500, "Erro ao carregar o plano");
  }
}

async function validarPlano(b, c, atual) {
  const erros = []; const d = {};
  d.titulo = B.texto(b.titulo, 250, "Título", erros, { obrigatorio: true });
  d.descricao = B.texto(b.descricao, 1500, "Descrição", erros);
  const ident = B.dataISO(b.data_identificacao); if (!ident) erros.push("Data de identificação é obrigatória e deve ser válida"); d.data_identificacao = ident || null;
  const prazo = B.dataISO(b.prazo); if (!prazo) erros.push("Prazo é obrigatório e deve ser válido"); d.prazo = prazo || null;
  if (d.data_identificacao && d.prazo && d.prazo < d.data_identificacao) erros.push("O prazo não pode ser anterior à data de identificação");
  d.status = B.opcao(b.status, B.STATUS_PLANO, "Status", erros, { padrao: atual?.status || "pendente" });
  const pct = b.pct_conclusao === undefined || b.pct_conclusao === "" || b.pct_conclusao === null ? (atual?.pct_conclusao ?? 0) : Number(b.pct_conclusao);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) erros.push("% de conclusão deve ser um inteiro de 0 a 100");
  d.pct_conclusao = Number.isInteger(pct) ? pct : 0;
  if (d.status === "concluida") d.pct_conclusao = 100;
  else if (d.pct_conclusao === 100 && !erros.length) erros.push("Para chegar a 100% marque o plano como Concluída.");
  d.proxima_etapa = B.texto(b.proxima_etapa, 300, "Próxima etapa", erros);
  d.observacoes = B.texto(b.observacoes, 1000, "Observações", erros);
  d.programa_id = B.inteiroOuNulo(b.programa_id, "Programa", erros);
  d.dimensao_id = B.inteiroOuNulo(b.dimensao_id, "Dimensão", erros);
  d.unidade_id = B.inteiroOuNulo(b.unidade_id, "Unidade", erros);
  const resp = ehCoord(c) ? B.inteiroOuNulo(b.responsavel_id, "Responsável", erros) : null;
  d.responsavel_id = resp || atual?.responsavel_id || c.user.id;
  const urlEv = b.evidencia_url ? String(b.evidencia_url).trim() : "";
  if (urlEv && !B.urlValida(urlEv)) erros.push("O link da evidência deve começar com http:// ou https://");
  const comentario = B.texto(b.comentario, 1000, "Comentário", erros);
  if (!erros.length) {
    const ref = await B.conferirReferencias(d, c.empresaId);
    if (ref) erros.push(ref);
    if (ehCoord(c) && resp && !(await nomeDoUsuario(resp, c.empresaId))) erros.push("Responsável inválido");
  }
  return { erros, d, urlEv, tituloEv: b.evidencia_titulo ? String(b.evidencia_titulo).trim().slice(0, 200) : null, comentario };
}

async function criarPlano(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const { erros, d, urlEv, tituloEv, comentario } = await validarPlano(req.body || {}, c, null);
    if (!erros.length && d.status === "concluida" && !urlEv) erros.push("Para concluir o plano, anexe ao menos uma evidência.");
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    d.responsavel_nome = await nomeDoUsuario(d.responsavel_id, c.empresaId);
    const id = await comTransacao(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO nusp_planos_acao (empresa_id, programa_id, dimensao_id, unidade_id, titulo, descricao, responsavel_id, responsavel_nome,
           data_identificacao, prazo, status, pct_conclusao, proxima_etapa, observacoes, concluido_em, origem, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
        [c.empresaId, d.programa_id, d.dimensao_id, d.unidade_id, d.titulo, d.descricao, d.responsavel_id, d.responsavel_nome,
         d.data_identificacao, d.prazo, d.status, d.pct_conclusao, d.proxima_etapa, d.observacoes, d.status === "concluida" ? B.hojeISO() : null, c.user.id]
      );
      if (urlEv) {
        await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'plano', ?, ?, ?, ?, ?)`,
          [c.empresaId, r.insertId, tituloEv, urlEv, c.user.id, c.user.nome || null]);
      }
      await conn.query(`INSERT INTO nusp_planos_historico (empresa_id, plano_id, usuario_id, usuario_nome, status, pct_conclusao, texto) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.empresaId, r.insertId, c.user.id, c.user.nome || null, d.status, d.pct_conclusao, comentario || "Plano criado"]);
      return r.insertId;
    });
    auditar(req, "criar", "nusp_plano", id, `Criou o plano de ação "${d.titulo}" no Núcleo`, null, d);
    return res.status(201).json({ id, message: "Plano de ação criado" });
  } catch (e) {
    console.error("[nusp.criarPlano]", e);
    return B.erro(res, 500, "Erro ao criar o plano de ação");
  }
}

async function editarPlano(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregarPlano(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Plano não encontrado");
    if (!podeEditarPlano(c, atual)) return B.erro(res, 403, "Você só pode editar os planos que você criou ou pelos quais é responsável.");
    const { erros, d, urlEv, tituloEv, comentario } = await validarPlano(req.body || {}, c, atual);
    if (!erros.length && d.status === "concluida" && !urlEv && Number(atual.evidencias) === 0) erros.push("Para concluir o plano, anexe ao menos uma evidência.");
    if (erros.length) return B.erro(res, 400, erros.join("; "));
    d.responsavel_nome = d.responsavel_id === atual.responsavel_id ? atual.responsavel_nome : await nomeDoUsuario(d.responsavel_id, c.empresaId);
    const concluidoEm = d.status === "concluida" ? (atual.concluido_em || B.hojeISO()) : null;
    await comTransacao(async (conn) => {
      await conn.query(
        `UPDATE nusp_planos_acao SET programa_id = ?, dimensao_id = ?, unidade_id = ?, titulo = ?, descricao = ?, responsavel_id = ?, responsavel_nome = ?,
           data_identificacao = ?, prazo = ?, status = ?, pct_conclusao = ?, proxima_etapa = ?, observacoes = ?, concluido_em = ? WHERE id = ? AND empresa_id = ?`,
        [d.programa_id, d.dimensao_id, d.unidade_id, d.titulo, d.descricao, d.responsavel_id, d.responsavel_nome,
         d.data_identificacao, d.prazo, d.status, d.pct_conclusao, d.proxima_etapa, d.observacoes, concluidoEm, id, c.empresaId]
      );
      if (urlEv) {
        await conn.query(`INSERT INTO nusp_evidencias (empresa_id, entidade, entidade_id, titulo, url, criado_por_id, criado_por_nome) VALUES (?, 'plano', ?, ?, ?, ?, ?)`,
          [c.empresaId, id, tituloEv, urlEv, c.user.id, c.user.nome || null]);
      }
      if (d.status !== atual.status || d.pct_conclusao !== atual.pct_conclusao || comentario) {
        await conn.query(`INSERT INTO nusp_planos_historico (empresa_id, plano_id, usuario_id, usuario_nome, status, pct_conclusao, texto) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [c.empresaId, id, c.user.id, c.user.nome || null, d.status, d.pct_conclusao, comentario || null]);
      }
    });
    auditar(req, "editar", "nusp_plano", id, `Editou o plano de ação "${d.titulo}" do Núcleo`, atual, d);
    return res.json({ message: "Plano de ação atualizado" });
  } catch (e) {
    console.error("[nusp.editarPlano]", e);
    return B.erro(res, 500, "Erro ao atualizar o plano de ação");
  }
}

async function excluirPlano(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = Number(req.params.id);
  try {
    const atual = await carregarPlano(id, c.empresaId);
    if (!atual) return B.erro(res, 404, "Plano não encontrado");
    await comTransacao(async (conn) => {
      await conn.query(`DELETE FROM nusp_planos_historico WHERE plano_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_evidencias WHERE entidade = 'plano' AND entidade_id = ? AND empresa_id = ?`, [id, c.empresaId]);
      await conn.query(`DELETE FROM nusp_planos_acao WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    });
    auditar(req, "excluir", "nusp_plano", id, `Excluiu o plano de ação "${atual.titulo}" do Núcleo`, atual, null);
    return res.json({ message: "Plano de ação excluído" });
  } catch (e) {
    console.error("[nusp.excluirPlano]", e);
    return B.erro(res, 500, "Erro ao excluir o plano de ação");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MATERIAIS
// ═══════════════════════════════════════════════════════════════════════
async function listarMateriais(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [itens] = await pool.query(
      `SELECT m.id, m.titulo, m.link, m.status, m.responsavel_nome, m.programa_id, p.nome AS programa
         FROM nusp_materiais m LEFT JOIN nusp_programas p ON p.id = m.programa_id
        WHERE m.empresa_id = ? ORDER BY m.id DESC`, [c.empresaId]);
    return res.json({ itens });
  } catch (e) {
    console.error("[nusp.listarMateriais]", e);
    return B.erro(res, 500, "Erro ao listar os materiais");
  }
}

async function salvarMaterial(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const id = req.params.id ? Number(req.params.id) : null;
  const b = req.body || {}; const erros = [];
  const d = {
    titulo: B.texto(b.titulo, 200, "Título", erros, { obrigatorio: true }),
    link: B.texto(b.link, 600, "Link", erros),
    status: B.opcao(b.status, B.STATUS_MATERIAL, "Status", erros, { padrao: "em_producao" }),
    responsavel_nome: B.texto(b.responsavel_nome, 150, "Responsável", erros),
    programa_id: B.inteiroOuNulo(b.programa_id, "Programa", erros),
  };
  if (d.link && !B.urlValida(d.link)) erros.push("O link deve começar com http:// ou https://");
  if (erros.length) return B.erro(res, 400, erros.join("; "));
  try {
    if (!(await B.existeNaEmpresa("nusp_programas", d.programa_id, c.empresaId))) return B.erro(res, 400, "Programa inválido");
    if (id) {
      const [r] = await pool.query(
        `UPDATE nusp_materiais SET titulo = ?, link = ?, status = ?, responsavel_nome = ?, programa_id = ? WHERE id = ? AND empresa_id = ?`,
        [d.titulo, d.link, d.status, d.responsavel_nome, d.programa_id, id, c.empresaId]);
      if (!r.affectedRows) return B.erro(res, 404, "Material não encontrado");
      auditar(req, "editar", "nusp_material", id, `Editou o material "${d.titulo}" do Núcleo`, null, d);
      return res.json({ message: "Material atualizado" });
    }
    const [r] = await pool.query(
      `INSERT INTO nusp_materiais (empresa_id, titulo, link, status, responsavel_nome, programa_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [c.empresaId, d.titulo, d.link, d.status, d.responsavel_nome, d.programa_id]);
    auditar(req, "criar", "nusp_material", r.insertId, `Cadastrou o material "${d.titulo}" do Núcleo`, null, d);
    return res.status(201).json({ id: r.insertId, message: "Material cadastrado" });
  } catch (e) {
    console.error("[nusp.salvarMaterial]", e);
    return B.erro(res, 500, "Erro ao salvar o material");
  }
}

async function excluirMaterial(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  try {
    const [r] = await pool.query(`DELETE FROM nusp_materiais WHERE id = ? AND empresa_id = ?`, [Number(req.params.id), c.empresaId]);
    if (!r.affectedRows) return B.erro(res, 404, "Material não encontrado");
    auditar(req, "excluir", "nusp_material", Number(req.params.id), "Excluiu um material do Núcleo", null, null);
    return res.json({ message: "Material excluído" });
  } catch (e) {
    console.error("[nusp.excluirMaterial]", e);
    return B.erro(res, 500, "Erro ao excluir o material");
  }
}

module.exports = {
  obterCadastros, criarCadastro, editarCadastro,
  listarAtividades, detalheAtividade, criarAtividade, editarAtividade, excluirAtividade,
  adicionarParticipantes, importarParticipantes, editarParticipacao, removerParticipacao,
  adicionarEvidencia, removerEvidencia,
  listarPlanos, detalhePlano, criarPlano, editarPlano, excluirPlano,
  listarMateriais, salvarMaterial, excluirMaterial,
  // usados pelo painel/importador
  filtroAtividades, SQL_ATIVIDADE, SQL_PLANO, gravarParticipantes,
};
