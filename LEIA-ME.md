[LEIA-ME.md](https://github.com/user-attachments/files/32116222/LEIA-ME.md)
# Hotfix — vazamento de usuários entre tenants no painel super-admin

**Prioridade: alta.** Isso é um bug de segurança/isolamento multi-tenant
real, não uma melhoria — encontrado a partir do print que você mandou da
tela do tenant "Dasa Front" mostrando 26 usuários, incluindo gente de
outras empresas.

## O que estava acontecendo

Na tela `/admin/empresa/[id]` (gestão de um tenant específico), a lista de
"Usuários" vem de uma consulta em `adminController.getEmpresa` que busca só
os usuários daquele tenant (`WHERE empresa_id = ?`). Se essa consulta
falhasse por qualquer motivo, o código tinha um fallback antigo — de antes
do multi-tenant existir — que caía numa segunda consulta **sem nenhum
filtro de tenant**, listando os usuários de **todas** as empresas
cadastradas na plataforma. Foi exatamente isso que apareceu como "26
usuários" na tela do tenant novo "Dasa Front": esse número bate com o
total de usuários da plataforma inteira, não com os usuários do Dasa.

O fallback também não registrava o erro original em log nenhum
(`catch (_) {}`), então não tinha como saber pelo Railway por que a
consulta principal estava falhando.

Reproduzi o cenário localmente (simulando a mesma falha que deve estar
acontecendo em produção) e confirmei: com o código antigo, isso realmente
vaza usuários de outros tenants; com a correção abaixo, mesmo forçando a
mesma falha, cada tenant continua vendo só os próprios usuários.

## O que foi corrigido

**1 arquivo:** `backend/src/controllers/adminController.js`, função
`getEmpresa`.

- Removido o fallback sem filtro de tenant. Agora, se a consulta principal
  falhar, a segunda tentativa **mantém sempre** `WHERE empresa_id = ?` —
  só remove uma coluna opcional (`criado_em`) que pode não existir em
  algum ambiente. Nunca lista usuário de outro tenant.
- Se mesmo essa segunda tentativa falhar, a tela mostra a lista vazia
  ("Nenhum usuário cadastrado") em vez de arriscar vazar dado — e agora
  isso fica registrado no log do Railway com o erro real, para dar pra
  investigar a causa raiz se acontecer de novo.

## Causa raiz ainda em aberto

Não tenho acesso direto ao banco de produção para confirmar 100% por que
a consulta principal estava falhando lá (só verifiquei isso pelos logs
do Railway e pelo comportamento observado — o log do fallback antigo não
registrava o erro, então não tem histórico para consultar). A hipótese mais
provável, dado o padrão do restante do código, é uma divergência de schema
entre ambientes (algo como a coluna `criado_em` de `usuarios` existir no
banco de teste mas não em produção, ou vice-versa) — o mesmo tipo de
divergência que já apareceu antes neste projeto (ex.: `link_arquivo` em
`materiais_avaliativos`). Com o log novo, se a falha acontecer de novo
depois de aplicar este hotfix, vai aparecer no Railway com a mensagem de
erro exata do MySQL, e aí dá pra corrigir a causa raiz também (rodando a
migration que falta, por exemplo) — mas o vazamento em si já para de
acontecer com esta correção, independente da causa raiz.

## Como aplicar

Substitua `backend/src/controllers/adminController.js` pelo arquivo deste
pacote. Nenhuma migração de banco, variável de ambiente ou mudança de
frontend é necessária — é só esse arquivo do backend.

## O que já foi testado antes de entregar

- Reproduzi a falha original localmente: renomeei temporariamente a coluna
  `criado_em` da tabela `usuarios` no banco de teste (forçando o mesmo tipo
  de erro que deve estar acontecendo em produção) e confirmei que, com o
  código corrigido, a tela de cada tenant continua mostrando **só** os
  usuários daquele tenant — testei os dois tenants de teste e nenhum viu
  usuário do outro.
- Conferi que o log agora registra o erro real (`Unknown column
  'criado_em' in 'SELECT'`), em vez de ficar em silêncio.
- Restaurei o schema de teste e confirmei que o caminho normal (sem erro
  nenhum) continua funcionando exatamente como antes, com todos os campos
  (incluindo `criado_em`) retornando certo.
