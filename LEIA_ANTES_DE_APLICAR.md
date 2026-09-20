# Pacote — KPIs do Ambiente Metodologia + Coaching Individual + Tripulação (20/09/2026)

Implementa, no código real, o que fechamos no protótipo: framework de KPIs
(`claude/framework-kpis-metodologia-2026-09-20.md`), o novo modelo de
coaching individual (pessoa a pessoa, independente de jornada) e a tela de
Tripulação. Não mexe em nada do módulo de Treinamento, só no Ambiente
Metodologia (perfil `metodologia`).

## Arquivos deste pacote (10 no total)

**Backend — substituir:**
- `backend/src/database/migrate.js`
- `backend/src/index.js`

**Backend — novos (criar):**
- `backend/src/controllers/coachingIndividualController.js`
- `backend/src/controllers/metodologiaKpisController.js`
- `backend/src/routes/coachingIndividualRoutes.js`
- `backend/src/routes/metodologiaKpisRoutes.js`

**Frontend — substituir:**
- `frontend/app/mapa-desenvolvimento/page.js`
- `frontend/components/PortalShell.js`

**Frontend — novos (criar):**
- `frontend/app/kpis-desenvolvimento/page.js`
- `frontend/app/tripulacao/page.js`

## O que muda pra você, na prática

- Duas telas novas no menu do perfil Metodologia: **KPIs** e **Tripulação**.
- **KPIs**: adesão ao cronograma (farol ≥90% saudável / 80–89% atenção /
  <80% crítico — mesmo corte que você já usa em frequência), cobertura por
  cliente, coaching individual (em dia/atrasado) e um card de Comprovação
  MPT **provisório** (ver pendência abaixo).
- **Tripulação**: lista única de todo mundo acompanhado — jornada coletiva,
  coaching individual, ou os dois — com filtro por vínculo. De lá dá pra
  cadastrar um coaching individual novo (vinculado a alguém já numa jornada,
  ou solto, tipo um diretor sem jornada nenhuma) e registrar os encontros
  (a data de cada um, não só uma contagem).
- **Mapa de Desenvolvimento**: cada card de jornada ganhou um indicador
  "Coaching individual" ao lado de "Participantes" — mostra quantas pessoas
  daquela jornada também têm coaching individual, sem entrar na conta de
  adesão.

## Banco de dados

Duas tabelas novas, criadas automaticamente pelo `migrate.js` na próxima
subida do backend (`CREATE TABLE IF NOT EXISTS`, sem risco pro que já
existe): `coaching_individual` e `coaching_encontros`. Não precisa rodar
nada manualmente no Railway — só subir o `index.js`/`migrate.js` novos e o
backend cria as tabelas sozinho ao iniciar.

## Ordem de aplicação

1. Backend primeiro (os 6 arquivos) — reinicie o backend no Railway pra
   `migrate.js` rodar e criar as tabelas novas.
2. Frontend depois (os 4 arquivos) — pode subir junto ou logo em seguida,
   sem problema de ordem entre eles.

## Pendência que continua em aberto (não travou esta entrega)

O card "Comprovação MPT" no KPIs é **provisório**: conta ações de
desenvolvimento vencidas (prazo passado, não concluídas) por subdivisão —
não é um cálculo de horas exigidas, porque essa regra ainda não foi
definida. Assim que você bater o martelo em quantas horas cada subdivisão
exige, troco esse card pelo cálculo de verdade.

## O que foi testado

- `node -c` em todos os arquivos de backend alterados/novos — sintaxe OK.
- `npx next build` do frontend — sucesso, 45 rotas geradas (as 43 de antes +
  `/kpis-desenvolvimento` + `/tripulacao`), sem erro.
- Revisão do guard de rotas em `PortalShell.js` — as duas telas novas foram
  adicionadas à lista `METODOLOGIA_ROTAS`, senão o usuário do perfil
  Metodologia seria redirecionado de volta pro Mapa de Desenvolvimento ao
  tentar abri-las (bug fácil de cometer, documentado pela própria
  investigação que fiz antes de escrever o código).

Não testei contra um banco MySQL real rodando localmente (o ambiente aqui
não tem um) — a validação foi sintática e de build. Se algo se comportar
diferente do esperado assim que subir, me manda o erro que eu corrijo.
