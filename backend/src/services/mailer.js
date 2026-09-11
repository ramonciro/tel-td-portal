/**
 * mailer.js
 *
 * Camada única de envio de e-mail do portal — usada pela recuperação de
 * senha e pelas automações de coordenador/instrutor (resumo diário de
 * pendências, lembrete de aula do dia seguinte).
 *
 * HISTÓRICO: a versão original da Fase 2 usava SMTP genérico (nodemailer).
 * Descoberto em teste de produção: a Railway bloqueia toda conexão SMTP de
 * saída nos planos Free/Trial/Hobby — só libera no plano Pro (ver
 * https://docs.railway.com/networking/outbound-networking#email-delivery).
 * Toda tentativa de conexão SMTP travava por ~2 minutos e depois falhava
 * com "Connection timeout". Reescrito para usar a API HTTPS do Resend — a
 * opção que a própria documentação da Railway recomenda para quem está
 * nesses planos, e que funciona em qualquer plano por não depender de porta
 * SMTP nenhuma.
 *
 * Variáveis de ambiente:
 *   RESEND_API_KEY — chave de API do Resend. Sem ela, roda em modo dev.
 *   SMTP_FROM      — remetente, ex.: "Portal T&D <no-reply@seudominio.com>".
 *                    Enquanto nenhum domínio próprio estiver verificado no
 *                    Resend, use o remetente de sandbox deles
 *                    ("onboarding@resend.dev") — mas nesse caso o Resend só
 *                    entrega para o e-mail cadastrado na própria conta
 *                    Resend, não para destinatários arbitrários. Para
 *                    enviar a qualquer coordenador/instrutor, é preciso
 *                    verificar um domínio próprio no painel do Resend.
 *
 * MODO DEV (RESEND_API_KEY não configurada): nenhum e-mail é enviado de
 * verdade — o conteúdo é só logado no console do servidor, NUNCA devolvido
 * na resposta HTTP. Isso corrige a falha de segurança que existia antes:
 * o token de redefinição de senha vinha direto no JSON de /esqueci-senha.
 * Ver backend/src/routes/authRoutes.js.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Envia um e-mail. Retorna { ok, devMode } — devMode:true indica que nada
 * foi enviado de verdade (RESEND_API_KEY não configurada); o chamador pode
 * usar isso para logging interno, mas o CONTEÚDO do e-mail (link, token)
 * nunca deve ser incluído na resposta HTTP ao cliente, em nenhum modo.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.error("[mailer] sendMail chamado sem destinatário — ignorado.");
    return { ok: false, devMode: false, error: "Destinatário ausente" };
  }

  if (!isConfigured()) {
    console.log("──────────────────────────────────────────────────────────");
    console.log("[mailer] RESEND_API_KEY não configurada — modo dev (e-mail NÃO enviado de verdade)");
    console.log(`[mailer] Para: ${to}`);
    console.log(`[mailer] Assunto: ${subject}`);
    console.log(`[mailer] Conteúdo:\n${text || (html || "").replace(/<[^>]+>/g, " ")}`);
    console.log("──────────────────────────────────────────────────────────");
    return { ok: true, devMode: true };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || "Portal T&D <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[mailer] Erro ao enviar e-mail (Resend ${response.status}):`, errorBody);
      return { ok: false, devMode: false, error: `Resend respondeu ${response.status}: ${errorBody}` };
    }

    return { ok: true, devMode: false };
  } catch (error) {
    console.error("[mailer] Erro ao enviar e-mail:", error.message);
    return { ok: false, devMode: false};
  }
}

module.exports = { sendMail, isConfigured };
