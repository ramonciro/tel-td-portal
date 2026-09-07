/**
 * pendenciasDigest.js
 *
 * Fase 2 do roadmap de competitividade ("vitórias rápidas") — resumo diário
 * de pendências para coordenadores. Não inventa nenhuma regra de negócio
 * nova: reaproveita os mesmos sinais que as telas de Capacidade, Desempenho
 * do Instrutor e Presenças já calculam, e consolida num único e-mail por
 * empresa/tenant.
 *
 * Fontes reaproveitadas (nenhum cálculo novo):
 *   - capacidadeResolver.getAlertas          → instrutores fora da faixa
 *     saudável de ocupação (mesmo alerta da tela Capacidade).
 *   - desempenhoInstrutorResolver.getResumoExecutivo → instrutores fora da
 *     faixa saudável de frequência/NPS no mês (mesmo bloco pensado para o
 *     "Oceano" executivo do Dashboard).
 *   - presencaResolver.getResumoPresenca     → turmas com "Chamada
 *     pendente" ou classificação "Crítico" (mesma fonte da tela Presenças).
 */

const pool = require("../lib/db");
const { sendMail } = require("../services/mailer");
const { getAlertas } = require("../services/capacidadeResolver");
const { getResumoExecutivo } = require("../services/desempenhoInstrutorResolver");
const { getResumoPresenca } = require("../services/presencaResolver");
const { gerarTextoResumo, salvarResumoDoDia } = require("../services/resumoExecutivoService");

const PERFIS_DESTINATARIOS = ["coordenador", "supervisor", "superintendente"];

async function listarEmpresasAtivas() {
  try {
    const [rows] = await pool.query("SELECT id, nome FROM empresas WHERE ativo = 1");
    return rows.length ? rows : [{ id: null, nome: null }];
  } catch (_) {
    // Ambiente sem tabela "empresas" (migration pendente) — roda sem recorte de tenant.
    return [{ id: null, nome: null }];
  }
}

async function listarDestinatarios(empresaId) {
  const placeholders = PERFIS_DESTINATARIOS.map(() => "?").join(",");
  const condEmpresa = empresaId ? "empresa_id = ?" : "empresa_id IS NULL";
  const params = empresaId
    ? [empresaId, ...PERFIS_DESTINATARIOS]
    : [...PERFIS_DESTINATARIOS];

  const [rows] = await pool.query(
    `SELECT nome, email FROM usuarios
     WHERE ativo = 1 AND ${condEmpresa} AND LOWER(perfil) IN (${placeholders})`,
    params
  );
  return rows;
}

async function montarResumoEmpresa(empresaId) {
  const [alertasCapacidade, resumoDesempenho, presencaItens] = await Promise.all([
    getAlertas(empresaId).catch(() => ({ itens: [] })),
    getResumoExecutivo({ empresaId }).catch(() => ({ fora_faixa_saudavel: [] })),
    getResumoPresenca({ empresaId }).catch(() => []),
  ]);

  const chamadasPendentes = presencaItens.filter((t) => t.status_turma === "Chamada pendente");
  const turmasCriticas = presencaItens.filter((t) => t.classificacao === "Crítico");

  return {
    capacidade: alertasCapacidade.itens || [],
    desempenho: resumoDesempenho.fora_faixa_saudavel || [],
    chamadasPendentes,
    turmasCriticas,
  };
}

function totalPendencias(resumo) {
  return (
    resumo.capacidade.length +
    resumo.desempenho.length +
    resumo.chamadasPendentes.length +
    resumo.turmasCriticas.length
  );
}

function montarHtml(resumo) {
  const bloco = (titulo, itens, render) => {
    if (!itens.length) return "";
    return `
      <h3 style="margin:20px 0 8px;color:#0f172a;font-size:15px;">${titulo} (${itens.length})</h3>
      <ul style="margin:0 0 4px;padding-left:18px;color:#334155;font-size:13.5px;line-height:1.6;">
        ${itens.map(render).join("")}
      </ul>`;
  };

  const blocos = [
    bloco(
      "Instrutores fora da ocupação saudável",
      resumo.capacidade,
      (i) => `<li>${i.instrutor} — ${i.ocupacao_pct}% de ocupação (${i.status})</li>`
    ),
    bloco(
      "Instrutores fora da faixa de frequência/NPS",
      resumo.desempenho,
      (i) => `<li>${i.instrutor} — ${i.motivo}</li>`
    ),
    bloco(
      "Turmas com chamada pendente",
      resumo.chamadasPendentes,
      (t) => `<li>${t.tema} — ${t.cliente} (instrutor: ${t.instrutor || "não informado"})</li>`
    ),
    bloco(
      "Turmas em situação crítica",
      resumo.turmasCriticas,
      (t) => `<li>${t.tema} — ${t.cliente}</li>`
    ),
  ].join("");

  return `
    <p>Bom dia! Este é o resumo diário de pendências do Portal T&amp;D.</p>
    ${blocos || "<p>Nenhuma pendência identificada hoje. 🎉</p>"}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">E-mail automático — Portal T&amp;D.</p>
  `;
}

async function rodarDigestPendencias() {
  const empresas = await listarEmpresasAtivas();
  const resultados = [];

  for (const empresa of empresas) {
    const resumo = await montarResumoEmpresa(empresa.id);
    const total = totalPendencias(resumo);

    // Fase 3 — mesmo resumo já calculado acima vira o texto do "resumo
    // executivo automático" do Dashboard (sem custo, sem chamada de IA:
    // ver resumoExecutivoService.js). Cacheado uma vez por dia, para todas
    // as empresas, mesmo quando não há pendência nenhuma para e-mail.
    try {
      const textoResumo = gerarTextoResumo(resumo);
      await salvarResumoDoDia(empresa.id, textoResumo, total);
    } catch (error) {
      console.error("[pendenciasDigest] Erro ao cachear resumo executivo:", error.message);
    }

    if (total === 0) {
      resultados.push({ empresa: empresa.nome, total: 0, enviados: 0 });
      continue;
    }

    const destinatarios = await listarDestinatarios(empresa.id);
    const html = montarHtml(resumo);
    const assunto = `[Portal T&D] Resumo diário de pendências${empresa.nome ? " — " + empresa.nome : ""} (${total})`;

    for (const dest of destinatarios) {
      // eslint-disable-next-line no-await-in-loop
      await sendMail({ to: dest.email, subject: assunto, html });
    }

    resultados.push({ empresa: empresa.nome, total, enviados: destinatarios.length });
  }

  return resultados;
}

module.exports = { rodarDigestPendencias, montarResumoEmpresa, totalPendencias, listarEmpresasAtivas };
