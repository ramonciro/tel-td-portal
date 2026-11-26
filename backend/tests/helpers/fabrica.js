/**
 * fabrica.js — cria dados de teste (ambientes, usuários, turmas…) direto no banco de teste.
 * Cada arquivo de teste cria os PRÓPRIOS ambientes (nomes únicos), então os arquivos não interferem entre si.
 */
require("./ambiente");
const jwt = require("jsonwebtoken");
const pool = require("../../src/lib/db");

let seq = 0;
const unico = (p = "x") => `${p}-${process.pid}-${Date.now().toString(36)}-${++seq}`;

async function criarEmpresa(nome = unico("Ambiente")) {
  const [r] = await pool.query("INSERT INTO empresas (nome, ativo, codigo) VALUES (?, 1, ?)", [nome, unico("cod")]);
  return { id: r.insertId, nome };
}

async function criarUsuario({ empresa_id, perfil = "coordenador", nome = unico("Usuario") } = {}) {
  const email = `${unico("u")}@teste.local`;
  const [r] = await pool.query(
    "INSERT INTO usuarios (empresa_id, nome, email, senha_hash, perfil, ativo, troca_senha_obrigatoria) VALUES (?,?,?,?,?,1,0)",
    [empresa_id ?? null, nome, email, "x", perfil]
  );
  const usuario = { id: r.insertId, empresa_id: empresa_id ?? null, perfil, nome, email };
  usuario.token = tokenDe(usuario);
  return usuario;
}

function tokenDe(u) {
  return jwt.sign(
    { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, cliente: "", empresa_id: u.empresa_id ?? null,
      super_admin: u.perfil === "super_admin" ? 1 : 0, pode_acessar_oceano_desenvolvimento: 0 },
    process.env.JWT_SECRET,
    { expiresIn: 3600 }
  );
}

async function criarCliente(empresa_id, nome = unico("Cliente")) {
  const [r] = await pool.query("INSERT INTO clientes (empresa_id, nome, status) VALUES (?,?, 'Ativo')", [empresa_id, nome]);
  return { id: r.insertId, nome, empresa_id };
}

async function criarTurma({ empresa_id, tema = unico("Turma"), cliente = "Cliente Teste", subtipo = null, instrutor = "Instrutor Teste",
  data_inicio = "2026-11-02", data_fim = "2026-11-30", status = "em_andamento", carga_horaria = 8 } = {}) {
  const [r] = await pool.query(
    `INSERT INTO treinamentos (empresa_id, tema, cliente, subtipo, instrutor, data, data_inicio, data_fim, status, carga_horaria, participantes)
     VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
    [empresa_id, tema, cliente, subtipo, instrutor, data_inicio, `${data_inicio} 08:00:00`, `${data_fim} 17:00:00`, status, carga_horaria]
  );
  return { id: r.insertId, empresa_id, tema, cliente, subtipo };
}

async function criarAula(turma, data_aula, ordem = 1) {
  const [r] = await pool.query(
    `INSERT INTO turma_aulas (empresa_id, treinamento_id, dia_numero, ordem, data_aula, titulo, status_execucao)
     VALUES (?,?,?,?,?,?, 'planejada')`,
    [turma.empresa_id, turma.id, ordem, ordem, data_aula, `Dia ${ordem}`]
  );
  return { id: r.insertId, treinamento_id: turma.id, data_aula, empresa_id: turma.empresa_id };
}

async function criarParticipante(turma, nome = unico("Pessoa")) {
  const [r] = await pool.query(
    "INSERT INTO treinamento_participantes (treinamento_id, nome, cliente) VALUES (?,?,?)",
    [turma.id, nome, turma.cliente]
  );
  await pool.query(
    "UPDATE treinamentos SET participantes = (SELECT COUNT(*) FROM treinamento_participantes WHERE treinamento_id = ? AND desistencia_em IS NULL) WHERE id = ?",
    [turma.id, turma.id]
  );
  return { id: r.insertId, nome, treinamento_id: turma.id };
}

async function lancarPresenca(aula, participante, status, justificativa = null) {
  await pool.query(
    `INSERT INTO presenca_aulas (empresa_id, turma_aula_id, treinamento_id, data_aula, treinando_nome, status, justificativa)
     VALUES (?,?,?,?,?,?,?)`,
    [aula.empresa_id, aula.id, aula.treinamento_id, aula.data_aula, participante.nome, status, justificativa]
  );
}

module.exports = { pool, unico, criarEmpresa, criarUsuario, tokenDe, criarCliente, criarTurma, criarAula, criarParticipante, lancarPresenca };
