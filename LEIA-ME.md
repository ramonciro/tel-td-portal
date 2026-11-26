# Pacote 5 — Controle de migrações do banco (G7) (26/11/2026)

Sobe por cima dos Pacotes 1 a 4. **Não muda nenhuma regra nem tela do portal**: muda a forma de controlar as mudanças do banco daqui para frente. Na primeira subida cria a tabela `schema_migrations` (e aplica a migração 0001, que só garante a tabela `sistema_jobs`, que já existe).

## O que mudou, em uma frase
O servidor passa a **registrar** o que migrou e quando, a rodar mudanças novas como **arquivos numerados** (cada um roda uma única vez) e a **avisar** quando um passo antigo falha e segue em silêncio.

## O que eu medi antes de mexer (e por que o escopo é este)
- Em produção, as migrações levam **menos de 1 segundo** na subida (logs do Railway). Então o ganho de "subir mais rápido" que eu tinha citado na revisão **não existe**; retiro esse argumento.
- O `migrate.js` antigo faz, em toda subida, **acertos de dados recorrentes** (por exemplo, preencher operação/admissão no cadastro da pessoa, alinhar datas da chamada, ligar RPs a clientes). Se eu parasse de rodá-lo, esses acertos deixariam de acontecer e o comportamento do portal mudaria. Por isso **o legado continua rodando em toda subida, igual a hoje**.
- O ganho real é outro: (1) histórico do que rodou, (2) mudanças novas em arquivos pequenos, testáveis, que **param o servidor se falharem** (o legado engole erros com "não concluído — seguindo"), (3) trava para duas instâncias não migrarem ao mesmo tempo. Nos logs de produção de hoje não apareceu nenhum "não concluído", ou seja, o legado está limpo.
- Correção do que escrevi na revisão: a pasta `database/migrations` não existia; a pasta nova se chama `database/migracoes`.

## Como passa a funcionar
1. Pega uma trava no banco (`GET_LOCK`).
2. Roda o legado (`migrate.js`) como sempre, medindo a duração e **contando os passos que falharam e seguiram**.
3. Aplica as migrações numeradas que faltam (`backend/src/database/migracoes/NNNN_nome.js`), em ordem. Cada uma é registrada. Se uma falhar, o servidor para, mostra qual foi, e tenta de novo na próxima subida.
4. Se alguém editar uma migração já aplicada, ela **não roda de novo** e a tela de saúde avisa.

## Regra daqui para frente
Mudança de banco nova = arquivo novo em `migracoes/` (veja `migracoes/LEIA-ME.md`). Não editar o `migrate.js`.

## Tela de saúde
O cartão "Banco de dados" mostra quantas migrações numeradas foram aplicadas, a última, e quanto o legado levou. Se algum passo do legado falhar e seguir, ou se uma migração aplicada for alterada, o aviso geral vira "Atenção" com o detalhe.

## Arquivos
- `backend/src/database/runner.js` (novo) e `backend/src/database/migracoes/` (novo: `0001_sistema_jobs.js`, `LEIA-ME.md`)
- `backend/src/index.js` (usa o controle na subida; saúde mostra o estado das migrações)
- `backend/src/scripts/bancoDoZero.js` (usa o mesmo controle)
- `backend/tests/`: `migracoes-numeradas.test.js` (novo, 8 testes), `preparar-banco.js`, `saude-do-sistema.test.js`
- `frontend/app/admin/saude/page.js`

## Verificado
Suíte completa: **48 testes passando** (40 anteriores + 8 novos); sintaxe, lint e build ok. Teste de mutação: desligando a regra "não repetir migração aplicada", 4 testes falham. Ensaio de subida real: banco que já tinha tudo e **não** tinha `schema_migrations` (igual ao de produção) subiu normalmente, registrou o legado (132 ms, 0 avisos) e a 0001, e `/api/health` ficou ok.

## Como conferir depois de subir
1. Railway: deploy concluído; no log deve aparecer "[migracoes] aplicando 0001_sistema_jobs…" só nesta primeira vez e "✅ Migrações executadas com sucesso".
2. `/api/health` ok; GitHub *Actions* ✓.
3. Saúde do sistema → cartão do banco: "1 migração(ões) numerada(s) · última: 0001_sistema_jobs … · legado rodou em … ms", sem avisos amarelos.

## Como reverter
Subir de novo o Pacote 4 (o `index.js` volta a chamar o `migrate.js` direto). A tabela `schema_migrations` pode ficar; não atrapalha.
