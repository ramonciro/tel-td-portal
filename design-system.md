# Design System — Portal T&D

**Data:** 06/09/2026

Este documento existe para que qualquer tela nova (ou redesign de tela antiga) siga o mesmo padrão visual, em vez de cada página inventar sua própria cor, espaçamento ou ícone. A fonte da verdade fica em código, em `frontend/lib/theme.js` — este documento explica o que tem lá e por quê, e as regras de uso que o código sozinho não deixa óbvias.

## De onde vem a identidade visual

O logo do portal (`frontend/public/logo-td.png`) é uma rede de nós conectados — um cérebro com sinapses — num gradiente de azul para âmbar, sobre fundo navy. Extraí essas três cores por amostragem de pixel direto do arquivo (não é uma escolha arbitrária):

- **Navy** (fundo do ícone): `#0B1220` — já era o navy usado no chrome do portal (sidebar, cabeçalho), mantido.
- **Azul** (metade da rede de nós): `≈#296AC2` — muito próximo do azul que o portal já usava como cor primária (`#2563EB`), mantido sem alteração.
- **Âmbar/laranja** (a outra metade da rede de nós): `≈#E19F3B` — este é o ajuste real: o portal usava um coral (`#FF6B4A`) que não correspondia à cor de verdade do logo.

## Cores — `frontend/lib/theme.js`

Import: `import { colors, brandGradient, brandGradientDark, radius, chart } from "../lib/theme"`.

- `colors.navy` / `colors.navySoft` — chrome do portal (sidebar, header de destaque). Nunca usar em texto de conteúdo.
- `colors.primary` / `colors.primaryLight` — ação primária secundária, links, ícones informativos.
- `colors.accent` (`#D97706`) — botão de ação principal (o "botão laranja" que já existia em ~25 telas). Escolhido mais fechado que o âmbar puro do logo porque é usado como fundo com texto branco por cima — contraste ~3.2:1, melhor que o coral anterior (~2.5:1), mas **ainda abaixo do ideal de 4.5:1 do WCAG AA para texto pequeno**. Ver "Pendência de acessibilidade" abaixo.
- `colors.accentBright` (`#F59E0B`) — o âmbar vivo de verdade, igual ao do logo. Usar só onde não há texto por cima direto (ponto decorativo, ícone, fatia de gráfico, fundo suave, destaque de "Super Admin"). Não usar como fundo de botão com texto branco.
- `colors.success` / `warning` / `danger` / `info` / `neutral` (+ suas variações `Light`/`Text`) — **exclusivos para estado semântico** (status de turma, badge de presença, aderência). Nunca usar para decoração — se está verde, tem que significar "bom".
- `chart.*` — paleta para métricas sem semântica de bom/ruim (barras, séries), quando `success/warning/danger` não se aplicam.
- `brandGradient` / `brandGradientDark` — o gradiente azul→âmbar (ou navy→azul→âmbar) do logo, usado no `PageHero` (cabeçalho de toda página) e em qualquer destaque grande de tela. Não recriar um gradiente novo por página — sempre importar daqui.

### Pendência de acessibilidade

`colors.accent` como fundo de botão com texto branco fica em ~3.2:1 de contraste — passa WCAG AA para texto grande/negrito, mas fica abaixo do ideal para texto pequeno normal. A alternativa seria usar `colors.primary` (azul, ~4.6:1 de contraste, dentro do AA) como cor de botão principal, mas isso muda a identidade visual estabelecida em todo o portal. Deixo como decisão para você: manter o laranja de marca com esse contraste (comum em portais corporativos, ainda legível) ou migrar os botões principais para azul. Não decidi isso sozinho porque muda a cara do produto.

## Ícones

Os ícones de menu deixaram de ser emoji (📊 🎯 🧭 ...) e passaram a ser um conjunto de linha único em `frontend/components/icons.js` — mesmo traço (1.8px), mesmo tamanho, sem preenchimento, cor herdada do texto ao redor (`currentColor`). Motivo: emoji muda de aparência conforme o sistema operacional/fonte de quem está olhando (o emoji que você vê no seu computador não é o mesmo que aparece no celular do instrutor), então nunca fica de fato consistente — e o próprio `Portal T&D.docx` já definia "nunca exagerar em emojis".

Regra: qualquer ícone novo de **navegação** (menu, cabeçalho de seção, botão) usa esse conjunto — para adicionar um, é um novo path SVG em `icons.js`. Os emojis de **status** que já existiam antes desta rodada (🟢🟡🔴⚪ na tela de Capacidade, ✅ em alertas do Dashboard) não foram tocados — esses carregam significado direto (o próprio semáforo de ocupação da planilha original) e são um caso diferente de "ícone decorativo".

## Regras de página

Já eram as regras do `Portal T&D.docx` — reforçando porque valem para qualquer tela nova:

- Toda página usa `PageHero` como cabeçalho (título + descrição curta + ação principal + filtros), nunca um `<h1>` solto.
- Nenhuma tela deve parecer uma planilha. Se uma tela é só uma tabela genérica de CRUD (o portal ainda tem 3 dessas — `clientes`, `biblioteca`, `nps` global, usando um componente antigo chamado `CrudPageV2`), ela está pendente de redesign.
- Espaçamento em múltiplos de 4px (`radius.sm/md/lg/pill` e a função `spacing(n)` já fazem isso — evitar números soltos tipo `padding: 13px`).
- Card com sombra (`card` em `theme.js`) para destaque; card sem sombra (`cardFlat`) para listas densas onde a sombra repetida pesaria.

## O que ainda não foi padronizado (próximos passos)

- As 3 telas em `CrudPageV2` (`clientes`, `biblioteca`, `nps`) — redesign pendente, fora do escopo desta rodada.
- Boa parte das páginas ainda define cor/espaçamento inline em vez de importar de `theme.js` — a migração é gradual: qualquer tela que for mexida por outro motivo deve aproveitar para importar os tokens em vez de manter hex codes soltos.
