// muralResolver.js
//
// Fonte do mural de cada turma: mistura publicações manuais (tabela nova
// turma_publicacoes — avisos que o instrutor/coordenador escreve) com
// eventos DERIVADOS de dados que já existem no sistema (avaliação
// publicada, material adicionado, chamada concluída). Ninguém precisa
// "postar" manualmente que uma avaliação foi criada — isso já é rastreável
// a partir das tabelas que já existem.
//
// Observação sobre os eventos derivados de biblioteca: a tabela
// `biblioteca_conteudos` vincula material por CLIENTE, não por turma
// específica (não existe treinamento_id nela) — então um material aparece
// no mural de todas as turmas daquele cliente, não só de uma. É uma
// aproximação razoável dado o desenho atual da tabela; se no futuro
// biblioteca passar a vincular por turma, esse evento fica mais preciso
// automaticamente, sem mudar a interface do mural.

const pool = require("../lib/db");

async function getPublicacoesManuais(treinamentoId) {
  try {
    const [rows] = await pool.query(
      `SELECT id, autor_nome, titulo, conteudo, fixado, criado_em, atualizado_em
       FROM turma_publicacoes
       WHERE treinamento_id = ?
       ORDER BY criado_em DESC`,
      [treinamentoId]
    );

    return rows.map((r) => ({
      tipo: "publicacao",
      id: `pub-${r.id}`,
      registro_id: r.id,
      titulo: r.titulo || "Aviso",
      descricao: r.conteudo,
      autor: r.autor_nome,
      data: r.criado_em,
      fixado: !!r.fixado,
      editavel: true,
    }));
  } catch (error) {
    // tabela nova (turma_publicacoes) — se a migration ainda não rodou neste
    // banco, o mural não pode quebrar por causa disso; só fica sem a seção
    // de publicações manuais até a migration ser aplicada.
    console.warn("[mural] não foi possível carregar publicações manuais:", error.message);
    return [];
  }
}

