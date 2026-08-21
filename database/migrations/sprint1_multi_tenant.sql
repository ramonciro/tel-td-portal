-- ================================================================
-- Sprint 1 — Multi-tenancy (MySQL 5.x, sem DELIMITER, sem procedures)
-- ================================================================
-- Usa: SET @sql = IF(...) + PREPARE/EXECUTE
-- Compatível com Railway Query Editor e qualquer cliente MySQL.
-- Pode ser executado múltiplas vezes sem erro.
-- ================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. Tabela empresas (tenants) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nome      VARCHAR(150) NOT NULL,
  ativo     TINYINT(1)   DEFAULT 1,
  criado_em TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO empresas (id, nome, ativo)
VALUES (1, 'Tel Centro de Contatos', 1)
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ─── 2. usuarios.empresa_id ────────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE usuarios ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''usuarios.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;
UPDATE usuarios SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ─── 3. treinamentos.empresa_id ────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treinamentos' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE treinamentos ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''treinamentos.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;
UPDATE treinamentos SET empresa_id = 1 WHERE empresa_id IS NULL;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='treinamentos' AND INDEX_NAME='idx_treinamentos_empresa') = 0,
  'ALTER TABLE treinamentos ADD INDEX idx_treinamentos_empresa (empresa_id)',
  'SELECT ''index ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 4. clientes.empresa_id ────────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clientes' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE clientes ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''clientes.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;
UPDATE clientes SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ─── 5. avaliacoes.empresa_id ──────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='avaliacoes' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE avaliacoes ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''avaliacoes.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;
UPDATE avaliacoes SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ─── 6. trilhas_aprendizagem.empresa_id ────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='trilhas_aprendizagem' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE trilhas_aprendizagem ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''trilhas_aprendizagem.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 7. presencas.empresa_id ───────────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='presencas' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE presencas ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''presencas.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 8. necessidades_treinamento.empresa_id ────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='necessidades_treinamento' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE necessidades_treinamento ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''necessidades_treinamento.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 9. auditoria_log.empresa_id ───────────────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auditoria_log' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE auditoria_log ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''auditoria_log.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─── 10. materiais_avaliativos.empresa_id ──────────────────────────────────────
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='materiais_avaliativos' AND COLUMN_NAME='empresa_id') = 0,
  'ALTER TABLE materiais_avaliativos ADD COLUMN empresa_id INT NULL DEFAULT 1',
  'SELECT ''materiais_avaliativos.empresa_id ja existe'''
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verificação ───────────────────────────────────────────────────────────────
-- Deve retornar uma linha por tabela que recebeu empresa_id.
-- Se alguma tabela não aparecer, rode o bloco correspondente manualmente.
SELECT TABLE_NAME AS tabela, COLUMN_DEFAULT AS default_val
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME  = 'empresa_id'
ORDER BY TABLE_NAME;
