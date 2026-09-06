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

    console.log("✅ Migrações executadas com sucesso no MySQL!");
  } catch (error) {
    console.error("❌ Erro ao rodar migrações automáticas no MySQL:", error);
    throw error;
  }
}

module.exports = { runMigrations };
