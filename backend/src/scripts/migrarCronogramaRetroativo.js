/**
 * migrarCronogramaRetroativo.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Gera o cronograma (turma_aulas) retroativamente para toda turma que ainda
 * não tem nenhuma linha em turma_aulas — cobrindo TODO o histórico, sem
 * corte por data. Essa é a decisão explícita do Ramon ("quero que os dados
 * rodem mais reais possível... se a migração retroativa me permitir isso,
 * faça"), depois de eu ter levantado os riscos (turma concluída podendo
 * zerar horas realizadas, turma sem instrutor sumindo de Capacidade) — ver
 * claude/auditoria-riscos-cruzados-pacote-salas-2026-09.md. Os dois riscos
 * já estão neutralizados na origem, não aqui:
 *
 *   1. `montarLinhasCronograma` (lib/cronogramaGenerator.js) herda o status
 *      de execução da turma-mãe (concluída → todo dia "concluida", nunca
 *      "planejada" default) — então uma turma já concluída não perde horas
 *      realizadas no Capacidade ao ganhar cronograma agora.
 *   2. A mesma função pula (não gera nada) turma sem `instrutor` preenchido,
 *      porque capacidadeResolver.js só conta uma linha de turma_aulas com
 *      instrutor_responsavel preenchido — gerar aqui faria essa turma
 *      desaparecer do indicador em vez de só zerar.
 *
 * Terceiro risco que a auditoria original levantou (presença legada não
 * teria como "casar" com um dia específico do cronograma gerado agora) não
 * precisa de tratamento aqui: confirmado lendo presencaResolver.js que
 * getResumoPresenca()/getFrequenciaPorParticipante() já caem para a tabela
 * `presencas` legada quando o cronograma novo não tem `presenca_aulas`
 * registrada (fallback "cronograma > legado" já existente) — então esta
 * migração *não* toca em `presenca_aulas` nem em `presencas`, só cria o
 * "esqueleto" de dias em turma_aulas.
 *
 * SEGURANÇA/IDEMPOTÊNCIA:
 *   - Só processa turma que hoje não tem NENHUMA linha em turma_aulas
 *     (LEFT JOIN ... IS NULL). Rodar de novo depois de aplicado não duplica
 *     nada — turmas já migradas (ou que já tinham cronograma manual) somem
 *     da lista de candidatas.
 *   - Cada turma é migrada dentro de uma transação própria: ou todas as
 *     linhas dela entram, ou nenhuma — nunca fica pela metade (o que
 *     tornaria essa turma invisível para uma nova tentativa, já que ela
 *     passaria a ter >0 linhas em turma_aulas mesmo incompleta).
 *   - Uma turma pulada ou que dá erro nunca interrompe as demais.
 *
 * USO:
 *   node src/scripts/migrarCronogramaRetroativo.js            (dry-run — só relatório)
 *   node src/scripts/migrarCronogramaRetroativo.js --apply    (grava de verdade)
 *   node src/scripts/migrarCronogramaRetroativo.js --apply --limit=20   (só as 20 primeiras, para teste)
 *   node src/scripts/migrarCronogramaRetroativo.js --empresa=3          (só um tenant, para teste)
 */

const pool = require("../lib/db");
const { montarLinhasCronograma, toDateOnly } = require("../lib/cronogramaGenerator");

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const empresaArg = argv.find((a) => a.startsWith("--empresa="));
  return {
    apply,
    limit: limitArg ? Number(limitArg.split("=")[1]) : null,
    empresaId: empresaArg ? Number(empresaArg.split("=")[1]) : null,
  };
}

async function buscarTurmasSemCronograma({ limit, empresaId }) {
  const condicoes = ["ta.id IS NULL"];
  const params = [];

  if (empresaId) {
    condicoes.push("t.empresa_id = ?");
    params.push(empresaId);
  }

  const limitSql = limit ? `LIMIT ${Number(limit)}` : "";

  const [rows] = await pool.query(
    `
    SELECT
      t.id,
      t.empresa_id,
      t.tema,
      t.cliente,
      t.instrutor,
      t.status,
      t.data,
      t.data_inicio,
      t.data_fim,
      t.carga_horaria,
      t.hora_inicio,
      t.hora_fim
    FROM treinamentos t
    LEFT JOIN turma_aulas ta ON ta.treinamento_id = t.id
    WHERE ${condicoes.join(" AND ")}
    GROUP BY t.id
    ORDER BY t.id ASC
    ${limitSql}
    `,
    params
  );

  return rows;
}

