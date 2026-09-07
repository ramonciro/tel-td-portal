"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, chart, corDoCliente, radius } from "../../lib/theme";

// "YYYY-MM-DD..." -> "DD/MM", sem passar por Date() (evita off-by-one de
// fuso horário em campos DATE puros, que o MySQL devolve sem horário).
function formatarDataCurta(valor) {
  const s = String(valor || "").slice(0, 10);
  const [ano, mes, dia] = s.split("-");
  if (!dia) return null;
  return `${dia}/${mes}`;
}

// Melhoria (protótipo aprovado com o Ramon, 07/09): saudação e gradiente do
// hero mudam com o período do dia — mesma ideia testada no protótipo
// interativo, aplicada aqui com a hora real do relógio do navegador.
function saudacaoPorHorario(hora) {
  if (hora < 12) return { texto: "Bom dia", periodo: "manha" };
  if (hora < 18) return { texto: "Boa tarde", periodo: "tarde" };
  return { texto: "Boa noite", periodo: "noite" };
}

const HERO_GRADIENTES = {
  manha: "linear-gradient(135deg, #2563EB 0%, #60a5fa 55%, #fbbf24 100%)",
  tarde: "linear-gradient(135deg, #0B1220 0%, #1d4ed8 55%, #F59E0B 100%)",
  noite: "linear-gradient(135deg, #0B1220 0%, #161D2E 60%, #4338ca 100%)",
};

// Tiles de atalho por papel — cada papel vê só as ações que fazem sentido
// pra ele, com o número que importa já embutido, não só um ícone bonito.
function tilesPorPapel(papelRaw, dados) {
  // FIX: normalizar para minúsculas — banco pode armazenar "Coordenador" (C maiúsculo)
  const papel = String(papelRaw || "").toLowerCase().trim();
  const pendentes = dados.pendentes;
  const base = [
    { icon: "📚", label: "Minhas turmas", sub: `${dados.turmasAtivas} ativa(s)`, href: "/presencas", color: chart.cyan },
    { icon: "🗂️", label: "Biblioteca", sub: "Materiais e apostilas", href: "/biblioteca", color: "#6366F1" },
  ];

  if (papel === "coordenador" || papel === "supervisor") {
    return [
      { icon: "✅", label: "Fazer chamada", sub: `${pendentes} pendente(s) hoje`, href: "/presencas", color: colors.accent },
      { icon: "📊", label: "Dashboard", sub: "Visão consolidada", href: "/dashboard", color: chart.blue },
      { icon: "🎯", label: "Necessidades", sub: `${dados.necessidadesAbertas} em aberto`, href: "/necessidades", color: colors.warning },
      ...base.slice(0, 1),
    ];
  }

  if (papel === "instrutor") {
    // "Fazer chamada" não vira mais tile aqui — o bloco "Meu Dia" (acima,
    // só para instrutor) já mostra a turma pendente com o botão direto,
    // sem duplicar o mesmo atalho duas vezes na mesma tela.
    return [
      ...base,
      { icon: "📝", label: "Treinamentos", sub: "Suas turmas e cronogramas", href: "/treinamentos", color: chart.purple },
    ];
  }

  // treinando
  return [
    ...base,
  ];
}

