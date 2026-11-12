"use client";

// Corpo do relatório mensal do Núcleo (Pacote 4). Usado na tela (/nusp/relatorio-mensal) e na página
// de impressão (/nusp/relatorio-mensal/impressao), para os dois mostrarem exatamente a mesma coisa.
// Só números agregados: nada aqui identifica uma pessoa.

import { colors } from "../lib/theme";
import { fmtNum, fmtHoras, fmtData } from "./NuspUi";

const CLASSIF = {
  alto: { txt: "Alto", cor: "#dc2626" },
  moderado: { txt: "Moderado", cor: "#d97706" },
  baixo: { txt: "Baixo", cor: "#16a34a" },
};
const pctTxt = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Variacao({ atual, anterior, rotulo, horas }) {
  const a = Number(atual || 0), b = Number(anterior || 0);
  const dif = Math.round((a - b) * 100) / 100;
  const f = horas ? fmtHoras : fmtNum;
  const txt = dif === 0 ? `igual a ${rotulo}` : `${dif > 0 ? "+" : "−"}${f(Math.abs(dif))} em relação a ${rotulo}`;
  return <div style={{ fontSize: 11, color: colors.textMuted }}>{txt}</div>;
}

function Cartao({ rotulo, valor, children }) {
  return (
    <div className="rel-cartao" style={{ flex: "1 1 140px", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.textSecondary }}>{rotulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: colors.textPrimary, lineHeight: 1.2 }}>{valor}</div>
      {children}
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <section className="rel-secao" style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800, color: colors.textPrimary, borderBottom: `2px solid ${colors.border}`, paddingBottom: 5 }}>{titulo}</h2>
      {children}
    </section>
  );
}

const th = { textAlign: "left", fontSize: 11, fontWeight: 800, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", borderBottom: `1px solid ${colors.border}` };
const td = { fontSize: 12.5, color: colors.textPrimary, padding: "6px 8px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const tdNum = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function TabelaAtividades({ linhas, comPessoas = true, vazio = "Nada registrado neste mês." }) {
  if (!linhas?.length) return <div style={{ fontSize: 12.5, color: colors.textMuted }}>{vazio}</div>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={th}>Nome</th><th style={{ ...th, textAlign: "right" }}>Atividades</th><th style={{ ...th, textAlign: "right" }}>Horas</th>{comPessoas ? <th style={{ ...th, textAlign: "right" }}>Pessoas</th> : null}</tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome}><td style={td}>{l.nome}</td><td style={tdNum}>{fmtNum(l.atividades)}</td><td style={tdNum}>{fmtHoras(l.horas)}</td>{comPessoas ? <td style={tdNum}>{fmtNum(l.pessoas)}</td> : null}</tr>
        ))}
      </tbody>
    </table>
  );
}

