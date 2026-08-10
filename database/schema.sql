CREATE DATABASE IF NOT EXISTS teltd;
USE teltd;

-- Tabela de Clientes / Ambientes Isolados
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- 'dasa', 'sebrae', 'cemig', 'igua'
    nome VARCHAR(100) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserção oficial dos quatro ambientes solicitados
INSERT INTO clientes (codigo, nome) VALUES 
('dasa', 'Dasa'),
('sebrae', 'Sebrae'),
('cemig', 'Cemig'),
('igua', 'Iguá')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- Adiciona a coluna de vínculo nas tabelas do sistema (Exemplo: turmas e treinamentos)
ALTER TABLE turmas ADD COLUMN IF NOT EXISTS cliente_id INT;
ALTER TABLE treinamentos ADD COLUMN IF NOT EXISTS cliente_id INT;
