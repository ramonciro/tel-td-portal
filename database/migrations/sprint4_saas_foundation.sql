-- ================================================================
-- Sprint 4 — SaaS Foundation (MySQL 5.x, sem DELIMITER)
-- ================================================================
-- Usa: SET @sql = IF(...) + PREPARE/EXECUTE
-- Compatível com Railway Query Editor.
-- Pode ser executado múltiplas vezes sem erro.
-- ================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. empresas — colunas extras do SaaS ─────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='codigo') = 0,
  "ALTER TABLE empresas ADD COLUMN codigo VARCHAR(50) NULL",
  "SELECT 'empresas.codigo ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='plano') = 0,
  "ALTER TABLE empresas ADD COLUMN plano VARCHAR(50) NOT NULL DEFAULT 'basico'",
  "SELECT 'empresas.plano ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='limite_usuarios') = 0,
  'ALTER TABLE empresas ADD COLUMN limite_usuarios INT NOT NULL DEFAULT 50',
  "SELECT 'empresas.limite_usuarios ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='limite_turmas') = 0,
  'ALTER TABLE empresas ADD COLUMN limite_turmas INT NOT NULL DEFAULT 100',
  "SELECT 'empresas.limite_turmas ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='subdomain') = 0,
  'ALTER TABLE empresas ADD COLUMN subdomain VARCHAR(100) NULL',
  "SELECT 'empresas.subdomain ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='cor_primaria') = 0,
  "ALTER TABLE empresas ADD COLUMN cor_primaria VARCHAR(10) NOT NULL DEFAULT '#FF6B4A'",
  "SELECT 'empresas.cor_primaria ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='logo_url') = 0,
  'ALTER TABLE empresas ADD COLUMN logo_url VARCHAR(500) NULL',
  "SELECT 'empresas.logo_url ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='contato_nome') = 0,
  'ALTER TABLE empresas ADD COLUMN contato_nome VARCHAR(150) NULL',
  "SELECT 'empresas.contato_nome ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='contato_email') = 0,
  'ALTER TABLE empresas ADD COLUMN contato_email VARCHAR(150) NULL',
  "SELECT 'empresas.contato_email ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='contato_telefone') = 0,
  'ALTER TABLE empresas ADD COLUMN contato_telefone VARCHAR(50) NULL',
  "SELECT 'empresas.contato_telefone ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empresas' AND COLUMN_NAME='observacoes') = 0,
  'ALTER TABLE empresas ADD COLUMN observacoes TEXT NULL',
  "SELECT 'empresas.observacoes ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 2. Tabela planos ──────────────────────────────────────────────────────────
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

-- ─── 3. usuarios.super_admin ───────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='super_admin') = 0,
  'ALTER TABLE usuarios ADD COLUMN super_admin TINYINT(1) NOT NULL DEFAULT 0',
  "SELECT 'usuarios.super_admin ja existe'"
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação ───────────────────────────────────────────────────────────────
SELECT 'empresas' AS tabela, COUNT(*) AS colunas_saas
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'empresas'
  AND COLUMN_NAME  IN ('codigo','plano','limite_usuarios','limite_turmas','contato_nome','super_admin');

SELECT 'planos' AS tabela, COUNT(*) AS registros FROM planos;

SELECT 'super_admin' AS coluna,
  IF(COUNT(*) > 0, 'EXISTE em usuarios', 'NAO EXISTE') AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='super_admin';
