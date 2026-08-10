CREATE DATABASE IF NOT EXISTS teltd;
USE teltd;

-- Tabela de Clientes/Ambientes
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- 'dasa', 'sebrae', 'cemig', 'igua'
    nome VARCHAR(100) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserção dos ambientes solicitados
INSERT INTO clientes (codigo, nome) VALUES 
('dasa', 'Dasa'),
('sebrae', 'Sebrae'),
('cemig', 'Cemig'),
('igua', 'Iguá')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- Exemplo de associação na tabela de turmas (ou tabela principal do seu sistema)
-- Adicione a coluna cliente_id caso ainda não exista:
ALTER TABLE turmas ADD COLUMN IF NOT EXISTS cliente_id INT;
-- (Opcional, se usar chave estrangeira):
-- ALTER TABLE turmas ADD CONSTRAINT fk_turmas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id);
