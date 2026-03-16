import pool from "../db.js";
import XLSX from "xlsx";

export async function getParticipantesByTreinamento(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
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

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao buscar participantes da turma",
      error: error.message,
    });
  }
}

export async function importarParticipantesExcel(req, res) {
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
    const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

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

    await pool.query(
      `DELETE FROM treinamento_participantes WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    for (const linha of linhas) {
      if (!String(linha.nome || "").trim()) continue;

      await pool.query(
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
          String(linha.nome || "").trim(),
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
    }

    res.json({
      ok: true,
      message: "Participantes importados com sucesso",
      total: linhas.length,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao importar participantes",
      error: error.message,
    });
  }
}

export async function salvarChamadaParticipantes(req, res) {
  try {
    const { treinamento_id, participantes } = req.body || {};

    if (!treinamento_id || !Array.isArray(participantes)) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento_id e participantes",
      });
    }

    for (const item of participantes) {
      await pool.query(
        `
        UPDATE treinamento_participantes
        SET status_presenca = ?, justificativa = ?
        WHERE id = ? AND treinamento_id = ?
        `,
        [
          item.status_presenca || "pendente",
          item.justificativa || null,
          item.id,
          treinamento_id,
        ]
      );

      const status = item.status_presenca || "pendente";
      const presente = status === "presente" ? 1 : 0;

      const [existentes] = await pool.query(
        `
        SELECT id
        FROM presencas
        WHERE treinamento_id = ? AND treinando_nome = ?
        LIMIT 1
        `,
        [treinamento_id, item.nome]
      );

      if (existentes.length) {
        await pool.query(
          `
          UPDATE presencas
          SET presente = ?, status = ?, justificativa = ?
          WHERE id = ?
          `,
          [presente, status, item.justificativa || null, existentes[0].id]
        );
      } else {
        await pool.query(
          `
          INSERT INTO presencas
          (treinamento_id, treinando_nome, presente, status, justificativa)
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            treinamento_id,
            item.nome,
            presente,
            status,
            item.justificativa || null,
          ]
        );
      }
    }

    res.json({
      ok: true,
      message: "Chamada salva com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao salvar chamada",
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

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}
