"use client";

import { useEffect, useState } from "react";
import { colors } from "../lib/theme";
import { getStoredUser } from "../services/api";

// 19/10/2026: o treinando só enxerga Mural, Avaliações e NPS da própria turma.
// Visão geral, Cronograma, Presença e Pessoas são telas de gestão e não aparecem para ele.
export const ABAS_DO_TREINANDO = ["mural", "avaliacoes", "nps"];

const ABAS = [
  { key: "mural",        label: "Mural",       href: (id) => `/turma/${id}/mural`        },
  { key: "visao",        label: "Visão geral",  href: (id) => `/turma/${id}`              },
  { key: "cronograma",   label: "Cronograma",   href: (id) => `/turma/${id}/cronograma`   },
  { key: "presenca",     label: "Presença",     href: (id) => `/presenca-turma?turma=${id}` },
  { key: "participantes",label: "Pessoas",      href: (id) => `/turma/${id}/participantes`},
  { key: "avaliacoes",   label: "Avaliações",   href: (id) => `/turma/${id}/avaliacoes`   },
  { key: "nps",          label: "NPS",          href: (id) => `/turma/${id}/nps`          },
];

export default function TurmaTabs({ id, ativa }) {
  // Até saber quem é o usuário, mostra só as abas seguras (o treinando nunca vê as de gestão, nem por um instante).
  const [perfil, setPerfil] = useState(null);
  useEffect(() => {
    setPerfil(String(getStoredUser()?.perfil || "").toLowerCase());
  }, []);
  const abasVisiveis = perfil === null || perfil === "treinando"
    ? ABAS.filter((a) => ABAS_DO_TREINANDO.includes(a.key))
    : ABAS;

  return (
    <div style={wrap}>
      {abasVisiveis.map((aba) => {
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
