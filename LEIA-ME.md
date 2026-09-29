[LEIA-ME.md](https://github.com/user-attachments/files/32806268/LEIA-ME.md)
# Pacote — Ocupação CH (opção 3) + redesign visual da Capacidade (29/09/2026)

## O que tem aqui

Dois pedidos do Ramon na mesma mensagem, os dois neste pacote:

1. **Opção 3 do diagnóstico de "Ocupação CH"** (confirmada por ele) — "% de
   ocupação" agora só existe para instrutor com **meta cadastrada**
   (ajuste manual, na tela de Capacidade). Quem não tem meta deixa de ser
   comparado contra o teto automático de 132h/mês (que nunca foi uma meta
   real) e passa a aparecer por **volume absoluto** (horas em sala / turmas).
2. **Redesign visual da tela de Capacidade** — menos tabela, mais gráfico,
   incluindo dois funis (um deles é exatamente o "funil" que o Ramon pediu).

## Arquivos deste pacote

- `backend/src/services/capacidadeResolver.js` — motor de cálculo. Mudança
  central: `getCapacidadeVsRealizado()` só devolve `capacidade_horas` e
  `ocupacao_pct` quando existe override; sem override, `tem_meta: false`,
  `capacidade_horas: null`, `ocupacao_pct: null`, e um novo campo `turmas`
  (contagem de turmas no período, pra dar volume junto da hora). A mudança
  se propaga por `getPainel`, `getCapacityConsumido`, `getRanking`,
  `getCapacidadePorInstrutorCliente` e `getAlertas` (alertas agora só
  consideram quem tem meta — sem isso, todo mundo sem meta viraria "alerta").
- `backend/src/services/desempenhoInstrutorResolver.js` — `getChPorInstrutor`
  (usado pelo Scorecard) segue a mesma regra; a média de ocupação do time
  (`medias_time.ocupacao_pct`) agora é automaticamente só de quem tem meta
  (o código já filtrava nulos), e ganhou `instrutores_com_meta`/
  `instrutores_com_atividade_ch` pra o front mostrar "de quantos" é essa
  média.
- `backend/src/controllers/capacidadeController.js` — `getCapacidade()`
  (endpoint `GET /api/capacidade`) separa os totais em com/sem meta.
- `frontend/app/capacidade/page.js` — redesign das duas abas (ver abaixo).

## O que muda pra você, na prática

- Instrutor **sem meta cadastrada**: em vez de "4,5% de ocupação" (o número
  que te preocupou), agora aparece como "6h em sala / 1 turma" — sem
  porcentagem nenhuma, porque não existe uma meta real pra comparar.
- Instrutor **com meta cadastrada** (ajuste manual): continua com % de
  ocupação normalmente, agora contra a meta que você mesmo definiu — essa
  é a única forma de alguém ter uma "%" nas telas.
- A regra automática (dias × horas/dia) **parou de ser aplicada
  automaticamente a ninguém** — vira só uma referência de cálculo pra te
  ajudar a decidir o valor de uma meta manual. Ela ainda existe e pode ser
  editada na configuração da tela, só não "vaza" mais como capacidade real
  de quem não configurou nada.
- Times/Scorecard com poucos ou nenhum instrutor com meta cadastrada vão
  mostrar "—" ou volume na maior parte das visões de ocupação — isso é
  esperado até que você cadastre metas manuais pra quem quiser comparar
  por %. É a mesma troca que você aprovou na opção 3: sem esforço de
  configuração extra agora, evoluindo depois pra metas por instrutor se
  quiser (era a opção 1 do diagnóstico original).

## O redesign visual (pedido: "muita planilha, mais gráficos, talvez um
funil, mais limpo e visual")

**Aba "Visão do time":**
- KPIs no topo reduzidos e honestos: tiraram-se os 3 cartões baseados no
  teto automático ("Capacidade nominal", "Capacidade mensal do time",
  "Capacidade/instrutor") — ficaram "Instrutores com meta cadastrada",
  "Ocupação (quem tem meta)", CH programada, CH realizada e Aderência geral.
- **Dois funis novos** (componente `Funil`, já existia em `Charts.js` mas
  nunca tinha sido usado): "Cobertura de meta de capacidade" (Instrutores
  ativos → Com meta cadastrada — mostra a lacuna de configuração) e
  "Aderência ao cronograma" (CH programada → CH realizada).
- O gráfico de linha "Capacidade × consumido" ficou só de quem tem meta
  (comparação de verdade) — a tabela redundante que tinha embaixo dele saiu.
- A tabela "Capacity x consumido por instrutor" virou dois gráficos de
  barra lado a lado — um com % de ocupação (só quem tem meta, colorido por
  faixa) e outro com volume em horas (quem não tem meta) — com a tabela
  completa disponível num "Ver tabela completa" recolhível, pra quem quiser
  o detalhe mês a mês.
- A tabela "Capacidade por instrutor × cliente" (uma matriz genuína,
  continua fazendo sentido como tabela) foi movida para um "Ver detalhe"
  recolhível, pra não competir visualmente com o resto.
- Ranking e Alertas (que já eram gráfico/lista) ganharam legendas que
  deixam claro quando é "sem meta cadastrada" em vez de mostrar "0%"
  enganoso.

**Aba "Scorecard por instrutor":**
- A tabela de ranking (a mesma do print que gerou a investigação) ganhou um
  gráfico de barras do índice geral no topo — a tabela completa (frequência,
  NPS, avaliação, ocupação) virou um "Ver tabela completa" recolhível.
  A coluna "Ocupação CH" mostra "Xh/Yt" em vez de "0,8%" pra quem não tem
  meta.
- Cartão "Ocupação média do time" agora informa "de quantos" instrutores
  (com atividade no período) essa média é calculada, deixando explícito
  que não é a média do time inteiro.
- Vendo um instrutor específico sem meta cadastrada, o cartão que antes
  mostrava "Ocupação (CH): —%" agora mostra "CH realizada (sem meta
  cadastrada): Xh / Y turma(s)".

## Validação

- Lógica de negócio testada localmente contra MariaDB (instrutor com
  override e instrutor sem override, mesma turma/cronograma real) —
  confirmado que quem tem meta mantém % correto e quem não tem vira
  volume sem %, em todas as funções agregadas (painel, ranking, capacity
  consumido, por-cliente, alertas, scorecard).
- `node --check` nos três arquivos de backend.
- Checagem de sintaxe JSX do arquivo de frontend (`esbuild`, sem toolchain
  completo do Next.js disponível neste ambiente).
- Não testado num navegador de verdade (sem Next.js rodando aqui) — vale
  dar uma olhada visual rápida depois de publicado, especialmente nos dois
  funis e nos gráficos de barra novos.

## Como aplicar

Mesmo fluxo de sempre: os arquivos abaixo substituem os equivalentes no
repositório (mesmo caminho relativo a partir da raiz do projeto):

```
backend/src/services/capacidadeResolver.js
backend/src/services/desempenhoInstrutorResolver.js
backend/src/controllers/capacidadeController.js
frontend/app/capacidade/page.js
```

Nenhuma migração de banco é necessária — usa as mesmas tabelas já
existentes (`capacidade_instrutor_mensal` para as metas manuais).
