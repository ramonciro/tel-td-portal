# Pacote 5b — CORREÇÃO URGENTE do Pacote 5 (26/11/2026)

Sobe por cima do Pacote 5. São só 3 arquivos. Sem migração manual.

## O que aconteceu
O Pacote 5 usava uma tabela de controle chamada `schema_migrations`. Em produção **já existia** uma tabela com esse nome, de outro formato (não é do código do portal). O `CREATE TABLE IF NOT EXISTS` não a alterou e o primeiro `INSERT` falhou com "Unknown column 'tipo'". O servidor parou de subir (deploy CRASHED). **Nenhum dado foi alterado**: o erro acontece depois de o legado rodar e antes de qualquer migração numerada.

## O que esta correção faz
1. A tabela de controle passa a se chamar **`td_migracoes_controle`** (nome próprio). A `schema_migrations` que já existe **não é lida nem alterada**.
2. Se a tabela de controle já existir com formato diferente, o sistema para com uma mensagem clara (quais colunas faltam), em vez de "Unknown column".
3. O registro da execução do **legado** passou a ser "melhor esforço": se falhar, a subida do servidor **não cai** por causa disso (só as migrações numeradas, quando falham, param o servidor).

## Por que não apareceu nos testes e o que mudou neles
Os testes e o ensaio de subida usavam um banco sem essa tabela alheia. Agora há 4 testes novos, incluindo o cenário exato de produção (banco com uma `schema_migrations` de outro formato): a subida funciona e a tabela alheia continua intacta. Suíte completa: **52 testes passando**. Ensaio de subida real com esse cenário: servidor subiu, `/api/health` ok, registrou o legado e a migração 0001, e na segunda subida não aplicou nada de novo.

## Arquivos
- `backend/src/database/runner.js`
- `backend/src/database/migracoes/LEIA-ME.md`
- `backend/tests/migracoes-numeradas.test.js`

## Como conferir depois de subir
1. Railway: deploy em SUCCESS; no log "[migracoes] aplicando 0001_sistema_jobs…" (só desta vez) e "✅ Migrações executadas com sucesso".
2. `/api/health` ok.
3. Tela de Saúde do sistema: cartão do banco com "1 migração numerada" e o tempo do legado.
