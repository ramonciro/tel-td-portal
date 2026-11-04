"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";

// Comprovação MPT — leitura agregada (Pacote 2, 04/11/2026) para coordenação, supervisão e superintendência.
// Mostra, por subdivisão e por operação, quantas pessoas já atingiram a meta interna de horas. SEM NOMES:
// quem vê nomes, evidências, dossiê e extratos é a Metodologia (Mapa de Desenvolvimento > Comprovação MPT).
// A meta é interna de gestão, nunca uma exigência legal. O farol é a % de pessoas que atingiram a meta e nunca
// entra em média com outro indicador. Sem meta definida, a tela diz "meta não definida".

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(Number(n || 0));
const dec = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(n || 0));
const dataBR = (iso) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

const FAROL = {
  verde: { icone: "✓", texto: "Em dia", cor: colors.successText, bg: colors.successLight },
  amarelo: { icone: "◔", texto: "Atenção", cor: colors.warningText, bg: colors.warningLight },
  vermelho: { icone: "⚠", texto: "Abaixo", cor: colors.dangerText, bg: colors.dangerLight },
  cinza: { icone: "•", texto: "Meta não definida", cor: colors.neutral, bg: colors.neutralLight },
};
const PARCIAL = { icone: "•", texto: "Período parcial", cor: colors.neutral, bg: colors.neutralLight };

function Pill({ info }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: info.cor, background: info.bg, whiteSpace: "nowrap" }}>
      <span aria-hidden="true">{info.icone}</span>
      {info.texto}
    </span>
  );
}

