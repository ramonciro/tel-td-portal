"use client";

import Link from "next/link";
import { colors, radius } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";
import { SITUACAO, FAROL, RECICLAGEM, btnMini, selo, fmtNum, corDaTrilha } from "./estilos";

// Grade de chamada: pessoas nas linhas, encontros nas colunas. Clique na
// célula alterna: vazio → presente → justificado → ausente → vazio.
export default function Grade({ dados, linhas, pendentes, onCelula, onTodos, onEditarEncontro, onExtrato, escopoTrilha }) {
  const { encontros, presencas, por_encontro: porEncontro, jornada, hoje, trilhas } = dados;
  const temMeta = Boolean(jornada.meta_horas);
  const temReciclagem = Boolean(jornada.periodicidade_meses);
  const resumoDe = Object.fromEntries(porEncontro.map((p) => [p.encontro_id, p]));

  return (
    <div style={{ overflow: "auto", maxHeight: "72vh", border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...thBase, ...fixaEsq, zIndex: 4, minWidth: 230 }}>Participante</th>
            {encontros.map((e) => {
              const futuro = e.data > hoje;
              const r = resumoDe[e.id];
              return (
                <th key={e.id} style={{ ...thBase, textAlign: "center", minWidth: 118, maxWidth: 150, background: futuro ? "#f8fafc" : colors.surfaceMuted }}>
                  <div style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: colors.textPrimary, fontWeight: 800 }}>{formatDateBR(e.data).slice(0, 5)}</div>
                  <div title={e.titulo} style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                    {e.titulo}
                  </div>
                  <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 11 }}>
                    {fmtNum(e.carga_horaria)} h{futuro ? " · futuro" : ""}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span
                      title={e.trilha_titulo ? `Trilha: ${e.trilha_titulo}` : "Encontro sem trilha"}
                      style={{ ...selo, ...corDaTrilha(trilhas, e.trilha_id), textTransform: "none", letterSpacing: 0, fontSize: 10, maxWidth: 134, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}
                    >
                      {e.trilha_titulo || "Sem trilha"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                    <button style={btnMini} disabled={futuro} title="Marcar presente quem ainda não foi lançado" onClick={() => onTodos(e)}>
                      Todos ✓
                    </button>
                    <button style={btnMini} onClick={() => onEditarEncontro(e, r)}>
                      Editar
                    </button>
                  </div>
                </th>
              );
            })}
            <th style={{ ...thBase, textAlign: "center", minWidth: 96 }}>
              Horas{temMeta ? ` / ${fmtNum(jornada.meta_horas)}` : ""}
              {escopoTrilha && <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 10 }}>só desta trilha</div>}
            </th>
            <th style={{ ...thBase, textAlign: "center", minWidth: 120 }}>
              Presença (mín. {fmtNum(jornada.presenca_minima_pct, 0)}%)
              {escopoTrilha && <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 10 }}>só desta trilha</div>}
            </th>
            <th style={{ ...thBase, textAlign: "center", minWidth: 70 }} title="Encontros já realizados sem presença lançada">
              Pend.
            </th>
            {temReciclagem && <th style={{ ...thBase, minWidth: 150 }}>Reciclagem ({jornada.periodicidade_meses} m)</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => {
            const t = p.totais;
            const farol = FAROL[t.farol];
            return (
              <tr key={p.id}>
                <td style={{ ...tdBase, ...fixaEsq, background: "#fff" }}>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: colors.textSecondary }}>
                    {[p.matricula ? `Mat. ${p.matricula}` : null, p.turma, p.supervisor].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                    <button style={btnMini} onClick={() => onExtrato(p)}>
                      Extrato
                    </button>
                    {p.pessoa_id ? (
                      <Link href={`/pessoas/${p.pessoa_id}`} style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>
                        Perfil 360
                      </Link>
                    ) : (
                      <span title="Participante sem vínculo ao cadastro único de pessoas" style={{ fontSize: 11, color: colors.textMuted }}>
                        sem vínculo ao cadastro
                      </span>
                    )}
                  </div>
                </td>
                {encontros.map((e) => {
                  const chave = `${e.id}:${p.id}`;
                  const sit = presencas[chave];
                  const futuro = e.data > hoje;
                  const emFluxo = pendentes.has(chave);
                  const estilo = sit ? SITUACAO[sit] : null;
                  return (
                    <td key={e.id} style={{ ...tdBase, textAlign: "center", background: futuro ? "#fafafa" : undefined }}>
                      <button
                        type="button"
                        disabled={futuro || emFluxo}
                        onClick={() => onCelula(e, p, sit)}
                        title={futuro ? "O encontro ainda não aconteceu" : sit ? `${SITUACAO[sit].label} — clique para alternar` : "Não lançado — clique para marcar presente"}
                        style={{
                          width: 38,
                          height: 30,
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: futuro ? "not-allowed" : "pointer",
                          opacity: emFluxo ? 0.5 : 1,
                          background: estilo ? estilo.bg : "#fff",
                          color: estilo ? estilo.cor : colors.textMuted,
                          border: `1px solid ${estilo ? estilo.borda : colors.border}`,
                        }}
                      >
                        {estilo ? estilo.letra : futuro ? "·" : "—"}
                      </button>
                    </td>
                  );
                })}
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 700 }}>
                  {fmtNum(t.horas)}
                  {temMeta && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.atingiu_meta ? colors.successText : colors.textSecondary }}>
                      {t.atingiu_meta ? "meta atingida" : `${fmtNum(t.meta_pct, 0)}% da meta`}
                    </div>
                  )}
                </td>
                <td style={{ ...tdBase, textAlign: "center" }}>
                  <span style={{ ...selo, background: farol.bg, color: farol.cor }} title={farol.label}>
                    {t.pct_presenca === null ? "—" : `${fmtNum(t.pct_presenca)}%`}
                  </span>
                  <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    {t.presentes}P · {t.justificados}J · {t.ausentes}F
                  </div>
                </td>
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 700, color: t.pendentes ? colors.warningText : colors.textMuted }}>{t.pendentes || "—"}</td>
                {temReciclagem && (
                  <td style={tdBase}>
                    {t.reciclagem ? (
                      <>
                        <span style={{ ...selo, background: RECICLAGEM[t.reciclagem.status].bg, color: RECICLAGEM[t.reciclagem.status].cor }}>{RECICLAGEM[t.reciclagem.status].label}</span>
                        {t.reciclagem.ate && <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>até {formatDateBR(t.reciclagem.ate)}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...tdBase, ...fixaEsq, background: colors.surfaceMuted, fontWeight: 800, fontSize: 12 }}>Totais do encontro (P · J · F · sem lançar)</td>
            {encontros.map((e) => {
              const r = resumoDe[e.id];
              return (
                <td key={e.id} style={{ ...tdBase, textAlign: "center", background: colors.surfaceMuted, fontSize: 11, fontWeight: 700 }}>
                  {r.presentes} · {r.justificados} · {r.ausentes} · {r.nao_lancados}
                </td>
              );
            })}
            <td style={{ ...tdBase, background: colors.surfaceMuted }} colSpan={2 + (temReciclagem ? 2 : 1)} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const fixaEsq = { position: "sticky", left: 0, zIndex: 2, boxShadow: "2px 0 0 #e2e8f0" };
const thBase = { position: "sticky", top: 0, zIndex: 3, background: colors.surfaceMuted, textAlign: "left", padding: "10px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, verticalAlign: "bottom" };
const tdBase = { padding: "8px 10px", borderBottom: `1px solid ${colors.surfaceMuted}`, verticalAlign: "middle" };
