-- ================================================================
-- Sprint 4 — Colunas de empresas (execute UMA POR VEZ no Railway)
-- Se der "Duplicate column name" → coluna já existe, pule para a próxima.
-- ================================================================

ALTER TABLE empresas ADD COLUMN plano VARCHAR(50) NOT NULL DEFAULT 'basico';

ALTER TABLE empresas ADD COLUMN limite_usuarios INT NOT NULL DEFAULT 50;

ALTER TABLE empresas ADD COLUMN limite_turmas INT NOT NULL DEFAULT 100;

ALTER TABLE empresas ADD COLUMN codigo VARCHAR(50) NULL;

ALTER TABLE empresas ADD COLUMN contato_nome VARCHAR(150) NULL;

ALTER TABLE empresas ADD COLUMN contato_email VARCHAR(150) NULL;

ALTER TABLE empresas ADD COLUMN contato_telefone VARCHAR(50) NULL;

ALTER TABLE empresas ADD COLUMN subdomain VARCHAR(100) NULL;

ALTER TABLE empresas ADD COLUMN observacoes TEXT NULL;

-- Tabela de planos (executar por último)
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

INSERT IGNORE INTO planos (nome, slug, limite_usuarios, limite_turmas, descricao) VALUES
  ('Básico',       'basico',       30,   50,   'Até 30 usuários e 50 turmas'),
  ('Profissional', 'profissional', 100,  300,  'Até 100 usuários e 300 turmas'),
  ('Enterprise',   'enterprise',  9999, 9999,  'Sem limites operacionais');

-- Verificação final
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'empresas'
ORDER BY ORDINAL_POSITION;
