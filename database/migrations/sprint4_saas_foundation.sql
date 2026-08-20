-- ============================================================
-- MIGRATION: Sprint 4 — SaaS Foundation
-- Arquivo: database/migrations/sprint4_saas_foundation.sql
-- Pré-requisito: sprint1, sprint2 e sprint3 já aplicados
-- ============================================================
--
-- O que faz:
--   1. Estende a tabela `empresas` com campos de SaaS (plano, limites,
--      contato, subdomain, white-label)
--   2. Cria a tabela `planos` (Básico / Profissional / Enterprise)
--   3. Adiciona flag `super_admin` em `usuarios`
--   4. Cria índices e constraints de suporte
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. Estende `empresas` ────────────────────────────────────────────────────
-- Adiciona apenas colunas que ainda não existam (idempotente)

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS codigo           VARCHAR(50)  NULL UNIQUE COMMENT 'Slug único do tenant (ex: dasa, sebrae)',
  ADD COLUMN IF NOT EXISTS plano            VARCHAR(50)  NOT NULL DEFAULT 'basico' COMMENT 'slug do plano ativo',
  ADD COLUMN IF NOT EXISTS limite_usuarios  INT          NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS limite_turmas    INT          NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS subdomain        VARCHAR(100) NULL COMMENT 'ex: dasa.teltd.com.br',
  ADD COLUMN IF NOT EXISTS cor_primaria     VARCHAR(10)  NOT NULL DEFAULT '#FF6B4A',
  ADD COLUMN IF NOT EXISTS logo_url         VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS contato_nome     VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS contato_email    VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS contato_telefone VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS observacoes      TEXT         NULL,
  ADD COLUMN IF NOT EXISTS criado_em        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Garante coluna ativo (pode já existir)
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1;

-- ─── 2. Tabela `planos` ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(50)  NOT NULL,
  slug                VARCHAR(50)  NOT NULL UNIQUE,
  limite_usuarios     INT          NOT NULL DEFAULT 50,
  limite_turmas       INT          NOT NULL DEFAULT 100,
  limite_storage_mb   INT          NOT NULL DEFAULT 1024,
  descricao           TEXT,
  ativo               TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO planos (nome, slug, limite_usuarios, limite_turmas, limite_storage_mb, descricao) VALUES
  ('Básico',        'basico',        30,   50,   512,   'Até 30 usuários e 50 turmas ativas'),
  ('Profissional',  'profissional',  100,  300,  2048,  'Até 100 usuários e 300 turmas ativas'),
  ('Enterprise',    'enterprise',    9999, 9999, 10240, 'Sem limites operacionais — SLA dedicado');

-- ─── 3. Flag `super_admin` em `usuarios` ─────────────────────────────────────
-- Usuários com super_admin = 1 e perfil = 'super_admin' têm acesso irrestrito
-- a todos os tenants. Eles NÃO pertencem a nenhuma empresa específica.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS super_admin TINYINT(1) NOT NULL DEFAULT 0;

-- Índice para lookup rápido
ALTER TABLE usuarios
  ADD INDEX IF NOT EXISTS idx_usuarios_super_admin (super_admin);

-- ─── 4. Índices adicionais em `empresas` ─────────────────────────────────────
ALTER TABLE empresas
  ADD INDEX IF NOT EXISTS idx_empresas_plano  (plano),
  ADD INDEX IF NOT EXISTS idx_empresas_ativo  (ativo),
  ADD INDEX IF NOT EXISTS idx_empresas_codigo (codigo);

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação ──────────────────────────────────────────────────────────────
SELECT 'empresas'  AS tabela, COUNT(*) AS registros FROM empresas
UNION ALL
SELECT 'planos',    COUNT(*) FROM planos
UNION ALL
SELECT 'usuarios (super_admin)', SUM(super_admin) FROM usuarios;