export default function ComprovacaoMptPage() {
  const anoAtual = new Date().getFullYear();
  const [modo, setModo] = useState("ano");
  const [ano, setAno] = useState(anoAtual);
  const [de, setDe] = useState(`${anoAtual}-01-01`);
  const [ate, setAte] = useState(`${anoAtual}-12-31`);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const periodoOk = modo === "ano" || (/^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate) && de <= ate);
  const qs = modo === "ano" ? `ano=${ano}` : `de=${de}&ate=${ate}`;

  const carregar = useCallback(async () => {
    if (!periodoOk) return;
    try {
      setCarregando(true);
      setErro("");
      setResumo(await apiFetch(`/mpt/resumo?${qs}`));
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a Comprovação MPT.");
    } finally {
      setCarregando(false);
    }
  }, [qs, periodoOk]);

  useEffect(() => { carregar(); }, [carregar]);

  const parcial = Boolean(resumo?.periodo) && !resumo.periodo.completo;
  const subs = resumo?.subdivisoes || [];
  const rotulo = modo === "ano" ? String(ano) : `${dataBR(de)} a ${dataBR(ate)}`;

  return (
    <PortalShell>
      <PageHero
        eyebrow="Conformidade"
        title="Comprovação MPT"
        subtitle="Quantas pessoas já atingiram a meta interna de horas de desenvolvimento em cada subdivisão. Leitura agregada, sem nomes — o detalhe por pessoa fica com a Metodologia."
      />

      <SectionCard
        title="Cobertura por subdivisão e operação"
        subtitle={`Período: ${rotulo}. A meta é interna de gestão, em horas por pessoa no ano — não é exigência legal.`}
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <select aria-label="Tipo de período" value={modo} onChange={(e) => setModo(e.target.value)} style={campo}>
              <option value="ano">Ano-calendário</option>
              <option value="intervalo">Intervalo de datas</option>
            </select>
            {modo === "ano" ? (
              <select aria-label="Ano" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ ...campo, width: 100 }}>
                {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <>
                <input aria-label="Data inicial" type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campo} />
                <span style={{ fontSize: 12, color: "#334155" }}>até</span>
                <input aria-label="Data final" type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campo} />
              </>
            )}
          </div>
        }
      >
        {erro && <div style={alerta}>{erro}</div>}
        {!periodoOk && <div style={alerta}>Informe a data inicial e a data final (a final não pode ser anterior à inicial).</div>}
        {parcial && (
          <div style={{ ...alerta, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
            Período parcial: a meta é anual e não é comparada aqui. Para a leitura da meta, use o ano-calendário.
          </div>
        )}

        {carregando && !resumo ? (
          <div style={vazio}>Carregando...</div>
        ) : subs.length === 0 ? (
          <div style={vazio}>Ainda não há horas por subdivisão em {rotulo}. A Metodologia define a subdivisão das jornadas e das turmas, e a meta de cada uma.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {subs.map((s) => {
              const f = parcial ? PARCIAL : FAROL[s.farol] || FAROL.cinza;
              return (
                <div key={s.subtipo} style={{ border: `1px solid ${colors.border}`, borderRadius: 14, background: "#fff", padding: "12px 16px", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div>
                      <strong style={{ fontSize: 15, color: colors.textPrimary }}>{s.subtipo}</strong>
                      <span style={{ fontSize: 12.5, color: colors.textSecondary, marginLeft: 10 }}>
                        {s.metas_diferentes ? "metas diferentes entre ambientes" : s.meta_horas !== null ? `meta ${parcial ? "anual (referência)" : "interna"}: ${dec(s.meta_horas)} h por pessoa` : "meta não definida"}
                      </span>
                    </div>
                    <Pill info={f} />
                  </div>
                  <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                    <Numero valor={fmt(s.pessoas)} rotulo="pessoas no universo" />
                    {!parcial && (
                      <>
                        <Numero valor={fmt(s.atingiram)} rotulo="atingiram a meta" cor={colors.successText} />
                        <Numero valor={fmt(s.abaixo)} rotulo="abaixo da meta" cor={s.abaixo ? colors.warningText : undefined} />
                        <Numero valor={fmt(s.sem_hora)} rotulo="sem nenhuma hora" cor={s.sem_hora ? colors.dangerText : undefined} />
                        <Numero valor={s.pct === null ? "—" : `${s.pct}%`} rotulo="atingiram (cobertura)" cor={f.cor} />
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    Horas contadas: <strong>{dec(s.horas_jornada)} h</strong> em jornadas · <strong>{dec(s.horas_turma)} h</strong> em turmas
                  </div>
                  {s.por_cliente.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={tabela}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: "left" }}>Operação</th>
                            <th style={th}>Pessoas</th>
                            {!parcial && <th style={th}>Atingiram</th>}
                            {!parcial && <th style={th}>Abaixo</th>}
                            {!parcial && <th style={th}>Sem hora</th>}
                            {!parcial && <th style={th}>Situação</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {s.por_cliente.map((c) => (
                            <tr key={c.cliente}>
                              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{c.cliente}</td>
                              <td style={td}>{fmt(c.pessoas)}</td>
                              {!parcial && <td style={td}>{fmt(c.atingiram)}</td>}
                              {!parcial && <td style={td}>{fmt(c.abaixo)}</td>}
                              {!parcial && <td style={td}>{fmt(c.sem_hora)}</td>}
                              {!parcial && (
                                <td style={td}>
                                  <Pill info={FAROL[c.farol] || FAROL.cinza} />
                                  {c.pct !== null ? <span style={{ marginLeft: 6, fontSize: 12, color: colors.textSecondary }}>{c.pct}%</span> : null}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 1.5 }}>
          Como a conta funciona: conta só presença registrada como presente; no mesmo dia e na mesma subdivisão a hora conta uma vez só. O universo é quem está inscrito nas jornadas ou turmas da subdivisão, mesmo com zero hora. Nomes, evidências, dossiê e extratos individuais ficam com a Metodologia.
        </div>
      </SectionCard>
    </PortalShell>
  );
}

function Numero({ valor, rotulo, cor }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{rotulo}</div>
    </div>
  );
}

const campo = { border: `1px solid ${colors.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 13, background: "#fff", color: colors.textPrimary, width: 150 };
const alerta = { margin: "0 0 12px", padding: "10px 12px", borderRadius: 12, fontSize: 12.5, fontWeight: 700, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" };
const vazio = { borderRadius: 14, border: `1px dashed ${colors.border}`, padding: "16px 18px", fontSize: 13.5, color: colors.textSecondary, background: "#fff" };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { padding: "7px 8px", fontSize: 11.5, fontWeight: 800, color: "#334155", textAlign: "center", borderBottom: `1px solid ${colors.border}`, background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "7px 8px", textAlign: "center", borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
