"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
import { apiFetch, apiDownload } from "../../services/api";
import { colors } from "../../lib/theme";
import {
  st, Campo, Select, opcoesDe, Barras, Colunas, Badge, fmtNum, fmtHoras, fmtData, hojeISO, perfilNusp, ehOperacao,
} from "../../components/NuspUi";

const PERIODOS = [
  { value: "ano", label: "Ano até hoje" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "custom", label: "Personalizado" },
];

function calcularPeriodo(tipo, deCustom, ateCustom) {
  const hoje = hojeISO();
  const d = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (tipo === "ano") return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
  if (tipo === "custom") return { de: deCustom || `${hoje.slice(0, 4)}-01-01`, ate: ateCustom || hoje };
  const meses = tipo === "12m" ? 12 : tipo === "6m" ? 6 : 3;
  const ini = new Date(d.getFullYear(), d.getMonth() - meses, d.getDate());
  return { de: iso(ini), ate: hoje };
}

const FAROL_COR = { vermelho: colors.danger, amarelo: "#d97706", verde: colors.success };
const FAROL_TXT = { vermelho: "Atrasado", amarelo: "Vence em até 7 dias", verde: "No prazo" };

export default function PainelNucleoPage() {
  const [cad, setCad] = useState(null);
  const [periodo, setPeriodo] = useState("ano");
  const [deC, setDeC] = useState("");
  const [ateC, setAteC] = useState("");
  const [f, setF] = useState({ programa_id: "", unidade_id: "", dimensao_id: "" });
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState("");

  useEffect(() => { setPerfil(perfilNusp()); }, []);

  useEffect(() => {
    apiFetch("/nusp/cadastros").then(setCad).catch((e) => setErro(e.message));
  }, []);

  const per = useMemo(() => calcularPeriodo(periodo, deC, ateC), [periodo, deC, ateC]);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ de: per.de, ate: per.ate });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [per, f]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setDados(await apiFetch(`/nusp/painel?${qs}`));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);

  const K = dados?.kpis || {};
  const P = dados?.planos || {};
  const semDados = dados && !K.atividades && !P.total;

  const baixar = (tipo) => apiDownload(`/nusp/exportar?tipo=${tipo}&${qs}`, `nucleo-${tipo}.xlsx`).catch((e) => setErro(e.message));

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Painel consolidado">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Painel do Núcleo"
        subtitle={`Período: ${fmtData(per.de)} a ${fmtData(per.ate)} · dados agregados, sem identificação de pessoas`}
        actions={
          <>
            <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => baixar("atividades")}>Exportar atividades</button>
            <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => baixar("planos")}>Exportar planos</button>
          </>
        }
      />

      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="Período" minWidth={170}>
            <Select value={periodo} onChange={setPeriodo} opcoes={PERIODOS} vazio={null} />
          </Campo>
          {periodo === "custom" && (
            <>
              <Campo label="De" minWidth={140}><input type="date" style={st.input} value={deC} onChange={(e) => setDeC(e.target.value)} /></Campo>
              <Campo label="Até" minWidth={140}><input type="date" style={st.input} value={ateC} onChange={(e) => setAteC(e.target.value)} /></Campo>
            </>
          )}
          <Campo label="Programa" minWidth={180}>
            <Select value={f.programa_id} onChange={(v) => setF({ ...f, programa_id: v })} opcoes={opcoesDe(cad?.programas)} />
          </Campo>
          <Campo label="Unidade" minWidth={160}>
            <Select value={f.unidade_id} onChange={(v) => setF({ ...f, unidade_id: v })} opcoes={opcoesDe(cad?.unidades)} />
          </Campo>
          <Campo label="Dimensão" minWidth={220}>
            <Select value={f.dimensao_id} onChange={(v) => setF({ ...f, dimensao_id: v })} opcoes={opcoesDe(cad?.dimensoes)} />
          </Campo>
        </div>
      </div>

      {erro ? <div style={st.erro}>{erro}</div> : null}
      {carregando && !dados ? <div style={st.vazio}>Carregando…</div> : null}

      {dados && (
        <>
          {semDados && (
            <div style={{ ...st.card, marginBottom: 16, textAlign: "center", color: colors.textSecondary }}>
              Nenhuma atividade ou plano de ação neste período.
              {perfil === "coordenador_nusp" ? (
                <> Para trazer o histórico, use <Link href="/nusp/configuracoes" style={{ color: colors.primary, fontWeight: 700 }}>Cadastros e importação</Link>.</>
              ) : null}
              {ehOperacao(perfil) ? (
                <> Registre a primeira em <Link href="/nusp/atividades" style={{ color: colors.primary, fontWeight: 700 }}>Atividades</Link>.</>
              ) : null}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 16 }}>
            <StatCard title="Atividades" value={fmtNum(K.atividades)} subtitle={`${fmtNum(K.concluidas)} concluídas · ${fmtNum(K.em_andamento)} em andamento · ${fmtNum(K.planejadas)} planejadas`} accent={colors.primary} />
            <StatCard title="Horas" value={fmtHoras(K.horas)} subtitle="somadas nas atividades" accent={colors.teal || "#0f766e"} />
            <StatCard title="Pessoas alcançadas" value={fmtNum(K.pessoas_unicas)} subtitle={`${fmtNum(K.participacoes)} participações com lista`} accent={colors.info} helper={K.pessoas_sem_lista ? `+ ${fmtNum(K.pessoas_sem_lista)} do histórico sem lista nominal` : ""} />
            <StatCard title="Com evidência" value={`${fmtNum(K.pct_com_evidencia)}%`} subtitle="das atividades concluídas" accent={K.pct_com_evidencia >= 90 ? colors.success : colors.warning} />
            <StatCard title="Planos abertos" value={fmtNum(P.abertos)} subtitle={`${fmtNum(P.atrasados)} atrasados · ${fmtNum(P.vencendo_7d)} vencem em 7 dias`} accent={P.atrasados > 0 ? colors.danger : colors.success} />
            <StatCard title="Planos concluídos" value={fmtNum(P.concluidos)} subtitle={`${fmtNum(P.concluidos_no_prazo)} no prazo`} accent={colors.success} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
            <SectionCard title="Atividades por mês"><Colunas dados={dados.por_mes} /></SectionCard>
            <SectionCard title="Por programa"><Barras dados={dados.por_programa} /></SectionCard>
            <SectionCard title="Por unidade"><Barras dados={dados.por_unidade} /></SectionCard>
            <SectionCard title="Por dimensão da pesquisa"><Barras dados={dados.por_dimensao} /></SectionCard>
            <SectionCard title="Por tipo de atividade"><Barras dados={dados.por_tipo} /></SectionCard>
            <SectionCard title="Por analista"><Barras dados={dados.por_analista} /></SectionCard>
          </div>

          <SectionCard
            title="Farol dos planos de ação"
            subtitle="Planos em aberto ordenados pelo prazo: vermelho = atrasado, amarelo = vence em até 7 dias, verde = no prazo"
            action={<Link href="/nusp/planos" style={{ color: colors.primary, fontWeight: 700, fontSize: 12.5 }}>Ver todos</Link>}
          >
            {!P.farol?.length ? (
              <div style={st.vazio}>Nenhum plano em aberto.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={st.th}>Farol</th><th style={st.th}>Plano</th><th style={st.th}>Unidade</th><th style={st.th}>Dimensão</th>
                      <th style={st.th}>Responsável</th><th style={st.th}>Prazo</th><th style={st.th}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {P.farol.map((r) => (
                      <tr key={r.id}>
                        <td style={st.td}>
                          <span title={FAROL_TXT[r.farol]} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                            <span style={{ width: 11, height: 11, borderRadius: "50%", background: FAROL_COR[r.farol], display: "inline-block" }} />
                            {FAROL_TXT[r.farol]}
                          </span>
                        </td>
                        <td style={st.td}>{r.titulo}</td>
                        <td style={st.td}>{r.unidade || "—"}</td>
                        <td style={st.td}>{r.dimensao || "—"}</td>
                        <td style={st.td}>{r.responsavel || "—"}</td>
                        <td style={st.td}>{fmtData(r.prazo)}{r.dias < 0 ? <> <Badge tom="atrasado">{Math.abs(r.dias)} d de atraso</Badge></> : null}</td>
                        <td style={st.td}>{fmtNum(r.pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 14 }}>
            Este painel mostra apenas totais. Nomes e matrículas de participantes ficam restritos à coordenação e aos analistas do Núcleo.
          </p>
        </>
      )}
    </PortalShell>
  );
}
