PACOTE 1 - ETAPA 2 COMPLETA

Arquivos para substituir no projeto:
- backend/src/controllers/dashboardTreinamentosController.js
- frontend/app/dashboard/page.js
- frontend/app/inicio/page.js

O que entra neste pacote:
1. Dashboard com filtros funcionais por cliente, instrutor, status, modalidade e período.
2. Filtros alimentados pelo backend com base real no recorte atual.
3. Faróis acionáveis mais úteis e mais naturais no Dashboard.
4. Resumo do Oceano no Dashboard.
5. Progresso da tripulação no Dashboard.
6. Taxa de execução limitada a 100%.
7. Início usando base_ativa nas turmas recentes para evitar leitura vazia.
8. Ajustes de linguagem para ficar menos robótico.

Observações:
- O filtro por modalidade usa o marcador [modalidade:online] ou [modalidade:presencial] quando ele existir na descrição do treinamento.
- Se as tabelas do Oceano não existirem ou estiverem vazias, o Dashboard continua carregando normalmente.
