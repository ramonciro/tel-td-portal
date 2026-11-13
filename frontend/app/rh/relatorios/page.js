"use client";

// Relatórios (12/11/2026): escolhe o ciclo, para quem é o relatório, as seções e os recortes; mostra a prévia em tela,
// baixa em Excel ou abre a página de impressão (PDF). O público muda o que entra: cliente não vê cargo nem coordenação.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import RhLiberacoes from "../../../components/RhLiberacoes";
import { st, Select, SeletorCiclo, useCiclos, RhRelatorio, perfilRh, ehOperacaoRh, COR_RH, fmtN } from "../../../components/RhUi";

const SECOES = [
  { value: "resumo", label: "Resumo" },
  { value: "temas", label: "Resultado por tema" },
  { value: "afirmacoes", label: "Melhores e piores afirmações" },
  { value: "notas", label: "Notas das áreas de apoio" },
  { value: "perfil", label: "Quem respondeu" },
  { value: "recortes", label: "Recortes (tabelas por grupo)" },
];
const RECORTES_POR_PUBLICO = {
  cliente: [["servico", "Serviço"], ["tempo", "Tempo de casa"], ["faixa", "Faixa etária"], ["genero", "Gênero"]],
  diretoria: [["servico", "Serviço"], ["tempo", "Tempo de casa"], ["faixa", "Faixa etária"], ["genero", "Gênero"], ["cargo", "Cargo/posição"]],
  rh: [["servico", "Serviço"], ["tempo", "Tempo de casa"], ["faixa", "Faixa etária"], ["genero", "Gênero"], ["cargo", "Cargo/posição"], ["coordenacao", "Coordenação"]],
};

export default function RelatoriosRhPage() {
  const perfil = perfilRh();
  const operacao = ehOperacaoRh(perfil);
  const { ciclos, cicloId, setCicloId, erro: erroCiclos } = useCiclos();
  const [publico, setPublico] = useState("diretoria");
  const [secoes, setSecoes] = useState(SECOES.map((s) => s.value));
  const [recortes, setRecortes] = useState(["servico", "tempo", "faixa", "genero"]);
  const [rel, setRel] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const publicos = useMemo(() => [{ value: "cliente", label: "Cliente" }, { value: "diretoria", label: "Diretoria" }, ...(operacao ? [{ value: "rh", label: "RH interno" }] : [])], [operacao]);
  const opcoesRecorte = RECORTES_POR_PUBLICO[publico] || [];

  // Ao trocar o público, tira os recortes que ele não permite.
  useEffect(() => { setRecortes((atual) => atual.filter((r) => opcoesRecorte.some(([v]) => v === r))); setRel(null); }, [publico]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (lista, setLista, valor) => { setLista(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]); setRel(null); };
  const qs = () => new URLSearchParams({ publico, secoes: secoes.join(","), recortes: recortes.join(",") }).toString();
  const podeGerar = cicloId && secoes.length > 0 && (!secoes.includes("recortes") || recortes.length > 0);

  const gerar = async () => {
    setCarregando(true); setErro(""); setRel(null);
    try { setRel(await apiFetch(`/rh/clima/ciclos/${cicloId}/relatorio?${qs()}`)); }
    catch (e) { setErro(e.message || "Não foi possível montar o relatório."); }
    finally { setCarregando(false); }
  };
  const baixar = async () => {
    setErro("");
    try { await apiDownload(`/rh/clima/ciclos/${cicloId}/exportar?${qs()}`, `clima_${publico}_${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (e) { setErro(e.message || "Não foi possível baixar o Excel."); }
  };
  const imprimir = () => window.open(`/rh/relatorios/impressao?ciclo=${cicloId}&${qs()}`, "_blank", "noopener");

  const ciclo = ciclos?.find((c) => String(c.id) === String(cicloId));
  const caixa = (checked, onChange, rotulo) => (
    <label key={rotulo} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginRight: 16, marginBottom: 6 }}>
      <input type="checkbox" checked={checked} onChange={onChange} />{rotulo}
    </label>
  );

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Clima organizacional" title="Relatórios" subtitle={ciclo ? `${ciclo.nome}${ciclo.cliente ? ` · ${ciclo.cliente}` : ""} · ${fmtN(ciclo.n_respondentes)} respondentes` : "Monte o relatório para o cliente, a diretoria ou o RH"} />
      {erroCiclos || erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erroCiclos || erro}</div> : null}
      {ciclos && !ciclos.length ? <div style={{ ...st.card, marginTop: 16 }}><p style={st.vazio}>Nenhuma pesquisa importada. <Link href="/rh/clima" style={{ color: "#9d174d", fontWeight: 800 }}>Importar agora</Link></p></div> : null}

      {ciclos?.length ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>O que entra no relatório</h3>
          <div style={st.filtros}>
            <SeletorCiclo ciclos={ciclos} valor={cicloId} onChange={(v) => { setCicloId(v); setRel(null); }} />
            <div style={{ minWidth: 220 }}><label style={st.label}>Relatório para</label><Select value={publico} onChange={setPublico} vazio={null} opcoes={publicos} /></div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ ...st.label, marginBottom: 6 }}>Seções</div>
            {SECOES.map((s) => caixa(secoes.includes(s.value), () => alternar(secoes, setSecoes, s.value), s.label))}
          </div>
          {secoes.includes("recortes") ? (
            <div style={{ marginBottom: 6 }}>
              <div style={{ ...st.label, marginBottom: 6 }}>Recortes</div>
              {opcoesRecorte.map(([v, l]) => caixa(recortes.includes(v), () => alternar(recortes, setRecortes, v), l))}
            </div>
          ) : null}
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "4px 0 12px" }}>
            {publico === "cliente" ? "Para o cliente: sem recorte por cargo nem por coordenação." : publico === "diretoria" ? "Para a diretoria: inclui cargo, sem recorte por coordenação." : "RH interno: inclui o recorte por coordenação. Não envie para fora do RH."}
            {" "}Grupos com poucas pessoas nunca aparecem.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={{ ...st.btn, background: COR_RH, opacity: podeGerar && !carregando ? 1 : 0.5 }} disabled={!podeGerar || carregando} onClick={gerar}>{carregando ? "Montando…" : "Ver prévia em tela"}</button>
            <button type="button" style={{ ...st.btnGhost, opacity: podeGerar ? 1 : 0.5 }} disabled={!podeGerar} onClick={baixar}>Baixar Excel</button>
            <button type="button" style={{ ...st.btnGhost, opacity: podeGerar ? 1 : 0.5 }} disabled={!podeGerar} onClick={imprimir}>Imprimir / PDF</button>
          </div>
        </div>
      ) : null}

      {operacao && ciclos?.length && cicloId ? <RhLiberacoes cicloId={cicloId} cicloCliente={ciclo?.cliente} /> : null}

      {rel ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Pesquisa de clima · {rel.ciclo.nome}</h2>
          <p style={{ margin: "2px 0 8px", fontSize: 13, color: colors.textSecondary }}>{rel.ciclo.cliente ? `${rel.ciclo.cliente} · ` : ""}Relatório para {rel.publico_rotulo}</p>
          <RhRelatorio r={rel} />
        </div>
      ) : null}
    </PortalShell>
  );
}
