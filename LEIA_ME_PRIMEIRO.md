# Como aplicar este pacote no seu ambiente de teste

Este zip contém **apenas os arquivos que foram criados ou alterados** para
corrigir os cálculos de horas/dias/HC e implementar o modelo de capacidade
híbrido. Nada mais do projeto foi tocado.

## 1) Arquivos NOVOS (basta copiar para o mesmo caminho no seu projeto)

```
backend/src/services/horasResolver.js
backend/src/services/capacidadeResolver.js
backend/src/controllers/capacidadeController.js
database/migrations/2026-08-26_turmas_aulas_participantes.sql
database/migrations/2026-08-26_capacidade_instrutor.sql
```

Copie esses 5 arquivos para as mesmas pastas no seu repositório (criando as
pastas se não existirem). Não sobrescrevem nada, pois não existiam antes.

## 2) Arquivos MODIFICADOS (cuidado: não sobrescreva direto se você tiver
   mudanças locais próprias nesses mesmos arquivos)

```
backend/src/index.js
backend/src/controllers/dashboardTreinamentosController.js
frontend/app/dashboard/page.js
```

Para esses 3, incluí também o **diff exato** (o que mudou, linha a linha) na
pasta `_diffs/`, para você conseguir revisar e aplicar manualmente caso já
tenha feito outras alterações nesses arquivos desde a última sincronização:

```
_diffs/index.js.diff
_diffs/dashboardTreinamentosController.js.diff
_diffs/dashboard_page.js.diff
```

Se seus arquivos atuais são idênticos aos da última entrega (ou seja, você
não editou nada por conta própria neles), pode simplesmente **substituir
pelos arquivos completos** que estão nas pastas `backend/` e `frontend/`
deste zip.

## 3) Rodar as migrations no banco de teste

**IMPORTANTE**: antes de testar, aplique as 2 migrations no banco MySQL do
ambiente de teste. Elas são idempotentes (`CREATE TABLE IF NOT EXISTS`),
então é seguro rodar mesmo que algumas tabelas já existam:

```bash
mysql -h SEU_HOST -u SEU_USER -p SEU_BANCO < database/migrations/2026-08-26_turmas_aulas_participantes.sql
mysql -h SEU_HOST -u SEU_USER -p SEU_BANCO < database/migrations/2026-08-26_capacidade_instrutor.sql
```

Essas migrations criam:
- `turma_aulas`, `presenca_aulas`, `treinamento_participantes` — já eram
  usadas pelo código existente (cronograma, chamada por aula, roster), mas
  não havia migration commitada para elas. **Se essas tabelas já existirem
  no seu banco de teste, nada é alterado.**
- `capacidade_regra_padrao` (regra automática, já vem com 1 linha padrão:
  6h/dia, 30 HC/dia, domingo não conta) e `capacidade_instrutor_mensal`
  (overrides manuais) — 100% novas.

## 4) Reiniciar os serviços

Depois de copiar os arquivos e rodar as migrations:

```bash
# backend
pm2 restart teltd-backend   # ou o processo equivalente no seu ambiente

# frontend
pm2 restart teltd-frontend
```

## 5) O que testar

- `GET /api/dashboard/treinamentos` — agora deve trazer, dentro de `kpis`:
  `horas_previstas`, `horas_realizadas`, `dias_previstos`, `dias_praticados`,
  `hc_previsto`, `hc_realizado`, `aderencia_horas`, `taxa_hc`. Também
  aparecem os blocos novos `temas_realizados` e `realizado_instrutor_mes`
  na resposta.
- Tela **Dashboard** (frontend) — deve mostrar os novos cards: "Horas
  previstas", "Horas realizadas", "Dias praticados", "HC previsto", "HC
  realizado".
- Novos endpoints de capacidade (perfil coordenador/supervisor):
  - `GET /api/capacidade?ano=2026&mes=6`
  - `GET /api/capacidade/regra`
  - `PUT /api/capacidade/regra` (perfil coordenador)
  - `GET /api/capacidade/overrides`
  - `POST /api/capacidade/overrides` (perfil coordenador) — body:
    `{"instrutor":"Nome","ano":2026,"mes":6,"horas_capacidade":100,"hc_capacidade":300}`
  - `DELETE /api/capacidade/overrides/:id` (perfil coordenador)
  - `GET /api/capacidade/instrutores`

  **Atenção**: os nomes dos campos no body do POST são em `snake_case`
  (`horas_capacidade`, `hc_capacidade`), não `camelCase`.

## O que NÃO está neste pacote (ainda pendente)

- Página visual `/capacidade` no frontend (os endpoints já existem e foram
  testados, mas a tela ainda não foi construída).
- Correção do `carga_horaria: 4` fixo no importador de Excel
  (`importDashboardExcel.js`) — de baixa prioridade porque esse import não
  é mais recorrente no fluxo atual.
- Correção do cálculo de `horasAtendidas` em `necessidadesResolver.js`.

## Validação já feita antes deste envio

Testei todos os endpoints via `curl` com JWT real contra dados semeados
localmente (3 turmas de teste com cronograma e chamada detalhados) e os
números bateram exatamente com o esperado:
- 60h previstas / 49,5h realizadas / 11 dias previstos / 9 praticados /
  HC 60 previsto / 55 realizado (agregado das 3 turmas de teste).
- Override manual de capacidade testado end-to-end: criado → confirmado
  com prioridade sobre o cálculo automático → removido → voltou ao
  automático corretamente.
