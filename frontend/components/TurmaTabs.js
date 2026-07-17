"use client";

import { colors, radius } from "../lib/theme";

const ABAS = [
  { key: "mural", label: "Mural", href: (id) => `/turma/${id}/mural` },
  { key: "visao", label: "Visão geral", href: (id) => `/turma/${id}` },
  { key: "cronograma", label: "Cronograma", href: (id) => `/turma/${id}/cronograma` },
  { key: "participantes", label: "Pessoas", href: (id) => `/turma/${id}/participantes` },
  { key: "avaliacoes", label: "Avaliações", href: (id) => `/turma/${id}/avaliacoes` },
  { key: "nps", label: "NPS", href: (id) => `/turma/${id}/nps` },
];

export default function TurmaTabs({ id, ativa }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `0.5px solid ${colors.border}`, marginBottom: 18, overflowX: "auto" }}>
      {ABAS.map((aba) => {
        const isAtiva = aba.key === ativa;
        return (
          <a
            key={aba.key}
            href={aba.href(id)}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: isAtiva ? 700 : 500,
              color: isAtiva ? colors.primary : colors.textSecondary,
              borderBottom: isAtiva ? `2px solid ${colors.primary}` : "2px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {aba.label}
          </a>
        );
      })}
    </div>
  );
}
