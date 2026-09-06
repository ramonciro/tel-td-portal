// necessidadesResolver.js
//
// Fase 1 do ciclo ISO 10015: necessidade de treinamento, registrada ANTES
// da turma existir. Uma necessidade fica "aberta" até que treinamentos
// vinculados a ela somem carga horária suficiente — "horas_atendidas" não é
// uma coluna guardada (evita o mesmo problema de número duplicado/divergente
// que já corrigimos em outros lugares do sistema); é sempre calculada na
// hora, a partir dos treinamentos que apontam pra essa necessidade.

const pool = require("../lib/db");

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function parseCargaHoraria(valor) {
  if (valor == null) return 0;
  const match = String(valor).match(/[\d.,]+/);
  if (!match) return 0;
  return Number(match[0].replace(",", ".")) || 0;
}

function resolverStatusNecessidade({ statusManual, horasNecessarias, horasAtendidas, prazo }) {
  if (statusManual === "cancelada") return "cancelada";

  if (horasNecessarias > 0 && horasAtendidas >= horasNecessarias) return "atendida";

  if (horasAtendidas > 0) return "em_atendimento";

  if (prazo) {
    const hoje = new Date();
    const dataPrazo = new Date(prazo);
    if (!Number.isNaN(dataPrazo.getTime()) && dataPrazo.getTime() < hoje.setHours(0, 0, 0, 0)) {
      return "atrasada";
    }
  }

  return "aberta";
}

async function listarNecessidades({ cliente, status, empresaId } = {}) {
  const condicoes = [];
  const valores = [];
  if (cliente) { condicoes.push("nt.cliente = ?"); valores.push(cliente); }
  // Isolamento por tenant — dado sem empresa_id atribuído (legado) continua
  // visível para quem também loga sem empresa definida, igual ao resto do
  // portal (ver comentário do passo 15 em migrate.js).
  if (empresaId) { condicoes.push("nt.empresa_id = ?"); valores.push(empresaId); }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const [necessidades] = await pool.query(
    `SELECT * FROM necessidades_treinamento nt ${where} ORDER BY nt.criado_em DESC`,
    valores
  );

  let treinamentosVinculados = [];
  try {
    const [rows] = await pool.query(
      `SELECT id, necessidade_id, tema, carga_horaria, status, participantes
       FROM treinamentos WHERE necessidade_id IS NOT NULL`
    );
    treinamentosVinculados = rows;
  } catch (error) {
    // coluna necessidade_id pode ainda não existir se só a CREATE TABLE da
    // migration rodou e o ALTER TABLE não — a lista de necessidades não
    // pode quebrar por causa disso, só fica sem o vínculo até a migration
    // completa ser aplicada.
    console.warn("[necessidades] não foi possível ler treinamentos vinculados:", error.message);
  }

  const porNecessidade = new Map();
  for (const t of treinamentosVinculados) {
    const lista = porNecessidade.get(Number(t.necessidade_id)) || [];
    lista.push(t);
    porNecessidade.set(Number(t.necessidade_id), lista);
  }

  const resultado = necessidades.map((necessidade) => {
    const turmas = porNecessidade.get(Number(necessidade.id)) || [];
    const horasAtendidas = turmas.reduce((acc, t) => acc + parseCargaHoraria(t.carga_horaria), 0);
    const statusCalculado = resolverStatusNecessidade({
      statusManual: necessidade.status,
      horasNecessarias: n(necessidade.horas_necessarias),
      horasAtendidas,
      prazo: necessidade.prazo,
    });

    return {
      ...necessidade,
      horas_necessarias: n(necessidade.horas_necessarias),
      horas_atendidas: horasAtendidas,
      turmas_vinculadas: turmas.length,
      status_calculado: statusCalculado,
    };
  });

  return status ? resultado.filter((r) => r.status_calculado === status) : resultado;
}

async function buscarNecessidade(id, empresaId) {
  const tenantCheck = empresaId ? ` AND empresa_id = ${pool.escape(empresaId)}` : "";
  const [rows] = await pool.query(`SELECT * FROM necessidades_treinamento WHERE id = ?${tenantCheck}`, [id]);
  return rows[0] || null;
}

async function criarNecessidade(dados) {
  const [result] = await pool.query(
    `INSERT INTO necessidades_treinamento
      (cliente, tema, horas_necessarias, prazo, prioridade, origem, observacoes, solicitante_id, solicitante_nome, empresa_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.cliente,
      dados.tema,
      dados.horas_necessarias ?? 0,
      dados.prazo || null,
      dados.prioridade || "media",
      dados.origem || null,
      dados.observacoes || null,
      dados.solicitante_id ?? null,
      dados.solicitante_nome ?? null,
      dados.empresa_id ?? null,
    ]
  );
  return result.insertId;
}

async function editarNecessidade(id, dados, empresaId) {
  const campos = [];
  const valores = [];
  for (const campo of ["cliente", "tema", "horas_necessarias", "prazo", "prioridade", "status", "origem", "observacoes"]) {
    if (dados[campo] !== undefined) {
      campos.push(`${campo} = ?`);
      valores.push(dados[campo]);
    }
  }
  if (!campos.length) return;
  valores.push(id);
  const tenantCheck = empresaId ? ` AND empresa_id = ${pool.escape(empresaId)}` : "";
  await pool.query(`UPDATE necessidades_treinamento SET ${campos.join(", ")} WHERE id = ?${tenantCheck}`, valores);
}

async function excluirNecessidade(id, empresaId) {
  // Defesa em profundidade: o controller já confere (via buscarNecessidade)
  // que a necessidade pertence ao tenant do chamador antes de chegar aqui,
  // mas repetimos o filtro nas duas queries para não depender só disso —
  // sem o filtro no UPDATE, alguém passando o id de outro tenant conseguiria
  // desvincular o treinamento mesmo que o DELETE seguinte não afete nada.
  const tenantCheckTreinamentos = empresaId
    ? ` AND EXISTS (SELECT 1 FROM necessidades_treinamento nt WHERE nt.id = treinamentos.necessidade_id AND nt.empresa_id = ${pool.escape(empresaId)})`
    : "";
  const tenantCheck = empresaId ? ` AND empresa_id = ${pool.escape(empresaId)}` : "";
  await pool.query(`UPDATE treinamentos SET necessidade_id = NULL WHERE necessidade_id = ?${tenantCheckTreinamentos}`, [id]);
  await pool.query(`DELETE FROM necessidades_treinamento WHERE id = ?${tenantCheck}`, [id]);
}

module.exports = {
  listarNecessidades,
  buscarNecessidade,
  criarNecessidade,
  editarNecessidade,
  excluirNecessidade,
};
