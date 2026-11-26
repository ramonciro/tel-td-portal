# Testes automatizados do backend

Rodam contra um **banco MySQL/MariaDB descartável** (nunca o de produção: os testes se recusam a rodar se o banco não for local e se o nome não tiver "test").

## Rodar no GitHub
Automático: a cada push o workflow "Verificação" sobe um MySQL 9, cria o banco do zero e roda tudo (`npm test`).

## Rodar no seu computador
É preciso ter um MySQL (ou MariaDB) local. Depois:

```
cd backend
npm ci
TEST_MYSQLHOST=127.0.0.1 TEST_MYSQLPORT=3306 TEST_MYSQLUSER=root TEST_MYSQLPASSWORD=suasenha npm test
```
Variáveis opcionais: `TEST_MYSQLDATABASE` (padrão `td_test`). As variáveis `MYSQL*` normais são ignoradas de propósito.
`npm test` recria o banco (estrutura-base + migrações) e roda tudo em ~30 s. `npm run test:rapido` pula a recriação.

## O que cobrem
- `regras-avaliacao-tecnica.test.js` — falta justificada = falta; desistente sai das contas; 3 faltas = eliminado (desistência automática + Reprovado); desfazer não elimina de novo.
- `radar-por-ambiente.test.js` — Radar × R&S: cada ambiente só vê as RPs dos seus clientes; cliente criado pelo R&S não é cliente do T&D.
- `subtipos-por-ambiente.test.js` — catálogo de subtipos por ambiente (criar, renomear, desativar, migração).
- `isolamento-entre-ambientes.test.js` — **todas as rotas GET** da API (≈280) × 6 perfis, com dados marcados nos dois ambientes em 100+ tabelas: nada do ambiente B pode aparecer para o A. Inclui a **catraca**: se alguém escrever uma consulta nova numa tabela de ambiente sem filtrar por `empresa_id`, o teste falha.
- `isolamento-escrita.test.js` — **todas as rotas de escrita** (POST/PUT/PATCH/DELETE) disparadas por usuários do ambiente A com ids/empresa_id do B: nenhuma linha do B pode mudar.

## Quando a catraca falhar
A mensagem lista a consulta nova e a rota que a executou. Se faltou o filtro de ambiente, corrija a consulta. Se ela é segura (por exemplo o id já foi validado antes), registre com `npm run test:baseline` e envie o arquivo `tests/consultas-sem-ambiente.baseline.json` junto.

## Limites (honestos)
- A semente genérica nem sempre passa pelos filtros de status/data de cada tela; por isso o teste confirma dados do próprio ambiente em ~40 rotas e confere também o campo `empresa_id` de qualquer linha devolvida. Rota que depende de dados muito específicos pode não ser exercitada — acrescente um teste dedicado quando mexer nela.
- Rotas que cruzam ambientes de propósito (assistente de treinamento, superintendente, Super Admin) ficam de fora.
- `/api/auth/ambientes` é pública de propósito (seletor de ambiente do login) e está liberada no teste.
