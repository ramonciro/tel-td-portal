// src/database/migrate.js
const pool = require("../lib/db");

// ---------------------------------------------------------------------------
// Helpers idempotentes de migração — usados para os itens que a migração
// original (CREATE TABLE IF NOT EXISTS) não cobre: adicionar colunas em
// tabelas que já existem com um schema mais antigo/menor, e alterar o tipo
// de uma coluna existente. Sem isso, ambientes onde a tabela já existia
// (criada manualmente ou por uma versão anterior deste arquivo) nunca
// recebiam as colunas novas, e os controllers que dependem delas (ex.:
// turmaAulasController, capacidadeController) quebravam com "unknown column"
// ou simplesmente nunca tinham dado nenhum para trabalhar.
// ---------------------------------------------------------------------------
async function columnInfo(table, column) {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows[0] || null;
}

async function ensureColumn(table, column, definitionSql) {
  const info = await columnInfo(table, column);
  if (info) return;
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
    console.log(`  ↳ coluna adicionada: ${table}.${column}`);
  } catch (error) {
    // Corrida entre instâncias/deploys tentando adicionar a mesma coluna ao
    // mesmo tempo — se já existe agora, seguimos; senão, propaga o erro real.
    if (!/duplicate column/i.test(error.message || "")) throw error;
  }
}

async function ensureDecimalType(table, column, targetTypeSql) {
  const info = await columnInfo(table, column);
  if (!info || info.DATA_TYPE === "decimal") return;
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${targetTypeSql}`);
  console.log(`  ↳ coluna ampliada para decimal: ${table}.${column}`);
}

// Ajuste pós-entrega do Pacote Salas (15/09/2026) — hipótese levantada para o
// erro genérico "Erro ao criar registro em usuarios" ao tentar criar o
// primeiro usuário com o perfil novo (assistente_treinamento): se a tabela
// `usuarios` já existia (criada manualmente, ou por uma versão bem antiga
// deste projeto) com `perfil` como ENUM de valores fixos em vez de VARCHAR —
// `CREATE TABLE IF NOT EXISTS` (passo 2 acima) nunca chega a rodar nesse
// ambiente, então a coluna nunca foi corrigida. Um ENUM aceita qualquer valor
// já cadastrado antes (coordenador, supervisor, instrutor...) sem problema, e
// só quebra exatamente no primeiro valor totalmente novo — o que bate com o
// sintoma. Idempotente e segura: em qualquer ambiente onde a coluna já é
// VARCHAR (caso do banco de teste local), não faz nada.
async function ensureVarcharType(table, column, length) {
  const info = await columnInfo(table, column);
  if (!info || info.DATA_TYPE === "varchar") return;
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} VARCHAR(${length})`);
  console.log(`  ↳ coluna convertida para VARCHAR(${length}): ${table}.${column} (era ${info.DATA_TYPE})`);
}

// Pacote 2 (item "DEFAULT perigoso em empresa_id"): várias tabelas do módulo
// Oceano/Trilhas/Certificados foram criadas com `empresa_id INT NULL DEFAULT
// 1` — mesmo problema já identificado e corrigido na tabela `biblioteca`
// (ver item 26 abaixo): qualquer INSERT que esqueça de informar empresa_id
// explicitamente cai silenciosamente dentro do tenant de id 1 (o primeiro
// ambiente cadastrado) em vez de ficar sem tenant e ser barrado pelos filtros
// de isolamento. Os CREATE TABLE já foram corrigidos para `empresa_id INT
// NULL` (sem DEFAULT), mas isso só vale para bancos novos — em produção a
// coluna já existe com o DEFAULT antigo, e CREATE TABLE IF NOT EXISTS não
// mexe em tabela existente. Esta função detecta e remove o DEFAULT em
// bancos onde ele já foi aplicado; idempotente e segura de rodar toda vez.
async function ensureNoTenantDefault(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  const info = rows[0];
  // mysql2 devolve o DEFAULT ausente ora como null de verdade, ora como a
  // string literal "NULL" (varia conforme a versão do servidor) — os dois
  // significam "já está sem DEFAULT", nada a fazer.
  if (!info || info.COLUMN_DEFAULT === null || info.COLUMN_DEFAULT === "NULL") return;
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} INT NULL`);
  console.log(`  ↳ removido DEFAULT perigoso: ${table}.${column} (era DEFAULT ${info.COLUMN_DEFAULT})`);
}

// Cadastro único de pessoas (Fase 0, 22/09/2026) — helpers específicos desta
// migração. Ver pessoasService.js para a lógica de casamento de identidade;
// aqui é só schema.
async function ensurePessoaIndex(table) {
  const indexName = `idx_${table}_pessoa`;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (rows[0].c > 0) return;
  await pool.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (pessoa_id)`);
  console.log(`  ↳ índice adicionado: ${indexName}`);
}

// FK real (diferente do padrão solto usado em jornada_participante_id/
// coaching_individual_id entre tabelas-irmãs do módulo Metodologia): aqui
// `pessoas` é pra ser a fonte de verdade central, então vale a pena a
// garantia de integridade referencial. ON DELETE SET NULL — apagar uma
// pessoa nunca apaga o histórico de turma/jornada/coaching, só desvincula.
async function ensurePessoaForeignKey(table) {
  const fkName = `fk_${table}_pessoa`;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, fkName]
  );
  if (rows[0].c > 0) return;
  try {
    await pool.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${fkName} FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL`
    );
    console.log(`  ↳ FK adicionada: ${fkName}`);
  } catch (error) {
    // Mesma cautela do ensureColumn: corrida entre instâncias, ou (mais
    // provável aqui) linhas pré-existentes com pessoa_id apontando pra um
    // id que não existe em pessoas — nesse segundo caso a FK não entra e
    // fica registrado no log em vez de derrubar o boot do backend; precisa
    // de saneamento manual dos dados antes de reaplicar.
    console.warn(`  ⚠ não foi possível adicionar ${fkName}: ${error.message}`);
  }
}

// Corrige dados_bancarios_colaborador de PRIMARY KEY (cpf) — colide entre
// empresas diferentes com colaborador de mesmo CPF, achado durante a
// proposta de cadastro único (22/09/2026) — para PRIMARY KEY (empresa_id,
// cpf). Só executa quando não há nenhuma linha com empresa_id NULL: se
// houver, são registros de antes da coluna empresa_id existir e precisam de
// backfill manual (ver relatório de 22/09/2026) antes de apertar a chave —
// a migração audita e avisa em vez de adivinhar o dono.
async function ensureDadosBancariosComposedKey() {
  const [pkRows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dados_bancarios_colaborador'
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`
  );
  const pkCols = pkRows.map((r) => r.COLUMN_NAME);
  if (pkCols.length === 2 && pkCols[0] === "empresa_id" && pkCols[1] === "cpf") return; // já migrado

  const [nullRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM dados_bancarios_colaborador WHERE empresa_id IS NULL`
  );
  if (nullRows[0].c > 0) {
    console.warn(
      `  ⚠ dados_bancarios_colaborador tem ${nullRows[0].c} linha(s) com empresa_id NULL — ` +
      `chave composta (empresa_id, cpf) NÃO aplicada automaticamente. Backfill manual do dono ` +
      `necessário antes desta migração poder rodar (ver relatório de 22/09/2026).`
    );
    return;
  }

  await pool.query(`ALTER TABLE dados_bancarios_colaborador MODIFY empresa_id INT NOT NULL`);
  await pool.query(`ALTER TABLE dados_bancarios_colaborador DROP PRIMARY KEY, ADD PRIMARY KEY (empresa_id, cpf)`);
  console.log(`  ↳ chave primária de dados_bancarios_colaborador corrigida para (empresa_id, cpf)`);
}

// Inclusão de usuários (treinandos), 25/09/2026 — Decisão 1 do Ramon (login
// por CPF/matrícula em vez de só e-mail): contas geradas em lote a partir da
// importação de turma não têm e-mail nenhum (a planilha de participantes
// nunca teve essa coluna) e não devem ganhar um e-mail inventado só pra
// satisfazer a constraint. `email` era UNIQUE NOT NULL desde a tabela
// original — em MySQL/MariaDB, UNIQUE permite múltiplos NULL (não são
// considerados iguais entre si), então relaxar pra NULL não abre brecha de
// duplicidade entre quem continua logando por e-mail. Idempotente: só roda
// a ALTER se a coluna ainda estiver NOT NULL.
async function ensureEmailNullableUsuarios() {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'email'
     LIMIT 1`
  );
  if (!rows.length || rows[0].IS_NULLABLE === "YES") return;
  await pool.query(`ALTER TABLE usuarios MODIFY COLUMN email VARCHAR(150) NULL`);
  console.log(`  ↳ usuarios.email agora aceita NULL (contas sem e-mail, login por CPF/matrícula)`);
}

