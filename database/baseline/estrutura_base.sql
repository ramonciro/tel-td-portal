-- =====================================================================
-- Portal T&D — ESTRUTURA-BASE OFICIAL (banco do zero) — 04/11/2026
--
-- Estrutura (sem dados) de todas as tabelas do portal no estado atual,
-- gerada a partir de um banco migrado e saneada para o MySQL 8:
--   * CREATE TABLE IF NOT EXISTS (pode rodar em cima de banco que ja tem
--     tabelas, nao apaga nem altera nada);
--   * colunas JSON como JSON; sem COLLATE fixo (vale o padrao do banco, o
--     mesmo das tabelas que o migrate.js cria, evitando "Illegal mix of
--     collations" nos JOINs);
--   * SEM a chave estrangeira antiga treinamentos.necessidade_id -> necessidades;
--   * sem AUTO_INCREMENT de dados e sem tabelas de teste.
-- Cada comando termina em ponto-e-virgula no fim da linha; nao ha ponto-e-virgula
-- dentro de texto.
-- Aplicar com: node src/scripts/bancoDoZero.js --confirmo   (ver BANCO-DO-ZERO.md)
-- Depois da base, o migrate.js continua sendo quem evolui o banco.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `acoes_desenvolvimento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jornada_id` int NOT NULL,
  `etapa_id` int DEFAULT NULL,
  `turma_id` int DEFAULT NULL,
  `tipo_acao` varchar(50) NOT NULL DEFAULT 'treinamento',
  `tema` varchar(200) NOT NULL,
  `subtipo` varchar(100) DEFAULT NULL,
  `publico_alvo` varchar(255) DEFAULT NULL,
  `obrigatoria` tinyint(1) NOT NULL DEFAULT 0,
  `descricao` text DEFAULT NULL,
  `carga_horaria` decimal(10,2) NOT NULL DEFAULT 0.00,
  `participantes_previstos` int NOT NULL DEFAULT 0,
  `participantes_realizados` int NOT NULL DEFAULT 0,
  `quantidade_turmas_sessoes` int NOT NULL DEFAULT 0,
  `horas_planejadas` decimal(10,2) NOT NULL DEFAULT 0.00,
  `horas_realizadas` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'planejada',
  `responsavel_id` int DEFAULT NULL,
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_acoes_desenvolvimento_jornada` (`jornada_id`),
  KEY `idx_acoes_desenvolvimento_etapa` (`etapa_id`),
  KEY `idx_acoes_desenvolvimento_turma` (`turma_id`),
  KEY `idx_acoes_desenvolvimento_responsavel` (`responsavel_id`),
  KEY `idx_acoes_desenvolvimento_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `auditoria_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int DEFAULT NULL,
  `usuario_nome` varchar(200) DEFAULT NULL,
  `perfil` varchar(50) DEFAULT NULL,
  `acao` varchar(50) NOT NULL,
  `entidade` varchar(100) NOT NULL,
  `entidade_id` int DEFAULT NULL,
  `resumo` text DEFAULT NULL,
  `dados_antes` JSON DEFAULT NULL,
  `dados_depois` JSON DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auditoria_usuario` (`usuario_id`),
  KEY `idx_auditoria_acao` (`acao`),
  KEY `idx_auditoria_entidade` (`entidade`),
  KEY `idx_auditoria_criado` (`criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `avaliacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `nota_nps` decimal(5,2) DEFAULT NULL,
  `nota_qualidade` decimal(5,2) DEFAULT NULL,
  `nota_prova` decimal(5,2) DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `comentario` text DEFAULT NULL,
  `treinando_nome` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `treinamento_id` (`treinamento_id`),
  CONSTRAINT `avaliacoes_ibfk_1` FOREIGN KEY (`treinamento_id`) REFERENCES `treinamentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `avaliacoes_treinandos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `treinando_nome` varchar(150) NOT NULL,
  `nota_nps` decimal(5,2) DEFAULT NULL,
  `comentario` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pessoa_id` int DEFAULT NULL,
  `respostas_json` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_avtr_treinamento` (`treinamento_id`),
  KEY `idx_avtr_treinando` (`treinando_nome`),
  KEY `idx_avaliacoes_treinandos_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_avaliacoes_treinandos_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `avisos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `tipo` varchar(40) NOT NULL,
  `gravidade` varchar(10) NOT NULL DEFAULT 'info',
  `titulo` varchar(200) NOT NULL,
  `mensagem` varchar(500) DEFAULT NULL,
  `link` varchar(300) DEFAULT NULL,
  `chave` varchar(160) NOT NULL,
  `valor` int NOT NULL DEFAULT 0,
  `lido_em` datetime DEFAULT NULL,
  `resolvido_em` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_avisos_usuario_chave` (`usuario_id`,`chave`),
  KEY `idx_avisos_usuario` (`usuario_id`,`lido_em`,`resolvido_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `biblioteca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(200) NOT NULL,
  `tipo` varchar(50) DEFAULT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `publico` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Publicado',
  `link_arquivo` text DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_biblioteca_empresa` (`empresa_id`),
  KEY `idx_biblioteca_cliente` (`cliente`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `capacidade_instrutor_mensal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instrutor` varchar(150) NOT NULL,
  `ano` int NOT NULL,
  `mes` int NOT NULL,
  `horas_capacidade` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hc_capacidade` int NOT NULL DEFAULT 0,
  `observacoes` varchar(255) DEFAULT NULL,
  `criado_por` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cim_instrutor_mes_empresa` (`instrutor`,`ano`,`mes`,`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `capacidade_regra_padrao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `horas_dia_padrao` decimal(5,2) NOT NULL DEFAULT 6.00,
  `hc_dia_padrao` int NOT NULL DEFAULT 30,
  `considerar_domingo` tinyint(1) NOT NULL DEFAULT 0,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  `dias_mes_padrao` int NOT NULL DEFAULT 22,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crp_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `celula_baby_indicadores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `celula_id` int NOT NULL,
  `nome` varchar(120) NOT NULL,
  `unidade` varchar(30) DEFAULT NULL,
  `sentido` varchar(10) NOT NULL DEFAULT 'maior',
  `meta` decimal(14,4) DEFAULT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_celula_ind_nome` (`celula_id`,`nome`),
  KEY `idx_celula_ind_celula` (`celula_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `celula_baby_lancamentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `celula_id` int NOT NULL,
  `indicador_id` int NOT NULL,
  `pessoa_row_id` int NOT NULL,
  `dia` tinyint(4) NOT NULL,
  `valor` decimal(14,4) NOT NULL,
  `lancado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_celula_lanc` (`indicador_id`,`pessoa_row_id`,`dia`),
  KEY `idx_celula_lanc_celula` (`celula_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `celula_baby_pessoas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `celula_id` int NOT NULL,
  `participante_id` int DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `resultado` varchar(20) DEFAULT NULL,
  `parecer` varchar(20) DEFAULT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_celula_pessoa` (`celula_id`,`participante_id`),
  KEY `idx_celula_pessoa_celula` (`celula_id`),
  KEY `idx_celula_pessoa_pessoa` (`pessoa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `celulas_baby` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `turma_nome` varchar(255) DEFAULT NULL,
  `instrutor` varchar(150) DEFAULT NULL,
  `data_inicio_operacao` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'a_configurar',
  `relatorio_final` text DEFAULT NULL,
  `iniciada_em` datetime DEFAULT NULL,
  `encerrada_em` datetime DEFAULT NULL,
  `encerrada_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_celula_turma` (`treinamento_id`),
  KEY `idx_celula_empresa` (`empresa_id`),
  KEY `idx_celula_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `certificados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_nome` varchar(200) NOT NULL,
  `usuario_email` varchar(150) DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `treinamento_tema` varchar(200) DEFAULT NULL,
  `treinamento_cliente` varchar(150) DEFAULT NULL,
  `frequencia_percentual` decimal(5,2) DEFAULT NULL,
  `nota_final` decimal(5,2) DEFAULT NULL,
  `carga_horaria` varchar(50) DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `emitido_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cert` (`usuario_email`,`treinamento_id`),
  KEY `idx_cert_empresa` (`empresa_id`),
  KEY `idx_cert_usuario` (`usuario_email`),
  KEY `idx_cert_trein` (`treinamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `segmento` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Ativo',
  `gestor` varchar(150) DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coaching_encontros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `coaching_individual_id` int NOT NULL,
  `data_encontro` date NOT NULL,
  `observacoes` text DEFAULT NULL,
  `registrado_por_id` int DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coaching_encontros_coaching` (`coaching_individual_id`),
  KEY `idx_coaching_encontros_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coaching_individual` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `cliente` varchar(255) DEFAULT NULL,
  `cargo` varchar(255) DEFAULT NULL,
  `jornada_participante_id` int DEFAULT NULL,
  `responsavel_id` int DEFAULT NULL,
  `cadencia_dias` int NOT NULL DEFAULT 30,
  `status` varchar(20) NOT NULL DEFAULT 'ativo',
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `pessoa_id` int DEFAULT NULL,
  `cpf` varchar(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_coaching_individual_jornada_participante` (`jornada_participante_id`),
  KEY `idx_coaching_individual_responsavel` (`responsavel_id`),
  KEY `idx_coaching_individual_empresa` (`empresa_id`),
  KEY `idx_coaching_individual_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_coaching_individual_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coaching_planos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jornada_id` int DEFAULT NULL,
  `etapa_id` int DEFAULT NULL,
  `acao_id` int DEFAULT NULL,
  `tipo_coaching` varchar(50) NOT NULL DEFAULT 'desenvolvimento',
  `titulo` varchar(200) NOT NULL,
  `publico_alvo` varchar(255) DEFAULT NULL,
  `objetivo` text DEFAULT NULL,
  `responsavel_id` int DEFAULT NULL,
  `participantes_previstos` int NOT NULL DEFAULT 0,
  `participantes_realizados` int NOT NULL DEFAULT 0,
  `sessoes_previstas` int NOT NULL DEFAULT 0,
  `sessoes_realizadas` int NOT NULL DEFAULT 0,
  `carga_horaria_sessao` decimal(10,2) NOT NULL DEFAULT 0.00,
  `horas_totais` decimal(10,2) NOT NULL DEFAULT 0.00,
  `horas_planejadas` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'planejado',
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_coaching_planos_jornada` (`jornada_id`),
  KEY `idx_coaching_planos_etapa` (`etapa_id`),
  KEY `idx_coaching_planos_acao` (`acao_id`),
  KEY `idx_coaching_planos_responsavel` (`responsavel_id`),
  KEY `idx_coaching_planos_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conquistas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `entidade_tipo` varchar(20) NOT NULL,
  `entidade_nome` varchar(200) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descricao` varchar(300) DEFAULT NULL,
  `contexto` varchar(200) NOT NULL,
  `conquistado_em` date NOT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquista` (`entidade_tipo`,`entidade_nome`,`tipo`,`contexto`),
  KEY `idx_conquistas_empresa` (`empresa_id`),
  KEY `idx_conquistas_entidade` (`entidade_tipo`,`entidade_nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_config` (
  `empresa_id` int NOT NULL DEFAULT 0,
  `chave` varchar(40) NOT NULL,
  `valor` varchar(200) NOT NULL,
  PRIMARY KEY (`empresa_id`,`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_etapas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedido_id` int NOT NULL,
  `etapa` varchar(12) NOT NULL,
  `rodada` int NOT NULL DEFAULT 1,
  `inicio` datetime DEFAULT NULL,
  `fim` datetime DEFAULT NULL,
  `resultado` varchar(10) DEFAULT NULL,
  `retroativo` tinyint(1) NOT NULL DEFAULT 0,
  `justificativa` varchar(500) DEFAULT NULL,
  `observacao` varchar(500) DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conteudo_etapa_pedido` (`pedido_id`,`etapa`,`rodada`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `codigo_legado` int DEFAULT NULL,
  `cliente` varchar(150) NOT NULL,
  `tipo_id` int DEFAULT NULL,
  `tipo_nome` varchar(120) DEFAULT NULL,
  `titulo` varchar(255) NOT NULL,
  `descricao` text DEFAULT NULL,
  `solicitante` varchar(150) DEFAULT NULL,
  `analista_id` int DEFAULT NULL,
  `analista_nome` varchar(150) DEFAULT NULL,
  `aberto_em` datetime NOT NULL,
  `validador_tipo` varchar(10) NOT NULL DEFAULT 'cliente',
  `status` varchar(24) NOT NULL DEFAULT 'a_fazer',
  `origem` varchar(10) NOT NULL DEFAULT 'portal',
  `revisao` varchar(10) DEFAULT NULL,
  `revisao_motivo` varchar(500) DEFAULT NULL,
  `revisado_por_id` int DEFAULT NULL,
  `revisado_em` datetime DEFAULT NULL,
  `lembrar_em` date DEFAULT NULL,
  `concluido_em` datetime DEFAULT NULL,
  `cancelado_em` datetime DEFAULT NULL,
  `cancelado_motivo` varchar(500) DEFAULT NULL,
  `criado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `treinamento_id` int DEFAULT NULL,
  `serie_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conteudo_legado` (`empresa_id`,`codigo_legado`),
  KEY `idx_conteudo_ped_empresa` (`empresa_id`,`status`),
  KEY `idx_conteudo_ped_analista` (`analista_id`),
  KEY `idx_conteudo_ped_aberto` (`aberto_em`),
  KEY `idx_conteudo_ped_turma` (`treinamento_id`),
  KEY `idx_conteudo_ped_serie` (`serie_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_series` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `cliente` varchar(150) NOT NULL,
  `gatilho` varchar(10) NOT NULL DEFAULT 'tbt',
  `tipo_id` int DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conteudo_serie` (`empresa_id`,`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_tbt_dispensas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `motivo` varchar(300) DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `usuario_nome` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conteudo_dispensa` (`treinamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conteudo_tipos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `prazo_criacao_h` decimal(6,2) NOT NULL DEFAULT 0.00,
  `prazo_validacao_h` decimal(6,2) NOT NULL DEFAULT 0.00,
  `prazo_postagem_h` decimal(6,2) NOT NULL DEFAULT 0.00,
  `pontos` decimal(5,1) NOT NULL DEFAULT 1.0,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `ordem` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conteudo_tipo` (`empresa_id`,`nome`),
  KEY `idx_conteudo_tipo_empresa` (`empresa_id`,`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dados_bancarios_colaborador` (
  `cpf` varchar(11) NOT NULL,
  `nome` varchar(200) DEFAULT NULL,
  `banco` varchar(100) DEFAULT NULL,
  `agencia` varchar(20) DEFAULT NULL,
  `operacao` varchar(20) DEFAULT NULL,
  `conta` varchar(30) DEFAULT NULL,
  `dv` varchar(20) DEFAULT NULL,
  `tipo_chave_pix` varchar(20) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `atualizado_por` varchar(150) DEFAULT NULL,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int NOT NULL,
  `pessoa_id` int DEFAULT NULL,
  PRIMARY KEY (`empresa_id`,`cpf`),
  KEY `idx_dados_bancarios_colaborador_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_dados_bancarios_colaborador_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `empresas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `cnpj` varchar(20) DEFAULT NULL,
  `ativo` tinyint(1) DEFAULT 1,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `custo_hora_treinamento` decimal(8,2) DEFAULT NULL,
  `codigo` varchar(50) DEFAULT NULL,
  `plano` varchar(30) DEFAULT 'basico',
  `limite_usuarios` int DEFAULT NULL,
  `limite_turmas` int DEFAULT NULL,
  `contato_nome` varchar(150) DEFAULT NULL,
  `contato_email` varchar(150) DEFAULT NULL,
  `contato_telefone` varchar(30) DEFAULT NULL,
  `subdomain` varchar(150) DEFAULT NULL,
  `cor_primaria` varchar(10) DEFAULT '#FF6B4A',
  `logo_url` varchar(500) DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cnpj` (`cnpj`),
  UNIQUE KEY `uq_empresas_codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fechamentos_mensais` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `cliente` varchar(150) NOT NULL,
  `mes` char(7) NOT NULL,
  `dados_json` longtext NOT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `fechado_por` int DEFAULT NULL,
  `fechado_por_nome` varchar(150) DEFAULT NULL,
  `fechado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fechamento` (`empresa_id`,`cliente`,`mes`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `instrutor_apelidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `instrutor_id` int NOT NULL,
  `apelido` varchar(150) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instrutor_apelido` (`empresa_id`,`apelido`),
  KEY `idx_apelido_instrutor` (`instrutor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `instrutores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `situacao` varchar(20) NOT NULL DEFAULT 'ativo',
  `data_saida` date DEFAULT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `observacao` text DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instrutor_nome` (`empresa_id`,`nome`),
  KEY `idx_instrutor_situacao` (`empresa_id`,`situacao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `instrutores_desligados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `nome` varchar(150) NOT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_instrutores_desligados_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_encontros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `jornada_id` int NOT NULL,
  `etapa_id` int DEFAULT NULL,
  `titulo` varchar(200) NOT NULL,
  `data` date NOT NULL,
  `hora_inicio` varchar(5) DEFAULT NULL,
  `carga_horaria` decimal(6,2) NOT NULL DEFAULT 0.00,
  `responsavel` varchar(150) DEFAULT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `criado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `trilha_id` int DEFAULT NULL,
  `trilha_etapa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_jornada_encontros_jornada` (`jornada_id`,`data`),
  KEY `idx_jornada_encontros_etapa` (`etapa_id`),
  KEY `idx_jornada_encontros_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_evolucao_notas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `participante_id` int NOT NULL,
  `data` date NOT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'geral',
  `texto` text NOT NULL,
  `criado_por_id` int DEFAULT NULL,
  `criado_por_nome` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jen_participante` (`participante_id`,`data`),
  KEY `idx_jen_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_participante_etapas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `participante_id` int NOT NULL,
  `etapa_id` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'nao_iniciada',
  `data_conclusao` date DEFAULT NULL,
  `avaliacao` varchar(15) DEFAULT NULL,
  `nota` decimal(4,1) DEFAULT NULL,
  `observacao` varchar(500) DEFAULT NULL,
  `atualizado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_jornada_participante_etapa` (`participante_id`,`etapa_id`),
  KEY `idx_jpe_etapa` (`etapa_id`),
  KEY `idx_jpe_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_participantes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jornada_id` int NOT NULL,
  `nome` varchar(255) NOT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `cliente` varchar(255) DEFAULT NULL,
  `turma` varchar(255) DEFAULT NULL,
  `cargo` varchar(255) DEFAULT NULL,
  `supervisor` varchar(255) DEFAULT NULL,
  `status_jornada` enum('nao_iniciado','em_percurso','concluido','em_sustentacao') NOT NULL DEFAULT 'em_percurso',
  `origem_importacao` varchar(50) DEFAULT 'manual',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `cpf` varchar(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_jornada_participante` (`jornada_id`,`nome`,`matricula`),
  KEY `idx_jornada_participantes_jornada` (`jornada_id`),
  KEY `idx_jornada_participantes_nome` (`nome`),
  KEY `idx_jornada_participantes_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_jornada_participantes_jornada` FOREIGN KEY (`jornada_id`) REFERENCES `jornadas_desenvolvimento` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jornada_participantes_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_presencas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `encontro_id` int NOT NULL,
  `participante_id` int NOT NULL,
  `situacao` varchar(15) NOT NULL,
  `origem` varchar(15) NOT NULL DEFAULT 'manual',
  `registrado_por_id` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_jornada_presenca` (`encontro_id`,`participante_id`),
  KEY `idx_jornada_presencas_participante` (`participante_id`),
  CONSTRAINT `fk_jornada_presencas_encontro` FOREIGN KEY (`encontro_id`) REFERENCES `jornada_encontros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornada_trilhas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `jornada_id` int NOT NULL,
  `trilha_id` int NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_jornada_trilha` (`jornada_id`,`trilha_id`),
  KEY `idx_jornada_trilhas_trilha` (`trilha_id`),
  KEY `idx_jornada_trilhas_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornadas_desenvolvimento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente` varchar(150) DEFAULT NULL,
  `nome` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `objetivo` text DEFAULT NULL,
  `publico_macro` varchar(255) DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'planejada',
  `responsavel_id` int DEFAULT NULL,
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `presenca_minima_pct` decimal(5,2) NOT NULL DEFAULT 75.00,
  `meta_horas` decimal(8,2) DEFAULT NULL,
  `periodicidade_meses` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_jornadas_desenvolvimento_responsavel` (`responsavel_id`),
  KEY `idx_jornadas_desenvolvimento_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jornadas_etapas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jornada_id` int NOT NULL,
  `nome` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `objetivo` text DEFAULT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT 'treinamento',
  `ordem` int NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'planejada',
  `responsavel_id` int DEFAULT NULL,
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `carga_horaria_prevista` decimal(10,2) NOT NULL DEFAULT 0.00,
  `carga_horaria_realizada` decimal(10,2) NOT NULL DEFAULT 0.00,
  `observacoes` text DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `trilha_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_jornadas_etapas_jornada` (`jornada_id`),
  KEY `idx_jornadas_etapas_responsavel` (`responsavel_id`),
  KEY `idx_jornadas_etapas_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `materiais_avaliativos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `tipo` varchar(30) DEFAULT NULL,
  `link_arquivo` text DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `nota_maxima` decimal(5,2) DEFAULT 10.00,
  `data_aplicacao` date DEFAULT NULL,
  `questoes_json` longtext DEFAULT NULL,
  `tentativas_max` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `metodologia_clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ativo',
  `observacoes` text DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_metodologia_clientes_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `necessidades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `cliente_interno` varchar(150) NOT NULL,
  `prioridade` varchar(20) DEFAULT 'Média',
  `status` varchar(50) DEFAULT 'Pendente',
  `criado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `necessidades_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `necessidades_treinamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente` varchar(150) NOT NULL,
  `tema` varchar(200) NOT NULL,
  `horas_necessarias` decimal(10,2) DEFAULT 0.00,
  `prazo` date DEFAULT NULL,
  `prioridade` varchar(20) DEFAULT 'media',
  `status` varchar(30) DEFAULT NULL,
  `origem` varchar(100) DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `solicitante_id` int DEFAULT NULL,
  `solicitante_nome` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_acompanhamentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `turma_id` int NOT NULL,
  `inscricao_id` int NOT NULL,
  `marco` smallint NOT NULL,
  `data_prevista` date NOT NULL,
  `status` varchar(15) NOT NULL DEFAULT 'pendente',
  `resultado` varchar(20) DEFAULT NULL,
  `gestor_nome` varchar(150) DEFAULT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `registrado_por_id` int DEFAULT NULL,
  `registrado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_acomp_inscricao_marco` (`inscricao_id`,`marco`),
  KEY `idx_acomp_empresa` (`empresa_id`,`status`,`data_prevista`),
  KEY `idx_acomp_turma` (`turma_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_certificados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `turma_id` int NOT NULL,
  `inscricao_id` int NOT NULL,
  `pessoa_id` int DEFAULT NULL,
  `codigo` varchar(20) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `turma_nome` varchar(255) NOT NULL,
  `carga_horaria` decimal(6,2) DEFAULT NULL,
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `percentual_presenca` decimal(5,2) DEFAULT NULL,
  `emitido_por_id` int DEFAULT NULL,
  `emitido_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oficina_cert_codigo` (`codigo`),
  UNIQUE KEY `uk_oficina_cert_inscricao` (`inscricao_id`),
  KEY `idx_oficina_cert_turma` (`turma_id`),
  KEY `idx_oficina_cert_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_oficina_cert_inscricao` FOREIGN KEY (`inscricao_id`) REFERENCES `oficina_inscricoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oficina_cert_turma` FOREIGN KEY (`turma_id`) REFERENCES `oficina_turmas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_inscricoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `turma_id` int NOT NULL,
  `empresa_id` int NOT NULL,
  `pessoa_id` int DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `cpf` varchar(11) NOT NULL,
  `matricula` varchar(100) NOT NULL,
  `escolaridade` varchar(80) DEFAULT NULL,
  `horario_trabalho` varchar(120) DEFAULT NULL,
  `cargo_atual` varchar(150) DEFAULT NULL,
  `cargo_almejado` varchar(150) DEFAULT NULL,
  `cargo_almejado_outro` varchar(150) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'em_conferencia',
  `vinculo` varchar(30) DEFAULT NULL,
  `motivo_conferencia` varchar(255) DEFAULT NULL,
  `consentimento_em` datetime DEFAULT NULL,
  `decidido_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `promovido_em` date DEFAULT NULL,
  `cargo_promovido` varchar(150) DEFAULT NULL,
  `promocao_obs` varchar(255) DEFAULT NULL,
  `promovido_por_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oficina_inscricao_turma_cpf` (`turma_id`,`cpf`),
  KEY `idx_oficina_inscricoes_turma` (`turma_id`,`status`),
  KEY `idx_oficina_inscricoes_pessoa` (`pessoa_id`),
  KEY `idx_oficina_inscricoes_empresa` (`empresa_id`),
  CONSTRAINT `fk_oficina_inscricoes_turma` FOREIGN KEY (`turma_id`) REFERENCES `oficina_turmas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_modulos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `turma_id` int NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `titulo` varchar(255) NOT NULL,
  `data` date DEFAULT NULL,
  `hora_inicio` varchar(5) DEFAULT NULL,
  `hora_fim` varchar(5) DEFAULT NULL,
  `carga_horaria` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_oficina_modulos_turma` (`turma_id`,`ordem`),
  CONSTRAINT `fk_oficina_modulos_turma` FOREIGN KEY (`turma_id`) REFERENCES `oficina_turmas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_presencas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `turma_id` int NOT NULL,
  `modulo_id` int NOT NULL,
  `inscricao_id` int NOT NULL,
  `registrado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oficina_presenca` (`modulo_id`,`inscricao_id`),
  KEY `idx_oficina_presencas_turma` (`turma_id`),
  KEY `idx_oficina_presencas_inscricao` (`inscricao_id`),
  CONSTRAINT `fk_oficina_presencas_inscricao` FOREIGN KEY (`inscricao_id`) REFERENCES `oficina_inscricoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oficina_presencas_modulo` FOREIGN KEY (`modulo_id`) REFERENCES `oficina_modulos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_reacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `turma_id` int NOT NULL,
  `modulo_id` int NOT NULL,
  `inscricao_id` int NOT NULL,
  `nota` tinyint(4) NOT NULL,
  `comentario` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reacao_modulo_inscricao` (`modulo_id`,`inscricao_id`),
  KEY `idx_reacao_turma` (`turma_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `oficina_turmas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `nome` varchar(255) NOT NULL,
  `descricao` text DEFAULT NULL,
  `token` varchar(48) NOT NULL,
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `horario` varchar(120) DEFAULT NULL,
  `modalidade` varchar(20) NOT NULL DEFAULT 'presencial',
  `local_nome` varchar(255) DEFAULT NULL,
  `endereco` varchar(500) DEFAULT NULL,
  `vagas` int DEFAULT NULL,
  `inscricoes_ate` date DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'rascunho',
  `cargos_elegiveis` text DEFAULT NULL,
  `cargos_almejados` text DEFAULT NULL,
  `carga_horaria_prevista` decimal(6,2) DEFAULT NULL,
  `criado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `presenca_minima` decimal(5,2) NOT NULL DEFAULT 100.00,
  `assinatura1_nome` varchar(150) DEFAULT NULL,
  `assinatura1_cargo` varchar(150) DEFAULT NULL,
  `assinatura2_nome` varchar(150) DEFAULT NULL,
  `assinatura2_cargo` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oficina_turmas_token` (`token`),
  KEY `idx_oficina_turmas_empresa` (`empresa_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `token` varchar(64) NOT NULL,
  `expira_em` datetime NOT NULL,
  `usado` tinyint(1) DEFAULT 0,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_prt_token` (`token`),
  KEY `idx_prt_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pessoas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `cpf` varchar(11) DEFAULT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `cliente` varchar(255) DEFAULT NULL,
  `status_identidade` varchar(20) NOT NULL DEFAULT 'provisoria',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `operacao` varchar(150) DEFAULT NULL,
  `data_admissao` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pessoas_empresa_cpf` (`empresa_id`,`cpf`),
  KEY `idx_pessoas_empresa_matricula` (`empresa_id`,`matricula`),
  KEY `idx_pessoas_empresa_nome` (`empresa_id`,`nome`),
  CONSTRAINT `fk_pessoas_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pessoas_metodologia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `cliente` varchar(255) DEFAULT NULL,
  `cargo` varchar(255) DEFAULT NULL,
  `jornada_participante_id` int DEFAULT NULL,
  `coaching_individual_id` int DEFAULT NULL,
  `perfil_animal` varchar(20) DEFAULT NULL,
  `perfil_animal_secundario` varchar(20) DEFAULT NULL,
  `disc_letra_dominante` varchar(1) DEFAULT NULL,
  `disc_d` int DEFAULT NULL,
  `disc_i` int DEFAULT NULL,
  `disc_s` int DEFAULT NULL,
  `disc_c` int DEFAULT NULL,
  `origem` varchar(20) NOT NULL DEFAULT 'manual',
  `observacoes` text DEFAULT NULL,
  `registrado_por_id` int DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `pessoa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pessoas_metodologia_jornada_participante` (`jornada_participante_id`),
  KEY `idx_pessoas_metodologia_coaching_individual` (`coaching_individual_id`),
  KEY `idx_pessoas_metodologia_empresa` (`empresa_id`),
  KEY `idx_pessoas_metodologia_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_pessoas_metodologia_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `planos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(30) NOT NULL,
  `nome` varchar(80) NOT NULL,
  `descricao` varchar(200) DEFAULT NULL,
  `limite_usuarios` int NOT NULL DEFAULT 50,
  `limite_turmas` int NOT NULL DEFAULT 100,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `presenca_aulas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `turma_aula_id` int NOT NULL,
  `treinamento_id` int NOT NULL,
  `data_aula` date NOT NULL,
  `treinando_nome` varchar(200) NOT NULL,
  `status` varchar(20) DEFAULT 'pendente',
  `justificativa` text DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pa_aula_nome` (`turma_aula_id`,`treinando_nome`),
  KEY `idx_pa_treinamento` (`treinamento_id`),
  KEY `idx_pa_data` (`data_aula`),
  KEY `idx_pa_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `presencas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `data_chamada` date NOT NULL,
  `treinando_nome` varchar(150) NOT NULL,
  `presente` tinyint(1) DEFAULT 0,
  `status` varchar(50) DEFAULT 'Ausente',
  `justificativa` text DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `treinamento_id` (`treinamento_id`),
  CONSTRAINT `presencas_ibfk_1` FOREIGN KEY (`treinamento_id`) REFERENCES `treinamentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `prova_papel_arquivos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lote_id` int NOT NULL,
  `nome_original` varchar(255) DEFAULT NULL,
  `arquivo` varchar(255) NOT NULL,
  `tipo` varchar(80) DEFAULT NULL,
  `tamanho` int DEFAULT NULL,
  `enviado_por` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppa_lote` (`lote_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `prova_papel_lotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `material_id` int DEFAULT NULL,
  `titulo` varchar(200) NOT NULL,
  `nota_maxima` decimal(6,2) NOT NULL DEFAULT 10.00,
  `data_aplicacao` date DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'rascunho',
  `criado_por` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmado_por` varchar(150) DEFAULT NULL,
  `confirmado_em` datetime DEFAULT NULL,
  `desfeito_por` varchar(150) DEFAULT NULL,
  `desfeito_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ppl_trein` (`treinamento_id`),
  KEY `idx_ppl_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `prova_papel_resultados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lote_id` int NOT NULL,
  `participante_id` int NOT NULL,
  `pessoa_id` int DEFAULT NULL,
  `nome` varchar(200) NOT NULL,
  `faltou` tinyint(1) NOT NULL DEFAULT 0,
  `respostas_texto` varchar(400) DEFAULT NULL,
  `acertos` int DEFAULT NULL,
  `total_questoes` int DEFAULT NULL,
  `nota_original` decimal(6,2) DEFAULT NULL,
  `nota_10` decimal(5,2) DEFAULT NULL,
  `avaliacao_id` int DEFAULT NULL,
  `avaliacao_criada` tinyint(1) NOT NULL DEFAULT 0,
  `nota_anterior` decimal(5,2) DEFAULT NULL,
  `resposta_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr` (`lote_id`,`participante_id`),
  KEY `idx_ppr_part` (`participante_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `radar_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL DEFAULT 0,
  `chave` varchar(150) NOT NULL,
  `origem` varchar(20) NOT NULL,
  `gravidade` varchar(10) NOT NULL,
  `titulo` varchar(300) NOT NULL,
  `detalhe` text DEFAULT NULL,
  `acao` varchar(200) DEFAULT NULL,
  `decisao` text DEFAULT NULL,
  `dono` varchar(150) DEFAULT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `link` varchar(200) DEFAULT NULL,
  `prazo` date DEFAULT NULL,
  `estado` varchar(12) NOT NULL DEFAULT 'aberto',
  `primeira_vez` date NOT NULL,
  `ultima_vez` date NOT NULL,
  `resolvido_em` date DEFAULT NULL,
  `resolvido_por` varchar(10) DEFAULT NULL,
  `a_tempo` tinyint(4) DEFAULT NULL,
  `ignorado_motivo` varchar(255) DEFAULT NULL,
  `ignorado_ate` date DEFAULT NULL,
  `gravidade_ignorada` varchar(10) DEFAULT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `usuario_nome` varchar(150) DEFAULT NULL,
  `reabertos` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_radar_item` (`empresa_id`,`chave`),
  KEY `idx_radar_estado` (`empresa_id`,`estado`),
  KEY `idx_radar_resolvido` (`resolvido_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `radar_semanal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `escopo` int NOT NULL DEFAULT 0,
  `semana_inicio` date NOT NULL,
  `gerado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `dados` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_radar_semana` (`escopo`,`semana_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `respostas_avaliativas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `material_id` int DEFAULT NULL,
  `treinando_nome` varchar(255) DEFAULT NULL,
  `nota` decimal(5,2) DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `treinando_nome_legado` varchar(255) GENERATED ALWAYS AS (case when `pessoa_id` is null then `treinando_nome` else NULL end) VIRTUAL,
  `tentativa` int NOT NULL DEFAULT 1,
  `treinamento_id` int DEFAULT NULL,
  `respostas_json` longtext DEFAULT NULL,
  `acertos` int DEFAULT NULL,
  `total_questoes` int DEFAULT NULL,
  `percentual` decimal(5,2) DEFAULT NULL,
  `nota_final` decimal(5,2) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `origem` varchar(20) DEFAULT NULL,
  `lote_papel_id` int DEFAULT NULL,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_material_pessoa_tentativa` (`material_id`,`pessoa_id`,`tentativa`),
  UNIQUE KEY `uniq_material_legado_tentativa` (`material_id`,`treinando_nome_legado`,`tentativa`),
  KEY `idx_respostas_avaliativas_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_respostas_avaliativas_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `resumos_executivos_diarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `texto` text NOT NULL,
  `total_sinais` int NOT NULL DEFAULT 0,
  `gerado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resumo_exec_empresa_data` (`empresa_id`,`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_atividades_catalogo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `descricao` text DEFAULT NULL,
  `pede_pessoa` tinyint(1) NOT NULL DEFAULT 0,
  `minutos_padrao` int DEFAULT NULL,
  `tem_prazo_fim_turma` tinyint(1) NOT NULL DEFAULT 0,
  `marcada_padrao` tinyint(1) NOT NULL DEFAULT 0,
  `marcada_padrao_avtec` tinyint(1) NOT NULL DEFAULT 0,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `sistema` tinyint(1) NOT NULL DEFAULT 0,
  `criado_por` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rac_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_atividades_registros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int DEFAULT NULL,
  `catalogo_id` int DEFAULT NULL,
  `tipo_nome` varchar(120) NOT NULL,
  `data_atividade` date NOT NULL,
  `minutos` int NOT NULL,
  `instrutor` varchar(150) DEFAULT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `participante_id` int DEFAULT NULL,
  `pessoa_nome` varchar(200) DEFAULT NULL,
  `tema` varchar(300) DEFAULT NULL,
  `observacao` text DEFAULT NULL,
  `biblioteca_id` int DEFAULT NULL,
  `necessidade_id` int DEFAULT NULL,
  `criado_por` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rar_turma` (`treinamento_id`),
  KEY `idx_rar_instrutor` (`instrutor`,`data_atividade`),
  KEY `idx_rar_empresa` (`empresa_id`,`data_atividade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_avaliacao_individual` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `participante_id` int NOT NULL,
  `nota_pontualidade` tinyint(4) DEFAULT NULL,
  `nota_interesse` tinyint(4) DEFAULT NULL,
  `nota_comportamento` tinyint(4) DEFAULT NULL,
  `nota_quiz` tinyint(4) DEFAULT NULL,
  `nota_avaliacao_final` tinyint(4) DEFAULT NULL,
  `media` decimal(4,2) DEFAULT NULL,
  `resultado` varchar(20) DEFAULT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `atualizado_por` varchar(150) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rai` (`treinamento_id`,`participante_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_avaliacao_registro` (
  `treinamento_id` int NOT NULL,
  `empresa_id` int DEFAULT NULL,
  `registrada_por` varchar(150) DEFAULT NULL,
  `registrada_em` datetime NOT NULL,
  PRIMARY KEY (`treinamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_checklist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `etapa` varchar(20) NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `texto` varchar(500) NOT NULL,
  `resposta` varchar(5) DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `respondido_por` varchar(150) DEFAULT NULL,
  `respondido_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rc_item` (`treinamento_id`,`etapa`,`ordem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_diario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `data_dia` date NOT NULL,
  `texto` text DEFAULT NULL,
  `atualizado_por` varchar(150) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rd_dia` (`treinamento_id`,`data_dia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_modelo_checklist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `etapa` varchar(20) NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `texto` varchar(500) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_rmc_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_modelo_tarefas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `item` varchar(200) NOT NULL,
  `o_que_fazer` varchar(600) DEFAULT NULL,
  `ancora` varchar(20) NOT NULL DEFAULT 'continuo',
  `offset_dias` int NOT NULL DEFAULT 0,
  `dias_uteis` tinyint(1) NOT NULL DEFAULT 0,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_rmt_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_tarefas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `item` varchar(200) NOT NULL,
  `o_que_fazer` varchar(600) DEFAULT NULL,
  `ancora` varchar(20) NOT NULL DEFAULT 'continuo',
  `offset_dias` int NOT NULL DEFAULT 0,
  `dias_uteis` tinyint(1) NOT NULL DEFAULT 0,
  `feito` tinyint(1) NOT NULL DEFAULT 0,
  `feito_em` datetime DEFAULT NULL,
  `feito_por` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rt_item` (`treinamento_id`,`ordem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rotina_turma_atividades` (
  `treinamento_id` int NOT NULL,
  `catalogo_id` int NOT NULL,
  PRIMARY KEY (`treinamento_id`,`catalogo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `mes_referencia` date NOT NULL,
  `site` varchar(100) NOT NULL,
  `setor` enum('OPERACIONAL','ESTRATÉGICO') NOT NULL,
  `chamado` varchar(200) DEFAULT NULL,
  `produto` varchar(150) NOT NULL,
  `cargo` varchar(200) DEFAULT NULL,
  `data_recebimento` date DEFAULT NULL,
  `status` enum('EM ANDAMENTO','ENTREGUE','NÃO ENTREGUE','CANCELADA') NOT NULL DEFAULT 'EM ANDAMENTO',
  `inicio_av_tecnica` date DEFAULT NULL,
  `final_av_tecnica` date DEFAULT NULL,
  `data_fechamento_vaga` date DEFAULT NULL,
  `hcs` int NOT NULL DEFAULT 0,
  `hcs_com_to` int NOT NULL DEFAULT 0,
  `hcs_aprovados` int NOT NULL DEFAULT 0,
  `qtd_entregue` int NOT NULL DEFAULT 0,
  `observacoes` text DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `excluido_em` datetime DEFAULT NULL,
  `excluido_por` int DEFAULT NULL,
  `hcs_berco` int NOT NULL DEFAULT 0,
  `hcs_convocados_berco` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_rps_empresa` (`empresa_id`),
  KEY `idx_rps_mes` (`mes_referencia`),
  KEY `idx_rps_site` (`site`),
  KEY `idx_rps_setor` (`setor`),
  KEY `idx_rps_status` (`status`),
  KEY `idx_rps_excluido` (`empresa_id`,`excluido_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rps_comentarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `rp_id` int NOT NULL,
  `autor_id` int DEFAULT NULL,
  `autor_nome` varchar(150) DEFAULT NULL,
  `autor_perfil` varchar(40) DEFAULT NULL,
  `texto` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rps_comentarios_rp` (`rp_id`,`created_at`),
  KEY `idx_rps_comentarios_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rps_convocacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rp_id` int NOT NULL,
  `empresa_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `observacao` varchar(500) DEFAULT NULL,
  `convocado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `estornado_em` datetime DEFAULT NULL,
  `estornado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rps_convocacoes_rp` (`rp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rs_produtos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rs_sites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `salas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(80) NOT NULL,
  `capacidade` int DEFAULT NULL,
  `grupo` varchar(30) NOT NULL DEFAULT 'geral',
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salas_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `subtipos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `chave_sistema` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subtipos_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `treinamento_instrutores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `treinamento_id` int NOT NULL,
  `instrutor` varchar(150) NOT NULL,
  `criado_por` varchar(150) DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ti_turma_instrutor` (`treinamento_id`,`instrutor`),
  KEY `idx_ti_instrutor` (`instrutor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `treinamento_participantes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `nome` varchar(200) NOT NULL,
  `matricula` varchar(50) DEFAULT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `turma` varchar(150) DEFAULT NULL,
  `supervisor` varchar(150) DEFAULT NULL,
  `operacao` varchar(150) DEFAULT NULL,
  `data_admissao` date DEFAULT NULL,
  `status_presenca` varchar(20) DEFAULT 'pendente',
  `justificativa` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cpf` varchar(11) DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tp_treinamento` (`treinamento_id`),
  KEY `idx_tp_status` (`status_presenca`),
  KEY `idx_treinamento_participantes_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_treinamento_participantes_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `treinamentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tema` varchar(200) NOT NULL,
  `cliente` varchar(150) NOT NULL,
  `instrutor` varchar(150) DEFAULT NULL,
  `carga_horaria` decimal(8,2) DEFAULT NULL,
  `participantes` int DEFAULT NULL,
  `participantes_previstos` int DEFAULT NULL,
  `participantes_presentes` int DEFAULT NULL,
  `concluidos` int DEFAULT NULL,
  `publico` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Planejado',
  `descricao` text DEFAULT NULL,
  `data` date DEFAULT NULL,
  `data_inicio` datetime DEFAULT NULL,
  `data_fim` datetime DEFAULT NULL,
  `turma` varchar(100) DEFAULT NULL,
  `supervisor` varchar(150) DEFAULT NULL,
  `necessidade_id` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  `hora_inicio` time DEFAULT NULL,
  `hora_fim` time DEFAULT NULL,
  `sala_id` int DEFAULT NULL,
  `sala_outro_local` varchar(150) DEFAULT NULL,
  `subtipo` varchar(100) DEFAULT NULL,
  `valor_passagem_vt` decimal(10,2) DEFAULT NULL,
  `presenca_minima_pct` decimal(5,2) DEFAULT NULL,
  `rp_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_treinamentos_empresa` (`empresa_id`),
  KEY `idx_treinamentos_sala` (`sala_id`),
  KEY `idx_treinamentos_rp` (`rp_id`),
  KEY `fk_legada` (`necessidade_id`),
  CONSTRAINT `fk_treinamentos_sala` FOREIGN KEY (`sala_id`) REFERENCES `salas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trilha_etapas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trilha_id` int NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `titulo` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `tipo` varchar(50) DEFAULT 'conteudo',
  `turma_id` int DEFAULT NULL,
  `empresa_id` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_etapas_trilha` (`trilha_id`),
  KEY `idx_etapas_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trilha_participantes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `trilha_id` int NOT NULL,
  `chave` varchar(40) NOT NULL,
  `pessoa_id` int DEFAULT NULL,
  `jornada_participante_id` int DEFAULT NULL,
  `nome` varchar(255) NOT NULL,
  `matricula` varchar(100) DEFAULT NULL,
  `turma` varchar(255) DEFAULT NULL,
  `cargo` varchar(255) DEFAULT NULL,
  `origem` varchar(20) NOT NULL DEFAULT 'manual',
  `situacao` varchar(12) NOT NULL DEFAULT 'ativo',
  `entrou_em` date DEFAULT NULL,
  `criado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_trilha_participante` (`trilha_id`,`chave`),
  KEY `idx_trilha_part_trilha` (`trilha_id`),
  KEY `idx_trilha_part_pessoa` (`pessoa_id`),
  KEY `idx_trilha_part_jp` (`jornada_participante_id`),
  KEY `idx_trilha_part_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trilha_progresso` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trilha_id` int NOT NULL,
  `etapa_id` int NOT NULL,
  `usuario_email` varchar(150) NOT NULL,
  `empresa_id` int DEFAULT NULL,
  `concluido` tinyint(1) DEFAULT 0,
  `concluido_em` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_progresso` (`etapa_id`,`usuario_email`),
  KEY `idx_progresso_trilha` (`trilha_id`),
  KEY `idx_progresso_usuario` (`usuario_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trilha_progresso_pessoa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `trilha_id` int NOT NULL,
  `trilha_participante_id` int NOT NULL,
  `etapa_id` int NOT NULL,
  `data_conclusao` date DEFAULT NULL,
  `observacao` varchar(500) DEFAULT NULL,
  `origem` varchar(20) NOT NULL DEFAULT 'manual',
  `lancado_por_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_trilha_prog_pessoa` (`trilha_participante_id`,`etapa_id`),
  KEY `idx_trilha_prog_trilha` (`trilha_id`),
  KEY `idx_trilha_prog_etapa` (`etapa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trilhas_aprendizagem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente` varchar(150) DEFAULT NULL,
  `titulo` varchar(200) NOT NULL,
  `descricao` text DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'estruturacao',
  `empresa_id` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trilhas_empresa` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `turma_aulas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `dia_numero` int NOT NULL DEFAULT 1,
  `data_aula` date NOT NULL,
  `conteudo` text DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ordem` int DEFAULT 1,
  `titulo` varchar(200) DEFAULT NULL,
  `objetivo` text DEFAULT NULL,
  `conteudo_planejado` text DEFAULT NULL,
  `metodologia` varchar(150) DEFAULT NULL,
  `carga_horaria_planejada` decimal(10,2) DEFAULT 0.00,
  `instrutor_responsavel` varchar(150) DEFAULT NULL,
  `material_apoio` text DEFAULT NULL,
  `status_execucao` varchar(30) DEFAULT 'planejada',
  `conteudo_ministrado` text DEFAULT NULL,
  `carga_horaria_real` decimal(10,2) DEFAULT NULL,
  `observacoes_execucao` text DEFAULT NULL,
  `reprogramada` tinyint(1) DEFAULT 0,
  `motivo_reprogramacao` text DEFAULT NULL,
  `ministrada_em` timestamp NULL DEFAULT NULL,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `empresa_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `treinamento_id` (`treinamento_id`),
  KEY `idx_ta_instrutor` (`instrutor_responsavel`),
  KEY `idx_ta_status` (`status_execucao`),
  CONSTRAINT `turma_aulas_ibfk_1` FOREIGN KEY (`treinamento_id`) REFERENCES `treinamentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `turma_publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `treinamento_id` int NOT NULL,
  `autor_id` int DEFAULT NULL,
  `autor_nome` varchar(150) DEFAULT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `conteudo` text NOT NULL,
  `fixado` tinyint(1) DEFAULT 0,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_turma_publicacoes_treinamento` (`treinamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `nome` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `senha_hash` varchar(255) DEFAULT NULL,
  `perfil` varchar(50) DEFAULT 'Instrutor',
  `cliente` varchar(100) DEFAULT NULL,
  `ativo` tinyint(1) DEFAULT 1,
  `troca_senha_obrigatoria` tinyint(1) DEFAULT 0,
  `pode_acessar_oceano_desenvolvimento` tinyint(1) DEFAULT 0,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `senha` varchar(255) DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `codigo_acesso` varchar(16) DEFAULT NULL,
  `codigo_acesso_expira` datetime DEFAULT NULL,
  `super_admin` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `empresa_id` (`empresa_id`),
  KEY `idx_usuarios_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_usuarios_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
