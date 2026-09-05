// backend/src/middleware/rsMiddleware.js
// Controle de acesso do módulo R&S — CommonJS

// Perfis que têm acesso ao módulo R&S
const PERFIS_COM_ACESSO_RS = ['coordenador_rs', 'gestor_rs', 'super_admin'];

// Perfis exclusivos de R&S que não podem acessar dados de T&D
const PERFIS_EXCLUSIVOS_RS = ['coordenador_rs', 'gestor_rs'];

/**
 * rsAccessRequired
 * Aplicar em TODAS as rotas /api/rs/*
 * Bloqueia qualquer perfil que não seja R&S ou super_admin.
 */
const rsAccessRequired = (req, res, next) => {
  const perfil = (req.user?.perfil || '').toLowerCase().trim();
  const permitido = PERFIS_COM_ACESSO_RS.some(p => perfil === p);

  if (!permitido) {
    return res.status(403).json({
      error: 'Acesso restrito ao módulo R&S.',
      codigo: 'RS_ACESSO_NEGADO',
    });
  }
  next();
};

/**
 * bloquearRS
 * Aplicar nas rotas sensíveis do T&D:
 *   turmas, presenças, avaliações, usuários, treinamentos, trilhas
 * Impede que usuários de R&S acessem dados de T&D mesmo conhecendo a URL.
 */
const bloquearRS = (req, res, next) => {
  const perfil = (req.user?.perfil || '').toLowerCase().trim();
  const ehExclusivoRS = PERFIS_EXCLUSIVOS_RS.some(p => perfil === p);

  if (ehExclusivoRS) {
    return res.status(403).json({
      error: 'Usuários de R&S não têm acesso ao módulo T&D.',
      codigo: 'TD_ACESSO_NEGADO',
    });
  }
  next();
};

module.exports = { rsAccessRequired, bloquearRS };
