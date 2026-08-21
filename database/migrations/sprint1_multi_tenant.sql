-- ============================================================
-- MIGRATION: Sprint 1 — Multi-tenancy Foundation (MySQL 5.x compatível)
-- Arquivo: database/migrations/sprint1_multi_tenant.sql
--
-- CORREÇÃO: versão anterior usava ADD COLUMN IF NOT EXISTS e
-- CREATE INDEX IF NOT EXISTS que não existem no MySQL 5.x do Railway.
-- Esta versão usa stored procedures auxiliares para simular IF NOT EXISTS.
-- Pode ser executada múltiplas vezes com segurança.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── Stored procedures auxiliares ─────────────────────────────────────────────

DROP PROCEDURE IF EXISTS _add_col;
DELIMITER $$
CREATE PROCEDURE _add_col(IN p_table VARCHAR(100), IN p_col VARCHAR(100), IN p_def VARCHAR(500))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col
  ) THEN
    SET @_s = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS _add_idx;
DELIMITER $$
CREATE PROCEDURE _add_idx(IN p_table VARCHAR(100), IN p_idx VARCHAR(100), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx
  ) THEN
    SET @_s = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_def);
    PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;
  END IF;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS _safe_col;
DELIMITER $$
CREATE PROCEDURE _safe_col(IN p_table VARCHAR(100), IN p_col VARCHAR(100), IN p_def VARCHAR(500))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) THEN
    CALL _add_col(p_table, p_col, p_def);
  END IF;
END $$
DELIMITER ;

-- ─── 1. Tabela canônica de tenants ────────────────────────────────────────────
-- CREATE TABLE suporta IF NOT EXISTS normalmente no MySQL 5.x
CREATE TABLE IF NOT EXISTS empresas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nome      VARCHAR(150) NOT NULL,
  ativo     TINYINT(1)   DEFAULT 1,
  criado_em TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Empresa padrão: todos os registros existentes ficam aqui
INSERT INTO empresas (id, nome, ativo)
VALUES (1, 'Tel Centro de Contatos', 1)
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ─── 2. usuarios ──────────────────────────────────────────────────────────────
CALL _add_col('usuarios', 'empresa_id', 'INT NULL DEFAULT 1');
UPDATE usuarios SET empresa_id = 1 WHERE empresa_id IS NULL;
CALL _add_idx('usuarios', 'idx_usuarios_empresa', 'INDEX idx_usuarios_empresa (empresa_id)');

-- ─── 3. treinamentos ──────────────────────────────────────────────────────────
CALL _add_col('treinamentos', 'empresa_id', 'INT NULL DEFAULT 1');
UPDATE treinamentos SET empresa_id = 1 WHERE empresa_id IS NULL;
CALL _add_idx('treinamentos', 'idx_treinamentos_empresa', 'INDEX idx_treinamentos_empresa (empresa_id)');

-- ─── 4. necessidades_treinamento ──────────────────────────────────────────────
CALL _safe_col('necessidades_treinamento', 'empresa_id', 'INT NULL DEFAULT 1');
CALL _add_idx('necessidades_treinamento', 'idx_necessidades_empresa', 'INDEX idx_necessidades_empresa (empresa_id)');

-- ─── 5. trilhas_aprendizagem ──────────────────────────────────────────────────
CALL _safe_col('trilhas_aprendizagem', 'empresa_id', 'INT NULL DEFAULT 1');
CALL _add_idx('trilhas_aprendizagem', 'idx_trilhas_empresa', 'INDEX idx_trilhas_empresa (empresa_id)');

-- ─── 6. clientes ──────────────────────────────────────────────────────────────
CALL _safe_col('clientes', 'empresa_id', 'INT NULL DEFAULT 1');
CALL _add_idx('clientes', 'idx_clientes_empresa', 'INDEX idx_clientes_empresa (empresa_id)');

-- ─── 7. tabelas opcionais (existem dependendo do schema legado) ───────────────
CALL _safe_col('avaliacoes',           'empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('materiais_avaliativos','empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('auditoria_log',        'empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('biblioteca',           'empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('presencas',            'empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('presenca_aulas',       'empresa_id', 'INT NULL DEFAULT 1');
CALL _safe_col('turma_aulas',          'empresa_id', 'INT NULL DEFAULT 1');

-- Índices opcionais
CALL _add_idx('avaliacoes', 'idx_avaliacoes_empresa',
  'INDEX idx_avaliacoes_empresa (empresa_id)');

-- UPDATE registros existentes — migra tudo para empresa padrão (id=1)
UPDATE avaliacoes            SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE materiais_avaliativos SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ─── Limpeza ──────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;
DROP PROCEDURE IF EXISTS _safe_col;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação final ────────────────────────────────────────────────────────
-- Deve listar todas as tabelas que receberam empresa_id:
SELECT
  TABLE_NAME   AS tabela,
  COLUMN_TYPE  AS tipo,
  COLUMN_DEFAULT AS default_val
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME  = 'empresa_id'
ORDER BY TABLE_NAME;
