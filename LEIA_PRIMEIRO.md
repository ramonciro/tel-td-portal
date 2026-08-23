# Hotfix — Delete de empresa + isolamento de tenants

## SQL: execute no Railway (um por vez)

### 1. Criar empresa principal Tel (id=1)
INSERT INTO empresas (id, nome, ativo) VALUES (1, 'Tel Centro de Contatos', 1)
ON DUPLICATE KEY UPDATE nome = 'Tel Centro de Contatos';

### 2. Vincular usuários operacionais (ids 1–29) à Tel
UPDATE usuarios SET empresa_id = 1 WHERE id <= 29;

### 3. Vincular usuários de teste aos tenants corretos
UPDATE usuarios SET empresa_id = 2 WHERE id = 30;
UPDATE usuarios SET empresa_id = 4 WHERE id = 31;

### 4. Migrar dados operacionais para empresa 1
UPDATE treinamentos SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE clientes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE avaliacoes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE presencas SET empresa_id = 1 WHERE empresa_id IS NULL;

### 5. Deletar empresas de teste (se quiser)
DELETE FROM empresas WHERE id IN (2, 4);
UPDATE usuarios SET empresa_id = 1 WHERE id IN (30, 31);

---

## Arquivos de código (substituir + redeploy)

| Arquivo | Mudança |
|---|---|
| backend/src/controllers/adminController.js | + deleteEmpresa (seguro: bloqueia se houver turmas) |
| backend/src/index.js | + DELETE /api/admin/empresas/:id |
| frontend/app/admin/empresa/[id]/page.js | + botão "Excluir" na danger zone |

---

## Após tudo aplicado
- Logout → Login no super_admin para novo token
- Todos os coordenadores precisam fazer logout → login para JWT com empresa_id correto
