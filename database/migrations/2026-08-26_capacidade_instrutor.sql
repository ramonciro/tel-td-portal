-- Modelo de CAPACIDADE do instrutor — modelo híbrido:
--   1) capacidade_regra_padrao: regra automática global, usada quando
--      não houver override manual (ex.: 8h/dia útil).
--   2) capacidade_instrutor_mensal: overrides manuais opcionais, por
--      instrutor + mês/ano, quando o coordenador quiser ajustar a
--      capacidade-alvo daquele instrutor naquele mês específico
--      (ex.: férias, meio período, aumento de demanda etc.).
--
-- Cálculo final de capacidade de um instrutor em um mês:
--   SE existir override em capacidade_instrutor_mensal → usa ele.
--   SENÃO → calcula automaticamente: dias úteis do mês (seg-sáb, exceto
--   domingo, igual à regra de "dia não letivo" já usada no sistema)
--   × horas_dia_padrao, e HC_capacidade = dias úteis × hc_dia_padrao.

CREATE TABLE IF NOT EXISTS capacidade_regra_padrao (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  horas_dia_padrao DECIMAL(5,2) NOT NULL DEFAULT 6.00,
  hc_dia_padrao INT NOT NULL DEFAULT 30,
  considerar_domingo TINYINT(1) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO capacidade_regra_padrao (id, horas_dia_padrao, hc_dia_padrao, considerar_domingo)
SELECT 1, 6.00, 30, 0
WHERE NOT EXISTS (SELECT 1 FROM capacidade_regra_padrao WHERE id = 1);

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
