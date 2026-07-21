"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, chart, corDoCliente, radius } from "../../lib/theme";

// Tiles de atalho por papel — cada papel vê só as ações que fazem sentido
// pra ele, com o número que importa já embutido, não só um ícone bonito.
function tilesPorPapel(papel, dados) {
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
    return [
      { icon: "✅", label: "Fazer chamada", sub: `${pendentes} pendente(s) hoje`, href: "/presencas", color: colors.accent },
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

  useEffect(() => {
    const u = getStoredUser();
    setUsuario(u);
    carregar(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar(u) {
    try {
      setLoading(true);
      const [treinamentosData, resumoData, necessidadesData] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/presenca-resumo").catch(() => null),
        u?.perfil === "coordenador" || u?.perfil === "supervisor"
          ? apiFetch("/necessidades").catch(() => null)
          : Promise.resolve(null),
      ]);

      const listaTreinamentos = Array.isArray(treinamentosData) ? treinamentosData : [];
      const listaResumo = Array.isArray(resumoData?.itens) ? resumoData.itens : [];

      // instrutor: só as turmas dele. treinando: turmas onde o nome dele
      // aparece no roster. coordenador/supervisor: todas.
      let minhasTurmas = listaTreinamentos;
      if (u?.perfil === "instrutor") {
        const nome = String(u?.nome || "").trim().toLowerCase();
        minhasTurmas = listaTreinamentos.filter((t) => String(t.instrutor || "").trim().toLowerCase() === nome);
      } else if (u?.perfil === "treinando") {
        const nome = String(u?.nome || "").trim().toLowerCase();
        const verificacoes = await Promise.all(
          listaTreinamentos.map(async (t) => {
            try {
              const participantes = await apiFetch(`/treinamentos/${t.id}/participantes`).catch(() => []);
              const pertence = (Array.isArray(participantes) ? participantes : []).some(
                (p) => String(p.nome || "").trim().toLowerCase() === nome
              );
              return pertence ? t : null;
            } catch {
              return null;
            }
          })
        );
        minhasTurmas = verificacoes.filter(Boolean);
      }

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
    const comTaxa = turmasComResumo.filter((t) => t.resumo && t.resumo.taxa_presenca_pessoas != null && t.resumo.total_realizado > 0);
    const presencaMedia = comTaxa.length
      ? Math.round(comTaxa.reduce((acc, t) => acc + Number(t.resumo.taxa_presenca_pessoas || t.resumo.taxa_presenca || 0), 0) / comTaxa.length)
      : null;
    const instrutores = new Set(turmasComResumo.map((t) => t.instrutor).filter(Boolean)).size;
    const necessidadesAbertas = necessidades.filter((n) => n.status_calculado === "aberta" || n.status_calculado === "atrasada").length;
    const necessidadesEmAtendimento = necessidades.filter((n) => n.status_calculado === "em_atendimento").length;

    return { pendentes, turmasAtivas, presencaMedia, instrutores, necessidadesAbertas, necessidadesEmAtendimento };
  }, [turmasComResumo, necessidades]);

  if (usuario === undefined) return null;

  const primeiroNome = String(usuario?.nome || "").split(" ")[0] || "";
  const tiles = tilesPorPapel(usuario?.perfil, dados);

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "-24px -24px 0" }}>

        {/* pulso operacional — leitura rápida do dia antes de qualquer outra coisa */}
        {turmasComResumo.length > 0 && (
          <div style={{ background: colors.navySoft, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, overflowX: "auto" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B93A7", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap", flexShrink: 0 }}>
              Pulso de hoje
            </span>
            {turmasComResumo.slice(0, 8).map((t) => {
              const status = t.resumo?.status_turma;
              const dotColor = status === "Chamada pendente" ? colors.warning : status === "Em andamento" || status === "Concluída" ? colors.success : "#465065";
              return (
                <a key={t.id} href={`/turma/${t.id}/mural`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#DCE0EA", whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  {t.tema} · {t.cliente} — {status || "sem dados"}
                </a>
              );
            })}
          </div>
        )}

        <div style={{ padding: "26px 24px 4px" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: colors.textPrimary, letterSpacing: "-.01em" }}>
            Bom te ver, {primeiroNome}.
          </h1>
          <p style={{ margin: "6px 0 20px", fontSize: 13.5, color: colors.textSecondary }}>
            {dados.pendentes > 0
              ? `${dados.pendentes} turma(s) com chamada pendente hoje. O resto está em dia.`
              : "Nenhuma chamada pendente hoje — tudo em dia."}
          </p>

          {erro && (
            <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
              {erro}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 12, marginBottom: 8 }}>
            {tiles.map((tile) => (
              <a
                key={tile.label}
                href={tile.href}
                style={{
                  display: "block", textDecoration: "none", background: "#fff",
                  border: `1px solid ${colors.border}`, borderLeft: `3px solid ${tile.color}`,
                  borderRadius: 14, padding: 16, transition: "transform .12s ease",
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
          <Metrica valor={dados.presencaMedia != null ? `${dados.presencaMedia}%` : "—"} label="Presença média" cor={colors.success} pct={dados.presencaMedia || 0} />
          <Metrica valor={dados.turmasAtivas} label="Turmas em andamento" cor={colors.accent} pct={Math.min(dados.turmasAtivas * 15, 100)} />
          <Metrica valor={dados.instrutores} label="Instrutores em campo" cor={chart.cyan} pct={Math.min(dados.instrutores * 20, 100)} />
          {(usuario?.perfil === "coordenador" || usuario?.perfil === "supervisor") ? (
            <Metrica valor={dados.necessidadesEmAtendimento} label="Necessidades em atendimento" cor={chart.purple} pct={Math.min(dados.necessidadesEmAtendimento * 20, 100)} />
          ) : (
            <Metrica valor={turmasComResumo.length} label="Total de turmas" cor={chart.purple} pct={Math.min(turmasComResumo.length * 15, 100)} />
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
              const taxa = t.resumo?.taxa_presenca_pessoas ?? t.resumo?.taxa_presenca ?? null;
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

function Metrica({ valor, label, cor, pct }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: colors.textPrimary, letterSpacing: "-.01em" }}>{valor}</p>
      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{label}</p>
      <div style={{ height: 4, borderRadius: 999, background: colors.border, marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: cor }} />
      </div>
    </div>
  );
}
