# Hotfix Update — Save de empresa + plano

## Dois bugs corrigidos

### Bug 1 — Visual: página mostra valores antigos após salvar
`handleSave` não atualizava o `form` state após salvar.
O usuário via os valores antigos e achava que não havia salvo.
Fix: após save bem-sucedido, `setForm` é chamado com os dados
retornados pelo servidor.

### Bug 2 — Persistência: colunas do Sprint 4 não existem
`plano`, `codigo`, `contato_nome` etc. não foram criadas no banco
porque as migrations anteriores usavam DELIMITER que não funciona
no Railway. Os updates caíam no catch silencioso.
Fix SQL: rodar as ALTER TABLE individualmente (arquivo sql incluído).
Fix código: `updateEmpresa` agora loga cada coluna que falha nos
logs do Railway (visível em Deployments → logs).

## Sequência

### 1. SQL no Railway (um por vez)
Abrir `database/migrations/sprint4_colunas_empresas.sql`
e executar cada linha individualmente.
Se der "Duplicate column name" → pular.

### 2. Substituir arquivos + redeploy
- `backend/src/controllers/adminController.js`
- `frontend/app/admin/empresa/[id]/page.js`

### 3. Sem necessidade de logout/login
Só o backend mudou (adminController).
O frontend mudou apenas o comportamento pós-save (não afeta auth).
