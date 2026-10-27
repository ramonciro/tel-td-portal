"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../services/api";

// Relatório geral da turma — tela de impressão / "Salvar como PDF" (27/10/2026).
// Fora do PortalShell, como as outras impressões. Endereço:
//   /relatorio-turma?ids=12            → uma turma
//   /relatorio-turma?ids=12,15,18      → várias turmas (capa-resumo + uma seção por turma)
// Quem abre precisa estar logado no Portal (o login fica no navegador).

const LOGO = "/logo-td.png";
const fmt = (v, c = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: c }));
const pct = (v) => (v === null || v === undefined ? "—" : `${fmt(v, 1)}%`);
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const periodo = (t) => (t.data_inicio ? (t.data_fim && t.data_fim !== t.data_inicio ? `${dataBR(t.data_inicio)} a ${dataBR(t.data_fim)}` : dataBR(t.data_inicio)) : "—");
const dataHoraBR = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR", { timeZone: "America/Bahia" });
};
const STATUS_PRES = { ausente: "Ausente", justificado: "Justificado", presente: "Presente", pendente: "Pendente" };
const CLASSE_NPS = { promotor: "Promotor", neutro: "Neutro", detrator: "Detrator" };

function Kpi({ rotulo, valor, nota }) {
  return (
    <div className="kpi">
      <div className="kpi-v">{valor}</div>
      <div className="kpi-r">{rotulo}</div>
      {nota ? <div className="kpi-n">{nota}</div> : null}
    </div>
  );
}

