-- ============================================================
-- MIGRATION: Sprint 3 — LMS Core
-- Arquivo: database/migrations/sprint3_lms_core.sql
-- Executar: uma única vez, em manutenção
-- ============================================================
--
-- O que faz:
--   1. trilha_etapas  — etapas relacionais (substitui o campo JSON)
--   2. trilha_progresso — progresso individual por participante
--   3. certificados — emissão ao concluir turma
--   4. password_reset_tokens — tokens de redefinição de senha
--
-- IMPORTANTE: Sprint 1 (sprint1_multi_tenant.sql) deve ter sido
-- aplicado antes deste arquivo.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. trilha_etapas ────────────────────────────────────────────────────────
-- Substitui o campo `etapas TEXT` (JSON serializado) da trilhas_aprendizagem.
-- Cada etapa é um registro independente com ordem, tipo e link opcional a turma.

CREATE TABLE IF NOT EXISTS trilha_etapas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  trilha_id   INT NOT NULL,
  ordem       INT NOT NULL DEFAULT 0,
  titulo      VARCHAR(200) NOT NULL,
  descricao   TEXT,
  tipo        VARCHAR(50) DEFAULT 'conteudo',   -- 'conteudo' | 'turma' | 'avaliacao' | 'pratica'
  turma_id    INT NULL,                          -- link opcional para treinamentos.id
  empresa_id  INT NULL DEFAULT 1,
  criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_etapas_trilha   (trilha_id),
  INDEX idx_etapas_empresa  (empresa_id)
);

-- ─── 2. trilha_progresso ─────────────────────────────────────────────────────
-- Registro de conclusão de etapa por participante (identificado por email).
-- UNIQUE em (etapa_id, usuario_email) para garantir idempotência.

CREATE TABLE IF NOT EXISTS trilha_progresso (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  trilha_id     INT NOT NULL,
  etapa_id      INT NOT NULL,
  usuario_email VARCHAR(150) NOT NULL,
  empresa_id    INT NULL DEFAULT 1,
  concluido     TINYINT(1) DEFAULT 0,
  concluido_em  TIMESTAMP NULL,
  UNIQUE KEY uq_progresso (etapa_id, usuario_email),
  INDEX idx_progresso_trilha   (trilha_id),
  INDEX idx_progresso_usuario  (usuario_email)
);

-- ─── 3. certificados ─────────────────────────────────────────────────────────
-- Um certificado por combinação (usuario_email, treinamento_id).
-- Captura frequência e nota no momento da emissão (snapshot).

CREATE TABLE IF NOT EXISTS certificados (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  usuario_nome          VARCHAR(200) NOT NULL,
  usuario_email         VARCHAR(150) NULL,
  treinamento_id        INT NOT NULL,
  treinamento_tema      VARCHAR(200),
  treinamento_cliente   VARCHAR(150),
  frequencia_percentual DECIMAL(5,2) NULL,
  nota_final            DECIMAL(5,2) NULL,
  carga_horaria         VARCHAR(50)  NULL,
  empresa_id            INT NULL DEFAULT 1,
  emitido_em            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cert    (usuario_email, treinamento_id),
  INDEX idx_cert_empresa (empresa_id),
  INDEX idx_cert_usuario (usuario_email),
  INDEX idx_cert_trein   (treinamento_id)
);

-- ─── 4. password_reset_tokens ────────────────────────────────────────────────
-- Tokens de 64 chars (hex) com validade de 1h.
-- Um usuário pode ter múltiplos tokens; apenas o mais recente e não-usado vale.
-- Sprint 4: ao configurar SMTP, o backend envia o link por email automaticamente.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  token       VARCHAR(64) NOT NULL UNIQUE,
  expira_em   DATETIME NOT NULL,
  usado       TINYINT(1) DEFAULT 0,
  criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prt_token    (token),
  INDEX idx_prt_usuario  (usuario_id)
);

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação ──────────────────────────────────────────────────────────────
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('trilha_etapas', 'trilha_progresso', 'certificados', 'password_reset_tokens')
ORDER BY table_name;
