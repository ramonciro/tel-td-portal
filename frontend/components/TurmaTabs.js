"use client";

import { colors } from "../lib/theme";

const ABAS = [
  { key: "mural",        label: "Mural",       href: (id) => `/turma/${id}/mural`        },
  { key: "visao",        label: "Visão geral",  href: (id) => `/turma/${id}`              },
  { key: "cronograma",   label: "Cronograma",   href: (id) => `/turma/${id}/cronograma`   },
  { key: "participantes",label: "Pessoas",      href: (id) => `/turma/${id}/participantes`},
  { key: "avaliacoes",   label: "Avaliações",   href: (id) => `/turma/${id}/avaliacoes`   },
  { key: "nps",          label: "NPS",          href: (id) => `/turma/${id}/nps`          },
];

export default function TurmaTabs({ id, ativa }) {
  return (
    <div style={wrap}>
      {ABAS.map((aba) => {
        const isAtiva = aba.key === ativa;
        return (
          <a
            key={aba.key}
            href={aba.href(id)}
            style={{
              ...tab,
              color:        isAtiva ? colors.accent       : colors.textSecondary,
              fontWeight:   isAtiva ? 800                 : 500,
              borderBottom: isAtiva
                ? `2.5px solid ${colors.accent}`
                : "2.5px solid transparent",
            }}
          >
            {aba.label}
          </a>
        );
      })}
    </div>
  );
}

const wrap = {
  display:        "flex",
  gap:            2,
  borderBottom:   `1.5px solid #e9eef4`,
  marginBottom:   18,
  overflowX:      "auto",
  scrollbarWidth: "none",          // Firefox
};

const tab = {
  padding:        "10px 14px",
  fontSize:       13,
  textDecoration: "none",
  whiteSpace:     "nowrap",
  transition:     "color .15s",
};
