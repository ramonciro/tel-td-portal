-- ================================================================
-- DIAGNÓSTICO — execute antes das migrations para ver o estado atual
-- ================================================================
-- Rode este arquivo PRIMEIRO para saber o que já existe no banco.
-- Não altera nada.
-- ================================================================

-- 1. Quais tabelas existem?
SELECT TABLE_NAME AS tabela
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- 2. Quais tabelas já têm empresa_id?
SELECT TABLE_NAME AS tabela, 'empresa_id EXISTE' AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'empresa_id'
ORDER BY TABLE_NAME;

-- 3. usuarios tem super_admin?
SELECT
  IF(COUNT(*) > 0, 'super_admin EXISTE', 'super_admin NAO EXISTE') AS status_super_admin
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='super_admin';

-- 4. Tabela planos existe?
SELECT
  IF(COUNT(*) > 0, 'planos EXISTE', 'planos NAO EXISTE') AS status_planos
FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='planos';

-- 5. Quantas empresas/usuarios existem hoje?
SELECT 'empresas'  AS tabela, COUNT(*) AS registros FROM empresas
UNION ALL
SELECT 'usuarios', COUNT(*) FROM usuarios;
