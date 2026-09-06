// theme.js
//
// Sistema de design mínimo do Portal T&D. Hoje cada página define suas
// próprias cores/estilos inline (o mesmo verde de "concluído" tem uns 4 tons
// diferentes espalhados pelo projeto) — este arquivo é o começo de
// consolidar isso num lugar só. Novas telas devem importar daqui em vez de
// inventar hex codes novos; telas existentes podem migrar aos poucos, sem
// pressa, sempre que forem mexidas por outro motivo.

// Paleta extraída de verdade do logo (logo-td.png: fundo navy + rede de nós
// num gradiente azul → laranja, lembrando conexões/sinapses de um cérebro).
// Amostrado por pixel: navy ~#10182A, azul ~#296AC2, laranja ~#E19F3B — os
// valores abaixo são esses tons ajustados para os usos de UI (contraste,
// tons claros de fundo), não escolhidos de cabeça.
export const colors = {
  // identidade da marca — usada no chrome do portal (sidebar, cabeçalhos de
  // destaque) e em CTAs primários. Não usar em badges de status — status
  // usa sempre success/warning/danger, pra não competir visualmente.
  navy: "#0B1220",
  navySoft: "#161D2E",
  // antes era um coral (#FF6B4A) que não batia com o laranja real do logo.
  // `accent` é usado em ~25 telas como fundo de botão com texto branco —
  // por isso ficou num âmbar mais fechado (contraste ~3.2:1 com branco,
  // acima do coral anterior ~2.5:1; ainda abaixo do ideal de 4.5:1 do WCAG
  // AA para texto pequeno — anotado no design-system.md como item aberto de
  // acessibilidade). `accentBright` é o âmbar vivo de verdade do logo, para
  // uso decorativo onde contraste de texto não entra (pontos, ícones,
  // preenchimento de gráfico, fundo suave de destaque).
  accent: "#D97706",
  accentBright: "#F59E0B",
  accentLight: "#FEF3C7",
  accentText: "#92400E",

  // marca / ação primária — já batia com o azul do logo, mantido
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

// O gradiente azul → laranja do logo, para uso em hero/cabeçalho de destaque
// e no item ativo do menu — em vez de cada tela inventar seu próprio
// gradiente (o Dashboard antigo, por exemplo, usava #0f172a → #1d4ed8, um
// gradiente diferente do da marca).
export const brandGradient = "linear-gradient(135deg, #2563EB 0%, #F59E0B 100%)";
export const brandGradientDark = "linear-gradient(135deg, #0B1220 0%, #1d4ed8 55%, #F59E0B 100%)";
export const brandGradientSoft = "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(245,158,11,0.12) 100%)";

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

// paleta curada para métricas que não têm semântica de status (não são
// "bom/ruim"), só precisam de cores distintas e consistentes entre telas —
// substitui os hex codes escolhidos um a um em cada página.
export const chart = {
  blue: "#2563eb",
  cyan: "#0ea5e9",
  teal: "#0f766e",
  purple: "#7c3aed",
  pink: "#db2777",
  orange: "#ea580c",
};

export const card = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
};

// versão sem sombra/gradiente — pra listas densas (linhas de tabela, itens
// de feed) onde o efeito elevado do card principal ficaria pesado repetido
// muitas vezes na mesma tela.
export const cardFlat = {
  borderRadius: radius.md,
  border: `0.5px solid ${colors.border}`,
  background: colors.surface,
};
