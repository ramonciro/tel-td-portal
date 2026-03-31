const XLSX = require("xlsx");
const db = require("../lib/db");

function parseLocalDate(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate()
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");

  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function isSunday(dateValue) {
  const d = parseLocalDate(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}


function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRowKeys(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return normalized;
}

async function getParticipantesByTreinamento(req, res) {
  try {
    const { id } = req.params;
    const dataChamada = req.query?.data || null;

    let rows;

    if (dataChamada) {
      const [result] = await db.query(
        `
        SELECT
          tp.id,
          tp.treinamento_id,
          tp.nome,
          tp.matricula,
          tp.cliente,
          tp.turma,
          tp.supervisor,
          tp.operacao,
          tp.data_admissao,
          COALESCE(p.status, 'pendente') AS status_presenca,
          COALESCE(p.justificativa, '') AS justificativa,
          tp.created_at
        FROM treinamento_participantes tp
        LEFT JOIN presencas p
          ON p.treinamento_id = tp.treinamento_id
         AND p.treinando_nome = tp.nome
         AND p.data_chamada = ?
        WHERE tp.treinamento_id = ?
        ORDER BY tp.nome ASC
        `,
        [dataChamada, id]
      );
      rows = result;
    } else {
      const [result] = await db.query(
        `
        SELECT
          id,
          treinamento_id,
          nome,
          matricula,
          cliente,
          turma,
          supervisor,
          operacao,
          data_admissao,
          status_presenca,
          justificativa,
          created_at
        FROM treinamento_participantes
        WHERE treinamento_id = ?
        ORDER BY nome ASC
        `,
        [id]
      );
      rows = result;
    }

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar participantes da turma",
      error: error.message,
    });
  }
}

async function importarParticipantesExcel(req, res) {
  try {
    const { treinamento_id } = req.body;

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "Arquivo Excel não enviado",
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[primeiraAba];
    const linhasOriginais = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const linhas = linhasOriginais.map(normalizeRowKeys);

    if (!linhas.length) {
      return res.status(400).json({
        ok: false,
        message: "A planilha está vazia",
      });
    }

    const colunasObrigatorias = [
      "nome",
      "matricula",
      "cliente",
      "turma",
      "supervisor",
      "operacao",
      "data_admissao",
    ];

    const primeiraLinha = linhas[0];
    const faltando = colunasObrigatorias.filter(
      (col) => !(col in primeiraLinha)
    );

    if (faltando.length) {
      return res.status(400).json({
        ok: false,
        message: `Colunas obrigatórias ausentes: ${faltando.join(", ")}`,
      });
    }

    await db.query(
      `DELETE FROM presencas WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    await db.query(
      `DELETE FROM treinamento_participantes WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    let totalImportados = 0;

    for (const linha of linhas) {
      const nome = String(linha.nome || "").trim();
      if (!nome) continue;

      await db.query(
        `
        INSERT INTO treinamento_participantes
        (
          treinamento_id,
          nome,
          matricula,
          cliente,
          turma,
          supervisor,
          operacao,
          data_admissao,
          status_presenca,
          justificativa
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          treinamento_id,
          nome,
          String(linha.matricula || "").trim(),
          String(linha.cliente || "").trim(),
          String(linha.turma || "").trim(),
          String(linha.supervisor || "").trim(),
          String(linha.operacao || "").trim(),
          formatExcelDateToMySQL(linha.data_admissao),
          "pendente",
          null,
        ]
      );

      totalImportados += 1;
    }

    try {
      await db.query(
        `UPDATE treinamentos SET participantes = ? WHERE id = ?`,
        [totalImportados, treinamento_id]
      );
    } catch {}

    return res.json({
      ok: true,
      message: "Participantes importados com sucesso",
      total: totalImportados,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao importar participantes",
      error: error.message,
    });
  }
}

async function salvarChamadaParticipantes(req, res) {
  try {
    const { treinamento_id, participantes, data_chamada } = req.body || {};

    if (!treinamento_id || !Array.isArray(participantes)) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento_id e participantes",
      });
    }

    if (!data_chamada) {
      return res.status(400).json({
        ok: false,
        message: "Informe a data da chamada",
      });
    }

    if (isSunday(data_chamada)) {
      return res.status(400).json({
        ok: false,
        message: "Domingo é considerado dia não letivo e não gera chamada.",
      });
    }

    for (const item of participantes) {
      const status = item.status_presenca || "pendente";
      const presente = status === "presente" ? 1 : 0;

      const [existentes] = await db.query(
        `
        SELECT id
        FROM presencas
        WHERE treinamento_id = ? AND treinando_nome = ? AND data_chamada = ?
        LIMIT 1
        `,
        [treinamento_id, item.nome, data_chamada]
      );

      if (existentes.length) {
        await db.query(
          `
          UPDATE presencas
          SET presente = ?, status = ?, justificativa = ?, data_chamada = ?
          WHERE id = ?
          `,
          [
            presente,
            status,
            item.justificativa || null,
            data_chamada,
            existentes[0].id,
          ]
        );
      } else {
        await db.query(
          `
          INSERT INTO presencas
          (treinamento_id, treinando_nome, data_chamada, presente, status, justificativa)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            treinamento_id,
            item.nome,
            data_chamada,
            presente,
            status,
            item.justificativa || null,
          ]
        );
      }

      if (item.id) {
        await db.query(
          `
          UPDATE treinamento_participantes
          SET status_presenca = ?, justificativa = ?
          WHERE id = ? AND treinamento_id = ?
          `,
          [
            status,
            item.justificativa || null,
            item.id,
            treinamento_id,
          ]
        );
      }
    }

    return res.json({
      ok: true,
      message: "Chamada diária salva com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar chamada diária",
      error: error.message,
    });
  }
}

