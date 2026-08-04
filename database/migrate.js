const db = require('../config/database');

async function runMigrations() {
  try {
    console.log('🔄 Verificando e aplicando migrações no banco de dados...');

    // 1. Tabela de Empresas (Multi-tenant - BR-100)
    await db.query(`
      CREATE TABLE IF NOT EXISTS empresas (
          id SERIAL PRIMARY KEY,
          nome VARCHAR(150) NOT NULL,
          cnpj VARCHAR(20) UNIQUE,
          ativo BOOLEAN DEFAULT TRUE,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabela de Usuários (BR-100, BR-101, BR-102)
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          nome VARCHAR(150) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          senha_hash VARCHAR(255) NOT NULL,
          perfil VARCHAR(50) NOT NULL DEFAULT 'Instrutor',
          ativo BOOLEAN DEFAULT TRUE,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabela de Necessidades de Treinamento (BR-200 a BR-204)
    await db.query(`
      CREATE TABLE IF NOT EXISTS necessidades (
          id SERIAL PRIMARY KEY,
          empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          titulo VARCHAR(200) NOT NULL,
          descricao TEXT,
          cliente_interno VARCHAR(150) NOT NULL,
          prioridade VARCHAR(20) DEFAULT 'Média',
          status VARCHAR(50) DEFAULT 'Pendente',
          criado_por INT REFERENCES usuarios(id),
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Tabela de Turmas (BR-300 a BR-304, ADR-001 - Necessidade opcional)
    await db.query(`
      CREATE TABLE IF NOT EXISTS turmas (
          id SERIAL PRIMARY KEY,
          empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          necessidade_id INT REFERENCES necessidades(id) ON DELETE SET NULL,
          nome VARCHAR(200) NOT NULL,
          cliente VARCHAR(150) NOT NULL,
          instrutor_id INT NOT NULL REFERENCES usuarios(id),
          data_inicio TIMESTAMP NOT NULL,
          data_termino TIMESTAMP NOT NULL,
          status VARCHAR(50) DEFAULT 'Planejadas',
          criado_por INT REFERENCES usuarios(id),
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Tabela de Participantes e Vínculos (BR-400 a BR-402)
    await db.query(`
      CREATE TABLE IF NOT EXISTS participantes (
          id SERIAL PRIMARY KEY,
          empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          nome VARCHAR(150) NOT NULL,
          cpf VARCHAR(14) UNIQUE,
          matricula VARCHAR(50),
          cargo VARCHAR(100),
          ativo BOOLEAN DEFAULT TRUE,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS turma_participantes (
          id SERIAL PRIMARY KEY,
          turma_id INT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
          participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE RESTRICT,
          inscrito_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(turma_id, participante_id)
      );
    `);

    // 6. Tabela de Presença (BR-500 a BR-502)
    await db.query(`
      CREATE TABLE IF NOT EXISTS presencas (
          id SERIAL PRIMARY KEY,
          turma_id INT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
          participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE RESTRICT,
          data_aula DATE NOT NULL,
          presente BOOLEAN DEFAULT FALSE,
          registrado_por INT REFERENCES usuarios(id),
          atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(turma_id, participante_id, data_aula)
      );
    `);

    // 7. Tabela de Evidências e Arquivos (BR-800, BR-801)
    await db.query(`
      CREATE TABLE IF NOT EXISTS evidencias (
          id SERIAL PRIMARY KEY,
          turma_id INT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
          tipo VARCHAR(50) NOT NULL,
          nome_arquivo VARCHAR(255) NOT NULL,
          caminho_storage VARCHAR(500) NOT NULL,
          enviado_por INT REFERENCES usuarios(id),
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Tabela de Auditoria (BR-900, BR-1202)
    await db.query(`
      CREATE TABLE IF NOT EXISTS auditoria_logs (
          id SERIAL PRIMARY KEY,
          empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
          usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
          tabela_afetada VARCHAR(100) NOT NULL,
          registro_id INT NOT NULL,
          acao VARCHAR(20) NOT NULL,
          dados_anteriores JSONB,
          dados_novos JSONB,
          data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Migrações aplicadas com sucesso pelo backend!');
  } catch (error) {
    console.error('❌ Erro ao aplicar migrações no banco de dados:', error);
    throw error;
  }
}

module.exports = { runMigrations };
