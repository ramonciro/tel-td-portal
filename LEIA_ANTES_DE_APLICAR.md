# Correção Usuários + Período em Presenças — Leia antes de aplicar

## O que tem neste zip

2 arquivos, ambos para **substituir** o arquivo equivalente no repositório (mesmo caminho):

```
frontend/app/usuarios/page.js
frontend/app/presencas/page.js
```

Nenhuma mudança de backend, nenhuma migração — é só código de tela.

## 1. Por que a página Usuários "não mudou"

O Pacote 3 simplificou a paleta de cores dos badges de perfil, e isso já estava no ar. O que você
viu continuar inconsistente é outra coisa: a tela de Usuários só tinha cor/etiqueta cadastrada para
os 8 perfis que são criados por ali (Coordenador, Supervisor, Instrutor, etc.). Só que usuários do
módulo R&S — perfil `coordenador_rs` e `gestor_rs` — são criados por uma tela separada
(Configurações R&S) e aparecem nessa listagem geral igual a qualquer outro usuário. Como esses dois
perfis nunca tinham sido cadastrados nos mapeamentos de cor/etiqueta desta tela, eles caíam num
cinza quase invisível e ficavam de fora da contagem "Distribuição por perfil" — foi exatamente o
"Ciro" (coordenador_rs) aparecendo sem badge na sua captura de tela. Corrigido: os dois perfis agora
têm cor e etiqueta ("Coordenador R&S" / "Gestor R&S") como qualquer outro, e passam a contar na
distribuição por perfil.

## 2. Seleção de período em Presenças (Gestão de Turmas)

Adicionei dois campos de data ("Período: de ___ até ___") na barra de filtros da página Presenças,
ao lado do filtro de cliente e da busca. Selecionando um período, a lista de turmas, os cartões de
KPI (Turmas, Treinandos, Frequência média, CH realizada) e a exportação em Excel passam a considerar
só as turmas daquele intervalo — antes só dava pra exportar o histórico inteiro.

A regra usada é por sobreposição: uma turma entra no período se qualquer parte dela (do início ao
fim) cruzar com o intervalo escolhido — assim uma turma que começou num mês e terminou no seguinte
não some do relatório de nenhum dos dois. Testei com dados reais cobrindo abril a setembro de 2026
(mês único, trimestre, intervalo sem turmas, e intervalo aberto só com início ou só com fim) — todos
os casos retornaram exatamente as turmas esperadas.

O nome do arquivo exportado passa a indicar o período (ex.: `relatorio_presenca_2026-08-01_a_2026-08-31.xlsx`)
quando um período é selecionado, pra não confundir com uma exportação do histórico completo salva na
mesma pasta.

## Como aplicar

1. No GitHub, suba os 2 arquivos acima no mesmo caminho, substituindo os existentes.
2. O Vercel faz o deploy automático assim que o `main` for atualizado (não mexe no Railway/backend).

## O que testar depois do deploy

- Em **Gestão de Usuários**, confira se todo usuário aparece com um badge colorido (nenhum mais em
  cinza/sem cor), incluindo os do R&S se você tiver algum cadastrado.
- Em **Presenças**, selecione um período (ex.: um mês) e confira se os cartões de turma, os KPIs do
  topo e o Excel exportado batem só com aquele período. Limpe o período (botão "Limpar") e confirme
  que volta a mostrar tudo.
