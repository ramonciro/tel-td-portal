"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../services/api";
import { formatDateBR } from "../../../lib/date";

// Impressão da presença da turma (Treinamentos, 13/10/2026) — fora do
// PortalShell, para imprimir / "Salvar como PDF" no navegador (mesmo caminho
// das jornadas e da Oficina). Endereços:
//   /presenca-turma/impressao?turma=<id>&modo=preenchida                    → lista preenchida (paisagem)
//   /presenca-turma/impressao?turma=<id>&modo=branco                        → lista em branco, todas as aulas (paisagem)
//   /presenca-turma/impressao?turma=<id>&modo=branco&aula=<id>              → lista em branco de uma aula, com assinatura
//   /presenca-turma/impressao?turma=<id>&modo=relatorio                     → relatório da turma para o cliente
//   /presenca-turma/impressao?turma=<id>&modo=extrato&participante=<id>     → extrato individual (evidência)
// Como o login fica no navegador, quem abre precisa estar logado no Portal.

const LOGO = "/logo-td.png";
const LETRA = { presente: "P", justificado: "J", ausente: "F" };
const ROTULO = { presente: "Presente", justificado: "Justificado", ausente: "Ausente" };
const FAROL_TXT = { verde: "Dentro do mínimo", vermelho: "Abaixo do mínimo", cinza: "Sem dados" };
const fmt = (v, c = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: c }));

export default function ImpressaoPresencaTurmaPage() {
  const [p, setP] = useState(null);
  const [dados, setDados] = useState(null);
  const [extrato, setExtrato] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setP({ turma: q.get("turma"), modo: q.get("modo") || "preenchida", aula: q.get("aula"), participante: q.get("participante") });
  }, []);

  useEffect(() => {
    if (!p || !p.turma) return;
    const caminho = p.modo === "extrato" && p.participante ? `/turma-presenca/turmas/${p.turma}/participantes/${p.participante}/extrato` : `/turma-presenca/turmas/${p.turma}/grade`;
    apiFetch(caminho)
      .then((d) => (p.modo === "extrato" && p.participante ? setExtrato(d) : setDados(d)))
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [p]);

  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });
  const modo = p?.modo;
  const umaAula = modo === "branco" && p?.aula;
  const retrato = modo === "extrato" || modo === "relatorio" || umaAula;
  const titulos = {
    preenchida: "Lista de presença da turma",
    branco: umaAula ? "Lista de presença da aula" : "Lista de presença da turma (para assinatura)",
    relatorio: "Relatório de presença da turma",
    extrato: "Extrato individual de presença",
  };

  return (
    <div className="pagina">
      <style>{CSS}</style>
      <style>{`@page { size: A4 ${retrato ? "portrait" : "landscape"}; margin: 12mm; }`}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>{titulos[modo] || "Presença da turma"} — use “Salvar como PDF” na janela de impressão.</span>
      </div>
      {erro && <div className="erro">{erro}</div>}

      {dados && (modo === "preenchida" || (modo === "branco" && !umaAula)) && <ListaGrade dados={dados} vazia={modo === "branco"} titulo={titulos[modo]} geradoEm={geradoEm} />}
      {dados && umaAula && <ListaDaAula dados={dados} aulaId={Number(p.aula)} titulo={titulos.branco} geradoEm={geradoEm} />}
      {dados && modo === "relatorio" && <Relatorio dados={dados} titulo={titulos.relatorio} geradoEm={geradoEm} />}
      {extrato && <Extrato extrato={extrato} titulo={titulos.extrato} geradoEm={geradoEm} />}
    </div>
  );
}

function Cabecalho({ titulo, turma, geradoEm, extra }) {
  const periodo = [turma.data_inicio, turma.data_fim].filter(Boolean).map((d) => formatDateBR(d)).join(" a ");
  return (
    <div className="cab">
      <img src={LOGO} alt="" className="logo" onError={(e) => (e.currentTarget.style.display = "none")} />
      <div>
        <h1>{titulo}</h1>
        <div className="sub">
          {turma.tema}
          {turma.cliente ? ` — ${turma.cliente}` : ""}
          {turma.turma ? ` · Turma ${turma.turma}` : ""}
          {turma.instrutor ? ` · Instrutor(a): ${turma.instrutor}` : ""}
        </div>
        <div className="sub">
          {periodo ? `Período: ${periodo} · ` : ""}
          {extra ? `${extra} · ` : ""}gerado em {geradoEm}
        </div>
      </div>
    </div>
  );
}

function Assinaturas({ nome }) {
  return (
    <div className="assinaturas">
      {nome ? (
        <div>
          <div className="linha" />
          {nome}
        </div>
      ) : null}
      <div>
        <div className="linha" />
        Instrutor(a)
      </div>
      <div>
        <div className="linha" />
        Coordenação de T&D
      </div>
    </div>
  );
}

