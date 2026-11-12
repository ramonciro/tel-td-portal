"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import NuspRelatorio from "../../../../components/NuspRelatorio";

// Impressão do relatório mensal do Núcleo — fora do PortalShell, para imprimir / "Salvar como PDF" no navegador
// (mesmo caminho das outras páginas de impressão do portal). Endereço: /nusp/relatorio-mensal/impressao?mes=AAAA-MM
// Como o login fica no navegador, quem abre precisa estar logado no Portal.

const CSS = `
  body { margin: 0; background: #f1f5f9; }
  .pagina { max-width: 980px; margin: 0 auto; padding: 16px; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .barra { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; font-size: 13px; color: #475569; }
  .barra button { height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: #1d4ed8; color: #fff; font-weight: 800; cursor: pointer; }
  .folha { background: #fff; padding: 22px 26px; border-radius: 8px; }
  .titulo { margin: 0; font-size: 20px; font-weight: 800; }
  .sub { margin: 2px 0 14px; font-size: 13px; color: #475569; }
  .rel-secao, .rel-cartao { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    body { background: #fff; }
    .pagina { max-width: none; padding: 0; }
    .barra { display: none; }
    .folha { padding: 0; border-radius: 0; }
  }
`;

export default function ImpressaoRelatorioMensalPage() {
  const [mes, setMes] = useState(null);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mes") || "";
    setMes(/^\d{4}-\d{2}$/.test(m) ? m : "");
  }, []);
  useEffect(() => {
    if (mes === null) return;
    apiFetch(`/nusp/relatorio-mensal${mes ? `?mes=${mes}` : ""}`)
      .then(setR)
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [mes]);

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
            <h1 className="titulo">Núcleo de Saúde Psicossocial</h1>
            <p className="sub">Relatório mensal · {r.rotulo}</p>
            <NuspRelatorio r={r} />
          </>
        ) : null}
      </div>
    </div>
  );
}
