# Hotfix v3 — MySQL 5.x sem DELIMITER (Railway compatível)

## Por que esta versão?

O Railway Query Editor **não suporta DELIMITER $$**, portanto stored
procedures nunca foram criadas nas versões anteriores. Os blocos
`$$...$$` foram ignorados silenciosamente e as migrações não rodaram.

Esta versão usa apenas `SET @sql = IF(...) + PREPARE/EXECUTE` — sintaxe
padrão MySQL que funciona em qualquer cliente, incluindo o Railway.

---

## Sequência de aplicação (Railway Query Editor)

### 0. Diagnóstico (opcional mas recomendado)
Execute `database/migrations/diagnostico.sql` para ver o estado atual do banco.
Não altera nada — só lê.

### 1. Sprint 1 (empresa_id em todas as tabelas)
```
database/migrations/sprint1_multi_tenant.sql
```
Ao final exibe SELECT mostrando todas as tabelas que receberam empresa_id.

### 2. Sprint 3 (novas tabelas LMS)
```
database/migrations/sprint3_lms_core.sql
```
Cria: trilha_etapas, trilha_progresso, certificados, password_reset_tokens

### 3. Sprint 4 (planos + colunas SaaS em empresas + super_admin)
```
database/migrations/sprint4_saas_foundation.sql
```
Ao final exibe SELECT de verificação.

---

## Após migrations — promover super_admin

```sql
UPDATE usuarios
SET super_admin = 1, perfil = 'super_admin'
WHERE email = 'seu@email.com';
```

Depois: **logout → login** para gerar novo token.

---

## Arquivos de código

| Arquivo | Mudança |
|---|---|
| `backend/src/controllers/adminController.js` | Todas as queries com try/catch individual — funciona mesmo sem migrations |
| `frontend/components/PortalShell.js` | Redirect super_admin robusto |

---

## O adminController agora é bulletproof

Cada query de coluna opcional (`empresa_id`, `super_admin`, `certificados`, `planos`)
tem `try/catch` individual e retorna `0` ou array vazio se a coluna/tabela não existe.
`createEmpresa` tem dois caminhos: com `empresa_id` e sem (fallback automático).
