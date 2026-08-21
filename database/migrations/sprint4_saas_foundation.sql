-- ============================================================
-- MIGRATION: Sprint 4 — SaaS Foundation
-- Arquivo: database/migrations/sprint4_saas_foundation.sql
--
-- CORREÇÃO: Removido IF NOT EXISTS dos ALTER TABLE (não suportado
-- nesta versão do MySQL do Railway). Execute cada bloco
-- separadamente se alguma coluna já existir.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. Tabela `planos` ───────────────────────────────────────────────────────
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
  ('Enterprise',   'enterprise',   9999, 9999, 10240, 'Sem limites operacionais');

-- ─── 2. Colunas novas em `empresas` ──────────────────────────────────────────
-- Execute apenas as que ainda não existem. Verifique antes com:
--   DESCRIBE empresas;

ALTER TABLE empresas ADD COLUMN codigo           VARCHAR(50)  NULL;
ALTER TABLE empresas ADD COLUMN plano            VARCHAR(50)  NOT NULL DEFAULT 'basico';
ALTER TABLE empresas ADD COLUMN limite_usuarios  INT          NOT NULL DEFAULT 50;
ALTER TABLE empresas ADD COLUMN limite_turmas    INT          NOT NULL DEFAULT 100;
ALTER TABLE empresas ADD COLUMN subdomain        VARCHAR(100) NULL;
ALTER TABLE empresas ADD COLUMN cor_primaria     VARCHAR(10)  NOT NULL DEFAULT '#FF6B4A';
ALTER TABLE empresas ADD COLUMN logo_url         VARCHAR(500) NULL;
ALTER TABLE empresas ADD COLUMN contato_nome     VARCHAR(150) NULL;
ALTER TABLE empresas ADD COLUMN contato_email    VARCHAR(150) NULL;
ALTER TABLE empresas ADD COLUMN contato_telefone VARCHAR(50)  NULL;
ALTER TABLE empresas ADD COLUMN observacoes      TEXT         NULL;

-- ativo: provavelmente já existe — comente esta linha se der erro "Duplicate column"
ALTER TABLE empresas ADD COLUMN ativo      TINYINT(1)   NOT NULL DEFAULT 1;
ALTER TABLE empresas ADD COLUMN criado_em  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── 3. Flag super_admin em `usuarios` ───────────────────────────────────────
-- Se já executou o comando avulso anteriormente, comente esta linha:
ALTER TABLE usuarios ADD COLUMN super_admin TINYINT(1) NOT NULL DEFAULT 0;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação ──────────────────────────────────────────────────────────────
SELECT 'planos' AS tabela, COUNT(*) AS registros FROM planos
UNION ALL
SELECT 'empresas', COUNT(*) FROM empresas
UNION ALL
SELECT 'usuarios (total)', COUNT(*) FROM usuarios;