export default function InicioPage() {
  const [usuario, setUsuario] = useState(undefined);
  const [turmas, setTurmas] = useState([]);
  const [resumo, setResumo] = useState([]);
  const [necessidades, setNecessidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("Todos");
  const [busca, setBusca] = useState("");

  // Melhoria: saudação/gradiente fixados no momento em que a página abre
  // (não recalcula a cada render) — calculado uma vez com a hora local do
  // navegador de quem está usando o portal.
  const saudacao = useMemo(() => saudacaoPorHorario(new Date().getHours()), []);

  // "revelado" liga a cascata de entrada (tiles/métricas/meu dia) assim que
  // os dados terminam de carregar pela primeira vez — não religa a cada
  // tecla digitada na busca ou troca de filtro de cliente, só na entrada
  // inicial da tela.
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setRevelado(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);

  useEffect(() => {
    const u = getStoredUser();
    setUsuario(u);
    carregar(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar(u) {
    try {
      setLoading(true);
      // FIX: antes buscava TODAS as turmas do sistema (/treinamentos) e filtrava
      // no cliente — para "instrutor" com um match de nome, e para "treinando"
      // com um loop de N requisições (uma por turma) só pra descobrir em quais
      // ele estava inscrito, o que já causou timeouts/dados vazios (ver FIX #3
      // no histórico). "/minhas-turmas" já faz esse recorte por papel no
      // servidor, numa única query — mesmo endpoint usado em Presenças/Minhas Turmas.
      const [treinamentosData, resumoData, necessidadesData] = await Promise.all([
        apiFetch("/minhas-turmas").catch(() => []),
        apiFetch("/presenca-resumo").catch(() => null),
        // FIX: case-insensitive — banco pode guardar "Coordenador" (C maiúsculo)
        ["coordenador","supervisor"].includes(String(u?.perfil || "").toLowerCase().trim())
          ? apiFetch("/necessidades").catch(() => null)
          : Promise.resolve(null),
      ]);

      const minhasTurmas = Array.isArray(treinamentosData) ? treinamentosData : [];
      const listaResumo = Array.isArray(resumoData?.itens) ? resumoData.itens : [];

      setTurmas(minhasTurmas);
      setResumo(listaResumo);
      setNecessidades(Array.isArray(necessidadesData?.itens) ? necessidadesData.itens : []);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar sua home.");
    } finally {
      setLoading(false);
    }
  }

  const resumoPorId = useMemo(() => new Map(resumo.map((r) => [Number(r.id), r])), [resumo]);

  const turmasComResumo = useMemo(
    () => turmas.map((t) => ({ ...t, resumo: resumoPorId.get(Number(t.id)) || null })),
    [turmas, resumoPorId]
  );

  // "Meu Dia" — só para instrutor. Antes, "fazer chamada" significava abrir a
  // lista de Presenças e procurar a turma certa; aqui a turma que precisa de
  // ação hoje já vem em destaque, com o botão de chamada indo direto pra
  // turma certa (/turma/{id}/chamada), sem passo intermediário.
  const turmasPendentesHoje = useMemo(
    () => turmasComResumo.filter((t) => t.resumo?.status_turma === "Chamada pendente"),
    [turmasComResumo]
  );
  const turmasEmAndamentoHoje = useMemo(
    () => turmasComResumo.filter((t) => t.resumo?.status_turma === "Em andamento"),
    [turmasComResumo]
  );

  // Melhoria: "Meu Dia" só mostrava "Hoje" — a ideia original também previa
  // "Próximas turmas". Aqui listamos as próximas (por data agendada) que
  // ainda não apareceram nos blocos de hoje acima.
  const hojeStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const proximasTurmas = useMemo(() => {
    const idsHoje = new Set([...turmasPendentesHoje, ...turmasEmAndamentoHoje].map((t) => t.id));
    return turmasComResumo
      .filter((t) => t.data && String(t.data).slice(0, 10) > hojeStr && !idsHoje.has(t.id))
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .slice(0, 5);
  }, [turmasComResumo, turmasPendentesHoje, turmasEmAndamentoHoje, hojeStr]);

  const clientes = useMemo(() => {
    const nomes = new Set(turmasComResumo.map((t) => t.cliente).filter(Boolean));
    return ["Todos", ...Array.from(nomes)];
  }, [turmasComResumo]);

  const turmasFiltradas = useMemo(() => {
    return turmasComResumo.filter((t) => {
      const passaCliente = filtroCliente === "Todos" || t.cliente === filtroCliente;
      const passaBusca =
        !busca.trim() ||
        String(t.tema || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(t.cliente || "").toLowerCase().includes(busca.toLowerCase());
      return passaCliente && passaBusca;
    });
  }, [turmasComResumo, filtroCliente, busca]);

  const dados = useMemo(() => {
    const pendentes = turmasComResumo.filter((t) => t.resumo?.status_turma === "Chamada pendente").length;
    const turmasAtivas = turmasComResumo.filter((t) => t.resumo?.status_turma === "Em andamento").length;
    // FIX #1: campo correto é taxa_presenca (não taxa_presenca_pessoas — inexistente)
    // FIX #2: total lançado = presentes + ausentes + justificados (não total_realizado — inexistente)
    const comTaxa = turmasComResumo.filter((t) => {
      if (!t.resumo) return false;
      const totalLancado = Number(t.resumo.presentes || 0) + Number(t.resumo.ausentes || 0) + Number(t.resumo.justificados || 0);
      return totalLancado > 0 && Number(t.resumo.taxa_presenca || 0) > 0;
    });
    const presencaMedia = comTaxa.length
      ? Math.round(comTaxa.reduce((acc, t) => acc + Number(t.resumo.taxa_presenca || 0), 0) / comTaxa.length)
      : null;
    const instrutores = new Set(turmasComResumo.map((t) => t.instrutor).filter(Boolean)).size;
    const necessidadesAbertas = necessidades.filter((n) => n.status_calculado === "aberta" || n.status_calculado === "atrasada").length;
    const necessidadesEmAtendimento = necessidades.filter((n) => n.status_calculado === "em_atendimento").length;

    // Melhoria: pra instrutor/treinando, "Instrutores em campo" é pouco útil
    // (a lista já é só do próprio usuário) — "Próxima aula" diz mais.
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const proximas = turmasComResumo
      .filter((t) => t.data && String(t.data).slice(0, 10) >= hojeStr)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const proximaAula = proximas[0] || null;

    return {
      pendentes, turmasAtivas, presencaMedia, instrutores, necessidadesAbertas, necessidadesEmAtendimento,
      proximaAulaData: proximaAula ? formatarDataCurta(proximaAula.data) : null,
      proximaAulaTema: proximaAula ? `${proximaAula.tema}${proximaAula.cliente ? ` · ${proximaAula.cliente}` : ""}` : null,
    };
  }, [turmasComResumo, necessidades]);

  if (usuario === undefined) return null;

  const primeiroNome = String(usuario?.nome || "").split(" ")[0] || "";
  const perfilNorm = String(usuario?.perfil || "").toLowerCase().trim();
  // FIX: passa o perfil raw — normalização acontece dentro de tilesPorPapel
  const tiles = tilesPorPapel(usuario?.perfil, dados);

  return (
    <PortalShell>
      {/* Melhoria (protótipo aprovado com o Ramon, 07/09): cascata de entrada,
          pulso pulsando na turma pendente e barra de presença animada.
          prefers-reduced-motion desliga tudo isso pra quem pediu menos
          movimento no sistema operacional. */}
      <style>{`
        @keyframes iniCascade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .ini-cascade { opacity: 0; }
        .ini-cascade.ini-play { animation: iniCascade .5s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes iniPulseDot { 0% { box-shadow: 0 0 0 0 rgba(194,65,12,.55); } 70% { box-shadow: 0 0 0 7px rgba(194,65,12,0); } 100% { box-shadow: 0 0 0 0 rgba(194,65,12,0); } }
        .ini-pulsing { animation: iniPulseDot 1.8s infinite; }
        @keyframes iniPop { from { transform: scale(0); } to { transform: scale(1); } }
        .ini-pop { animation: iniPop .5s cubic-bezier(.34,1.56,.64,1) .1s forwards; transform: scale(0); }
        @media (prefers-reduced-motion: reduce) {
          .ini-cascade, .ini-cascade.ini-play, .ini-pulsing, .ini-pop { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "-24px -24px 0" }}>

        {/* pulso operacional — leitura rápida do dia antes de qualquer outra coisa */}
        {turmasComResumo.length > 0 && (
          <div style={{ background: colors.navySoft, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, overflowX: "auto" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B93A7", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap", flexShrink: 0 }}>
              Pulso de hoje
            </span>
            {turmasComResumo.slice(0, 8).map((t) => {
              const status = t.resumo?.status_turma;
              const pendente = status === "Chamada pendente";
              const dotColor = pendente ? colors.warning : status === "Em andamento" || status === "Concluída" ? colors.success : "#465065";
              return (
                <a key={t.id} href={`/turma/${t.id}/mural`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#DCE0EA", whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0 }}>
                  <span className={pendente ? "ini-pulsing" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  {t.tema} · {t.cliente} — {status || "sem dados"}
                </a>
              );
            })}
          </div>
        )}

        {/* Melhoria: saudação vira um banner com gradiente sensível ao
            período do dia (manhã/tarde/noite), em vez de texto simples sobre
            o fundo branco — mesma ideia validada no protótipo. */}
        <div style={{
          padding: "26px 24px", background: HERO_GRADIENTES[saudacao.periodo], color: "#fff",
          transition: "background 1s ease",
        }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-.01em" }}>
            {saudacao.texto}, {primeiroNome}.
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "rgba(255,255,255,.82)", maxWidth: 520 }}>
            {dados.pendentes > 0
              ? `${dados.pendentes} turma(s) com chamada pendente hoje. O resto está em dia.`
              : "Nenhuma chamada pendente hoje — tudo em dia."}
          </p>
        </div>

        <div style={{ padding: "20px 24px 4px" }}>
          {erro && (
            <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
              {erro}
            </div>
          )}

          {/* Melhoria: antes só o instrutor via "Meu Dia" — o treinando também
              se beneficia de ver o status da própria turma hoje, só que sem
              o botão de "Fazer chamada" (isso é ação do instrutor). */}
          {!loading && ["instrutor", "treinando"].includes(perfilNorm) && (
            <div className={`ini-cascade ${revelado ? "ini-play" : ""}`}>
              <MeuDia
                pendentes={turmasPendentesHoje}
                emAndamento={turmasEmAndamentoHoje}
                proximas={proximasTurmas}
                somenteLeitura={perfilNorm === "treinando"}
                revelado={revelado}
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 8 }}>
            {tiles.map((tile, idx) => (
              <a
                key={tile.label}
                href={tile.href}
                className={`ini-cascade ${revelado ? "ini-play" : ""}`}
                style={{
                  display: "block", textDecoration: "none", background: "#fff",
                  border: `1px solid ${colors.border}`, borderLeft: `3px solid ${tile.color}`,
                  borderRadius: 14, padding: 16, transition: "transform .12s ease",
                  animationDelay: `${0.05 + idx * 0.05}s`,
                }}
              >
                <span style={{ fontSize: 20, display: "block", marginBottom: 10 }}>{tile.icon}</span>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{tile.label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>{tile.sub}</p>
              </a>
            ))}
          </div>
        </div>

        <div style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Metrica valor={dados.presencaMedia != null ? `${dados.presencaMedia}%` : "—"} label="Presença média" cor={colors.success} pct={dados.presencaMedia || 0} revelado={revelado} delay={0.25} />
          <Metrica valor={dados.turmasAtivas} label="Turmas em andamento" cor={colors.accent} pct={Math.min(dados.turmasAtivas * 15, 100)} revelado={revelado} delay={0.3} />
          {/* Melhoria: "Instrutores em campo" é pouco relevante pra quem já
              vê só a própria lista de turmas (instrutor/treinando) — mostra
              a próxima aula agendada em vez disso. */}
          {["instrutor", "treinando"].includes(perfilNorm) ? (
            <Metrica
              valor={dados.proximaAulaData || "—"}
              label="Próxima aula"
              sub={dados.proximaAulaTema}
              cor={chart.cyan}
              pct={dados.proximaAulaData ? 100 : 0}
              revelado={revelado}
              delay={0.35}
            />
          ) : (
            <Metrica valor={dados.instrutores} label="Instrutores em campo" cor={chart.cyan} pct={Math.min(dados.instrutores * 20, 100)} revelado={revelado} delay={0.35} />
          )}
          {/* FIX: case-insensitive */}
          {(["coordenador","supervisor"].includes(perfilNorm)) ? (
            <Metrica valor={dados.necessidadesEmAtendimento} label="Necessidades em atendimento" cor={chart.purple} pct={Math.min(dados.necessidadesEmAtendimento * 20, 100)} revelado={revelado} delay={0.4} />
          ) : (
            <Metrica valor={turmasComResumo.length} label="Total de turmas" cor={chart.purple} pct={Math.min(turmasComResumo.length * 15, 100)} revelado={revelado} delay={0.4} />
          )}
        </div>

        <div style={{ padding: "8px 24px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>Suas turmas</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textMuted }}>Clique num card pra abrir o mural direto.</p>
            </div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar turma ou cliente..."
              style={{ height: 34, width: 220, borderRadius: 9, border: `1px solid ${colors.border}`, padding: "0 12px", fontSize: 12.5 }}
            />
          </div>

          {clientes.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {clientes.map((c) => (
                <span
                  key={c}
                  onClick={() => setFiltroCliente(c)}
                  style={{
                    padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: filtroCliente === c ? colors.navy : "#fff",
                    color: filtroCliente === c ? "#fff" : colors.textSecondary,
                    border: `1px solid ${filtroCliente === c ? colors.navy : colors.border}`,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando...</p>}
          {!loading && turmasFiltradas.length === 0 && (
            <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma turma encontrada.</p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {turmasFiltradas.map((t) => {
              const cor = corDoCliente(t.cliente);
              const status = t.resumo?.status_turma || "—";
              // FIX #1: campo correto é taxa_presenca (taxa_presenca_pessoas não existe)
              const taxa = t.resumo?.taxa_presenca ?? null;
              const corStatus = status === "Chamada pendente" ? colors.warning : status === "Em andamento" ? colors.success : status === "Concluída" ? colors.success : colors.textMuted;
              return (
                <a key={t.id} href={`/turma/${t.id}/mural`} style={{ textDecoration: "none", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 16, display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: cor.bg, color: cor.text }}>{t.cliente || "—"}</span>
                  </div>
                  <p style={{ margin: "0 0 4px", fontSize: 14.5, fontWeight: 700, color: colors.textPrimary }}>{t.tema}</p>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.textSecondary }}>👤 {t.instrutor || "-"}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: corStatus }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: corStatus }} />
                    {status}{taxa != null ? ` · ${taxa}%` : ""}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

// Bloco "Meu Dia" do instrutor/treinando: turma(s) que precisam de ação
// agora, com botão direto pra chamada (sem passar pela lista de Presenças) e
// um segundo botão pra ver o cronograma de quem já está em andamento.
// Melhoria: estendido pro treinando (somenteLeitura=true) — mesma leitura de
// status, sem o botão "Fazer chamada" (ação exclusiva do instrutor) — e
// ganhou uma seção "Próximas turmas", que fazia parte da ideia original de
// "Meu Dia" (Hoje / Próximas turmas / Pendências / Calendário) mas nunca foi
// construída. "Calendário" continua fora daqui — é uma tela própria, não um
// bloco a mais nesta página.
function MeuDia({ pendentes, emAndamento, proximas = [], somenteLeitura = false, revelado = true }) {
  const semNadaPendente = pendentes.length === 0 && emAndamento.length === 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: "0 0 10px", fontSize: 10.5, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".08em" }}>
        Meu dia
      </p>

      {semNadaPendente && (
        <div className={revelado ? "ini-pop" : undefined} style={{ background: colors.successLight, border: `1px solid #86efac`, borderRadius: radius.md, padding: "14px 16px", fontSize: 13.5, color: colors.successText, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ fontSize: 16 }}>✓</span>
          Nenhuma chamada pendente agora — tudo em dia.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pendentes.map((t) => (
          <div key={`pendente-${t.id}`} style={meuDiaCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className={revelado ? "ini-pulsing" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: colors.warning, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.tema}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.warningText, fontWeight: 600 }}>{t.cliente} · chamada pendente</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <a href={`/turma/${t.id}/cronograma`} style={meuDiaBtnSecundario}>Ver cronograma</a>
              {!somenteLeitura && <a href={`/turma/${t.id}/chamada`} style={meuDiaBtnPrimario}>Fazer chamada</a>}
            </div>
          </div>
        ))}

        {emAndamento.map((t) => (
          <div key={`andamento-${t.id}`} style={meuDiaCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.success, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.tema}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.successText, fontWeight: 600 }}>{t.cliente} · em andamento</p>
              </div>
            </div>
            <a href={`/turma/${t.id}/cronograma`} style={meuDiaBtnSecundario}>Ver cronograma</a>
          </div>
        ))}
      </div>

      {proximas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".08em" }}>
            Próximas turmas
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {proximas.map((t) => (
              <a key={`proxima-${t.id}`} href={`/turma/${t.id}/mural`} style={{ ...meuDiaCard, textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.textSecondary, flexShrink: 0, minWidth: 34 }}>
                    {formatarDataCurta(t.data)}
                  </span>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: colors.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.tema} <span style={{ color: colors.textMuted, fontWeight: 500 }}>· {t.cliente}</span>
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const meuDiaCard = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: "12px 14px",
};

const meuDiaBtnPrimario = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  borderRadius: radius.sm,
  background: colors.accent,
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const meuDiaBtnSecundario = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  borderRadius: radius.sm,
  background: "#fff",
  border: `1px solid ${colors.border}`,
  color: colors.textSecondary,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

function Metrica({ valor, label, cor, pct, sub, revelado = true, delay = 0 }) {
  const alvo = Math.min(pct, 100);
  return (
    <div>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: colors.textPrimary, letterSpacing: "-.01em" }}>{valor}</p>
      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{label}</p>
      {sub && (
        <p style={{ margin: "1px 0 0", fontSize: 10.5, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </p>
      )}
      <div style={{ height: 4, borderRadius: 999, background: colors.border, marginTop: 8, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: revelado ? `${alvo}%` : "0%",
            background: cor,
            transition: `width 1.1s cubic-bezier(.22,1,.36,1) ${delay}s`,
          }}
        />
      </div>
    </div>
  );
}
