CREATE TABLE IF NOT EXISTS necessidades_treinamento (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente VARCHAR(150) NOT NULL,
  tema VARCHAR(200) NOT NULL,
  horas_necessarias DECIMAL(10,2) DEFAULT 0,
  prazo DATE NULL,
  prioridade VARCHAR(20) DEFAULT 'media',
  status VARCHAR(30) DEFAULT 'aberta',
  origem VARCHAR(150) NULL,
  observacoes TEXT NULL,
  solicitante_id INT NULL,
  solicitante_nome VARCHAR(150) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_necessidades_cliente (cliente),
  KEY idx_necessidades_status (status)
);

-- Vínculo opcional: um treinamento pode ter nascido para atender uma
-- necessidade específica. NULL = treinamento criado sem necessidade formal
-- vinculada (fluxo antigo continua funcionando normalmente).
-- Rode só uma vez — se a coluna já existir, o ALTER abaixo retorna erro
-- (inofensivo, só significa que a migration já foi aplicada).
ALTER TABLE treinamentos ADD COLUMN necessidade_id INT NULL;
