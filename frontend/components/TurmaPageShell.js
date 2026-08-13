"use client";

import PortalShell  from "./PortalShell";
import TurmaTabs   from "./TurmaTabs";
import { formatDateBR } from "../lib/date";
import { corDoCliente } from "../lib/theme";

function formatPeriodo(t) {
  if (!t) return "";
  const ini = formatDateBR(t.data_inicio || t.data, "");
  const fim = t.data_fim ? formatDateBR(t.data_fim, "") : null;
  return fim ? `${ini} → ${fim}` : ini;
}

/**
 * Shell compartilhado para todas as sub-páginas de turma/[id].
 *
 * Uso:
 *   <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="mural">
 *     <conteúdo da página />
 *   </TurmaPageShell>
 *
 * Benefícios:
 * - Cabeçalho + tabs consistentes em todas as abas
 * - Cada página só precisa gerenciar seu próprio estado de dados
 * - Remove duplicação de ~40 linhas de header de mural / avaliações / NPS
 */
export default function TurmaPageShell({ id, treinamento, loading, abaAtiva, children }) {
  const cor = corDoCliente(treinamento?.cliente);

  return (
    <PortalShell>
      {/* ── Cabeçalho da turma ── */}
      <div style={header}>
        <div style={headerInner}>
          <div style={headerLeft}>
            {/* Pill de cliente */}
            <span style={{
              ...clientePill,
              background: cor.bg || "#f1f5f9",
              color:      cor.text || "#334155",
            }}>
              {treinamento?.cliente || "—"}
            </span>

            {/* Nome da turma */}
            <h1 style={headerTitle}>
              {loading ? "Carregando…" : treinamento?.tema || "Turma"}
            </h1>

            {/* Meta-linha: instrutor · período · carga */}
            {treinamento && (
              <p style={headerMeta}>
                {[
                  treinamento.instrutor,
                  formatPeriodo(treinamento),
                  treinamento.carga_horaria,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          {/* Link voltar */}
          <a href="/treinamentos" style={voltarLink}>
            ← Turmas
          </a>
        </div>
      </div>

      {/* ── Navegação por abas ── */}
      <TurmaTabs id={id} ativa={abaAtiva} />

      {/* ── Conteúdo da sub-página ── */}
      {children}
    </PortalShell>
  );
}

/* ── Estilos ────────────────────────────────── */
const header = {
  background: "linear-gradient(135deg, #0B1220 0%, #1a2540 100%)",
  borderRadius: 16,
  padding: "18px 22px",
  marginBottom: 4,
  color: "#fff",
};

const headerInner = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const headerLeft = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
};

const clientePill = {
  display: "inline-block",
  width: "fit-content",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const headerTitle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  color: "#fff",
  lineHeight: 1.2,
};

const headerMeta = {
  margin: 0,
  fontSize: 13,
  color: "rgba(255,255,255,.65)",
};

const voltarLink = {
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,.7)",
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.2)",
  whiteSpace: "nowrap",
  flexShrink: 0,
  alignSelf: "flex-start",
};
