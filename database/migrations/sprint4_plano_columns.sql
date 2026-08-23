-- ================================================================
-- Sprint 4 — Colunas SaaS em empresas (MySQL 5.x, uma por vez)
-- Execute cada linha individualmente no Railway Query Editor
-- ================================================================

-- Coluna plano (padrão: basico)
ALTER TABLE empresas ADD COLUMN plano VARCHAR(50) NOT NULL DEFAULT 'basico';

-- Coluna limite_usuarios
ALTER TABLE empresas ADD COLUMN limite_usuarios INT NOT NULL DEFAULT 50;

-- Coluna limite_turmas
ALTER TABLE empresas ADD COLUMN limite_turmas INT NOT NULL DEFAULT 100;

-- Coluna codigo (slug único do tenant)
ALTER TABLE empresas ADD COLUMN codigo VARCHAR(50) NULL;

-- Coluna contato_nome
ALTER TABLE empresas ADD COLUMN contato_nome VARCHAR(150) NULL;

-- Coluna contato_email
ALTER TABLE empresas ADD COLUMN contato_email VARCHAR(150) NULL;

-- Coluna contato_telefone
ALTER TABLE empresas ADD COLUMN contato_telefone VARCHAR(50) NULL;

-- Coluna subdomain
ALTER TABLE empresas ADD COLUMN subdomain VARCHAR(100) NULL;

-- Coluna observacoes
ALTER TABLE empresas ADD COLUMN observacoes TEXT NULL;

-- Tabela de planos
CREATE TABLE IF NOT EXISTS planos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nome              VARCHAR(50) NOT NULL,
  slug              VARCHAR(50) NOT NULL UNIQUE,
  limite_usuarios   INT NOT NULL DEFAULT 50,
  limite_turmas     INT NOT NULL DEFAULT 100,
  limite_storage_mb INT NOT NULL DEFAULT 1024,
  descricao         TEXT,
  ativo             TINYINT(1) NOT NULL DEFAULT 1,
  criado_em         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO planos (nome, slug, limite_usuarios, limite_turmas, limite_storage_mb, descricao) VALUES
  ('Básico',       'basico',       30,   50,   512,   'Até 30 usuários e 50 turmas'),
  ('Profissional', 'profissional', 100,  300,  2048,  'Até 100 usuários e 300 turmas'),
  ('Enterprise',   'enterprise',  9999, 9999, 10240,  'Sem limites operacionais');

-- super_admin em usuarios (se ainda não adicionou)
ALTER TABLE usuarios ADD COLUMN super_admin TINYINT(1) NOT NULL DEFAULT 0;

-- Verificação
SELECT COLUMN_NAME, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'empresas'
ORDER BY ORDINAL_POSITION;
