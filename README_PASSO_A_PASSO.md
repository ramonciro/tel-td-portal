# TEL T&D PORTAL v1.0 — Pacote Completo

## O que está no pacote
- `backend/` → subir no Railway
- `frontend/` → subir na Vercel
- `database/teltd_schema.sql` → importar no MySQL

## PASSO 1 — Banco de dados no Railway
1. Crie um projeto no Railway
2. Adicione um serviço **MySQL**
3. Confirme as variáveis:
   - `MYSQLHOST`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`
   - `MYSQLPORT`

## PASSO 2 — Importar o banco
1. Abra um cliente MySQL
2. Rode o arquivo `database/teltd_schema.sql`

### Usuário padrão
- E-mail: `admin@teltd.com`
- Senha: `Tel@2026`

## PASSO 3 — Backend no Railway
1. Envie a pasta `backend` para o GitHub
2. No Railway:
   - New Project
   - Deploy from GitHub
3. Em **Settings**
   - Root Directory = `backend`
   - Builder = `Dockerfile`
4. Faça o deploy

### Teste a API
- `/api`
- `/api/dashboard`

## PASSO 4 — Frontend na Vercel
1. Envie a pasta `frontend` para o GitHub
2. Importe o projeto na Vercel
3. Em **Project Settings > Environment Variables**
   crie `NEXT_PUBLIC_API_URL`

### Valor
`https://SEU_BACKEND.up.railway.app/api`

4. Faça o deploy

## PASSO 5 — Validar login
Abra `/login` na Vercel
Use:
- `admin@teltd.com`
- `Tel@2026`

## PASSO 6 — Páginas disponíveis
- `/inicio`
- `/clientes`
- `/usuarios`
- `/treinamentos`
- `/presencas`
- `/avaliacoes`
- `/biblioteca`
- `/trilhas`
- `/mapa-desenvolvimento`
- `/evolucao-colaborador`

## Observações
- O login desta versão é simples, sem criptografia
- Esta versão foi preparada para subir e funcionar
- Próxima evolução ideal:
  - JWT real
  - troca obrigatória de senha
  - permissões por perfil
  - dashboard estratégico avançado
