# Relatório — Arquitetura multi-ambiente: seleção de empresa no login (parte 1)

**Data:** 10/09/2026
**Escopo:** Primeira entrega da direção "arquitetura multi-ambiente com seleção por login (começando pelo Comércio, depois IBM e Dasa)" — reconhecimento de empresa/tenant na tela de login, com marca aplicada e validação de pertencimento.

## Descoberta antes de construir

Ao levantar os dados de produção pra planejar esta entrega, encontrei que a arquitetura multi-ambiente já estava em andamento, sem eu saber:

- A tabela `empresas` já tem duas linhas reais: **"Tel Centro de Contatos"** (código `comercio`) e **"Dasa Front"** (código `dasa`), esta última com um coordenador real já cadastrado — João Lobo, joao.lobo@teltd.com. As duas foram criadas pelo assistente "Novo Tenant" que já existe no seu painel admin (`/admin/nova-empresa`), com um schema bem mais rico do que o `migrate.js` versionado documentava (plano, limites, contato, subdomínio, cor da marca, logo) — mais um caso do padrão de "coluna/tabela criada direto em produção, sem migração versionada" que já apareceu antes (Biblioteca, avaliações de treinando, trilhas).
- Isso significa que a **Fase 4** (isolamento multi-tenant, entregue antes desta) já estava protegendo dados reais de dois tenants em produção — o Dasa Front não era um cenário hipotético futuro, já existia quando eu corrigi aquelas 15 brechas.
- Os campos de subdomínio (`comercio.teltd.com`, `dasa.teltd.com`) já estão salvos no banco, mas o DNS desses endereços hoje resolve pra uma página de estacionamento do registrador — não estão de fato apontados pro Vercel.
- Achado à parte, sem relação com isolamento: o registro do "Dasa Front" tem um campo `cliente: "Claro"` preenchido, que não faz sentido numa linha de tenant (esse campo é usado em outras tabelas pra indicar o cliente de uma turma). Não mexi nisso — fica pra você conferir esse tenant no painel admin quando puder.

Com você confirmando "seletor no próprio app" como caminho (em vez de depender do DNS dos subdomínios, que está fora do meu alcance), a entrega abaixo cobre a seleção de ambiente sem exigir nenhuma mudança de infraestrutura da sua parte.

## O que foi entregue

**Endpoint público de ambientes.** `GET /api/auth/ambientes` lista as empresas ativas com o que é seguro mostrar antes de qualquer login: nome, código, logo e cor. Nunca inclui contato, limites ou observações — isso continua restrito ao painel admin autenticado.

**Validação de empresa no login.** `POST /api/auth/login` aceita um campo opcional `empresa_codigo`. Quando a tela de login envia esse campo (porque a pessoa escolheu uma empresa no seletor), o backend confere que a conta realmente pertence a ela antes de liberar:
- Empresa certa → login normal.
- Empresa errada → erro claro: `Este e-mail não pertence ao ambiente "X". Verifique se selecionou a empresa certa.`
- Conta sem empresa vinculada (legado) tentando entrar com uma empresa selecionada → mensagem orientando a contatar o coordenador, em vez de um erro genérico.
- Super admin nunca é bloqueado por essa checagem — ele não pertence a uma empresa específica, por desenho, e continua entrando em qualquer ambiente selecionado ou nenhum.
- Login sem `empresa_codigo` (app antigo, ou API chamada diretamente) continua funcionando exatamente como antes — retrocompatível.

Vale registrar: como o e-mail já é único no sistema inteiro, essa checagem não é uma segunda camada de isolamento de dado (isso já está resolvido desde a Fase 4) — é clareza de experiência: em vez da pessoa entrar por engano no ambiente errado e ver um dashboard vazio ou confuso, ela recebe um aviso direto na hora do login.

**Tela de login com seletor de ambiente.** Ao carregar, a tela busca a lista de ambientes. Com duas ou mais empresas ativas, aparece um primeiro passo "Qual é a sua empresa?" com um cartão por empresa (logo, se cadastrado, e nome); ao escolher, o formulário de e-mail/senha ganha a identidade daquela empresa — nome, cor de destaque no botão, logo no painel lateral — com um aviso "Entrando em [Empresa]" e um link para trocar. Um link "Não sei / continuar só com e-mail" pula a etapa pra quem preferir. Com zero ou uma empresa cadastrada, o seletor nem aparece — vai direto pro formulário, idêntico ao comportamento de hoje, então isso nunca atrapalha um ambiente que ainda não tem um segundo tenant configurado.

**Schema versionado.** As colunas de `empresas` (código, plano, limites, contato, subdomínio, cor, logo, observações, custo por hora) e a tabela `planos` — que só existiam em produção, aplicadas manualmente — agora entram no `migrate.js`, então qualquer ambiente novo (um teste seu, ou uma futura recriação de banco) sobe com o schema completo que o painel "Novo Tenant" já espera. Empresas existentes sem código ganham um automaticamente, derivado do nome.

## Como foi testado

- Login com empresa certa, empresa errada, sem seleção nenhuma, conta legada com empresa selecionada, e super admin — todos os cenários confirmados via chamadas HTTP reais contra um ambiente com duas empresas de teste.
- Front-end verificado num navegador de verdade: seletor aparece com 2+ empresas, pula direto pro formulário com 0/1, marca aplicada corretamente ao escolher, fluxo completo até a tela `/inicio`, e a mensagem de erro ao escolher a empresa errada — capturas de tela inclusas no pacote.
- `next build` limpo (39/39 rotas).
- As 12 verificações automatizadas de isolamento multi-tenant da Fase 4 e a regressão das telas centrais foram re-executadas depois desta mudança (login é um caminho compartilhado por todo o portal) — todas passando.

## Próxima parte, quando fizer sentido

- Aplicar a marca da empresa (cor, logo) no restante do portal depois do login — hoje `PortalShell` continua com a identidade visual padrão do Tel T&D independentemente de qual empresa a pessoa está. A base pra isso já existe no banco.
- Preencher `logo_url` e uma `cor_primaria` própria para "Tel Centro de Contatos" e "Dasa Front" — hoje as duas usam a cor padrão do formulário (#FF6B4A).
- Limpar `getSelectedClient`/`setSelectedClient`/cabeçalho `X-Client-ID` em `services/api.js` — código de uma tentativa anterior de multi-tenant por header, hoje enviado em toda chamada mas nunca lido pelo backend, e nunca de fato definido pela UI. Inofensivo, mas confunde quem for mexer nessa área depois.
- Conferir/corrigir o campo `cliente: "Claro"` estranho no registro do "Dasa Front".
- Quando o DNS dos subdomínios estiver apontado pro Vercel, dá pra evoluir o mesmo mecanismo pra detectar a empresa automaticamente pelo endereço acessado, sem descartar nada do que foi construído aqui.
