-- ============================================================================
-- Script consolidado — rode isso UMA VEZ no banco de produção (Railway)
-- para aplicar as 3 migrations pendentes da reestruturação do portal.
--
-- Cobre: Auditoria, Mural da turma, Necessidades de treinamento.
-- Seguro rodar mesmo se alguma parte já tiver sido aplicada antes — as
-- CREATE TABLE usam IF NOT EXISTS. A única exceção é o ALTER TABLE no fim:
-- se a coluna necessidade_id já existir, ele vai dar erro "Duplicate column"
-- — isso é inofensivo, só ignore essa linha específica e siga em frente.
-- ============================================================================

-- 1) Auditoria (log de ações sensíveis)
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

-- 2) Mural da turma (publicações manuais)
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

-- 3) Necessidades de treinamento (Fase 1 do ciclo ISO 10015)
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

-- Vínculo opcional entre treinamento e necessidade. Se der erro de coluna
-- duplicada aqui, é porque isso já rodou antes — pode ignorar e seguir.
ALTER TABLE treinamentos ADD COLUMN necessidade_id INT NULL;
