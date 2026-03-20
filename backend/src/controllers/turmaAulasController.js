const pool = require("../lib/db");

function parseDateUTC(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      Date.UTC(
        dateValue.getUTCFullYear(),
        dateValue.getUTCMonth(),
        dateValue.getUTCDate(),
        12,
        0,
        0
      )
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");

  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateOnly(dateValue) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return null;

  d.setUTCDate(d.getUTCDate() + days);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSunday(dateValue) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 0;
}

function diffDaysInclusive(start, end) {
  const d1 = parseDateUTC(start);
  const d2 = parseDateUTC(end);

  if (!d1 || !d2 || Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    return 1;
  }

  const diff = Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

function toDateOnly(value) {
  return formatDateOnly(value);
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase().trim();
}

async function listTurmaAulas(req, res) {
  try {
    const { treinamento_id } = req.query || {};

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em,
        criado_em,
        atualizado_em
      FROM turma_aulas
      WHERE treinamento_id = ?
      ORDER BY dia_numero ASC, ordem ASC, id ASC
      `,
      [treinamento_id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar aulas da turma",
      error: error.message,
    });
  }
}

async function getTurmaAulaById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em,
        criado_em,
        atualizado_em
      FROM turma_aulas
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Aula não encontrada",
      });
    }

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar aula",
      error: error.message,
    });
  }
}

async function createTurmaAula(req, res) {
  try {
    const {
      treinamento_id,
      dia_numero,
      data_aula,
      ordem,
      titulo,
      objetivo,
      conteudo_planejado,
      metodologia,
      carga_horaria_planejada,
      instrutor_responsavel,
      material_apoio,
      status_execucao,
      conteudo_ministrado,
      carga_horaria_real,
      observacoes_execucao,
      reprogramada,
      motivo_reprogramacao,
      ministrada_em,
    } = req.body || {};

    if (!treinamento_id || !dia_numero || !data_aula || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, dia, data e título da aula",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO turma_aulas
      (
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(treinamento_id),
        Number(dia_numero),
        toDateOnly(data_aula),
        Number(ordem || 1),
        titulo,
        objetivo || null,
        conteudo_planejado || null,
        metodologia || null,
        Number(carga_horaria_planejada || 0),
        instrutor_responsavel || null,
        material_apoio || null,
        status_execucao || "planejada",
        conteudo_ministrado || null,
        Number(carga_horaria_real || 0),
        observacoes_execucao || null,
        reprogramada ? 1 : 0,
        motivo_reprogramacao || null,
        ministrada_em || null,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Aula criada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar aula da turma",
      error: error.message,
    });
  }
}

async function updateTurmaAula(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      dia_numero,
      data_aula,
      ordem,
      titulo,
      objetivo,
      conteudo_planejado,
      metodologia,
      carga_horaria_planejada,
      instrutor_responsavel,
      material_apoio,
      status_execucao,
      conteudo_ministrado,
      carga_horaria_real,
      observacoes_execucao,
      reprogramada,
      motivo_reprogramacao,
      ministrada_em,
    } = req.body || {};

    if (!treinamento_id || !dia_numero || !data_aula || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, dia, data e título da aula",
      });
    }

    await pool.query(
      `
      UPDATE turma_aulas
      SET
        treinamento_id = ?,
        dia_numero = ?,
        data_aula = ?,
        ordem = ?,
        titulo = ?,
        objetivo = ?,
        conteudo_planejado = ?,
        metodologia = ?,
        carga_horaria_planejada = ?,
        instrutor_responsavel = ?,
        material_apoio = ?,
        status_execucao = ?,
        conteudo_ministrado = ?,
        carga_horaria_real = ?,
        observacoes_execucao = ?,
        reprogramada = ?,
        motivo_reprogramacao = ?,
        ministrada_em = ?
      WHERE id = ?
      `,
      [
        Number(treinamento_id),
        Number(dia_numero),
        toDateOnly(data_aula),
        Number(ordem || 1),
        titulo,
        objetivo || null,
        conteudo_planejado || null,
        metodologia || null,
        Number(carga_horaria_planejada || 0),
        instrutor_responsavel || null,
        material_apoio || null,
        status_execucao || "planejada",
        conteudo_ministrado || null,
        Number(carga_horaria_real || 0),
        observacoes_execucao || null,
        reprogramada ? 1 : 0,
        motivo_reprogramacao || null,
        ministrada_em || null,
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Aula atualizada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar aula da turma",
      error: error.message,
    });
  }
}

async function deleteTurmaAula(req, res) {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM turma_aulas WHERE id = ?`, [id]);

    return res.json({
      ok: true,
      message: "Aula excluída com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir aula da turma",
      error: error.message,
    });
  }
}

