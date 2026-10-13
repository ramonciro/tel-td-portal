"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../../services/api";
import { formatDateBR } from "../../../../../lib/date";

// Impressão da presença da jornada (Fase 1, 13/10/2026) — fora do PortalShell,
// para imprimir / "Salvar como PDF" no navegador (mesmo caminho da Oficina).
//   /mapa-desenvolvimento/presenca/impressao/<jornadaId>                    → lista de presença da jornada (paisagem)
//   /mapa-desenvolvimento/presenca/impressao/<jornadaId>?participante=<id>  → extrato individual (evidência MPT)
// Como o login fica no navegador, quem abre precisa estar logado no Portal.

const LOGO = "/logo-td.png";
const LETRA = { presente: "P", justificado: "J", ausente: "F" };
const ROTULO = { presente: "Presente", justificado: "Justificado", ausente: "Ausente" };
const fmt = (v, c = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: c }));

export default function ImpressaoPresencaPage() {
  const params = useParams();
  const jornadaId = Array.isArray(params?.jornadaId) ? params.jornadaId[0] : params?.jornadaId;
  const [participanteId, setParticipanteId] = useState(null);
  const [pronto, setPronto] = useState(false);
  const [dados, setDados] = useState(null);
  const [extrato, setExtrato] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setParticipanteId(new URLSearchParams(window.location.search).get("participante"));
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto || !jornadaId) return;
    const caminho = participanteId ? `/jornada-presenca/participantes/${participanteId}/presenca` : `/jornada-presenca/jornadas/${jornadaId}/grade`;
    apiFetch(caminho)
      .then((d) => (participanteId ? setExtrato(d) : setDados(d)))
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [pronto, jornadaId, participanteId]);

  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });

  return (
    <div className="pagina">
      <style>{CSS}</style>
      <style>{`@page { size: A4 ${participanteId ? "portrait" : "landscape"}; margin: 12mm; }`}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>{participanteId ? "Extrato individual de presença" : "Lista de presença da jornada"} — use “Salvar como PDF” na janela de impressão.</span>
      </div>
      {erro && <div className="erro">{erro}</div>}

      {dados && (
        <div className="folha paisagem">
          <Cabecalho titulo="Lista de presença da jornada" jornada={dados.jornada} geradoEm={geradoEm} />
          <table className="grade">
            <thead>
              <tr>
                <th className="nome">Participante</th>
                {dados.encontros.map((e) => (
                  <th key={e.id} className="enc">
                    <div>{formatDateBR(e.data).slice(0, 5)}</div>
                    <div className="sub">{fmt(e.carga_horaria)} h</div>
                  </th>
                ))}
                <th>Horas</th>
                <th>Presença</th>
              </tr>
            </thead>
            <tbody>
              {dados.participantes.map((p) => (
                <tr key={p.id}>
                  <td className="nome">
                    {p.nome}
                    {p.matricula ? <span className="sub"> · {p.matricula}</span> : null}
                  </td>
                  {dados.encontros.map((e) => {
                    const s = dados.presencas[`${e.id}:${p.id}`];
                    return (
                      <td key={e.id} className={`c ${s || ""}`}>
                        {s ? LETRA[s] : ""}
                      </td>
                    );
                  })}
                  <td className="c">{fmt(p.totais.horas)}</td>
                  <td className="c">{p.totais.pct_presenca === null ? "—" : `${fmt(p.totais.pct_presenca)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="legenda">
            Encontros: {dados.encontros.map((e) => `${formatDateBR(e.data).slice(0, 5)} — ${e.titulo}${e.trilha_titulo ? ` [${e.trilha_titulo}${e.trilha_etapa_titulo ? ` › ${e.trilha_etapa_titulo}` : ""}]` : ""} (${fmt(e.carga_horaria)} h)`).join("  ·  ")}
          </div>
          <div className="legenda">
            P = presente · J = justificado · F = ausente · vazio = não lançado. Horas = soma da carga dos encontros em que esteve presente. % presença = presentes ÷ (presentes + ausentes); falta justificada não soma horas e fica fora do cálculo. Presença mínima: {fmt(dados.jornada.presenca_minima_pct, 0)}%.
          </div>
          <div className="assinaturas">
            <div>
              <div className="linha" />
              Metodologia / Coordenação de T&D
            </div>
          </div>
        </div>
      )}

      {extrato && (
        <div className="folha">
          <Cabecalho titulo="Extrato individual de presença" jornada={extrato.jornada} geradoEm={geradoEm} />
          <div className="ficha">
            <div>
              <b>Participante:</b> {extrato.participante.nome}
            </div>
            <div>
              <b>Matrícula:</b> {extrato.participante.matricula || "—"}
            </div>
            <div>
              <b>Cargo:</b> {extrato.participante.cargo || "—"}
            </div>
            <div>
              <b>Turma:</b> {extrato.participante.turma || "—"}
            </div>
          </div>
          <table className="grade">
            <thead>
              <tr>
                <th>Data</th>
                <th className="nome">Encontro</th>
                <th>Trilha</th>
                <th>Etapa (porto)</th>
                <th>Carga (h)</th>
                <th>Situação</th>
                <th>Horas creditadas</th>
              </tr>
            </thead>
            <tbody>
              {extrato.encontros.map((e) => (
                <tr key={e.id}>
                  <td className="c">{formatDateBR(e.data)}</td>
                  <td className="nome">{e.titulo}</td>
                  <td>
                    {e.trilha_titulo || "—"}
                    {e.trilha_etapa_titulo ? <div className="sub">Etapa: {e.trilha_etapa_titulo}</div> : null}
                  </td>
                  <td>{e.etapa_nome || "—"}</td>
                  <td className="c">{fmt(e.carga_horaria)}</td>
                  <td className={`c ${e.situacao || ""}`}>{e.situacao ? ROTULO[e.situacao] : e.realizado ? "Não lançado" : "Agendado"}</td>
                  <td className="c">{e.situacao === "presente" ? fmt(e.carga_horaria) : "0"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="nome">
                  <b>Horas realizadas</b>
                  {extrato.jornada.meta_horas ? ` (meta ${fmt(extrato.jornada.meta_horas)} h)` : ""}
                </td>
                <td className="c">
                  <b>{fmt(extrato.totais.horas)}</b>
                </td>
              </tr>
              <tr>
                <td colSpan={6} className="nome">
                  <b>Presença</b> — {extrato.totais.presentes} presente(s), {extrato.totais.justificados} justificada(s), {extrato.totais.ausentes} ausência(s)
                  {extrato.totais.pendentes ? `, ${extrato.totais.pendentes} encontro(s) sem lançamento` : ""} (mínimo {fmt(extrato.jornada.presenca_minima_pct, 0)}%)
                </td>
                <td className="c">
                  <b>{extrato.totais.pct_presenca === null ? "—" : `${fmt(extrato.totais.pct_presenca)}%`}</b>
                </td>
              </tr>
            </tfoot>
          </table>
          {extrato.por_trilha && extrato.por_trilha.some((b) => b.nivel === "etapa" || extrato.por_trilha.length > 1) && (
            <table className="grade porTrilha">
              <thead>
                <tr>
                  <th className="nome">Por trilha e etapa da trilha</th>
                  <th>Encontros</th>
                  <th>Horas</th>
                  <th>P</th>
                  <th>J</th>
                  <th>F</th>
                  <th>% presença</th>
                </tr>
              </thead>
              <tbody>
                {extrato.por_trilha.map((b) => (
                  <tr key={`${b.nivel}-${b.trilha_id ?? "sem"}-${b.trilha_etapa_id ?? 0}`} className={b.nivel === "trilha" ? "totalTrilha" : ""}>
                    <td className="nome" style={b.nivel === "etapa" ? { paddingLeft: 18 } : undefined}>
                      {b.nivel === "etapa" ? `↳ ${b.titulo}` : b.titulo}
                    </td>
                    <td className="c">{b.encontros}</td>
                    <td className="c">{fmt(b.horas)}</td>
                    <td className="c">{b.presentes}</td>
                    <td className="c">{b.justificados}</td>
                    <td className="c">{b.ausentes}</td>
                    <td className="c">{b.pct_presenca === null ? "—" : `${fmt(b.pct_presenca)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="legenda">Falta justificada não soma horas e fica fora do cálculo do percentual. Encontro sem lançamento não é contado como falta.</div>
          <div className="assinaturas">
            <div>
              <div className="linha" />
              {extrato.participante.nome}
            </div>
            <div>
              <div className="linha" />
              Metodologia / Coordenação de T&D
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cabecalho({ titulo, jornada, geradoEm }) {
  return (
    <div className="cab">
      <img src={LOGO} alt="" className="logo" onError={(e) => (e.currentTarget.style.display = "none")} />
      <div>
        <h1>{titulo}</h1>
        <div className="sub">
          {jornada.nome}
          {jornada.cliente ? ` — ${jornada.cliente}` : ""} · gerado em {geradoEm}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  body { background: #e5e7eb; margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .pagina { padding: 16px; }
  .barra { display: flex; gap: 12px; align-items: center; margin: 0 auto 12px; max-width: 1100px; font-size: 13px; color: #475569; }
  .barra button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; }
  .erro { max-width: 1100px; margin: 0 auto 12px; background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; }
  .folha { background: #fff; margin: 0 auto; max-width: 1100px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
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
  table.porTrilha { margin-top: 14px; }
  table.porTrilha tr.totalTrilha td { background: #f1f5f9; font-weight: 700; }
  table.grade th.enc { min-width: 34px; }
  td.presente { background: #dcfce7; font-weight: 700; }
  td.justificado { background: #fef3c7; font-weight: 700; }
  td.ausente { background: #fee2e2; font-weight: 700; }
  .legenda { font-size: 10.5px; color: #334155; margin-top: 8px; line-height: 1.4; }
  .assinaturas { display: flex; gap: 60px; margin-top: 46px; font-size: 12px; text-align: center; }
  .assinaturas > div { flex: 1; }
  .assinaturas .linha { border-top: 1px solid #0f172a; margin-bottom: 4px; }
  @media print {
    body { background: #fff; }
    .pagina { padding: 0; }
    .barra { display: none; }
    .folha { box-shadow: none; max-width: none; padding: 0; }
    tr { page-break-inside: avoid; }
    td.presente, td.justificado, td.ausente, table.grade th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
