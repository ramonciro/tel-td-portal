# Correção — ROI zerando "Pessoas impactadas" ao filtrar período

## O que estava errado

Na aba Indicadores → ROI, os campos "Pessoas impactadas", "Alcance da meta" e
"Custo estimado" vinham de `treinamentos.participantes_presentes` e
`treinamentos.participantes_previstos` — duas colunas estáticas que quase
nunca são preenchidas na operação real (só por lançamento manual avulso ou
pela importação legada de Excel, num punhado antigo de turmas). Qualquer
filtro de período que não caísse exatamente nessas poucas turmas antigas
zerava o indicador por inteiro — daí "selecionar mês perco pessoas
impactadas".

O restante da tela (Horas realizadas, cabeçalho, Dashboard) já usa dados
dinâmicos (cronograma/roster) e por isso nunca teve esse problema — só a
aba ROI ficou presa nas colunas antigas.

## O que foi corrigido

`backend/src/controllers/analyticsController.js` — `getRoi()` e a aba ROI de
`exportarIndicadores()` (exportação Excel) — passam a calcular:

- **Pessoas impactadas**: pessoas únicas (`COUNT(DISTINCT nome)`) a partir do
  roster real de `treinamento_participantes`, dentro do período/cliente
  filtrado — a mesma fonte que já é usada e validada no cabeçalho de
  Indicadores (participantes únicos).
- **Pessoas previstas**: total de matrículas/vagas registradas no roster no
  mesmo período — base de comparação para "Alcance da meta".

Nenhuma outra aba (Horas, NPS, Efetividade) foi tocada.

## Arquivo neste pacote

- `backend/src/controllers/analyticsController.js` (substituir o arquivo
  atual)

## Como testei

Validei a query nova contra dados sintéticos numa cópia local do banco:
turmas em abril e setembro/2026 com participantes cadastrados normalmente
(sem preencher as colunas antigas). A consulta antiga retornava 0 pessoas
impactadas em qualquer filtro de período (reproduzindo exatamente o que
você viu); a nova retorna corretamente 2 pessoas ao filtrar só setembro e 4
pessoas únicas na visão sem filtro. Sintaxe do arquivo também verificada.
