# Banco do zero — criar um ambiente novo do Portal T&D

Atualizado em 04/11/2026.

## Para que serve
Subir um banco **vazio** já com toda a estrutura do portal (ambiente novo, teste de restauração, cliente novo em outro servidor). O `migrate.js` sozinho não faz isso: ele só evolui um banco que já existe, e algumas tabelas antigas (por exemplo `materiais_avaliativos` e `respostas_avaliativas`) nunca foram criadas por ele.

## Como funciona
1. `database/baseline/estrutura_base.sql`: estrutura de todas as tabelas (90), sem dados, só com `CREATE TABLE IF NOT EXISTS`. Já vem sem a chave estrangeira antiga `treinamentos.necessidade_id → necessidades`, com colunas JSON como JSON e sem COLLATE fixo (vale o padrão do banco).
2. `migrate.js`: completa e ajusta o que for preciso (e cria `usuarios.super_admin`, que antes só existia nos .sql manuais).
3. Opcional: cria o ambiente inicial e o primeiro super administrador.

## Passo a passo
1. Crie o banco vazio no MySQL 8: `CREATE DATABASE nome CHARACTER SET utf8mb4;`
2. Aponte as variáveis do backend para ele: `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT` (e `JWT_SECRET` para subir o servidor depois).
3. Na pasta `backend/`:
   - só a estrutura: `npm run db:zero`
   - com o primeiro administrador:
     `BOOTSTRAP_ADMIN_EMAIL=voce@empresa.com BOOTSTRAP_ADMIN_SENHA='sua-senha' BOOTSTRAP_EMPRESA_NOME='Comércio' BOOTSTRAP_EMPRESA_CODIGO=comercio node src/scripts/bancoDoZero.js --confirmo`
   (opcionais: `BOOTSTRAP_ADMIN_NOME`). A senha vem só da variável de ambiente, tem de ter 6+ caracteres e nunca é impressa.
4. Suba o backend normalmente e entre com o e-mail e a senha do administrador. Os demais ambientes e usuários são criados pelo painel admin.

## Segurança
- Sem `--confirmo`, nada é feito.
- Se o banco de destino já tiver tabelas, o script recusa. `--forcar` libera (a base só cria o que falta e não apaga nada).
- **Nunca aponte para o banco de produção** sem necessidade: não é o caminho para restaurar backup (para isso use `restaurarBackup.js`, ver `RESTAURACAO-BACKUP.md`).

## Cuidados com a base
- A base é uma fotografia do esquema em 04/11/2026. Mudanças futuras continuam entrando pelo `migrate.js`; a base só precisa ser regenerada quando se quiser reduzir o trabalho das migrações num banco novo.
- O `migrate.js` ainda semeia dados de exemplo em todo banco novo: 6 salas, os subtipos padrão, 3 planos, a regra padrão de capacidade e **5 instrutores já desligados** com nomes reais (bloco `DESLIGADOS_INICIAIS`). Em ambiente novo de outro cliente, vale revisar/limpar esse bloco.

## Como foi conferido
Banco em branco → base → migrações: 1.038 colunas, 280 índices e 23 chaves estrangeiras idênticos aos do banco de referência já migrado; rodar de novo recusa (banco não vazio); rodar com `--forcar` não altera nada; backend sobe, login do administrador funciona e as rotas principais respondem 200.
