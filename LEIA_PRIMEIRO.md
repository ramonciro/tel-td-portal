# Hotfix v2 — Migrations compatíveis com MySQL 5.x (Railway)
**Problema raiz:** ADD COLUMN IF NOT EXISTS e CREATE INDEX IF NOT EXISTS
não existem no MySQL 5.x do Railway. Todas as migrations anteriores
usavam essa sintaxe e falhavam silenciosamente.

---

## Arquivos incluídos

| Arquivo | Status |
|---|---|
| `database/migrations/sprint1_multi_tenant.sql` | ✅ Reescrito — MySQL 5.x |
| `database/migrations/sprint3_lms_core.sql` | ✅ Já era compatível (só CREATE TABLE IF NOT EXISTS) |
| `database/migrations/sprint4_saas_foundation.sql` | ✅ Reescrito — MySQL 5.x |
| `backend/src/controllers/adminController.js` | ✅ createEmpresa resiliente |
| `frontend/components/PortalShell.js` | ✅ Redirect super_admin robusto |

---

## Sequência obrigatória de execução

Execute **na ordem** no Query Editor do Railway:

### 1. Sprint 1 (multi-tenant — empresa_id em todas as tabelas)
```
database/migrations/sprint1_multi_tenant.sql
```
Após executar, verifique o SELECT no final — deve listar todas as tabelas
que receberam empresa_id (usuarios, treinamentos, clientes, etc.)

### 2. Sprint 3 (LMS — trilha_etapas, certificados, password_reset_tokens)
```
database/migrations/sprint3_lms_core.sql
```
Cria 4 novas tabelas. Sem alterações em tabelas existentes.

### 3. Sprint 4 (SaaS — planos, colunas extras em empresas, super_admin)
```
database/migrations/sprint4_saas_foundation.sql
```
Adiciona colunas em empresas, cria tabela planos, adiciona super_admin em usuarios.

---

## Após rodar as migrations

```sql
-- Promover usuário a super_admin:
UPDATE usuarios
SET super_admin = 1, perfil = 'super_admin'
WHERE email = 'seu@email.com';
```

Depois: **Logout → Login** para gerar novo token.

---

## Por que as stored procedures?

MySQL 5.x não suporta:
- ALTER TABLE ... ADD COLUMN IF NOT EXISTS
- CREATE INDEX IF NOT EXISTS
- ADD CONSTRAINT IF NOT EXISTS

A solução: stored procedure `_add_col` que consulta
information_schema antes de executar o ALTER TABLE.
Pode ser executada quantas vezes quiser sem duplicar colunas.
