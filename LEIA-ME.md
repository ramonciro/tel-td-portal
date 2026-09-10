# Arquitetura multi-ambiente — seleção de empresa no login (parte 1)

Primeiro pacote da direção "arquitetura multi-ambiente com seleção por login" — a tela de login agora reconhece as empresas/tenants já cadastradas e deixa a pessoa escolher a sua antes de entrar, com a marca (nome/cor/logo) daquela empresa aplicada na hora.

## Descoberta importante antes de explicar o que foi feito

Ao levantar os dados de produção pra planejar isso, encontrei duas coisas que você precisa saber:

1. **Você já tem 2 empresas reais cadastradas no banco**, criadas pelo assistente "Novo Tenant" que já existe no painel admin: "Tel Centro de Contatos" (código `comercio`) e "Dasa Front" (código `dasa`, com o João Lobo já cadastrado como coordenador, e-mail joao.lobo@teltd.com). Ou seja, o Dasa já começou a ser onboardado antes mesmo de eu mexer nisso — e a Fase 4 (isolamento multi-tenant, entregue antes deste pacote) já estava protegendo os dados reais desses dois tenants, não só um cenário futuro hipotético.
2. **Reparei um dado estranho no registro do "Dasa Front"**: a própria linha da empresa tem um campo `cliente: "Claro"` preenchido, o que não faz sentido pra um registro de tenant (esse campo é usado em outras tabelas pra indicar o cliente de uma turma, não faz sentido numa linha de empresa). Não mexi nisso — só overwrite de dado que você não pediu — mas vale você dar uma olhada em Admin → Dasa Front pra confirmar se está tudo certo com esse tenant.

## O que foi feito

**Backend**
- `backend/src/routes/authRoutes.js`:
  - Novo endpoint público `GET /api/auth/ambientes` — lista as empresas ativas com o que é seguro mostrar antes do login (nome, código, logo, cor). Nunca expõe contato/limites/observações.
  - `POST /api/auth/login` agora aceita um campo opcional `empresa_codigo`. Quando enviado, confere que a conta realmente pertence àquela empresa antes de liberar o login — se a pessoa escolher a empresa errada, recebe um erro claro ("Este e-mail não pertence ao ambiente X") em vez de logar e ver um dashboard vazio ou confuso. Super admin nunca é bloqueado por essa checagem (ele não pertence a uma empresa específica, por desenho). Uma conta sem empresa vinculada (legado) recebe uma mensagem específica orientando a contatar o coordenador. **Totalmente retrocompatível**: login sem `empresa_codigo` continua funcionando exatamente como antes.
- `backend/src/database/migrate.js` (Item 25): as colunas de `empresas` que já existiam em produção mas nunca tinham migração versionada (código, plano, limites, contato, subdomínio, cor, logo, observações, custo/hora) agora são criadas automaticamente em qualquer ambiente novo — sem isso, um banco recém-criado (ex.: um ambiente de teste seu) não teria o schema completo que o painel "Novo Tenant" já usa há um tempo. Também versiona a tabela `planos` (que também só existia em produção) e adiciona um índice único em `empresas.codigo`. Empresas antigas sem código ganham um automaticamente, derivado do nome.

**Frontend**
- `frontend/app/login/page.js`: redesenhada. Ao carregar, busca `/api/auth/ambientes`. Com 2 ou mais empresas ativas, mostra um passo "Qual é a sua empresa?" com um cartão por empresa (logo + nome); ao escolher, o formulário de e-mail/senha ganha a marca daquela empresa (nome, cor de destaque, logo) e um aviso "Entrando em [Empresa]" com opção de trocar. Com 0 ou 1 empresa cadastrada, o seletor nem aparece — vai direto pro formulário, exatamente como hoje, então isso nunca atrapalha um ambiente que ainda não tem um segundo tenant. Um link "Não sei / continuar só com e-mail" pula a seleção pra quem preferir.

## Por que "seletor no app" e não subdomínio de verdade

Os campos de subdomínio (`comercio.teltd.com`, `dasa.teltd.com`) já existem no banco, mas o DNS desses endereços hoje aponta pra uma página de estacionamento do registrador, não pro Vercel. Fazer `dasa.teltd.com` abrir o portal de verdade exige você configurar isso no seu provedor de domínio e cadastrar o domínio no Vercel — trabalho fora do que eu alcanço por código. O seletor no app entrega o objetivo (cada empresa entra no ambiente certo, com a marca certa) sem depender disso, e o caminho fica aberto: quando o DNS estiver pronto, dá pra detectar automaticamente a empresa pelo endereço acessado, sem jogar fora nada do que foi construído agora.

## O que fica para uma próxima parte (não incluído neste pacote)

- Aplicar a marca da empresa (cor, logo) no resto do portal depois do login (hoje o menu/cabeçalho continuam com a identidade visual padrão do Tel T&D) — a base para isso já existe no banco (`cor_primaria`, `logo_url`), só falta o `PortalShell` consumir isso.
- Um código sem uso que encontrei enquanto mexia nisso: `services/api.js` já tem funções `getSelectedClient`/`setSelectedClient` e manda um cabeçalho `X-Client-ID` em toda chamada — mas o backend nunca lê esse cabeçalho em lugar nenhum, e `setSelectedClient` nunca é chamado por ninguém. Parece resquício de uma tentativa anterior de multi-tenant por header, abandonada. Não removi agora (é inofensivo, só ocupa espaço), mas fica registrado pra uma limpeza futura.
- Preencher `logo_url`/`cor_primaria` de verdade para "Tel Centro de Contatos" e "Dasa Front" — hoje só a cor padrão (`#FF6B4A`) está definida; o formulário de editar empresa no admin já aceita esses campos.

## Como aplicar

1. Substituir os 3 arquivos acima nos mesmos caminhos do seu repositório.
2. Commit + push (Railway/Vercel fazem o deploy automático).
3. Nenhuma variável de ambiente nova é necessária.
4. A migração roda automaticamente no boot do backend — vai completar o schema de `empresas` e criar a tabela `planos` se ainda não existirem (ambos já existem em produção, então lá isso não faz nada; importante pra qualquer ambiente novo/de teste).

## Como foi testado

- Ambiente local com duas empresas de teste — login com empresa certa (200), empresa errada (403 com mensagem clara), sem seleção nenhuma (200, retrocompatível), conta sem empresa vinculada com uma empresa selecionada (403 com mensagem específica), e super admin (login liberado independente da empresa escolhida).
- Front-end testado num navegador de verdade (Playwright): seletor aparece corretamente com 2+ empresas, pula direto pro formulário com 0/1 empresa, marca (nome + cor) aplicada ao escolher uma empresa, fluxo completo de login até a tela `/inicio`, e a tela de erro quando a empresa errada é escolhida — capturas de tela em anexo.
- `next build` limpo (39/39 rotas) antes da entrega.
- Re-rodei as 12 verificações de isolamento multi-tenant da Fase 4 e a regressão das telas centrais depois dessa mudança (login é um caminho compartilhado por tudo) — todas passando, sem quebras.
