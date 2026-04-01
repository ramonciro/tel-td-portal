CREATE TABLE IF NOT EXISTS jornada_participantes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jornada_id INT NOT NULL,
  nome VARCHAR(255) NOT NULL,
  matricula VARCHAR(100) NULL,
  cliente VARCHAR(255) NULL,
  turma VARCHAR(255) NULL,
  cargo VARCHAR(255) NULL,
  supervisor VARCHAR(255) NULL,
  status_jornada ENUM('nao_iniciado','em_percurso','concluido','em_sustentacao') NOT NULL DEFAULT 'em_percurso',
  origem_importacao VARCHAR(50) NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_jornada_participantes_jornada (jornada_id),
  KEY idx_jornada_participantes_nome (nome),
  UNIQUE KEY uk_jornada_participante (jornada_id, nome, matricula),
  CONSTRAINT fk_jornada_participantes_jornada
    FOREIGN KEY (jornada_id) REFERENCES jornadas_desenvolvimento(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
