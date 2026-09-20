const db = require("../lib/db");

// Perfil comportamental — Lobo/Gato/Tubarão/Águia + DISC (20/09/2026, pedido
// do Ramon). Registro manual por enquanto ("faça uma busca e defina o
// melhor" foi a instrução dele) — pesquisa web feita antes de escrever este
// arquivo; ver comentário longo no passo 41 de migrate.js pra fonte e
// critério de escolha. Tabela independente de coaching_individual e de
// jornada_participantes (ver mesmo comentário) — pessoa pode ter perfil sem
// ter nenhum dos dois vínculos ainda.

const PERFIS_VALIDOS = ["lobo", "gato", "tubarao", "aguia"];
const DISC_VALIDAS = ["D", "I", "S", "C"];

// Texto de orientação por perfil — é o que faz o cadastro "orientar o
// coaching individual" (pedido explícito do Ramon), não só documentar um
// rótulo na ficha da pessoa. Fonte: pesquisa web (IBC Coaching/adaptação do
// modelo de Ned Herrmann, e demais artigos de perfil comportamental
// consultados em 20/09/2026) — características cruzadas entre as fontes,
// mantendo só o que era consistente entre elas.
const ORIENTACOES_PERFIL = {
  lobo: {
    label: "Lobo",
    descricao:
      "Metódico, detalhista, confiável e avesso a risco — decide com base em dados e experiência, não gosta de pressão nem de mudança repentina.",
    discAproximado: "C (Conformidade), com traços de S (Estabilidade)",
    abordagemCoaching:
      "Leve dados e contexto prontos antes da conversa, evite surpresas, combine a pauta com antecedência. Reconheça a consistência do trabalho dele. Ao propor uma mudança, mostre o porquê com evidências e dê tempo para processar antes de pedir uma decisão.",
  },
  gato: {
    label: "Gato",
    descricao:
      "Comunicador, empático, gosta de trabalhar em grupo e valoriza harmonia — pode evitar ou adiar decisões difíceis para não gerar conflito.",
    discAproximado: "I (Influência), com traços de S (Estabilidade)",
    abordagemCoaching:
      "Construa rapport antes de ir direto ao ponto, dê espaço para ele falar e reconheça conquistas publicamente. Feedback crítico funciona melhor em particular e com cuidado emocional. Ajude a estruturar decisões difíceis sem colocar a relação em risco.",
  },
  tubarao: {
    label: "Tubarão",
    descricao:
      "Direto, competitivo e orientado a resultado — decide rápido, gosta de desafio e velocidade, pode atropelar processo ou pessoas no caminho.",
    discAproximado: "D (Dominância)",
    abordagemCoaching:
      "Vá direto ao ponto, sem rodeios. Foque em metas e resultados mensuráveis, dê autonomia e evite microgerenciamento. Quando precisar desacelerar, mostre o custo ou risco concreto de pular etapas — não peça só para 'ir com calma'.",
  },
  aguia: {
    label: "Águia",
    descricao:
      "Visionária e criativa, gosta do panorama geral e de ideias novas — pode perder o foco em detalhes e execução, e se desmotivar com rotina.",
    discAproximado: "I (Influência), com traços de D (Dominância)",
    abordagemCoaching:
      "Conecte a tarefa a um propósito ou visão maior antes de entrar em detalhe operacional. Dê liberdade para ela propor o caminho, mas ajude a quebrar a ideia grande em passos executáveis com prazos e checkpoints — sem isso, tende a não sair do papel.",
  },
};

function orientacaoPerfil(perfilAnimal) {
  if (!perfilAnimal) return null;
  return ORIENTACOES_PERFIL[perfilAnimal] || null;
}

async function validarPertencimentoTenant(req, { jornada_participante_id, coaching_individual_id }) {
  if (!req.empresaId) return null;

  if (jornada_participante_id) {
    const [rows] = await db.query(
      `SELECT id FROM jornada_participantes WHERE id = ? AND empresa_id = ?`,
      [jornada_participante_id, req.empresaId]
    );
    if (!rows.length) return "Participante de jornada não encontrado.";
  }

  if (coaching_individual_id) {
    const [rows] = await db.query(
      `SELECT id FROM coaching_individual WHERE id = ? AND empresa_id = ?`,
      [coaching_individual_id, req.empresaId]
    );
    if (!rows.length) return "Coaching individual não encontrado.";
  }

  return null;
}

function validarPerfis({ perfil_animal, perfil_animal_secundario, disc_letra_dominante }) {
  if (perfil_animal && !PERFIS_VALIDOS.includes(perfil_animal)) {
    return `Perfil "${perfil_animal}" inválido. Use lobo, gato, tubarao ou aguia.`;
  }
  if (perfil_animal_secundario && !PERFIS_VALIDOS.includes(perfil_animal_secundario)) {
    return `Perfil secundário "${perfil_animal_secundario}" inválido.`;
  }
  if (disc_letra_dominante && !DISC_VALIDAS.includes(disc_letra_dominante.toUpperCase())) {
    return `Letra DISC "${disc_letra_dominante}" inválida. Use D, I, S ou C.`;
  }
  return null;
}

function comOrientacao(row) {
  if (!row) return row;
  return { ...row, orientacao_coaching: orientacaoPerfil(row.perfil_animal) };
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `SELECT * FROM pessoas_metodologia ${tenantWhere} ORDER BY nome ASC`,
      params
    );

    res.json(rows.map(comOrientacao));
  } catch (error) {
    console.error("Erro ao listar perfis comportamentais:", error);
    res.status(500).json({ error: "Erro ao listar perfis comportamentais." });
  }
}

