"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import { RhRelatorio, fmtDia } from "../../../../components/RhUi";

// Impressão do relatório de clima — fora do PortalShell, para imprimir / "Salvar como PDF" no navegador.
// Endereço: /rh/cliente/impressao?id=ID (o cliente precisa estar logado; só abre pesquisas liberadas para ele).

const CSS = `
  body { margin: 0; background: #f1f5f9; }
  .pagina { max-width: 980px; margin: 0 auto; padding: 16px; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .barra { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; font-size: 13px; color: #475569; }
  .barra button { height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: #be185d; color: #fff; font-weight: 800; cursor: pointer; }
  .folha { background: #fff; padding: 22px 26px; border-radius: 8px; }
  .titulo { margin: 0; font-size: 20px; font-weight: 800; }
  .sub { margin: 2px 0 14px; font-size: 13px; color: #475569; }
  .rel-secao, .rel-cartao { break-inside: avoid; page-break-inside: avoid; }
  table { font-size: 12px; }
  .rel-secao table { min-width: 0 !important; }
  .rel-secao div { overflow: visible !important; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pagina { max-width: none; padding: 0; }
    .barra { display: none; }
    .folha { padding: 0; border-radius: 0; }
  }
`;

export default function ImpressaoClienteRhPage() {
  const [qs, setQs] = useState(null);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ciclo = p.get("id");
    setQs(ciclo && /^\d+$/.test(ciclo) ? { ciclo } : { ciclo: "" });
  }, []);
  useEffect(() => {
    if (!qs) return;
    if (!qs.ciclo) { setErro("Pesquisa não informada. Abra o relatório por Minhas pesquisas."); return; }
    apiFetch(`/rh/cliente/ciclos/${qs.ciclo}/relatorio`)
      .then(setR)
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [qs]);

  return (
    <div className="pagina">
      <style>{CSS}</style>
      <style>{"@page { size: A4 portrait; margin: 12mm; }"}</style>
      <div className="barra">
        <button type="button" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>Na janela de impressão, escolha “Salvar como PDF” para guardar o arquivo.</span>
      </div>
      <div className="folha">
        {erro ? <p style={{ color: "#b91c1c", fontWeight: 700 }}>{erro}</p> : null}
        {!r && !erro ? <p>Montando o relatório…</p> : null}
        {r ? (
          <>
            <h1 className="titulo">Pesquisa de clima organizacional · {r.ciclo.nome}</h1>
            <p className="sub">{r.ciclo.cliente ? `${r.ciclo.cliente} · ` : ""}Respostas de {fmtDia(r.ciclo.data_ini)} a {fmtDia(r.ciclo.data_fim)}</p>
            <RhRelatorio r={r} />
          </>
        ) : null}
      </div>
    </div>
  );
}
