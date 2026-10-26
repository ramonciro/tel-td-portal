"use client";

import { useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";
import { GRAV, fmtData, Kpi, alerta, ok, caixa, tabela, th, td, mini, vazio, badgePeq } from "./ui";

// Radar, aba "Carga futura" (Pacote 2, 26/10/2026).
// Horas planejadas dos instrutores nos próximos 4 meses contra a capacidade, semanas de pico e ocupação das salas.

const STATUS = {
  sobrecarga: { texto: "Sobrecarga", cor: colors.dangerText, bg: colors.dangerLight },
  atencao: { texto: "Atenção", cor: colors.warningText, bg: colors.warningLight },
  saudavel: { texto: "Saudável", cor: colors.successText, bg: colors.successLight },
  ocioso: { texto: "Ocioso", cor: colors.textSecondary, bg: colors.neutralLight },
  sem_capacidade: { texto: "Sem meta", cor: colors.textMuted, bg: colors.neutralLight },
};
const SALA = {
  saturada: { texto: "Saturada", cor: colors.dangerText, bg: colors.dangerLight },
  alta: { texto: "Alta", cor: colors.warningText, bg: colors.warningLight },
  normal: { texto: "Normal", cor: colors.successText, bg: colors.successLight },
  ociosa: { texto: "Ociosa", cor: colors.textSecondary, bg: colors.neutralLight },
};

function Selo({ mapa, chave }) {
  const s = mapa[chave] || mapa.normal || STATUS.sem_capacidade;
  return <span style={{ ...badgePeq, color: s.cor, background: s.bg }}>{s.texto}</span>;
}

function Semanas({ semanas, limite }) {
  if (!semanas?.length) return null;
  const max = Math.max(limite * 1.2, ...semanas.map((s) => s.horas), 1);
  return (
    <div role="img" aria-label="Horas planejadas por semana, para toda a equipe" style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150, position: "relative", paddingTop: 8 }}>
      {semanas.map((s) => {
        const h = Math.round((s.horas / max) * 120);
        return (
          <div key={s.inicio} title={`Semana de ${fmtData(s.inicio)}: ${s.horas}h`} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: colors.textSecondary }}>{s.horas ? `${s.horas}h` : ""}</span>
            <div style={{ width: "100%", height: Math.max(h, s.horas ? 2 : 0), background: colors.primary, borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: 10, color: colors.textMuted }}>{fmtData(s.inicio).slice(0, 5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CargaFutura() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    apiFetch("/preventivo/carga-futura")
      .then((r) => { if (vivo) { setD(r); setErro(""); } })
      .catch((e) => { if (vivo) setErro(e.message || "Não foi possível carregar a carga futura."); });
    return () => { vivo = false; };
  }, []);

  if (erro) return <div style={alerta}>{erro}</div>;
  if (!d) return <p style={vazio}>Carregando…</p>;

  const r = d.resumo;
  const proprias = !!d.so_proprias;
  const tudoCerto = !proprias && !r.alertas && !r.horas_sem_instrutor;
  const picos = (d.instrutores || []).filter((i) => i.semanas_pico?.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {tudoCerto && <div style={ok}>Carga dos próximos 4 meses equilibrada: nenhum instrutor fora da faixa saudável e nenhuma sala saturada.</div>}

      {!proprias && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi rotulo="Instrutores em sobrecarga" valor={r.instrutores_sobrecarga} cor={r.instrutores_sobrecarga ? colors.dangerText : undefined} nota={`de ${r.instrutores} com carga`} />
          <Kpi rotulo="Semanas acima do limite" valor={r.instrutores_semana_pico} cor={r.instrutores_semana_pico ? colors.warningText : undefined} nota={`limite ${d.limite_semana_horas}h por semana`} />
          <Kpi rotulo="Horas sem instrutor" valor={`${r.horas_sem_instrutor}h`} cor={r.horas_sem_instrutor ? colors.dangerText : undefined} nota={`${r.turmas_sem_instrutor} turma(s)`} />
          <Kpi rotulo="Instrutores ociosos" valor={r.instrutores_ociosos} nota="abaixo de 40% da meta" />
          <Kpi rotulo="Salas saturadas (30 dias)" valor={r.salas_saturadas} cor={r.salas_saturadas ? colors.dangerText : undefined} />
        </div>
      )}

      <SectionCard
        title={proprias ? "Sua carga planejada" : "Carga dos instrutores"}
        subtitle="Horas de aula planejadas por mês contra a meta mensal cadastrada na capacidade (sem meta, mostra só as horas). Instrutor adicional de TBT conta as horas cheias."
      >
        {!d.instrutores?.length ? <p style={vazio}>Nenhuma aula planejada para os próximos 4 meses.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>
                  <th style={th}>Instrutor</th>
                  {d.meses.map((m) => <th key={m.rotulo} style={th}>{m.rotulo}</th>)}
                  <th style={th}>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {d.instrutores.map((i) => {
                  const g = GRAV[i.gravidade];
                  return (
                    <tr key={i.instrutor}>
                      <td style={td}>
                        <strong>{i.instrutor}</strong>
                        {i.fora_do_time && <div style={mini}>fora do time (sem cadastro ativo)</div>}
                      </td>
                      {i.meses.map((m) => (
                        <td key={m.rotulo} style={td}>
                          <div style={{ fontWeight: 700 }}>{m.horas_planejadas}h{m.meta_horas ? <span style={{ ...mini, fontWeight: 400 }}> / {m.meta_horas}h</span> : null}</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                            {m.ocupacao_pct !== null && m.ocupacao_pct !== undefined && <span style={mini}>{Math.round(m.ocupacao_pct)}%</span>}
                            {m.status !== "sem_capacidade" ? <Selo mapa={STATUS} chave={m.status} /> : null}
                          </div>
                        </td>
                      ))}
                      <td style={td}>
                        {g ? <span style={{ ...badgePeq, color: g.cor, background: g.bg }}>{g.texto}</span> : <span style={mini}>—</span>}
                        {i.motivos?.map((t) => <div key={t} style={mini}>{t}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {!proprias && (
        <SectionCard
          title="Semanas de pico"
          subtitle={`Horas planejadas por semana somando toda a equipe (próximas ${d.time_semanas?.length || 13} semanas). Cada instrutor tem limite de ${d.limite_semana_horas}h por semana (${d.horas_dia}h por dia útil).`}
        >
          <Semanas semanas={d.time_semanas} limite={d.limite_semana_horas} />
          {picos.length > 0 && (
            <div style={{ ...caixa, marginTop: 14 }}>
              <strong style={{ fontSize: 14 }}>Instrutores acima do limite semanal</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
                {picos.map((i) => (
                  <li key={i.instrutor}>
                    {i.instrutor}: {i.semanas_pico.map((s) => `semana de ${fmtData(s.inicio)} (${s.horas}h)`).join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {!proprias && d.salas && (
        <SectionCard
          title="Ocupação das salas"
          subtitle="Dias úteis com aula ÷ dias úteis da janela, contando todos os clientes (a sala é compartilhada). Saturada a partir de 85%, alta a partir de 65%, ociosa abaixo de 15%."
        >
          {!d.salas.length ? <p style={vazio}>Nenhuma sala com uso nos próximos 90 dias.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Sala</th>
                    <th style={th}>30 dias</th>
                    <th style={th}>60 dias</th>
                    <th style={th}>90 dias</th>
                  </tr>
                </thead>
                <tbody>
                  {d.salas.map((s) => (
                    <tr key={s.id}>
                      <td style={td}>
                        <strong>{s.nome}</strong>
                        <div style={mini}>{[s.grupo, s.capacidade ? `${s.capacidade} lugares` : null, s.ativa === false ? "inativa" : null].filter(Boolean).join(" · ")}</div>
                      </td>
                      {s.janelas.map((j) => (
                        <td key={j.dias} style={td}>
                          <div style={{ fontWeight: 700 }}>{Math.round(j.ocupacao_pct)}%</div>
                          <div style={mini}>{j.dias_com_uso} de {j.dias_uteis} dias · {j.horas_uso}h · {j.turmas} turma(s)</div>
                          <div style={{ marginTop: 3 }}><Selo mapa={SALA} chave={j.status} /></div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