async function buscarPorId(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(`SELECT * FROM pessoas_metodologia WHERE id = ?${tenantCheck}`, params);

    if (!rows.length) {
      return res.status(404).json({ error: "Perfil comportamental não encontrado." });
    }

    res.json(comOrientacao(rows[0]));
  } catch (error) {
    console.error("Erro ao buscar perfil comportamental:", error);
    res.status(500).json({ error: "Erro ao buscar perfil comportamental." });
  }
}

async function criar(req, res) {
  try {
    const {
      nome,
      matricula,
      cliente,
      cargo,
      jornada_participante_id,
      coaching_individual_id,
      perfil_animal,
      perfil_animal_secundario,
      disc_letra_dominante,
      disc_d,
      disc_i,
      disc_s,
      disc_c,
      observacoes,
    } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome da pessoa é obrigatório." });
    }

    const perfilAnimalNorm = perfil_animal || null;
    const perfilSecundarioNorm = perfil_animal_secundario || null;
    const discLetraNorm = disc_letra_dominante ? disc_letra_dominante.toUpperCase() : null;

    const erroPerfil = validarPerfis({
      perfil_animal: perfilAnimalNorm,
      perfil_animal_secundario: perfilSecundarioNorm,
      disc_letra_dominante: discLetraNorm,
    });
    if (erroPerfil) {
      return res.status(400).json({ error: erroPerfil });
    }

    const jornadaParticipanteIdNum = jornada_participante_id ? Number(jornada_participante_id) : null;
    const coachingIndividualIdNum = coaching_individual_id ? Number(coaching_individual_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_participante_id: jornadaParticipanteIdNum,
      coaching_individual_id: coachingIndividualIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const [result] = await db.query(
      `
      INSERT INTO pessoas_metodologia
      (nome, matricula, cliente, cargo, jornada_participante_id, coaching_individual_id,
       perfil_animal, perfil_animal_secundario, disc_letra_dominante,
       disc_d, disc_i, disc_s, disc_c, origem, observacoes, registrado_por_id, empresa_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)
      `,
      [
        nome,
        matricula || null,
        cliente || null,
        cargo || null,
        jornadaParticipanteIdNum,
        coachingIndividualIdNum,
        perfilAnimalNorm,
        perfilSecundarioNorm,
        discLetraNorm,
        disc_d != null && disc_d !== "" ? Number(disc_d) : null,
        disc_i != null && disc_i !== "" ? Number(disc_i) : null,
        disc_s != null && disc_s !== "" ? Number(disc_s) : null,
        disc_c != null && disc_c !== "" ? Number(disc_c) : null,
        observacoes || null,
        req.user?.id || null,
        req.empresaId ?? null,
      ]
    );

    const [rows] = await db.query(`SELECT * FROM pessoas_metodologia WHERE id = ?`, [result.insertId]);

    res.status(201).json(comOrientacao(rows[0]));
  } catch (error) {
    console.error("Erro ao criar perfil comportamental:", error);
    res.status(500).json({ error: "Erro ao criar perfil comportamental." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const {
      nome,
      matricula,
      cliente,
      cargo,
      jornada_participante_id,
      coaching_individual_id,
      perfil_animal,
      perfil_animal_secundario,
      disc_letra_dominante,
      disc_d,
      disc_i,
      disc_s,
      disc_c,
      observacoes,
    } = req.body;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM pessoas_metodologia WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Perfil comportamental não encontrado." });
    }

    const perfilAnimalNorm = perfil_animal || null;
    const perfilSecundarioNorm = perfil_animal_secundario || null;
    const discLetraNorm = disc_letra_dominante ? disc_letra_dominante.toUpperCase() : null;

    const erroPerfil = validarPerfis({
      perfil_animal: perfilAnimalNorm,
      perfil_animal_secundario: perfilSecundarioNorm,
      disc_letra_dominante: discLetraNorm,
    });
    if (erroPerfil) {
      return res.status(400).json({ error: erroPerfil });
    }

    const jornadaParticipanteIdNum = jornada_participante_id ? Number(jornada_participante_id) : null;
    const coachingIndividualIdNum = coaching_individual_id ? Number(coaching_individual_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_participante_id: jornadaParticipanteIdNum,
      coaching_individual_id: coachingIndividualIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const updateParams = [
      nome,
      matricula || null,
      cliente || null,
      cargo || null,
      jornadaParticipanteIdNum,
      coachingIndividualIdNum,
      perfilAnimalNorm,
      perfilSecundarioNorm,
      discLetraNorm,
      disc_d != null && disc_d !== "" ? Number(disc_d) : null,
      disc_i != null && disc_i !== "" ? Number(disc_i) : null,
      disc_s != null && disc_s !== "" ? Number(disc_s) : null,
      disc_c != null && disc_c !== "" ? Number(disc_c) : null,
      observacoes || null,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE pessoas_metodologia
      SET nome = ?, matricula = ?, cliente = ?, cargo = ?,
          jornada_participante_id = ?, coaching_individual_id = ?,
          perfil_animal = ?, perfil_animal_secundario = ?, disc_letra_dominante = ?,
          disc_d = ?, disc_i = ?, disc_s = ?, disc_c = ?, observacoes = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(`SELECT * FROM pessoas_metodologia WHERE id = ?`, [id]);

    res.json(comOrientacao(rows[0]));
  } catch (error) {
    console.error("Erro ao atualizar perfil comportamental:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil comportamental." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM pessoas_metodologia WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Perfil comportamental não encontrado." });
    }

    await db.query(`DELETE FROM pessoas_metodologia WHERE id = ?${tenantCheck}`, checkParams);

    res.json({ success: true, message: "Perfil comportamental removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover perfil comportamental:", error);
    res.status(500).json({ error: "Erro ao remover perfil comportamental." });
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  remover,
  orientacaoPerfil,
};
