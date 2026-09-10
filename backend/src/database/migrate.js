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
        empresa_id      INT NULL DEFAULT 1,
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
        empresa_id               INT NULL DEFAULT 1,
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
        empresa_id                  INT NULL DEFAULT 1,
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
        empresa_id               INT NULL DEFAULT 1,
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
        empresa_id  INT NULL DEFAULT 1,
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
        empresa_id    INT NULL DEFAULT 1,
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
        empresa_id            INT NULL DEFAULT 1,
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
        empresa_id  INT NULL DEFAULT 1,
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

    console.log("✅ Migrações executadas com sucesso no MySQL!");
  } catch (error) {
    console.error("❌ Erro ao rodar migrações automáticas no MySQL:", error);
    throw error;
  }
}

module.exports = { runMigrations };
