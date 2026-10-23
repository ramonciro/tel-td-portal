"use client";

// ConteudoIndicadores.js — aba "Indicadores" da Produção de conteúdo (Pacote 2, 23/10/2026).
// Mediana e P90 em vez de média, % no prazo só sobre o que o analista controla, e a
// espera do cliente separada. Os números vêm prontos de GET /conteudo/indicadores.

import { useEffect, useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import StatCard from "./StatCard";
import { GraficoBarraAgrupada } from "./Charts";
import { apiFetch, apiDownload } from "../services/api";
import { colors, chart, radius } from "../lib/theme";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function diasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

const PRESETS = [
  { id: "30", label: "30 dias", de: () => diasAtras(29) },
  { id: "90", label: "90 dias", de: () => diasAtras(89) },
  { id: "ano", label: "Este ano", de: () => `${new Date().getFullYear()}-01-01` },
  { id: "tudo", label: "Tudo", de: () => diasAtras(1000) },
];

const num = (v, casas = 1) => (v === null || v === undefined ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v));
const horas = (v) => (v === null || v === undefined ? "—" : v < 1 ? `${Math.round(v * 60)} min` : `${num(v)} h`);
const dias = (v) => (v === null || v === undefined ? "—" : v < 1 ? `${num(v * 24, 0)} h` : `${num(v)} d`);
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

