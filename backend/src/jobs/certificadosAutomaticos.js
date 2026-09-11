/**
 * certificadosAutomaticos.js — Pacote 3 (certificado automático ao concluir a turma)
 *
 * Roda periodicamente e emite (ou atualiza) o certificado de cada
 * participante de uma turma já concluída, sem que o coordenador precise
 * emitir manualmente turma por turma.
 *
 * "Turma concluída": usa a MESMA definição que o frontend já usa pra decidir
 * o que mostrar como "Concluído" (getStatus() em
 * frontend/app/treinamentos/page.js) — não dá pra confiar só na coluna
 * treinamentos.status, que fica frequentemente desatualizada (turma criada
 * como "Planejada" e nunca mais tocada depois que a data passou). Considera
 * concluída quando:
 *   - o status já diz isso explicitamente (concluído/concluída/finalizado...), OU
 *   - data_fim já passou (e o status não é "cancelada"/"cancelado")
 *
 * Participante elegível: mesma regra do preview/emissão manual — frequência
 * >= FREQUENCIA_MINIMA (75%) quando há registro de presença; sem nenhum
 * registro, não barra (calcularElegibilidade/emitirCertificado já tratam
 * "sem_registros" assim, então o job segue a mesma regra pra não divergir).
 *
 * E-mail do participante: treinamento_participantes não tem coluna de
 * e-mail (só nome/matrícula/cliente/turma) — resolve por nome cadastrado em
 * `usuarios` (case-insensitive, mesma empresa). Quando não há usuário
 * cadastrado com esse nome, o certificado é gravado sem e-mail (aparece
 * pro coordenador na listagem/exportação; o participante só consegue achá-lo
 * em "Meus Certificados" depois de ter uma conta com esse mesmo nome).
 *
 * Idempotente: rodar de novo não duplica linha (ver registrarCertificado em
 * certificadosController.js, que trata inclusive o caso de e-mail nulo).
 */

const pool = require("../lib/db");
const { listarEmpresasAtivas } = require("./pendenciasDigest");
const {
  calcularElegibilidade,
  registrarCertificado,
  FREQUENCIA_MINIMA,
} = require("../controllers/certificadosController");

const STATUS_CONCLUIDO = ["concluído", "concluido", "concluída", "concluida", "finalizado", "finalizada"];
const STATUS_CANCELADO = ["cancelado", "cancelada"];

async function buscarTurmasConcluidas(empresaId) {
  const condEmpresa = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];
  const [rows] = await pool.query(
    `SELECT id, tema, cliente, carga_horaria, status, data_fim
     FROM treinamentos
     WHERE 1 = 1${condEmpresa}`,
    params
  );

  return rows.filter((t) => {
    const status = String(t.status || "").toLowerCase().trim();
    if (STATUS_CANCELADO.includes(status)) return false;
    if (STATUS_CONCLUIDO.includes(status)) return true;
    if (t.data_fim && new Date(t.data_fim) < new Date()) return true;
    return false;
  });
}

async function buscarParticipantesDaTurma(treinamentoId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT nome
     FROM treinamento_participantes
     WHERE treinamento_id = ? AND nome IS NOT NULL AND nome <> ''`,
    [treinamentoId]
  );
  return rows.map((r) => r.nome);
}

async function resolverEmailPorNome(nome, empresaId) {
  const condEmpresa = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [nome, empresaId] : [nome];
  const [[usuario]] = await pool.query(
    `SELECT email FROM usuarios WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))${condEmpresa} LIMIT 1`,
    params
  );
  return usuario?.email || null;
}

async function rodarCertificadosAutomaticos() {
  const empresas = await listarEmpresasAtivas();
  const resultados = [];

  for (const empresa of empresas) {
    let turmas = [];
    try {
      turmas = await buscarTurmasConcluidas(empresa.id);
    } catch (error) {
      console.error(`[certificadosAutomaticos] Erro ao buscar turmas concluídas (empresa ${empresa.nome}):`, error.message);
      resultados.push({ empresa: empresa.nome, erro: error.message });
      continue;
    }

    let emitidos = 0;
    let atualizados = 0;
    let ignoradosFrequencia = 0;
    let erros = 0;

    for (const turma of turmas) {
      let nomes;
      try {
        nomes = await buscarParticipantesDaTurma(turma.id);
      } catch (error) {
        console.error(`[certificadosAutomaticos] Erro ao buscar participantes da turma #${turma.id}:`, error.message);
        erros++;
        continue;
      }

      for (const nome of nomes) {
        try {
          const resultado = await calcularElegibilidade(turma.id, nome, empresa.id);
          if (!resultado) continue;
          const { freqFinal, nota } = resultado;

          if (freqFinal != null && freqFinal < FREQUENCIA_MINIMA) {
            ignoradosFrequencia++;
            continue;
          }

          const email = await resolverEmailPorNome(nome, empresa.id);

          const { atualizado } = await registrarCertificado({
            nome,
            email,
            treinamentoId: turma.id,
            tema: turma.tema,
            cliente: turma.cliente,
            cargaHoraria: turma.carga_horaria,
            freqFinal,
            nota,
            empresaId: empresa.id,
          });

          if (atualizado) atualizados++;
          else emitidos++;
        } catch (error) {
          console.error(`[certificadosAutomaticos] Erro ao processar "${nome}" na turma #${turma.id}:`, error.message);
          erros++;
        }
      }
    }

    resultados.push({
      empresa: empresa.nome,
      turmasConcluidas: turmas.length,
      certificadosEmitidos: emitidos,
      certificadosAtualizados: atualizados,
      ignoradosPorFrequencia: ignoradosFrequencia,
      erros,
    });
  }

  return resultados;
}

module.exports = { rodarCertificadosAutomaticos };
