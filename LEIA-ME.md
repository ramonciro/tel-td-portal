# Pendências da Fase 4 (Biblioteca + regra de capacidade) e preparo do onboarding do IBM

Você pediu pra seguir com os itens 1 e 2: resolver as duas pendências da Fase 4, e continuar a arquitetura multi-ambiente. Os dois estão nesta entrega.

## 1. Biblioteca corrigida

A tela de Biblioteca estava quebrada porque a tabela que ela usa (`biblioteca`) nunca tinha sido criada em produção. Criei a tabela certa (sem o valor padrão perigoso que um fix antigo não-aplicado tinha) e corrigi mais dois pontos que ainda liam da tabela antiga por engano: o card "Biblioteca" do Dashboard e o Mural das turmas.

## 2. Regra de capacidade agora é por empresa

Antes, mudar a regra padrão de capacidade (horas/dia, headcount/dia) afetava todo mundo ao mesmo tempo. Agora cada empresa tem a sua — e qualquer tenant que ainda não configurou a própria (como o Dasa Front hoje, e como o IBM vai nascer) usa automaticamente o valor padrão global, sem nenhuma ação manual.

## 3. Painel admin ganhou campos de cor/logo (faltavam)

Descobri que o formulário de editar tenant não tinha onde preencher cor ou logo — só o backend aceitava, mas a tela não tinha os campos. Corrigido nas duas telas (criar e editar tenant), com seletor de cor visual e pré-visualização da logo. Agora você já pode preencher a cor/logo reais de Comércio e Dasa Front quando tiver esses dados — e o IBM já pode nascer com a marca certa desde a criação.

## 4. Onboarding do IBM testado de ponta a ponta

Sem ter os dados reais do IBM ainda, simulei o fluxo inteiro com um tenant de teste: criar → aparece no seletor de login → coordenador loga com a senha temporária → dashboard nasce zerado → regra de capacidade cai no padrão automaticamente → excluí o teste sem deixar resquício. Está tudo pronto pra quando você tiver os dados de contato do IBM.

## O que falta e depende de você

- Cor e logo reais de Comércio e Dasa Front (agora já dá pra preencher direto no painel admin).
- Dados de contato do IBM, quando for a hora do onboarding de verdade.

## Como aplicar

1. Substituir os arquivos deste pacote nos mesmos caminhos do seu repositório (backend: `migrate.js`, `capacidadeResolver.js`, `capacidadeController.js`, `dashboardRoutes.js`, `muralResolver.js`, `adminController.js`; frontend: `admin/nova-empresa/page.js`, `admin/empresa/[id]/page.js`).
2. Commit + push (deploy automático).
3. Nenhuma variável de ambiente nova. A migração cria a tabela `biblioteca` e a coluna nova de `capacidade_regra_padrao` automaticamente no boot do backend.

## Como foi testado

- 12 verificações de isolamento da Fase 4, 9 de regressão, 7 do login multi-ambiente — todas passando depois destas mudanças.
- 12 verificações novas cobrindo Biblioteca (isolamento por empresa em criar/listar/editar/excluir) e regra de capacidade por empresa.
- Teste manual do Mural confirmando que materiais aparecem corretamente.
- Simulação completa do onboarding do IBM, como descrito acima.
- As duas telas do painel admin testadas visualmente — capturas em anexo.
- `next build` limpo (39/39 rotas).
