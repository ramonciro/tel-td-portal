"use client";

// Apresentação (13/11/2026): escolhe o que apresentar (Clima ou Canguru), a pesquisa e o público, e abre os slides em tela cheia.
// O público muda o que aparece, igual aos relatórios: cliente sem cargo/coordenação; RH interno só para a equipe do RH.
import { useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { colors } from "../../../lib/theme";
import { st, Select, SeletorCiclo, useCiclos, perfilRh, ehOperacaoRh, COR_RH, fmtN } from "../../../components/RhUi";

export default function ApresentacaoRhPage() {
  const operacao = ehOperacaoRh(perfilRh());
  const { ciclos, cicloId, setCicloId, erro } = useCiclos();
  const [tipo, setTipo] = useState("clima");
  const [publico, setPublico] = useState("diretoria");
  const publicos = useMemo(() => [{ value: "cliente", label: "Cliente" }, { value: "diretoria", label: "Diretoria" }, ...(operacao ? [{ value: "rh", label: "RH interno" }] : [])], [operacao]);
  const ciclo = ciclos?.find((c) => String(c.id) === String(cicloId));
  const podeAbrir = tipo === "canguru" || Boolean(cicloId);
  const abrir = () => window.open(`/rh/apresentacao/exibir?tipo=${tipo}&publico=${publico}${tipo === "clima" ? `&ciclo=${cicloId}` : ""}`, "_blank", "noopener");

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Apresentação" subtitle="Slides prontos a partir dos mesmos números dos relatórios, para reunião com cliente ou diretoria." />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>O que apresentar</h3>
        <div style={st.filtros}>
          <div style={{ minWidth: 220 }}><label style={st.label}>Assunto</label><Select value={tipo} onChange={setTipo} vazio={null} opcoes={[{ value: "clima", label: "Pesquisa de clima" }, { value: "canguru", label: "Projeto Canguru" }]} /></div>
          {tipo === "clima" && ciclos?.length ? <SeletorCiclo ciclos={ciclos} valor={cicloId} onChange={setCicloId} /> : null}
          <div style={{ minWidth: 200 }}><label style={st.label}>Para quem</label><Select value={publico} onChange={setPublico} vazio={null} opcoes={publicos} /></div>
        </div>
        {tipo === "clima" && ciclos && !ciclos.length ? <p style={st.vazio}>Nenhuma pesquisa de clima importada ainda.</p> : null}
        {tipo === "clima" && ciclo ? <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: "0 0 10px" }}>{ciclo.nome}{ciclo.cliente ? ` · ${ciclo.cliente}` : ""} · {fmtN(ciclo.n_respondentes)} respondentes</p> : null}
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 12px" }}>
          {publico === "cliente" ? "Para o cliente: sem recorte por cargo nem por coordenação, sem nomes. " : publico === "diretoria" ? "Para a diretoria: sem nomes e sem relatos individuais. " : "RH interno: inclui o que só o RH vê. Não apresente fora do RH. "}
          Grupos com poucas pessoas nunca aparecem.
        </p>
        <button type="button" style={{ ...st.btn, background: COR_RH, opacity: podeAbrir ? 1 : 0.5 }} disabled={!podeAbrir} onClick={abrir}>Abrir apresentação</button>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "12px 0 0" }}>Na apresentação: setas do teclado passam os slides, F abre a tela cheia, e “Salvar PDF” gera um arquivo com um slide por página em paisagem.</p>
      </div>
    </PortalShell>
  );
}