export default function ConteudoIndicadores({ perfil }) {
  const ehAnalista = perfil === "analista_conteudo";
  const podeExportar = !ehAnalista;
  const [preset, setPreset] = useState("90");
  const [de, setDe] = useState(() => diasAtras(89));
  const [ate, setAte] = useState(() => iso(new Date()));
  const [analista, setAnalista] = useState("");
  const [tipo, setTipo] = useState("");
  const [cliente, setCliente] = useState("");
  const [analistas, setAnalistas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [res, setRes] = useState(null); // { chave, dados } | { chave, erro }
  const [baixando, setBaixando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch("/conteudo/tipos").then(setTipos).catch(() => {});
    apiFetch("/conteudo/clientes").then(setClientes).catch(() => {});
    if (!ehAnalista) apiFetch("/conteudo/analistas").then(setAnalistas).catch(() => {});
  }, [ehAnalista]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams({ de, ate });
    if (analista) q.set("analista_id", analista);
    if (tipo) q.set("tipo_id", tipo);
    if (cliente) q.set("cliente", cliente);
    return q.toString();
  }, [de, ate, analista, tipo, cliente]);

  useEffect(() => {
    let vivo = true;
    apiFetch(`/conteudo/indicadores?${consulta}`)
      .then((dados) => { if (vivo) setRes({ chave: consulta, dados }); })
      .catch((e) => { if (vivo) setRes({ chave: consulta, erro: e.message }); });
    return () => { vivo = false; };
  }, [consulta]);

  function escolherPreset(p) {
    setPreset(p.id);
    setDe(p.de());
    setAte(iso(new Date()));
  }

  async function baixar() {
    setBaixando(true);
    setMsg("");
    try { await apiDownload(`/conteudo/exportar?${consulta}`, `producao-conteudo-${de}-a-${ate}.xlsx`); }
    catch (e) { setMsg(e.message || "Não foi possível baixar o Excel."); }
    finally { setBaixando(false); }
  }

  const carregando = !res || res.chave !== consulta;
  const d = !carregando && res.dados ? res.dados : null;
  const g = d?.geral;
  const serieMes = useMemo(() => (d ? d.por_mes.map((m) => ({ mes: m.mes, entradas: m.entradas, entregues: m.entregues })) : []), [d]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard title="Período e filtros" subtitle="Os indicadores contam os pedidos concluídos no período. O que está em revisão no histórico fica de fora.">
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => escolherPreset(p)} aria-pressed={preset === p.id}
                style={{ ...chip, ...(preset === p.id ? chipAtivo : null) }}>{p.label}</button>
            ))}
            <label style={rotulo}>De
              <input type="date" value={de} max={ate} onChange={(e) => { setPreset(""); setDe(e.target.value); }} style={campo} />
            </label>
            <label style={rotulo}>Até
              <input type="date" value={ate} min={de} onChange={(e) => { setPreset(""); setAte(e.target.value); }} style={campo} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!ehAnalista && (
              <select value={analista} onChange={(e) => setAnalista(e.target.value)} style={campo} aria-label="Analista">
                <option value="">Todos os analistas</option>
                {analistas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            )}
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo} aria-label="Tipo de material">
              <option value="">Todos os tipos</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={campo} aria-label="Cliente">
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {(analista || tipo || cliente) && (
              <button type="button" onClick={() => { setAnalista(""); setTipo(""); setCliente(""); }} style={{ ...chip }}>Limpar filtros</button>
            )}
            {podeExportar && (
              <button type="button" onClick={baixar} disabled={baixando} style={{ ...chip, marginLeft: "auto", background: colors.navy, color: "#fff", border: `1px solid ${colors.navy}`, opacity: baixando ? 0.6 : 1 }}>
                {baixando ? "Gerando…" : "Baixar Excel"}
              </button>
            )}
          </div>
          {msg && <div style={alerta}>{msg}</div>}
        </div>
      </SectionCard>

      {res?.erro && res.chave === consulta && <div style={alerta}>{res.erro}</div>}
      {carregando && !res?.erro && <div style={vazio}>Calculando…</div>}

      {d && (
        <>
          {d.poucos_dados && (
            <div style={atencao}>
              Poucos pedidos no período ({g.entregues}). Com menos de 5 entregas a mediana e principalmente o P90 oscilam muito: use como pista, não como conclusão.
            </div>
          )}
          {d.fora_dos_indicadores > 0 && (
            <div style={atencao}>
              {d.fora_dos_indicadores} pedido(s) concluído(s) no período estão fora destes números (histórico aguardando revisão ou marcado para ignorar).
            </div>
          )}

          <div style={grade}>
            <StatCard title="Entregues" value={num(g.entregues, 0)} subtitle={`${num(g.pontos)} pontos`} accent={chart.blue}
              helper={`${d.agora.abertos} em aberto · ${d.agora.atrasados} atrasado(s)`} />
            <StatCard title="Criação (1ª rodada)" value={horas(g.criacao_h.mediana)} subtitle={`P90: ${horas(g.criacao_h.p90)} · ${g.criacao_h.n} pedido(s)`} accent={chart.cyan}
              helper="mediana em horas úteis" />
            <StatCard title="Entregues no prazo" value={pct(g.no_prazo.pct)} subtitle={g.no_prazo.n ? `${g.no_prazo.ok} de ${g.no_prazo.n} pedidos com prazo` : "nenhum pedido com prazo"} accent={g.no_prazo.pct !== null && g.no_prazo.pct < 70 ? colors.warning : colors.success}
              helper="criação e postagem" />
            <StatCard title="Retrabalho" value={pct(g.retrabalho.pct)}
              subtitle={g.retrabalho.n ? `${g.retrabalho.pedidos} de ${g.retrabalho.n} pedido(s) com ajustes · ${num(g.retrabalho.rodadas_media, 2)} rodadas por pedido` : "ainda sem pedidos medidos"}
              accent={chart.orange}
              helper={g.retrabalho.n < g.entregues ? "só pedidos feitos no portal (a planilha não registrava ajustes)" : "pediram ajustes após a 1ª entrega"} />
            <StatCard title="Espera do cliente" value={dias(g.espera_cliente_dias.mediana)} subtitle={g.espera_cliente_dias.n ? `P90: ${dias(g.espera_cliente_dias.p90)} · ${g.espera_cliente_dias.n} pedido(s)` : "ainda sem pedidos medidos"} accent={chart.purple}
              helper={g.espera_cliente_dias.n < g.entregues ? "só pedidos feitos no portal · não conta contra o analista" : "não conta contra o analista"} />
            <StatCard title="Do pedido à entrega" value={dias(g.ciclo_dias.mediana)} subtitle={`P90: ${dias(g.ciclo_dias.p90)} · dias corridos`} accent={chart.teal}
              helper="inclui espera e validação" />
          </div>

          <SectionCard title="Ritmo por mês" subtitle="Pedidos abertos no mês e pedidos entregues no mês.">
            <div style={{ padding: "0 16px 16px" }}>
              <GraficoBarraAgrupada
                dados={serieMes.slice(-12)}
                eixoX="mes"
                grupos={[
                  { key: "entradas", label: "Abertos", cor: colors.neutral },
                  { key: "entregues", label: "Entregues", cor: colors.success },
                ]}
              />
            </div>
          </SectionCard>

          {!ehAnalista || d.por_analista.length ? (
            <TabelaGrupo
              titulo={ehAnalista ? "Seus números" : "Por analista"}
              subtitulo={ehAnalista ? "Você vê o total da equipe acima e apenas a sua linha aqui." : "Quem produz, quanto e em quanto tempo."}
              primeira="Analista" linhas={d.por_analista}
            />
          ) : null}
          <TabelaGrupo titulo="Por tipo de material" primeira="Tipo" linhas={d.por_tipo} />
          <TabelaGrupo titulo="Por cliente" primeira="Cliente" linhas={d.por_cliente} />
          <TabelaMes linhas={d.por_mes} />
          <ComoLer />
        </>
      )}
    </div>
  );
}

