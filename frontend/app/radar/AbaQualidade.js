"use client";

import { useEffect, useMemo, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";
import { fmtData, Kpi, alerta, ok, tabela, th, td, mini, vazio, badgePeq, chip, chipOn } from "./ui";

// Radar, aba "Qualidade" (Pacote 4, 27/10/2026).
// NPS e presença das turmas já realizadas, por instrutor, tema e cliente, em janela de 3 turmas seguidas.

const STATUS = {
  em_queda: { texto: "Em queda", cor: colors.dangerText, bg: colors.dangerLight },
  estavel: { texto: "Estável", cor: colors.textSecondary, bg: colors.neutralLight },
  melhorando: { texto: "Melhorando", cor: colors.successText, bg: colors.successLight },
};
const FILTROS = [
  { id: "em_queda", rotulo: "Em queda" },
  { id: "melhorando", rotulo: "Melhorando" },
  { id: "estavel", rotulo: "Estáveis" },
  { id: "todos", rotulo: "Todos" },
];

function valorTxt(m, v) {
  return m === "presenca" ? `${v}%` : String(v);
}

function Serie({ g }) {
  return (
    <span style={{ fontWeight: 700, color: colors.textPrimary }}>
      {g.serie.map((s, i) => (
        <span key={s.turma_id} title={`${s.tema} (${fmtData(s.fim)})`}>
          {i ? " → " : ""}
          {valorTxt(g.metrica, s.valor)}
        </span>
      ))}
    </span>
  );
}

export default function AbaQualidade() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("em_queda");
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    let vivo = true;
    apiFetch("/preventivo/qualidade")
      .then((r) => { if (vivo) { setD(r); setErro(""); } })
      .catch((e) => { if (vivo) setErro(e.message || "Não foi possível carregar a tendência de qualidade."); });
    return () => { vivo = false; };
  }, []);

  const lista = useMemo(() => (d ? d.grupos.filter((g) => filtro === "todos" || g.status === filtro) : []), [d, filtro]);

  if (erro) return <div role="alert" style={alerta}>{erro}</div>;
  if (!d) return <p style={vazio}>Carregando…</p>;
  const r = d.resumo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Kpi rotulo="Grupos acompanhados" valor={r.grupos_avaliados} nota="instrutores, temas e clientes com 3 turmas ou mais" />
        <Kpi rotulo="Em queda" valor={r.em_queda} cor={r.em_queda ? colors.dangerText : colors.successText} nota="alertas abertos no Radar da semana" />
        <Kpi rotulo="Melhorando" valor={r.melhorando} cor={r.melhorando ? colors.successText : undefined} nota="subiram nas 3 últimas turmas" />
      </div>

      <SectionCard
        title="Tendência de NPS e presença"
        subtitle={`Olha as 3 últimas turmas encerradas de cada instrutor, tema e cliente. Entra em queda quando o valor caiu a cada turma e a queda total passou de ${r.regra.queda_nps} pontos de NPS ou de ${r.regra.queda_presenca} pontos percentuais de presença. NPS só conta com ${r.regra.min_respostas_nps} respostas ou mais por turma.`}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)} style={{ ...chip, ...(filtro === f.id ? chipOn : {}) }}>
              {f.rotulo}
            </button>
          ))}
        </div>

        {!lista.length ? (
          filtro === "em_queda" ? <p style={ok}>Nenhum instrutor, tema ou cliente com NPS ou presença em queda nas últimas 3 turmas.</p> : <p style={vazio}>Nada nesta lista.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>
                  <th style={th}>Quem</th>
                  <th style={th}>Indicador</th>
                  <th style={th}>Últimas turmas</th>
                  <th style={th}>Variação</th>
                  <th style={th}>Situação</th>
                  <th style={th}>Próxima turma</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((g, i) => {
                  const k = `${g.dimensao}|${g.cliente}|${g.nome}|${g.metrica}`;
                  const s = STATUS[g.status];
                  return [
                    <tr key={k}>
                      <td style={td}>
                        <strong>{g.nome}</strong>
                        <div style={mini}>{g.dimensao_rotulo}{g.dimensao !== "cliente" && g.cliente ? ` · ${g.cliente}` : ""}</div>
                      </td>
                      <td style={td}>{g.metrica_rotulo}</td>
                      <td style={td}>
                        <Serie g={g} />
                        <div style={mini}>{g.total_turmas} turma(s) com dado</div>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: g.variacao < 0 ? colors.dangerText : g.variacao > 0 ? colors.successText : colors.textSecondary }}>
                        {g.variacao > 0 ? "+" : ""}{g.variacao}{g.metrica === "presenca" ? " pp" : " pts"}
                      </td>
                      <td style={td}>
                        <span style={{ ...badgePeq, color: s.cor, background: s.bg }}>{s.texto}</span>
                        {g.gravidade === "alta" ? <div style={{ ...mini, color: colors.warningText, fontWeight: 700 }}>queda forte</div> : null}
                      </td>
                      <td style={td}>
                        {g.proxima_turma ? fmtData(g.proxima_turma) : "—"}
                        {g.comentarios?.length ? (
                          <div>
                            <button type="button" onClick={() => setAberto(aberto === k ? null : k)} style={{ background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                              {aberto === k ? "Ocultar comentários" : `Ver ${g.comentarios.length} comentário(s) de detratores`}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>,
                    aberto === k ? (
                      <tr key={`${k}-c`}>
                        <td style={{ ...td, background: "#f8fafc" }} colSpan={6}>
                          <strong style={{ fontSize: 13 }}>O que os detratores disseram</strong>
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: colors.textSecondary }}>
                            {g.comentarios.map((c, j) => (
                              <li key={j}>“{c.texto}” <span style={{ color: colors.textMuted }}>(nota {c.nota}, {g.dimensao === "tema" ? "" : `${c.turma}, `}{fmtData(c.fim)})</span></li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ ...mini, marginTop: 12 }}>
          Presença é a de pessoas (quem esteve presente entre quem foi chamado), só de turmas com 3 pessoas ou mais com chamada lançada. Os alertas em queda aparecem também na aba Semana, com a decisão sugerida; ali dá para marcar como resolvido ou ignorar com motivo.
        </p>
      </SectionCard>
    </div>
  );
}
