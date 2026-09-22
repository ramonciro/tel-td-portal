/**
 * backfillPessoas.js — Cadastro único de pessoas, Fase 0 (22/09/2026)
 *
 * Popula `pessoas` a partir dos dados já existentes nas seis tabelas que
 * hoje duplicam identidade, e preenche o pessoa_id de cada linha (colunas
 * criadas na migração 44/45 — ver database/migrate.js). Usa exatamente a
 * mesma resolverPessoa() (services/pessoasService.js) que os controllers
 * de cadastro vão usar na Fase 2 — não há lógica de casamento duplicada
 * aqui.
 *
 * ORDEM DAS TABELAS importa: processa primeiro as duas com CPF confiável
 * (treinamento_participantes, dados_bancarios_colaborador), para que o
 * maior número possível de pessoas nasça "confirmada" (por CPF) antes das
 * tabelas do módulo Metodologia (sem CPF nenhum) tentarem casar só por
 * matrícula+nome contra uma base já mais completa.
 *
 * SEGURANÇA/IDEMPOTÊNCIA:
 *   - Só processa linhas com pessoa_id IS NULL — rodar de novo depois de
 *     aplicado não duplica nada e não re-processa quem já foi resolvido.
 *   - Cada linha é resolvida e gravada dentro de uma transação própria (a
 *     leitura/gravação em `pessoas` e o UPDATE do pessoa_id na tabela de
 *     origem são atômicos juntos) — uma linha com erro nunca deixa a
 *     tabela de origem com pessoa_id parcialmente errado, e nunca
 *     interrompe as demais.
 *   - Linha sem empresa_id resolvível (ex.: treinamento_participantes cujo
 *     treinamento também está sem empresa_id) é pulada e reportada, nunca
 *     adivinhada.
 *
 * USO:
 *   node src/scripts/backfillPessoas.js                  (dry-run — só relatório)
 *   node src/scripts/backfillPessoas.js --apply           (grava de verdade)
 *   node src/scripts/backfillPessoas.js --apply --limit=50        (teste)
 *   node src/scripts/backfillPessoas.js --apply --empresa=1       (só um tenant)
 *   node src/scripts/backfillPessoas.js --apply --tabela=treinamento_participantes  (só uma tabela)
 *
 * DRY-RUN vs APPLY — por que usam transação de jeito diferente:
 *   --apply grava cada linha na sua própria transação (leitura/gravação em
 *   `pessoas` + UPDATE do pessoa_id de origem, atômicos juntos) — assim uma
 *   linha com erro nunca corrompe as outras, e dá pra retomar de onde parou.
 *   O dry-run, se fizesse o mesmo (uma transação por linha, sempre
 *   revertida), nunca enxergaria os casamentos ENTRE linhas processadas na
 *   mesma rodada — cada rollback apaga a pessoa "seria_criada" antes da
 *   próxima linha rodar, então duas linhas da mesma pessoa sempre reportam
 *   "seria_criada" duas vezes, escondendo o casamento que só existiria de
 *   verdade. Por isso o dry-run inteiro roda dentro de UMA única transação
 *   (todas as tabelas, todas as linhas), revertida só no final — os
 *   casamentos entre linhas ficam visíveis no relatório, e nada é gravado.
 */
const pool = require("../lib/db");
const { resolverPessoa } = require("../services/pessoasService");

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const empresaArg = argv.find((a) => a.startsWith("--empresa="));
  const tabelaArg = argv.find((a) => a.startsWith("--tabela="));
  return {
    apply,
    limit: limitArg ? Number(limitArg.split("=")[1]) : null,
    empresaId: empresaArg ? Number(empresaArg.split("=")[1]) : null,
    tabelaFiltro: tabelaArg ? tabelaArg.split("=")[1] : null,
  };
}

