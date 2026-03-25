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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mapRowKeys(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});
}

function getFirstValue(row, aliases = []) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
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
  let connection;

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

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const primeiraAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[primeiraAba];
    const linhasBrutas = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const linhas = linhasBrutas.map(mapRowKeys);

    if (!linhas.length) {
      return res.status(400).json({
        ok: false,
        message: "A planilha está vazia",
      });
    }

    const primeiraLinha = linhas[0];
    const requiredAliases = {
      nome: ["nome", "treinando_nome", "colaborador", "participante"],
      matricula: ["matricula", "registro", "id_colaborador"],
      cliente: ["cliente", "operacao_cliente"],
      turma: ["turma", "nome_turma", "treinamento", "tema"],
      supervisor: ["supervisor", "gestor", "lider"],
      operacao: ["operacao", "area", "produto"],
      data_admissao: ["data_admissao", "admissao", "data_de_admissao", "data admissao"],
    };

    const faltando = Object.entries(requiredAliases)
      .filter(([, aliases]) => !aliases.some((alias) => alias in primeiraLinha))
      .map(([campo]) => campo);

    if (faltando.length) {
      return res.status(400).json({
        ok: false,
        message: `Colunas obrigatórias ausentes: ${faltando.join(", ")}` ,
      });
    }

    const participantes = linhas
      .map((linha) => ({
        nome: String(getFirstValue(linha, requiredAliases.nome) || "").trim(),
        matricula: String(getFirstValue(linha, requiredAliases.matricula) || "").trim(),
        cliente: String(getFirstValue(linha, requiredAliases.cliente) || "").trim(),
        turma: String(getFirstValue(linha, requiredAliases.turma) || "").trim(),
        supervisor: String(getFirstValue(linha, requiredAliases.supervisor) || "").trim(),
        operacao: String(getFirstValue(linha, requiredAliases.operacao) || "").trim(),
        data_admissao: formatExcelDateToMySQL(getFirstValue(linha, requiredAliases.data_admissao)),
      }))
      .filter((item) => item.nome);

    if (!participantes.length) {
      return res.status(400).json({
        ok: false,
        message: "Nenhum participante válido foi encontrado na planilha",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM treinamento_participantes WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    for (const item of participantes) {
      await connection.query(
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
          item.nome,
          item.matricula,
          item.cliente,
          item.turma,
          item.supervisor,
          item.operacao,
          item.data_admissao,
          "pendente",
          null,
        ]
      );
    }

    await connection.query(
      `
      UPDATE treinamentos
      SET participantes = ?, participantes_previstos = ?
      WHERE id = ?
      `,
      [participantes.length, participantes.length, treinamento_id]
    );

    await connection.commit();

    return res.json({
      ok: true,
      message: "Participantes importados com sucesso",
      total: participantes.length,
    });
  } catch (error) {
    if (connection) await connection.rollback();

    return res.status(500).json({
      ok: false,
      message: "Erro ao importar participantes",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
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
          (treinamento_id, treinando_nome, presente, status, justificativa, data_chamada)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            treinamento_id,
            item.nome,
            presente,
            status,
            item.justificativa || null,
            data_chamada,
          ]
        );
      }

      await db.query(
        `
        UPDATE treinamento_participantes
        SET status_presenca = ?, justificativa = ?
        WHERE treinamento_id = ? AND nome = ?
        `,
        [status, item.justificativa || null, treinamento_id, item.nome]
      );
    }

    return res.json({ ok: true, message: "Chamada salva com sucesso" });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar chamada",
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
      return res.status(404).json({ ok: false, message: "Participante não encontrado" });
    }

    const participante = rows[0];

    await db.query(
      `DELETE FROM presencas WHERE treinamento_id = ? AND treinando_nome = ?`,
      [participante.treinamento_id, participante.nome]
    );

    await db.query(
      `DELETE FROM treinamento_participantes WHERE id = ?`,
      [id]
    );

    return res.json({ ok: true, message: "Participante excluído com sucesso" });
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

    const [rows] = await db.query(
      `
      SELECT id, treinamento_id, nome
      FROM treinamento_participantes
      WHERE id IN (${ids.map(() => "?").join(",")})
      `,
      ids
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Nenhum participante encontrado para exclusão",
      });
    }

    for (const participante of rows) {
      await db.query(
        `DELETE FROM presencas WHERE treinamento_id = ? AND treinando_nome = ?`,
        [participante.treinamento_id, participante.nome]
      );
    }

    await db.query(
      `DELETE FROM treinamento_participantes WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );

    return res.json({ ok: true, message: "Participantes excluídos com sucesso" });
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

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = String(value.getFullYear()).padStart(4, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}

module.exports = {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
  deleteParticipanteTreinamento,
  deleteParticipantesTreinamentoBulk,
};
