-- ============================================================
-- Sprint 2 Fix — biblioteca
-- Arquivo: database/migrations/sprint2_fix_biblioteca.sql
--
-- Problema: bibliotecaController.js fazia queries em 'biblioteca_conteudos'
-- mas a tabela real (conforme teltd_schema.sql) é 'biblioteca'.
-- O migrate.js também não criava a tabela, deixando o INSERT com erro
-- "Table 'teltd.biblioteca_conteudos' doesn't exist" → 500 → "Erro ao criar conteúdo".
--
-- Fix:
--   1. Garante que a tabela 'biblioteca' existe com a estrutura correta
--   2. O controller foi corrigido para usar 'biblioteca' (não 'biblioteca_conteudos')
-- ============================================================

CREATE TABLE IF NOT EXISTS biblioteca (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(200)  NOT NULL,
  tipo          VARCHAR(50)   DEFAULT 'PDF',
  cliente       VARCHAR(150)  DEFAULT NULL,
  link_arquivo  TEXT,
  descricao     TEXT,
  categoria     VARCHAR(100)  DEFAULT 'produto',
  publico       VARCHAR(100)  DEFAULT 'todos',
  status        VARCHAR(50)   DEFAULT 'Rascunho',
  empresa_id    INT           NULL DEFAULT 1,
  criado_em     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Verificação
SELECT 'Tabela biblioteca OK' AS status,
       COUNT(*) AS registros_existentes
FROM biblioteca;
