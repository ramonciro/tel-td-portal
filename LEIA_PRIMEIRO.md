# Sprint 4 — SaaS Foundation
**Data:** Agosto 2026 | **Base:** tel-td-portal-main_backup_3 + Sprint 3

---

## 🔥 Hotfix incluído: login "Erro ao realizar login"

**Causa raiz:** O `authRoutes.js` do Sprint 3 substituiu `SELECT *` por uma lista explícita
de colunas que incluía `empresa_id`. Se a migration do Sprint 1 ainda não foi aplicada
no banco, a coluna `empresa_id` não existe e o MySQL lança:
```
Unknown column 'empresa_id' in 'field list'
```
Isso resulta no 500 "Erro ao realizar login".

**Fix aplicado:** `authRoutes.js` voltou a usar `SELECT *` (como o original), tornando
o login resiliente a migrations pendentes. `empresa_id` e `super_admin` são acessados
com fallback (`?? null`, `|| 0`) e nunca causam erro se a coluna não existir.

---

## Arquivos entregues

### Database

| Arquivo | O que faz |
|---|---|
| `database/migrations/sprint4_saas_foundation.sql` | Estende `empresas` + cria `planos` + flag `super_admin` em `usuarios` |

### Backend

| Arquivo | Tipo | O que é |
|---|---|---|
| `backend/src/middlewares/auth.js` | 🔄 Atualizado | `authorizeRoles` passa `super_admin` em qualquer rota; novo `requireSuperAdmin` |
| `backend/src/routes/authRoutes.js` | 🔥 Hotfix + 🔄 | SELECT * + super_admin no JWT |
| `backend/src/controllers/adminController.js` | 🆕 | CRUD completo de tenants para super_admin |
| `backend/src/index.js` | 🔄 | Rotas `/api/admin/*` registradas |

### Frontend

| Arquivo | Tipo | O que é |
|---|---|---|
| `frontend/app/admin/page.js` | 🆕 | Painel super-admin — todos os tenants, stats, toggle ativo |
| `frontend/app/admin/nova-empresa/page.js` | 🆕 | Wizard 3 passos: dados + admin + revisão |
| `frontend/app/admin/empresa/[id]/page.js` | 🆕 | Detalhes do tenant: uso, usuários, edição, danger zone |
| `frontend/components/PortalShell.js` | 🔄 | Menu `super_admin` + nome do tenant no rodapé do sidebar |

---

## Como aplicar

### 1. Substituir arquivos
Copiar cada arquivo para o caminho equivalente em `tel-td-portal-main/`.

### 2. Executar as migrations (na ordem)
```sql
-- Se ainda não aplicou o Sprint 1:
SOURCE database/migrations/sprint1_multi_tenant.sql;

-- Sprint 3 (se ainda não aplicado):
SOURCE database/migrations/sprint3_lms_core.sql;

-- Sprint 4 (novo):
SOURCE database/migrations/sprint4_saas_foundation.sql;
```

### 3. Criar o primeiro super_admin
Após aplicar a migration, execute no MySQL:
```sql
-- Substitua pelos dados reais
UPDATE usuarios
SET super_admin = 1, perfil = 'super_admin'
WHERE email = 'seu_email@tel.com.br';
```

O usuário com `super_admin = 1` fará login normalmente — o sistema detecta
o flag e retorna `perfil: 'super_admin'` no token automaticamente.

### 4. Redeploy Railway
Os arquivos `auth.js`, `authRoutes.js`, `adminController.js` e `index.js`
foram alterados — necessário redeploy.

---

## Arquitetura do super_admin

```
Login normal
  └─ SELECT * FROM usuarios
       └─ super_admin = 1?
            ├─ SIM → perfil = 'super_admin', empresa_id = null no JWT
            └─ NÃO → perfil normal, empresa_id do tenant

authorizeRoles('coordenador', 'instrutor', ...)
  └─ perfil === 'super_admin'? → passa direto (sem verificar roles)

requireSuperAdmin (rotas /api/admin/*)
  └─ perfil !== 'super_admin'? → 403 imediato

clientMiddleware
  └─ empresa_id = null? → sem filtro de tenant (super_admin vê tudo)
```

---

## Planos criados pela migration

| Plano | Slug | Usuários | Turmas |
|---|---|---|---|
| Básico | `basico` | 30 | 50 |
| Profissional | `profissional` | 100 | 300 |
| Enterprise | `enterprise` | ∞ | ∞ |

Para alterar limites a qualquer momento:
```sql
UPDATE planos SET limite_usuarios = 200, limite_turmas = 500
WHERE slug = 'profissional';
```

---

## Status do roadmap

| Sprint | Status |
|---|---|
| Sprint 1 — Segurança (clientMiddleware + empresa_id) | ✅ (fix CJS no Sprint 3) |
| Sprint 2 — Consistência (biblioteca, freq-individual) | ✅ |
| Sprint 3 — LMS Core (trilhas, certs, minhas-turmas, reset senha) | ✅ |
| Sprint 4 — SaaS Foundation | ✅ Entregue |
| Sprint 5 — Analytics / IA / Integrações | ⏳ |
