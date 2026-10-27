"use client";

import { useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";
import { GRAV, fmtData, quando, Kpi, alerta, ok, caixa, mini, vazio, badge, badgePeq, link } from "./ui";

// Radar, aba "R&S → T&D" (Pacote 2, 26/10/2026).
// 1) Avaliações Técnicas que o R&S planejou e ainda não têm turma no T&D.
// 2) Pessoas no berço paradas há muito tempo, com as vagas abertas que poderiam aproveitá-las.

export default function DemandaRS() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    apiFetch("/preventivo/demanda-rs")
      .then((r) => { if (vivo) { setD(r); setErro(""); } })
      .catch((e) => { if (vivo) setErro(e.message || "Não foi possível carregar a demanda do R&S."); });
    return () => { vivo = false; };
  }, []);

  if (erro) return <div style={alerta}>{erro}</div>;
  if (!d) return <p style={vazio}>Carregando…</p>;

  const r = d.resumo;
  const semTurma = d.avaliacoes.filter((a) => a.situacao === "sem_turma");
  const comTurma = d.avaliacoes.filter((a) => a.situacao === "com_turma");
  const tudoCerto = !semTurma.length && !d.berco.length && !r.avaliacoes_vinculo_provavel && !r.avaliacoes_data_divergente;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {tudoCerto && <div style={ok}>Tudo em ordem: toda Avaliação Técnica planejada pelo R&S tem turma e não há pessoas paradas no berço.</div>}

      {r.rps_ocultas_produto_inativo > 0 && (
        <p style={{ ...mini, margin: 0 }}>
          {r.rps_ocultas_produto_inativo} RP(s) não aparecem porque o produto não corresponde a um cliente ativo do ambiente (menu Clientes)
          {r.produtos_ocultos?.length ? `: ${r.produtos_ocultos.join(", ")}${r.rps_ocultas_produto_inativo > r.produtos_ocultos.length ? "…" : ""}` : ""}.
          Se algum deveria aparecer, confira se o nome do cliente é igual ao do produto.
        </p>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Kpi rotulo="Avaliações Técnicas sem turma" valor={r.avaliacoes_sem_turma} cor={r.avaliacoes_sem_turma ? colors.dangerText : undefined} nota={`de ${r.avaliacoes_planejadas} planejadas (30 dias)`} />
        <Kpi rotulo="Candidatos esperados sem turma" valor={r.candidatos_sem_turma} />
        {(r.avaliacoes_vinculo_provavel > 0 || r.avaliacoes_data_divergente > 0) && (
          <Kpi rotulo="Turmas a conferir" valor={r.avaliacoes_vinculo_provavel + r.avaliacoes_data_divergente} cor={colors.warningText} nota={`${r.avaliacoes_vinculo_provavel} sem vínculo · ${r.avaliacoes_data_divergente} com data diferente`} />
        )}
        <Kpi rotulo="Pessoas no berço" valor={r.pessoas_no_berco} nota={`${r.berco_parado} RP(s) parado(s)`} cor={r.berco_parado ? colors.warningText : undefined} />
        <Kpi rotulo="Berço com vaga para reaproveitar" valor={r.berco_com_oportunidade} />
      </div>

      <SectionCard
        title="Avaliações Técnicas planejadas pelo R&S"
        subtitle="RPs em andamento, de produtos que são clientes ativos do ambiente, com Avaliação Técnica nos próximos 30 dias (ou já em curso). Quando a turma tem a RP de origem, a conferência é exata. Sem esse vínculo, procuramos uma turma de Avaliação Técnica do mesmo cliente com início até 3 dias de diferença e conferimos pelo nome (associação provável)."
      >
        {!d.avaliacoes.length ? <p style={vazio}>Nenhuma Avaliação Técnica planejada para os próximos 30 dias.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...semTurma, ...comTurma].map((a) => {
              const g = a.gravidade ? GRAV[a.gravidade] : null;
              return (
                <div key={a.rp_id} style={{ ...caixa, borderLeft: `4px solid ${g ? g.cor : (a.vinculo === "provavel" || a.data_divergente) ? colors.warning : colors.success}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{a.produto}</strong>{d.varios_ambientes && a.ambiente ? <span style={{ ...badgePeq, marginLeft: 8, color: colors.textSecondary, background: colors.neutralLight }}>{a.ambiente}</span> : null}
                      <div style={mini}>
                        {a.site} · {a.cargo}{a.chamado ? ` · chamado ${a.chamado}` : ""} · {a.candidatos_esperados} candidato(s) esperado(s)
                      </div>
                      <div style={mini}>
                        Avaliação {fmtData(a.inicio)} a {fmtData(a.final)} · {a.em_curso ? "já em curso" : `começa ${quando(a.dias_para_inicio)}`}
                      </div>
                    </div>
                    {a.situacao === "sem_turma" ? (
                      <span style={{ ...badge, color: g.cor, background: g.bg }}>Sem turma no T&D · {g.texto}</span>
                    ) : (
                      a.vinculo === "provavel"
                        ? <span style={{ ...badge, color: colors.warningText, background: colors.warningLight }}>Turma provável · vincule a RP</span>
                        : <span style={{ ...badge, color: colors.successText, background: colors.successLight }}>Turma vinculada</span>
                    )}
                  </div>
                  {a.data_divergente && (
                    <p style={{ ...mini, marginTop: 8, color: colors.warningText, fontWeight: 700 }}>
                      A turma começa {Math.abs(a.dias_diferenca)} dia(s) {a.dias_diferenca > 0 ? "depois" : "antes"} do início da avaliação na RP. Combine a data certa com o R&S.
                    </p>
                  )}
                  {a.situacao === "sem_turma" ? (
                    <p style={{ ...mini, marginTop: 8 }}>→ Criar a turma de Avaliação Técnica e avisar o instrutor antes do início.</p>
                  ) : (
                    <p style={{ ...mini, marginTop: 8 }}>
                      <a href={`/turma/${a.turma.id}`} style={{ ...link, fontSize: 13 }}>{a.turma.tema}</a> · {a.turma.cliente} · início {fmtData(a.turma.data_inicio)}
                      {a.vinculo === "provavel" && !a.turma.confere_pelo_nome ? " — o nome não parece o do produto do RP; confira se é a turma certa." : ""}
                      {a.vinculo === "provavel" ? " Em Gestão de Turmas, use \"Vincular RPs sugeridas\" para confirmar." : ""}
                      {a.turmas_vinculadas > 1 ? ` · ${a.turmas_vinculadas} turmas ligadas a esta RP.` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Berço parado"
        subtitle={`Pessoas aprovadas que continuam no berço sem serem convocadas (atenção a partir de ${d.dias_berco_atencao} dias, alta a partir de ${d.dias_berco_alta}). Quando há outra vaga aberta para o mesmo cargo, ela aparece como oportunidade de reaproveitamento.`}
      >
        {!d.berco.length ? <p style={vazio}>Nenhum berço parado.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {d.berco.map((b) => {
              const g = GRAV[b.gravidade] || GRAV.media;
              return (
                <div key={b.rp_id} style={{ ...caixa, borderLeft: `4px solid ${g.cor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{b.produto}</strong>{d.varios_ambientes && b.ambiente ? <span style={{ ...badgePeq, marginLeft: 8, color: colors.textSecondary, background: colors.neutralLight }}>{b.ambiente}</span> : null}
                      <div style={mini}>
                        {b.site} · {b.cargo}{b.chamado ? ` · chamado ${b.chamado}` : ""} · {b.saldo_berco} pessoa(s) no berço · parado há {b.dias_parado} dias (desde {fmtData(b.desde)})
                      </div>
                    </div>
                    <span style={{ ...badge, color: g.cor, background: g.bg }}>{g.texto}</span>
                  </div>
                  {b.oportunidades?.length ? (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                      {b.oportunidades.map((o) => (
                        <li key={o.rp_id} style={{ fontSize: 14 }}>
                          <span style={{ ...badgePeq, color: colors.successText, background: colors.successLight }}>Oportunidade</span>{" "}
                          {o.produto} ({o.site}{o.mesmo_site ? ", mesmo site" : ""}) com {o.vagas_abertas} vaga(s) aberta(s){o.chamado ? ` · chamado ${o.chamado}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ ...mini, marginTop: 8 }}>Nenhuma vaga aberta do mesmo cargo para reaproveitar agora.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
