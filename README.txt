Atualização do Mapa de Desenvolvimento - refinamento visual e tripulação

Arquivos:
- frontend/app/mapa-desenvolvimento/page.js
- backend/src/controllers/jornadaParticipantesController.js
- database/migrations/2026-04-01_jornada_participantes.sql

O que foi ajustado:
1. mensagens de erro/aviso somem automaticamente após alguns segundos e ao trocar de aba
2. cards/balões suavizados com visual mais elegante
3. ícones/emoji sutis ligados ao oceano nas seções principais
4. labels dos mini cards não ficam mais cortadas
5. backend da tripulação agora devolve erro mais claro se a tabela ainda não existir

Se o vínculo manual continuar falhando:
- execute no Railway a migration 2026-04-01_jornada_participantes.sql
- depois faça novo deploy do backend
