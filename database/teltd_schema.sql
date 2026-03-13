CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  segmento VARCHAR(100) DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'ativo',
  gestor VARCHAR(150) DEFAULT NULL,
  descricao TEXT
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha VARCHAR(100) NOT NULL,
  perfil VARCHAR(50) DEFAULT 'instrutor',
  cliente VARCHAR(150) DEFAULT NULL,
  ativo TINYINT(1) DEFAULT 1,
  troca_senha_obrigatoria TINYINT(1) DEFAULT 1
);
CREATE TABLE IF NOT EXISTS treinamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tema VARCHAR(200) NOT NULL,
  cliente VARCHAR(150) DEFAULT NULL,
  instrutor VARCHAR(150) DEFAULT NULL,
  carga_horaria DECIMAL(10,2) DEFAULT 0,
  participantes_previstos INT DEFAULT 0,
  participantes_presentes INT DEFAULT 0,
  concluidos INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'planejado'
);
CREATE TABLE IF NOT EXISTS presencas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  treinamento_id INT DEFAULT NULL,
  treinando_nome VARCHAR(150) NOT NULL,
  status VARCHAR(50) DEFAULT 'presente',
  justificativa TEXT
);
CREATE TABLE IF NOT EXISTS avaliacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  treinamento_id INT DEFAULT NULL,
  titulo VARCHAR(200) DEFAULT NULL,
  nota_nps DECIMAL(10,2) DEFAULT 0,
  nota_qualidade DECIMAL(10,2) DEFAULT 0,
  nota_prova DECIMAL(10,2) DEFAULT 0,
  observacoes TEXT
);
CREATE TABLE IF NOT EXISTS biblioteca (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  tipo VARCHAR(50) DEFAULT 'PDF',
  cliente VARCHAR(150) DEFAULT NULL,
  link_arquivo TEXT,
  descricao TEXT,
  categoria VARCHAR(100) DEFAULT 'produto',
  publico VARCHAR(100) DEFAULT 'todos',
  status VARCHAR(50) DEFAULT 'ativo'
);
CREATE TABLE IF NOT EXISTS trilhas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  cliente VARCHAR(150) DEFAULT NULL,
  descricao TEXT,
  carga_horaria_estimada VARCHAR(50) DEFAULT NULL,
  publico VARCHAR(100) DEFAULT 'todos',
  status VARCHAR(50) DEFAULT 'ativo'
);
CREATE TABLE IF NOT EXISTS mapa_desenvolvimento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  colaborador VARCHAR(150) NOT NULL,
  cliente VARCHAR(150) DEFAULT NULL,
  cargo VARCHAR(150) DEFAULT NULL,
  objetivo_profissional TEXT,
  trilha_atual VARCHAR(200) DEFAULT NULL,
  etapa_atual VARCHAR(100) DEFAULT 'Integração',
  status VARCHAR(100) DEFAULT 'em desenvolvimento',
  percentual INT DEFAULT 0,
  proximo_passo TEXT,
  mentor VARCHAR(150) DEFAULT NULL,
  observacoes TEXT
);
INSERT INTO usuarios (nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria)
VALUES ('Administrador Tel T&D', 'admin@teltd.com', 'Tel@2026', 'admin', 'Tel Centro de Contatos', 1, 1)
ON DUPLICATE KEY UPDATE email = email;
INSERT INTO clientes (nome, segmento, status, gestor, descricao) VALUES
('Agibank', 'Bancário', 'ativo', 'Gestão T&D', 'Operação de atendimento Agibank'),
('Mercantil', 'Bancário', 'ativo', 'Gestão T&D', 'Operação de atendimento Mercantil'),
('Claro', 'Telecom', 'ativo', 'Gestão T&D', 'Operação Claro')
ON DUPLICATE KEY UPDATE nome = nome;
