"use client";

/**
 * app/fechamento-mensal/page.js — Fechamento mensal por cliente (21/10/2026)
 *
 * Panorama do mês (quais clientes já foram fechados) + resumo do cliente escolhido,
 * com comparação com o mês anterior. Coordenador/supervisor fecham e reabrem; a
 * superintendência só lê e baixa o Excel.
 */

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, apiDownload, getStoredUser, hasSomeRole } from "../../services/api";
import { colors, chart } from "../../lib/theme";

function mesAtualISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1); // por padrão, o mês que acabou de fechar
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const fmtMes = (m) => (m ? m.split("-").reverse().join("/") : "");
const fmt = (v, suf = "") => (v === null || v === undefined ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}${suf}`);
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function Variacao({ valor, suf = "", bomSubir = true }) {
  if (valor === null || valor === undefined) return <span style={{ color: colors.textMuted }}>sem comparação</span>;
  if (valor === 0) return <span style={{ color: colors.textMuted }}>igual ao mês anterior</span>;
  const bom = bomSubir ? valor > 0 : valor < 0;
  return <span style={{ color: bom ? colors.successText : colors.dangerText, fontWeight: 800 }}>{valor > 0 ? "▲" : "▼"} {fmt(Math.abs(valor), suf)} vs. mês anterior</span>;
}

export default function FechamentoMensalPage() {
  const [mes, setMes] = useState(mesAtualISO());
  const [cliente, setCliente] = useState("");
  const [panorama, setPanorama] = useState([]);
  const [dados, setDados] = useState(null);
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const podeFechar = hasSomeRole(getStoredUser(), ["coordenador", "supervisor"]);

  async function carregarPanorama() {
    try {
      const r = await apiFetch(`/fechamento-mensal/panorama?mes=${mes}`);
      setPanorama(Array.isArray(r?.clientes) ? r.clientes : []);
    } catch (e) { setErro(e.message || "Não foi possível carregar o panorama."); }
  }

  async function carregarCliente() {
    if (!cliente) { setDados(null); return; }
    try {
      setLoading(true); setErro("");
      setDados(await apiFetch(`/fechamento-mensal?mes=${mes}&cliente=${encodeURIComponent(cliente)}`));
    } catch (e) { setErro(e.message || "Não foi possível calcular o fechamento."); setDados(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregarPanorama(); setOk(""); /* eslint-disable-next-line */ }, [mes]);
  useEffect(() => { carregarCliente(); /* eslint-disable-next-line */ }, [mes, cliente]);

  const fechado = dados?.fechado || null;
  const base = fechado?.dados || dados?.ao_vivo || null;
  const k = base?.kpis || {};
  const v = base?.variacao || {};

  async function fechar() {
    if (!window.confirm(`Fechar ${fmtMes(mes)} de ${cliente}? Os números ficam congelados até alguém reabrir.`)) return;
    try {
      setTrabalhando(true); setErro(""); setOk("");
      await apiFetch("/fechamento-mensal", { method: "POST", body: JSON.stringify({ mes, cliente, observacao: obs }) });
      setOk("Mês fechado."); setObs("");
      await Promise.all([carregarCliente(), carregarPanorama()]);
    } catch (e) { setErro(e.message || "Erro ao fechar o mês."); }
    finally { setTrabalhando(false); }
  }

  async function reabrir() {
    if (!window.confirm("Reabrir o mês? A foto atual será apagada e os números voltam a ser calculados ao vivo.")) return;
    try {
      setTrabalhando(true); setErro(""); setOk("");
      await apiFetch(`/fechamento-mensal?mes=${mes}&cliente=${encodeURIComponent(cliente)}`, { method: "DELETE" });
      setOk("Mês reaberto.");
      await Promise.all([carregarCliente(), carregarPanorama()]);
    } catch (e) { setErro(e.message || "Erro ao reabrir."); }
    finally { setTrabalhando(false); }
  }

  async function exportar() {
    try { setErro(""); await apiDownload(`/fechamento-mensal/exportar?mes=${mes}&cliente=${encodeURIComponent(cliente)}`, `fechamento-${mes}.xlsx`); }
    catch (e) { setErro(e.message || "Erro ao exportar."); }
  }

  const fechadosCount = useMemo(() => panorama.filter((c) => c.fechado).length, [panorama]);

  return (
    <PortalShell>
      <PageHero
        eyebrow="Indicadores"
        title="Fechamento mensal por cliente"
        subtitle="Resumo do mês de cada operação: turmas encerradas, horas, presença e avaliações. Ao fechar, os números ficam congelados."
        stats={[
          { label: "Mês", value: fmtMes(mes) },
          { label: "Clientes", value: panorama.length },
          { label: "Fechados", value: fechadosCount },
          { label: "Em aberto", value: panorama.length - fechadosCount },
        ]}
        actions={<input type="month" value={mes} onChange={(e) => { setMes(e.target.value); }} style={campo} aria-label="Mês" />}
      />

      {erro ? <div style={alerta("#fee2e2", "#991b1b")}>{erro}</div> : null}
      {ok ? <div style={alerta("#dcfce7", "#166534")}>{ok}</div> : null}

      <div style={{ marginTop: 16 }}>
        <SectionCard title="Clientes no mês" subtitle="Escolha um cliente para ver o resumo. Os que têm turmas encerradas no mês aparecem com a quantidade.">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 16px 16px" }}>
            {panorama.length === 0 ? <span style={{ color: colors.textMuted, fontSize: 13 }}>Nenhum cliente cadastrado.</span> : null}
            {panorama.map((c) => {
              const ativo = c.cliente === cliente;
              return (
                <button key={c.cliente} type="button" onClick={() => setCliente(c.cliente)} style={{ ...chip, borderColor: ativo ? "#1d4ed8" : "#e2e8f0", background: ativo ? "#eff6ff" : "#fff" }}>
                  <strong>{c.cliente}</strong>
                  <span style={{ fontSize: 11, color: colors.textSecondary }}>{c.turmas_no_mes} turma(s)</span>
                  <span style={{ ...selo, background: c.fechado ? "#dcfce7" : "#fef3c7", color: c.fechado ? "#166534" : "#92400e" }}>{c.fechado ? "Fechado" : "Em aberto"}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {cliente ? (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {loading || !base ? <p style={{ color: colors.textMuted }}>Calculando…</p> : (
            <>
              <SectionCard
                title={`${cliente} — ${fmtMes(mes)}`}
                subtitle={fechado ? `Fechado em ${fmtData(fechado.fechado_em)} por ${fechado.fechado_por_nome || "—"}. Números congelados.` : "Prévia: ainda calculado ao vivo, pode mudar até o fechamento."}
                action={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={exportar} style={btn("#fff", "#0f172a", true)}>Baixar Excel</button>
                    {podeFechar && !fechado ? <button type="button" onClick={fechar} disabled={trabalhando} style={btn(colors.accent, "#fff")}>{trabalhando ? "Fechando…" : "Fechar o mês"}</button> : null}
                    {podeFechar && fechado ? <button type="button" onClick={reabrir} disabled={trabalhando} style={btn("#fff", "#991b1b", true)}>Reabrir</button> : null}
                  </div>
                }
              >
                <div style={grade}>
                  <StatCard title="Turmas encerradas" value={fmt(k.turmas_encerradas)} subtitle={`${fmt(k.turmas_canceladas)} cancelada(s) · ${fmt(k.continuam_proximo_mes)} continuam no mês seguinte`} accent={chart.blue} helper={<Variacao valor={v.turmas_encerradas} />} />
                  <StatCard title="Horas de turma" value={fmt(k.horas_turma, " h")} subtitle={`${fmt(k.horas_treinamento, " h")} de treinamento (horas × participantes)`} accent={chart.cyan} helper={<Variacao valor={v.horas_turma} suf=" h" />} />
                  <StatCard title="Participantes" value={fmt(k.participantes)} subtitle={`${fmt(k.instrutores)} instrutor(es)`} accent={colors.success} helper={<Variacao valor={v.participantes} />} />
                  <StatCard title="Presença" value={fmt(k.presenca_pct, "%")} subtitle={k.chamadas_pendentes ? `${k.chamadas_pendentes} turma(s) com chamada pendente` : "Chamadas em dia"} accent={k.chamadas_pendentes ? colors.warning : colors.success} helper={<Variacao valor={v.presenca_pct} suf=" p.p." />} />
                  <StatCard title="NPS" value={fmt(k.nps_score)} subtitle={`${fmt(k.nps_respostas)} resposta(s) · média ${fmt(k.nps_media)}`} accent={chart.blue} helper={<Variacao valor={v.nps_score} />} />
                  <StatCard title="Qualidade / Prova" value={`${fmt(k.qualidade_media)} / ${fmt(k.prova_media)}`} subtitle="médias das notas do mês" accent={chart.cyan} helper={<Variacao valor={v.prova_media} />} />
                </div>
                {fechado?.observacao ? <p style={{ margin: "0 16px 16px", fontSize: 13, color: colors.textSecondary }}><strong>Observação do fechamento:</strong> {fechado.observacao}</p> : null}
                {podeFechar && !fechado ? (
                  <div style={{ padding: "0 16px 16px" }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>Observação (opcional, fica guardada no fechamento)</label>
                    <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={1000} style={{ ...campo, width: "100%", marginTop: 6, resize: "vertical" }} />
                  </div>
                ) : null}
              </SectionCard>

              {base.conteudo ? (
                <SectionCard title="Produção de conteúdo no mês" subtitle="Materiais deste cliente entregues no mês (horas úteis; a espera do cliente é à parte).">
                  <div style={grade}>
                    <StatCard title="Pedidos entregues" value={fmt(base.conteudo.entregues)} subtitle={`${fmt(base.conteudo.pontos)} ponto(s)`} accent={chart.blue} />
                    <StatCard title="Criação (mediana)" value={fmt(base.conteudo.criacao_mediana_h, " h")} subtitle="1ª rodada, horas úteis" accent={chart.cyan} />
                    <StatCard title="Entregues no prazo" value={fmt(base.conteudo.no_prazo_pct, "%")} subtitle="criação e postagem" accent={colors.success} />
                    <StatCard title="Retrabalho" value={fmt(base.conteudo.retrabalho_pct, "%")} subtitle="pedidos com ajustes" accent={chart.orange} />
                    <StatCard title="Espera do cliente" value={fmt(base.conteudo.espera_cliente_mediana_dias, " d")} subtitle="mediana, dias corridos" accent={chart.purple} />
                  </div>
                  {(base.conteudo.por_tipo || []).length ? (
                    <p style={{ margin: "0 16px 16px", fontSize: 12.5, color: colors.textSecondary }}>
                      Por tipo: {base.conteudo.por_tipo.map((t) => `${t.tipo} (${t.entregues})`).join(" · ")}
                    </p>
                  ) : null}
                </SectionCard>
              ) : null}

              <SectionCard title="Turmas encerradas no mês">
                {!(base.turmas || []).length ? <p style={{ padding: 16, color: colors.textMuted }}>Nenhuma turma encerrada neste mês para este cliente.</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead><tr>{["Turma", "Instrutor", "Período", "CH", "Participantes", "Presença", "NPS", "Situação"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {base.turmas.map((t) => (
                          <tr key={t.id}>
                            <td style={td}>{t.tema}</td><td style={td}>{t.instrutor || "—"}</td>
                            <td style={td}>{fmtData(t.inicio)} – {fmtData(t.fim)}</td>
                            <td style={td}>{fmt(t.carga_horaria, " h")}</td><td style={td}>{fmt(t.participantes)}</td>
                            <td style={td}>{fmt(t.presenca_pct, "%")}</td><td style={td}>{fmt(t.nps_media)}</td><td style={td}>{t.status || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(base.continuam || []).length ? (
                  <p style={{ margin: "0 16px 16px", fontSize: 12.5, color: colors.textSecondary }}>
                    Continuam no mês seguinte (não entram nos totais): {base.continuam.map((t) => t.tema).join(" · ")}
                  </p>
                ) : null}
              </SectionCard>
            </>
          )}
        </div>
      ) : null}
    </PortalShell>
  );
}

const campo = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "#fff", color: "#0f172a" };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };
const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, padding: 16 };
const chip = { border: "1px solid #e2e8f0", borderRadius: 12, padding: "9px 12px", display: "inline-flex", flexDirection: "column", gap: 3, cursor: "pointer", textAlign: "left", fontSize: 13 };
const selo = { display: "inline-block", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, alignSelf: "flex-start" };
const btn = (bg, cor, borda) => ({ background: bg, color: cor, border: borda ? "1px solid #e2e8f0" : 0, borderRadius: 10, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" });
const alerta = (bg, cor) => ({ marginTop: 12, background: bg, color: cor, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700 });
