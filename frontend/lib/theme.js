// theme.js
//
// Sistema de design mínimo do Portal T&D. Hoje cada página define suas
// próprias cores/estilos inline (o mesmo verde de "concluído" tem uns 4 tons
// diferentes espalhados pelo projeto) — este arquivo é o começo de
// consolidar isso num lugar só. Novas telas devem importar daqui em vez de
// inventar hex codes novos; telas existentes podem migrar aos poucos, sem
// pressa, sempre que forem mexidas por outro motivo.

export const colors = {
  // marca / ação primária
  primary: "#2563eb",
  primaryLight: "#dbeafe",

  // estados semânticos (sucesso/atenção/perigo/neutro) — usar SEMPRE estes,
  // não variações tipo #16a34a vs #15803d vs #166534 escolhidas ao acaso
  success: "#16a34a",
  successLight: "#dcfce7",
  successText: "#166534",

  warning: "#c2410c",
  warningLight: "#fff7ed",
  warningText: "#9a3412",

  danger: "#b91c1c",
  dangerLight: "#fee2e2",
  dangerText: "#b91c1c",

  info: "#0ea5e9",
  infoLight: "#e0f2fe",

  neutral: "#64748b",
  neutralLight: "#f1f5f9",

  // texto e superfícies
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  border: "#e2e8f0",
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const spacing = (n) => `${n * 4}px`;

// Paleta rotativa por cliente — usada nos cards de turma (estilo "Minhas
// turmas") pra dar identidade visual sem precisar cadastrar uma cor por
// cliente manualmente. É estável: o mesmo nome de cliente sempre cai na
// mesma cor, em qualquer tela.
const PALETA_CLIENTES = [
  { bg: "#e0f2fe", text: "#0369a1" }, // azul
  { bg: "#dcfce7", text: "#166534" }, // verde
  { bg: "#fef3c7", text: "#92400e" }, // âmbar
  { bg: "#fce7f3", text: "#9d174d" }, // rosa
  { bg: "#ede9fe", text: "#5b21b6" }, // roxo
  { bg: "#ffedd5", text: "#9a3412" }, // laranja
  { bg: "#ccfbf1", text: "#115e59" }, // teal
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function corDoCliente(nomeCliente) {
  if (!nomeCliente) return PALETA_CLIENTES[0];
  const indice = hashString(String(nomeCliente)) % PALETA_CLIENTES.length;
  return PALETA_CLIENTES[indice];
}

// Badge de status — cobre tanto os rótulos "canônicos" (Concluída, Em
// andamento...) quanto os mais granulares que só o backend calcula
// (Chamada pendente, Sem cronograma, Sem treinandos). Ver
// backend/src/services/presencaResolver.js para a origem desses rótulos.
export function estiloBadgeStatus(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: radius.pill,
    fontWeight: 800,
    fontSize: 11,
  };

  const mapa = {
    "Concluída": { background: colors.successLight, color: colors.successText },
    "Em andamento": { background: colors.warningLight, color: colors.warningText },
    "Cancelada": { background: colors.dangerLight, color: colors.dangerText },
    "Chamada pendente": { background: "#fff7ed", color: "#c2410c" },
    "Sem cronograma": { background: colors.dangerLight, color: colors.dangerText },
    "Sem treinandos": { background: colors.dangerLight, color: colors.dangerText },
    "Planejada": { background: colors.primaryLight, color: colors.primary },
  };

  return { ...base, ...(mapa[label] || { background: colors.primaryLight, color: colors.primary }) };
}

// Badge de classificação (Crítico/Atenção/Estável)
export function estiloBadgeClassificacao(label) {
  const base = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: radius.pill,
    fontWeight: 700,
    fontSize: 11,
  };
  if (label === "Crítico") return { ...base, background: colors.dangerLight, color: colors.dangerText };
  if (label === "Atenção") return { ...base, background: colors.warningLight, color: colors.warningText };
  return { ...base, background: colors.successLight, color: colors.successText };
}

export const card = {
  borderRadius: radius.md,
  border: `0.5px solid ${colors.border}`,
  background: colors.surface,
};
