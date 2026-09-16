# Pacote 1 + 2 (Dashboard, CH por Instrutor, Scorecard, Oceano) — 16/09/2026

Este zip só tem o que muda nesta rodada. Aplique assim:

## 1. Substituir estes 7 arquivos no seu repositório (mesmo caminho)

- `backend/src/services/capacidadeResolver.js`
- `backend/src/services/desempenhoInstrutorResolver.js`
- `backend/src/services/resumoExecutivoService.js`
- `backend/src/controllers/capacidadeController.js`
- `backend/src/routes/capacidadeRoutes.js`
- `frontend/app/dashboard/page.js`
- `frontend/app/capacidade/page.js`

## 2. Nada de ação manual

Sem migração de banco nova, sem mudança de schema, sem reatribuição de perfil. É tudo cálculo/exibição — o único jeito de "sair da lista de ativos" em CH por Instrutor é o usuário já estar com `ativo = 0` no cadastro (Gestão de Usuários), que já é como você desativa alguém hoje.

## 3. O que muda pra você ver

- **Dashboard:** filtros não estouram mais a página (tinha um CSS faltando), e a grade se ajusta melhor em tela estreita.
- **CH por Instrutor:** quem está desativado em Gestão de Usuários não aparece mais como "ocioso" no mês atual nem nos alertas — mas o histórico dele (meses em que ele realmente trabalhou) continua intacto em todas as visões. Também não aparece mais no dropdown de filtro/criação de exceção manual.
- **CH por Instrutor — nova tabela "por instrutor × cliente":** mostra quanto de cada instrutor foi pra cada cliente no período, ao lado da capacidade e ocupação total dele.
- **Scorecard por instrutor:** índice geral agora é 100% frequência — NPS saiu da conta (continua aparecendo na tela, só não pesa mais no número).
- **Oceano (resumo executivo):** os alertas de "fora da faixa saudável" agora citam só frequência — NPS saiu de lá também.

Detalhes completos no relatório em anexo/no projeto: `claude/relatorio-pacote1-2-ch-scorecard-oceano-dashboard-2026-09-16.md`.
