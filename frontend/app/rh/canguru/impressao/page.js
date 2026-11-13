"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import { CangaruRelatorio } from "../../../../components/CangaruUi";
import { fmtDia } from "../../../../components/RhUi";

// Impressão do resultado do Canguru — fora do PortalShell, para imprimir / "Salvar como PDF" no navegador.
// Endereço: /rh/canguru/impressao?publico=...&site=...&servico=...&de=...&ate=... (quem abre precisa estar logado no Portal).

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

export default function ImpressaoCangaruPage() {
  const [qs, setQs] = useState(null);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => { setQs(window.location.search.replace(/^\?/, "")); }, []);
  useEffect(() => {
    if (qs === null) return;
    apiFetch(`/rh/canguru/relatorio?${qs}`).then(setR).catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [qs]);

  const fa = r?.filtros_aplicados || {};
  const filtros = [fa.site ? `Site: ${r.filtros.sites.find((s) => s.valor === fa.site)?.rotulo || fa.site}` : null, fa.servico ? `Serviço: ${fa.servico}` : null, fa.de ? `de ${fmtDia(fa.de)}` : null, fa.ate ? `até ${fmtDia(fa.ate)}` : null].filter(Boolean).join(" · ");

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
            <h1 className="titulo">Projeto Canguru · Acompanhamento dos novatos</h1>
            <p className="sub">Avaliações de 30, 60 e 90 dias · Relatório para {r.publico_rotulo}{filtros ? ` · ${filtros}` : ""}</p>
            <CangaruRelatorio r={r} />
          </>
        ) : null}
      </div>
    </div>
  );
}
