# Correção da causa raiz — coluna `usuarios.criado_em` ausente em produção

**Contexto:** depois de aplicar o hotfix do vazamento de usuários entre
tenants, confirmei pelos logs do Railway que ele está no ar e funcionando
— mas os logs também revelaram a causa raiz exata do erro que disparava o
fallback: `Unknown column 'criado_em' in 'field list'`. Este pacote
resolve isso.

## O que estava acontecendo

O banco de produção tem a tabela `usuarios` desde antes da coluna
`criado_em` ter sido adicionada ao schema deste projeto. Como a criação de
tabelas usa `CREATE TABLE IF NOT EXISTS`, isso nunca altera uma tabela que
já existe — então, embora o código já "soubesse" sobre essa coluna, ela
nunca chegou a ser criada em produção de fato. Resultado: toda consulta
que buscava usuários de um tenant específico (a tela `/admin/empresa/[id]`)
falhava, o que era exatamente o gatilho do vazamento corrigido no hotfix
anterior.

O hotfix anterior já resolve o vazamento em si (a consulta agora nunca
cai num fallback sem filtro de tenant). Esta correção aqui vai além: trata
a causa raiz, para a consulta completa voltar a funcionar sem precisar do
fallback.

## O que foi corrigido

**1 arquivo:** `backend/src/database/migrate.js` — adicionado mais um
passo de migração automática (o projeto já roda uma rotina de migração
sempre que o backend sobe, com vários passos parecidos com este). O passo
novo verifica se a coluna `usuarios.criado_em` existe e, se não existir,
cria (`TIMESTAMP DEFAULT CURRENT_TIMESTAMP`) — sem precisar de nenhuma
ação manual no banco de produção. É seguro rodar quantas vezes o backend
reiniciar: se a coluna já existe, não faz nada.

## Efeito colateral esperado (transparência)

Usuários que já existiam antes desta migração vão passar a mostrar a data
de hoje (data em que a migração rodar) como "criado em", porque o banco
nunca teve o dado real dessa data para esses registros — não tem como
recuperar a data de criação verdadeira deles. Usuários novos, cadastrados
depois desta migração, vão ter a data real desde o começo. Isso afeta só
a exibição de "criado em" na tela de gestão do tenant; não afeta nenhuma
outra funcionalidade.

## Como aplicar

Substitua `backend/src/database/migrate.js` pelo arquivo deste pacote.
Nenhuma ação manual no banco é necessária — a migração roda sozinha na
próxima vez que o backend subir no Railway (é assim que todas as
migrações deste projeto já funcionam).

## O que já foi testado antes de entregar

Reproduzi localmente o exato estado do banco de produção (removi a coluna
`criado_em` de `usuarios` no banco de teste) e confirmei:

- Ao reiniciar o backend, a migração detectou a ausência da coluna e
  recriou automaticamente (log: `coluna adicionada: usuarios.criado_em`).
- Depois disso, a consulta completa de usuários por tenant voltou a
  funcionar sem erro nenhum — testei com os dois tenants de teste e cada
  um continuou vendo só os próprios usuários, agora com a data de criação
  de volta.
- Reiniciei o backend de novo (coluna já existente) e confirmei que a
  migração não tenta recriar nem gera erro — idempotente, como as outras
  migrações do projeto.
