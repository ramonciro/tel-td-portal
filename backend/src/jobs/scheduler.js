/**
 * scheduler.js
 *
 * Fase 2 e Fase 3 do roadmap de competitividade — agenda os jobs
 * automáticos via node-cron:
 *   - Cálculo de conquistas (gamificação): 06h, todos os dias.
 *   - Resumo diário de pendências (+ resumo executivo do Dashboard): 07h,
 *     dias úteis (segunda a sexta).
 *   - Aviso de RPs atrasadas do R&S: 07h10, dias úteis; limpeza da lixeira do R&S: 04h.
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
const { sincronizarCelulas } = require("../lib/celulaBaby");
const { rodarAvisoAtrasadas, rodarLimpezaLixeiraRS } = require("./rsAtrasadasDigest");
const { configurado: backupConfigurado, rodarBackup, carregarUltimoDoBucket } = require("../services/backupService");

function iniciarAgendamentos() {
  cron.schedule("0 5 * * *", async () => {
    try {
      const resultado = await rodarCertificadosAutomaticos();
      console.log("[scheduler] Certificados automáticos executados:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao rodar certificados automáticos:", error.message);
    }
  });

  // Célula baby (16/10/2026): abre as células das turmas de Avaliação Técnica
  // concluídas. Também roda ao abrir a lista de células; este é o reforço diário.
  cron.schedule("30 5 * * *", async () => {
    try {
      const criadas = await sincronizarCelulas(null);
      console.log("[scheduler] Células baby abertas:", criadas);
    } catch (error) {
      console.error("[scheduler] Erro ao abrir células baby:", error.message);
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

  // R&S (20/10/2026): aviso das RPs atrasadas, dias úteis às 07h10 (logo depois do digest de pendências).
  cron.schedule("10 7 * * 1-5", async () => {
    try {
      const resultado = await rodarAvisoAtrasadas();
      console.log("[scheduler] Aviso de RPs atrasadas (R&S):", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro no aviso de RPs atrasadas:", error.message);
    }
  });

  // R&S: apaga da lixeira as RPs excluídas há mais de 30 dias — todo dia às 04h.
  cron.schedule("0 4 * * *", async () => {
    try {
      const resultado = await rodarLimpezaLixeiraRS();
      console.log("[scheduler] Limpeza da lixeira do R&S:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao limpar a lixeira do R&S:", error.message);
    }
  });

  // Backup externo (21/10/2026): 02h30 de Brasília, todo dia, independente da TZ
  // do servidor. Só liga com as variáveis BACKUP_S3_* (services/backupService.js).
  if (backupConfigurado()) {
    cron.schedule(
      "30 2 * * *",
      async () => {
        try {
          const r = await rodarBackup({ origem: "agendado" });
          console.log("[scheduler] Backup externo:", JSON.stringify(r));
        } catch (error) {
          console.error("[scheduler] Erro no backup externo:", error.message);
        }
      },
      { timezone: "America/Sao_Paulo" }
    );
    carregarUltimoDoBucket();
    console.log("[scheduler] Backup externo ligado (02h30 de Brasília, diário).");
  } else {
    console.log("[scheduler] Backup externo DESLIGADO (faltam as variáveis BACKUP_S3_*).");
  }

  cron.schedule("0 17 * * *", async () => {
    try {
      const resultado = await rodarLembretesAula();
      console.log("[scheduler] Lembretes de aula executados:", JSON.stringify(resultado));
    } catch (error) {
      console.error("[scheduler] Erro ao rodar lembretes de aula:", error.message);
    }
  });

  console.log(
    "[scheduler] Agendamentos automáticos registrados (certificados 05h diário, conquistas 06h diário, pendências 07h dias úteis, RPs atrasadas R&S 07h10 dias úteis, lixeira R&S 04h diário, lembretes 17h diário)."
  );
}

module.exports = { iniciarAgendamentos };
