# Tel T&D Platform

## Estrutura
- `frontend/` — Next.js (Vercel)
- `backend/` — Express.js (Railway) + MySQL
- `database/` — migrations SQL

## Funcionalidades concluídas
- Portal de Treinamentos, Presenças, Necessidades, NPS, Avaliações, Biblioteca, Trilhas, Oceano do Desenvolvimento.
- **Cálculos exatos de horas/dias/HC (novo)**: `backend/src/services/horasResolver.js` — fonte única de verdade para:
  - `horas_previstas` / `horas_realizadas` (prioridade: cronograma `turma_aulas` por dia > fallback `treinamentos.carga_horaria`, só conta realizado se turma concluída).
  - `dias_previstos` / `dias_praticados` (só disponível quando a turma tem cronograma; `null` quando não há, em vez de inventar número).
  - `hc_previsto` (roster `treinamento_participantes` > `participantes_previstos`/`participantes`) e `hc_realizado` (prioridade: `presenca_aulas` > `presencas` legado > snapshot), usando o mesmo critério de classificação por pessoa (≥75% presença) já usado em `presencaResolver.js`.
  - Agregação por **instrutor x mês** usando a data de cada aula (não a data da turma), então turmas que atravessam 2 meses são corretamente divididas.
- **Modelo de capacidade híbrido (novo)**: `backend/src/services/capacidadeResolver.js` + tabelas `capacidade_regra_padrao` (regra automática: dias úteis do mês × horas/HC por dia, configurável) e `capacidade_instrutor_mensal` (override manual por instrutor+ano+mês, que tem prioridade sobre o automático quando existir).
- `/api/dashboard/treinamentos` agora expõe, além das métricas de presença já existentes: `horas_previstas`, `horas_realizadas`, `dias_previstos`, `dias_praticados`, `hc_previsto`, `hc_realizado`, `aderencia_horas`, `taxa_hc`, além de `temas_realizados` (por tema de treinamento) e `realizado_instrutor_mes` (capacidade x realizado por instrutor e mês).
- Dashboard (frontend) atualizado com cards de Horas previstas/realizadas, Dias praticados, HC previsto/realizado.

## Endpoints novos
- `GET /api/dashboard/treinamentos` — (atualizado) inclui métricas exatas de horas/dias/HC, temas realizados e realizado por instrutor x mês.
- `GET /api/capacidade?ano=&mes=&instrutor=` — capacidade x realizado por instrutor/mês (híbrido: manual > automático).
- `GET /api/capacidade/regra` / `PUT /api/capacidade/regra` — ler/atualizar a regra automática padrão (coordenador).
- `GET /api/capacidade/overrides?instrutor=&ano=` / `POST /api/capacidade/overrides` / `DELETE /api/capacidade/overrides/:id` — gerenciar overrides manuais de capacidade por instrutor/mês (coordenador).
- `GET /api/capacidade/instrutores` — lista de instrutores conhecidos (para preencher selects).

## Dados / Storage
- MySQL (produção) / MariaDB local `teltd_dev` (dev).
- Tabelas novas nesta fase: `turma_aulas`, `presenca_aulas`, `treinamento_participantes` (cronograma granular — já eram referenciadas pelo código, faltava a migration), `capacidade_regra_padrao`, `capacidade_instrutor_mensal`.
- Migrations em `database/migrations/2026-08-26_turmas_aulas_participantes.sql` e `2026-08-26_capacidade_instrutor.sql` (idempotentes, `CREATE TABLE IF NOT EXISTS`).

## Pendências conhecidas
- Corrigir `carga_horaria: 4` fixo em `backend/src/scripts/importDashboardExcel.js` (bug confirmado, mas o import não é mais recorrente — dado já foi importado uma vez e a operação atual é via cadastro manual de turmas no portal).
- Corrigir conflação em `necessidadesResolver.js` (`horasAtendidas` contando treinamentos ainda não executados).
- Construir página `/capacidade` no frontend (Capacidade x Realizado, Realizado Instrutor x Mês, Capacidade Instrutor x Mês) — endpoints já prontos e testados, falta a tela.
- Testar em produção (Railway/Vercel) — validado até aqui apenas em ambiente local (MariaDB `teltd_dev`).

## Deploy
- Backend: Railway (Express + MySQL).
- Frontend: Vercel (Next.js).
- Dev local: PM2 (`teltd-backend` porta 3001, `teltd-frontend` porta 3000).