async function createParticipanteTreinamento(req, res) {
  try {
    const treinamento_id = Number(req.params?.id || req.body?.treinamento_id || 0);
    const {
      nome,
      matricula,
      cliente,
      turma,
      supervisor,
      operacao,
      data_admissao,
    } = req.body || {};

    if (!treinamento_id || !String(nome || "").trim() || !String(matricula || "").trim()) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento, nome e matrícula do participante",
      });
    }

    const [existentes] = await db.query(
      `
      SELECT id
      FROM treinamento_participantes
      WHERE treinamento_id = ? AND (matricula = ? OR nome = ?)
      LIMIT 1
      `,
      [treinamento_id, String(matricula).trim(), String(nome).trim()]
    );

    if (existentes.length) {
      return res.status(409).json({
        ok: false,
        message: "Já existe participante com esta matrícula ou nome nesta turma",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO treinamento_participantes
      (
        treinamento_id,
        nome,
        matricula,
        cliente,
        turma,
        supervisor,
        operacao,
        data_admissao,
        status_presenca,
        justificativa
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        treinamento_id,
        String(nome || "").trim(),
        String(matricula || "").trim(),
        String(cliente || "").trim(),
        String(turma || "").trim(),
        String(supervisor || "").trim(),
        String(operacao || "").trim(),
        formatExcelDateToMySQL(data_admissao),
        "pendente",
        null,
      ]
    );

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM treinamento_participantes WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    try {
      await db.query(`UPDATE treinamentos SET participantes = ? WHERE id = ?`, [
        Number(countRow?.total || 0),
        treinamento_id,
      ]);
    } catch {}

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Participante adicionado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao adicionar participante",
      error: error.message,
    });
  }
}

async function deleteParticipanteTreinamento(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT id, treinamento_id, nome
      FROM treinamento_participantes
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Participante não encontrado",
      });
    }

    const participante = rows[0];

    await db.query(
      `
      DELETE FROM presencas
      WHERE treinamento_id = ? AND treinando_nome = ?
      `,
      [participante.treinamento_id, participante.nome]
    );

    await db.query(
      `
      DELETE FROM treinamento_participantes
      WHERE id = ?
      `,
      [id]
    );

    return res.json({
      ok: true,
      message: "Participante excluído com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir participante",
      error: error.message,
    });
  }
}

async function deleteParticipantesTreinamentoBulk(req, res) {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({
        ok: false,
        message: "Informe os ids dos participantes",
      });
    }

    const placeholders = ids.map(() => "?").join(", ");

    const [rows] = await db.query(
      `
      SELECT id, treinamento_id, nome
      FROM treinamento_participantes
      WHERE id IN (${placeholders})
      `,
      ids
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Nenhum participante encontrado",
      });
    }

    for (const participante of rows) {
      await db.query(
        `
        DELETE FROM presencas
        WHERE treinamento_id = ? AND treinando_nome = ?
        `,
        [participante.treinamento_id, participante.nome]
      );
    }

    await db.query(
      `
      DELETE FROM treinamento_participantes
      WHERE id IN (${placeholders})
      `,
      ids
    );

    return res.json({
      ok: true,
      message: "Participantes excluídos com sucesso",
      total: rows.length,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir participantes",
      error: error.message,
    });
  }
}

function formatExcelDateToMySQL(value) {
  if (!value) return null;

  if (typeof value === "number") {
    const jsDate = XLSX.SSF.parse_date_code(value);
    if (!jsDate) return null;

    const yyyy = String(jsDate.y).padStart(4, "0");
    const mm = String(jsDate.m).padStart(2, "0");
    const dd = String(jsDate.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const us = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (us) {
    return `${us[1]}-${us[2]}-${us[3]}`;
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = String(date.getFullYear()).padStart(4, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

module.exports = {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
  createParticipanteTreinamento,
  deleteParticipanteTreinamento,
  deleteParticipantesTreinamentoBulk,
};
