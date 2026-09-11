# Hotfix — filtro de Supervisor sempre vazio no Dashboard

Achado durante o teste em produção logo após o deploy do Pacote 2 (não é
item do Pacote 2 — é um bug pré-existente, só ficou visível agora porque
fui olhar os logs do Railway depois do deploy).

## O que estava acontecendo

A query principal que alimenta o Dashboard de Treinamentos (`GET
/api/dashboard/treinamentos`) e a exportação em Excel falhava **sempre**
em produção (nunca localmente, por isso nunca foi percebido antes) por
causa do modo mais rígido do MySQL do Railway (`ONLY_FULL_GROUP_BY`) —
confirmei isso lendo o log de runtime do deploy mais recente:

```
[dashboard] query completa falhou, usando fallback: Expression #18 of
SELECT list is not in GROUP BY clause...
```

O sistema tem um fallback automático para não derrubar a tela, mas esse
fallback sempre grava o campo "Supervisor" como vazio. Resultado prático:
**o filtro de Supervisor do Dashboard sempre esteve vazio, sem nenhuma
opção pra selecionar**, desde que essa tela existe — nunca gerou erro
visível pro usuário, só uma funcionalidade quieta e permanentemente quebrada.

## Correção

Uma linha: as colunas que vêm de uma subconsulta (`hist.dias`,
`hist.presentes` etc.) precisavam estar explicitamente no `GROUP BY` para
o MySQL aceitar a query — não muda nenhum resultado (são um valor só por
treinamento), só satisfaz a checagem mais rígida. Detalhe completo do
porquê no comentário adicionado no próprio código.

## Como aplicar

Substitua `backend/src/controllers/dashboardTreinamentosController.js`
pelo arquivo deste zip. Nenhuma outra mudança, nenhuma migration nova.

## Teste

Reproduzi o erro exato de produção localmente (setando o mesmo
`sql_mode=ONLY_FULL_GROUP_BY` do Railway, que o MySQL local não usa por
padrão — por isso passou despercebido antes) e confirmei que a query
original falha e a corrigida funciona; testei a função do controller de
ponta a ponta (não só a query solta) e confirmei que o filtro de
Supervisor passa a vir preenchido; testei também a exportação em Excel
sob o mesmo modo estrito, sem erro. Também revisei as outras 4 queries
com `GROUP BY` do backend — nenhuma tem esse mesmo problema.