async function gerarCronogramaTurma(req, res) {
  try {
    const { treinamento_id } = req.body || {};

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    const [treinamentos] = await pool.query(
      `
      SELECT
        id,
        tema,
        instrutor,
        data,
        data_inicio,
        data_fim
      FROM treinamentos
      WHERE id = ?
      LIMIT 1
      `,
      [treinamento_id]
    );

    if (!treinamentos.length) {
      return res.status(404).json({
        ok: false,
        message: "Turma não encontrada",
      });
    }

    const turma = treinamentos[0];
    const inicio = toDateOnly(turma.data_inicio || turma.data);
    const fim = toDateOnly(turma.data_fim || turma.data_inicio || turma.data);

    if (!inicio || !fim) {
      return res.status(400).json({
        ok: false,
        message: "A turma precisa ter data de início e fim",
      });
    }

    const totalDias = diffDaysInclusive(inicio, fim);

    const [existentes] = await pool.query(
      `SELECT COUNT(*) AS total FROM turma_aulas WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    if (Number(existentes[0]?.total || 0) > 0) {
      return res.status(400).json({
        ok: false,
        message: "Essa turma já possui aulas cadastradas",
      });
    }

    let diaNumero = 1;

    for (let i = 0; i < totalDias; i += 1) {
      const dataAula = addDays(inicio, i);

      if (!dataAula) continue;
      if (isSunday(dataAula)) continue;

      await pool.query(
        `
        INSERT INTO turma_aulas
        (
          treinamento_id,
          dia_numero,
          data_aula,
          ordem,
          titulo,
          objetivo,
          conteudo_planejado,
          metodologia,
          carga_horaria_planejada,
          instrutor_responsavel,
          status_execucao
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(treinamento_id),
          diaNumero,
          dataAula,
          1,
          `Aula do Dia ${diaNumero}`,
          `Execução do Dia ${diaNumero} da turma ${turma.tema || ""}`.trim(),
          null,
          null,
          0,
          turma.instrutor || null,
          "planejada",
        ]
      );

      diaNumero += 1;
    }

    return res.json({
      ok: true,
      message: "Cronograma base gerado com sucesso",
      total_dias: diaNumero - 1,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao gerar cronograma da turma",
      error: error.message,
    });
  }
}

