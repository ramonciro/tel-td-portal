/**
 * scheduler.js
 *
 * Fase 2 e Fase 3 do roadmap de competitividade — agenda os jobs
 * automáticos via node-cron:
 *   - Cálculo de conquistas (gamificação): 06h, todos os dias.
 *   - Resumo diário de pendências (+ resumo executivo do Dashboard): 07h,
 *     dias úteis (segunda a sexta).
 *   - Lembrete de aula do dia seguinte: 17h, todos os dias.
 *   - Certificado automático ao concluir a turma (Pacote 3): 05h, todos os
 *     dias — roda antes dos demais para os certificados já estarem prontos
 *     quando os digests das 06h/07h forem montados.
 *
 * Os horários seguem o fuso do próprio processo Node (normalmente UTC no
 * Railway, salvo TZ configurada). Se os e-mails chegarem no horário errado
 * em produção, ajustar via variável de ambiente TZ=America/Sao_Paulo no
 * serviço, em vez de mexer nas expressões cron abaixo.
 *
 * Todos os jobs também podem ser disparados manualmente (útil para testes e
 * para reenviar/recalcular em caso de falha) via:
 *   POST /api/admin/jobs/rodar-pendencias
 *   POST /api/admin/jobs/rodar-lembretes
 *   POST /api/admin/jobs/rodar-conquistas
 *   POST /api/admin/jobs/rodar-certificados-automaticos
 * (ver backend/src/index.js)
 */

const cron = require("node-cron");
const { rodarDigestPendencias } = require("./pendenciasDigest");
const { rodarLembretesAula } = require("./lembretesAula");
const { rodarCalculoConquistas } = require("./conquistasJob");
const { rodarCertificadosAutomaticos } = require("./certificadosAutomaticos");

function iniciarAgendamentos() {
  cron.schedule("0 5 * * *", async () => {
    try {
      const resultado = await rodarCertificadosAutomaticos();
      console.log("[scheduler] Certificados automáticos executados:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao rodar certificados automáticos:", error.message);
    }
  });

  cron.schedule("0 6 * * *", async () => {
    try {
      const resultado = await rodarCalculoConquistas();
      console.log("[scheduler] Cálculo de conquistas executado:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao calcular conquistas:", error.message);
    }
  });

  cron.schedule("0 7 * * 1-5", async () => {
    try {
      const resultado = await rodarDigestPendencias();
      console.log("[scheduler] Digest de pendências executado:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao rodar digest de pendências:", error.message);
    }
  });

  cron.schedule("0 17 * * *", async () => {
    try {
      const resultado = await rodarLembretesAula();
      console.log("[scheduler] Lembretes de aula executados:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao rodar lembretes de aula:", error.message);
    }
  });

  console.log(
    "[scheduler] Agendamentos automáticos registrados (certificados 05h diário, conquistas 06h diário, pendências 07h dias úteis, lembretes 17h diário)."
  );
}

module.exports = { iniciarAgendamentos };
