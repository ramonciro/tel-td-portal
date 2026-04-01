# Pacote - Acesso individual ao Oceano do Desenvolvimento

## O que este pacote entrega
- liberação individual da página Oceano do Desenvolvimento
- controle por pessoa, sem criar cargo novo
- proteção do menu e das rotas do backend
- campo novo na Gestão de Usuários

## Aplicação
1. Execute no Railway o arquivo `database/migrations/2026-04-01_acesso_oceano_usuarios.sql`.
2. Suba os arquivos alterados do backend e frontend.
3. Edite os usuários desejados e marque `Acesso ao Oceano do Desenvolvimento = Liberado`.

## Regra de acesso
A página só fica disponível quando:
- o perfil for `coordenador` ou `superintendente`;
- e a flag `pode_acessar_oceano_desenvolvimento` estiver igual a 1.
