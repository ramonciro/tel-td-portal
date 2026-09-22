/**
 * perfilScope.js — Fase 1 (padronização de gestão de usuários, 22/09/2026)
 *
 * Mesma lógica de tenantScope.js — nunca mexe em middleware global, só é
 * chamado dentro da configuração de uma rota específica (hoje só
 * /api/usuarios) — mas para outro tipo de recorte: em vez de "de qual
 * empresa", "de qual PERFIL" um ator pode listar/criar/editar/excluir.
 *
 * Contexto (pedido do Ramon, 22/09/2026): coordenador_rs ganhou acesso à
 * mesma tela de Gestão de Usuários que o Coordenador (T&D) usa, em vez do
 * atalho isolado que existia em RS → Configurações (rsController.
 * criarUsuarioRS) — que inseria direto na tabela sem passar pelas mesmas
 * validações/campos da rota padrão. Mas o R&S é um módulo deliberadamente
 * isolado do T&D (ver frontend/app/rs/configuracoes/page.js: "Eles não
 * verão nenhuma funcionalidade de T&D") — dar acesso à MESMA tela não pode
 * significar dar visão sobre usuários de fora do próprio módulo. Ramon
 * confirmou: só os usuários do próprio módulo, e pediu o mesmo padrão para
 * quem coordena Metodologia (perfil "metodologia") sobre os usuários desse
 * módulo.
 *
 * PERFIL_ESCOPOS[perfil de quem está logado] = lista de perfis que essa
 * pessoa pode enxergar/mexer via /api/usuarios. Um perfil ausente daqui
 * (coordenador, supervisor, superintendente) não tem NENHUMA restrição
 * aplicada — continuam com acesso total a qualquer perfil do tenant,
 * exatamente como hoje.
 *
 * Extensível: um próximo módulo com o mesmo padrão ("coordenador só mexe
 * nos usuários do próprio time") só precisa de uma linha nova aqui — nada
 * em entityCrud.js, index.js (fora do array) ou no frontend muda.
 */
const PERFIL_ESCOPOS = {
  coordenador_rs: ["coordenador_rs", "gestor_rs"],
  metodologia: ["metodologia"],
};

/**
 * @param {import('express').Request} req
 * @returns {string[]|null} lista de perfis permitidos, ou null quando o
 *   perfil de quem está logado não tem nenhuma restrição (acesso total).
 */
function escopoPerfilFor(req) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  return PERFIL_ESCOPOS[perfil] || null;
}

module.exports = { escopoPerfilFor, PERFIL_ESCOPOS };