function GrupoAcolhimento({ titulo, g }) {
  if (!g) return null;
  return (
    <div style={{ flex: "1 1 260px", minWidth: 240 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: colors.textSecondary, marginBottom: 4 }}>{titulo}</div>
      {g.oculto ? <div style={{ fontSize: 12, color: colors.textMuted }}>Números pequenos demais para divulgar.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {g.linhas.map((l) => <tr key={l.nome}><td style={td}>{l.nome}</td><td style={tdNum}>{fmtNum(l.n)}</td></tr>)}
            {g.demais ? <tr><td style={{ ...td, color: colors.textMuted }}>{g.demais.nome}</td><td style={tdNum}>{fmtNum(g.demais.n)}</td></tr> : null}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function NuspRelatorio({ r }) {
  if (!r) return null;
  const A = r.atividades, P = r.planos, AC = r.acolhimentos, FC = r.fale_comigo, ant = r.mes_anterior.rotulo;
  const mesAnt = ant.split(" de ")[0];
  return (
    <div className="rel-corpo">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Cartao rotulo="Atividades no mês" valor={fmtNum(A.atividades)}><Variacao atual={A.atividades} anterior={r.anterior.atividades} rotulo={mesAnt} /></Cartao>
        <Cartao rotulo="Concluídas" valor={fmtNum(A.concluidas)}><Variacao atual={A.concluidas} anterior={r.anterior.concluidas} rotulo={mesAnt} /></Cartao>
        <Cartao rotulo="Horas" valor={fmtHoras(A.horas)}><Variacao atual={A.horas} anterior={r.anterior.horas} rotulo={mesAnt} horas /></Cartao>
        <Cartao rotulo="Pessoas que participaram" valor={fmtNum(A.pessoas_unicas)}><Variacao atual={A.pessoas_unicas} anterior={r.anterior.pessoas_unicas} rotulo={mesAnt} /></Cartao>
        <Cartao rotulo="Presenças registradas" valor={fmtNum(A.participacoes)}><Variacao atual={A.participacoes} anterior={r.anterior.participacoes} rotulo={mesAnt} /></Cartao>
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted, margin: "8px 0 0" }}>
        Contam as atividades marcadas com data no mês (as canceladas ficam de fora).
        {A.em_aberto ? ` ${fmtNum(A.em_aberto)} ${A.em_aberto === 1 ? "ainda está planejada ou em andamento" : "ainda estão planejadas ou em andamento"}.` : ""}
        {A.pessoas_sem_lista ? ` Mais ${fmtNum(A.pessoas_sem_lista)} pessoas vieram de atividades sem lista nominal e não entram na contagem de pessoas.` : ""}
      </p>

      <Secao titulo="Atividades por programa">
        <TabelaAtividades linhas={r.por_programa} />
      </Secao>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Secao titulo="Por tipo"><div style={{ minWidth: 260 }}><TabelaAtividades linhas={r.por_tipo} comPessoas={false} /></div></Secao>
        <Secao titulo="Por unidade"><div style={{ minWidth: 300 }}><TabelaAtividades linhas={r.por_unidade} /></div></Secao>
      </div>

      <Secao titulo="Evidências">
        <p style={{ fontSize: 13, margin: 0 }}>
          {A.concluidas === 0 ? "Nenhuma atividade concluída neste mês."
            : A.concluidas_sem_evidencia === 0 ? `Todas as ${fmtNum(A.concluidas)} atividades concluídas têm evidência anexada.`
              : `${fmtNum(A.concluidas_com_evidencia)} de ${fmtNum(A.concluidas)} atividades concluídas têm evidência. ${fmtNum(A.concluidas_sem_evidencia)} ${A.concluidas_sem_evidencia === 1 ? "está sem" : "estão sem"}.`}
        </p>
      </Secao>

      <Secao titulo="Planos de ação">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Cartao rotulo="Criados no mês" valor={fmtNum(P.criados)} />
          <Cartao rotulo="Concluídos no mês" valor={fmtNum(P.concluidos)} />
          <Cartao rotulo="Em aberto hoje" valor={fmtNum(P.abertos)} />
          <Cartao rotulo="Atrasados hoje" valor={fmtNum(P.atrasados)} />
        </div>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "8px 0 0" }}>Os números “hoje” mostram a situação na data em que o relatório foi gerado, porque o sistema não guarda um retrato de cada fim de mês.</p>
      </Secao>

      <Secao titulo="Acolhimentos">
        {AC.insuficiente ? (
          <p style={{ fontSize: 13, margin: 0 }}>Neste mês houve menos de {r.minimo_celula} atendimentos. O número não é divulgado, para não expor quem procurou o Núcleo.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, margin: "0 0 10px" }}>
              <strong>{fmtNum(AC.total)}</strong> atendimentos no mês
              {AC.pessoas !== null && AC.pessoas !== undefined ? <>, para <strong>{fmtNum(AC.pessoas)}</strong> pessoas</> : null}
              {AC.recorrentes ? <>; {fmtNum(AC.recorrentes)} voltaram mais de uma vez</> : null}.
            </p>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <GrupoAcolhimento titulo="Por canal" g={AC.por_canal} />
              <GrupoAcolhimento titulo="Por motivo" g={AC.por_motivo} />
              <GrupoAcolhimento titulo="Por unidade" g={AC.por_unidade} />
            </div>
            <p style={{ fontSize: 11.5, color: colors.textMuted, margin: "8px 0 0" }}>Linhas com menos de {r.minimo_celula} atendimentos são reunidas em “Demais”, para ninguém ser reconhecido.</p>
          </>
        )}
      </Secao>

      <Secao titulo="Pesquisa de riscos psicossociais">
        {!r.pesquisa ? <p style={{ fontSize: 13, margin: 0 }}>Ainda não há pesquisa com resultado calculado até este mês.</p> : (
          <>
            <p style={{ fontSize: 13, margin: "0 0 8px" }}>Último ciclo: <strong>{r.pesquisa.nome}</strong> ({r.pesquisa.ciclo}){r.pesquisa.data_referencia ? `, referência ${fmtData(r.pesquisa.data_referencia)}` : ""} · {fmtNum(r.pesquisa.total_respostas)} respostas. Resultado nacional.</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Dimensão</th><th style={{ ...th, textAlign: "right" }}>% de exposição</th><th style={th}>Classificação</th></tr></thead>
              <tbody>
                {r.pesquisa.dimensoes.map((d) => {
                  const c = CLASSIF[d.classificacao];
                  return (
                    <tr key={d.nome}>
                      <td style={td}>{d.nome}</td><td style={tdNum}>{pctTxt(d.pct)}</td>
                      <td style={td}>{c ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: c.cor }} />{c.txt}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Secao>

      <Secao titulo="Fale Comigo">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Cartao rotulo="Recebidas no mês" valor={fmtNum(FC.recebidas)} />
          <Cartao rotulo="Respondidas" valor={fmtNum(FC.respondidas)} />
          <Cartao rotulo="Em aberto hoje" valor={fmtNum(FC.em_aberto)} />
          <Cartao rotulo="Atrasadas hoje" valor={fmtNum(FC.atrasadas)} />
          <Cartao rotulo="Tempo médio de resposta" valor={FC.tempo_medio_dias_uteis === null ? "—" : `${FC.tempo_medio_dias_uteis.toLocaleString("pt-BR")} d`}><div style={{ fontSize: 11, color: colors.textMuted }}>em dias úteis</div></Cartao>
          <Cartao rotulo="Respondidas no prazo" valor={pctTxt(FC.pct_no_prazo)} />
        </div>
      </Secao>

      <p style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 22, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
        Relatório com números agregados: não traz nome, matrícula nem texto de ninguém. Gerado em {r.gerado_em}.
      </p>
    </div>
  );
}
