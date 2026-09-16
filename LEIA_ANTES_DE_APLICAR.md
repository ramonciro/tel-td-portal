# Módulo Metodologia e Desenvolvimento — 16/09/2026

Este zip só tem o que muda nesta rodada. Aplique assim:

## 1. Substituir estes 9 arquivos no seu repositório (mesmo caminho)

- `backend/src/middlewares/auth.js`
- `backend/src/index.js`
- `backend/src/routes/jornadasDesenvolvimentoRoutes.js`
- `backend/src/routes/jornadaParticipantesRoutes.js`
- `frontend/services/api.js`
- `frontend/components/PortalShell.js`
- `frontend/app/trilhas/page.js`
- `frontend/app/mapa-desenvolvimento/page.js`
- `frontend/app/usuarios/page.js`

## 2. Ação manual depois de subir — IMPORTANTE

Este pacote troca o controle de acesso do Mapa de Desenvolvimento e da Trilhas de:
- "perfil Coordenador/Superintendente + flag liberada manualmente", e
- "perfil Coordenador/Supervisor/Instrutor/Treinando" (Trilhas),

para um único perfil dedicado: **`metodologia`**.

**Qualquer usuário que hoje acessa o Mapa de Desenvolvimento ou a Trilhas precisa ser reatribuído para o perfil "Metodologia" em Gestão de Usuários depois do deploy** — sem isso, ele perde o acesso a essas duas telas (o antigo toggle "Mapa de Desenvolvimento: Liberado/Bloqueado" também saiu da tela de usuários, porque não tem mais efeito nenhum). O perfil "Metodologia" já existia como opção no formulário de usuários (você mesmo já tinha cadastrado essa opção antes), só nunca tinha sido conectado a nada — é o que este pacote conecta.

Nenhuma migração de banco é necessária — `perfil` é texto livre, não um enum fixo.

## 3. Nada mais muda

Sem migração automática nova, sem mudança de schema. É só controle de acesso (backend) + reorganização de menu (frontend).
