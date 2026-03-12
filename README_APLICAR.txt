PACOTE /USUARIOS + ACESSO POR PERFIL

BACKEND
- backend/src/middlewares/authorizeRoles.js

FRONTEND
- frontend/components/PortalShell.js
- frontend/app/usuarios/page.js

REGRAS DE MENU
- admin: tudo
- coordenador: tudo, exceto limitações técnicas futuras
- supervisor: também pode gerenciar usuários
- instrutor: visão operacional (sem clientes e sem usuários)

OBSERVAÇÃO
- Este pacote ajusta o menu por perfil no frontend
- A página /usuarios foi refinada com resumo, busca, filtros e badges
- O middleware authorizeRoles já fica pronto para uso em rotas futuras
