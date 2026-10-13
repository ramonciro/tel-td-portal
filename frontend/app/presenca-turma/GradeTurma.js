"use client";

import { colors, radius } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";
import { SITUACAO, FAROL, btnMini, selo, fmtNum } from "../mapa-desenvolvimento/presenca/estilos";

// Grade de chamada da turma: pessoas nas linhas, aulas nas colunas. Clique na
// célula alterna: vazio → presente → justificado (pede o motivo) → ausente → vazio.
export default function GradeTurma({ dados, linhas, pendentes, onCelula, onTodos, onExtrato, turmaId }) {
  const { aulas, presencas, justificativas, por_aula: porAula, turma, hoje } = dados;
  const resumoDe = Object.fromEntries(porAula.map((p) => [p.aula_id, p]));

  return (
    <div style={{ overflow: "auto", maxHeight: "72vh", border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...thBase, ...fixaEsq, zIndex: 4, minWidth: 230 }}>Participante</th>
            {aulas.map((a) => {
              const futuro = a.data > hoje;
              return (
                <th key={a.id} style={{ ...thBase, textAlign: "center", minWidth: 118, maxWidth: 150, background: futuro ? "#f8fafc" : colors.surfaceMuted }}>
                  <div style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: colors.textPrimary, fontWeight: 800 }}>{formatDateBR(a.data).slice(0, 5)}</div>
                  <div title={a.titulo} style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                    {a.titulo}
                  </div>
                  <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 11 }}>
                    {fmtNum(a.carga_horaria)} h{futuro ? " · futura" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
                    <button style={btnMini} disabled={futuro} title="Marcar presente quem ainda não foi lançado" onClick={() => onTodos(a)}>
                      Todos ✓
                    </button>
                    <a
                      href={`/presenca-turma/impressao?turma=${turmaId}&modo=branco&aula=${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Lista em branco desta aula, para assinatura em papel"
                      style={{ ...btnMini, textDecoration: "none", display: "inline-block" }}
                    >
                      Lista
                    </a>
                  </div>
                </th>
              );
            })}
            <th style={{ ...thBase, textAlign: "center", minWidth: 90 }}>Horas</th>
            <th style={{ ...thBase, textAlign: "center", minWidth: 120 }}>Presença (mín. {fmtNum(turma.presenca_minima_pct, 0)}%)</th>
            <th style={{ ...thBase, textAlign: "center", minWidth: 70 }} title="Aulas já realizadas sem presença lançada">
              Pend.
            </th>
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
                      <a href={`/pessoas/${p.pessoa_id}`} style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>
                        Perfil 360
                      </a>
                    ) : null}
                  </div>
                </td>
                {aulas.map((a) => {
                  const chave = `${a.id}:${p.id}`;
                  const sit = presencas[chave];
                  const futuro = a.data > hoje;
                  const emFluxo = pendentes.has(chave);
                  const estilo = sit ? SITUACAO[sit] : null;
                  const motivo = sit === "justificado" ? justificativas[chave] : null;
                  return (
                    <td key={a.id} style={{ ...tdBase, textAlign: "center", background: futuro ? "#fafafa" : undefined }}>
                      <button
                        type="button"
                        disabled={futuro || emFluxo}
                        onClick={() => onCelula(a, p, sit)}
                        title={futuro ? "A aula ainda não aconteceu" : sit ? `${SITUACAO[sit].label}${motivo ? ` — ${motivo}` : ""} (clique para alternar)` : "Não lançado — clique para marcar presente"}
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
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 700 }}>{fmtNum(t.horas)}</td>
                <td style={{ ...tdBase, textAlign: "center" }}>
                  <span style={{ ...selo, background: farol.bg, color: farol.cor }} title={farol.label}>
                    {t.pct_presenca === null ? "—" : `${fmtNum(t.pct_presenca)}%`}
                  </span>
                  <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    {t.presentes}P · {t.justificados}J · {t.ausentes}F
                  </div>
                </td>
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 700, color: t.pendentes ? colors.warningText : colors.textMuted }}>{t.pendentes || "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...tdBase, ...fixaEsq, background: colors.surfaceMuted, fontWeight: 800, fontSize: 12 }}>Totais da aula (P · J · F · sem lançar)</td>
            {aulas.map((a) => {
              const r = resumoDe[a.id];
              return (
                <td key={a.id} style={{ ...tdBase, textAlign: "center", background: colors.surfaceMuted, fontSize: 11, fontWeight: 700 }}>
                  {r.presentes} · {r.justificados} · {r.ausentes} · {r.nao_lancados}
                </td>
              );
            })}
            <td style={{ ...tdBase, background: colors.surfaceMuted }} colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const fixaEsq = { position: "sticky", left: 0, zIndex: 2, boxShadow: "2px 0 0 #e2e8f0" };
const thBase = { position: "sticky", top: 0, zIndex: 3, background: colors.surfaceMuted, textAlign: "left", padding: "10px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, verticalAlign: "bottom" };
const tdBase = { padding: "8px 10px", borderBottom: `1px solid ${colors.surfaceMuted}`, verticalAlign: "middle" };
