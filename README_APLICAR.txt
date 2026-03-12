REBUILD COMPLETO - BACKEND E FRONTEND DO ZERO

ORDEM DE ATUALIZACAO

1. BACKEND
   - exclua a pasta backend atual do repositório
   - envie a pasta backend deste pacote
   - no Railway, confirme as variáveis:
     MYSQLHOST
     MYSQLPORT
     MYSQLUSER
     MYSQLPASSWORD
     MYSQLDATABASE
     JWT_SECRET
   - aguarde o deploy do Railway

2. FRONTEND
   - exclua a pasta frontend atual do repositório
   - envie a pasta frontend deste pacote
   - na Vercel, confirme:
     Root Directory = frontend
     NEXT_PUBLIC_API_URL = URL do backend + /api
     exemplo:
     https://seu-backend.up.railway.app/api
   - aguarde o deploy da Vercel

3. TESTE
   - /login
   - /inicio
   - /clientes
   - /dashboard
   - /usuarios
   - /treinamentos
   - /presencas
   - /avaliacoes

OBSERVACAO
- /dashboard redireciona para /inicio
- /clientes usa fallback local e tenta API
- login redireciona para /inicio