async function getEventosAvaliacoes(treinamentoId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM avaliacoes WHERE treinamento_id = ? ORDER BY id DESC`,
      [treinamentoId]
    );

    return rows.map((a) => ({
      tipo: "avaliacao",
      id: `aval-${a.id}`,
      registro_id: a.id,
      titulo: `Avaliação "${a.titulo || "sem título"}" publicada`,
      descricao: a.treinando_nome ? `Para ${a.treinando_nome}` : null,
      autor: null,
      // nem toda instalação tem coluna de data nessa tabela — quando não tem,
      // o evento ainda aparece no mural, só sem ordenação cronológica exata
      // (usamos o id como proxy de recência nesse caso).
      data: a.criado_em || a.created_at || null,
      editavel: false,
    }));
  } catch (error) {
    console.warn("[mural] não foi possível carregar eventos de avaliação:", error.message);
    return [];
  }
}

async function getEventosMateriais(cliente) {
  if (!cliente) return [];
  try {
    const [rows] = await pool.query(
      `SELECT * FROM biblioteca_conteudos WHERE cliente = ? ORDER BY id DESC LIMIT 20`,
      [cliente]
    );
    return rows.map((m) => ({
      tipo: "material",
      id: `mat-${m.id}`,
      registro_id: m.id,
      titulo: `Material "${m.titulo || "sem título"}" disponível na biblioteca`,
      descricao: m.categoria || null,
      autor: null,
      data: m.criado_em || m.created_at || null,
      editavel: false,
    }));
  } catch (error) {
    console.warn("[mural] não foi possível carregar eventos de biblioteca:", error.message);
    return [];
  }
}

async function getEventosChamadas(treinamentoId) {
  try {
    const [rows] = await pool.query(
      `SELECT ta.id, ta.data_aula, ta.titulo,
              SUM(CASE WHEN pa.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
              COUNT(pa.id) AS total
       FROM turma_aulas ta
       LEFT JOIN presenca_aulas pa ON pa.turma_aula_id = ta.id
       WHERE ta.treinamento_id = ?
       GROUP BY ta.id
       HAVING total > 0
       ORDER BY ta.data_aula DESC`,
      [treinamentoId]
    );
    return rows.map((aula) => ({
      tipo: "chamada",
      id: `aula-${aula.id}`,
      registro_id: aula.id,
      titulo: `Chamada de "${aula.titulo || "aula"}" concluída`,
      descricao: `${aula.presentes} de ${aula.total} presentes`,
      autor: null,
      data: aula.data_aula,
      editavel: false,
    }));
  } catch (error) {
    console.warn("[mural] não foi possível carregar eventos de chamada:", error.message);
    return [];
  }
}

async function getMuralTurma(treinamentoId, empresaId) {
  // Isolamento por tenant: sem este filtro, qualquer usuário autenticado
  // conseguia ver o mural completo (avisos, avaliações, materiais, chamadas)
  // de uma turma de outra empresa só sabendo/incrementando o treinamento_id.
  const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [treinamentoId, empresaId] : [treinamentoId];
  const [treinamentoRows] = await pool.query(`SELECT * FROM treinamentos WHERE id = ?${tenantCheck}`, params);
  const treinamento = treinamentoRows[0] || null;
  if (!treinamento) return null;

  const [publicacoes, avaliacoesEventos, materiaisEventos, chamadaEventos] = await Promise.all([
    getPublicacoesManuais(treinamentoId),
    getEventosAvaliacoes(treinamentoId),
    getEventosMateriais(treinamento.cliente),
    getEventosChamadas(treinamentoId),
  ]);

  const feed = [...publicacoes, ...avaliacoesEventos, ...materiaisEventos, ...chamadaEventos].sort((a, b) => {
    if (a.fixado && !b.fixado) return -1;
    if (!a.fixado && b.fixado) return 1;
    const dataA = a.data ? new Date(a.data).getTime() : 0;
    const dataB = b.data ? new Date(b.data).getTime() : 0;
    return dataB - dataA;
  });

  return { treinamento, feed };
}

// empresaId (quando informado) exige que o treinamento de destino pertença
// ao tenant do autor — sem isso, dava para publicar um aviso na turma de
// outra empresa apenas informando o treinamento_id.
async function criarPublicacao({ treinamentoId, autor, titulo, conteudo, fixado, empresaId }) {
  if (empresaId) {
    const [tr] = await pool.query(`SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ?`, [treinamentoId, empresaId]);
    if (!tr.length) {
      const err = new Error("Treinamento não encontrado");
      err.code = "TREINAMENTO_NAO_ENCONTRADO";
      throw err;
    }
  }

  const [result] = await pool.query(
    `INSERT INTO turma_publicacoes (treinamento_id, autor_id, autor_nome, titulo, conteudo, fixado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [treinamentoId, autor?.id ?? null, autor?.nome ?? null, titulo ?? null, conteudo, fixado ? 1 : 0]
  );
  return result.insertId;
}

// empresaId (quando informado) restringe a publicação buscada ao tenant —
// usado antes de editar/excluir, para impedir que um coordenador edite ou
// apague um aviso de outra empresa só sabendo o id da publicação.
async function buscarPublicacao(id, empresaId) {
  const tenantJoin = empresaId
    ? " AND EXISTS (SELECT 1 FROM treinamentos t WHERE t.id = tp.treinamento_id AND t.empresa_id = ?)"
    : "";
  const params = empresaId ? [id, empresaId] : [id];
  const [rows] = await pool.query(`SELECT tp.* FROM turma_publicacoes tp WHERE tp.id = ?${tenantJoin}`, params);
  return rows[0] || null;
}

async function editarPublicacao(id, { titulo, conteudo, fixado }) {
  const campos = [];
  const valores = [];
  if (titulo !== undefined) { campos.push("titulo = ?"); valores.push(titulo); }
  if (conteudo !== undefined) { campos.push("conteudo = ?"); valores.push(conteudo); }
  if (fixado !== undefined) { campos.push("fixado = ?"); valores.push(fixado ? 1 : 0); }
  if (!campos.length) return;
  valores.push(id);
  await pool.query(`UPDATE turma_publicacoes SET ${campos.join(", ")} WHERE id = ?`, valores);
}

async function excluirPublicacao(id) {
  await pool.query(`DELETE FROM turma_publicacoes WHERE id = ?`, [id]);
}

module.exports = {
  getMuralTurma,
  criarPublicacao,
  buscarPublicacao,
  editarPublicacao,
  excluirPublicacao,
};
