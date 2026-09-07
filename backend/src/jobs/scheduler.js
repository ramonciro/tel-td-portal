/**
 * scheduler.js
 *
 * Fase 2 do roadmap de competitividade — agenda os jobs automáticos via
 * node-cron:
 *   - Resumo diário de pendências: 07h, dias úteis (segunda a sexta).
 *   - Lembrete de aula do dia seguinte: 17h, todos os dias.
 *
 * Os horários seguem o fuso do próprio processo Node (normalmente UTC no
 * Railway, salvo TZ configurada). Se os e-mails chegarem no horário errado
 * em produção, ajustar via variável de ambiente TZ=America/Sao_Paulo no
 * serviço, em vez de mexer nas expressões cron abaixo.
 *
 * Ambos os jobs também podem ser disparados manualmente (útil para testes e
 * para reenviar em caso de falha) via:
 *   POST /api/admin/jobs/rodar-pendencias
 *   POST /api/admin/jobs/rodar-lembretes
 * (ver backend/src/index.js)
 */

const cron = require("node-cron");
const { rodarDigestPendencias } = require("./pendenciasDigest");
const { rodarLembretesAula } = require("./lembretesAula");

function iniciarAgendamentos() {
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
    "[scheduler] Agendamentos automáticos registrados (pendências 07h dias úteis, lembretes 17h diário)."
  );
}

module.exports = { iniciarAgendamentos };
