-- ATENÇÃO: antes de executar, rode o comando abaixo para ver os valores
-- atuais do ENUM e inclua TODOS eles na lista do ALTER TABLE:
--
--   SHOW CREATE TABLE usuarios;
--
-- O ALTER TABLE redefine o ENUM inteiro. Se omitir um valor existente,
-- registros com aquele perfil ficam inválidos.
--
-- Exemplo com os perfis típicos do Portal T&D — ajuste conforme necessário:

ALTER TABLE usuarios
  MODIFY COLUMN perfil
    ENUM(
      'instrutor',
      'coordenador',
      'supervisor',
      'admin',
      'super_admin',
      'coordenador_rs',
      'gestor_rs'
    ) NOT NULL DEFAULT 'instrutor';