function ListaGrade({ dados, vazia, titulo, geradoEm }) {
  return (
    <div className="folha paisagem">
      <Cabecalho titulo={titulo} turma={dados.turma} geradoEm={geradoEm} />
      <table className="grade">
        <thead>
          <tr>
            <th className="nome">Participante</th>
            {dados.aulas.map((a) => (
              <th key={a.id} className="enc">
                <div>{formatDateBR(a.data).slice(0, 5)}</div>
                <div className="sub">{fmt(a.carga_horaria)} h</div>
              </th>
            ))}
            {!vazia && <th>Horas</th>}
            {!vazia && <th>Presença</th>}
          </tr>
        </thead>
        <tbody>
          {dados.participantes.map((pt) => (
            <tr key={pt.id} className={vazia ? "alta" : ""}>
              <td className="nome">
                {pt.nome}
                {pt.matricula ? <span className="sub"> · {pt.matricula}</span> : null}
              </td>
              {dados.aulas.map((a) => {
                const s = vazia ? null : dados.presencas[`${a.id}:${pt.id}`];
                return (
                  <td key={a.id} className={`c ${s || ""}`}>
                    {s ? LETRA[s] : ""}
                  </td>
                );
              })}
              {!vazia && <td className="c">{fmt(pt.totais.horas)}</td>}
              {!vazia && <td className="c">{pt.totais.pct_presenca === null ? "—" : `${fmt(pt.totais.pct_presenca)}%`}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legenda">
        Aulas: {dados.aulas.map((a) => `${formatDateBR(a.data).slice(0, 5)} — ${a.titulo} (${fmt(a.carga_horaria)} h)`).join("  ·  ")}
      </div>
      {vazia ? (
        <div className="legenda">Marque P = presente · J = justificado · F = ausente, ou colha a assinatura de cada participante na aula correspondente.</div>
      ) : (
        <div className="legenda">
          P = presente · J = justificado · F = ausente · vazio = não lançado. Horas = soma da carga das aulas em que esteve presente. % presença = presentes ÷ (presentes + ausentes); falta justificada não soma horas e fica fora do cálculo. Presença mínima: {fmt(dados.turma.presenca_minima_pct, 0)}%.
          {dados.horas_estimadas ? " Carga horária por aula estimada (carga da turma dividida entre as aulas)." : ""}
        </div>
      )}
      <Assinaturas />
    </div>
  );
}

function ListaDaAula({ dados, aulaId, titulo, geradoEm }) {
  const aula = dados.aulas.find((a) => a.id === aulaId);
  if (!aula) return <div className="erro">Aula não encontrada nesta turma.</div>;
  return (
    <div className="folha">
      <Cabecalho titulo={titulo} turma={dados.turma} geradoEm={geradoEm} extra={`Aula: ${aula.titulo} — ${formatDateBR(aula.data)} (${fmt(aula.carga_horaria)} h)`} />
      <table className="grade">
        <thead>
          <tr>
            <th style={{ width: 34 }}>Nº</th>
            <th className="nome">Participante</th>
            <th>Matrícula</th>
            <th style={{ width: "38%" }}>Assinatura</th>
          </tr>
        </thead>
        <tbody>
          {dados.participantes.map((pt, i) => (
            <tr key={pt.id} className="alta">
              <td className="c">{i + 1}</td>
              <td className="nome">{pt.nome}</td>
              <td className="c">{pt.matricula || ""}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legenda">Horário: ____:____ às ____:____ · Conteúdo ministrado: ______________________________________________</div>
      <Assinaturas />
    </div>
  );
}

function Relatorio({ dados, titulo, geradoEm }) {
  const r = dados.resumo;
  const t = dados.turma;
  const abaixo = dados.participantes.filter((p) => p.totais.farol === "vermelho");
  const semLanc = dados.participantes.filter((p) => p.totais.pendentes > 0);
  return (
    <div className="folha">
      <Cabecalho titulo={titulo} turma={t} geradoEm={geradoEm} />
      <table className="grade resumo">
        <tbody>
          <tr>
            <td className="nome">Participantes</td>
            <td className="c">{r.participantes}</td>
            <td className="nome">Aulas realizadas / no cronograma</td>
            <td className="c">
              {r.aulas_realizadas} / {r.aulas}
            </td>
          </tr>
          <tr>
            <td className="nome">Carga horária do cronograma</td>
            <td className="c">{fmt(r.horas_aulas)} h</td>
            <td className="nome">Presença média</td>
            <td className="c">{r.pct_medio === null ? "—" : `${fmt(r.pct_medio)}%`}</td>
          </tr>
          <tr>
            <td className="nome">Presença mínima exigida</td>
            <td className="c">{fmt(t.presenca_minima_pct, 0)}%</td>
            <td className="nome">Abaixo do mínimo</td>
            <td className="c">{r.abaixo_do_minimo}</td>
          </tr>
        </tbody>
      </table>

      <table className="grade" style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th className="nome">Participante</th>
            <th>Matrícula</th>
            <th>Horas</th>
            <th>P</th>
            <th>J</th>
            <th>F</th>
            <th>Sem lanç.</th>
            <th>% presença</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {dados.participantes.map((pt) => (
            <tr key={pt.id}>
              <td className="nome">{pt.nome}</td>
              <td className="c">{pt.matricula || ""}</td>
              <td className="c">{fmt(pt.totais.horas)}</td>
              <td className="c">{pt.totais.presentes}</td>
              <td className="c">{pt.totais.justificados}</td>
              <td className="c">{pt.totais.ausentes}</td>
              <td className="c">{pt.totais.pendentes || ""}</td>
              <td className="c">{pt.totais.pct_presenca === null ? "—" : `${fmt(pt.totais.pct_presenca)}%`}</td>
              <td className={`c farol-${pt.totais.farol}`}>{FAROL_TXT[pt.totais.farol]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {abaixo.length > 0 && (
        <div className="legenda">
          <b>Abaixo da presença mínima ({fmt(t.presenca_minima_pct, 0)}%):</b> {abaixo.map((p) => `${p.nome} (${fmt(p.totais.pct_presenca)}%)`).join("; ")}.
        </div>
      )}
      {semLanc.length > 0 && (
        <div className="legenda">
          <b>Com aula realizada sem lançamento:</b> {semLanc.map((p) => `${p.nome} (${p.totais.pendentes})`).join("; ")}.
        </div>
      )}
      <div className="legenda">
        Horas = soma da carga das aulas em que a pessoa esteve presente. % presença = presentes ÷ (presentes + ausentes); falta justificada não soma horas e fica fora do cálculo; aula sem lançamento não conta como falta.
        {dados.horas_estimadas ? " Carga horária por aula estimada (carga da turma dividida entre as aulas)." : ""}
      </div>
      <Assinaturas />
    </div>
  );
}

function Extrato({ extrato, titulo, geradoEm }) {
  const t = extrato.totais;
  const turma = extrato.turma;
  return (
    <div className="folha">
      <Cabecalho titulo={titulo} turma={turma} geradoEm={geradoEm} />
      <div className="ficha">
        <div>
          <b>Participante:</b> {extrato.participante.nome}
        </div>
        <div>
          <b>Matrícula:</b> {extrato.participante.matricula || "—"}
        </div>
        <div>
          <b>Turma:</b> {extrato.participante.turma || turma.turma || "—"}
        </div>
        <div>
          <b>Supervisor:</b> {extrato.participante.supervisor || "—"}
        </div>
      </div>
      <table className="grade">
        <thead>
          <tr>
            <th>Data</th>
            <th className="nome">Aula</th>
            <th>Carga (h)</th>
            <th>Situação</th>
            <th className="nome">Justificativa</th>
            <th>Horas creditadas</th>
          </tr>
        </thead>
        <tbody>
          {extrato.aulas.map((a) => (
            <tr key={a.id}>
              <td className="c">{formatDateBR(a.data)}</td>
              <td className="nome">{a.titulo}</td>
              <td className="c">{fmt(a.carga_horaria)}</td>
              <td className={`c ${a.situacao || ""}`}>{a.situacao ? ROTULO[a.situacao] : a.realizada ? "Não lançado" : "Agendada"}</td>
              <td className="nome">{a.justificativa || ""}</td>
              <td className="c">{a.situacao === "presente" ? fmt(a.carga_horaria) : "0"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="nome">
              <b>Horas realizadas</b>
            </td>
            <td className="c">
              <b>{fmt(t.horas)}</b>
            </td>
          </tr>
          <tr>
            <td colSpan={5} className="nome">
              <b>Presença</b> — {t.presentes} presente(s), {t.justificados} justificada(s), {t.ausentes} ausência(s)
              {t.pendentes ? `, ${t.pendentes} aula(s) sem lançamento` : ""} (mínimo {fmt(turma.presenca_minima_pct, 0)}%)
            </td>
            <td className="c">
              <b>{t.pct_presenca === null ? "—" : `${fmt(t.pct_presenca)}%`}</b>
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="legenda">
        Falta justificada não soma horas e fica fora do cálculo do percentual. Aula sem lançamento não é contada como falta.
        {extrato.horas_estimadas ? " Carga horária por aula estimada (carga da turma dividida entre as aulas)." : ""}
      </div>
      <Assinaturas nome={extrato.participante.nome} />
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
  table.grade th.enc { min-width: 34px; }
  table.grade tr.alta td { height: 26px; }
  table.resumo td { font-size: 12px; }
  td.presente { background: #dcfce7; font-weight: 700; }
  td.justificado { background: #fef3c7; font-weight: 700; }
  td.ausente { background: #fee2e2; font-weight: 700; }
  td.farol-verde { background: #dcfce7; font-weight: 700; }
  td.farol-vermelho { background: #fee2e2; font-weight: 700; }
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
    td.presente, td.justificado, td.ausente, td.farol-verde, td.farol-vermelho, table.grade th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
