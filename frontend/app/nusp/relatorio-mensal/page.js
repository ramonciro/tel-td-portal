"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import NuspRelatorio from "../../../components/NuspRelatorio";
import { apiFetch, apiDownload } from "../../../services/api";
import { st, Campo, hojeISO } from "../../../components/NuspUi";

// Relatório mensal do Núcleo (Pacote 4): gerado na hora, quando alguém pede.
// Excel para baixar e uma página própria para imprimir / salvar em PDF.

const mesAtual = () => hojeISO().slice(0, 7);

export default function RelatorioMensalPage() {
  const [mes, setMes] = useState(mesAtual());
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    setCarregando(true);
    try { setR(await apiFetch(`/nusp/relatorio-mensal?mes=${mes}`)); setErro(""); } catch (e) { setErro(e.message); setR(null); } finally { setCarregando(false); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const claro = { ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" };
  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Relatório mensal">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Relatório mensal"
        subtitle="Escolha o mês. O relatório é montado na hora, só com números agregados, e pode ser baixado em Excel ou impresso / salvo em PDF."
        actions={
          <>
            <button type="button" style={claro} disabled={!r} onClick={() => apiDownload(`/nusp/relatorio-mensal/exportar?mes=${mes}`, `nucleo_relatorio_mensal_${mes}.xlsx`).catch((e) => setErro(e.message))}>Baixar Excel</button>
            <button type="button" style={st.btn} disabled={!r} onClick={() => window.open(`/nusp/relatorio-mensal/impressao?mes=${mes}`, "_blank", "noopener")}>Imprimir / salvar PDF</button>
          </>
        }
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={st.filtros}>
          <Campo label="Mês do relatório" minWidth={180} flex={0}>
            <input type="month" style={st.input} value={mes} max={mesAtual()} onChange={(e) => setMes(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div style={{ ...st.card }}>
        {carregando && !r ? <div style={st.vazio}>Montando o relatório…</div> : null}
        {r ? (
          <>
            <h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800 }}>Relatório de {r.rotulo}</h2>
            <NuspRelatorio r={r} />
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}