// Mesma SQL de turmaAulasController.inserirLinhasCronograma, mas numa
// connection dedicada (para caber dentro da transação por turma) — ver nota
// de segurança/idempotência no cabeçalho sobre por que a atomicidade por
// turma importa aqui.
async function inserirLinhasTransacional(conn, treinamentoId, linhas) {
  for (const linha of linhas) {
    await conn.query(
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
        Number(treinamentoId),
        linha.dia_numero,
        linha.data_aula,
        1,
        linha.titulo,
        linha.objetivo,
        null,
        null,
        linha.carga_horaria_planejada,
        linha.instrutor_responsavel,
        linha.status_execucao,
      ]
    );
  }
}

async function migrarTurma(turma, { apply }) {
  const hojeISO = toDateOnly(new Date());
  const { linhas, pulada, motivoPulo } = montarLinhasCronograma({ turma, hojeISO });

  if (pulada) {
    return { status: "pulada", motivo: motivoPulo, totalDias: 0 };
  }

  if (!apply) {
    return { status: "seria_migrada", motivo: null, totalDias: linhas.length };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await inserirLinhasTransacional(conn, turma.id, linhas);
    await conn.commit();
    return { status: "migrada", motivo: null, totalDias: linhas.length };
  } catch (error) {
    await conn.rollback();
    return { status: "erro", motivo: error.message || String(error), totalDias: 0 };
  } finally {
    conn.release();
  }
}

async function main() {
  const { apply, limit, empresaId } = parseArgs(process.argv.slice(2));

  console.log("=".repeat(72));
  console.log(
    apply
      ? "MIGRAÇÃO RETROATIVA DE CRONOGRAMA — MODO APLICAR (vai gravar no banco)"
      : "MIGRAÇÃO RETROATIVA DE CRONOGRAMA — DRY-RUN (nada será gravado)"
  );
  if (limit) console.log(`Limite de teste: ${limit} turma(s)`);
  if (empresaId) console.log(`Restrito à empresa_id = ${empresaId}`);
  console.log("=".repeat(72));

  const turmas = await buscarTurmasSemCronograma({ limit, empresaId });
  console.log(`\nTurmas sem cronograma encontradas: ${turmas.length}\n`);

  const resumo = {
    migrada: 0,
    seria_migrada: 0,
    pulada: 0,
    erro: 0,
  };
  const motivosPulo = {};
  const erros = [];

  for (const turma of turmas) {
    const resultado = await migrarTurma(turma, { apply });
    resumo[resultado.status] += 1;

    const rotulo =
      resultado.status === "migrada"
        ? `OK — ${resultado.totalDias} dia(s) gravado(s)`
        : resultado.status === "seria_migrada"
        ? `[dry-run] geraria ${resultado.totalDias} dia(s)`
        : resultado.status === "pulada"
        ? `pulada — ${resultado.motivo}`
        : `ERRO — ${resultado.motivo}`;

    console.log(`#${turma.id} "${turma.tema || "?"}" (${turma.cliente || "?"}): ${rotulo}`);

    if (resultado.status === "pulada") {
      motivosPulo[resultado.motivo] = (motivosPulo[resultado.motivo] || 0) + 1;
    }
    if (resultado.status === "erro") {
      erros.push({ id: turma.id, tema: turma.tema, motivo: resultado.motivo });
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("RESUMO");
  console.log("=".repeat(72));
  console.log(`Total de turmas analisadas: ${turmas.length}`);
  if (apply) {
    console.log(`Migradas com sucesso:      ${resumo.migrada}`);
  } else {
    console.log(`Seriam migradas (dry-run): ${resumo.seria_migrada}`);
  }
  console.log(`Puladas (sem condição):    ${resumo.pulada}`);
  console.log(`Erros:                     ${resumo.erro}`);

  if (Object.keys(motivosPulo).length) {
    console.log("\nMotivos das puladas:");
    for (const [motivo, qtd] of Object.entries(motivosPulo)) {
      console.log(`  - ${motivo}: ${qtd}`);
    }
  }

  if (erros.length) {
    console.log("\nTurmas com erro (não migradas, precisam de nova tentativa):");
    for (const e of erros) {
      console.log(`  - #${e.id} "${e.tema}": ${e.motivo}`);
    }
  }

  if (!apply && turmas.length) {
    console.log(
      "\nEste foi um dry-run — nada foi gravado. Revise o resumo acima e rode novamente com --apply para gravar."
    );
  }

  console.log("=".repeat(72));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[migrarCronogramaRetroativo] erro fatal:", error.message || error);
    process.exit(1);
  });