// 53. Oficina de Talentos (Metodologia), Fase 1 — turmas, grade livre e
// inscrições por link público (13/10/2026, pedido do Ramon; proposta em
// claude/proposta-oficina-de-talentos-2026-10-09.md). Três tabelas novas, todas
// com empresa_id (multi-ambiente). Nada aqui altera tabela existente.
//  - oficina_turmas: uma edição/local da Oficina. `token` é o que vai no link
//    público e também define a empresa (tenant) da inscrição.
//  - oficina_modulos: grade da turma, preenchida livremente (a grade e a carga
//    horária variam por oficina — decisão do Ramon).
//  - oficina_inscricoes: retrato do que a pessoa informou + vínculo opcional
//    com `pessoas`/`usuarios`. UNIQUE (turma_id, cpf): uma inscrição por pessoa
//    por turma.
async function ensureOficinaTalentos() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_turmas (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id            INT NOT NULL,
      nome                  VARCHAR(255) NOT NULL,
      descricao             TEXT NULL,
      token                 VARCHAR(48) NOT NULL,
      data_inicio           DATE NULL,
      data_fim              DATE NULL,
      horario               VARCHAR(120) NULL,
      modalidade            VARCHAR(20) NOT NULL DEFAULT 'presencial',
      local_nome            VARCHAR(255) NULL,
      endereco              VARCHAR(500) NULL,
      vagas                 INT NULL,
      inscricoes_ate        DATE NULL,
      status                VARCHAR(30) NOT NULL DEFAULT 'rascunho',
      cargos_elegiveis      TEXT NULL,
      cargos_almejados      TEXT NULL,
      carga_horaria_prevista DECIMAL(6,2) NULL,
      criado_por_id         INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_oficina_turmas_token (token),
      INDEX idx_oficina_turmas_empresa (empresa_id, status)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_modulos (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      turma_id       INT NOT NULL,
      ordem          INT NOT NULL DEFAULT 0,
      titulo         VARCHAR(255) NOT NULL,
      data           DATE NULL,
      hora_inicio    VARCHAR(5) NULL,
      hora_fim       VARCHAR(5) NULL,
      carga_horaria  DECIMAL(5,2) NULL,
      INDEX idx_oficina_modulos_turma (turma_id, ordem),
      CONSTRAINT fk_oficina_modulos_turma FOREIGN KEY (turma_id) REFERENCES oficina_turmas(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_inscricoes (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      turma_id              INT NOT NULL,
      empresa_id            INT NOT NULL,
      pessoa_id             INT NULL,
      usuario_id            INT NULL,
      nome                  VARCHAR(255) NOT NULL,
      email                 VARCHAR(255) NULL,
      cpf                   VARCHAR(11) NOT NULL,
      matricula             VARCHAR(100) NOT NULL,
      escolaridade          VARCHAR(80) NULL,
      horario_trabalho      VARCHAR(120) NULL,
      cargo_atual           VARCHAR(150) NULL,
      cargo_almejado        VARCHAR(150) NULL,
      cargo_almejado_outro  VARCHAR(150) NULL,
      status                VARCHAR(30) NOT NULL DEFAULT 'em_conferencia',
      vinculo               VARCHAR(30) NULL,
      motivo_conferencia    VARCHAR(255) NULL,
      consentimento_em      DATETIME NULL,
      decidido_por_id       INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_oficina_inscricao_turma_cpf (turma_id, cpf),
      INDEX idx_oficina_inscricoes_turma (turma_id, status),
      INDEX idx_oficina_inscricoes_pessoa (pessoa_id),
      INDEX idx_oficina_inscricoes_empresa (empresa_id),
      CONSTRAINT fk_oficina_inscricoes_turma FOREIGN KEY (turma_id) REFERENCES oficina_turmas(id) ON DELETE CASCADE
    );
  `);
}

// 55. Oficina de Talentos, Fase 2 — presença por módulo, regra/assinaturas do
// certificado e certificados emitidos (13/10/2026). Decisões do Ramon: o
// certificado exige participação + presença + carga horária; presença mínima é
// configurável por turma (padrão 100% da carga horária da grade); assinam
// "Colaborador(a)" e "Coordenador(a) de T&D" (nomes digitados por turma).
//  - oficina_presencas: uma linha = pessoa presente naquele módulo (credenciada).
//  - oficina_certificados: um por inscrição (UNIQUE), com retrato do nome, da
//    turma, da carga horária e das datas no momento da emissão, e um código
//    público de validação. Tabela própria — a `certificados` existente é presa a
//    `treinamento_id` e a Oficina fica separada da Treinamento (decisão 09/10).
async function ensureOficinaFase2() {
  await ensureColumn("oficina_turmas", "presenca_minima", "DECIMAL(5,2) NOT NULL DEFAULT 100");
  await ensureColumn("oficina_turmas", "assinatura1_nome", "VARCHAR(150) NULL");
  await ensureColumn("oficina_turmas", "assinatura1_cargo", "VARCHAR(150) NULL");
  await ensureColumn("oficina_turmas", "assinatura2_nome", "VARCHAR(150) NULL");
  await ensureColumn("oficina_turmas", "assinatura2_cargo", "VARCHAR(150) NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_presencas (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      turma_id          INT NOT NULL,
      modulo_id         INT NOT NULL,
      inscricao_id      INT NOT NULL,
      registrado_por_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_oficina_presenca (modulo_id, inscricao_id),
      INDEX idx_oficina_presencas_turma (turma_id),
      INDEX idx_oficina_presencas_inscricao (inscricao_id),
      CONSTRAINT fk_oficina_presencas_modulo FOREIGN KEY (modulo_id) REFERENCES oficina_modulos(id) ON DELETE CASCADE,
      CONSTRAINT fk_oficina_presencas_inscricao FOREIGN KEY (inscricao_id) REFERENCES oficina_inscricoes(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_certificados (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id          INT NOT NULL,
      turma_id            INT NOT NULL,
      inscricao_id        INT NOT NULL,
      pessoa_id           INT NULL,
      codigo              VARCHAR(20) NOT NULL,
      nome                VARCHAR(255) NOT NULL,
      turma_nome          VARCHAR(255) NOT NULL,
      carga_horaria       DECIMAL(6,2) NULL,
      data_inicio         DATE NULL,
      data_fim            DATE NULL,
      percentual_presenca DECIMAL(5,2) NULL,
      emitido_por_id      INT NULL,
      emitido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_oficina_cert_codigo (codigo),
      UNIQUE KEY uk_oficina_cert_inscricao (inscricao_id),
      INDEX idx_oficina_cert_turma (turma_id),
      INDEX idx_oficina_cert_pessoa (pessoa_id),
      CONSTRAINT fk_oficina_cert_turma FOREIGN KEY (turma_id) REFERENCES oficina_turmas(id) ON DELETE CASCADE,
      CONSTRAINT fk_oficina_cert_inscricao FOREIGN KEY (inscricao_id) REFERENCES oficina_inscricoes(id) ON DELETE CASCADE
    );
  `);
}

// 56. Oficina de Talentos, Fase 3 — promoção (13/10/2026). O funil de
// indicadores é inscritos → concluintes → promovidos (e para qual cargo). A
// promoção é registrada pela Metodologia na própria inscrição concluída:
//  - promovido_em: data da promoção (DATE) — NULL = ainda não promovido.
//  - cargo_promovido: cargo assumido (texto livre, sugerido a partir do cargo
//    almejado).
//  - promocao_obs / promovido_por_id: observação curta e quem registrou.
async function ensureOficinaFase3() {
  await ensureColumn("oficina_inscricoes", "promovido_em", "DATE NULL");
  await ensureColumn("oficina_inscricoes", "cargo_promovido", "VARCHAR(150) NULL");
  await ensureColumn("oficina_inscricoes", "promocao_obs", "VARCHAR(255) NULL");
  await ensureColumn("oficina_inscricoes", "promovido_por_id", "INT NULL");
}

// 57. Jornadas — encontros e presença por pessoa (13/10/2026, pedido do Ramon:
// "registrar as presenças e o desenvolvimento de cada pessoa nas jornadas e
// nas trilhas"; proposta em claude/proposta-presenca-desenvolvimento-jornadas-
// trilhas-2026-10-13.md, decisões A–E aprovadas). Fase 1:
//  - jornadas_desenvolvimento ganha a configuração de acompanhamento:
//    presenca_minima_pct (padrão 75), meta_horas (ex.: NR-17 Anexo II — mínimo
//    de horas do treinamento inicial) e periodicidade_meses (reciclagem, ex.: 6).
//  - jornada_encontros: a "aula/sessão" do dia (data, carga horária, etapa
//    opcional).
//  - jornada_presencas: encontro × participante com situação presente /
//    justificado / ausente; sem linha = ainda não lançado. UNIQUE por par.
// Sem FK para jornadas/jornada_participantes de propósito (as tabelas de
// produção nasceram antes do CREATE do passo 28 e o tipo de id pode divergir —
// mesmo risco dos hotfixes de status/email): a limpeza em cascata é feita pelos
// controllers. FK só entre as duas tabelas novas, que nascem com o mesmo tipo.
async function ensureJornadaPresenca() {
  await ensureColumn("jornadas_desenvolvimento", "presenca_minima_pct", "DECIMAL(5,2) NOT NULL DEFAULT 75");
  await ensureColumn("jornadas_desenvolvimento", "meta_horas", "DECIMAL(8,2) NULL");
  await ensureColumn("jornadas_desenvolvimento", "periodicidade_meses", "INT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jornada_encontros (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      jornada_id     INT NOT NULL,
      etapa_id       INT NULL,
      titulo         VARCHAR(200) NOT NULL,
      data           DATE NOT NULL,
      hora_inicio    VARCHAR(5) NULL,
      carga_horaria  DECIMAL(6,2) NOT NULL DEFAULT 0,
      responsavel    VARCHAR(150) NULL,
      observacao     VARCHAR(255) NULL,
      criado_por_id  INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_jornada_encontros_jornada (jornada_id, data),
      INDEX idx_jornada_encontros_etapa (etapa_id),
      INDEX idx_jornada_encontros_empresa (empresa_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jornada_presencas (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      encontro_id       INT NOT NULL,
      participante_id   INT NOT NULL,
      situacao          VARCHAR(15) NOT NULL,
      origem            VARCHAR(15) NOT NULL DEFAULT 'manual',
      registrado_por_id INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_jornada_presenca (encontro_id, participante_id),
      INDEX idx_jornada_presencas_participante (participante_id),
      CONSTRAINT fk_jornada_presencas_encontro FOREIGN KEY (encontro_id) REFERENCES jornada_encontros(id) ON DELETE CASCADE
    );
  `);
}

// Trilhas vinculadas às jornadas e aos encontros (13/10/2026, pedido do Ramon:
// "as trilhas precisam ser vinculadas às jornadas e aparecer nos encontros").
// Até aqui a trilha só se ligava a uma ETAPA da jornada (passo 43) e nada
// disso aparecia em Encontros e presença. Agora:
//  - jornada_trilhas: quais trilhas do catálogo pertencem a cada jornada (a
//    mesma trilha pode servir a várias jornadas — UNIQUE jornada × trilha);
//  - jornada_encontros.trilha_id: a trilha a que o encontro pertence.
// Sem FK (mesmo padrão do módulo: o tipo do id em produção pode divergir);
// a limpeza em cascata é feita nos controllers. O backfill roda UMA vez, só
// quando a tabela acaba de ser criada: traz para a jornada as trilhas que já
// estavam ligadas a alguma etapa dela — assim, quem tirar uma trilha da jornada
// depois não a vê voltar a cada deploy.
async function ensureJornadaTrilhas() {
  const [existia] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jornada_trilhas' LIMIT 1`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jornada_trilhas (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id  INT NULL,
      jornada_id  INT NOT NULL,
      trilha_id   INT NOT NULL,
      ordem       INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_jornada_trilha (jornada_id, trilha_id),
      INDEX idx_jornada_trilhas_trilha (trilha_id),
      INDEX idx_jornada_trilhas_empresa (empresa_id)
    );
  `);

  await ensureColumn("jornada_encontros", "trilha_id", "INT NULL");
  // Etapa da trilha a que o encontro pertence (presença por etapa da trilha — 13/10/2026).
  await ensureColumn("jornada_encontros", "trilha_etapa_id", "INT NULL");

  if (!existia.length) {
    try {
      const [r] = await pool.query(`
        INSERT IGNORE INTO jornada_trilhas (empresa_id, jornada_id, trilha_id, ordem)
        SELECT j.empresa_id, je.jornada_id, je.trilha_id, 0
        FROM jornadas_etapas je
        JOIN jornadas_desenvolvimento j ON j.id = je.jornada_id
        JOIN trilhas_aprendizagem t ON t.id = je.trilha_id
        WHERE je.trilha_id IS NOT NULL
        GROUP BY j.empresa_id, je.jornada_id, je.trilha_id
      `);
      console.log(`  ↳ jornada_trilhas: ${r.affectedRows} vínculo(s) trazido(s) das etapas`);
    } catch (err) {
      console.warn(`  ↳ backfill de jornada_trilhas não aplicado: ${err.message}`);
    }
  }
}

// Achado em 13/10/2026 (bug reportado pelo Ramon: "Erro ao criar jornada" no
// Mapa de Desenvolvimento; log de produção: "Data truncated for column
// 'status' at row 1" em jornadasDesenvolvimentoController.criar). O controller
// grava status "em_andamento" / "planejada" / "concluida" / "cancelada", e o
// CREATE TABLE do passo 28 declara `status VARCHAR(20)` — mas a tabela de
// produção nasceu antes, com uma coluna mais restrita (vocabulário antigo
// "ativo"/"inativo"), e CREATE TABLE IF NOT EXISTS nunca altera tabela
// existente: mesma causa raiz dos hotfixes de usuarios.email e
// trilhas_aprendizagem.cliente. Esta função alarga a coluna para VARCHAR(30)
// só se ela ainda for ENUM ou um VARCHAR menor que 30 (idempotente) — os
// valores antigos são preservados como texto, e mapRow() já os traduz.
// Aplicada também às tabelas irmãs do módulo (mesmo risco de drift).
async function ensureStatusVarchar(tabela, tamanho = 30, padrao = "planejada") {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'status'
     LIMIT 1`,
    [tabela]
  );
  if (!rows.length) return;
  const { DATA_TYPE, CHARACTER_MAXIMUM_LENGTH } = rows[0];
  if (String(DATA_TYPE).toLowerCase() === "varchar" && Number(CHARACTER_MAXIMUM_LENGTH) >= tamanho) return;
  await pool.query(`ALTER TABLE ${tabela} MODIFY COLUMN status VARCHAR(${tamanho}) NOT NULL DEFAULT '${padrao}'`);
  console.log(`  ↳ ${tabela}.status agora é VARCHAR(${tamanho}) (era ${DATA_TYPE}${CHARACTER_MAXIMUM_LENGTH ? `(${CHARACTER_MAXIMUM_LENGTH})` : ""})`);
}

// Achado em 08/10/2026 (bug reportado pelo Ramon: "Erro ao criar trilha" no
// módulo Metodologia). O CREATE TABLE IF NOT EXISTS de trilhas_aprendizagem
// (passo 20, acima) já declara `cliente VARCHAR(150) NULL` — uma trilha sem
// cliente é uma trilha "GLOBAL", de propósito (ver clients/opcoesCliente em
// frontend/app/trilhas/page.js). Mas IF NOT EXISTS nunca altera uma tabela
// que já existia em produção antes dessa coluna virar opcional — mesma causa
// raiz do hotfix de usuarios.criado_em (passo 30) e de usuarios.email (função
// acima). Na prática: toda trilha criada sem selecionar um cliente (inclusive
// quando a lista de Clientes da Metodologia ainda está vazia — ver passo 42)
// quebrava com "Column 'cliente' cannot be null", porque o banco de produção
// ainda tinha a coluna como NOT NULL de antes desta revisão do schema.
async function ensureClienteNullableTrilhas() {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trilhas_aprendizagem' AND COLUMN_NAME = 'cliente'
     LIMIT 1`
  );
  if (!rows.length || rows[0].IS_NULLABLE === "YES") return;
  await pool.query(`ALTER TABLE trilhas_aprendizagem MODIFY COLUMN cliente VARCHAR(150) NULL`);
  console.log(`  ↳ trilhas_aprendizagem.cliente agora aceita NULL (trilha sem cliente = trilha GLOBAL)`);
}

// Achado durante o teste local do item "Em seguida" de pessoa_id (25/09/2026,
// mesmo dia da entrega de inclusão de usuários): respostas_avaliativas tem
// UNIQUE KEY (material_id, treinando_nome) — uma trava de banco, não só de
// aplicação. Simulei dois treinandos homônimos respondendo a MESMA prova: o
// segundo "INSERT ... ON DUPLICATE KEY UPDATE" (ver
// respostasAvaliativasController.js) bateu nessa chave por nome igual e
// SOBRESCREVEU silenciosamente a resposta do primeiro — os dois receberam
// "sucesso", mas só a nota do segundo sobrou no banco. Mais grave que o
// vazamento de leitura que este pacote fecha: aqui era perda de dado.
//
// Correção: chave nova por identidade (material_id, pessoa_id) protege quem
// já tem pessoa_id (não colide mais por coincidência de nome). A chave
// antiga não pode simplesmente sair — continua sendo a única proteção contra
// duplicidade para conta antiga sem pessoa_id — então vira uma chave sobre
// uma coluna gerada (treinando_nome_legado) que só carrega o nome quando
// pessoa_id é NULL; para linha com pessoa_id preenchido ela mesma é NULL, e
// MySQL/MariaDB não considera múltiplos NULL colidentes num índice único —
// ou seja, linhas de pessoas diferentes nunca mais colidem só por
// coincidência de nome, e linhas antigas continuam protegidas do jeito que
// já estavam.
async function ensureRespostasAvaliativasChavePorPessoa() {
  const [colunaGerada] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas'
       AND COLUMN_NAME = 'treinando_nome_legado'`
  );
  if (colunaGerada[0].c === 0) {
    await pool.query(
      `ALTER TABLE respostas_avaliativas
       ADD COLUMN treinando_nome_legado VARCHAR(255)
       GENERATED ALWAYS AS (CASE WHEN pessoa_id IS NULL THEN treinando_nome ELSE NULL END) VIRTUAL`
    );
    console.log(`  ↳ coluna gerada adicionada: respostas_avaliativas.treinando_nome_legado`);
  }

  // Tentativas por prova (passo 63): com a coluna `tentativa` as chaves únicas
  // passam a incluir a tentativa (ver ensureTentativasProva). Recriar as chaves
  // antigas aqui, a cada subida, só para o passo 63 derrubá-las em seguida, era
  // trabalho inútil e deixava uma janela em que a prova ficava de 1 tentativa.
  const [jaTemTentativa] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas'
       AND COLUMN_NAME = 'tentativa'`
  );
  if (jaTemTentativa[0].c > 0) return;

  const [chaveAntiga] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas'
       AND INDEX_NAME = 'uniq_material_treinando'`
  );
  if (chaveAntiga[0].c > 0) {
    await pool.query(`ALTER TABLE respostas_avaliativas DROP INDEX uniq_material_treinando`);
  }

  const [chaveLegado] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas'
       AND INDEX_NAME = 'uniq_material_treinando_legado'`
  );
  if (chaveLegado[0].c === 0) {
    await pool.query(
      `ALTER TABLE respostas_avaliativas ADD UNIQUE KEY uniq_material_treinando_legado (material_id, treinando_nome_legado)`
    );
    console.log(`  ↳ chave única adicionada: respostas_avaliativas (material_id, treinando_nome_legado)`);
  }

  const [chavePessoa] = await pool.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas'
       AND INDEX_NAME = 'uniq_material_pessoa'`
  );
  if (chavePessoa[0].c === 0) {
    await pool.query(
      `ALTER TABLE respostas_avaliativas ADD UNIQUE KEY uniq_material_pessoa (material_id, pessoa_id)`
    );
    console.log(`  ↳ chave única adicionada: respostas_avaliativas (material_id, pessoa_id)`);
  }
}

// Tentativas por prova (14/10/2026). O instrutor define quantas tentativas o
// treinando tem em cada prova/simulado (materiais_avaliativos.tentativas_max;
// NULL = 1, que é o comportamento de sempre). Cada tentativa vira uma linha em
// respostas_avaliativas (coluna `tentativa`, 1..N) e a nota oficial é a melhor.
// As chaves únicas (material, pessoa) e (material, nome legado) passam a
// incluir `tentativa`: primeiro cria as novas, depois derruba as antigas, para
// nunca deixar a tabela sem proteção contra duplicidade nem sem índice para a FK.
async function ensureTentativasProva() {
  const [tabelas] = await pool.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('materiais_avaliativos', 'respostas_avaliativas')`
  );
  const existentes = new Set(tabelas.map((t) => t.TABLE_NAME));
  if (existentes.has("materiais_avaliativos")) {
    await ensureColumn("materiais_avaliativos", "tentativas_max", "INT NULL");
  }
  if (!existentes.has("respostas_avaliativas")) return;

  await ensureColumn("respostas_avaliativas", "tentativa", "INT NOT NULL DEFAULT 1");

  const indices = async (nome) => {
    const [r] = await pool.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas' AND INDEX_NAME = ?`,
      [nome]
    );
    return r[0].c > 0;
  };

  if (!(await indices("uniq_material_pessoa_tentativa"))) {
    await pool.query(
      `ALTER TABLE respostas_avaliativas ADD UNIQUE KEY uniq_material_pessoa_tentativa (material_id, pessoa_id, tentativa)`
    );
    console.log(`  ↳ chave única adicionada: respostas_avaliativas (material_id, pessoa_id, tentativa)`);
  }
  if (!(await indices("uniq_material_legado_tentativa"))) {
    await pool.query(
      `ALTER TABLE respostas_avaliativas ADD UNIQUE KEY uniq_material_legado_tentativa (material_id, treinando_nome_legado, tentativa)`
    );
    console.log(`  ↳ chave única adicionada: respostas_avaliativas (material_id, treinando_nome_legado, tentativa)`);
  }
  if (await indices("uniq_material_pessoa")) {
    await pool.query(`ALTER TABLE respostas_avaliativas DROP INDEX uniq_material_pessoa`);
  }
  if (await indices("uniq_material_treinando_legado")) {
    await pool.query(`ALTER TABLE respostas_avaliativas DROP INDEX uniq_material_treinando_legado`);
  }
}

