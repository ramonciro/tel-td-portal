"use client";

// Projeto Canguru · Acompanhamento (12/11/2026): todos os novatos nos primeiros 90 dias, com as três avaliações (25º, 40º e 85º dia).
// Só a equipe do RH abre esta tela; o gestor do RH vê apenas o resultado agregado.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Paginacao, perfilRh, ehOperacaoRh, fmtN, fmtDia, pct1, COR_RH } from "../../../components/RhUi";
import { SituacaoPill, BarraDias, ChipsEtapas, Marca, OPCOES_SITUACAO } from "../../../components/CangaruUi";

const LIMITE = 50;

export default function CangaruAcompanhamentoPage() {
  const router = useRouter();
  const perfil = perfilRh();
  const operacao = ehOperacaoRh(perfil);
  const [f, setF] = useState({ site: "", servico: "", situacao: "", busca: "" });
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const temFiltro = Boolean(f.site || f.servico || f.situacao || f.busca);
  const primeira = useRef(true);

  useEffect(() => { if (perfil && !operacao) router.replace("/rh/canguru/resultado"); }, [perfil, operacao, router]);

  const carregar = useCallback(() => {
    if (!operacao) return;
    setCarregando(true); setErro("");
    const q = new URLSearchParams({ limite: String(LIMITE), deslocamento: String((pagina - 1) * LIMITE) });
    Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); });
    apiFetch(`/rh/canguru/acompanhamento?${q.toString()}`).then(setD).catch((e) => setErro(e.message || "Não foi possível carregar o acompanhamento.")).finally(() => setCarregando(false));
  }, [f, pagina, operacao]);
  useEffect(() => { carregar(); }, [carregar]);

  // A busca por nome espera a pessoa parar de digitar.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return undefined; }
    const t = setTimeout(() => { setF((x) => ({ ...x, busca: buscaDigitada.trim() })); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  const mudar = (campo) => (valor) => { setF((x) => ({ ...x, [campo]: valor })); setPagina(1); };
  const k = d?.kpis;
  const semDados = d && !temFiltro && d.kpis.novatos === 0;
  const max = d?.config?.dia_aval_3 ? d.config.dia_aval_3 + 5 : 90;

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Projeto Canguru" title="Acompanhamento dos novatos" subtitle="Os 90 primeiros dias: avaliações do 25º, 40º e 85º dia, o que está vencendo e quem pede ação." />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {!d && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}

      {semDados ? (
        <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nenhuma avaliação do Canguru importada ainda</h3>
          <p style={{ margin: "0 0 14px", color: colors.textSecondary, fontSize: 13.5 }}>Importe as planilhas das avaliações de 30, 60 e 90 dias para começar o acompanhamento.</p>
          <Link href="/rh/canguru/importar" style={{ ...st.btn, display: "inline-flex", alignItems: "center", textDecoration: "none", background: COR_RH }}>Importar avaliações</Link>
        </div>
      ) : null}

      {d && !semDados ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 16 }}>
            <StatCard title="Novatos acompanhados" value={fmtN(k.novatos)} subtitle={temFiltro ? "No filtro escolhido" : "Cargos da operação"} accent="#2563eb" />
            <StatCard title="Avaliações vencendo" value={fmtN(k.etapas_vencendo)} subtitle="Perto do prazo e ainda sem resposta" accent="#f59e0b" />
            <StatCard title="Sem resposta no prazo" value={fmtN(k.etapas_sem_resposta)} subtitle="Prazo passou e a avaliação não chegou" accent="#dc2626" />
            <StatCard title="Pontos de atenção" value={fmtN(k.pontos_de_atencao)} subtitle={`${fmtN(k.pontos_abertos)} já em tratamento`} accent="#be185d" />
            <StatCard title="Respostas no prazo" value={pct1(k.respostas_no_prazo_pct)} subtitle="Das avaliações respondidas" accent="#16a34a" />
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <div style={st.filtros}>
              <Campo label="Buscar por nome ou matrícula" flex={2} minWidth={220}><input style={st.input} value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} placeholder="Digite parte do nome ou a matrícula" /></Campo>
              <Campo label="Site" minWidth={170}><Select value={f.site} onChange={mudar("site")} vazio="Todos os sites" opcoes={(d.filtros.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
              <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={mudar("servico")} vazio="Todos os serviços" opcoes={(d.filtros.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
              <Campo label="Situação" minWidth={160}><Select value={f.situacao} onChange={mudar("situacao")} vazio="Todas" opcoes={OPCOES_SITUACAO} /></Campo>
              {temFiltro ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => { setF({ site: "", servico: "", situacao: "", busca: "" }); setBuscaDigitada(""); setPagina(1); }}>Limpar filtros</button></div> : null}
            </div>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 10px" }}>
              Cada bolinha na barra é uma avaliação (dia {d.etapas.map((e) => e.dia).join(", ")}): verde respondida, amarela vencendo, vermelha sem resposta, cinza ainda por vir.
              {d.cobranca_a_partir_de ? ` Só se cobra a resposta de quem foi admitido ou avaliado a partir de ${fmtDia(d.cobranca_a_partir_de)}.` : ""}
              {" "}O novato entra aqui quando a primeira avaliação dele chega pela planilha.
            </p>

            <div style={{ overflowX: "auto", opacity: carregando ? 0.6 : 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr><th style={st.th}>Novato</th><th style={st.th}>Site · serviço</th><th style={st.th}>Admissão</th><th style={st.th}>Dia</th><th style={st.th}>Avaliações</th><th style={st.th}>Situação</th></tr>
                </thead>
                <tbody>
                  {d.novatos.map((n) => (
                    <tr key={n.id}>
                      <td style={st.td}>
                        <Link href={`/rh/canguru/novato?id=${n.id}`} style={{ color: "#9d174d", fontWeight: 800, textDecoration: "none" }}>{n.nome}</Link>
                        <div style={{ fontSize: 11.5, color: colors.textMuted }}>Matrícula {n.matricula || "—"}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                          {n.prioritario ? <Marca tom="perigo" titulo="Relato com termo de saúde ou segurança">Prioritário</Marca> : null}
                          {n.recorrente ? <Marca tom="aviso" titulo="Sinal de atenção em duas ou mais avaliações">Recorrente</Marca> : null}
                          {n.ponto_aberto ? <Marca titulo="Já existe um ponto de atenção aberto">Em tratamento</Marca> : null}
                        </div>
                      </td>
                      <td style={st.td}>{n.site_rotulo || "—"}<div style={{ fontSize: 11.5, color: colors.textMuted }}>{n.servico || "—"}</div></td>
                      <td style={st.td}>{n.data_admissao ? fmtDia(n.data_admissao) : <span style={{ color: colors.warningText, fontWeight: 700 }}>Sem data</span>}</td>
                      <td style={{ ...st.td, minWidth: 190 }}>
                        <BarraDias dia={n.dia} etapas={n.etapas} max={max} />
                        <div style={{ fontSize: 11.5, color: colors.textMuted }}>{n.dia === null || n.dia === undefined ? "—" : `Dia ${n.dia}`}</div>
                      </td>
                      <td style={st.td}><ChipsEtapas etapas={n.etapas} /></td>
                      <td style={st.td}><SituacaoPill situacao={n.situacao} /></td>
                    </tr>
                  ))}
                  {!d.novatos.length ? <tr><td colSpan={6} style={st.vazio}>Nenhum novato com esses filtros.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <Paginacao total={d.total} limite={LIMITE} pagina={pagina} onPagina={setPagina} />
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>{fmtN(d.total)} {d.total === 1 ? "novato" : "novatos"}{k.sem_admissao ? ` · ${fmtN(k.sem_admissao)} sem data de admissão (abra a ficha para informar)` : ""}.</p>
          </div>
        </>
      ) : null}
    </PortalShell>
  );
}
