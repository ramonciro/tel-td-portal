/**
 * mailer.js
 *
 * Fase 2 do roadmap de competitividade ("vitórias rápidas") — camada única
 * de envio de e-mail do portal, usada pela recuperação de senha e pelas
 * automações de coordenador/instrutor (resumo diário de pendências,
 * lembrete de aula do dia seguinte).
 *
 * Lê configuração via env vars genéricas (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, SMTP_FROM) em vez de acoplar a um provedor específico — funciona
 * com Gmail (smtp.gmail.com:587 + App Password de uma conta Google
 * Workspace), qualquer outro provedor SMTP, ou nenhum.
 *
 * MODO DEV (SMTP não configurado, ex.: ambiente local ou produção antes de
 * as credenciais reais serem cadastradas): o e-mail não é enviado de
 * verdade. O conteúdo (assunto + corpo, incluindo qualquer link/token) é
 * apenas logado no console do servidor — NUNCA devolvido na resposta HTTP.
 * Isso corrige a falha de segurança que existia antes aqui: o token de
 * redefinição de senha vinha diretamente no JSON de /esqueci-senha. Ver
 * backend/src/routes/authRoutes.js.
 */

const nodemailer = require("nodemailer");

let transporter = null;

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT || 587);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL implícito; 587 (padrão) usa STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Envia um e-mail. Retorna { ok, devMode } — devMode:true indica que nada
 * foi enviado de verdade (SMTP não configurado); o chamador pode usar isso
 * para logging interno, mas o CONTEÚDO do e-mail (link, token) nunca deve
 * ser incluído na resposta HTTP ao cliente, em nenhum modo.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.error("[mailer] sendMail chamado sem destinatário — ignorado.");
    return { ok: false, devMode: false, error: "Destinatário ausente" };
  }

  if (!isConfigured()) {
    console.log("──────────────────────────────────────────────────────────");
    console.log("[mailer] SMTP não configurado — modo dev (e-mail NÃO enviado de verdade)");
    console.log(`[mailer] Para: ${to}`);
    console.log(`[mailer] Assunto: ${subject}`);
    console.log(`[mailer] Conteúdo:\n${text || (html || "").replace(/<[^>]+>/g, " ")}`);
    console.log("──────────────────────────────────────────────────────────");
    return { ok: true, devMode: true };
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });
    return { ok: true, devMode: false };
  } catch (error) {
    console.error("[mailer] Erro ao enviar e-mail:", error.message);
    return { ok: false, devMode: false, error: error.message };
  }
}

module.exports = { sendMail, isConfigured };
