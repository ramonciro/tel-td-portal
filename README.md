# Sprint 1 — Deploy Guide

## Arquivos entregues

```
sprint1/
  backend/src/
    middlewares/clientMiddleware.js   ← SUBSTITUIR (import corrigido + lógica empresa_id)
    controllers/authController.js    ← SUBSTITUIR (empresa_id no JWT)
    routes/entityCrud.js             ← SUBSTITUIR (suporte a multiTenant: true)
    index.js                         ← SUBSTITUIR (8 fixes aplicados)
  database/migrations/
    sprint1_multi_tenant.sql         ← RODAR UMA VEZ no banco de produção
  frontend/app/
    evolucao-colaborador/page.js     ← SUBSTITUIR (RBAC + sem hole de /usuarios)
```

---

## Ordem de execução

### 1. Banco de dados (PRIMEIRO)

```bash
mysql -u root -p teltd < database/migrations/sprint1_multi_tenant.sql
```

Verifique o SELECT de verificação ao final do script — deve retornar uma linha
por cada tabela confirmando que `empresa_id` foi criado.

### 2. Backend

Substitua os 4 arquivos de backend. Reinicie o servidor:

```bash
# Railway / PM2
pm2 restart portal-backend

# ou
node src/index.js
```

### 3. Frontend

Substitua `evolucao-colaborador/page.js`. O Next.js faz rebuild automático
no Vercel ao fazer push — não é necessário nenhum comando adicional.

---

## Arquivos a REMOVER do projeto

| Arquivo | Motivo |
|---|---|
| `PortalShell.js` (raiz do projeto) | Idêntico ao de `frontend/components/` — nunca importado. O de `components/` é o correto. |
| `database/migrate.js` (raiz) | O servidor usa `backend/src/database/migrate.js`. A versão da raiz não é carregada. |

> ⚠️ NÃO remover `frontend/components/PortalShell.js` — é este que todas as páginas usam.

---

## O que cada fix faz

### clientMiddleware.js
- **Antes:** `require('../config/database')` — caminho inexistente, middleware crasharia se chamado
- **Agora:** `require('../lib/db')` — pool correto. Lê `empresa_id` do JWT e valida a empresa no banco

### authController.js
- **Antes:** JWT não incluía `empresa_id`, `nome` ou `pode_acessar_oceano_desenvolvimento`
- **Agora:** Todos incluídos. Login também valida que usuário tem senha hash (guard contra senha vazia)

### entityCrud.js
- **Antes:** Todas as queries sem filtro de tenant — dados misturados entre empresas
- **Agora:** Flag `multiTenant: true` ativa isolamento automático em GET/POST/PUT/DELETE

### index.js — 8 fixes
1. `clientMiddleware` importado e aplicado globalmente (`app.use(clientMiddleware)`)
2. `multiTenant: true` em: clientes, usuarios, treinamentos, trilhas_aprendizagem
3. `empresa_id` adicionado aos fields de usuarios
4. `GET /api/zerar-dashboard` → `POST` (TRUNCATE nunca deve ser GET)
5. `GET /api/importar-dashboard` → `POST`
6. `authRequired` adicionado ao `/api/jornadas-etapas` (estava desprotegido)

### evolucao-colaborador/page.js
- **Antes:** Buscava `/usuarios` sem restrição (treinandos viam todos os colaboradores)
- **Antes:** Buscava `/presencas` sem filtro (milhares de registros)
- **Agora:** Três visões distintas por perfil:
  - **Treinando:** vê só seu próprio histórico (frequência + notas pessoais)
  - **Instrutor:** vê só turmas onde é instrutor
  - **Coordenador/Supervisor:** busca por nome com autocomplete, histórico completo

---

## Ativação do multiTenant nas próximas tabelas

Após rodar a migration, adicionar `multiTenant: true` nas rotas que ainda faltam:

```js
// index.js — avaliacoes (entityCrud)
// Localizar o app.use("/api/avaliacoes", createCrudRouter({...
// Adicionar: multiTenant: true,

// index.js — materiais-avaliativos
// Adicionar: multiTenant: true,

// index.js — biblioteca
// Adicionar: multiTenant: true,

// index.js — necessidades (usa controller próprio, não entityCrud)
// necessidadesController.js → listarNecessidades() → adicionar filtro empresa_id
```

Estes foram deixados para Sprint 2 para não expandir o escopo do Sprint 1.
O isolamento crítico (treinamentos, usuarios, trilhas, clientes) já está coberto.

---

## Testes de validação pós-deploy

```bash
# 1. Login retorna empresa_id?
curl -X POST https://seu-backend/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","senha":"senha"}' \
  | jq '.user.empresa_id'

# 2. Rota de zerar agora é POST (GET deve retornar 404)
curl https://seu-backend/api/zerar-dashboard
# Esperado: 404 ou "Cannot GET"

# 3. jornadas-etapas sem token retorna 401
curl https://seu-backend/api/jornadas-etapas
# Esperado: 401 Unauthorized

# 4. Dados de treinamentos filtrados por empresa
# (requer dois usuários de empresas diferentes — verificar que não se cruzam)
```
