# Pacote: Página /capacidade (Capacidade x Realizado)

Este pacote contém os arquivos **novos/alterados** para adicionar a página
`/capacidade` ao portal, conforme solicitado ("pode seguir com os demais
ajustes... Dou liberdade para ajustar layout dentro dos parâmetros do
portal, mantendo as cores do portal").

Este pacote é a **continuação** do pacote anterior
(`entrega_calculos_TD_2026-08-26.zip`). Os arquivos de backend
(`horasResolver.js`, `capacidadeResolver.js`, `capacidadeController.js`,
rotas em `index.js`) **já foram entregues e validados** no pacote anterior
— não estão repetidos aqui.

## O que tem aqui

```
frontend/
  app/
    capacidade/
      page.js            <- NOVO: a página em si
  components/
    PortalShell.js        <- ALTERADO: adiciona o item "Capacidade" no menu lateral
README.md                 <- ALTERADO: documentação atualizada
_diffs/
  PortalShell.js.diff      <- diff exato da alteração no PortalShell (é só 1 linha nova)
```

## Como aplicar no seu ambiente

1. Copie `frontend/app/capacidade/page.js` para o mesmo caminho no seu
   projeto (pasta nova, não existia antes).
2. Abra `_diffs/PortalShell.js.diff` para ver a única mudança necessária
   no seu `frontend/components/PortalShell.js` (adiciona uma linha no
   array `menuItems`, logo depois do item "Dashboard"):
   ```js
   { href: "/capacidade", label: "Capacidade", icon: "📐", roles: ["coordenador", "supervisor"] },
   ```
   Ou simplesmente substitua o arquivo completo (`frontend/components/PortalShell.js`
   incluído aqui) se preferir.
3. Rode `npm run build` na pasta `frontend/` para confirmar que compila.
4. Reinicie o frontend e acesse `/capacidade` logado como coordenador
   ou supervisor (o item vai aparecer no menu lateral com o ícone 📐).

## O que a página mostra

- **Filtros**: ano, mês, instrutor.
- **Resumo (KpiStrip)**: horas realizadas, capacidade total, ocupação
  geral, quantidade de instrutores no recorte.
- **Capacidade x Realizado — Instrutor x Mês**: barra de progresso por
  instrutor (horas realizadas / capacidade do mês), indicando quando a
  capacidade veio de ajuste manual ("· ajuste manual").
- **Realizado por instrutor**: ranking em gráfico de barras horizontais.
- **Evolução — últimos 6 meses**: gráfico de linha comparando horas
  realizadas x capacidade mês a mês.
- **Painel "⚙️ Regra automática"** (botão no topo): permite ajustar a
  regra padrão de capacidade (horas/dia, HC/dia, se conta domingo).
- **Painel "+ Ajustar capacidade manual"** (botão no topo): permite
  cadastrar/remover um override manual de capacidade para um instrutor
  em um mês específico (tem prioridade sobre o cálculo automático).
- **Tabela detalhada**: todas as colunas (previsto, realizado, dias,
  capacidade, origem, ocupação, saldo) por instrutor.

## Importante sobre o visual

A página foi construída **reaproveitando 100% dos componentes e cores já
existentes no portal** (`lib/theme.js`, `PortalShell`, `PageHero`,
`SectionCard`, `KpiStrip`, `ProgressStat`, gráficos de `Charts.js`) —
não foi criado nenhum componente visual novo do zero. Isso significa que
a página segue a mesma identidade visual (navy + coral) das demais telas
do portal, como pedido.

## Verificação já feita aqui no sandbox

- ✅ `npm run build` completou com sucesso, rota `/capacidade` compilada
  sem erros (5.92 kB).
- ✅ A rota responde HTTP 200 com o HTML correto (confirmado via curl).
- ⚠️ **Não foi possível confirmar visualmente** com navegador automatizado
  porque a página exige login (mesma trava de autenticação das outras
  telas do portal) — isso é esperado e não é um defeito. Por favor,
  entre no portal com seu usuário coordenador/supervisor e acesse
  `/capacidade` pelo menu lateral para conferir visualmente.

## Se encontrar algo estranho

Me avise o que apareceu (print de tela ajuda bastante) e eu corrijo.
