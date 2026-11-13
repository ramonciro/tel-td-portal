"use client";

// Apresentação do cliente (13/11/2026): escolhe a pesquisa de clima (ou o Canguru, se liberado) e abre os slides.
// Os slides saem do mesmo relatório "para o cliente" das outras telas; dá para salvar em PDF ou baixar em PowerPoint.
import { useEffect, useState } from "react";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Select, COR_RH, fmtN, fmtDia } from "../../../../components/RhUi";

export default function ApresentacaoClientePage() {
  const [ciclos, setCiclos] = useState(null);
  const [canguru, setCanguru] = useState(false);
  const [tipo, setTipo] = useState("clima");
  const [ciclo, setCiclo] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    apiFetch("/rh/cliente/ciclos").then((r) => { setCiclos(r.ciclos || []); if (r.ciclos?.length) setCiclo(String(r.ciclos[0].id)); }).catch((e) => setErro(e.message || "Não foi possível carregar as pesquisas."));
    apiFetch("/rh/cliente/canguru").then((r) => setCanguru(Boolean(r.liberado))).catch(() => setCanguru(false));
  }, []);
  useEffect(() => { if (ciclos && !ciclos.length && canguru) setTipo("canguru"); }, [ciclos, canguru]);

  const atual = ciclos?.find((c) => String(c.id) === String(ciclo));
  const podeAbrir = tipo === "canguru" ? canguru : Boolean(ciclo);
  const assuntos = [{ value: "clima", label: "Pesquisa de clima" }, ...(canguru ? [{ value: "canguru", label: "Projeto Canguru" }] : [])];
  const abrir = () => window.open(`/rh/cliente/apresentacao/exibir?tipo=${tipo}${tipo === "clima" ? `&ciclo=${ciclo}` : ""}`, "_blank", "noopener");

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Minhas pesquisas" title="Apresentação" subtitle="Slides prontos com os resultados liberados para o seu cliente." />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {!ciclos && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
      {ciclos && !ciclos.length && !canguru ? <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}><h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nada liberado ainda</h3><p style={{ margin: 0, color: colors.textSecondary, fontSize: 13.5 }}>Quando o RH liberar um resultado, você poderá apresentá-lo aqui.</p></div> : null}
      {ciclos && (ciclos.length || canguru) ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>O que apresentar</h3>
          <div style={st.filtros}>
            <div style={{ minWidth: 220 }}><label style={st.label}>Assunto</label><Select value={tipo} onChange={setTipo} vazio={null} opcoes={assuntos} /></div>
            {tipo === "clima" && ciclos.length ? <div style={{ minWidth: 280 }}><label style={st.label}>Pesquisa</label><Select value={ciclo} onChange={setCiclo} vazio={null} opcoes={ciclos.map((c) => ({ value: String(c.id), label: c.nome }))} /></div> : null}
          </div>
          {tipo === "clima" && atual ? <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: "0 0 10px" }}>{fmtN(atual.n_respondentes)} respondentes · respostas de {fmtDia(atual.data_ini)} a {fmtDia(atual.data_fim)}</p> : null}
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 12px" }}>Grupos com poucas pessoas nunca aparecem, e não há resposta individual nem nomes.</p>
          <button type="button" style={{ ...st.btn, background: COR_RH, opacity: podeAbrir ? 1 : 0.5 }} disabled={!podeAbrir} onClick={abrir}>Abrir apresentação</button>
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "12px 0 0" }}>Na apresentação: setas do teclado passam os slides, F abre a tela cheia, “Salvar PDF” gera um slide por página e “Baixar PowerPoint” gera um arquivo .pptx editável.</p>
        </div>
      ) : null}
    </PortalShell>
  );
}
