CREATE TABLE IF NOT EXISTS turma_publicacoes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  treinamento_id INT NOT NULL,
  autor_id INT NULL,
  autor_nome VARCHAR(150) NULL,
  titulo VARCHAR(200) NULL,
  conteudo TEXT NOT NULL,
  fixado TINYINT(1) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_turma_publicacoes_treinamento (treinamento_id)
);
