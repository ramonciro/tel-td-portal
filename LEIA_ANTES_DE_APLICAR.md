# Correção — capacidade do instrutor (CH do mês) — 16/09/2026

Você apontou dois problemas na tela de Capacidade x Realizado: o valor fixo de 156h por instrutor não bate com o praticado, e o "HC" (headcount) não faz sentido como base de cálculo, já que turmas têm tamanhos diferentes.

## 1. Substituir estes 5 arquivos no seu repositório (mesmo caminho)

- `backend/src/services/capacidadeResolver.js`
- `backend/src/controllers/capacidadeController.js`
- `backend/src/controllers/atividadesInstrutorController.js`
- `backend/src/database/migrate.js`
- `frontend/app/capacidade/page.js`

## 2. O que muda

- **Cálculo da capacidade automática:** antes era "dias úteis do mês (contados no calendário, só excluindo domingo) × horas/dia" — isso dava ~26 dias, e com 6h/dia batia exatamente nos 156h que você viu. Agora é uma conta fixa: **dias trabalhados no mês × horas por dia trabalhado**, os dois configuráveis, sem depender do calendário de cada mês. Com o padrão que você passou (6h/dia, 22 dias/mês) a capacidade automática de cada instrutor fica em **132h/mês**.
- **HC saiu da conta e da tela:** o campo "HC (turmas) por dia" na regra padrão e "Capacidade (HC)" no ajuste manual por instrutor foram removidos — na prática eles nunca entravam em nenhum cálculo real de capacidade, só ficavam guardados e exibidos. As colunas continuam existindo no banco (sem migração destrutiva), só não são mais usadas.
- **Onde editar:** mesmo lugar de antes — tela **Capacidade x Realizado → "⚙ Configurar regra automática e exceções por instrutor"**. Lá tem duas opções:
  - **Regra automática padrão:** horas por dia trabalhado + dias trabalhados no mês. Isso já vem preenchido com 6h/22 dias, mas você pode ajustar a qualquer momento — a tela mostra ao lado quanto isso dá de capacidade mensal por instrutor.
  - **Ajuste manual por instrutor/mês:** pra quando um instrutor específico tem uma carga diferente da regra padrão naquele mês (licença parcial, redução, etc.) — sobrescreve só aquele instrutor naquele mês, sem mexer na regra geral.

## 3. Ação manual necessária

Nenhuma migração destrutiva, mas **é preciso conferir/ajustar a regra padrão depois de aplicar este pacote** — ela é criada com um valor herdado do que já estava configurado (ou 6h/22 dias se nunca foi configurada antes). Entre em Capacidade → Configurar regra e confirme se 6h/dia e 22 dias/mês são os números certos pra sua operação, ou ajuste.

## 4. O que foi testado

Ambiente local: ajustei a regra para 6h/22 dias e confirmei que a capacidade por instrutor no painel saiu exatamente 132h (antes: 156h); testei um ajuste manual por instrutor sem informar HC (não é mais pedido); testei que a listagem de ajustes não expõe mais HC; devolvi a regra do ambiente de teste ao valor que já estava antes de testar. `npm run build` do frontend rodou sem erros, todas as rotas geradas normalmente.
