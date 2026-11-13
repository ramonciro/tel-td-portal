"use client";

// Projeto Canguru · Resultado (12/11/2026): visão por avaliação, evolução, motivos e risco por site/serviço, com filtros.
// O público muda o que aparece: cliente e diretoria não veem relato prioritário nem nomes; o gestor do RH só vê números agregados.
// Grupos com poucos novatos nunca aparecem fora da equipe do RH.
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Campo, Select, perfilRh, ehOperacaoRh, COR_RH } from "../../../../components/RhUi";
import { CangaruRelatorio } from "../../../../components/CangaruUi";
import CangaruLiberacoes from "../../../../components/CangaruLiberacoes";

export default function CangaruResultadoPage() {
  const operacao = ehOperacaoRh(perfilRh());
  const [publico, setPublico] = useState("");
  const [f, setF] = useState({ site: "", servico: "", de: "", ate: "" });
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  // O público padrão só é definido depois de saber o perfil (o servidor também confere).
  useEffect(() => { setPublico(operacao ? "rh" : "diretoria"); }, [operacao]);

  const qs = useMemo(() => {
    const q = new URLSearchParams({ publico });
    Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); });
    return q.toString();
  }, [publico, f]);

  useEffect(() => {
    if (!publico) return;
    setCarregando(true); setErro("");
    apiFetch(`/rh/canguru/relatorio?${qs}`).then(setR).catch((e) => setErro(e.message || "Não foi possível carregar o resultado.")).finally(() => setCarregando(false));
  }, [qs, publico]);

  const baixar = async () => {
    setErro("");
    try { await apiDownload(`/rh/canguru/exportar?${qs}`, `canguru_${publico}_${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (e) { setErro(e.message || "Não foi possível baixar o Excel."); }
  };
  const imprimir = () => window.open(`/rh/canguru/impressao?${qs}`, "_blank", "noopener");

  const publicos = r?.publicos || [];
  const vazio = r && r.geral.novatos === 0;
  const filtrando = Boolean(f.site || f.servico || f.de || f.ate);

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Projeto Canguru" title="Resultado do Canguru" subtitle="O que os novatos responderam nas avaliações de 30, 60 e 90 dias, por etapa, site e serviço." />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}

      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Relatório para" minWidth={170}><Select value={publico} onChange={setPublico} vazio={null} opcoes={publicos.length ? publicos.map((p) => ({ value: p.valor, label: p.rotulo })) : [{ value: publico, label: publico === "rh" ? "RH interno" : "Diretoria" }]} /></Campo>
          <Campo label="Site" minWidth={170}><Select value={f.site} onChange={(v) => setF({ ...f, site: v })} vazio="Todos os sites" opcoes={(r?.filtros?.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
          <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={(v) => setF({ ...f, servico: v })} vazio="Todos os serviços" opcoes={(r?.filtros?.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
          <Campo label="Respostas de" minWidth={140}><input style={st.input} type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
          <Campo label="até" minWidth={140}><input style={st.input} type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
          {filtrando ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => setF({ site: "", servico: "", de: "", ate: "" })}>Limpar filtros</button></div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={{ ...st.btnGhost, opacity: r && !vazio ? 1 : 0.5 }} disabled={!r || vazio} onClick={baixar}>Baixar Excel</button>
          <button type="button" style={{ ...st.btnGhost, opacity: r && !vazio ? 1 : 0.5 }} disabled={!r || vazio} onClick={imprimir}>Imprimir / PDF</button>
        </div>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>
          {publico === "rh" ? "RH interno: inclui relatos prioritários e, no Excel, a lista nominal de novatos. Não envie para fora do RH." : "Sem nomes e sem relatos individuais. Grupos pequenos não aparecem."}
        </p>
      </div>

      <div style={{ ...st.card, marginTop: 16, opacity: carregando ? 0.6 : 1 }}>
        {!r && !erro ? <p style={st.vazio}>Carregando…</p> : null}
        {vazio ? <p style={st.vazio}>{filtrando ? "Nenhuma avaliação com esses filtros." : "Nenhuma avaliação importada ainda."}</p> : null}
        {r && !vazio ? <CangaruRelatorio r={r} /> : null}
      </div>
      {operacao ? <CangaruLiberacoes /> : null}
    </PortalShell>
  );
}
