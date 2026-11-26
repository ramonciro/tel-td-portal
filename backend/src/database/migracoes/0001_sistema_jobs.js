// Tabela do registro das rotinas automáticas (tela "Saúde do sistema", O7).
// Antes era criada sob demanda dentro do código; agora é uma migração de verdade.
module.exports = {
  descricao: "Cria sistema_jobs (registro da última execução de cada rotina automática)",
  async up({ pool }) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sistema_jobs (
        chave VARCHAR(60) NOT NULL PRIMARY KEY,
        ultima_execucao_em DATETIME NULL,
        ultimo_ok_em DATETIME NULL,
        ok TINYINT(1) NOT NULL DEFAULT 1,
        duracao_ms INT NULL,
        resumo VARCHAR(500) NULL,
        erro VARCHAR(500) NULL,
        origem VARCHAR(30) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  },
};
