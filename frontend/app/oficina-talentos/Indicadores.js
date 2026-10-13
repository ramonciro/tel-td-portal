"use client";

import { useCallback, useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";

// Oficina de Talentos — Fase 3 (13/10/2026): indicadores do funil
// inscritos → participantes → concluintes → promovidos, por cargo almejado,
// por turma e para qual cargo as pessoas foram promovidas.
// Backend: oficinaIndicadoresController.js (GET /oficina-talentos/indicadores).

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export default function Indicadores({ turmas, setErro }) {
  const [filtro, setFiltro] = useState({ turma_id: "", de: "", ate: "" });
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");
      const q = new URLSearchParams();
      if (filtro.turma_id) q.set("turma_id", filtro.turma_id);
      if (filtro.de) q.set("de", filtro.de);
      if (filtro.ate) q.set("ate", filtro.ate);
      const qs = q.toString();
      setDados(await apiFetch(`/oficina-talentos/indicadores${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setErro(e.message || "Erro ao carregar os indicadores.");
    } finally {
      setCarregando(false);
    }
  }, [filtro, setErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const f = dados?.funil;
  const etapas = f
    ? [
        { chave: "inscritos", rotulo: "Inscritos", valor: f.inscritos, taxa: null, dica: dados.definicoes.inscritos },
        { chave: "participantes", rotulo: "Participantes", valor: f.participantes, taxa: f.taxa_participacao, dica: dados.definicoes.participantes },
        { chave: "concluintes", rotulo: "Concluintes", valor: f.concluintes, taxa: f.taxa_conclusao, dica: dados.definicoes.concluintes },
        { chave: "promovidos", rotulo: "Promovidos", valor: f.promovidos, taxa: f.taxa_promocao, dica: dados.definicoes.promovidos },
      ]
    : [];
  const maximo = Math.max(1, ...etapas.map((e) => e.valor));

  return (
    <>
      <SectionCard title="Filtros" subtitle="O período considera a data de início de cada turma.">
        <div style={linhaFiltros}>
          <label style={rotulo}>
            Turma
            <select style={entrada} value={filtro.turma_id} onChange={(e) => setFiltro({ ...filtro, turma_id: e.target.value })}>
              <option value="">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <label style={rotulo}>
            Turmas iniciadas de
            <input style={entrada} type="date" value={filtro.de} onChange={(e) => setFiltro({ ...filtro, de: e.target.value })} />
          </label>
          <label style={rotulo}>
            até
            <input style={entrada} type="date" value={filtro.ate} onChange={(e) => setFiltro({ ...filtro, ate: e.target.value })} />
          </label>
          <button style={btnSecundario} onClick={() => setFiltro({ turma_id: "", de: "", ate: "" })}>
            Limpar filtros
          </button>
        </div>
      </SectionCard>

      {carregando && !dados ? (
        <div style={vazio}>Carregando…</div>
      ) : !dados ? null : f.inscritos === 0 ? (
        <div style={vazio}>Nenhuma inscrição para os filtros escolhidos.</div>
      ) : (
        <>
          <div style={gradeKpi}>
            <StatCard title="Inscritos" value={f.inscritos} accent={colors.primary} />
            <StatCard title="Concluintes" value={f.concluintes} accent={colors.accent} />
            <StatCard title="Promovidos" value={f.promovidos} accent={colors.success} />
            <StatCard title="Conversão em promoção" value={fmtPct(f.taxa_promocao)} accent={colors.warning} />
          </div>

          <SectionCard
            title="Funil da Oficina"
            subtitle="Cada barra é uma etapa. Percentuais: participação sobre inscritos, conclusão sobre participantes e promoção sobre concluintes."
          >
            <div style={{ display: "grid", gap: 12 }}>
              {etapas.map((e) => (
                <div key={e.chave} title={e.dica} style={funilLinha}>
                  <div style={funilRotulo}>{e.rotulo}</div>
                  <div style={funilTrilho}>
                    <div style={{ ...funilBarra, width: `${Math.max(2, (e.valor / maximo) * 100)}%` }} />
                  </div>
                  <div style={funilValor}>
                    <strong>{e.valor}</strong>
                    <span style={funilTaxa}>{e.taxa === null ? "" : fmtPct(e.taxa)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={rodapeFunil}>
              <span>Lista de espera: <strong>{dados.situacoes.lista_espera}</strong></span>
              <span>Em conferência: <strong>{dados.situacoes.em_conferencia}</strong></span>
              <span>Desistentes: <strong>{dados.situacoes.desistente}</strong></span>
              <span>Cancelados: <strong>{dados.situacoes.cancelado}</strong></span>
              <span>
                Promovidos no cargo que almejavam: <strong>{f.promovidos_no_cargo_almejado}</strong>
                {f.promovidos ? ` de ${f.promovidos}` : ""}
              </span>
              <span>
                Tempo médio do fim da oficina até a promoção:{" "}
                <strong>{f.tempo_medio_ate_promocao_dias === null ? "—" : `${f.tempo_medio_ate_promocao_dias} dias`}</strong>
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Por cargo almejado" subtitle="Quem quer ir para onde — e quantos chegaram lá. “Outro” aparece com o cargo digitado na inscrição.">
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Cargo almejado</th>
                    <th style={thNum}>Inscritos</th>
                    <th style={thNum}>Participantes</th>
                    <th style={thNum}>Concluintes</th>
                    <th style={thNum}>Promovidos</th>
                    <th style={thNum}>No cargo almejado</th>
                    <th style={thNum}>Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_cargo_almejado.map((c) => (
                    <tr key={c.cargo}>
                      <td style={td}><strong>{c.cargo}</strong></td>
                      <td style={tdNum}>{c.inscritos}</td>
                      <td style={tdNum}>{c.participantes}</td>
                      <td style={tdNum}>{c.concluintes}</td>
                      <td style={tdNum}>{c.promovidos}</td>
                      <td style={tdNum}>{c.no_cargo_almejado}</td>
                      <td style={tdNum}>{fmtPct(c.taxa_promocao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Para qual cargo foram promovidos" subtitle="Cargo realmente assumido, registrado pela Metodologia em “Presença e certificados”.">
            {dados.promovidos_por_cargo.length === 0 ? (
              <div style={vazio}>Nenhuma promoção registrada ainda.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {dados.promovidos_por_cargo.map((c) => (
                  <div key={c.cargo} style={funilLinha}>
                    <div style={{ ...funilRotulo, width: 200 }}>{c.cargo}</div>
                    <div style={funilTrilho}>
                      <div style={{ ...funilBarra, background: colors.success, width: `${Math.max(2, (c.total / f.promovidos) * 100)}%` }} />
                    </div>
                    <div style={funilValor}><strong>{c.total}</strong></div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Por turma">
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Turma</th>
                    <th style={th}>Início</th>
                    <th style={thNum}>Inscritos</th>
                    <th style={thNum}>Participantes</th>
                    <th style={thNum}>Concluintes</th>
                    <th style={thNum}>Conclusão</th>
                    <th style={thNum}>Promovidos</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_turma.map((t) => (
                    <tr key={t.turma_id}>
                      <td style={td}><strong>{t.nome}</strong></td>
                      <td style={td}>{t.data_inicio ? formatDateBR(t.data_inicio) : "—"}</td>
                      <td style={tdNum}>{t.inscritos}</td>
                      <td style={tdNum}>{t.participantes}</td>
                      <td style={tdNum}>{t.concluintes}</td>
                      <td style={tdNum}>{fmtPct(t.taxa_conclusao)}</td>
                      <td style={tdNum}>{t.promovidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div style={nota}>
            <strong>Como ler:</strong> Inscritos = todas as inscrições; Participantes = confirmadas ou concluídas; Concluintes = quem recebeu certificado
            (participação + presença mínima + carga horária); Promovidos = concluintes com promoção registrada.
          </div>
        </>
      )}
    </>
  );
}

const gradeKpi = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 0", fontSize: 14 };
const linhaFiltros = { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" };
const rotulo = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const entrada = { padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, fontFamily: "inherit", background: colors.surface, color: colors.textPrimary, minWidth: 180 };
const btnSecundario = { padding: "9px 18px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const funilLinha = { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12 };
const funilRotulo = { width: 120, fontSize: 13, fontWeight: 700, color: colors.textPrimary };
const funilTrilho = { height: 22, background: colors.surfaceMuted, borderRadius: radius.sm, overflow: "hidden" };
const funilBarra = { height: "100%", background: colors.primary, borderRadius: radius.sm };
const funilValor = { minWidth: 90, textAlign: "right", fontSize: 14, color: colors.textPrimary, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "baseline" };
const funilTaxa = { fontSize: 12, color: colors.textSecondary, fontWeight: 700 };
const rodapeFunil = { display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13, color: colors.textSecondary, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.surfaceMuted}` };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, whiteSpace: "nowrap" };
const thNum = { ...th, textAlign: "right" };
const td = { padding: "10px 12px", borderBottom: `1px solid ${colors.surfaceMuted}` };
const tdNum = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const nota = { fontSize: 12, color: colors.textMuted, lineHeight: 1.6 };