// Diagnóstico somente-leitura (ver passo 60 em runMigrations).
async function diagnosticarNomeAntigo() {
  const alvos = [
    ["empresas", "nome"],
    ["usuarios", "cliente"],
    ["treinamentos", "cliente"],
    ["certificados", "treinamento_cliente"],
  ];
  for (const [tabela, coluna] of alvos) {
    try {
      const info = await columnInfo(tabela, coluna);
      if (!info) continue;
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS n FROM ${tabela} WHERE ${coluna} LIKE '%Tel Centro de Contatos%'`
      );
      const n = Number(rows[0]?.n || 0);
      if (n > 0) console.log(`  ⚠ nome antigo ainda gravado: ${tabela}.${coluna} (${n} linha(s)) — renomear pelo painel`);
    } catch (e) {
      console.warn(`  (diagnóstico do nome antigo ignorado em ${tabela}.${coluna}: ${e.message})`);
    }
  }
}

async function runMigrations() {
  try {
    console.log("🔄 Verificando e aplicando migrações no MySQL...");

    // 1. Tabela de Empresas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empresas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nome VARCHAR(150) NOT NULL,
          cnpj VARCHAR(20) UNIQUE,
          ativo BOOLEAN DEFAULT TRUE,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabela de Usuários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
          id INT AUTO_INCREMENT PRIMARY KEY,
          empresa_id INT,
          nome VARCHAR(150) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          senha_hash VARCHAR(255),
          perfil VARCHAR(50) DEFAULT 'Instrutor',
          cliente VARCHAR(100),
          ativo BOOLEAN DEFAULT TRUE,
          troca_senha_obrigatoria BOOLEAN DEFAULT FALSE,
          pode_acessar_oceano_desenvolvimento BOOLEAN DEFAULT FALSE,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      );
    `);

    // 3. Tabela de Clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nome VARCHAR(150) NOT NULL,
          segmento VARCHAR(100),
          status VARCHAR(50) DEFAULT 'Ativo',
          gestor VARCHAR(150),
          descricao TEXT,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Tabela de Necessidades (ISO 10015 - Fase 1)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS necessidades (
          id INT AUTO_INCREMENT PRIMARY KEY,
          titulo VARCHAR(200) NOT NULL,
          descricao TEXT,
          cliente_interno VARCHAR(150) NOT NULL,
          prioridade VARCHAR(20) DEFAULT 'Média',
          status VARCHAR(50) DEFAULT 'Pendente',
          criado_por INT,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      );
    `);

    // 5. Tabela de Treinamentos / Turmas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS treinamentos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tema VARCHAR(200) NOT NULL,
          cliente VARCHAR(150) NOT NULL,
          instrutor VARCHAR(150),
          carga_horaria INT,
          participantes INT,
          participantes_previstos INT,
          participantes_presentes INT,
          concluidos INT,
          publico VARCHAR(100),
          status VARCHAR(50) DEFAULT 'Planejado',
          descricao TEXT,
          data DATE,
          data_inicio DATETIME,
          data_fim DATETIME,
          turma VARCHAR(100),
          supervisor VARCHAR(150),
          necessidade_id INT,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (necessidade_id) REFERENCES necessidades(id) ON DELETE SET NULL
      );
    `);

    // 6. [removido] Este passo criava uma versão antiga e incompleta de
    // "treinamento_participantes" (sem cliente/turma/supervisor/operacao/
    // status_presenca). Como usava CREATE TABLE IF NOT EXISTS e rodava ANTES
    // do passo 8 (schema correto, o que treinamentoParticipantesController.js
    // realmente usa), em qualquer banco novo — como o que será criado para o
    // onboarding da IBM — esta versão "vencia" e o passo 8 virava um no-op,
    // deixando a tela de roster de participantes quebrada silenciosamente
    // por falta de colunas. Mantido apenas como comentário histórico.

    // 7. Tabelas de Aulas, Presenças e Avaliações
    await pool.query(`
      CREATE TABLE IF NOT EXISTS turma_aulas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          treinamento_id INT NOT NULL,
          data_aula DATE NOT NULL,
          conteudo TEXT,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS presencas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          treinamento_id INT NOT NULL,
          data_chamada DATE NOT NULL,
          treinando_nome VARCHAR(150) NOT NULL,
          presente BOOLEAN DEFAULT FALSE,
          status VARCHAR(50) DEFAULT 'Ausente',
          justificativa TEXT,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS avaliacoes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          treinamento_id INT NOT NULL,
          titulo VARCHAR(200),
          nota_nps DECIMAL(5,2),
          nota_qualidade DECIMAL(5,2),
          nota_prova DECIMAL(5,2),
          observacoes TEXT,
          comentario TEXT,
          treinando_nome VARCHAR(150),
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
      );
    `);

    // 8. Roster de participantes por turma (HC previsto) — já usada por
    // treinamentoParticipantesController, mas nunca tinha uma migration
    // versionada rodando automaticamente no boot do servidor.
    await pool.query(`
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
    `);

    // 9. turma_aulas — a tabela criada no passo 7 (acima) é o schema mínimo
    // legado. As colunas abaixo são o cronograma diário real (planejado x
    // ministrado, por instrutor) que turmaAulasController.js e o resolver de
    // capacidade dependem. Antes, essas colunas só existiam se alguém tivesse
    // rodado manualmente o arquivo database/migrations/2026-08-26_turmas_
    // aulas_participantes.sql — o que nunca acontecia automaticamente, então
    // um ambiente novo (ou o próprio Railway ao reiniciar do zero) subia com
    // turma_aulas faltando carga_horaria_real, instrutor_responsavel etc., e
    // toda a tela de cronograma/CH real quebrava silenciosamente.
    await ensureColumn("turma_aulas", "dia_numero", "INT NOT NULL DEFAULT 1 AFTER treinamento_id");
    await ensureColumn("turma_aulas", "ordem", "INT DEFAULT 1");
    await ensureColumn("turma_aulas", "titulo", "VARCHAR(200) NULL");
    await ensureColumn("turma_aulas", "objetivo", "TEXT NULL");
    await ensureColumn("turma_aulas", "conteudo_planejado", "TEXT NULL");
    await ensureColumn("turma_aulas", "metodologia", "VARCHAR(150) NULL");
    await ensureColumn("turma_aulas", "carga_horaria_planejada", "DECIMAL(10,2) DEFAULT 0");
    await ensureColumn("turma_aulas", "instrutor_responsavel", "VARCHAR(150) NULL");
    await ensureColumn("turma_aulas", "material_apoio", "TEXT NULL");
    await ensureColumn("turma_aulas", "status_execucao", "VARCHAR(30) DEFAULT 'planejada'");
    await ensureColumn("turma_aulas", "conteudo_ministrado", "TEXT NULL");
    await ensureColumn("turma_aulas", "carga_horaria_real", "DECIMAL(10,2) NULL");
    await ensureColumn("turma_aulas", "observacoes_execucao", "TEXT NULL");
    await ensureColumn("turma_aulas", "reprogramada", "TINYINT(1) DEFAULT 0");
    await ensureColumn("turma_aulas", "motivo_reprogramacao", "TEXT NULL");
    await ensureColumn("turma_aulas", "ministrada_em", "TIMESTAMP NULL");
    await ensureColumn("turma_aulas", "atualizado_em", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    await pool.query(`CREATE INDEX idx_ta_instrutor ON turma_aulas (instrutor_responsavel)`).catch(() => {});
    await pool.query(`CREATE INDEX idx_ta_status ON turma_aulas (status_execucao)`).catch(() => {});

    // 10. Presença por aula (granularidade diária, por participante) — fonte
    // de "dias praticados" e "HC realizado" no nível mais fino. Mesma
    // história do item 9: existia só como .sql avulso, nunca aplicado.
    await pool.query(`
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
    `);

    // 11. Capacidade do instrutor (regra automática + overrides manuais).
    // Mesmo caso: o controller (capacidadeController.js) e o .sql já
    // existiam, mas a tabela nunca era criada automaticamente e o serviço
    // que o controller importa (capacidadeResolver.js) nem existia no
    // código — a funcionalidade inteira de "Capacidade x Realizado" estava
    // morta. Ver backend/src/services/capacidadeResolver.js (novo).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS capacidade_regra_padrao (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        horas_dia_padrao DECIMAL(5,2) NOT NULL DEFAULT 6.00,
        hc_dia_padrao INT NOT NULL DEFAULT 30,
        considerar_domingo TINYINT(1) NOT NULL DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      INSERT INTO capacidade_regra_padrao (id, horas_dia_padrao, hc_dia_padrao, considerar_domingo)
      SELECT 1, 6.00, 30, 0
      WHERE NOT EXISTS (SELECT 1 FROM capacidade_regra_padrao WHERE id = 1)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS capacidade_instrutor_mensal (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        instrutor VARCHAR(150) NOT NULL,
        ano INT NOT NULL,
        mes INT NOT NULL,
        horas_capacidade DECIMAL(10,2) NOT NULL DEFAULT 0,
        hc_capacidade INT NOT NULL DEFAULT 0,
        observacoes VARCHAR(255) NULL,
        criado_por VARCHAR(150) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cim_instrutor_mes (instrutor, ano, mes)
      );
    `);

    // 12. treinamentos.carga_horaria nasceu como INT (migrate.js, passo 5).
    // Isso arredonda qualquer treinamento com carga fracionada (ex.: 1.5h,
    // 4.5h) no INSERT — CH real é perdida de forma silenciosa antes mesmo de
    // chegar aos relatórios. turma_aulas já usa DECIMAL(10,2); alinhamos o
    // campo agregado da turma ao mesmo padrão, preservando os valores atuais.
    await ensureDecimalType("treinamentos", "carga_horaria", "DECIMAL(8,2) NULL");

    // 13. necessidades_treinamento — a tabela que a feature de Necessidades
    // REALMENTE usa (necessidadesResolver.js). A tabela "necessidades" criada
    // no passo 4 acima é de uma versão anterior da feature e não é lida por
    // nenhum código hoje (fica como está, não removida automaticamente, por
    // segurança — mas pode ser dropada com segurança se você confirmar).
    // "necessidades_treinamento" só existia como .sql avulso
    // (database/migrations/2026-07-18_necessidades_treinamento.sql), nunca
    // aplicado automaticamente — mesmo padrão de bug já corrigido em
    // turma_aulas/capacidade: em qualquer ambiente novo (Railway do zero),
    // a tela de Necessidades quebrava com "tabela não existe".
    await pool.query(`
      CREATE TABLE IF NOT EXISTS necessidades_treinamento (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        cliente VARCHAR(150) NOT NULL,
        tema VARCHAR(200) NOT NULL,
        horas_necessarias DECIMAL(10,2) DEFAULT 0,
        prazo DATE NULL,
        prioridade VARCHAR(20) DEFAULT 'media',
        status VARCHAR(30) NULL,
        origem VARCHAR(100) NULL,
        observacoes TEXT NULL,
        solicitante_id INT NULL,
        solicitante_nome VARCHAR(150) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // 14. usuarios.senha — o login (authRoutes.js) lê/grava a coluna "senha",
    // mas o passo 2 acima (CREATE TABLE usuarios) só define "senha_hash". Em
    // qualquer ambiente cuja tabela usuarios tenha sido criada só por este
    // arquivo (do zero), login e criação de usuário (POST /api/usuarios, que
    // já grava em "senha") ficam incompatíveis com o schema. Adiciona a
    // coluna que o código de fato usa, sem mexer em "senha_hash" (mantida
    // por compatibilidade, ainda que hoje não seja lida por ninguém).
    await ensureColumn("usuarios", "senha", "VARCHAR(255) NULL");

    // 15. Isolamento por tenant (empresa_id) nas tabelas centrais — hoje só
    // "usuarios" tem essa coluna. "treinamentos" e "clientes" já são servidos
    // por um router (entityCrud.js) preparado para filtrar por empresa_id
    // quando multiTenant:true, mas a coluna nunca existiu nessas tabelas —
    // ou seja, o filtro estava configurado mas não tinha o que filtrar.
    // "presencas", "avaliacoes", "turma_aulas", "presenca_aulas" e
    // "necessidades_treinamento" não tinham NENHUM isolamento. Colunas
    // nascem NULL (sem valor) — dado existente continua visível para quem
    // hoje loga sem empresa definida, exatamente como já funciona; a
    // segregação passa a valer para dado novo, e para dado antigo assim que
    // for atribuído a uma empresa.
    await ensureColumn("treinamentos", "empresa_id", "INT NULL");
    await ensureColumn("clientes", "empresa_id", "INT NULL");
    await ensureColumn("necessidades_treinamento", "empresa_id", "INT NULL");
    await ensureColumn("turma_aulas", "empresa_id", "INT NULL");
    await ensureColumn("presencas", "empresa_id", "INT NULL");
    await ensureColumn("avaliacoes", "empresa_id", "INT NULL");
    await ensureColumn("presenca_aulas", "empresa_id", "INT NULL");
    await pool.query(`CREATE INDEX idx_treinamentos_empresa ON treinamentos (empresa_id)`).catch(() => {});

    // 16. Backfill — tabelas "filhas" de treinamentos herdam o empresa_id do
    // treinamento pai (idempotente: só atualiza onde ainda está NULL, então
    // rodar de novo não sobrescreve nada). "treinamentos", "clientes" e
    // "necessidades_treinamento" ficam NULL para dado pré-existente — não há
    // como inferir de forma confiável a que empresa um registro antigo
    // pertence, então preferimos deixar em aberto a chutar um valor.
    await pool.query(`
      UPDATE turma_aulas ta
      JOIN treinamentos t ON t.id = ta.treinamento_id
      SET ta.empresa_id = t.empresa_id
      WHERE ta.empresa_id IS NULL AND t.empresa_id IS NOT NULL
    `);
    await pool.query(`
      UPDATE presencas p
      JOIN treinamentos t ON t.id = p.treinamento_id
      SET p.empresa_id = t.empresa_id
      WHERE p.empresa_id IS NULL AND t.empresa_id IS NOT NULL
    `);
    await pool.query(`
      UPDATE avaliacoes a
      JOIN treinamentos t ON t.id = a.treinamento_id
      SET a.empresa_id = t.empresa_id
      WHERE a.empresa_id IS NULL AND t.empresa_id IS NOT NULL
    `);
    await pool.query(`
      UPDATE presenca_aulas pa
      JOIN treinamentos t ON t.id = pa.treinamento_id
      SET pa.empresa_id = t.empresa_id
      WHERE pa.empresa_id IS NULL AND t.empresa_id IS NOT NULL
    `);

    // 16b. Tabelas do "Oceano do Desenvolvimento" (jornadas, etapas, ações,
    // coaching, tripulação) — mesmo padrão de bug já corrigido acima pra
    // trilha_etapas/certificados/trilhas_aprendizagem: nenhuma delas tinha
    // CREATE TABLE em lugar nenhum do repositório. O comentário do passo 17
    // logo abaixo dizia "são criadas fora deste arquivo" — não são; nunca
    // existiu um .sql pra elas (jornada_participantes é a única exceção,
    // com .sql próprio em database/migrations/2026-04-01_jornada_participantes.sql,
    // nunca rodado automaticamente — mesclado aqui). Schema reconstruído a
    // partir de todo INSERT/UPDATE/SELECT que os controllers fazem hoje.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jornadas_desenvolvimento (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        cliente         VARCHAR(150) NULL,
        nome            VARCHAR(200) NOT NULL,
        descricao       TEXT NULL,
        objetivo        TEXT NULL,
        publico_macro   VARCHAR(255) NULL,
        observacoes     TEXT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'planejada',
        responsavel_id  INT NULL,
        data_inicio     DATE NULL,
        data_fim        DATE NULL,
        empresa_id      INT NULL,
        INDEX idx_jornadas_desenvolvimento_responsavel (responsavel_id),
        INDEX idx_jornadas_desenvolvimento_empresa     (empresa_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jornadas_etapas (
        id                       INT AUTO_INCREMENT PRIMARY KEY,
        jornada_id               INT NOT NULL,
        nome                     VARCHAR(200) NOT NULL,
        descricao                TEXT NULL,
        objetivo                 TEXT NULL,
        tipo                     VARCHAR(50) NOT NULL DEFAULT 'treinamento',
        ordem                    INT NOT NULL DEFAULT 0,
        status                   VARCHAR(30) NOT NULL DEFAULT 'planejada',
        responsavel_id           INT NULL,
        data_inicio              DATE NULL,
        data_fim                 DATE NULL,
        carga_horaria_prevista   DECIMAL(10,2) NOT NULL DEFAULT 0,
        carga_horaria_realizada  DECIMAL(10,2) NOT NULL DEFAULT 0,
        observacoes              TEXT NULL,
        empresa_id               INT NULL,
        INDEX idx_jornadas_etapas_jornada     (jornada_id),
        INDEX idx_jornadas_etapas_responsavel (responsavel_id),
        INDEX idx_jornadas_etapas_empresa     (empresa_id)
      );
    `);
    // turma_id: novo (ver "vincular Ações a Turmas reais" na revisão do
    // Mapa de Desenvolvimento) — permite ligar uma ação a uma turma real em
    // vez de só lançamento manual em "Portos".
    await pool.query(`
      CREATE TABLE IF NOT EXISTS acoes_desenvolvimento (
        id                          INT AUTO_INCREMENT PRIMARY KEY,
        jornada_id                  INT NOT NULL,
        etapa_id                    INT NULL,
        turma_id                    INT NULL,
        tipo_acao                   VARCHAR(50) NOT NULL DEFAULT 'treinamento',
        tema                        VARCHAR(200) NOT NULL,
        subtipo                     VARCHAR(100) NULL,
        publico_alvo                VARCHAR(255) NULL,
        obrigatoria                 TINYINT(1) NOT NULL DEFAULT 0,
        descricao                   TEXT NULL,
        carga_horaria               DECIMAL(10,2) NOT NULL DEFAULT 0,
        participantes_previstos     INT NOT NULL DEFAULT 0,
        participantes_realizados    INT NOT NULL DEFAULT 0,
        quantidade_turmas_sessoes   INT NOT NULL DEFAULT 0,
        horas_planejadas            DECIMAL(10,2) NOT NULL DEFAULT 0,
        horas_realizadas            DECIMAL(10,2) NOT NULL DEFAULT 0,
        status                      VARCHAR(30) NOT NULL DEFAULT 'planejada',
        responsavel_id              INT NULL,
        data_inicio                 DATE NULL,
        data_fim                    DATE NULL,
        empresa_id                  INT NULL,
        INDEX idx_acoes_desenvolvimento_jornada     (jornada_id),
        INDEX idx_acoes_desenvolvimento_etapa       (etapa_id),
        INDEX idx_acoes_desenvolvimento_turma       (turma_id),
        INDEX idx_acoes_desenvolvimento_responsavel (responsavel_id),
        INDEX idx_acoes_desenvolvimento_empresa     (empresa_id)
      );
    `);
    // horas_planejadas: novo (ver "melhoria" na revisão) — coaching só tinha
    // horas_totais, sem equivalente a "planejado" como em acoes_desenvolvimento.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_planos (
        id                       INT AUTO_INCREMENT PRIMARY KEY,
        jornada_id               INT NULL,
        etapa_id                 INT NULL,
        acao_id                  INT NULL,
        tipo_coaching            VARCHAR(50) NOT NULL DEFAULT 'desenvolvimento',
        titulo                   VARCHAR(200) NOT NULL,
        publico_alvo             VARCHAR(255) NULL,
        objetivo                 TEXT NULL,
        responsavel_id           INT NULL,
        participantes_previstos  INT NOT NULL DEFAULT 0,
        participantes_realizados INT NOT NULL DEFAULT 0,
        sessoes_previstas        INT NOT NULL DEFAULT 0,
        sessoes_realizadas       INT NOT NULL DEFAULT 0,
        carga_horaria_sessao     DECIMAL(10,2) NOT NULL DEFAULT 0,
        horas_totais             DECIMAL(10,2) NOT NULL DEFAULT 0,
        horas_planejadas         DECIMAL(10,2) NOT NULL DEFAULT 0,
        status                   VARCHAR(30) NOT NULL DEFAULT 'planejado',
        data_inicio              DATE NULL,
        data_fim                 DATE NULL,
        empresa_id               INT NULL,
        INDEX idx_coaching_planos_jornada     (jornada_id),
        INDEX idx_coaching_planos_etapa       (etapa_id),
        INDEX idx_coaching_planos_acao        (acao_id),
        INDEX idx_coaching_planos_responsavel (responsavel_id),
        INDEX idx_coaching_planos_empresa     (empresa_id)
      );
    `);
    // jornada_participantes ("tripulação") — schema idêntico ao .sql original
    // (database/migrations/2026-04-01_jornada_participantes.sql), só que
    // agora efetivamente executado. Mantém a FK real com CASCADE já prevista
    // ali (diferente das outras tabelas do Oceano, que não usam FK).
    await pool.query(`
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
    `);
    // Cobre tabelas do Oceano já existentes manualmente, sem essas colunas novas.
    await ensureColumn("acoes_desenvolvimento", "turma_id", "INT NULL");
    await ensureColumn("coaching_planos", "horas_planejadas", "DECIMAL(10,2) NOT NULL DEFAULT 0");

    // 17. Isolamento por tenant — módulo "Oceano do Desenvolvimento" (jornadas,
    // etapas, ações, coaching, tripulação) e Biblioteca. Essas tabelas nunca
    // tiveram nenhuma coluna de empresa — o dashboard e as telas do Oceano
    // somavam/exibiam dado de todas as empresas juntas. Cada tabela recebe
    // sua PRÓPRIA coluna (em vez de depender só do JOIN até a jornada), pois
    // "jornada_id" é opcional em coaching_planos — sem coluna própria, um
    // registro sem jornada vinculada ficaria impossível de isolar por tenant.
    // Biblioteca continua fora do escopo desta correção (tem seu próprio .sql
    // avulso, database/migrations/sprint2_fix_biblioteca.sql, deliberadamente
    // não mexido aqui — investigação da Biblioteca fica pro final do projeto
    // de revisão página a página). Cada tabela é envolvida em try/catch
    // individual: nenhuma falha isolada derruba o resto da migração — mesmo
    // princípio de resiliência do adminController.js.
    for (const tabela of [
      "jornadas_desenvolvimento",
      "jornadas_etapas",
      "coaching_planos",
      "acoes_desenvolvimento",
      "jornada_participantes",
      "biblioteca",
    ]) {
      try {
        await ensureColumn(tabela, "empresa_id", "INT NULL");
      } catch (err) {
        console.warn(`  ↳ não foi possível adicionar empresa_id em ${tabela}: ${err.message}`);
      }
    }

    // Backfill — etapas/ações/coaching/tripulação herdam o empresa_id da
    // jornada pai, para os poucos registros que já tiverem uma jornada com
    // empresa atribuída (idempotente: só atualiza onde ainda está NULL).
    try {
      await pool.query(`
        UPDATE jornadas_etapas je
        JOIN jornadas_desenvolvimento jd ON jd.id = je.jornada_id
        SET je.empresa_id = jd.empresa_id
        WHERE je.empresa_id IS NULL AND jd.empresa_id IS NOT NULL
      `);
      await pool.query(`
        UPDATE acoes_desenvolvimento ad
        JOIN jornadas_desenvolvimento jd ON jd.id = ad.jornada_id
        SET ad.empresa_id = jd.empresa_id
        WHERE ad.empresa_id IS NULL AND jd.empresa_id IS NOT NULL
      `);
      await pool.query(`
        UPDATE coaching_planos cp
        JOIN jornadas_desenvolvimento jd ON jd.id = cp.jornada_id
        SET cp.empresa_id = jd.empresa_id
        WHERE cp.empresa_id IS NULL AND jd.empresa_id IS NOT NULL AND cp.jornada_id IS NOT NULL
      `);
      await pool.query(`
        UPDATE jornada_participantes jp
        JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
        SET jp.empresa_id = jd.empresa_id
        WHERE jp.empresa_id IS NULL AND jd.empresa_id IS NOT NULL
      `);
    } catch (err) {
      console.warn(`  ↳ backfill do Oceano não aplicado: ${err.message}`);
    }

    // 18. Sprint 3 (LMS core) — trilha_etapas, trilha_progresso, certificados
    // e password_reset_tokens só existiam em database/migrations/
    // sprint3_lms_core.sql, um .sql avulso com o cabeçalho "Executar: uma
    // única vez, em manutenção" — nunca rodado automaticamente. Mesmo padrão
    // de bug já corrigido acima para capacidade_* e necessidades_treinamento:
    // em produção (Railway) essas 4 tabelas nunca chegaram a ser criadas, e
    // qualquer chamada quebrava com "Table 'railway.<nome>' doesn't exist" —
    // silenciada em getGlobalStats/getEmpresaStats (adminController.js) por
    // contarTabela() engolir o erro e devolver 0, então não aparecia lá; mas
    // Certificados, Trilhas relacionais e "esqueci minha senha" (que leem/
    // gravam essas tabelas direto) quebravam de fato. Schema idêntico ao do
    // .sql original.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trilha_etapas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        trilha_id   INT NOT NULL,
        ordem       INT NOT NULL DEFAULT 0,
        titulo      VARCHAR(200) NOT NULL,
        descricao   TEXT,
        tipo        VARCHAR(50) DEFAULT 'conteudo',
        turma_id    INT NULL,
        empresa_id  INT NULL,
        criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_etapas_trilha   (trilha_id),
        INDEX idx_etapas_empresa  (empresa_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trilha_progresso (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        trilha_id     INT NOT NULL,
        etapa_id      INT NOT NULL,
        usuario_email VARCHAR(150) NOT NULL,
        empresa_id    INT NULL,
        concluido     TINYINT(1) DEFAULT 0,
        concluido_em  TIMESTAMP NULL,
        UNIQUE KEY uq_progresso (etapa_id, usuario_email),
        INDEX idx_progresso_trilha   (trilha_id),
        INDEX idx_progresso_usuario  (usuario_email)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS certificados (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        usuario_nome          VARCHAR(200) NOT NULL,
        usuario_email         VARCHAR(150) NULL,
        treinamento_id        INT NOT NULL,
        treinamento_tema      VARCHAR(200),
        treinamento_cliente   VARCHAR(150),
        frequencia_percentual DECIMAL(5,2) NULL,
        nota_final            DECIMAL(5,2) NULL,
        carga_horaria         VARCHAR(50)  NULL,
        empresa_id            INT NULL,
        emitido_em            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cert    (usuario_email, treinamento_id),
        INDEX idx_cert_empresa (empresa_id),
        INDEX idx_cert_usuario (usuario_email),
        INDEX idx_cert_trein   (treinamento_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id  INT NOT NULL,
        token       VARCHAR(64) NOT NULL UNIQUE,
        expira_em   DATETIME NOT NULL,
        usado       TINYINT(1) DEFAULT 0,
        criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_prt_token    (token),
        INDEX idx_prt_usuario  (usuario_id)
      );
    `);

    // 19. empresas.custo_hora_treinamento — usado no cálculo de ROI
    // (analyticsController.js). Antes o valor de R$/hora era fixo em 150 no
    // código, mas a tela de Indicadores já tinha uma nota dizendo "configure
    // um valor real nas preferências do sistema" — essa configuração nunca
    // existiu. Agora existe como campo do tenant (Admin → editar empresa).
    await ensureColumn("empresas", "custo_hora_treinamento", "DECIMAL(8,2) NULL");

    // 20. trilhas_aprendizagem — a tabela-mãe de todo o módulo de Trilhas
    // (backend/src/controllers/trilhasRelacionaisController.js) nunca teve
    // um CREATE TABLE em lugar nenhum do repositório: nem aqui, nem em
    // nenhum .sql de database/migrations/ (que só fazem ALTER TABLE ADD
    // COLUMN empresa_id, assumindo que ela já existe). Provavelmente foi
    // criada manualmente em algum momento — daí a página funcionar hoje —
    // mas qualquer ambiente novo (Comércio/IBM/Dasa) quebraria sem chance de
    // recriação via código versionado. IF NOT EXISTS é seguro nos dois casos.
    // status: coluna nova (melhoria) — antes o "status" exibido era só
    // calculado no frontend pela quantidade de etapas, sem nenhum controle
    // real; agora é um campo de verdade, editável no editor da trilha.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trilhas_aprendizagem (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        cliente     VARCHAR(150) NULL,
        titulo      VARCHAR(200) NOT NULL,
        descricao   TEXT NULL,
        status      VARCHAR(30) NOT NULL DEFAULT 'estruturacao',
        empresa_id  INT NULL,
        criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_trilhas_empresa (empresa_id)
      );
    `);
    // Cobre o caso da tabela já existir (criada manualmente, sem "status").
    await ensureColumn("trilhas_aprendizagem", "status", "VARCHAR(30) NOT NULL DEFAULT 'estruturacao'");

    // 21. resumos_executivos_diarios — Fase 3 (diferenciação): cache do
    // "resumo executivo automático" exibido no Dashboard (bloco Oceano).
    // Por decisão do Ramon, esse resumo NÃO usa IA/LLM paga — é montado por
    // templates fixos de frase em português (resumoExecutivoService.js) a
    // partir dos mesmos sinais do e-mail diário de pendências. Gerado uma
    // vez por dia pelo job das 07h (jobs/pendenciasDigest.js) e guardado
    // aqui — não é recalculado a cada carregamento do Dashboard. Sem UNIQUE
    // em (empresa_id, data) de propósito: empresa_id pode ser NULL (ambiente
    // sem tabela "empresas"), e o MySQL não trata NULL como valor único —
    // o serviço já faz o SELECT-então-UPDATE/INSERT manualmente.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumos_executivos_diarios (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id   INT NULL,
        data         DATE NOT NULL,
        texto        TEXT NOT NULL,
        total_sinais INT NOT NULL DEFAULT 0,
        gerado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_resumo_exec_empresa_data (empresa_id, data)
      );
    `);

    // 22. conquistas — Fase 3 (diferenciação): gamificação de treinando e de
    // instrutor. Uma única tabela genérica para os dois tipos de entidade
    // (entidade_tipo: 'treinando' | 'instrutor') em vez de duas tabelas
    // quase idênticas — mesmo espírito de reaproveitamento do restante da
    // Fase 3. Calculada por um job diário (jobs/conquistasJob.js), não em
    // tempo real a cada carregamento de tela. entidade_nome é o NOME (não
    // e-mail) da pessoa, para casar com o mesmo padrão de identidade já
    // usado em toda a base (treinando_nome em presencas/certificados,
    // instrutor_responsavel em turma_aulas — nunca há FK para usuarios).
    // UNIQUE (entidade_tipo, entidade_nome, tipo, contexto) + INSERT IGNORE
    // no serviço torna o job idempotente: rodar de novo todo dia não duplica
    // conquistas já registradas.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conquistas (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id     INT NULL,
        entidade_tipo  VARCHAR(20) NOT NULL,
        entidade_nome  VARCHAR(200) NOT NULL,
        tipo           VARCHAR(50) NOT NULL,
        titulo         VARCHAR(150) NOT NULL,
        descricao      VARCHAR(300) NULL,
        contexto       VARCHAR(200) NOT NULL,
        conquistado_em DATE NOT NULL,
        criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_conquista (entidade_tipo, entidade_nome, tipo, contexto),
        INDEX idx_conquistas_empresa  (empresa_id),
        INDEX idx_conquistas_entidade (entidade_tipo, entidade_nome)
      );
    `);

    // 23. avaliacoes_treinandos — descoberto ao construir a "análise de
    // comentários" da Fase 3: essa tabela é usada por
    // avaliacoesTreinandosController.js (rota /avaliacoes-treinandos, tela
    // /nps e /responder-nps) e por desempenhoInstrutorResolver.js (NPS do
    // scorecard) há tempos, mas — mesmo caso já visto com
    // trilhas_aprendizagem (item 20) — nunca teve um CREATE TABLE
    // versionado em lugar nenhum do repositório. Funciona hoje porque a
    // tabela já existe na produção atual (criada manualmente em algum
    // momento), mas qualquer ambiente novo (Comércio/IBM/Dasa) quebraria a
    // tela de NPS inteira sem chance de recriação via código. IF NOT
    // EXISTS é seguro nos dois casos. Colunas conferidas contra o schema
    // real de produção (DESCRIBE), pra não inventar nada.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS avaliacoes_treinandos (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        treinamento_id INT NOT NULL,
        treinando_nome VARCHAR(150) NOT NULL,
        nota_nps       DECIMAL(5,2) NULL,
        comentario     TEXT NULL,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_avtr_treinamento (treinamento_id),
        INDEX idx_avtr_treinando   (treinando_nome)
      );
    `);

    // Item 24 — Fase 4 (isolamento multi-tenant, 08/09/2026): a tabela de
    // overrides manuais de capacidade por instrutor não tinha empresa_id —
    // qualquer coordenador conseguia ler, sobrescrever (o UNIQUE KEY original
    // batia só em instrutor+ano+mes, sem tenant) ou excluir por id o override
    // de qualquer outra empresa. A tabela está vazia em produção hoje (0
    // linhas), então dá pra trocar o UNIQUE KEY com segurança, sem precisar
    // decidir o que fazer com dado conflitante existente.
    await ensureColumn("capacidade_instrutor_mensal", "empresa_id", "INT NULL");
    try {
      await pool.query(`ALTER TABLE capacidade_instrutor_mensal DROP INDEX uq_cim_instrutor_mes`);
      console.log("  ↳ índice antigo removido: capacidade_instrutor_mensal.uq_cim_instrutor_mes");
    } catch (error) {
      // Já removido em um deploy anterior, ou nunca existiu com esse nome — segue.
      if (!/check that column\/key exists|doesn't exist/i.test(error.message || "")) {
        console.log(`  ↳ não foi possível remover uq_cim_instrutor_mes (${error.message}) — seguindo`);
      }
    }
    try {
      await pool.query(`
        ALTER TABLE capacidade_instrutor_mensal
        ADD UNIQUE KEY uq_cim_instrutor_mes_empresa (instrutor, ano, mes, empresa_id)
      `);
      console.log("  ↳ índice novo criado: capacidade_instrutor_mensal.uq_cim_instrutor_mes_empresa");
    } catch (error) {
      if (!/duplicate key name/i.test(error.message || "")) {
        console.log(`  ↳ não foi possível criar uq_cim_instrutor_mes_empresa (${error.message}) — seguindo`);
      }
    }

    // Item 25 — Fase "arquitetura multi-ambiente" (10/09/2026): as colunas
    // abaixo já existiam em produção (aplicadas manualmente, sem migração
    // versionada — mesmo padrão de "tabela órfã" já visto antes com
    // biblioteca_conteudos/avaliacoes_treinandos/trilhas_aprendizagem) porque
    // o painel "Novo Tenant" (adminController.createEmpresa) e o seletor de
    // ambiente no login dependem delas. Versionando aqui pra qualquer
    // ambiente novo (dev local, ou uma recriação do banco) subir com o
    // schema completo — cada coluna é independente e opcional (NULL), então
    // não quebra nada em bancos que já as têm.
    for (const [coluna, definicao] of [
      ["codigo", "VARCHAR(50) NULL"],
      ["plano", "VARCHAR(30) NULL DEFAULT 'basico'"],
      ["limite_usuarios", "INT NULL"],
      ["limite_turmas", "INT NULL"],
      ["contato_nome", "VARCHAR(150) NULL"],
      ["contato_email", "VARCHAR(150) NULL"],
      ["contato_telefone", "VARCHAR(30) NULL"],
      ["subdomain", "VARCHAR(150) NULL"],
      ["cor_primaria", "VARCHAR(10) NULL DEFAULT '#FF6B4A'"],
      ["logo_url", "VARCHAR(500) NULL"],
      ["observacoes", "TEXT NULL"],
      ["custo_hora_treinamento", "DECIMAL(10,2) NULL"],
    ]) {
      try {
        await ensureColumn("empresas", coluna, definicao);
      } catch (err) {
        console.warn(`  ↳ não foi possível adicionar empresas.${coluna}: ${err.message}`);
      }
    }
    // codigo precisa ser único pra servir de identificador estável no
    // seletor de ambiente do login (?empresa=<codigo>) — criado à parte
    // (não dá pra declarar UNIQUE direto no ensureColumn genérico) e só
    // depois de a coluna já existir com os valores atuais preenchidos.
    try {
      await pool.query(`ALTER TABLE empresas ADD UNIQUE KEY uq_empresas_codigo (codigo)`);
      console.log("  ↳ índice único criado: empresas.uq_empresas_codigo");
    } catch (error) {
      if (!/duplicate key name|Duplicate entry/i.test(error.message || "")) {
        console.log(`  ↳ não foi possível criar uq_empresas_codigo (${error.message}) — seguindo`);
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS planos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(30) NOT NULL UNIQUE,
        nome VARCHAR(80) NOT NULL,
        descricao VARCHAR(200) NULL,
        limite_usuarios INT NOT NULL DEFAULT 50,
        limite_turmas INT NOT NULL DEFAULT 100,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      INSERT INTO planos (slug, nome, descricao, limite_usuarios, limite_turmas)
      SELECT * FROM (SELECT 'basico' AS slug, 'Básico' AS nome, 'Até 30 usuários e 50 turmas' AS descricao, 30 AS limite_usuarios, 50 AS limite_turmas) AS tmp
      WHERE NOT EXISTS (SELECT 1 FROM planos WHERE slug = 'basico')
    `);
    await pool.query(`
      INSERT INTO planos (slug, nome, descricao, limite_usuarios, limite_turmas)
      SELECT * FROM (SELECT 'profissional' AS slug, 'Profissional' AS nome, 'Até 100 usuários e 300 turmas' AS descricao, 100 AS limite_usuarios, 300 AS limite_turmas) AS tmp
      WHERE NOT EXISTS (SELECT 1 FROM planos WHERE slug = 'profissional')
    `);
    await pool.query(`
      INSERT INTO planos (slug, nome, descricao, limite_usuarios, limite_turmas)
      SELECT * FROM (SELECT 'enterprise' AS slug, 'Enterprise' AS nome, 'Sem limites operacionais' AS descricao, 9999 AS limite_usuarios, 9999 AS limite_turmas) AS tmp
      WHERE NOT EXISTS (SELECT 1 FROM planos WHERE slug = 'enterprise')
    `);

    // Backfill: empresas existentes sem "codigo" (criadas antes desta coluna
    // existir) recebem um slug derivado do nome, pra nunca ficarem de fora
    // do seletor de ambiente do login por falta de identificador.
    try {
      const [semCodigo] = await pool.query(
        `SELECT id, nome FROM empresas WHERE codigo IS NULL OR codigo = ''`
      );
      for (const emp of semCodigo) {
        let slug = String(emp.nome || `empresa-${emp.id}`)
          .toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || `empresa-${emp.id}`;
        // eslint-disable-next-line no-await-in-loop
        const [existe] = await pool.query(`SELECT id FROM empresas WHERE codigo = ? LIMIT 1`, [slug]);
        if (existe.length) slug = `${slug}-${emp.id}`;
        // eslint-disable-next-line no-await-in-loop
        await pool.query(`UPDATE empresas SET codigo = ? WHERE id = ?`, [slug, emp.id]);
      }
    } catch (err) {
      console.warn(`  ↳ backfill de empresas.codigo não concluído: ${err.message}`);
    }

    // 26. Item A da Fase 4 (relatorio-fase4-isolamento-multitenant-2026-09.md):
    // a tela de Biblioteca está quebrada em produção porque a tabela que o
    // controller usa (`biblioteca`) nunca chegou a ser criada — só existe uma
    // tabela mais antiga, `biblioteca_conteudos` (sem empresa_id, vinculada só
    // por nome de cliente, e vazia em produção: 0 linhas). Havia um .sql
    // avulso de um sprint anterior pra criar essa tabela
    // (database/migrations/sprint2_fix_biblioteca.sql), mas ele: (a) nunca foi
    // executado, (b) usava nomes de coluna (criado_em/atualizado_em)
    // diferentes do que o controller espera hoje (created_at), e (c) definia
    // `empresa_id INT NULL DEFAULT 1` — um DEFAULT perigoso, que criaria uma
    // nova brecha de isolamento (todo registro cadastrado sem empresa_id
    // explícito cairia silenciosamente dentro do tenant de id 1). A tabela
    // abaixo usa exatamente as colunas que bibliotecaController.js já espera,
    // sem esse DEFAULT — mesmo padrão de "sem tenant = sem tenant" usado no
    // resto da Fase 4. `biblioteca_conteudos` fica como está (não é apagada:
    // zero linhas, sem risco, candidata a limpeza de schema futura).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS biblioteca (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        titulo       VARCHAR(200) NOT NULL,
        tipo         VARCHAR(50)  NULL,
        cliente      VARCHAR(150) NULL,
        categoria    VARCHAR(100) NULL,
        publico      VARCHAR(100) NULL,
        status       VARCHAR(50)  NULL DEFAULT 'Publicado',
        link_arquivo TEXT NULL,
        descricao    TEXT NULL,
        empresa_id   INT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_biblioteca_empresa (empresa_id),
        KEY idx_biblioteca_cliente (cliente)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 27. Item B da Fase 4: a regra padrão de capacidade (horas/dia e
    // headcount/dia usados no cálculo de "Capacidade x Realizado") era uma
    // única linha global pra todo o portal — mudar o valor afetava todos os
    // tenants ao mesmo tempo. Agora cada empresa pode ter sua própria linha
    // (empresa_id preenchido); a linha antiga (id=1, empresa_id fica NULL
    // depois do ALTER) continua servindo de valor padrão de fallback pra
    // qualquer tenant que ainda não tenha configurado a própria regra — ou
    // seja, IBM/Dasa (ou qualquer tenant novo) já nascem com um valor
    // sensato sem precisar de nenhuma ação manual, e podem sobrescrever
    // quando quiserem via a mesma tela de sempre (Capacidade → Regra
    // padrão). Ver backend/src/services/capacidadeResolver.js.
    try {
      await ensureColumn("capacidade_regra_padrao", "empresa_id", "INT NULL");
    } catch (err) {
      console.warn(`  ↳ não foi possível adicionar capacidade_regra_padrao.empresa_id: ${err.message}`);
    }
    try {
      await pool.query(`ALTER TABLE capacidade_regra_padrao ADD UNIQUE KEY uq_crp_empresa (empresa_id)`);
      console.log("  ↳ índice único criado: capacidade_regra_padrao.uq_crp_empresa");
    } catch (error) {
      if (!/duplicate key name|Duplicate entry/i.test(error.message || "")) {
        console.log(`  ↳ não foi possível criar uq_crp_empresa (${error.message}) — seguindo`);
      }
    }

    // 29. Item de Pacote 2 (relatorio-pendencias-revisao-paginas /
    // auditoriaController.js) — auditoria_log nunca teve CREATE TABLE
    // versionado: só existia como database/migrations/2026-07-16_auditoria_log.sql,
    // um .sql avulso que nunca chegou a existir neste checkout e nunca foi
    // rodado em produção — mesmo padrão de bug já corrigido para
    // trilha_etapas/certificados/etc. (item 18). Resultado: a tela de
    // Auditoria mostra a mensagem de erro "rode a migration manualmente" pra
    // sempre, e registrarAuditoria() (services/auditoria.js) falha silenciosamente
    // em todo INSERT (auditoria é best-effort por design, então a ação
    // principal do usuário nunca quebra — mas nenhum log é gravado). Schema
    // idêntico ao que auditoria.js já espera (INSERT/SELECT com essas colunas).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditoria_log (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id    INT NULL,
        usuario_nome  VARCHAR(200) NULL,
        perfil        VARCHAR(50) NULL,
        acao          VARCHAR(50) NOT NULL,
        entidade      VARCHAR(100) NOT NULL,
        entidade_id   INT NULL,
        resumo        TEXT NULL,
        dados_antes   JSON NULL,
        dados_depois  JSON NULL,
        ip            VARCHAR(45) NULL,
        criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auditoria_usuario  (usuario_id),
        INDEX idx_auditoria_acao     (acao),
        INDEX idx_auditoria_entidade (entidade),
        INDEX idx_auditoria_criado   (criado_em)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 28. Item de Pacote 2 — remove o DEFAULT 1 perigoso de empresa_id nas 8
    // tabelas do módulo Oceano/Trilhas/Certificados onde ele ainda existir
    // (ver ensureNoTenantDefault acima). Cada tabela em try/catch isolado.
    for (const tabela of [
      "jornadas_desenvolvimento",
      "jornadas_etapas",
      "acoes_desenvolvimento",
      "coaching_planos",
      "trilha_etapas",
      "trilha_progresso",
      "certificados",
      "trilhas_aprendizagem",
    ]) {
      try {
        await ensureNoTenantDefault(tabela, "empresa_id");
      } catch (err) {
        console.warn(`  ↳ não foi possível remover DEFAULT de ${tabela}.empresa_id: ${err.message}`);
      }
    }

    // 30. usuarios.criado_em — causa raiz do vazamento de usuários entre
    // tenants encontrado em 11/09/2026 (ver
    // claude/hotfix-vazamento-usuarios-tenant-2026-09.md): o CREATE TABLE
    // usuarios (passo 2 acima) já declara essa coluna, mas CREATE TABLE IF
    // NOT EXISTS não altera uma tabela que já existe — e em produção a
    // tabela "usuarios" já existia de antes dessa coluna ser adicionada ao
    // schema deste arquivo. Resultado: a consulta de `adminController.
    // getEmpresa` (usuários de um tenant específico) falhava com "Unknown
    // column 'criado_em'" toda vez, caindo num fallback que — antes do
    // hotfix de hoje — vazava usuários de TODOS os tenants. O hotfix já
    // corrigiu o fallback para nunca mais vazar dado; este passo aqui
    // resolve a causa raiz, trazendo de volta a data de criação de cada
    // usuário (hoje mostrada em branco, já que o fallback atual não a
    // busca) sem precisar de nenhuma ação manual no banco de produção.
    await ensureColumn("usuarios", "criado_em", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    // 31. Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026) — cadastro
    // de salas. Catálogo GLOBAL, sem empresa_id: as 6 salas físicas são um
    // espaço compartilhado entre todas as tenants (Portal T&D, Comércio, Dasa,
    // IBM etc. treinam no mesmo prédio) — ver claude/proposta-agendamento-
    // salas-2026-09.md, decisão 8. Isso é deliberado e diferente de toda
    // outra tabela do sistema (que ou tem empresa_id, ou herda por JOIN);
    // não é uma tabela esquecida sem isolamento, é isolamento nenhum por
    // design. `grupo` distingue as 4 salas de uso geral das 2 exclusivas do
    // Sebrae (decisão 8 do contexto trazido pelo Ramon).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS salas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nome        VARCHAR(80) NOT NULL,
        capacidade  INT NULL,
        grupo       VARCHAR(30) NOT NULL DEFAULT 'geral',
        ativo       TINYINT(1) NOT NULL DEFAULT 1,
        criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_salas_nome (nome)
      );
    `);
    // Seed idempotente (decisão 10: nomes provisórios "Sala 1" a "Sala 6" —
    // nomes definitivos ficam para depois da implantação). INSERT IGNORE
    // não sobrescreve se alguém já renomeou/editou a sala manualmente.
    await pool.query(`
      INSERT IGNORE INTO salas (nome, grupo) VALUES
        ('Sala 1', 'geral'),
        ('Sala 2', 'geral'),
        ('Sala 3', 'geral'),
        ('Sala 4', 'geral'),
        ('Sala 5', 'sebrae'),
        ('Sala 6', 'sebrae');
    `);

    // 32. Horário, sala estruturada e subtipo na turma. hora_inicio/hora_fim
    // (decisão 5) alimentam automaticamente a carga horária planejada de
    // cada dia do cronograma (decisão 17 — ver cronogramaGenerator.js).
    // sala_id substitui o texto livre "[sala:...]" colado em `descricao`
    // (achado técnico do levantamento original) por uma referência real ao
    // catálogo; sala_outro_local cobre a opção "Outro local (fora do
    // catálogo)" da decisão 11, para presencial fora das 6 salas, sem
    // checagem de conflito. subtipo (decisão 20) reaproveita o mesmo padrão
    // já usado em acoes_desenvolvimento.subtipo — ver backend/src/lib/
    // subtipos.js para a lista fixa e a validação (que o subtipo original
    // de Ações de Desenvolvimento nunca teve; adicionada agora para os dois
    // ao mesmo tempo, ver acoesDesenvolvimentoController.js).
    await ensureColumn("treinamentos", "hora_inicio", "TIME NULL");
    await ensureColumn("treinamentos", "hora_fim", "TIME NULL");
    await ensureColumn("treinamentos", "sala_id", "INT NULL");
    await ensureColumn("treinamentos", "sala_outro_local", "VARCHAR(150) NULL");
    await ensureColumn("treinamentos", "subtipo", "VARCHAR(100) NULL");
    await pool.query(`CREATE INDEX idx_treinamentos_sala ON treinamentos (sala_id)`).catch(() => {});
    // FK best-effort — em bancos onde a coluna já tinha dado incompatível
    // (não deveria acontecer, coluna nova) isso simplesmente não aplica a
    // constraint; não bloqueia o boot do servidor.
    await pool.query(`
      ALTER TABLE treinamentos
      ADD CONSTRAINT fk_treinamentos_sala FOREIGN KEY (sala_id) REFERENCES salas(id) ON DELETE SET NULL
    `).catch(() => {});

    // 33. CPF em treinamento_participantes (decisão 14) — campo 100% novo,
    // não existia em lugar nenhum do sistema antes desta entrega. Guardado
    // só como dígitos (sem máscara) pela própria validação do controller;
    // a exibição formatada é responsabilidade do frontend. Acesso restrito
    // por perfil é feito na camada de controller (getParticipantesByTreinamento),
    // não aqui — a coluna existe para todo mundo, o corte é no que a API
    // devolve.
    await ensureColumn("treinamento_participantes", "cpf", "VARCHAR(11) NULL");

    // 34. Ajuste pós-entrega do Pacote Salas (15/09/2026) — Ramon revisou a
    // primeira entrega e pediu para a lista de subtipo/subdivisão deixar de
    // ser fixa no código e virar algo que ele mesmo edita. Antes disso,
    // `lib/subtipos.js` tinha `SUBTIPOS_VALIDOS` como array hardcoded — essa
    // tabela substitui o array (o seed abaixo é idempotente, com os mesmos 7
    // valores que já estavam valendo, pra não invalidar nenhuma turma/ação
    // já classificada). Catálogo GLOBAL (sem empresa_id), mesma razão de
    // `salas`: subdivisão/subtipo é um conceito só, comum a toda a operação
    // (comprovação ao MPT não é por tenant).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subtipos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nome        VARCHAR(100) NOT NULL,
        ativo       TINYINT(1) NOT NULL DEFAULT 1,
        criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_subtipos_nome (nome)
      );
    `);
    // Lista inicial só entra com o catálogo vazio. Antes era INSERT IGNORE a
    // cada inicialização: renomear um item (ex.: "Outro" -> "Outros") fazia o
    // nome antigo voltar sozinho como item novo no próximo deploy.
    const [[subtiposQtd]] = await pool.query(`SELECT COUNT(*) AS n FROM subtipos`);
    if (!Number(subtiposQtd.n)) await pool.query(`
      INSERT IGNORE INTO subtipos (nome) VALUES
        ('Prevenção ao Assédio Moral'),
        ('Coaching de Coordenação e Gerência'),
        ('Compliance e Ética'),
        ('Desenvolvimento de Liderança'),
        ('Treinamento Técnico'),
        ('Avaliação Técnica'),
        ('Outro');
    `);

    // 34b. Subtipo "de sistema" (15/10/2026). O Reembolso de Transporte só
    // enxerga turmas classificadas como "Avaliação Técnica", mas o subtipo é
    // gravado como texto na turma — renomear o item no cadastro quebrava o
    // Reembolso. A coluna `chave_sistema` identifica o item pelo papel que ele
    // cumpre (não pelo nome), então o nome pode mudar. O UPDATE é idempotente
    // e só marca UM item (se já existir algum marcado, não faz nada).
    await ensureColumn("subtipos", "chave_sistema", "VARCHAR(40) NULL");
    await pool.query(`
      UPDATE subtipos
      SET chave_sistema = 'avaliacao_tecnica'
      WHERE nome = 'Avaliação Técnica'
        AND chave_sistema IS NULL
        AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM subtipos WHERE chave_sistema = 'avaliacao_tecnica') marcado)
    `);

    // 34c. Lista de instrutores (14/10/2026). O nome do instrutor é texto livre
    // em treinamentos.instrutor / turma_aulas.instrutor_responsavel, então a
    // tela Capacidade e o Dashboard contavam 17 "instrutores" quando o time
    // ativo tem ~10: grafias diferentes da mesma pessoa e gente que saiu do
    // time de instrução (mas continua na empresa, sem conta inativada).
    //  a) `instrutores_desligados`: nomes que não contam mais como instrutor
    //     ativo. O histórico de horas fica intacto; só saem da lista de ativos
    //     e não geram linha "fantasma" de 0h. empresa_id NULL = vale para todos.
    //  b) Unificação de grafias (pedido do Ramon): idempotente, só mexe em
    //     linhas que ainda tenham a grafia antiga.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instrutores_desligados (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NULL,
        nome VARCHAR(150) NOT NULL,
        observacao VARCHAR(255) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_instrutores_desligados_nome (nome)
      );
    `);
    const DESLIGADOS_INICIAIS = [
      ["Leticia Ramos", "Saiu do time de instrutores (informado em 14/10/2026)"],
      ["Carolaine Silva", "Saiu do time de instrutores (informado em 14/10/2026)"],
      ["Fabiane Almeida", "Hoje é analista (informado em 14/10/2026)"],
      ["Hiago Assunção", "Hoje é analista (informado em 14/10/2026)"],
      ["Diego Souza", "Não atua mais como instrutor (informado em 14/10/2026)"],
    ];
    for (const [nomeDeslig, obs] of DESLIGADOS_INICIAIS) {
      await pool.query(
        `INSERT INTO instrutores_desligados (empresa_id, nome, observacao)
         SELECT NULL, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM instrutores_desligados WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)))`,
        [nomeDeslig, obs, nomeDeslig]
      );
    }
    const GRAFIAS_INSTRUTOR = [
      ["Etilaine", "Etilaine Souza"],
      ["Hiago Amor", "Hiago Assunção"],
    ];
    for (const [antigo, correto] of GRAFIAS_INSTRUTOR) {
      await pool.query(`UPDATE treinamentos SET instrutor = ? WHERE TRIM(instrutor) = ?`, [correto, antigo]);
      await pool.query(`UPDATE turma_aulas SET instrutor_responsavel = ? WHERE TRIM(instrutor_responsavel) = ?`, [correto, antigo]);
      // UPDATE IGNORE: se a meta do mês já existir no nome correto, mantém a dele.
      await pool.query(`UPDATE IGNORE capacidade_instrutor_mensal SET instrutor = ? WHERE TRIM(instrutor) = ?`, [correto, antigo]);
    }

    // 35. Ajuste pós-entrega do Pacote Salas (15/09/2026) — ver o comentário
    // de `ensureVarcharType` acima para o raciocínio completo. Garante que
    // `usuarios.perfil` aceite qualquer perfil novo (hoje: assistente_treinamento),
    // convertendo para VARCHAR(50) se algum dia foi criado como ENUM.
    await ensureVarcharType("usuarios", "perfil", 50);

    // 36. Planilha de Vale Transporte no modelo real do financeiro (pedido
    // de Ramon, 15/09/2026, a partir do arquivo "SOLICITAÇÃO DE VT -
    // AVALIAÇÃO TÉCNICA.xlsx"). Duas peças novas:
    //
    // a) dados_bancarios_colaborador — banco/agência/conta OU chave PIX de
    //    cada pessoa, cadastrado uma vez pela Assistente/Coordenador na
    //    própria tela de Reembolso de Transporte e reaproveitado em
    //    qualquer turma futura da mesma pessoa (chave = CPF, sem
    //    empresa_id: o mesmo CPF é a mesma pessoa em qualquer cliente/
    //    tenant — a extração em si já é restrita por perfil, como o resto
    //    do CPF nesta tela). Fica de fora de treinamento_participantes de
    //    propósito, porque esse dado não é "da turma", é "da pessoa".
    // b) treinamentos.valor_passagem_vt — valor da passagem (ida) usado
    //    pra essa turma na planilha de VT; o total por dia é sempre 2x
    //    esse valor (ida + volta), igual ao modelo (R$5,90 -> R$11,80).
    //    Fica NULL até a primeira exportação, quando o valor informado é
    //    gravado aqui e vira o padrão nas próximas exportações da mesma
    //    turma. Sem valor gravado, o controller usa R$5,90 como padrão.
    // "dv" normalmente é 1 dígito, mas o modelo do Ramon repete o texto
    // "SICLOS BANK" nas 5 colunas bancárias (banco/agência/OP/conta/DV)
    // quando o pagamento é por PIX via CPF, em vez de deixar em branco —
    // por isso VARCHAR(20) e não algo mais curto.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dados_bancarios_colaborador (
          cpf             VARCHAR(11) NOT NULL PRIMARY KEY,
          nome            VARCHAR(200) NULL,
          banco           VARCHAR(100) NULL,
          agencia         VARCHAR(20) NULL,
          operacao        VARCHAR(20) NULL,
          conta           VARCHAR(30) NULL,
          dv              VARCHAR(20) NULL,
          tipo_chave_pix  VARCHAR(20) NULL,
          chave_pix       VARCHAR(150) NULL,
          atualizado_por  VARCHAR(150) NULL,
          atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    await ensureColumn("treinamentos", "valor_passagem_vt", "DECIMAL(10,2) NULL");

    // 37. Correção de segurança (auditoria 15/09/2026, Pacote A.1):
    // dados_bancarios_colaborador nasceu sem empresa_id (comentário acima
    // do passo 36 dizia "sem empresa_id: o mesmo CPF é a mesma pessoa em
    // qualquer cliente/tenant"), mas isso abria uma falha real: como o
    // registro é achado só pelo CPF, um Coordenador de um tenant conseguia
    // ler OU sobrescrever silenciosamente a chave PIX/dados bancários de
    // outro tenant, bastando digitar o mesmo CPF numa turma qualquer da
    // própria empresa. empresa_id aqui não trava o cadastro por tenant (a
    // Assistente de Treinamento continua vendo/gravando de qualquer
    // tenant, de propósito) — serve só pra registrar QUEM foi o primeiro a
    // cadastrar aquele CPF, pra então bloquear sobrescrita por um tenant
    // diferente do dono original. Ver reembolsoTransporteController.js.
    await ensureColumn("dados_bancarios_colaborador", "empresa_id", "INT NULL");

    // 38. Correção de cálculo de capacidade (16/09/2026, pedido do Ramon): a
    // capacidade automática de um instrutor no mês era "dias úteis do mês"
    // contado pelo calendário (todo dia da semana exceto domingo, ~26/mês)
    // × horas/dia da regra — isso gerava ~156h/mês, um número que Ramon
    // apontou como não condizente com o praticado. A conta certa, como ele
    // descreveu, é uma média fixa de dias TRABALHADOS no mês (22), não uma
    // contagem de calendário — 22 × 6h = 132h. dias_mes_padrao é esse valor,
    // configurável na mesma tela de sempre (Capacidade → Configurar regra
    // automática). hc_dia_padrao/hc_capacidade saem de uso (Ramon: HC não é
    // uma base válida, turmas têm tamanhos diferentes) — as colunas
    // continuam no banco, sem migração destrutiva, só não são mais lidas.
    // Ver capacidadeResolver.js.
    await ensureColumn("capacidade_regra_padrao", "dias_mes_padrao", "INT NOT NULL DEFAULT 22");

    // 39. Coaching individual (20/09/2026, pedido do Ramon): o Ambiente
    // Metodologia até aqui só media jornada COLETIVA (jornadas_desenvolvimento
    // → jornadas_etapas → jornada_participantes). Coaching, quando existia
    // (coaching_planos), era um PLANO agregado (público-alvo em texto livre,
    // sessões contadas em número, sem pessoa nem data) — não dava pra saber
    // se uma pessoa específica estava em dia com o coach dela. Ramon pediu
    // uma trilha à parte, pessoa a pessoa, com cadência própria por
    // relacionamento, que alcança além da tripulação (gerência, coordenação,
    // diretoria) e que NUNCA entra no cálculo de adesão ao cronograma da
    // jornada coletiva — por isso é tabela nova, não uma coluna a mais em
    // coaching_planos.
    //
    // jornada_participante_id é opcional e sem FK (mesmo padrão de
    // acoes_desenvolvimento.etapa_id/turma_id): cobre tanto quem já está
    // numa jornada de cliente (ex.: Ana Souza, jornada + coaching) quanto
    // quem não tem jornada nenhuma associada (ex.: um diretor que só tem
    // coaching) — é exatamente o gap de schema que o framework de KPIs
    // (claude/framework-kpis-metodologia-2026-09-20.md) documentou como
    // bloqueio #3. cadencia_dias é a cadência COMBINADA daquele
    // relacionamento específico (não um padrão fixo do sistema) — o farol
    // de atraso é calculado comparando isso com o último registro em
    // coaching_encontros (ver função calcularFarolCoaching em
    // coachingIndividualController.js), nunca um corte global.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_individual (
        id                        INT AUTO_INCREMENT PRIMARY KEY,
        nome                      VARCHAR(255) NOT NULL,
        matricula                 VARCHAR(100) NULL,
        cliente                   VARCHAR(255) NULL,
        cargo                     VARCHAR(255) NULL,
        jornada_participante_id   INT NULL,
        responsavel_id            INT NULL,
        cadencia_dias             INT NOT NULL DEFAULT 30,
        status                    VARCHAR(20) NOT NULL DEFAULT 'ativo',
        data_inicio               DATE NULL,
        data_fim                  DATE NULL,
        observacoes               TEXT NULL,
        empresa_id                INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_coaching_individual_jornada_participante (jornada_participante_id),
        INDEX idx_coaching_individual_responsavel (responsavel_id),
        INDEX idx_coaching_individual_empresa (empresa_id)
      );
    `);

    // 40. Log datado de encontros de coaching individual — sem isso não dá
    // pra saber a data real do último encontro (coaching_planos só tinha
    // contagem de sessões previstas/realizadas, nunca datas). Cada linha é
    // um encontro registrado; "último encontro" e o farol de atraso vêm de
    // MAX(data_encontro) por coaching_individual_id, calculado em runtime
    // (não guardado numa coluna, pra nunca dessincronizar).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_encontros (
        id                        INT AUTO_INCREMENT PRIMARY KEY,
        coaching_individual_id    INT NOT NULL,
        data_encontro             DATE NOT NULL,
        observacoes               TEXT NULL,
        registrado_por_id         INT NULL,
        empresa_id                INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_coaching_encontros_coaching (coaching_individual_id),
        INDEX idx_coaching_encontros_empresa (empresa_id)
      );
    `);

    // 41. Perfil comportamental (20/09/2026, pedido do Ramon): Lobo, Gato,
    // Tubarão, Águia + DISC. Ramon pediu pra registrar o perfil de forma
    // manual por enquanto, mas com o schema pronto pra um questionário
    // pontuado dentro do portal no futuro (por isso disc_d/i/s/c em
    // colunas próprias, 0-100, e não só a letra — um questionário
    // preenche as quatro; um cadastro manual de hoje preenche só a letra
    // dominante e deixa as quatro em branco), e que o perfil também
    // oriente o coaching individual (orientacaoPerfil() em
    // perfilComportamentalController.js).
    //
    // Tabela nova e independente — não é coluna em coaching_individual —
    // porque perfil comportamental é atributo da PESSOA, não do vínculo:
    // alguém que só está numa jornada coletiva (sem coaching ainda) também
    // pode ter o perfil registrado, e o vínculo de coaching pode começar
    // ou terminar sem apagar o perfil. jornada_participante_id e
    // coaching_individual_id são os dois opcionais e sem FK, mesmo padrão
    // de coaching_individual.jornada_participante_id (passo 39) — uma
    // pessoa pode estar ligada a um, a outro, aos dois, ou (por enquanto)
    // a nenhum.
    //
    // A relação entre os 4 animais e as letras do DISC não é uma
    // equivalência científica única e fechada — as fontes pesquisadas
    // divergem entre si nos detalhes. O que ficou consistente entre elas,
    // e o que foi adotado aqui: Tubarão ~ D (Dominância), Gato ~ I
    // (Influência), Águia ~ I com traços de D (visão/ideação), Lobo ~ C
    // (Conformidade) com traços de S (Estabilidade). Por isso
    // disc_letra_dominante fica solto, não é gerado a partir de
    // perfil_animal — são dois registros independentes, um popular e um
    // técnico, que o coach pode preencher com o que souber.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pessoas_metodologia (
        id                         INT AUTO_INCREMENT PRIMARY KEY,
        nome                       VARCHAR(255) NOT NULL,
        matricula                  VARCHAR(100) NULL,
        cliente                    VARCHAR(255) NULL,
        cargo                      VARCHAR(255) NULL,
        jornada_participante_id    INT NULL,
        coaching_individual_id     INT NULL,
        perfil_animal              VARCHAR(20) NULL,
        perfil_animal_secundario   VARCHAR(20) NULL,
        disc_letra_dominante       VARCHAR(1) NULL,
        disc_d                     INT NULL,
        disc_i                     INT NULL,
        disc_s                     INT NULL,
        disc_c                     INT NULL,
        origem                     VARCHAR(20) NOT NULL DEFAULT 'manual',
        observacoes                TEXT NULL,
        registrado_por_id          INT NULL,
        empresa_id                 INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pessoas_metodologia_jornada_participante (jornada_participante_id),
        INDEX idx_pessoas_metodologia_coaching_individual (coaching_individual_id),
        INDEX idx_pessoas_metodologia_empresa (empresa_id)
      );
    `);

    // 42. Clientes da Metodologia (20/09/2026, pedido do Ramon): a tela de
    // Mapa de Desenvolvimento tinha "Cliente" como texto livre tanto na
    // jornada quanto no participante — sem lista nenhuma por trás, cada
    // pessoa digitava o nome do jeito que lembrava (ex.: "Safra", "SAFRA
    // Bank", "Banco Safra" viravam 3 clientes diferentes nos filtros e nos
    // agrupamentos por cliente). A correção óbvia seria reaproveitar a
    // tabela `clientes` que a Treinamento já tem — mas Ramon foi explícito:
    // "não quero a lista de clientes vinculada a clientes de treinamento,
    // precisa ter uma lista de clientes exclusiva para metodologia". Por
    // isso esta é uma tabela nova e independente, sem FK nem overlap com
    // `clientes` — mesmo que o nome cadastrado aqui coincida com um nome já
    // usado lá, são dois cadastros sem nenhuma relação no banco. Os campos
    // `cliente` em jornadas_desenvolvimento, jornada_participantes e
    // trilhas_aprendizagem continuam VARCHAR livre (não viraram FK para não
    // quebrar dado histórico já digitado) — o que muda é que agora o
    // frontend só oferece nomes desta lista num <select>, em vez de deixar
    // digitar qualquer coisa.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS metodologia_clientes (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nome        VARCHAR(255) NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'ativo',
        observacoes TEXT NULL,
        empresa_id  INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_metodologia_clientes_empresa (empresa_id)
      );
    `);

    // 43. trilha_id em jornadas_etapas (20/09/2026, pedido do Ramon): as
    // etapas da jornada ("portos", com prazo — data_fim alimenta o KPI
    // "Adesão ao Cronograma") ganharam um vínculo opcional com uma trilha
    // do catálogo de Trilhas, pra quem quiser usar uma trilha como o
    // conteúdo/autoestudo de uma etapa específica. Sem FK, mesmo padrão já
    // usado no restante do módulo (ex.: jornada_participante_id em
    // coaching_individual) — a etapa não deixa de existir se a trilha for
    // excluída depois.
    await ensureColumn("jornadas_etapas", "trilha_id", "INT NULL");

    // 44. Cadastro único de pessoas — Fase 0 (22/09/2026, pedido do Ramon:
    // "precisamos reestruturar todas as páginas de cadastro... todo o
    // portal precisa ser um só nesse sentido"). Fundação da unificação de
    // identidade entre turmas, jornadas, coaching e usuários — ver proposta
    // e plano no projeto Portal T&D (Claude). `pessoas` é a nova fonte de
    // verdade sobre "quem é quem", por empresa; as tabelas antigas mantêm
    // nome/matricula/cliente como retrato histórico daquele cadastro e
    // ganham uma coluna pessoa_id (passo 45) apontando pra cá — nenhuma
    // delas perde dado, nenhuma tela para de funcionar com esta migração
    // sozinha.
    //
    // status_identidade distingue uma pessoa resolvida por CPF
    // ("confirmada") de uma criada só por matrícula+nome ou sem nenhum dos
    // dois ("provisoria") — nunca bloqueia um cadastro de turma/jornada por
    // falta de CPF, só marca a pessoa pra enriquecimento futuro (ex.:
    // quando um CPF aparecer pra ela em outra tela). Duas das seis tabelas
    // duplicadas (jornada_participantes, coaching_individual/
    // pessoas_metodologia) nunca tiveram coluna de CPF — a maioria das
    // pessoas que nascerem a partir delas vai começar como provisória, e
    // isso é esperado, não um erro do backfill.
    //
    // UNIQUE(empresa_id, cpf) permite múltiplas pessoas com cpf NULL na
    // mesma empresa (MySQL/MariaDB não considera NULL colidente em índice
    // único) — o casamento de quem não tem CPF é feito por matrícula+nome
    // na aplicação (resolverPessoa(), em services/pessoasService.js), não
    // por constraint de banco.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pessoas (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id        INT NOT NULL,
        cpf               VARCHAR(11) NULL,
        matricula         VARCHAR(100) NULL,
        nome              VARCHAR(255) NOT NULL,
        cliente           VARCHAR(255) NULL,
        status_identidade VARCHAR(20) NOT NULL DEFAULT 'provisoria',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_pessoas_empresa_cpf (empresa_id, cpf),
        INDEX idx_pessoas_empresa_matricula (empresa_id, matricula),
        INDEX idx_pessoas_empresa_nome (empresa_id, nome),
        CONSTRAINT fk_pessoas_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      );
    `);

    // 45. pessoa_id nas seis tabelas que hoje duplicam identidade —
    // opcional a princípio (ver plano: backfill primeiro, NOT NULL só
    // depois de medir cobertura real em produção). Índice + FK real em cada
    // uma (ver ensurePessoaForeignKey acima) — diferente do padrão sem FK
    // usado entre as tabelas-irmãs do módulo Metodologia, porque `pessoas`
    // é pra ser a âncora central, não mais um vínculo solto.
    const TABELAS_COM_PESSOA = [
      "treinamento_participantes",
      "jornada_participantes",
      "coaching_individual",
      "pessoas_metodologia",
      "dados_bancarios_colaborador",
      "usuarios",
    ];
    for (const tabela of TABELAS_COM_PESSOA) {
      await ensureColumn(tabela, "pessoa_id", "INT NULL");
      await ensurePessoaIndex(tabela);
      await ensurePessoaForeignKey(tabela);
    }

    // 46. Corrige a chave de dados_bancarios_colaborador (achado durante a
    // investigação da proposta de 22/09/2026): hoje é PRIMARY KEY (cpf) sem
    // empresa_id — duas empresas diferentes com um colaborador de mesmo CPF
    // colidem no INSERT. Ver ensureDadosBancariosComposedKey() acima para a
    // condição de segurança (só roda se não houver empresa_id NULL).
    await ensureDadosBancariosComposedKey();

    // 47. Inclusão de usuários (treinandos), 25/09/2026 — ver
    // ensureEmailNullableUsuarios() acima.
    await ensureEmailNullableUsuarios();

    // 48. pessoa_id em avaliacoes_treinandos e respostas_avaliativas
    // (25/09/2026, "Em seguida" combinado com o Ramon depois da entrega de
    // inclusão de usuários) — essas duas tabelas guardam `treinando_nome`
    // como string solta e os controllers usavam essa string pra decidir "é
    // este treinando mesmo?" (isolar as respostas de NPS/prova de um
    // treinando das dos colegas). Duas pessoas com o mesmo nome, em
    // qualquer uma das duas tabelas, colidiam nessa comparação — isso já
    // estava sinalizado como risco de LGPD no relatório de 25/09/2026 e não
    // fazia parte das três decisões daquela entrega. Mesmo padrão das seis
    // tabelas do passo 45: pessoa_id fica opcional (linha antiga sem
    // pessoa_id continua funcionando pelo nome, ver comparação nos
    // controllers), nunca sobrescreve treinando_nome (que continua sendo o
    // retrato exibido na tela).
    const TABELAS_AVALIACAO_COM_PESSOA = ["avaliacoes_treinandos", "respostas_avaliativas"];
    for (const tabela of TABELAS_AVALIACAO_COM_PESSOA) {
      await ensureColumn(tabela, "pessoa_id", "INT NULL");
      await ensurePessoaIndex(tabela);
      await ensurePessoaForeignKey(tabela);
    }

    // 49. Chave única de respostas_avaliativas por identidade, não mais por
    // nome — ver ensureRespostasAvaliativasChavePorPessoa() acima (achado
    // testando o passo 48, mesmo dia).
    await ensureRespostasAvaliativasChavePorPessoa();

    // 50. Cadastro único de pessoas — Fase 2, item 4 (28/09/2026): Mapa de
    // Desenvolvimento → Jornada (Tripulação). `jornada_participantes` já
    // tinha `pessoa_id` desde a Fase 0 (passo 45), mas nunca era
    // preenchido — o formulário e a planilha de importação não tinham
    // campo de CPF nenhum (só nome/matrícula), então não tinha como
    // resolver a pessoa com confiança. Adiciona a coluna `cpf`, opcional,
    // mesmo padrão de treinamento_participantes: nunca bloqueia o
    // cadastro por falta dela.
    await ensureColumn("jornada_participantes", "cpf", "VARCHAR(11) NULL");

    // 51. Cadastro único de pessoas — Fase 2, item 5 (28/09/2026): Tripulação
    // (Metodologia) → Coaching individual + Perfil comportamental. Mesmo
    // padrão do passo 50: `coaching_individual` e `pessoas_metodologia` já
    // tinham `pessoa_id` desde a Fase 0 (passo 45), nunca preenchido — nenhum
    // dos dois formulários tinha campo de CPF. Adiciona `cpf` (opcional) só
    // em coaching_individual — pessoas_metodologia nunca teve formulário de
    // criação independente (o perfil comportamental só é criado a partir de
    // uma linha já existente na Tripulação, jornada ou coaching), então seu
    // pessoa_id passa a ser herdado do vínculo (coaching_individual_id ou
    // jornada_participante_id) em vez de exigir CPF de novo — ver
    // perfilComportamentalController.js.
    await ensureColumn("coaching_individual", "cpf", "VARCHAR(11) NULL");

    // 52. Erro ao criar trilha no módulo Metodologia (08/10/2026, bug
    // reportado pelo Ramon) — ver ensureClienteNullableTrilhas() acima.
    await ensureClienteNullableTrilhas();

    // 53. Oficina de Talentos — Fase 1 (13/10/2026) — ver ensureOficinaTalentos().
    await ensureOficinaTalentos();

    // 55. Oficina de Talentos — Fase 2 (presença e certificado) — ver ensureOficinaFase2().
    await ensureOficinaFase2();

    // 56. Oficina de Talentos — Fase 3 (promoção / indicadores) — ver ensureOficinaFase3().
    await ensureOficinaFase3();

    // 57. Jornadas — encontros e presença por pessoa (Fase 1) — ver ensureJornadaPresenca().
    await ensureJornadaPresenca();

    // 58. Trilhas vinculadas às jornadas e aos encontros — ver ensureJornadaTrilhas().
    await ensureJornadaTrilhas();

    // 59. Grade de presença da turma (Treinamentos, 13/10/2026) — presença
    // mínima configurável por turma (NULL = padrão 75%).
    await ensureColumn("treinamentos", "presenca_minima_pct", "DECIMAL(5,2) NULL");

    // 60. Desvinculação do nome da empresa antiga (13/10/2026) — SOMENTE
    // LEITURA: conta, nos logs do deploy, onde ainda existe o texto antigo
    // gravado como dado (nome da empresa/ambiente, cliente do usuário), para
    // o Super Admin renomear pelo painel. Não altera nada e nunca derruba o
    // start (qualquer erro vira só um aviso).
    await diagnosticarNomeAntigo();

    // 61. Módulo R&S — tabelas nunca tiveram CREATE TABLE no migrate.js: só
    // existiam como database/migrations/01–03_*.sql, rodados à mão. Ambiente
    // novo (ou banco restaurado) subia sem elas e o módulo inteiro dava 500.
    // Idempotente: em produção as tabelas já existem e nada é alterado.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rs_sites (
        id         INT PRIMARY KEY AUTO_INCREMENT,
        empresa_id INT NOT NULL,
        nome       VARCHAR(100) NOT NULL,
        ativo      TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rs_produtos (
        id         INT PRIMARY KEY AUTO_INCREMENT,
        empresa_id INT NOT NULL,
        nome       VARCHAR(150) NOT NULL,
        ativo      TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rps (
        id                   INT PRIMARY KEY AUTO_INCREMENT,
        empresa_id           INT NOT NULL,
        mes_referencia       DATE NOT NULL,
        site                 VARCHAR(100) NOT NULL,
        setor                ENUM('OPERACIONAL','ESTRATÉGICO') NOT NULL,
        chamado              VARCHAR(200) NULL,
        produto              VARCHAR(150) NOT NULL,
        cargo                VARCHAR(200) NULL,
        data_recebimento     DATE NULL,
        status               ENUM('EM ANDAMENTO','ENTREGUE','NÃO ENTREGUE','CANCELADA') NOT NULL DEFAULT 'EM ANDAMENTO',
        inicio_av_tecnica    DATE NULL,
        final_av_tecnica     DATE NULL,
        data_fechamento_vaga DATE NULL,
        hcs                  INT NOT NULL DEFAULT 0,
        hcs_com_to           INT NOT NULL DEFAULT 0,
        hcs_aprovados        INT NOT NULL DEFAULT 0,
        qtd_entregue         INT NOT NULL DEFAULT 0,
        observacoes          TEXT NULL,
        created_by           INT NULL,
        updated_by           INT NULL,
        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rps_empresa (empresa_id),
        INDEX idx_rps_mes     (mes_referencia),
        INDEX idx_rps_site    (site),
        INDEX idx_rps_setor   (setor),
        INDEX idx_rps_status  (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 62. Cadastro de instrutores (14/10/2026) — ver controllers/instrutoresController.js.
    // `instrutores` (nome oficial + situação) e `instrutor_apelidos` (grafias que
    // apontam para o mesmo instrutor). Carga inicial idempotente:
    //  - usuários com perfil instrutor (ativos -> ativo; inativos -> desligado);
    //  - tabela antiga `instrutores_desligados` (empresa NULL vale para todas).
    // Nomes que só existem no histórico das turmas NÃO entram aqui: caem na fila
    // "Nomes a classificar" para o time decidir.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instrutores (
        id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        empresa_id  INT NOT NULL,
        nome        VARCHAR(150) NOT NULL,
        situacao    VARCHAR(20) NOT NULL DEFAULT 'ativo',
        data_saida  DATE NULL,
        motivo      VARCHAR(255) NULL,
        observacao  TEXT NULL,
        created_by  INT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_instrutor_nome (empresa_id, nome),
        KEY idx_instrutor_situacao (empresa_id, situacao)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instrutor_apelidos (
        id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        empresa_id   INT NOT NULL,
        instrutor_id INT NOT NULL,
        apelido      VARCHAR(150) NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_instrutor_apelido (empresa_id, apelido),
        KEY idx_apelido_instrutor (instrutor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
      await pool.query(`
        INSERT IGNORE INTO instrutores (empresa_id, nome, situacao, motivo)
        SELECT u.empresa_id, TRIM(u.nome),
               CASE WHEN u.ativo = 0 THEN 'desligado' ELSE 'ativo' END,
               CASE WHEN u.ativo = 0 THEN 'Conta de instrutor inativa' ELSE NULL END
        FROM usuarios u
        WHERE LOWER(TRIM(u.perfil)) = 'instrutor' AND u.empresa_id IS NOT NULL AND TRIM(u.nome) <> ''
      `);
      await pool.query(`
        INSERT IGNORE INTO instrutores (empresa_id, nome, situacao, motivo)
        SELECT e.id, TRIM(d.nome), 'desligado', d.observacao
        FROM instrutores_desligados d
        JOIN empresas e ON (d.empresa_id IS NULL OR d.empresa_id = e.id)
      `);
      // Quem já estava na tabela antiga como desligado prevalece sobre "ativo" vindo do usuário.
      await pool.query(`
        UPDATE instrutores i
        JOIN instrutores_desligados d ON LOWER(TRIM(d.nome)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(i.nome)) COLLATE utf8mb4_unicode_ci
             AND (d.empresa_id IS NULL OR d.empresa_id = i.empresa_id)
        SET i.situacao = 'desligado', i.motivo = COALESCE(i.motivo, d.observacao)
        WHERE i.situacao = 'ativo'
      `);
    } catch (error) {
      console.log(`  ↳ carga inicial de instrutores não concluída (${error.message}) — seguindo`);
    }

    // 63. Tentativas por prova (14/10/2026) — ver ensureTentativasProva().
    try {
      await ensureTentativasProva();
    } catch (error) {
      console.log(`  ↳ tentativas por prova não concluído (${error.message}) — seguindo`);
    }

    // 64. Jornadas — desenvolvimento por etapa e evolução (Fase 2) — ver ensureJornadaDesenvolvimento().
    try {
      await ensureJornadaDesenvolvimento();
    } catch (error) {
      console.log(`  ↳ desenvolvimento das jornadas não concluído (${error.message}) — seguindo`);
    }

    // 65. Trilhas por pessoa (Fase 3) — ver ensureTrilhaPessoas().
    try {
      await ensureTrilhaPessoas();
    } catch (error) {
      console.log(`  ↳ trilhas por pessoa não concluído (${error.message}) — seguindo`);
    }

    // 66. Célula baby (16/10/2026) — ver ensureCelulaBaby().
    try {
      await ensureCelulaBaby();
    } catch (error) {
      console.log(`  ↳ célula baby não concluído (${error.message}) — seguindo`);
    }

    // 67. Rotina do instrutor (16/10/2026) — ver ensureRotinaInstrutor().
    try {
      await ensureRotinaInstrutor();
    } catch (error) {
      console.log(`  ↳ rotina do instrutor não concluído (${error.message}) — seguindo`);
    }

    // 68. Importação de provas em papel (16/10/2026) — ver ensureProvasPapel().
    try {
      await ensureProvasPapel();
    } catch (error) {
      console.log(`  ↳ provas em papel não concluído (${error.message}) — seguindo`);
    }

    // 69. Correções dos testes em produção (19/10/2026) — contador do id, questionário de NPS
    //     e nota das provas respondidas online. Ver ensureCorrecoesAvaliacoes().
    try {
      await ensureCorrecoesAvaliacoes();
    } catch (error) {
      console.log(`  ↳ correções de avaliações não concluído (${error.message}) — seguindo`);
    }

    // 70. Comentários das RPs do R&S (19/10/2026) — histórico de observações com autor e data.
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS rps_comentarios (
          id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          empresa_id   INT NOT NULL,
          rp_id        INT NOT NULL,
          autor_id     INT NULL,
          autor_nome   VARCHAR(150) NULL,
          autor_perfil VARCHAR(40) NULL,
          texto        TEXT NOT NULL,
          created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_rps_comentarios_rp (rp_id, created_at),
          INDEX idx_rps_comentarios_empresa (empresa_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ↳ comentários das RPs: ok");
    } catch (error) {
      console.log(`  ↳ comentários das RPs não concluído (${error.message}) — seguindo`);
    }

    // 71. Lixeira das RPs do R&S (20/10/2026) — excluir passa a "esconder" a RP por 30 dias
    //     (restaurável); quem apaga de vez é a purga. NULL = RP normal.
    try {
      const [colExc] = await pool.query("SHOW COLUMNS FROM rps LIKE 'excluido_em'");
      if (!colExc.length) {
        await pool.query("ALTER TABLE rps ADD COLUMN excluido_em DATETIME NULL, ADD COLUMN excluido_por INT NULL");
        await pool.query("ALTER TABLE rps ADD INDEX idx_rps_excluido (empresa_id, excluido_em)");
      }
      console.log("  ↳ lixeira das RPs: ok");
    } catch (error) {
      console.log(`  ↳ lixeira das RPs não concluído (${error.message}) — seguindo`);
    }

    // 72. Pacote 21/10/2026 — código de primeiro acesso, mural da turma, sino de avisos,
    //     fechamento mensal, Oficina (reação e pós-oficina). Ver ensurePacote20261021().
    try {
      await ensurePacote20261021();
    } catch (error) {
      console.log(`  ↳ pacote 21/10 não concluído (${error.message}) — seguindo`);
    }

    // 72b. Produção de conteúdo (22/10/2026): pedidos de material, etapas com
    //      Iniciar/Concluir, catálogo de tipos. Ver ensureConteudo().
    try {
      await ensureConteudo();
    } catch (error) {
      console.log(`  ↳ produção de conteúdo não concluído (${error.message}) — seguindo`);
    }

    // 73. Berço das RPs (21/10/2026): o time pode aprovar mais gente do que o gestor
    //     pediu e deixar o excedente "no berço" (reserva). Quando alguém do berço é
    //     convocado, sai de `hcs_berco`, entra em `hcs_convocados_berco` (quantos vieram
    //     do berço — já contados dentro de qtd_entregue) e a convocação fica em
    //     `rps_convocacoes` (data, quantidade, quem convocou).
    try {
      await ensureColumn("rps", "hcs_berco", "INT NOT NULL DEFAULT 0");
      await ensureColumn("rps", "hcs_convocados_berco", "INT NOT NULL DEFAULT 0");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS rps_convocacoes (
          id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          rp_id         INT NOT NULL,
          empresa_id    INT NOT NULL,
          quantidade    INT NOT NULL,
          observacao    VARCHAR(500) NULL,
          convocado_por INT NULL,
          criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          estornado_em  DATETIME NULL,
          estornado_por INT NULL,
          INDEX idx_rps_convocacoes_rp (rp_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ↳ berço das RPs: ok");
    } catch (error) {
      console.log(`  ↳ berço das RPs não concluído (${error.message}) — seguindo`);
    }

    // 53b. Chamada com data antiga (22/10/2026): presenca_aulas.data_aula é
    //      gravada quando a chamada é criada e não acompanhava a edição da
    //      data da aula no Cronograma. O Diário de bordo agrupava por essa data
    //      e divergia do Painel por dia (um dia com o dobro de presentes, outro
    //      "sem chamada"). Acerta o que já está gravado; a edição passou a
    //      sincronizar sozinha (turmaAulasController.updateTurmaAula).
    try {
      const [r] = await pool.query(`
        UPDATE presenca_aulas pa
        JOIN turma_aulas ta ON ta.id = pa.turma_aula_id
        SET pa.data_aula = ta.data_aula
        WHERE pa.data_aula <> ta.data_aula
      `);
      console.log(`  ↳ datas da chamada alinhadas ao Cronograma: ${r.affectedRows || 0} registro(s)`);
    } catch (error) {
      console.log(`  ↳ alinhamento das datas da chamada não concluído (${error.message}) — seguindo`);
    }

    // 53c. Instrutores adicionais da turma (22/10/2026) — a TBT é feita por mais
    //      de um instrutor. treinamentos.instrutor continua sendo o PRINCIPAL;
    //      aqui ficam os demais. Ver lib/instrutoresTurma.js.
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS treinamento_instrutores (
          id             INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          empresa_id     INT NULL,
          treinamento_id INT NOT NULL,
          instrutor      VARCHAR(150) NOT NULL,
          criado_por     VARCHAR(150) NULL,
          criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ti_turma_instrutor (treinamento_id, instrutor),
          KEY idx_ti_instrutor (instrutor)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ↳ instrutores adicionais da turma: ok");
    } catch (error) {
      console.log(`  ↳ instrutores adicionais da turma não concluído (${error.message}) — seguindo`);
    }

    // 54. "Erro ao criar jornada" (13/10/2026) — ver ensureStatusVarchar().
    await ensureStatusVarchar("jornadas_desenvolvimento", 30, "planejada");
    await ensureStatusVarchar("jornadas_etapas", 30, "planejada");
    await ensureStatusVarchar("acoes_desenvolvimento", 30, "planejada");
    await ensureStatusVarchar("coaching_planos", 30, "planejado");

    console.log("✅ Migrações executadas com sucesso no MySQL!");
  } catch (error) {
    console.error("❌ Erro ao rodar migrações automáticas no MySQL:", error);
    throw error;
  }
}

// 64. Jornadas — desenvolvimento por etapa e evolução (Fase 2, 16/10/2026,
// pedido do Ramon: "registrar as presenças e o desenvolvimento de cada pessoa
// registrada nas jornadas"). Proposta em
// claude/proposta-presenca-desenvolvimento-jornadas-trilhas-2026-10-13.md.
//  - jornada_participante_etapas: por participante × etapa da jornada — status
//    (nao_iniciada / em_andamento / concluida, com data), avaliação (atingiu /
//    parcial / nao_atingiu + nota opcional) e observação curta. UNIQUE por par.
//  - jornada_evolucao_notas: anotações datadas por participante (ponto forte,
//    dificuldade, plano de ação, geral).
// Sem FK para jornadas/participantes/etapas (mesmo motivo do passo 57: o tipo
// do id em produção pode divergir); a limpeza em cascata é feita nos controllers.
async function ensureJornadaDesenvolvimento() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jornada_participante_etapas (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id      INT NULL,
      participante_id INT NOT NULL,
      etapa_id        INT NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'nao_iniciada',
      data_conclusao  DATE NULL,
      avaliacao       VARCHAR(15) NULL,
      nota            DECIMAL(4,1) NULL,
      observacao      VARCHAR(500) NULL,
      atualizado_por_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_jornada_participante_etapa (participante_id, etapa_id),
      INDEX idx_jpe_etapa (etapa_id),
      INDEX idx_jpe_empresa (empresa_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jornada_evolucao_notas (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id      INT NULL,
      participante_id INT NOT NULL,
      data            DATE NOT NULL,
      tipo            VARCHAR(20) NOT NULL DEFAULT 'geral',
      texto           TEXT NOT NULL,
      criado_por_id   INT NULL,
      criado_por_nome VARCHAR(150) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_jen_participante (participante_id, data),
      INDEX idx_jen_empresa (empresa_id)
    );
  `);
}

// 65. Trilhas por pessoa (Fase 3, 16/10/2026, pedido do Ramon: trilhas lançadas
// pela Metodologia, pessoa a pessoa, enquanto o treinando ainda não tem login).
//  - trilha_participantes: quem está em cada trilha. Nasce da sincronização com
//    os participantes das jornadas ligadas à trilha (origem "jornada") ou da
//    inclusão manual pelo cadastro único (origem "manual"). "chave" evita duplicar
//    a mesma pessoa: p<pessoa_id>, senão m<matrícula>, senão j<participante>.
//    Remover = situacao "removido" (a linha fica, para a sincronização não trazer
//    a pessoa de volta e o progresso já lançado não se perder).
//  - trilha_progresso_pessoa: etapa concluída por pessoa (com data e observação).
//    Sem linha = não concluída. Não mexe em trilha_progresso (por e-mail de login).
// Sem FK (mesmo padrão do módulo); a limpeza em cascata é feita nos controllers.
async function ensureTrilhaPessoas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trilha_participantes (
      id                      INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id              INT NULL,
      trilha_id               INT NOT NULL,
      chave                   VARCHAR(40) NOT NULL,
      pessoa_id               INT NULL,
      jornada_participante_id INT NULL,
      nome                    VARCHAR(255) NOT NULL,
      matricula               VARCHAR(100) NULL,
      turma                   VARCHAR(255) NULL,
      cargo                   VARCHAR(255) NULL,
      origem                  VARCHAR(20) NOT NULL DEFAULT 'manual',
      situacao                VARCHAR(12) NOT NULL DEFAULT 'ativo',
      entrou_em               DATE NULL,
      criado_por_id           INT NULL,
      created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_trilha_participante (trilha_id, chave),
      INDEX idx_trilha_part_trilha (trilha_id),
      INDEX idx_trilha_part_pessoa (pessoa_id),
      INDEX idx_trilha_part_jp (jornada_participante_id),
      INDEX idx_trilha_part_empresa (empresa_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trilha_progresso_pessoa (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id            INT NULL,
      trilha_id             INT NOT NULL,
      trilha_participante_id INT NOT NULL,
      etapa_id              INT NOT NULL,
      data_conclusao        DATE NULL,
      observacao            VARCHAR(500) NULL,
      origem                VARCHAR(20) NOT NULL DEFAULT 'manual',
      lancado_por_id        INT NULL,
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_trilha_prog_pessoa (trilha_participante_id, etapa_id),
      INDEX idx_trilha_prog_trilha (trilha_id),
      INDEX idx_trilha_prog_etapa (etapa_id)
    );
  `);
  console.log("  ↳ trilha_participantes / trilha_progresso_pessoa: ok");
}

// 66. Célula baby (16/10/2026, pedido do Ramon): acompanhamento da curva de
// aprendizagem, feito pelo próprio instrutor, dos treinandos APROVADOS numa
// turma de Avaliação Técnica, nos 7 primeiros dias de operação. Indicadores
// livres (o instrutor define nome/unidade/sentido; meta é opcional). O
// resultado da avaliação técnica (passou / em berço / não seguiu) é definido
// pelo instrutor ao final da turma e só "passou" entra no acompanhamento.
async function ensureCelulaBaby() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS celulas_baby (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id            INT NULL,
      treinamento_id        INT NOT NULL,
      cliente               VARCHAR(150) NULL,
      turma_nome            VARCHAR(255) NULL,
      instrutor             VARCHAR(150) NULL,
      data_inicio_operacao  DATE NULL,
      status                VARCHAR(20) NOT NULL DEFAULT 'a_configurar',
      relatorio_final       TEXT NULL,
      iniciada_em           DATETIME NULL,
      encerrada_em          DATETIME NULL,
      encerrada_por_id      INT NULL,
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_celula_turma (treinamento_id),
      INDEX idx_celula_empresa (empresa_id),
      INDEX idx_celula_status (status)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS celula_baby_pessoas (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      celula_id       INT NOT NULL,
      participante_id INT NULL,
      pessoa_id       INT NULL,
      nome            VARCHAR(255) NOT NULL,
      matricula       VARCHAR(100) NULL,
      resultado       VARCHAR(20) NULL,
      parecer         VARCHAR(20) NULL,
      observacao      VARCHAR(1000) NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_celula_pessoa (celula_id, participante_id),
      INDEX idx_celula_pessoa_celula (celula_id),
      INDEX idx_celula_pessoa_pessoa (pessoa_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS celula_baby_indicadores (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      celula_id  INT NOT NULL,
      nome       VARCHAR(120) NOT NULL,
      unidade    VARCHAR(30) NULL,
      sentido    VARCHAR(10) NOT NULL DEFAULT 'maior',
      meta       DECIMAL(14,4) NULL,
      ordem      INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_celula_ind_nome (celula_id, nome),
      INDEX idx_celula_ind_celula (celula_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS celula_baby_lancamentos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      celula_id     INT NOT NULL,
      indicador_id  INT NOT NULL,
      pessoa_row_id INT NOT NULL,
      dia           TINYINT NOT NULL,
      valor         DECIMAL(14,4) NOT NULL,
      lancado_por_id INT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_celula_lanc (indicador_id, pessoa_row_id, dia),
      INDEX idx_celula_lanc_celula (celula_id)
    );
  `);
  console.log("  ↳ célula baby: ok");
}

// 67. Rotina do instrutor (16/10/2026, pedido do Ramon).
// Checklist e responsabilidades (turma de Avaliação Técnica), diário de bordo,
// atividades do instrutor (formação continuada e avulsas). As atividades
// registradas somam na CH do instrutor (ver services/capacidadeResolver.js).
async function ensureRotinaInstrutor() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_atividades_catalogo (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id          INT NULL,
      nome                VARCHAR(120) NOT NULL,
      descricao           TEXT NULL,
      pede_pessoa         TINYINT(1) NOT NULL DEFAULT 0,
      minutos_padrao      INT NULL,
      tem_prazo_fim_turma TINYINT(1) NOT NULL DEFAULT 0,
      marcada_padrao      TINYINT(1) NOT NULL DEFAULT 0,
      marcada_padrao_avtec TINYINT(1) NOT NULL DEFAULT 0,
      ativo               TINYINT(1) NOT NULL DEFAULT 1,
      sistema             TINYINT(1) NOT NULL DEFAULT 0,
      criado_por          VARCHAR(150) NULL,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rac_empresa (empresa_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_turma_atividades (
      treinamento_id INT NOT NULL,
      catalogo_id    INT NOT NULL,
      PRIMARY KEY (treinamento_id, catalogo_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_atividades_registros (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id      INT NULL,
      treinamento_id  INT NULL,
      catalogo_id     INT NULL,
      tipo_nome       VARCHAR(120) NOT NULL,
      data_atividade  DATE NOT NULL,
      minutos         INT NOT NULL,
      instrutor       VARCHAR(150) NULL,
      cliente         VARCHAR(150) NULL,
      participante_id INT NULL,
      pessoa_nome     VARCHAR(200) NULL,
      tema            VARCHAR(300) NULL,
      observacao      TEXT NULL,
      biblioteca_id   INT NULL,
      necessidade_id  INT NULL,
      criado_por      VARCHAR(150) NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rar_turma (treinamento_id),
      INDEX idx_rar_instrutor (instrutor, data_atividade),
      INDEX idx_rar_empresa (empresa_id, data_atividade)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_modelo_checklist (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NULL,
      etapa      VARCHAR(20) NOT NULL,
      ordem      INT NOT NULL DEFAULT 0,
      texto      VARCHAR(500) NOT NULL,
      ativo      TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_rmc_empresa (empresa_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_modelo_tarefas (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id  INT NULL,
      ordem       INT NOT NULL DEFAULT 0,
      item        VARCHAR(200) NOT NULL,
      o_que_fazer VARCHAR(600) NULL,
      ancora      VARCHAR(20) NOT NULL DEFAULT 'continuo',
      offset_dias INT NOT NULL DEFAULT 0,
      dias_uteis  TINYINT(1) NOT NULL DEFAULT 0,
      ativo       TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_rmt_empresa (empresa_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_checklist (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      treinamento_id INT NOT NULL,
      etapa          VARCHAR(20) NOT NULL,
      ordem          INT NOT NULL DEFAULT 0,
      texto          VARCHAR(500) NOT NULL,
      resposta       VARCHAR(5) NULL,
      obs            TEXT NULL,
      respondido_por VARCHAR(150) NULL,
      respondido_em  DATETIME NULL,
      UNIQUE KEY uk_rc_item (treinamento_id, etapa, ordem)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_tarefas (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      treinamento_id INT NOT NULL,
      ordem          INT NOT NULL DEFAULT 0,
      item           VARCHAR(200) NOT NULL,
      o_que_fazer    VARCHAR(600) NULL,
      ancora         VARCHAR(20) NOT NULL DEFAULT 'continuo',
      offset_dias    INT NOT NULL DEFAULT 0,
      dias_uteis     TINYINT(1) NOT NULL DEFAULT 0,
      feito          TINYINT(1) NOT NULL DEFAULT 0,
      feito_em       DATETIME NULL,
      feito_por      VARCHAR(150) NULL,
      UNIQUE KEY uk_rt_item (treinamento_id, ordem)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_diario (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      treinamento_id INT NOT NULL,
      data_dia       DATE NOT NULL,
      texto          TEXT NULL,
      atualizado_por VARCHAR(150) NULL,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rd_dia (treinamento_id, data_dia)
    )
  `);
  // Fase 2 (16/10/2026): avaliação individual dos candidatos ao final da Avaliação Técnica.
  // Uma linha por candidato (UNIQUE turma + participante); o resultado
  // (passou / em_berco / nao_seguiu) alimenta a célula baby. O "registro"
  // marca a avaliação como registrada (trava a edição do instrutor).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_avaliacao_individual (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id      INT NULL,
      treinamento_id  INT NOT NULL,
      participante_id INT NOT NULL,
      nota_pontualidade TINYINT NULL,
      nota_interesse    TINYINT NULL,
      nota_comportamento TINYINT NULL,
      nota_quiz         TINYINT NULL,
      nota_avaliacao_final TINYINT NULL,
      media           DECIMAL(4,2) NULL,
      resultado       VARCHAR(20) NULL,
      observacao      VARCHAR(1000) NULL,
      atualizado_por  VARCHAR(150) NULL,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rai (treinamento_id, participante_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rotina_avaliacao_registro (
      treinamento_id INT NOT NULL PRIMARY KEY,
      empresa_id     INT NULL,
      registrada_por VARCHAR(150) NULL,
      registrada_em  DATETIME NOT NULL
    )
  `);
  console.log("  ↳ rotina do instrutor: ok");
}

/**
 * Importação de provas feitas no papel (16/10/2026).
 *  - prova_papel_lotes: uma importação (uma prova aplicada em papel numa turma).
 *  - prova_papel_resultados: uma linha por participante (faltou, respostas, nota).
 *  - prova_papel_arquivos: fotos/PDF digitalizados (ficam em /uploads/provas-papel, privados).
 * Ao confirmar, a nota vai para avaliacoes.nota_prova (Dashboard, Analytics, Certificados)
 * e, se a prova é cadastrada, também para respostas_avaliativas (origem 'papel').
 */
async function ensureProvasPapel() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prova_papel_lotes (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      treinamento_id INT NOT NULL,
      material_id    INT NULL,
      titulo         VARCHAR(200) NOT NULL,
      nota_maxima    DECIMAL(6,2) NOT NULL DEFAULT 10,
      data_aplicacao DATE NULL,
      status         VARCHAR(12) NOT NULL DEFAULT 'rascunho',
      criado_por     VARCHAR(150) NULL,
      criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confirmado_por VARCHAR(150) NULL,
      confirmado_em  DATETIME NULL,
      desfeito_por   VARCHAR(150) NULL,
      desfeito_em    DATETIME NULL,
      KEY idx_ppl_trein (treinamento_id),
      KEY idx_ppl_empresa (empresa_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prova_papel_resultados (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      lote_id          INT NOT NULL,
      participante_id  INT NOT NULL,
      pessoa_id        INT NULL,
      nome             VARCHAR(200) NOT NULL,
      faltou           TINYINT(1) NOT NULL DEFAULT 0,
      respostas_texto  VARCHAR(400) NULL,
      acertos          INT NULL,
      total_questoes   INT NULL,
      nota_original    DECIMAL(6,2) NULL,
      nota_10          DECIMAL(5,2) NULL,
      avaliacao_id     INT NULL,
      avaliacao_criada TINYINT(1) NOT NULL DEFAULT 0,
      nota_anterior    DECIMAL(5,2) NULL,
      resposta_id      INT NULL,
      UNIQUE KEY uk_ppr (lote_id, participante_id),
      KEY idx_ppr_part (participante_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prova_papel_arquivos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      lote_id       INT NOT NULL,
      nome_original VARCHAR(255) NULL,
      arquivo       VARCHAR(255) NOT NULL,
      tipo          VARCHAR(80) NULL,
      tamanho       INT NULL,
      enviado_por   VARCHAR(150) NULL,
      criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_ppa_lote (lote_id)
    )
  `);
  // Marca de onde veio a resposta: 'papel' = importada de prova em papel.
  const [existe] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respostas_avaliativas' LIMIT 1`
  );
  if (existe.length) {
    await ensureColumn("respostas_avaliativas", "origem", "VARCHAR(20) NULL");
    await ensureColumn("respostas_avaliativas", "lote_papel_id", "INT NULL");
  }
  console.log("  ↳ provas em papel: ok");
}

// ---------------------------------------------------------------------------
// 19/10/2026 — achados do teste em produção do Ramon.
//
// 1) "Field 'id' doesn't have a default value" ao registrar NPS: em produção a
//    tabela avaliacoes_treinandos foi criada à mão, sem AUTO_INCREMENT no id,
//    e o CREATE TABLE IF NOT EXISTS do passo 23 nunca a corrige. Aqui,
//    para cada tabela de avaliação, se o id existe, é chave primária e não é
//    AUTO_INCREMENT, passa a ser (o contador começa depois do maior id atual).
//    Se o id nem é chave primária (caso raro), só avisa no log — não arrisca
//    mexer em chave de tabela com dados.
// 2) Questionário de NPS: coluna respostas_json em avaliacoes_treinandos.
// 3) Provas respondidas online antes desta versão não tinham nota na turma:
//    cria as linhas que faltam em `avaliacoes` (sem sobrescrever nada que já exista).
// ---------------------------------------------------------------------------
async function ensureAutoIncrementId(tabela) {
  const [tab] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tabela]
  );
  if (!tab.length) return;
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE, COLUMN_KEY, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id' LIMIT 1`,
    [tabela]
  );
  const col = rows[0];
  if (!col) return;
  if (/auto_increment/i.test(col.EXTRA || "")) return;
  if (col.COLUMN_KEY !== "PRI") {
    console.log(`  ↳ ${tabela}.id sem AUTO_INCREMENT e fora da chave primária — não alterado (verificar manualmente)`);
    return;
  }
  const tipo = /^(tinyint|smallint|mediumint|int|bigint)/i.test(col.COLUMN_TYPE) ? col.COLUMN_TYPE : "INT";
  await pool.query(`ALTER TABLE ${tabela} MODIFY COLUMN id ${tipo} NOT NULL AUTO_INCREMENT`);
  console.log(`  ↳ ${tabela}.id agora é AUTO_INCREMENT`);
}

async function ensureCorrecoesAvaliacoes() {
  for (const tabela of ["avaliacoes_treinandos", "avaliacoes", "respostas_avaliativas", "materiais_avaliativos"]) {
    try {
      await ensureAutoIncrementId(tabela);
    } catch (error) {
      console.log(`  ↳ ${tabela}: contador do id não ajustado (${error.message}) — seguindo`);
    }
  }
  const [t] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avaliacoes_treinandos' LIMIT 1`
  );
  if (t.length) await ensureColumn("avaliacoes_treinandos", "respostas_json", "TEXT NULL");

  try {
    const { reconciliarNotasProvas } = require("../lib/sincNotaProva");
    const criadas = await reconciliarNotasProvas();
    if (criadas) console.log(`  ↳ notas de provas online levadas para as turmas: ${criadas}`);
  } catch (error) {
    console.log(`  ↳ reconciliação das notas de provas não concluída (${error.message}) — seguindo`);
  }
  console.log("  ↳ correções de avaliações: ok");
}


// 72. Pacote 21/10/2026.
async function ensurePacote20261021() {
  // Mural da turma: a tabela só existia como script SQL avulso (2026-07-17).
  await pool.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Código de primeiro acesso (lib/codigoAcesso.js).
  await ensureColumn("usuarios", "codigo_acesso", "VARCHAR(16) NULL");
  await ensureColumn("usuarios", "codigo_acesso_expira", "DATETIME NULL");

  // Sino de avisos: um registro por usuário e por "chave" (evita repetir o mesmo aviso).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS avisos (
      id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NULL,
      usuario_id INT NOT NULL,
      tipo       VARCHAR(40) NOT NULL,
      gravidade  VARCHAR(10) NOT NULL DEFAULT 'info',
      titulo     VARCHAR(200) NOT NULL,
      mensagem   VARCHAR(500) NULL,
      link       VARCHAR(300) NULL,
      chave      VARCHAR(160) NOT NULL,
      valor      INT NOT NULL DEFAULT 0,
      lido_em    DATETIME NULL,
      resolvido_em DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_avisos_usuario_chave (usuario_id, chave),
      INDEX idx_avisos_usuario (usuario_id, lido_em, resolvido_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Fechamento mensal por cliente: foto (JSON) do mês no momento do fechamento.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fechamentos_mensais (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      empresa_id  INT NOT NULL,
      cliente     VARCHAR(150) NOT NULL,
      mes         CHAR(7) NOT NULL,
      dados_json  LONGTEXT NOT NULL,
      observacao  VARCHAR(1000) NULL,
      fechado_por INT NULL,
      fechado_por_nome VARCHAR(150) NULL,
      fechado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_fechamento (empresa_id, cliente, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Oficina de Talentos — avaliação de reação por módulo (anônima para a gestão) e
  // acompanhamento pós-oficina (30/60/90 dias após o fim da turma).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_reacoes (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      empresa_id  INT NULL,
      turma_id    INT NOT NULL,
      modulo_id   INT NOT NULL,
      inscricao_id INT NOT NULL,
      nota        TINYINT NOT NULL,
      comentario  VARCHAR(500) NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_reacao_modulo_inscricao (modulo_id, inscricao_id),
      INDEX idx_reacao_turma (turma_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficina_acompanhamentos (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      empresa_id  INT NULL,
      turma_id    INT NOT NULL,
      inscricao_id INT NOT NULL,
      marco       SMALLINT NOT NULL,
      data_prevista DATE NOT NULL,
      status      VARCHAR(15) NOT NULL DEFAULT 'pendente',
      resultado   VARCHAR(20) NULL,
      gestor_nome VARCHAR(150) NULL,
      observacao  VARCHAR(1000) NULL,
      registrado_por_id INT NULL,
      registrado_em DATETIME NULL,
      UNIQUE KEY uk_acomp_inscricao_marco (inscricao_id, marco),
      INDEX idx_acomp_empresa (empresa_id, status, data_prevista),
      INDEX idx_acomp_turma (turma_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("  ↳ pacote 21/10 (mural, código de acesso, avisos, fechamento, Oficina): ok");
}

// Produção de conteúdo (22/10/2026, pedido do Ramon): substitui a planilha
// "Acompanhamento Analistas Conteudo". O perfil analista_conteudo não precisa
// de mudança de schema (usuarios.perfil é VARCHAR(50)).
//  - conteudo_tipos: catálogo (prazo em HORAS ÚTEIS por etapa + pontos), editável.
//  - conteudo_pedidos: um pedido de material (cliente, tipo, analista, validador).
//  - conteudo_etapas: cada passagem por criação/validação/postagem, com rodada
//    (cada pedido de ajuste abre uma nova rodada). Horário gravado no clique.
//  - conteudo_config: expediente (horário útil) usado nos prazos.
// Datas são DATETIME "de parede" no horário de Salvador (America/Bahia).
async function ensureConteudo() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_tipos (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id        INT NULL,
      nome              VARCHAR(120) NOT NULL,
      prazo_criacao_h   DECIMAL(6,2) NOT NULL DEFAULT 0,
      prazo_validacao_h DECIMAL(6,2) NOT NULL DEFAULT 0,
      prazo_postagem_h  DECIMAL(6,2) NOT NULL DEFAULT 0,
      pontos            DECIMAL(5,1) NOT NULL DEFAULT 1,
      ativo             TINYINT(1) NOT NULL DEFAULT 1,
      ordem             INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_conteudo_tipo (empresa_id, nome),
      INDEX idx_conteudo_tipo_empresa (empresa_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_pedidos (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id       INT NULL,
      codigo_legado    INT NULL,
      cliente          VARCHAR(150) NOT NULL,
      tipo_id          INT NULL,
      tipo_nome        VARCHAR(120) NULL,
      titulo           VARCHAR(255) NOT NULL,
      descricao        TEXT NULL,
      solicitante      VARCHAR(150) NULL,
      analista_id      INT NULL,
      analista_nome    VARCHAR(150) NULL,
      aberto_em        DATETIME NOT NULL,
      validador_tipo   VARCHAR(10) NOT NULL DEFAULT 'cliente',
      status           VARCHAR(24) NOT NULL DEFAULT 'a_fazer',
      origem           VARCHAR(10) NOT NULL DEFAULT 'portal',
      revisao          VARCHAR(10) NULL,
      revisao_motivo   VARCHAR(500) NULL,
      revisado_por_id  INT NULL,
      revisado_em      DATETIME NULL,
      lembrar_em       DATE NULL,
      concluido_em     DATETIME NULL,
      cancelado_em     DATETIME NULL,
      cancelado_motivo VARCHAR(500) NULL,
      criado_por_id    INT NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_conteudo_legado (empresa_id, codigo_legado),
      INDEX idx_conteudo_ped_empresa (empresa_id, status),
      INDEX idx_conteudo_ped_analista (analista_id),
      INDEX idx_conteudo_ped_aberto (aberto_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_etapas (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      pedido_id     INT NOT NULL,
      etapa         VARCHAR(12) NOT NULL,
      rodada        INT NOT NULL DEFAULT 1,
      inicio        DATETIME NULL,
      fim           DATETIME NULL,
      resultado     VARCHAR(10) NULL,
      retroativo    TINYINT(1) NOT NULL DEFAULT 0,
      justificativa VARCHAR(500) NULL,
      observacao    VARCHAR(500) NULL,
      usuario_id    INT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_conteudo_etapa_pedido (pedido_id, etapa, rodada)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_config (
      empresa_id INT NOT NULL DEFAULT 0,
      chave      VARCHAR(40) NOT NULL,
      valor      VARCHAR(200) NOT NULL,
      PRIMARY KEY (empresa_id, chave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Pacote 3 (23/10/2026): séries (#TBT por cliente), vínculo do pedido com a turma e
  // "não precisa de material" para TBT. A turma é referência por id sem FK dura (o
  // plano de FKs é um item à parte); ao apagar a turma o pedido segue existindo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_series (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NULL,
      nome       VARCHAR(120) NOT NULL,
      cliente    VARCHAR(150) NOT NULL,
      gatilho    VARCHAR(10) NOT NULL DEFAULT 'tbt',
      tipo_id    INT NULL,
      ativo      TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_conteudo_serie (empresa_id, nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("conteudo_pedidos", "treinamento_id", "INT NULL");
  await ensureColumn("conteudo_pedidos", "serie_id", "INT NULL");
  for (const [nome, col] of [["idx_conteudo_ped_turma", "treinamento_id"], ["idx_conteudo_ped_serie", "serie_id"]]) {
    try { await pool.query(`ALTER TABLE conteudo_pedidos ADD INDEX ${nome} (${col})`); }
    catch (e) { if (!/duplicate key name/i.test(e.message || "")) throw e; }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conteudo_tbt_dispensas (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id     INT NULL,
      treinamento_id INT NOT NULL,
      motivo         VARCHAR(300) NULL,
      usuario_id     INT NULL,
      usuario_nome   VARCHAR(150) NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_conteudo_dispensa (treinamento_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("  ↳ produção de conteúdo: ok");
}

module.exports = { runMigrations };
