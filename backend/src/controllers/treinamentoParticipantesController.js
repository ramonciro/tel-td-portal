import pool from "../db.js";
import XLSX from "xlsx";

export async function getParticipantesByTreinamento(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM treinamento_participantes WHERE treinamento_id = ?`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: "Erro ao buscar participantes",
      error: error.message,
    });
  }
}

export async function importarParticipantesExcel(req, res) {
  try {
    const { treinamento_id } = req.body;

    const workbook = XLSX.read(req.file.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const dados = XLSX.utils.sheet_to_json(sheet);

    for (const row of dados) {
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
          data_admissao
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          treinamento_id,
          row.nome,
          row.matricula,
          row.cliente,
          row.turma,
          row.supervisor,
          row.operacao,
          row.data_admissao
        ]
      );
    }

    res.json({ ok: true, total: dados.length });

  } catch (error) {
    res.status(500).json({
      message: "Erro ao importar Excel",
      error: error.message,
    });
  }
}

export async function salvarChamadaParticipantes(req, res) {
  try {

    const { participantes } = req.body;

    for (const p of participantes) {

      await pool.query(
        `
        UPDATE treinamento_participantes
        SET
          status_presenca = ?,
          justificativa = ?
        WHERE id = ?
        `,
        [
          p.status_presenca,
          p.justificativa,
          p.id
        ]
      );

    }

    res.json({ ok: true });

  } catch (error) {
    res.status(500).json({
      message: "Erro ao salvar chamada",
      error: error.message,
    });
  }
}
