ALTER TABLE usuarios
ADD COLUMN pode_acessar_oceano_desenvolvimento TINYINT(1) NOT NULL DEFAULT 0;

UPDATE usuarios
SET pode_acessar_oceano_desenvolvimento = 0
WHERE pode_acessar_oceano_desenvolvimento IS NULL;
