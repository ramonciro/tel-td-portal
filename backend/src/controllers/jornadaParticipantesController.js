const XLSX = require("xlsx");
const db = require("../lib/db");
const { resolverPessoa } = require("../services/pessoasService");

// Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): mesma
// normalização usada em todo o resto do Cadastro Único (ver
// pessoasService.js e treinamentoParticipantesController.js).
function normalizarCpf(valor) {
  const digits = String(valor || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
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
    const conditions = [];

    if (jornada_id) {
      conditions.push("jp.jornada_id = ?");
      params.push(jornada_id);
    }

    if (req.empresaId) {
      conditions.push("jp.empresa_id = ?");
      params.push(req.empresaId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

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
    const cpfNormalizado = normalizarCpf(req.body?.cpf);

    if (!jornada_id) {
      return res.status(400).json({ error: "Informe a jornada." });
    }

    if (!nome) {
      return res.status(400).json({ error: "Informe o nome da pessoa." });
    }

    if (req.body?.cpf && !cpfNormalizado) {
      return res.status(400).json({ error: "CPF inválido — informe os 11 dígitos, com ou sem pontuação." });
    }

    if (req.empresaId) {
      const [jornadaDoTenant] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornada_id, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    // Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): quando o CPF
    // vem preenchido, bloqueia duplicidade também por CPF dentro da mesma
    // jornada — além da checagem por nome+matrícula que a UNIQUE KEY do
    // banco já cobre (a de baixo, no catch de ER_DUP_ENTRY). Sem isso, a
    // mesma pessoa poderia entrar duas vezes na jornada bastando digitar o
    // nome ou a matrícula um pouco diferente.
    if (cpfNormalizado) {
      const [duplicadoCpf] = await db.query(
        `SELECT id FROM jornada_participantes WHERE jornada_id = ? AND cpf = ? LIMIT 1`,
        [jornada_id, cpfNormalizado]
      );
      if (duplicadoCpf.length) {
        return res.status(400).json({ error: "Esta pessoa (mesmo CPF) já está vinculada a esta jornada." });
      }
    }

    // Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): mesma função
    // central usada em todo o resto do sistema (ver pessoasService.js) —
    // casa por CPF, senão por matrícula+nome, senão cria pessoa nova
    // (provisória, mesmo sem CPF nenhum — é o caso mais comum aqui, já que
    // a maioria das planilhas de Metodologia nunca teve CPF). Só roda
    // quando `req.empresaId` está definido (tenant identificado); sem
    // isso, participante é cadastrado igual a antes, sem pessoa_id.
    let pessoaId = null;
    if (req.empresaId) {
      try {
        const { pessoa } = await resolverPessoa(
          { empresaId: req.empresaId, nome, cpf: cpfNormalizado, matricula, cliente },
          db
        );
        pessoaId = pessoa.id;
      } catch (erroPessoa) {
        console.error("[jornada-participantes] resolverPessoa falhou:", erroPessoa.message || erroPessoa);
      }
    }

    await db.query(
      `
      INSERT INTO jornada_participantes (
        jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao, empresa_id, cpf, pessoa_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao, req.empresaId ?? null, cpfNormalizado, pessoaId]
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
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM jornada_participantes WHERE id = ?${tenantCheck} LIMIT 1`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Participante não encontrado." });
    }

    // 22/09/2026 (Editar/excluir por vínculo, pedido do Ramon — Tripulação):
    // não existe FK entre coaching_individual.jornada_participante_id e esta
    // tabela, então excluir o vínculo de jornada de uma pessoa que também
    // está em coaching individual ("ambos" na Tripulação) deixaria o
    // coaching apontando pra um participante que não existe mais — e ele
    // sumiria da tela inteira, mesmo sem ter sido excluído. Por isso,
    // desvincula (nunca apaga) o coaching antes de remover o participante:
    // ele passa a aparecer como coaching individual "solo", com todo o
    // histórico de encontros e perfil comportamental preservado.
    await db.query(
      `UPDATE coaching_individual SET jornada_participante_id = NULL WHERE jornada_participante_id = ?${tenantCheck}`,
      checkParams
    );

    await db.query(`DELETE FROM jornada_participantes WHERE id = ?${tenantCheck}`, checkParams);
    return res.json({ ok: true, message: "Participante removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover participante da jornada:", error);
    return res.status(500).json({ error: "Erro ao remover participante da jornada." });
  }
}

// Chave de deduplicação NULL-safe: a UNIQUE KEY do banco é
// (jornada_id, nome, matricula), mas o MySQL trata NULL != NULL — então ela
// não pega duplicatas quando a matrícula vem vazia (comum em planilhas sem
// essa coluna). Tratamos matrícula vazia como parte normal da chave aqui.
//
// Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): quando o CPF
// está disponível (na planilha ou já cadastrado nesta jornada), a chave
// passa a ser o CPF — identidade real, não string de nome — então duas
// linhas da mesma pessoa com nome digitado ligeiramente diferente (ou
// matrícula preenchida numa e não na outra) deixam de contar como duas
// pessoas distintas. Sem CPF em nenhum dos dois lados, cai no
// nome+matrícula de sempre — nenhuma mudança de comportamento pra quem já
// importa sem essa coluna.
function chaveParticipante(nome, matricula, cpf) {
  const cpfNormalizado = normalizarCpf(cpf);
  if (cpfNormalizado) return `cpf:${cpfNormalizado}`;
  return `nm:${String(nome || "").trim().toLowerCase()}|${String(matricula || "").trim().toLowerCase()}`;
}

async function importExcel(req, res) {
  const jornada_id = Number(req.body?.jornada_id || 0);

  if (!jornada_id) {
    return res.status(400).json({ error: "Informe a jornada para importação." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Arquivo não enviado." });
  }

  const conn = await db.getConnection();
  try {
    if (req.empresaId) {
      const [jornadaDoTenant] = await conn.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornada_id, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[primeiraAba];
    const linhasOriginais = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const linhas = linhasOriginais.map(normalizeRowKeys);

    if (!linhas.length) {
      return res.status(400).json({ error: "A planilha está vazia." });
    }

    // Bugfix: duplicatas silenciosas quando a mesma planilha é importada mais
    // de uma vez sem matrícula preenchida — dedupe feito aqui, contra quem já
    // está na jornada E contra repetições dentro da própria planilha.
    // Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): busca também
    // o cpf já cadastrado, pra chaveParticipante() poder preferir identidade
    // real quando disponível (ver comentário da função).
    const [existentes] = await conn.query(
      `SELECT nome, matricula, cpf FROM jornada_participantes WHERE jornada_id = ?`,
      [jornada_id]
    );
    const jaExistentes = new Set(existentes.map((e) => chaveParticipante(e.nome, e.matricula, e.cpf)));
    const vistosNestaPlanilha = new Set();

    const linhasValidas = linhas.filter((l) => String(l.nome || "").trim());
    const paraInserir = [];

    for (const linha of linhasValidas) {
      const nome = String(linha.nome || "").trim();
      const matricula = String(linha.matricula || "").trim() || null;
      const cliente = String(linha.cliente || "").trim() || null;
      const cpfLinha = normalizarCpf(linha.cpf);
      const k = chaveParticipante(nome, matricula, cpfLinha);
      if (jaExistentes.has(k) || vistosNestaPlanilha.has(k)) continue;
      vistosNestaPlanilha.add(k);

      // Cadastro Único de Pessoas (Fase 2, item 4 — 28/09/2026): mesma
      // função central do resto do sistema — casa por CPF, senão por
      // matrícula+nome, senão cria pessoa nova (provisória). Planilhas de
      // Metodologia sem CPF nenhum continuam funcionando, só nascem como
      // pessoa provisória (esperado, não é erro).
      let pessoaId = null;
      if (req.empresaId) {
        try {
          const { pessoa } = await resolverPessoa(
            { empresaId: req.empresaId, nome, cpf: cpfLinha, matricula, cliente },
            conn
          );
          pessoaId = pessoa.id;
        } catch (erroPessoa) {
          console.error("[jornada-participantes] resolverPessoa falhou na importação:", erroPessoa.message || erroPessoa);
        }
      }

      paraInserir.push([
        jornada_id,
        nome,
        matricula,
        cliente,
        String(linha.turma || "").trim() || null,
        String(linha.cargo || "").trim() || null,
        String(linha.supervisor || "").trim() || null,
        normalizeStatus(linha.status_jornada),
        "planilha",
        req.empresaId ?? null,
        cpfLinha,
        pessoaId,
      ]);
    }

    // Bugfix: antes era um INSERT por linha, sequencial e sem transação —
    // lento em planilhas grandes e sem atomicidade (uma falha no meio
    // deixava a importação parcialmente feita). Agora um único INSERT em
    // lote, dentro de uma transação.
    let totalImportados = 0;
    if (paraInserir.length) {
      await conn.beginTransaction();
      try {
        await conn.query(
          `INSERT INTO jornada_participantes
           (jornada_id, nome, matricula, cliente, turma, cargo, supervisor, status_jornada, origem_importacao, empresa_id, cpf, pessoa_id)
           VALUES ?`,
          [paraInserir]
        );
        await conn.commit();
        totalImportados = paraInserir.length;
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }

    const totalIgnorados = linhasValidas.length - totalImportados;
    const sufixoIgnorados = totalIgnorados > 0 ? `, ${totalIgnorados} já existente(s) ignorado(s)` : "";

    return res.json({
      ok: true,
      message: `Tripulação importada com sucesso. ${totalImportados} registro(s) incluído(s)${sufixoIgnorados}.`,
      total: totalImportados,
    });
  } catch (error) {
    const code = String(error.code || "");

    if (code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({ error: "A tabela de tripulação da jornada ainda não foi criada no banco." });
    }

    console.error("Erro ao importar tripulação:", error);
    return res.status(500).json({ error: "Erro ao importar tripulação da jornada." });
  } finally {
    conn.release();
  }
}

module.exports = {
  list,
  create,
  remove,
  importExcel,
};
