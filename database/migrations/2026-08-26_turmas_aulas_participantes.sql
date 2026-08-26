-- Recria as 3 tabelas que o código já consulta (turmaAulasController.js,
-- presencaAulasController.js, treinamentoParticipantesController.js,
-- presencaResolver.js) mas que nunca tiveram uma migration versionada —
-- foram criadas manualmente em algum momento e essa criação nunca foi
-- capturada em arquivo. Esta migration reconstrói o schema com base
-- exata no que os controllers fazem SELECT/INSERT/UPDATE.
--
-- Idempotente: pode rodar em qualquer ambiente (local ou produção) sem
-- efeito destrutivo se as tabelas já existirem.

-- 1) Roster de participantes por turma (cadastro fixo de quem deveria
--    frequentar aquela turma — é a base do "HC previsto")
CREATE TABLE IF NOT EXISTS treinamento_participantes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  treinamento_id INT NOT NULL,
  nome VARCHAR(200) NOT NULL,
  matricula VARCHAR(50) NULL,
  cliente VARCHAR(150) NULL,
  turma VARCHAR(150) NULL,
  supervisor VARCHAR(150) NULL,
  operacao VARCHAR(150) NULL,
  data_admissao DATE NULL,
  status_presenca VARCHAR(20) DEFAULT 'pendente',
  justificativa TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tp_treinamento (treinamento_id),
  KEY idx_tp_status (status_presenca)
);

-- 2) Cronograma diário de cada turma (dia a dia planejado x realmente
--    ministrado) — é a fonte real de "horas previstas x realizadas" e
--    de "dias praticados".
CREATE TABLE IF NOT EXISTS turma_aulas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  treinamento_id INT NOT NULL,
  dia_numero INT NOT NULL,
  data_aula DATE NOT NULL,
  ordem INT DEFAULT 1,
  titulo VARCHAR(200) NOT NULL,
  objetivo TEXT NULL,
  conteudo_planejado TEXT NULL,
  metodologia VARCHAR(150) NULL,
  carga_horaria_planejada DECIMAL(10,2) DEFAULT 0,
  instrutor_responsavel VARCHAR(150) NULL,
  material_apoio TEXT NULL,
  status_execucao VARCHAR(30) DEFAULT 'planejada',
  conteudo_ministrado TEXT NULL,
  carga_horaria_real DECIMAL(10,2) NULL,
  observacoes_execucao TEXT NULL,
  reprogramada TINYINT(1) DEFAULT 0,
  motivo_reprogramacao TEXT NULL,
  ministrada_em TIMESTAMP NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ta_treinamento (treinamento_id),
  KEY idx_ta_data (data_aula),
  KEY idx_ta_status (status_execucao),
  KEY idx_ta_instrutor (instrutor_responsavel)
);

-- 3) Presença por aula (granularidade diária, por participante) — é a
--    fonte de "dias praticados" e "HC realizado" no nível mais fino.
CREATE TABLE IF NOT EXISTS presenca_aulas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  turma_aula_id INT NOT NULL,
  treinamento_id INT NOT NULL,
  data_aula DATE NOT NULL,
  treinando_nome VARCHAR(200) NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  justificativa TEXT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pa_aula_nome (turma_aula_id, treinando_nome),
  KEY idx_pa_treinamento (treinamento_id),
  KEY idx_pa_data (data_aula),
  KEY idx_pa_status (status)
);
