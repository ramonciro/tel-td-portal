/**
 * rsAtrasadasDigest.js — aviso diário de RPs atrasadas (R&S), 20/10/2026.
 *
 * Todo dia útil de manhã, cada empresa que tem RP EM ANDAMENTO além do prazo (SLA, por
 * padrão 15 dias desde o recebimento — o mesmo limite do Dashboard e do Relatório) manda
 * um e-mail ao coordenador R&S e ao gestor R&S. Sem RP atrasada, não envia nada.
 *
 * Também apaga da lixeira as RPs excluídas há mais de 30 dias.
 */
const pool = require("../lib/db");
const { sendMail } = require("../services/mailer");
const rel = require("../lib/rsRelatorios");
const { purgarLixeira } = require("../controllers/rsGestaoController");

const PERFIS_DESTINATARIOS = ["coordenador_rs", "gestor_rs"];
const MAX_LINHAS_EMAIL = 25;

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** RPs em andamento há mais de `limiteDias` dias, da mais antiga para a mais nova. */
async function listarAtrasadas(empresaId, limiteDias = rel.LIMITE_DIAS_PADRAO) {
  const [rows] = await pool.query(
    `SELECT id, site, setor, produto, cargo, chamado, hcs,
            DATE_FORMAT(data_recebimento, '%d/%m/%Y') AS recebimento,
            DATEDIFF(CURDATE(), COALESCE(data_recebimento, mes_referencia)) AS dias
       FROM rps
      WHERE empresa_id = ? AND excluido_em IS NULL AND status = 'EM ANDAMENTO'
        AND DATEDIFF(CURDATE(), COALESCE(data_recebimento, mes_referencia)) > ?
      ORDER BY dias DESC, site, produto`,
    [empresaId, limiteDias]
  );
  return rows.map((r) => ({ ...r, dias: Number(r.dias) }));
}

function montarHtml(itens, limiteDias, nomeEmpresa) {
  const mostrar = itens.slice(0, MAX_LINHAS_EMAIL);
  const linhas = mostrar
    .map((r) => `<li><strong>${esc(r.produto)}</strong> · ${esc(r.site)} · ${esc(r.setor === "ESTRATÉGICO" ? "Estratégico" : "Operacional")}${r.cargo ? " · " + esc(r.cargo) : ""}` +
      `${r.chamado ? " · chamado " + esc(r.chamado) : ""} — ${r.dias} dias em aberto${r.recebimento ? " (recebida em " + r.recebimento + ")" : ""}</li>`)
    .join("");
  const resto = itens.length > mostrar.length ? `<li>…e mais ${itens.length - mostrar.length} na lista de RPs do Portal.</li>` : "";
  return `
    <p>Bom dia! ${itens.length === 1 ? "Há 1 RP" : `Há ${itens.length} RPs`} de R&amp;S${nomeEmpresa ? " (" + esc(nomeEmpresa) + ")" : ""} em andamento há mais de ${limiteDias} dias.</p>
    <ul style="margin:0 0 4px;padding-left:18px;color:#334155;font-size:13.5px;line-height:1.6;">${linhas}${resto}</ul>
    <p style="color:#64748b;font-size:13px;">Na tela <em>Requisições</em> do R&amp;S, filtre por status "Em andamento" para ver todas.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">E-mail automático — Portal T&amp;D.</p>`;
}

async function rodarAvisoAtrasadas(limiteDias = rel.LIMITE_DIAS_PADRAO) {
  const [empresas] = await pool.query("SELECT id, nome FROM empresas WHERE ativo = 1").catch(() => [[]]);
  const resultados = [];
  for (const emp of empresas) {
    try {
      const itens = await listarAtrasadas(emp.id, limiteDias);
      if (!itens.length) { resultados.push({ empresa: emp.nome, atrasadas: 0, enviados: 0 }); continue; }
      const marcas = PERFIS_DESTINATARIOS.map(() => "?").join(",");
      const [dest] = await pool.query(
        `SELECT nome, email FROM usuarios WHERE ativo = 1 AND empresa_id = ? AND LOWER(perfil) IN (${marcas}) AND email IS NOT NULL AND email <> ''`,
        [emp.id, ...PERFIS_DESTINATARIOS]
      );
      const html = montarHtml(itens, limiteDias, emp.nome);
      const assunto = `[Portal T&D] R&S: ${itens.length} RP(s) atrasada(s)${emp.nome ? " — " + emp.nome : ""}`;
      for (const d of dest) {
        // eslint-disable-next-line no-await-in-loop
        await sendMail({ to: d.email, subject: assunto, html });
      }
      resultados.push({ empresa: emp.nome, atrasadas: itens.length, enviados: dest.length });
    } catch (err) {
      console.error("[rsAtrasadasDigest]", emp.nome, err.message);
      resultados.push({ empresa: emp.nome, erro: err.message });
    }
  }
  return resultados;
}

async function rodarLimpezaLixeiraRS() {
  const apagadas = await purgarLixeira(null);
  return { apagadas };
}

module.exports = { rodarAvisoAtrasadas, rodarLimpezaLixeiraRS, listarAtrasadas, montarHtml };
