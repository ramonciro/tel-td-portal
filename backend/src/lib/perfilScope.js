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
  // Núcleo de Saúde Psicossocial (06/11/2026): o coordenador do Núcleo cria e gerencia
  // os perfis do próprio módulo (coordenador, analista e gestor do Núcleo), nada de fora.
  coordenador_nusp: ["coordenador_nusp", "analista_nusp", "gestor_nusp"],
  // Módulo RH (12/11/2026): o coordenador do RH cria e gerencia os perfis do próprio módulo, nada de fora.
  coordenador_rh: ["coordenador_rh", "analista_rh", "gestor_rh", "cliente_rh"],
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

/**
 * Perfis de módulo isolado (Núcleo e RH) — decisão do Ramon (14/11/2026): as contas desses
 * módulos só são criadas, editadas, desativadas ou excluídas pelo coordenador do próprio módulo
 * ou pelo super_admin. Coordenador, Supervisor e Superintendente do T&D não mexem nelas e nem
 * as enxergam na lista de Gestão de Usuários. Antes disso, qualquer um desses três podia criar
 * um coordenador do Núcleo/RH, ou trocar a senha dele e entrar na conta.
 */
const PERFIS_MODULO_PRIVADO = [
  "coordenador_nusp", "analista_nusp", "gestor_nusp",
  "coordenador_rh", "analista_rh", "gestor_rh", "cliente_rh",
];

/** Perfis que o Supervisor pode criar e editar (ele não sobe de perfil nem mexe em quem está acima). */
const PERFIS_QUE_O_SUPERVISOR_GERENCIA = ["instrutor", "treinando", "assistente_treinamento", "analista_conteudo"];

const norm = (v) => String(v || "").toLowerCase().trim();

function ehPerfilModuloPrivado(perfil) {
  return PERFIS_MODULO_PRIVADO.includes(norm(perfil));
}

/** true quando o ator é do T&D sem escopo de módulo (coordenador, supervisor, superintendente). */
function atorSemEscopoDeModulo(req) {
  const perfil = norm(req.user?.perfil);
  return perfil !== "super_admin" && !PERFIL_ESCOPOS[perfil];
}

/**
 * Regras extras de escrita em /api/usuarios (além do escopo de módulo).
 * `antes` é a linha atual do alvo (null na criação); `novoPerfil` é o perfil que ele terá (ou undefined).
 * Devolve uma mensagem de erro (403) ou null.
 */
function motivoDeBloqueioDeUsuario(req, { antes, novoPerfil, mudaAtivo }) {
  const perfilAtor = norm(req.user?.perfil);
  const perfilAntes = antes ? norm(antes.perfil) : null;
  const perfilFinal = novoPerfil !== undefined ? norm(novoPerfil) : perfilAntes;

  // Ninguém muda o próprio perfil nem desativa a própria conta por esta rota.
  if (antes && Number(antes.id) === Number(req.user?.id)) {
    if ((novoPerfil !== undefined && norm(novoPerfil) !== perfilAntes) || mudaAtivo) {
      return "Você não pode alterar o próprio perfil nem desativar a própria conta.";
    }
  }

  if (perfilAtor === "super_admin") return null;

  if (atorSemEscopoDeModulo(req)) {
    if (ehPerfilModuloPrivado(perfilAntes) || ehPerfilModuloPrivado(perfilFinal)) {
      return "Contas do Núcleo e do RH só são gerenciadas pelo coordenador do próprio módulo.";
    }
    if (perfilAtor === "supervisor") {
      const alvos = [perfilAntes, perfilFinal || "instrutor"].filter((v) => v !== null);
      if (alvos.some((p) => !PERFIS_QUE_O_SUPERVISOR_GERENCIA.includes(p))) {
        return "O Supervisor só gerencia contas de Instrutor, Treinando, Assistente de Treinamento e Analista de Conteúdo.";
      }
    }
  }
  return null;
}

module.exports = {
  escopoPerfilFor, PERFIL_ESCOPOS,
  PERFIS_MODULO_PRIVADO, PERFIS_QUE_O_SUPERVISOR_GERENCIA,
  ehPerfilModuloPrivado, atorSemEscopoDeModulo, motivoDeBloqueioDeUsuario,
};
