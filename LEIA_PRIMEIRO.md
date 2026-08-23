# Hotfix Isolation 2 — Turmas, Dashboard e Plano

## Causa raiz identificada

| Página | Problema | Fix |
|---|---|---|
| Dashboard (`/inicio` + `/dashboard`) | `dashboardRoutes.js` fazia COUNTs globais sem WHERE empresa_id | ✅ Filtro por tenant adicionado |
| Turmas / Gestão de Turmas | `presencaResolver.getResumoPresenca()` buscava todos os treinamentos sem filtro | ✅ Parâmetro empresaId adicionado |
| Plano do tenant | Coluna `plano` nunca foi criada em `empresas` | ✅ SQL individual fornecido |

## Arquivos de código (substituir + redeploy backend)

| Arquivo | O que muda |
|---|---|
| `backend/src/services/presencaResolver.js` | `getResumoPresenca` aceita `{ empresaId }` e filtra `FROM treinamentos WHERE empresa_id = ?` |
| `backend/src/controllers/presencaResumoController.js` | Passa `req.empresaId` para `getResumoPresenca` |
| `backend/src/routes/dashboardRoutes.js` | Todos os COUNTs filtrados por `empresa_id` quando disponível |

## SQL (Railway Query Editor — um por vez)

Execute cada ALTER TABLE do arquivo `sprint4_plano_columns.sql` individualmente.
Se algum der "Duplicate column name" → já existe, pode pular.

Após adicionar a coluna plano:
UPDATE empresas SET plano = 'basico' WHERE plano IS NULL;

## Após redeploy

Todos os usuários de tenant precisam de logout → login para recarregar o JWT.
