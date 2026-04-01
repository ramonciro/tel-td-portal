const XLSX = require("xlsx");
const db = require("../lib/db");

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

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["nao_iniciado", "não iniciado", "nao iniciado"].includes(status)) return "nao_iniciado";
  if (["concluido", "concluída", "concluida", "concluído"].includes(status)) return "concluido";
  if (["em_sustentacao", "em sustentacao", "sustentacao", "sustentação"].includes(status)) return "em_sustentacao";
  return "em_percurso";
}

async function list(req, res) {
  try {
    const { jornada_id } = req.query || {};
    const params = [];
    let where = "";

    if (jornada_id) {
      where = "WHERE jp.jornada_id = ?";
      params.push(jornada_id);
    }

    const [rows] = await db.query(
      `
      SELECT
        jp.*,
        jd.nome AS jornada_nome
      FROM jornada_participantes jp
      INNER JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
      ${where}
      ORDER BY jd.nome ASC, jp.nome ASC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    if (String(error.code || "") === "ER_NO_SUCH_TABLE") {
      return res.json([]);
    }

    console.error("Erro ao listar participantes da jornada:", error);
    return res.status(500).json({ error: "Erro ao listar participantes da jornada." });
  }
}

async function create(req, res) {
  try {
    const jornada_id = Number(req.body?.jornada_id || 0);
    const nome = String(req.body?.nome || "").trim();
    const matricula = String(req.body?.matricula || "").trim() || null;
    const cliente = String(req.body?.cliente || "").trim() || null;
    const turma = String(req.body?.turma || "").trim() || null;
    const cargo = String(req.body?.cargo || "").trim() || null;
    const supervisor = String(req.body?.supervisor || "").trim() || null;
    const status_jornada = normalizeStatus(req.body?.status_jornada);
    const origem_importacao = "manual";

    if (!jornada_id) {
      return res.status(400).json({ error: "Informe a jornada." });
    }

    if (!nome) {
      return res.status(400).json({ error: "Informe o nome da pessoa." });
    }

    await db.query(
      `
      INSERT INTO jornada_participantes (
        jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao]
    );

    return res.status(201).json({ ok: true, message: "Participante vinculado com sucesso." });
  } catch (error) {
    const code = String(error.code || "");

    if (code === "ER_DUP_ENTRY" || String(error.message || "").includes("Duplicate")) {
      return res.status(400).json({ error: "Esta pessoa já está vinculada a esta jornada." });
    }

    if (code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({ error: "A tabela de tripulação da jornada ainda não foi criada no banco." });
    }

    if (code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({ error: "A jornada selecionada não foi encontrada para vínculo da tripulação." });
    }

    console.error("Erro ao criar participante da jornada:", error);
    return res.status(500).json({ error: "Erro ao criar participante da jornada." });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const [exists] = await db.query(`SELECT id FROM jornada_participantes WHERE id = ? LIMIT 1`, [id]);

    if (!exists.length) {
      return res.status(404).json({ error: "Participante não encontrado." });
    }

    await db.query(`DELETE FROM jornada_participantes WHERE id = ?`, [id]);
    return res.json({ ok: true, message: "Participante removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover participante da jornada:", error);
    return res.status(500).json({ error: "Erro ao remover participante da jornada." });
  }
}

async function importExcel(req, res) {
  try {
    const jornada_id = Number(req.body?.jornada_id || 0);

    if (!jornada_id) {
      return res.status(400).json({ error: "Informe a jornada para importação." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[primeiraAba];
    const linhasOriginais = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const linhas = linhasOriginais.map(normalizeRowKeys);

    if (!linhas.length) {
      return res.status(400).json({ error: "A planilha está vazia." });
    }

    let totalImportados = 0;

    for (const linha of linhas) {
      const nome = String(linha.nome || "").trim();
      if (!nome) continue;

      try {
        await db.query(
          `
          INSERT INTO jornada_participantes (
            jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            jornada_id,
            nome,
            String(linha.matricula || "").trim() || null,
            String(linha.cliente || "").trim() || null,
            String(linha.turma || "").trim() || null,
            String(linha.cargo || "").trim() || null,
            String(linha.supervisor || "").trim() || null,
            normalizeStatus(linha.status_jornada),
            "planilha",
          ]
        );
        totalImportados += 1;
      } catch (error) {
        if (!String(error.message || "").includes("Duplicate")) {
          throw error;
        }
      }
    }

    return res.json({
      ok: true,
      message: `Tripulação importada com sucesso. ${totalImportados} registro(s) incluído(s).`,
      total: totalImportados,
    });
  } catch (error) {
    const code = String(error.code || "");

    if (code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({ error: "A tabela de tripulação da jornada ainda não foi criada no banco." });
    }

    console.error("Erro ao importar tripulação:", error);
    return res.status(500).json({ error: "Erro ao importar tripulação da jornada." });
  }
}

module.exports = {
  list,
  create,
  remove,
  importExcel,
};
