-- ============================================================
-- MIGRATION: Sprint 4 — SaaS Foundation (MySQL 5.x compatível)
-- Arquivo: database/migrations/sprint4_saas_foundation.sql
--
-- PROBLEMA ORIGINAL: ADD COLUMN IF NOT EXISTS não existe no MySQL 5.x.
-- Esta versão usa um stored procedure auxiliar para simular o IF NOT EXISTS,
-- compatível com MySQL 5.6, 5.7 e 8.0+.
--
-- Como executar no Railway:
--   1. Abra o Query Editor do banco
--   2. Cole e execute este arquivo inteiro de uma vez
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── Helper: stored procedure para ADD COLUMN IF NOT EXISTS ───────────────────
-- Cria uma vez, usa para cada coluna, descarta ao final.
DROP PROCEDURE IF EXISTS _add_col;

DELIMITER $$
CREATE PROCEDURE _add_col(
  IN p_table   VARCHAR(100),
  IN p_col     VARCHAR(100),
  IN p_def     VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_col
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$
DELIMITER ;

-- ─── 1. Estende tabela `empresas` ─────────────────────────────────────────────
CALL _add_col('empresas', 'codigo',           "VARCHAR(50)  NULL COMMENT 'Slug único do tenant'");
CALL _add_col('empresas', 'plano',            "VARCHAR(50)  NOT NULL DEFAULT 'basico'");
CALL _add_col('empresas', 'limite_usuarios',  "INT          NOT NULL DEFAULT 50");
CALL _add_col('empresas', 'limite_turmas',    "INT          NOT NULL DEFAULT 100");
CALL _add_col('empresas', 'subdomain',        "VARCHAR(100) NULL");
CALL _add_col('empresas', 'cor_primaria',     "VARCHAR(10)  NOT NULL DEFAULT '#FF6B4A'");
CALL _add_col('empresas', 'logo_url',         "VARCHAR(500) NULL");
CALL _add_col('empresas', 'contato_nome',     "VARCHAR(150) NULL");
CALL _add_col('empresas', 'contato_email',    "VARCHAR(150) NULL");
CALL _add_col('empresas', 'contato_telefone', "VARCHAR(50)  NULL");
CALL _add_col('empresas', 'observacoes',      "TEXT         NULL");
CALL _add_col('empresas', 'ativo',            "TINYINT(1)   NOT NULL DEFAULT 1");
CALL _add_col('empresas', 'criado_em',        "TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- Índice único em codigo (só adiciona se não existir)
DROP PROCEDURE IF EXISTS _add_idx;
DELIMITER $$
CREATE PROCEDURE _add_idx(IN p_table VARCHAR(100), IN p_idx VARCHAR(100), IN p_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_idx
  ) THEN
    SET @_sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_def);
    PREPARE _stmt FROM @_sql;
    EXECUTE _stmt;
    DEALLOCATE PREPARE _stmt;
  END IF;
END $$
DELIMITER ;

CALL _add_idx('empresas', 'uq_empresas_codigo', 'UNIQUE INDEX uq_empresas_codigo (codigo)');
CALL _add_idx('empresas', 'idx_empresas_plano',  'INDEX idx_empresas_plano (plano)');
CALL _add_idx('empresas', 'idx_empresas_ativo',  'INDEX idx_empresas_ativo (ativo)');

-- ─── 2. Tabela `planos` ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nome              VARCHAR(50)  NOT NULL,
  slug              VARCHAR(50)  NOT NULL UNIQUE,
  limite_usuarios   INT          NOT NULL DEFAULT 50,
  limite_turmas     INT          NOT NULL DEFAULT 100,
  limite_storage_mb INT          NOT NULL DEFAULT 1024,
  descricao         TEXT,
  ativo             TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO planos (nome, slug, limite_usuarios, limite_turmas, limite_storage_mb, descricao) VALUES
  ('Básico',       'basico',       30,   50,   512,   'Até 30 usuários e 50 turmas'),
  ('Profissional', 'profissional', 100,  300,  2048,  'Até 100 usuários e 300 turmas'),
  ('Enterprise',   'enterprise',  9999, 9999, 10240,  'Sem limites operacionais');

-- ─── 3. Flag super_admin em `usuarios` ───────────────────────────────────────
CALL _add_col('usuarios', 'super_admin', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL _add_idx('usuarios', 'idx_usuarios_super_admin', 'INDEX idx_usuarios_super_admin (super_admin)');

-- ─── Limpeza ──────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação final ────────────────────────────────────────────────────────
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'empresas'
ORDER BY ORDINAL_POSITION;
