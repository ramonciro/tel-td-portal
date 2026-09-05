// frontend/lib/perfilUtils.js
// Utilitários de perfil para controle de acesso no frontend
// Importar onde necessário: import { getModulo, podeAcessarRS, podeEditarRS } from '@/lib/perfilUtils'

const PERFIS_RS = ['coordenador_rs', 'gestor_rs'];
const PERFIS_TD = ['instrutor', 'coordenador', 'supervisor', 'admin'];

/**
 * Retorna o módulo ao qual o perfil pertence.
 * 'rs'    → somente módulo R&S
 * 'td'    → somente módulo T&D
 * 'ambos' → super_admin, vê os dois
 */
export function getModulo(perfil) {
  const p = (perfil || '').toLowerCase().trim();
  if (p === 'super_admin') return 'ambos';
  if (PERFIS_RS.some(r => p === r)) return 'rs';
  return 'td';
}

/** Usuário pode acessar o módulo R&S? */
export function podeAcessarRS(perfil) {
  const m = getModulo(perfil);
  return m === 'rs' || m === 'ambos';
}

/** Usuário pode acessar o módulo T&D? */
export function podeAcessarTD(perfil) {
  const m = getModulo(perfil);
  return m === 'td' || m === 'ambos';
}

/** Usuário pode criar/editar/excluir RPs? (coordenador_rs ou super_admin) */
export function podeEditarRS(perfil) {
  const p = (perfil || '').toLowerCase().trim();
  return p === 'coordenador_rs' || p === 'super_admin';
}

/** URL de entrada padrão após login, baseada no perfil */
export function getRedirectPosLogin(perfil) {
  const modulo = getModulo(perfil);
  if (modulo === 'rs') return '/rs/rps';
  return '/inicio';
}
