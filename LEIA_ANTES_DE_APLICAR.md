# Pacote 3 — Redesign de telas — Leia antes de aplicar

## O que tem neste zip

10 arquivos, todos para **substituir** o arquivo equivalente no repositório (mesmo caminho).
Nenhum arquivo novo de configuração, nenhuma migração de banco — é só código de telas e de exportação.

```
backend/src/lib/excelExport.js                          (NOVO arquivo)
backend/src/controllers/analyticsController.js
backend/src/controllers/dashboardTreinamentosController.js
backend/src/controllers/rsController.js
backend/src/controllers/desempenhoInstrutorController.js
backend/src/controllers/acoesDesenvolvimentoController.js
backend/src/index.js
frontend/app/dashboard/page.js
frontend/app/usuarios/page.js
frontend/app/treinamentos/page.js
```

## Como aplicar

1. No GitHub, suba cada arquivo acima no mesmo caminho, substituindo o existente
   (`excelExport.js` é arquivo novo — crie a pasta `backend/src/lib/` se ainda não existir lá,
   embora ela já deva existir).
2. Railway (backend) e Vercel (frontend) fazem o deploy automático assim que o `main` for atualizado.
3. Não precisa rodar nenhuma migração — não há mudança de banco neste pacote.

## O que testar depois do deploy

- Abra **Indicadores**, **Dashboard** (card "Turmas recentes"), **R&S → Relatório mensal**,
  **Desempenho do instrutor → Scorecard** e **Oceano do Desenvolvimento → Mapa** e exporte cada
  planilha — todas devem abrir com cabeçalho em negrito, cores e formatação de número/data/percentual,
  em vez da planilha crua de antes.
- Na **Gestão de Turmas**, confira se os cartões mostram a sala (quando reservada) com um selo de
  ocupação (verde/amarelo/vermelho conforme previstos vs. capacidade da sala), e teste o botão
  "Selecionar turmas": marque algumas, exporte em lote e, se quiser, exclua em lote.
- No **Dashboard**, confira se os cartões soltos agora aparecem agrupados sob títulos
  ("Visão geral", "Equipe", "Leitura do dia", "Comparativos", "Oceano").
- Em **Gestão de Usuários**, confira se os badges de perfil usam uma paleta mais enxuta e consistente
  (sem os ~50 tons diferentes de antes).
- Em **Treinamentos → Criar/editar turma**, confira se o formulário aparece dividido em três blocos
  com título ("1 Identificação", "2 Cronograma / Local", "3 Classificação / observações") — nenhum
  campo foi removido, só reorganizado.

## Se algo der errado

Qualquer um dos 10 arquivos pode ser revertido individualmente (voltando à versão anterior no GitHub)
sem afetar os outros — não há dependência cruzada de schema nem de rota nova além da que já está
descrita no relatório.
