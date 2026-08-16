-- ============================================================
-- MIGRATION: Sprint 1 — Multi-tenancy Foundation
-- Arquivo: database/migrations/sprint1_multi_tenant.sql
-- Executar: uma única vez em produção, em manutenção
-- ============================================================
-- 
-- O que faz:
--   1. Cria tabela `empresas` como entidade canônica de tenant
--   2. Adiciona empresa_id nas 9 tabelas centrais que não tinham
--   3. Cria empresa padrão e migra registros existentes para ela
--   4. Adiciona índices para performance das queries filtradas
--   5. NÃO adiciona FK obrigatória nas tabelas de dados (para
--      não quebrar registros legados) — FK fica como opcional (NULL)
--
-- IMPORTANTE: Testar em ambiente de homologação antes de produção.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. Tabela canônica de tenants ───────────────────────────────────────────
-- Unifica 'empresas' (usada por usuarios) e 'clientes' (ambiente de login).
-- O campo `codigo` é o identificador de URL/ambiente (ex: 'dasa', 'sebrae').

CREATE TABLE IF NOT EXISTS empresas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(50)  UNIQUE NOT NULL,
  nome        VARCHAR(150) NOT NULL,
  ativo       BOOLEAN      DEFAULT TRUE,
  plano       VARCHAR(50)  DEFAULT 'basico',   -- 'basico' | 'profissional' | 'enterprise'
  max_usuarios INT         DEFAULT 50,
  criado_em   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Empresa padrão para registros existentes (migração sem perda de dados)
INSERT INTO empresas (id, codigo, nome, ativo)
VALUES (1, 'padrao', 'Tel Centro de Contatos', TRUE)
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ─── 2. usuarios — garante que empresa_id existe e aponta para empresas ──────
-- A coluna pode já existir (de migrate anterior) — usa IF NOT EXISTS

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1,
  ADD CONSTRAINT IF NOT EXISTS fk_usuarios_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL;

-- Migrar registros sem empresa_id para a empresa padrão
UPDATE usuarios SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ─── 3. treinamentos ─────────────────────────────────────────────────────────
ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE treinamentos SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamentos_empresa
  ON treinamentos (empresa_id);

-- ─── 4. necessidades ─────────────────────────────────────────────────────────
ALTER TABLE necessidades_treinamento
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE necessidades_treinamento SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_necessidades_empresa
  ON necessidades_treinamento (empresa_id);

-- ─── 5. trilhas_aprendizagem ─────────────────────────────────────────────────
ALTER TABLE trilhas_aprendizagem
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE trilhas_aprendizagem SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trilhas_empresa
  ON trilhas_aprendizagem (empresa_id);

-- ─── 6. clientes (operações/contas comerciais por empresa) ───────────────────
-- Nota: 'clientes' aqui são as operações (Dasa, Cemig etc.), não os tenants.
-- Cada tenant tem suas próprias operações.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE clientes SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_empresa
  ON clientes (empresa_id);

-- ─── 7. biblioteca ───────────────────────────────────────────────────────────
ALTER TABLE biblioteca
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE biblioteca SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_biblioteca_empresa
  ON biblioteca (empresa_id);

-- ─── 8. avaliacoes ───────────────────────────────────────────────────────────
-- (derivada de treinamentos — pode ser filtrada via JOIN, mas índice direto
--  evita N+1 quando consultada de forma independente)
ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE avaliacoes SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_avaliacoes_empresa
  ON avaliacoes (empresa_id);

-- ─── 9. materiais_avaliativos ─────────────────────────────────────────────────
ALTER TABLE materiais_avaliativos
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL DEFAULT 1;

UPDATE materiais_avaliativos SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_materiais_empresa
  ON materiais_avaliativos (empresa_id);

-- ─── 10. auditoria_log — empresa_id para particionamento de logs ─────────────
ALTER TABLE auditoria_log
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL;

UPDATE auditoria_log SET empresa_id = 1 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa
  ON auditoria_log (empresa_id);

-- ─── Verificação final ────────────────────────────────────────────────────────
-- Execute este SELECT para confirmar que as colunas foram criadas:
SELECT
  table_name,
  COUNT(*) AS total_registros
FROM information_schema.columns c
JOIN (
  SELECT table_name, COUNT(*) AS total_registros
  FROM (
    SELECT 'treinamentos'          AS table_name UNION ALL
    SELECT 'usuarios'              AS table_name UNION ALL
    SELECT 'necessidades_treinamento' AS table_name UNION ALL
    SELECT 'trilhas_aprendizagem'  AS table_name UNION ALL
    SELECT 'clientes'              AS table_name UNION ALL
    SELECT 'biblioteca'            AS table_name UNION ALL
    SELECT 'avaliacoes'            AS table_name UNION ALL
    SELECT 'materiais_avaliativos' AS table_name UNION ALL
    SELECT 'auditoria_log'         AS table_name
  ) t
  GROUP BY table_name
) tabelas USING (table_name)
WHERE c.column_name = 'empresa_id'
  AND c.table_schema = DATABASE()
GROUP BY c.table_name
ORDER BY c.table_name;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Rollback (caso necessário) ───────────────────────────────────────────────
-- Para reverter: remova as colunas empresa_id e drope os índices.
-- Exemplo para 'treinamentos':
--   ALTER TABLE treinamentos DROP INDEX idx_treinamentos_empresa;
--   ALTER TABLE treinamentos DROP COLUMN empresa_id;