function Turma({ r, geradoEm, ultima }) {
  const t = r.turma, e = r.execucao, p = r.presenca, n = r.nps;
  const g = r.registros || {};
  const abaixo = r.participantes.filter((x) => x.abaixo_do_minimo).length;
  return (
    <section className={`folha${ultima ? "" : " quebra"}`}>
      <div className="cab">
        <img src={LOGO} alt="" className="logo" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />
        <div>
          <h1>Relatório geral da turma</h1>
          <div className="sub">{t.tema} · {t.cliente || "sem cliente"} · gerado em {geradoEm}</div>
        </div>
      </div>

      <div className="ficha">
        <div><b>Turma:</b> {t.tema}</div>
        <div><b>Cliente:</b> {t.cliente || "—"}</div>
        <div><b>Período:</b> {periodo(t)}{t.hora_inicio ? ` · ${t.hora_inicio}${t.hora_fim ? `–${t.hora_fim}` : ""}` : ""}</div>
        <div><b>Sala / local:</b> {t.sala || "—"}</div>
        <div><b>Instrutor(es):</b> {t.instrutores.join(", ") || "—"}</div>
        <div><b>Supervisor:</b> {t.supervisor || "—"}</div>
        <div><b>Público:</b> {t.publico || "—"}</div>
        <div><b>Subtipo:</b> {t.subtipo || "—"} · <b>Situação:</b> {t.status_turma || t.status || "—"}</div>
      </div>

      <div className="kpis">
        <Kpi rotulo="Horas aplicadas" valor={`${fmt(e.horas_aplicadas, 1)} h`} nota={`de ${fmt(e.horas_planejadas, 1)} h previstas`} />
        <Kpi rotulo="Presença" valor={pct(p.taxa_presenca_pessoas)} nota={`${p.presentes_pessoas} de ${p.presentes_pessoas + p.ausentes_pessoas} pessoas`} />
        <Kpi rotulo="Abaixo do mínimo" valor={abaixo} nota={`mínimo de ${fmt(p.minimo_pct, 0)}%`} />
        <Kpi rotulo="NPS" valor={n.nps_score === null ? "—" : fmt(n.nps_score, 0)} nota={`${n.respostas} resposta(s)`} />
        <Kpi rotulo="Média das provas" valor={fmt(r.avaliacoes.media_prova, 1)} nota={`${r.avaliacoes.com_nota} nota(s)`} />
        <Kpi rotulo="Certificados" valor={r.certificados.emitidos} />
      </div>

      <h2>Cronograma</h2>
      {r.cronograma.length ? (
        <table className="grade">
          <thead>
            <tr><th>Dia</th><th>Data</th><th className="nome">Aula</th><th>Situação</th><th>CH plan.</th><th>CH real</th><th className="nome">Instrutor</th><th className="nome">Conteúdo ministrado</th></tr>
          </thead>
          <tbody>
            {r.cronograma.map((a, i) => (
              <tr key={i}>
                <td className="c">{a.dia ?? "—"}</td>
                <td className="c">{dataBR(a.data)}</td>
                <td>{a.titulo || "—"}</td>
                <td className="c">{a.status_rotulo}{a.reprogramada && a.motivo_reprogramacao ? ` (${a.motivo_reprogramacao})` : ""}</td>
                <td className="c">{fmt(a.ch_planejada, 1)}</td>
                <td className="c">{fmt(a.ch_real, 1)}</td>
                <td>{a.instrutor || "—"}</td>
                <td>{a.conteudo || "—"}{a.observacoes ? ` — Obs.: ${a.observacoes}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Turma sem cronograma lançado.</p>}

      <h2>Participantes e presença</h2>
      {r.participantes.length ? (
        <table className="grade">
          <thead>
            <tr><th className="nome">Participante</th><th>Matrícula</th><th>Presente</th><th>Ausente</th><th>Justif.</th><th>Pend.</th><th>Frequência</th><th>Situação</th><th>Prova</th><th>Certificado</th></tr>
          </thead>
          <tbody>
            {r.participantes.map((x, i) => (
              <tr key={i}>
                <td>{x.nome}{x.fora_da_lista ? " *" : ""}</td>
                <td className="c">{x.matricula || "—"}</td>
                <td className="c">{x.dias_presentes}</td>
                <td className="c">{x.dias_ausentes}</td>
                <td className="c">{x.dias_justificados}</td>
                <td className="c">{x.dias_pendentes}</td>
                <td className="c">{pct(x.frequencia_pct)}</td>
                <td className={`c ${x.frequencia_pct === null ? "" : x.abaixo_do_minimo ? "ruim" : "bom"}`}>{x.frequencia_pct === null ? "Sem chamada" : x.abaixo_do_minimo ? "Abaixo do mínimo" : "Dentro do mínimo"}</td>
                <td className="c">{fmt(x.nota_prova, 1)}</td>
                <td className="c">{x.certificado ? dataBR(x.certificado) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Turma sem lista de participantes.</p>}
      {r.participantes.some((x) => x.fora_da_lista) ? <p className="legenda">* Aparece na chamada, mas não está na lista de participantes.</p> : null}


      {g.ocorrencias_presenca?.length ? (
        <>
          <h2>Justificativas e ocorrências de presença</h2>
          <table className="grade">
            <thead><tr><th>Data</th><th className="nome">Participante</th><th>Situação</th><th className="nome">Justificativa</th></tr></thead>
            <tbody>
              {g.ocorrencias_presenca.map((o, i) => (
                <tr key={i}><td className="c">{dataBR(o.data)}</td><td>{o.participante}</td><td className="c">{STATUS_PRES[o.status] || o.status}</td><td>{o.justificativa}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {g.diario ? (
        <>
          <h2>Diário de bordo</h2>
          {g.diario.length ? g.diario.map((d, i) => (
            <div key={i} className="registro">
              <div className="registro-cab"><b>{dataBR(d.data)}</b>{d.atualizado_por ? <span> · {d.atualizado_por}</span> : null}</div>
              <div className="registro-txt">{d.texto}</div>
            </div>
          )) : <p className="vazio">Nenhum dia com registro no diário de bordo.</p>}
        </>
      ) : null}

      {g.rotina && (g.rotina.checklist.length || g.rotina.tarefas.length || g.rotina.avaliacao_individual.length || g.rotina.atividades.length) ? (
        <>
          <h2>Rotina do instrutor</h2>
          {g.rotina.checklist.length ? (
            <>
              <div className="sub-titulo">Checklist</div>
              <table className="grade">
                <thead><tr><th>Etapa</th><th className="nome">Item</th><th>Resposta</th><th className="nome">Observação</th><th className="nome">Quem / quando</th></tr></thead>
                <tbody>
                  {g.rotina.checklist.map((c, i) => (
                    <tr key={i}><td className="c">{c.etapa}</td><td>{c.texto}</td><td className="c">{c.resposta || "—"}</td><td>{c.obs || "—"}</td><td>{c.respondido_por ? `${c.respondido_por}, ${dataHoraBR(c.respondido_em)}` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {g.rotina.tarefas.length ? (
            <>
              <div className="sub-titulo">Tarefas</div>
              <table className="grade">
                <thead><tr><th className="nome">Tarefa</th><th className="nome">O que fazer</th><th>Feita</th><th className="nome">Quem / quando</th></tr></thead>
                <tbody>
                  {g.rotina.tarefas.map((t, i) => (
                    <tr key={i}><td>{t.item}</td><td>{t.o_que_fazer || "—"}</td><td className={`c ${t.feito ? "bom" : ""}`}>{t.feito ? "Sim" : "Não"}</td><td>{t.feito ? `${t.feito_por || "—"}, ${dataHoraBR(t.feito_em)}` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {g.rotina.avaliacao_individual.length ? (
            <>
              <div className="sub-titulo">Avaliação individual</div>
              <table className="grade">
                <thead><tr><th className="nome">Participante</th><th>Pontual.</th><th>Interesse</th><th>Comport.</th><th>Quiz</th><th>Final</th><th>Média</th><th>Resultado</th><th className="nome">Observação</th></tr></thead>
                <tbody>
                  {g.rotina.avaliacao_individual.map((a, i) => (
                    <tr key={i}><td>{a.participante}</td><td className="c">{fmt(a.pontualidade, 1)}</td><td className="c">{fmt(a.interesse, 1)}</td><td className="c">{fmt(a.comportamento, 1)}</td><td className="c">{fmt(a.quiz, 1)}</td><td className="c">{fmt(a.avaliacao_final, 1)}</td><td className="c">{fmt(a.media, 1)}</td><td className="c">{a.resultado || "—"}</td><td>{a.observacao || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {g.rotina.atividades.length ? (
            <>
              <div className="sub-titulo">Atividades registradas na turma</div>
              <table className="grade">
                <thead><tr><th>Data</th><th className="nome">Atividade</th><th>Min.</th><th className="nome">Instrutor</th><th className="nome">Pessoa / tema</th><th className="nome">Observação</th></tr></thead>
                <tbody>
                  {g.rotina.atividades.map((a, i) => (
                    <tr key={i}><td className="c">{dataBR(a.data)}</td><td>{a.tipo}</td><td className="c">{fmt(a.minutos, 0)}</td><td>{a.instrutor || "—"}</td><td>{[a.pessoa, a.tema].filter(Boolean).join(" · ") || "—"}</td><td>{a.observacao || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : null}

      {g.mural?.length ? (
        <>
          <h2>Mural da turma</h2>
          {g.mural.map((m, i) => (
            <div key={i} className="registro">
              <div className="registro-cab"><b>{m.titulo}</b>{m.fixado ? " (fixado)" : ""} <span>· {m.autor || "—"}, {dataHoraBR(m.data)}</span></div>
              <div className="registro-txt">{m.conteudo}</div>
            </div>
          ))}
        </>
      ) : null}

      <h2>Avaliação do treinamento (NPS)</h2>
      {n.respostas ? (
        <>
          <p className="texto">
            {n.respostas} resposta(s){n.taxa_resposta_pct !== null ? ` (${pct(n.taxa_resposta_pct)} da turma)` : ""} · nota média {fmt(n.nota_media, 1)} · {n.promotores} promotor(es), {n.neutros} neutro(s), {n.detratores} detrator(es) · NPS {fmt(n.nps_score, 0)}.
          </p>
          {n.criterios.length ? (
            <table className="grade pequena">
              <thead><tr><th className="nome">Critério (1 a 5)</th><th>Média</th><th>Respostas</th></tr></thead>
              <tbody>{n.criterios.map((c) => <tr key={c.chave}><td>{c.rotulo}</td><td className="c">{fmt(c.media, 1)}</td><td className="c">{c.respostas}</td></tr>)}</tbody>
            </table>
          ) : null}
          {n.comentarios.length ? (
            <>
              <div className="sub-titulo">Comentários (sem identificação de quem respondeu)</div>
              <ul className="coment">
                {n.comentarios.map((c, i) => <li key={i}>“{c.texto}” <span>({CLASSE_NPS[c.classe]}, nota {c.nota})</span></li>)}
              </ul>
            </>
          ) : null}
        </>
      ) : <p className="vazio">Ainda sem respostas de NPS.</p>}
    </section>
  );
}

export default function RelatorioTurmaPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ids = (new URLSearchParams(window.location.search).get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!ids.length) { setErro("Nenhuma turma informada."); return; }
    const caminho = ids.length === 1 ? `/treinamentos/${ids[0]}/relatorio` : `/treinamentos/relatorio-lote?ids=${ids.join(",")}`;
    apiFetch(caminho)
      .then((d) => setDados(ids.length === 1 ? [d.relatorio] : d.relatorios))
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, []);

  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });
  const varias = (dados?.length || 0) > 1;

  return (
    <div className="pagina">
      <style>{CSS}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>
      <div className="barra">
        <button onClick={() => window.print()} disabled={!dados}>Imprimir / Salvar PDF</button>
        <span>Relatório geral {varias ? "das turmas" : "da turma"} — use “Salvar como PDF” na janela de impressão.</span>
      </div>
      {erro ? <div className="erro" role="alert">{erro}</div> : null}
      {!dados && !erro ? <div className="barra">Carregando…</div> : null}

      {varias ? (
        <section className="folha quebra">
          <div className="cab">
            <img src={LOGO} alt="" className="logo" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />
            <div>
              <h1>Relatório geral das turmas</h1>
              <div className="sub">{dados.length} turma(s) · gerado em {geradoEm}</div>
            </div>
          </div>
          <table className="grade">
            <thead>
              <tr><th className="nome">Turma</th><th className="nome">Cliente</th><th>Período</th><th>Horas</th><th>Pessoas</th><th>Presença</th><th>Abaixo mín.</th><th>NPS</th><th>Prova</th><th>Cert.</th></tr>
            </thead>
            <tbody>
              {dados.map((r) => (
                <tr key={r.turma.id}>
                  <td>{r.turma.tema}</td>
                  <td>{r.turma.cliente || "—"}</td>
                  <td className="c">{periodo(r.turma)}</td>
                  <td className="c">{fmt(r.execucao.horas_aplicadas, 1)}/{fmt(r.execucao.horas_planejadas, 1)}</td>
                  <td className="c">{r.presenca.confirmados}</td>
                  <td className="c">{pct(r.presenca.taxa_presenca_pessoas)}</td>
                  <td className="c">{r.participantes.filter((x) => x.abaixo_do_minimo).length}</td>
                  <td className="c">{r.nps.nps_score === null ? "—" : fmt(r.nps.nps_score, 0)}</td>
                  <td className="c">{fmt(r.avaliacoes.media_prova, 1)}</td>
                  <td className="c">{r.certificados.emitidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="legenda">Horas = aplicadas/previstas. Presença por pessoa, conforme o Dashboard. Os detalhes de cada turma seguem nas páginas seguintes.</p>
        </section>
      ) : null}

      {(dados || []).map((r, i) => <Turma key={r.turma.id} r={r} geradoEm={geradoEm} ultima={i === dados.length - 1} />)}
    </div>
  );
}

const CSS = `
  body { background: #e5e7eb; margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .pagina { padding: 16px; }
  .barra { display: flex; gap: 12px; align-items: center; margin: 0 auto 12px; max-width: 900px; font-size: 13px; color: #475569; }
  .barra button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; }
  .barra button:disabled { opacity: .5; cursor: default; }
  .erro { max-width: 900px; margin: 0 auto 12px; background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; }
  .folha { background: #fff; margin: 0 auto 16px; max-width: 900px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  .cab { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .cab h1 { margin: 0; font-size: 18px; }
  .logo { height: 44px; }
  .sub { font-size: 11px; color: #475569; font-weight: 400; }
  .ficha { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 12.5px; margin-bottom: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 6px; }
  .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; text-align: center; }
  .kpi-v { font-size: 17px; font-weight: 700; }
  .kpi-r { font-size: 10px; color: #334155; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
  .kpi-n { font-size: 10px; color: #64748b; }
  h2, .sub-titulo { break-after: avoid; page-break-after: avoid; }
  h2 { font-size: 13.5px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #94a3b8; }
  .sub-titulo { font-size: 12px; font-weight: 700; margin: 10px 0 4px; }
  table.grade { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.grade.pequena { width: 60%; margin-bottom: 6px; }
  table.grade th, table.grade td { border: 1px solid #94a3b8; padding: 3px 5px; vertical-align: top; }
  table.grade th { background: #e2e8f0; text-align: center; }
  table.grade .nome { text-align: left; }
  table.grade .c { text-align: center; }
  td.bom { background: #dcfce7; font-weight: 700; }
  td.ruim { background: #fee2e2; font-weight: 700; }
  .texto { font-size: 12px; margin: 4px 0 8px; }
  .coment { font-size: 11.5px; margin: 0; padding-left: 18px; color: #1e293b; }
  .coment li { margin-bottom: 3px; }
  .coment span { color: #64748b; }
  .registro { border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; margin-bottom: 5px; page-break-inside: avoid; break-inside: avoid; }
  .registro-cab { font-size: 11px; color: #334155; margin-bottom: 2px; }
  .registro-cab span { color: #64748b; }
  .registro-txt { font-size: 11.5px; white-space: pre-wrap; }
  .vazio { font-size: 12px; color: #64748b; margin: 4px 0; }
  .legenda { font-size: 10.5px; color: #334155; margin-top: 6px; line-height: 1.4; }
  @media print {
    html, body, .pagina { background: #fff !important; }
    .pagina { padding: 0; }
    .barra { display: none; }
    .folha { box-shadow: none; max-width: none; padding: 0; margin: 0; }
    .folha.quebra { page-break-after: always; break-after: page; }
    tr, .kpi { page-break-inside: avoid; }
    thead { display: table-header-group; }
    td.bom, td.ruim, table.grade th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
