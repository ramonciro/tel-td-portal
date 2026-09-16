[Uploading LEIA_ANTES_DE_APLICAR.md…]()
# Correção — ocupação por CH poluída por NPS/avaliação + instrutores desligados — 16/09/2026

Você apontou três coisas depois do pacote anterior: NPS/avaliação ainda influenciavam a "ocupação por CH", instrutores que já saíram continuavam aparecendo em mais lugares, e a janela de 90 dias não tinha uma visão de só o mês atual.

## 1. Substituir estes 3 arquivos no seu repositório (mesmo caminho)

- `backend/src/services/capacidadeResolver.js`
- `backend/src/services/desempenhoInstrutorResolver.js`
- `frontend/app/capacidade/page.js` (se você já aplicou o pacote de capacidade de hoje mais cedo, esta versão substitui aquela — já inclui as duas mudanças)

## 2. O que estava errado

**Ocupação por CH puxada por NPS/avaliação:** a média de ocupação do time (mostrada no Scorecard e no resumo do Oceano) era calculada sobre "todo instrutor com algum dado no período" — e "algum dado" incluía ter uma turma com avaliação lançada ou NPS respondido, mesmo sem nenhuma hora real trabalhada. Isso acontecia, por exemplo, quando o instrutor tinha uma turma ainda **planejada** (nem começou) no mês: ela conta como "turma no período" pra avaliação, mas não conta como hora real de CH — só que ele ainda entrava na média de ocupação com 0%, puxando o número geral pra baixo sem motivo real. Corrigido: a média de ocupação agora só considera quem teve hora real de CH no período. Os outros indicadores (frequência, NPS, índice geral) continuam usando o critério mais amplo de antes, sem mudança.

**Instrutores que já saíram ainda apareciam:** a correção anterior (pacote de ontem) já tirava quem saiu do dropdown de filtro e dos alertas do mês atual, mas duas telas ainda mostravam: a visão "time todo" do Scorecard/Oceano (contava todo instrutor já conhecido, incluindo desligados) e a tabela "Capacity x consumido — por instrutor" (pré-cadastrava todo instrutor conhecido, então quem saiu há muito tempo e não tem nenhuma hora na janela aparecia com uma linha de 0h/0%). As duas foram corrigidas com o mesmo critério de sempre: só sai de quem está confirmadamente desligado (usuário inativo com perfil instrutor) E não tem nenhuma hora real no recorte — quem tem hora real (mesmo tendo saído depois) continua aparecendo normalmente, histórico intacto.

**Sem visão de mês, só 90 dias:** acrescentei "Mês atual" como opção no filtro de período da tela de Capacidade (ao lado de 90 dias/6 meses/12 meses) — agora dá pra ver a tabela "Capacity x consumido" e o "Ranking" olhando só o mês corrente, sem o acumulado de 90 dias diluindo o número.

## 3. O que foi testado

Ambiente local: criei um instrutor ativo com uma turma só planejada no mês (sem hora real) e confirmei que ele entra na contagem de "considerados" mas NÃO puxa a média de ocupação do time pra baixo (média ficou igual, com ou sem ele). Criei um instrutor desligado (usuário inativo) sem nenhuma hora na janela recente e confirmei que ele some do Scorecard, do "Capacity x consumido" e do dropdown — e continua aparecendo normalmente num mês antigo em que ele de fato trabalhou. `npm run build` do frontend rodou sem erros. Dados de teste removidos do banco ao final.

## 4. Ação manual necessária

Nenhuma — sem migração de banco, sem mudança de schema.