async function duplicarPlanoAulas(req, res) {
  try {
    const { treinamento_origem_id, treinamento_destino_id } = req.body || {};

    if (!treinamento_origem_id || !treinamento_destino_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento_origem_id e treinamento_destino_id",
      });
    }

    const [origem] = await pool.query(
      `
      SELECT *
      FROM turma_aulas
      WHERE treinamento_id = ?
      ORDER BY dia_numero ASC, ordem ASC, id ASC
      `,
      [treinamento_origem_id]
    );

    if (!origem.length) {
      return res.status(404).json({
        ok: false,
        message: "A turma de origem não possui aulas",
      });
    }

    const [existentesDestino] = await pool.query(
      `SELECT COUNT(*) AS total FROM turma_aulas WHERE treinamento_id = ?`,
      [treinamento_destino_id]
    );

    if (Number(existentesDestino[0]?.total || 0) > 0) {
      return res.status(400).json({
        ok: false,
        message: "A turma de destino já possui aulas cadastradas",
      });
    }

    for (const aula of origem) {
      await pool.query(
        `
        INSERT INTO turma_aulas
        (
          treinamento_id,
          dia_numero,
          data_aula,
          ordem,
          titulo,
          objetivo,
          conteudo_planejado,
          metodologia,
          carga_horaria_planejada,
          instrutor_responsavel,
          material_apoio,
          status_execucao,
          conteudo_ministrado,
          carga_horaria_real,
          observacoes_execucao,
          reprogramada,
          motivo_reprogramacao,
          ministrada_em
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(treinamento_destino_id),
          Number(aula.dia_numero || 1),
          toDateOnly(aula.data_aula),
          Number(aula.ordem || 1),
          aula.titulo,
          aula.objetivo,
          aula.conteudo_planejado,
          aula.metodologia,
          Number(aula.carga_horaria_planejada || 0),
          aula.instrutor_responsavel,
          aula.material_apoio,
          "planejada",
          null,
          0,
          null,
          0,
          null,
          null,
        ]
      );
    }

    return res.json({
      ok: true,
      message: "Plano de aulas duplicado com sucesso",
      total: origem.length,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao duplicar plano de aulas",
      error: error.message,
    });
  }
}

async function getResumoTurmaAulas(req, res) {
  try {
    const { treinamento_id } = req.params;

    const [aulas] = await pool.query(
      `
      SELECT
        id,
        treinamento_id,
        dia_numero,
        data_aula,
        ordem,
        titulo,
        objetivo,
        conteudo_planejado,
        metodologia,
        carga_horaria_planejada,
        instrutor_responsavel,
        material_apoio,
        status_execucao,
        conteudo_ministrado,
        carga_horaria_real,
        observacoes_execucao,
        reprogramada,
        motivo_reprogramacao,
        ministrada_em
      FROM turma_aulas
      WHERE treinamento_id = ?
      ORDER BY dia_numero ASC, ordem ASC, id ASC
      `,
      [treinamento_id]
    );

    const totalAulas = aulas.length;
    const planejadas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "planejada"
    ).length;
    const ministradas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "ministrada"
    ).length;
    const parciais = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "parcial"
    ).length;
    const reprogramadas = aulas.filter(
      (item) =>
        normalizeStatus(item.status_execucao) === "reprogramada" ||
        Number(item.reprogramada || 0) === 1
    ).length;
    const canceladas = aulas.filter(
      (item) => normalizeStatus(item.status_execucao) === "cancelada"
    ).length;

    const cargaPlanejada = aulas.reduce(
      (acc, item) => acc + Number(item.carga_horaria_planejada || 0),
      0
    );

    const cargaReal = aulas.reduce(
      (acc, item) => acc + Number(item.carga_horaria_real || 0),
      0
    );

    const aderenciaAulas = totalAulas
      ? Math.round(((ministradas + parciais) / totalAulas) * 100)
      : 0;

    const aderenciaCarga =
      cargaPlanejada > 0 ? Math.round((cargaReal / cargaPlanejada) * 100) : 0;

    const desvioCarga = Number((cargaReal - cargaPlanejada).toFixed(2));

    const porDiaMap = {};

    aulas.forEach((item) => {
      const key = `${item.dia_numero}-${toDateOnly(item.data_aula)}`;

      if (!porDiaMap[key]) {
        porDiaMap[key] = {
          dia_numero: Number(item.dia_numero || 0),
          data_aula: toDateOnly(item.data_aula),
          total_aulas: 0,
          ministradas: 0,
          parciais: 0,
          planejadas: 0,
          reprogramadas: 0,
          canceladas: 0,
          carga_planejada: 0,
          carga_real: 0,
        };
      }

      const bucket = porDiaMap[key];
      const status = normalizeStatus(item.status_execucao);

      bucket.total_aulas += 1;
      bucket.carga_planejada += Number(item.carga_horaria_planejada || 0);
      bucket.carga_real += Number(item.carga_horaria_real || 0);

      if (status === "ministrada") bucket.ministradas += 1;
      else if (status === "parcial") bucket.parciais += 1;
      else if (status === "reprogramada" || Number(item.reprogramada || 0) === 1)
        bucket.reprogramadas += 1;
      else if (status === "cancelada") bucket.canceladas += 1;
      else bucket.planejadas += 1;
    });

    const porDia = Object.values(porDiaMap)
      .sort((a, b) => a.dia_numero - b.dia_numero)
      .map((item) => {
        const aderencia =
          item.total_aulas > 0
            ? Math.round(((item.ministradas + item.parciais) / item.total_aulas) * 100)
            : 0;

        return {
          ...item,
          aderencia_aulas: aderencia,
          desvio_carga: Number((item.carga_real - item.carga_planejada).toFixed(2)),
        };
      });

    const alertas = [];

    if (planejadas > 0) {
      alertas.push(`${planejadas} aula(s) ainda estão planejadas.`);
    }

    if (parciais > 0) {
      alertas.push(`${parciais} aula(s) foram executadas parcialmente.`);
    }

    if (reprogramadas > 0) {
      alertas.push(`${reprogramadas} aula(s) estão reprogramadas.`);
    }

    if (canceladas > 0) {
      alertas.push(`${canceladas} aula(s) foram canceladas.`);
    }

    if (!alertas.length) {
      alertas.push("Cronograma sem alertas críticos no momento.");
    }

    return res.json({
      ok: true,
      resumo: {
        total_aulas: totalAulas,
        planejadas,
        ministradas,
        parciais,
        reprogramadas,
        canceladas,
        carga_planejada: Number(cargaPlanejada.toFixed(2)),
        carga_real: Number(cargaReal.toFixed(2)),
        aderencia_aulas: aderenciaAulas,
        aderencia_carga: aderenciaCarga,
        desvio_carga: desvioCarga,
      },
      por_dia: porDia,
      alertas,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar resumo do cronograma",
      error: error.message,
    });
  }
}

module.exports = {
  listTurmaAulas,
  getTurmaAulaById,
  createTurmaAula,
  updateTurmaAula,
  deleteTurmaAula,
  gerarCronogramaTurma,
  duplicarPlanoAulas,
  getResumoTurmaAulas,
};
