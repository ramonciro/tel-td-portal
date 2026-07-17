CREATE TABLE IF NOT EXISTS auditoria_log (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  usuario_nome VARCHAR(150) NULL,
  perfil VARCHAR(50) NULL,
  acao VARCHAR(50) NOT NULL,
  entidade VARCHAR(50) NOT NULL,
  entidade_id INT NULL,
  resumo VARCHAR(500) NULL,
  dados_antes JSON NULL,
  dados_depois JSON NULL,
  ip VARCHAR(64) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_entidade (entidade, entidade_id),
  KEY idx_auditoria_usuario (usuario_id),
  KEY idx_auditoria_criado_em (criado_em)
);