function TabelaGrupo({ titulo, subtitulo, primeira, linhas }) {
  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      <div style={{ overflowX: "auto" }}>
        <table style={tabela}>
          <thead>
            <tr>{[primeira, "Entregues", "Pontos", "Criação (mediana)", "Criação (P90)", "No prazo", "Retrabalho", "Espera do cliente"].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? "right" : "left" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const pouco = l.entregues < 5;
              return (
                <tr key={l.chave} style={pouco ? { color: colors.textSecondary } : null}>
                  <td style={td}><strong>{l.rotulo}</strong>{pouco && <span style={poucoSelo} title="Menos de 5 entregas: os números oscilam muito">poucos dados</span>}</td>
                  <td style={tdN}>{l.entregues}</td>
                  <td style={tdN}>{num(l.pontos)}</td>
                  <td style={tdN}>{horas(l.criacao_h.mediana)}</td>
                  <td style={tdN}>{horas(l.criacao_h.p90)}</td>
                  <td style={tdN}>{pct(l.no_prazo.pct)}</td>
                  <td style={tdN}>{pct(l.retrabalho.pct)}</td>
                  <td style={tdN}>{dias(l.espera_cliente_dias.mediana)}</td>
                </tr>
              );
            })}
            {linhas.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: colors.textMuted }} colSpan={8}>Nenhum pedido entregue no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TabelaMes({ linhas }) {
  const nomeMes = (m) => m.split("-").reverse().join("/");
  return (
    <SectionCard title="Mês a mês">
      <div style={{ overflowX: "auto" }}>
        <table style={tabela}>
          <thead>
            <tr>{["Mês", "Abertos", "Entregues", "Pontos", "Criação (mediana)", "No prazo", "Retrabalho", "Espera do cliente"].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? "right" : "left" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td style={td}><strong>{nomeMes(l.mes)}</strong></td>
                <td style={tdN}>{l.entradas}</td>
                <td style={tdN}>{l.entregues}</td>
                <td style={tdN}>{num(l.pontos)}</td>
                <td style={tdN}>{horas(l.criacao_h.mediana)}</td>
                <td style={tdN}>{pct(l.no_prazo.pct)}</td>
                <td style={tdN}>{pct(l.retrabalho.pct)}</td>
                <td style={tdN}>{dias(l.espera_cliente_dias.mediana)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ComoLer() {
  return (
    <details style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: "12px 16px", fontSize: 13.5, color: colors.textSecondary }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, color: colors.textPrimary }}>Como ler estes números</summary>
      <div style={{ display: "grid", gap: 8, marginTop: 10, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}><strong>Mediana e P90.</strong> A mediana é o valor do meio: metade dos pedidos levou menos, metade levou mais. O P90 mostra o ponto abaixo do qual ficam 9 de cada 10 pedidos, ou seja, o “pior caso comum”. Usamos esses dois em vez da média porque um pedido de 1.000 horas distorce a média inteira.</p>
        <p style={{ margin: 0 }}><strong>Horas úteis.</strong> Só contam segunda a sexta dentro do expediente configurado. Noite, fim de semana e almoço não entram. Feriados ainda não são descontados.</p>
        <p style={{ margin: 0 }}><strong>No prazo.</strong> Olha só o que o analista controla: a primeira rodada de criação contra o prazo de criação do tipo e a postagem contra o prazo de postagem. Etapas de tipos sem prazo (0) não são julgadas. Ajustes pedidos depois contam como retrabalho, não como atraso.</p>
        <p style={{ margin: 0 }}><strong>Retrabalho.</strong> Percentual de pedidos que precisaram de mais de uma rodada de criação, isto é, voltaram com pedido de ajuste. Só entram os pedidos feitos no portal, porque a planilha antiga não registrava ajustes.</p>
        <p style={{ margin: 0 }}><strong>Comparar analistas.</strong> Com cuidado: cada um pega um mix diferente de tipos, e um card leva minutos enquanto um treinamento leva dias. Os pontos e a tabela por tipo ajudam a equilibrar.</p>
        <p style={{ margin: 0 }}><strong>Espera do cliente.</strong> Tempo em dias corridos que o material ficou com o cliente para validar. Não pesa contra o analista. Só entram os pedidos feitos no portal: na planilha antiga não dá para separar quem validou. A validação feita pela coordenação aparece à parte, em horas úteis, no Excel.</p>
        <p style={{ margin: 0 }}><strong>Poucos dados.</strong> Com menos de 5 entregas, os valores são marcados porque a mediana e o P90 oscilam muito.</p>
      </div>
    </details>
  );
}

/* ---------------------------------------------------------------- estilos */

const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 };
const chip = { padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const chipAtivo = { background: colors.navy, color: "#fff", border: `1px solid ${colors.navy}` };
const campo = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", fontFamily: "inherit", fontSize: 13.5, color: colors.textPrimary };
const rotulo = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const atencao = { background: colors.warningLight, color: colors.warningText, border: "1px solid #fdba74", borderRadius: radius.md, padding: "10px 14px", fontSize: 13.5 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "48px 16px", fontSize: 14, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13.5 };
const th = { padding: "10px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textMuted, borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "middle" };
const tdN = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const poucoSelo = { marginLeft: 8, padding: "1px 8px", borderRadius: radius.pill, fontSize: 11, fontWeight: 700, background: colors.neutralLight, color: colors.textMuted };
