// src/database/migrate.js
const fs = require("fs");
const path = require("path");
const pool = require("../lib/db");

/**
 * Divide os arquivos SQL atuais em statements simples.
 * As migrations do projeto usam ';' como delimitador e não possuem
 * procedures/triggers que exijam um parser completo.
 */
function splitSqlStatements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Normaliza sintaxes de IF NOT EXISTS que podem não ser suportadas pela
 * versão do MySQL utilizada no Railway. O runner trata a tentativa repetida
 * como idempotente pelos códigos de erro do MySQL.
 */
function normalizeMigrationStatement(statement) {
  return statement
    .replace(/ALTER\s+TABLE\s+([`\w.]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i, "ALTER TABLE $1 ADD COLUMN ")
    .replace(/ALTER\s+TABLE\s+([`\w.]+)\s+ADD\s+CONSTRAINT\s+IF\s+NOT\s+EXISTS\s+/i, "ALTER TABLE $1 ADD CONSTRAINT ")
    .replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+/i, "CREATE INDEX ");
}

/**
 * Alguns Sprints foram escritos para execução manual e podem encontrar uma
 * coluna, índice, tabela ou constraint que já exista no banco. Esses erros
 * são seguros de ignorar durante uma migration idempotente.
 */
function isSafeAlreadyAppliedError(error) {
  const safeCodes = new Set([
    "ER_DUP_FIELDNAME",
    "ER_DUP_KEYNAME",
    "ER_DUP_KEY",
    "ER_DUP_ENTRY",
    "ER_TABLE_EXISTS_ERROR",
    "ER_FK_DUP_NAME",
  ]);

  if (safeCodes.has(error?.code)) return true;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("duplicate column") ||
    message.includes("duplicate key name") ||
    message.includes("duplicate constraint") ||
    message.includes("already exists")
  );
}

async function ensureMigrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function hasMigration(migration) {
  const [rows] = await pool.query(
    "SELECT id FROM schema_migrations WHERE migration = ? LIMIT 1",
    [migration]
  );
  return rows.length > 0;
}

async function executeSqlMigration(fileName) {
  const migrationPath = path.resolve(
    __dirname,
    "../../../database/migrations",
    fileName
  );

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Arquivo de migration não encontrado: ${migrationPath}`);
  }

  if (await hasMigration(fileName)) {
    console.log(`⏭️  Migration já aplicada: ${fileName}`);
    return;
  }

  console.log(`▶️  Aplicando migration: ${fileName}`);

  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = splitSqlStatements(sql);

  for (const rawStatement of statements) {
    const statement = normalizeMigrationStatement(rawStatement);

    try {
      await pool.query(statement);
    } catch (error) {
      if (isSafeAlreadyAppliedError(error)) {
        console.warn(
          `⚠️  Ignorando alteração já existente em ${fileName}: ${error.message}`
        );
        continue;
      }

      throw new Error(
        `Falha na migration ${fileName}: ${error.message}\nSQL: ${statement.slice(0, 500)}`
      );
    }
  }

  await pool.query(
    "INSERT INTO schema_migrations (migration) VALUES (?)",
    [fileName]
  );

  console.log(`✅ Migration concluída: ${fileName}`);
}

async function runSqlMigrations() {
  await ensureMigrationTable();

  // Pré-requis legado do Sprint 1. Ele existe separado dos Sprints e cria
  // necessidades_treinamento, tabela usada pelo Sprint 1.
  const migrations = [
    "2026-07-18_necessidades_treinamento.sql",
    "sprint1_multi_tenant.sql",
    "sprint2_fix_biblioteca.sql",
    "sprint3_lms_core.sql",
    "sprint4_saas_foundation.sql",
  ];

  for (const migration of migrations) {
    await executeSqlMigration(migration);
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

    // 6. Tabela de Participantes do Treinamento
    await pool.query(`
      CREATE TABLE IF NOT EXISTS treinamento_participantes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          treinamento_id INT NOT NULL,
          nome VARCHAR(150) NOT NULL,
          email VARCHAR(150),
          matricula VARCHAR(50),
          status VARCHAR(50) DEFAULT 'Inscrito',
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
      );
    `);

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

    // Sprints SQL versionados — executados uma única vez e registrados em
    // schema_migrations para que novos deploys do Railway sejam seguros.
    await runSqlMigrations();

    console.log("✅ Migrações executadas com sucesso no MySQL!");
  } catch (error) {
    console.error("❌ Erro ao rodar migrações automáticas no MySQL:", error);
    throw error;
  }
}

module.exports = { runMigrations };
