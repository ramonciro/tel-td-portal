# Sprint 3 — LMS Core
**Data:** Agosto 2026 | **Sobre:** Portal T&D — tel-td-portal-main

---

## ⚠️ Fix Crítico incluído: clientMiddleware.js (bloqueante do Sprint 1)

O `clientMiddleware.js` do backup_3 usava sintaxe ESM (`import/export`) num projeto
que roda em CommonJS puro (sem `"type":"module"` no `package.json`). Isso causava
`SyntaxError` ao ser carregado via `require()` no `index.js`, tornando o isolamento
multi-tenant **inoperante em produção** mesmo com o Sprint 1 aplicado.

Este Sprint entrega a versão reescrita em CJS.

---

## Arquivos entregues

### Backend

| Arquivo | O que é |
|---|---|
| `backend/src/middlewares/clientMiddleware.js` | ✅ REESCRITO — CJS (fix crítico) |
| `backend/src/controllers/trilhasRelacionaisController.js` | 🆕 Controller CJS dedicado para trilhas |
| `backend/src/controllers/certificadosController.js` | 🆕 Emissão e listagem de certificados |
| `backend/src/routes/authRoutes.js` | 🔄 Adicionadas rotas `/esqueci-senha` e `/redefinir-senha` |
| `backend/src/index.js` | 🔄 Rotas de trilhas substituídas + certificados + minhas-turmas inline |

### Frontend

| Arquivo | O que é |
|---|---|
| `frontend/app/trilhas/page.js` | 🔄 REDESIGN — etapas relacionais, progresso, modal detalhe |
| `frontend/app/minhas-turmas/page.js` | 🆕 Self-service do treinando: turmas, frequência, emitir cert |
| `frontend/app/certificados/page.js` | 🆕 Listagem + emissão + impressão de certificados |
| `frontend/components/PortalShell.js` | 🔄 Menu: "Minhas Turmas" e "Certificados" adicionados |

### Database

| Arquivo | O que é |
|---|---|
| `database/migrations/sprint3_lms_core.sql` | 🆕 4 novas tabelas (ver abaixo) |

---

## Como aplicar

### 1. Executar a migration
```sql
-- No MySQL do Railway ou local:
SOURCE database/migrations/sprint3_lms_core.sql;
```

Tabelas criadas:
- `trilha_etapas` — etapas relacionais (substitui campo JSON)
- `trilha_progresso` — progresso por participante/etapa
- `certificados` — registro de certificados emitidos
- `password_reset_tokens` — tokens de redefinição de senha (1h de validade)

### 2. Substituir os arquivos no projeto
Copiar cada arquivo desta pasta para o caminho equivalente no projeto.
Todos os caminhos são relativos à raiz `tel-td-portal-main/`.

### 3. Reiniciar o servidor (Railway)
O `index.js` foi alterado — necessário redeploy.

---

## Notas importantes

### Trilhas: migração de dados existentes
O campo `etapas` em `trilhas_aprendizagem` ainda existe na tabela.
Se houver trilhas com etapas salvas no formato JSON antigo, rodar
este script **após** aplicar a migration:

```sql
-- Migração manual de etapas antigas (JSON → trilha_etapas)
-- Rodar apenas se houver dados legados no campo trilhas_aprendizagem.etapas
-- Verificar primeiro:
SELECT id, titulo, etapas FROM trilhas_aprendizagem WHERE etapas IS NOT NULL AND etapas != '';
```

Se houver dados, a migração precisa ser feita manualmente ou via script Node.
Consulte a equipe antes de executar.

### Reset de senha — sem email por enquanto
O endpoint `/api/auth/esqueci-senha` retorna o token direto na resposta
(ambiente interno). Para Sprint 4, configurar SMTP (nodemailer) e remover
o token da resposta, enviando apenas o link por email.

### Minhas Turmas — match por email
O endpoint `/api/minhas-turmas` para treinandos busca por `email` na tabela
`treinamento_participantes`. Se os registros existentes não tiverem email
preenchido, o match cai por nome (`LOWER(tp.nome) = LOWER(req.user.nome)`).
Recomenda-se preencher o campo email nos participantes.

---

## Status do roadmap após este Sprint

| Sprint | Status |
|---|---|
| Sprint 1 — Segurança (clientMiddleware + empresa_id) | ✅ (fix CJS incluído aqui) |
| Sprint 2 — Consistência (biblioteca, freq-individual, evolucao) | ✅ |
| Sprint 3 — LMS Core | ✅ Entregue |
| Sprint 4 — SaaS Foundation | ⏳ Próximo |
