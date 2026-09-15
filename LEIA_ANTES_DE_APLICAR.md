# Pacote A + B — Segurança e pendências (15/09/2026)

Este zip só tem o que muda ou é novo nesta rodada. Aplique assim:

## 1. Substituir estes 8 arquivos no seu repositório (mesmo caminho)

- `backend/src/database/migrate.js`
- `backend/src/controllers/reembolsoTransporteController.js`
- `backend/src/controllers/treinamentoParticipantesController.js`
- `backend/src/services/muralResolver.js`
- `backend/src/controllers/muralController.js`
- `backend/src/controllers/materiaisAvaliativosController.js`
- `backend/src/controllers/turmaAulasController.js`
- `frontend/components/PortalShell.js`

## 2. Apagar estes arquivos/pastas do repositório (limpeza de código morto — Pacote B.2)

Backend:
- `backend/src/routes/index.js`
- `backend/src/controllers/authController.js`
- `backend/src/controllers/dashboardController.js`
- `backend/src/controllers/clientesController.js`
- `backend/src/controllers/usersController.js`
- `backend/src/controllers/treinamentosController.js`
- `backend/src/controllers/presencasController.js`
- `backend/src/controllers/avaliacoesController.js`
- `backend/src/controllers/trilhasController.js`
- `backend/src/controllers/avaliacoesResultadosController.js`
- `backend/src/db.js`
- `backend/src/database.js`
- `backend/src/logo-td.png`

Frontend:
- pasta `frontend/patches/` inteira (4 arquivos)

Raiz do projeto:
- `INSTRUCOES.md`
- `LEIA-ME.md`
- `LEIA_PRIMEIRO.md`
- `LEIA_PRIMEIRO.txt`
- `README.txt`
- `README_APLICAR.md`
- `README_APLICAR.txt`
- `README_ATUALIZACAO.txt`

(Mantenha o `README.md` da raiz — esse é o real, não é lixo.)

## 3. Depois de subir

A migration nova (`dados_bancarios_colaborador.empresa_id`) roda sozinha no próximo deploy do backend — não precisa rodar nada manualmente.

Nenhuma dessas mudanças pede migração de dado manual nem afeta layout de tela — são todas correções de acesso no backend + a reintrodução do `menuRoles` no menu lateral (frontend).

Detalhes de cada item, o que foi testado e como, estão no relatório em anexo/no projeto: `claude/relatorio-pacote-ab-seguranca-2026-09-15.md`.