// Cada fonte sabe buscar suas próprias linhas pendentes (pessoa_id NULL) já
// com o empresa_id resolvido (direto ou via JOIN, no caso de
// treinamento_participantes) e mapear pros campos genéricos que
// resolverPessoa() espera.
const FONTES = [
  {
    tabela: "treinamento_participantes",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["tp.pessoa_id IS NULL", "t.empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("t.empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      const [rows] = await pool.query(
        `SELECT tp.id, t.empresa_id, tp.nome, tp.cpf, tp.matricula, tp.cliente
         FROM treinamento_participantes tp
         JOIN treinamentos t ON t.id = tp.treinamento_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY tp.id ASC ${limitSql}`,
        params
      );
      return rows;
    },
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE treinamento_participantes SET pessoa_id = ? WHERE id = ?`, [pessoaId, linha.id]);
    },
  },
  {
    tabela: "dados_bancarios_colaborador",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["pessoa_id IS NULL", "empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      const [rows] = await pool.query(
        `SELECT cpf AS id, empresa_id, nome, cpf, NULL AS matricula, NULL AS cliente
         FROM dados_bancarios_colaborador
         WHERE ${condicoes.join(" AND ")}
         ORDER BY cpf ASC ${limitSql}`,
        params
      );
      return rows;
    },
    // IMPORTANTE: filtra por empresa_id + cpf, nunca só cpf — a chave desta
    // tabela é composta (empresa_id, cpf) desde a migração 46 exatamente
    // porque duas empresas podem ter colaboradores com o mesmo CPF. Um
    // UPDATE só por cpf aqui reintroduziria, no pessoa_id, o mesmo vazamento
    // cross-tenant que a correção da chave primária eliminou (encontrado
    // testando esta própria migração: as duas linhas do mesmo CPF em
    // empresas diferentes ficaram com o pessoa_id da última processada).
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE dados_bancarios_colaborador SET pessoa_id = ? WHERE empresa_id = ? AND cpf = ?`, [
        pessoaId,
        linha.empresa_id,
        linha.cpf,
      ]);
    },
  },
  {
    tabela: "jornada_participantes",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["pessoa_id IS NULL", "empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      const [rows] = await pool.query(
        `SELECT id, empresa_id, nome, NULL AS cpf, matricula, cliente
         FROM jornada_participantes
         WHERE ${condicoes.join(" AND ")}
         ORDER BY id ASC ${limitSql}`,
        params
      );
      return rows;
    },
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE jornada_participantes SET pessoa_id = ? WHERE id = ?`, [pessoaId, linha.id]);
    },
  },
  {
    tabela: "coaching_individual",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["pessoa_id IS NULL", "empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      const [rows] = await pool.query(
        `SELECT id, empresa_id, nome, NULL AS cpf, matricula, cliente
         FROM coaching_individual
         WHERE ${condicoes.join(" AND ")}
         ORDER BY id ASC ${limitSql}`,
        params
      );
      return rows;
    },
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE coaching_individual SET pessoa_id = ? WHERE id = ?`, [pessoaId, linha.id]);
    },
  },
  {
    tabela: "pessoas_metodologia",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["pessoa_id IS NULL", "empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      const [rows] = await pool.query(
        `SELECT id, empresa_id, nome, NULL AS cpf, matricula, cliente
         FROM pessoas_metodologia
         WHERE ${condicoes.join(" AND ")}
         ORDER BY id ASC ${limitSql}`,
        params
      );
      return rows;
    },
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE pessoas_metodologia SET pessoa_id = ? WHERE id = ?`, [pessoaId, linha.id]);
    },
  },
  {
    tabela: "usuarios",
    async buscarPendentes({ limit, empresaId }) {
      const condicoes = ["pessoa_id IS NULL", "empresa_id IS NOT NULL"];
      const params = [];
      if (empresaId) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const limitSql = limit ? `LIMIT ${Number(limit)}` : "";
      // usuarios não tem cpf/matricula — casamento aqui é só por nome
      // (via cliente, quando houver), a maioria vira pessoa provisória; é
      // esperado (login é identidade de acesso, não identidade de pessoa).
      const [rows] = await pool.query(
        `SELECT id, empresa_id, nome, NULL AS cpf, NULL AS matricula, cliente
         FROM usuarios
         WHERE ${condicoes.join(" AND ")}
         ORDER BY id ASC ${limitSql}`,
        params
      );
      return rows;
    },
    async gravarPessoaId(conn, linha, pessoaId) {
      await conn.query(`UPDATE usuarios SET pessoa_id = ? WHERE id = ?`, [pessoaId, linha.id]);
    },
  },
];

// dryRunConn: em dry-run, a ÚNICA transação compartilhada por toda a
// execução (ver nota no cabeçalho) — resolverPessoa/gravarPessoaId rodam
// nela para que os casamentos entre linhas fiquem visíveis, sem gravar
// nada de verdade (rollback acontece uma vez, no final, em main()).
async function processarLinha(fonte, linha, { apply, dryRunConn }) {
  if (!apply) {
    // SAVEPOINT por linha: se uma linha der erro, reverte só ela — sem
    // isso, um erro no meio do dry-run deixaria a transação compartilhada
    // em estado "rollback-only" e derrubaria o relatório das linhas
    // seguintes junto.
    await dryRunConn.query("SAVEPOINT sp_linha");
    try {
      const { criada, casadaPor, pessoa } = await resolverPessoa(
        { empresaId: linha.empresa_id, nome: linha.nome, cpf: linha.cpf, matricula: linha.matricula, cliente: linha.cliente },
        dryRunConn
      );
      // Grava o pessoa_id "de mentira" também dentro da mesma transação
      // revertida — não muda o relatório, mas mantém o estado consistente
      // com o que --apply faria, caso alguma lógica futura passe a
      // depender disso durante o dry-run.
      await fonte.gravarPessoaId(dryRunConn, linha, pessoa.id);
      await dryRunConn.query("RELEASE SAVEPOINT sp_linha");
      return { status: criada ? "seria_criada" : `seria_casada_${casadaPor}`, erro: null };
    } catch (error) {
      await dryRunConn.query("ROLLBACK TO SAVEPOINT sp_linha");
      return { status: "erro", erro: error.message || String(error) };
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { pessoa, criada, casadaPor } = await resolverPessoa(
      { empresaId: linha.empresa_id, nome: linha.nome, cpf: linha.cpf, matricula: linha.matricula, cliente: linha.cliente },
      conn
    );
    await fonte.gravarPessoaId(conn, linha, pessoa.id);
    await conn.commit();
    return { status: criada ? "criada" : `casada_${casadaPor}`, erro: null };
  } catch (error) {
    await conn.rollback();
    return { status: "erro", erro: error.message || String(error) };
  } finally {
    conn.release();
  }
}

async function main() {
  const { apply, limit, empresaId, tabelaFiltro } = parseArgs(process.argv.slice(2));

  console.log("=".repeat(72));
  console.log(apply ? "BACKFILL DE PESSOAS — MODO APLICAR (vai gravar no banco)" : "BACKFILL DE PESSOAS — DRY-RUN (nada será gravado)");
  if (limit) console.log(`Limite de teste por tabela: ${limit}`);
  if (empresaId) console.log(`Restrito à empresa_id = ${empresaId}`);
  if (tabelaFiltro) console.log(`Restrito à tabela = ${tabelaFiltro}`);
  console.log("=".repeat(72));

  const resumoGeral = {};
  const errosGeral = [];

  // Dry-run: uma única conexão/transação para a execução inteira (ver nota
  // no cabeçalho do arquivo) — revertida no final, nunca commitada.
  const dryRunConn = apply ? null : await pool.getConnection();
  if (dryRunConn) await dryRunConn.beginTransaction();

  try {
    for (const fonte of FONTES) {
      if (tabelaFiltro && fonte.tabela !== tabelaFiltro) continue;

      const linhas = await fonte.buscarPendentes({ limit, empresaId });
      console.log(`\n--- ${fonte.tabela}: ${linhas.length} linha(s) pendente(s) ---`);

      const resumo = {};
      for (const linha of linhas) {
        const resultado = await processarLinha(fonte, linha, { apply, dryRunConn });
        resumo[resultado.status] = (resumo[resultado.status] || 0) + 1;
        if (resultado.status === "erro") {
          errosGeral.push({ tabela: fonte.tabela, id: linha.id, motivo: resultado.erro });
        }
      }

      for (const [status, qtd] of Object.entries(resumo)) {
        console.log(`  ${status}: ${qtd}`);
      }
      resumoGeral[fonte.tabela] = resumo;
    }
  } finally {
    if (dryRunConn) {
      await dryRunConn.rollback();
      dryRunConn.release();
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("RESUMO GERAL");
  console.log("=".repeat(72));
  for (const [tabela, resumo] of Object.entries(resumoGeral)) {
    console.log(`${tabela}:`, resumo);
  }

  if (errosGeral.length) {
    console.log("\nLinhas com erro (não resolvidas, precisam de nova tentativa):");
    for (const e of errosGeral) {
      console.log(`  - ${e.tabela}#${e.id}: ${e.motivo}`);
    }
  }

  if (!apply) {
    console.log("\nEste foi um dry-run — nada foi gravado. Revise o resumo acima e rode novamente com --apply para gravar.");
  }
  console.log("=".repeat(72));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfillPessoas] erro fatal:", error.message || error);
    process.exit(1);
  });
