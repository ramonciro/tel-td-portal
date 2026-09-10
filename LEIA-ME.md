# Fase 4 — Risco estrutural: isolamento multi-tenant (pacote completo)

Pacote com todas as correções da reauditoria de isolamento multi-tenant, testadas de ponta a ponta.

## Conteúdo (16 arquivos — todos os arquivos novos/alterados da Fase 4)

**Backend**
- `backend/src/middlewares/clientMiddleware.js` — a correção mais importante do pacote: fecha o modo "aberto por falha" que dava acesso total a contas sem empresa definida ou em caso de erro interno (ver relatório, item 1)
- `backend/src/routes/entityCrud.js` — adiciona os recursos `beforeWrite` (validação/transformação antes de gravar) e `hideFields` (esconder campos sensíveis na listagem) ao roteador genérico de CRUD, usados pelas correções abaixo
- `backend/src/index.js` — bloqueio de escalonamento a super_admin e hash de senha no cadastro de usuário; permissão elevada nos endpoints que apagavam dados de todas as empresas; correção de rota de turma sem filtro; correção de acesso ao Oceano em `/api/jornadas-etapas`
- `backend/src/database/migrate.js` — nova coluna `empresa_id` e nova regra de unicidade em `capacidade_instrutor_mensal` (Item 24)
- `backend/src/services/tenantValidation.js` — **novo arquivo**, helpers compartilhados de validação de pertencimento ao tenant (usuário e turma)
- `backend/src/services/presencaResolver.js`, `backend/src/controllers/frequenciaIndividualController.js` — corrige vazamento completo de frequência entre empresas
- `backend/src/services/capacidadeResolver.js`, `backend/src/controllers/capacidadeController.js` — isolamento dos overrides de capacidade por instrutor
- `backend/src/controllers/jornadasDesenvolvimentoController.js`, `jornadasEtapasController.js`, `acoesDesenvolvimentoController.js`, `coachingPlanosController.js` — validação de responsável/turma vinculados no Oceano do Desenvolvimento
- `backend/src/controllers/respostasAvaliativasController.js` — validação de material vinculado à turma
- `backend/src/controllers/treinamentoParticipantesController.js` — corrige registro de presença sem empresa_id no fluxo de chamada
- `backend/src/controllers/trilhasRelacionaisController.js` — corrige fraude de conquista via etapa de trilha inexistente

## Decisão que rege toda a Fase 4

Reauditoria cética e completa (não presumi que a correção anterior de 06/09 tivesse coberto tudo), usando o schema real de produção como mapa. Tudo que foi encontrado foi corrigido nesta mesma entrega, exceto dois itens que não são bugs de isolamento e por isso ficaram fora do escopo — ver o relatório para os detalhes e a pergunta que precisa da sua decisão (Biblioteca quebrada em produção; regra de capacidade global vs. por empresa).

## Validação feita antes deste pacote

- Ambiente local com dois tenants reais e uma conta legada sem empresa, reproduzindo os cenários exatos das brechas.
- Migração completa testada do zero (banco vazio) — confirma que um tenant novo (Comércio/IBM/Dasa) sobe corretamente com a nova coluna/regra de `capacidade_instrutor_mensal`.
- 12 verificações automatizadas de ponta a ponta (HTTP real) cobrindo cada vazamento corrigido — todas passando, inclusive depois de reiniciar o ambiente do zero.
- Teste de regressão nas telas centrais herdadas das fases anteriores (Dashboard, Turmas, Avaliações, Presenças, Usuários, Capacidade, Oceano) — sem quebras.
- Reauditoria das tabelas/serviços da Fase 3 (gamificação) com o mesmo rigor — sem novos achados.

## Como aplicar

1. Substituir os 16 arquivos acima nos mesmos caminhos do seu repositório.
2. Commit + push para o GitHub (Railway faz o deploy automático a partir do push).
3. Nenhuma variável de ambiente nova é necessária.
4. A migração roda automaticamente no boot do backend (mesmo padrão já usado nas fases anteriores) — vai adicionar a coluna `empresa_id` e trocar a regra de unicidade em `capacidade_instrutor_mensal` (tabela vazia em produção hoje, então é seguro).

Relatório completo com todos os 15 achados, decisões e os dois itens que aguardam sua decisão: `claude/relatorio-fase4-isolamento-multitenant-2026-09.md` no projeto.
