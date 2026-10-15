import { colors } from "../../../lib/theme";

// Estilos e rótulos da tela Desenvolvimento por etapa (Fase 2, 16/10/2026).
export { btnPrimario, btnSecundario, btnPerigo, btnMini, entrada, rotulo, gradeForm, painel, dica, acoes, vazio, avisoErro, avisoOk, selo, fmtNum } from "../presenca/estilos";

export const STATUS_ETAPA = {
  nao_iniciada: { label: "Não iniciada", bg: colors.neutralLight, cor: colors.neutral },
  em_andamento: { label: "Em andamento", bg: colors.warningLight, cor: colors.warningText },
  concluida: { label: "Concluída", bg: colors.successLight, cor: colors.successText },
};

export const AVALIACAO = {
  atingiu: { label: "Atingiu", bg: colors.successLight, cor: colors.successText },
  parcial: { label: "Parcial", bg: colors.warningLight, cor: colors.warningText },
  nao_atingiu: { label: "Não atingiu", bg: colors.dangerLight, cor: colors.dangerText },
};

export const TIPO_EVOLUCAO = {
  ponto_forte: { label: "Ponto forte", bg: colors.successLight, cor: colors.successText },
  dificuldade: { label: "Dificuldade", bg: colors.dangerLight, cor: colors.dangerText },
  plano_acao: { label: "Plano de ação", bg: "#dbeafe", cor: "#1e40af" },
  geral: { label: "Geral", bg: colors.neutralLight, cor: colors.neutral },
};

export const FAROL_COR = {
  verde: { cor: colors.successText },
  vermelho: { cor: colors.dangerText },
  cinza: { cor: colors.neutral },
};
