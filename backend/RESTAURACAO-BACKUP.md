# Teste de restauração do backup

Backup que nunca foi restaurado é só esperança. Este roteiro confirma que o dump guardado no bucket realmente volta a virar um banco funcionando.

**O que existe:** todo dia às 02h30 (Brasília) o portal grava no bucket um dump em `db/AAAA/MM/portal-td_AAAA-MM-DD_0230.sql.gz` e sincroniza os uploads.

**Atenção:** dumps feitos **antes** do Pacote 7 não restauram em MySQL (a coluna calculada de `respostas_avaliativas` era gravada e o MySQL recusa). Use um dump feito **depois** do deploy do Pacote 7, ou seja, o de 02h30 do dia seguinte.

## Passo a passo

1. **Baixe o dump** mais recente: no painel do bucket (Cloudflare R2 ou similar), pasta `db/`, arquivo mais novo. Guarde no seu computador.
2. **Crie um MySQL descartável** (nunca use o de produção): no Railway, crie um projeto novo chamado `teste-restauracao`, clique em *New → Database → MySQL*. Na aba *Variables* do serviço MySQL anote: host público (`MYSQL_PUBLIC_URL` mostra host e porta), usuário, senha e nome do banco.
3. **Na pasta `backend` do projeto** (Node 22; rode `npm install` se for a primeira vez), aponte para o banco de **teste** e restaure. No PowerShell:

   ```
   $env:MYSQLHOST="<host público>"
   $env:MYSQLPORT="<porta>"
   $env:MYSQLUSER="<usuário>"
   $env:MYSQLPASSWORD="<senha>"
   $env:MYSQLDATABASE="<banco>"
   node src/scripts/restaurarBackup.js --arquivo "C:\caminho\portal-td_AAAA-MM-DD_0230.sql.gz" --confirmo
   ```

   O script imprime `Destino: ...` antes de escrever: confira que é o banco de teste. Se o banco já tiver tabelas ele pede `--forcar`.
4. **Resultado esperado** (as duas últimas linhas):

   ```
   Conferência: backup diz N tabelas e M linhas; o banco restaurado tem N tabelas e M linhas — CONFERE.
   Banco restaurado e conferido.
   ```

   Se aparecer `DIVERGE` ou `ERRO`, o script mostra o comando que falhou e quantos já tinham rodado. Me mande a mensagem.
5. **Confira com a produção:** no banco restaurado rode `SELECT COUNT(*) FROM usuarios;`, `pessoas` e `treinamentos`, e compare com o banco de produção. A diferença esperada é só o que entrou depois das 02h30.
6. **(Opcional) suba o portal sobre o banco restaurado:** com as mesmas variáveis e um `JWT_SECRET` qualquer, rode `npm start`. Deve terminar com "Migrações executadas com sucesso" e permitir login com um usuário real.
7. **Uploads (opcional):** `node src/scripts/restaurarBackup.js --uploads --confirmo` baixa os arquivos do bucket para a pasta de uploads local; abra um ou dois PDFs para conferir.
8. **Apague o projeto `teste-restauracao`** no Railway para não gerar custo.

## Cuidados

- O dump contém dados pessoais e senhas (em hash). Não envie por e-mail nem deixe em pasta compartilhada; apague depois do teste.
- Nunca rode o script com as variáveis de produção: ele recria cada tabela do zero.
