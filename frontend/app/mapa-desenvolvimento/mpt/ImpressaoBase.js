"use client";

// Base comum das duas impressões da Comprovação MPT (dossiê e extrato individual), Pacote 2, 04/11/2026.
// Ficam fora do PortalShell para imprimir / "Salvar como PDF" no navegador (mesmo caminho da lista de presença
// da jornada). Quem abre precisa estar logado como Metodologia: os dados vêm de /api/mpt/pessoas, que é só dela.
// O CPF nunca chega aqui.

export const LOGO = "/logo-td.png";
export const fmtH = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
export const dataBR = (iso) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
export const agoraBahia = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });

// Lê o recorte pedido na URL: período (ano ou de/ate) e filtros.
export function lerParametros() {
  const q = new URLSearchParams(window.location.search);
  const get = (k) => (q.get(k) || "").trim();
  const periodo = get("de") && get("ate") ? { de: get("de"), ate: get("ate") } : { ano: get("ano") || String(new Date().getFullYear()) };
  return {
    periodo,
    subtipo: get("subtipo"),
    chave: get("chave"),
    cliente: get("cliente"),
    situacao: get("situacao"),
    lote: get("lote") === "1",
  };
}

export function qsApi({ periodo, subtipo, chave, cliente, situacao }) {
  const q = new URLSearchParams(periodo);
  if (subtipo) q.set("subtipo", subtipo);
  if (chave) q.set("chave", chave);
  if (cliente) q.set("cliente", cliente);
  if (situacao) q.set("situacao", situacao);
  return q.toString();
}

export const TXT_SITUACAO = { atingiu: "Atingiu a meta", abaixo: "Abaixo da meta", sem_hora: "Sem nenhuma hora", sem_meta: "Meta não definida" };

export function rotuloPeriodo(periodo) {
  return periodo && periodo.de && periodo.ate ? `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}` : "";
}

export function Cabecalho({ titulo, linhaSub }) {
  return (
    <div className="cab">
      <img src={LOGO} alt="" className="logo" onError={(e) => (e.currentTarget.style.display = "none")} />
      <div>
        <h1>{titulo}</h1>
        <div className="sub">{linhaSub}</div>
      </div>
    </div>
  );
}

export const CSS_BASE = `
  body { background: #e5e7eb; margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .pagina { padding: 16px; }
  .barra { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 0 auto 12px; max-width: 900px; font-size: 13px; color: #475569; }
  .barra button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; }
  .erro { max-width: 900px; margin: 0 auto 12px; background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; }
  .folha { background: #fff; margin: 0 auto 16px; max-width: 900px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  .cab { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .cab h1 { margin: 0; font-size: 18px; }
  .logo { height: 44px; }
  .sub { font-size: 11px; color: #475569; font-weight: 400; }
  .ficha { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 13px; margin-bottom: 12px; }
  table.grade { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.grade th, table.grade td { border: 1px solid #94a3b8; padding: 4px 5px; }
  table.grade th { background: #e2e8f0; text-align: center; }
  table.grade .nome { text-align: left; }
  table.grade .c { text-align: center; }
  table.grade tr.nao td { color: #64748b; background: #f8fafc; }
  table.grade tr.total td { background: #f1f5f9; font-weight: 700; }
  td.atingiu { background: #dcfce7; font-weight: 700; }
  td.abaixo { background: #fef3c7; font-weight: 700; }
  td.sem_hora { background: #fee2e2; font-weight: 700; }
  td.sem_meta { background: #f1f5f9; font-weight: 700; }
  h2.secao { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #94a3b8; padding-bottom: 3px; }
  .legenda { font-size: 10.5px; color: #334155; margin-top: 8px; line-height: 1.45; }
  .aviso { font-size: 11.5px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 8px 10px; border-radius: 6px; margin: 8px 0; }
  .assinaturas { display: flex; gap: 60px; margin-top: 46px; font-size: 12px; text-align: center; }
  .assinaturas > div { flex: 1; }
  .assinaturas .linha { border-top: 1px solid #0f172a; margin-bottom: 4px; }
  @media print {
    body { background: #fff; }
    .pagina { padding: 0; }
    .barra { display: none; }
    .folha { box-shadow: none; max-width: none; padding: 0; margin: 0; }
    .folha.quebra { break-after: page; page-break-after: always; }
    .folha.quebra:last-of-type { break-after: auto; page-break-after: auto; }
    tr { page-break-inside: avoid; }
    td.atingiu, td.abaixo, td.sem_hora, td.sem_meta, table.grade th, table.grade tr.nao td, table.grade tr.total td, .aviso { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
