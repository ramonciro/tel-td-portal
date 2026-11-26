# Pacote 4 — Tela "Saúde do sistema" (O7) (26/11/2026)

Sobe por cima dos Pacotes 1, 2 e 3. **Sem migração manual**: a tabela nova (`sistema_jobs`) é criada sozinha na primeira consulta. Não muda nenhuma regra de negócio nem tela existente, só acrescenta.

## O que é
Uma tela só para o **Super Admin** (`/admin/saude`, botão "🩺 Saúde do sistema" no topo do Painel Super Admin) com o que antes só se via no Railway:
- **Aviso geral**: Tudo certo / Atenção / Problema no sistema.
- **Versão no ar**: commit e mensagem do deploy, há quanto tempo o servidor está ligado.
- **Banco de dados**: se responde, tempo de resposta, se as migrações terminaram.
- **Backup externo**: há quantas horas foi o último backup bem-sucedido (alerta acima de 36 h) e o último erro, se houver.
- **Rotinas automáticas** (certificados, células baby, conquistas, Radar, resumo de pendências, avisos do R&S, lixeira, lembretes): quando rodou pela última vez, quanto levou, o resultado e se deu certo. Fica "Atrasado" se passar do tempo esperado e "Falhou" se der erro.
- **Últimos erros do servidor** (30 mais recentes): respostas 5xx, promessas rejeitadas e falhas de rotinas, com método, rota e mensagem curta. Não guarda dados de pessoas nem a query string.
- Atualiza sozinha a cada minuto e tem botão "Atualizar".

## Como funciona (e limites)
- O registro das rotinas é gravado numa tabela, então **sobrevive aos deploys**. Gravar o registro nunca derruba a rotina (se falhar, ela segue como antes).
- Logo depois de subir, as rotinas aparecem como **"Sem registro"** até o primeiro horário de cada uma (o Radar semanal, só na segunda). Isso é normal.
- A lista de **erros recentes fica em memória**: zera a cada deploy/reinício (a tela mostra "desde quando").
- A versão (commit) vem das variáveis que o Railway já injeta. Se ficar "—", me avise.
- As rotas disparadas à mão em `/api/admin/jobs/*` não entram no registro (só os agendamentos).

## Segurança
`GET /api/admin/saude` só responde ao Super Admin (os outros perfis recebem 403, sem login recebem 401). Está no teste automático.

## Arquivos
- `backend/src/lib/registroJobs.js` (novo)
- `backend/src/jobs/scheduler.js` (cada rotina passa a registrar sua execução)
- `backend/src/index.js` (endpoint `/api/admin/saude`, anotação de 5xx e de erros não tratados)
- `backend/tests/saude-do-sistema.test.js` (novo, 8 testes)
- `frontend/app/admin/saude/page.js` (novo)
- `frontend/app/admin/page.js` (botão de acesso)

## Verificado
Suíte completa: **40 testes passando** (32 anteriores + 8 novos); sintaxe, lint e build do frontend ok. Teste de mutação: tirando a trava do Super Admin da rota, o teste de acesso falha. Tela conferida em navegador com dados de exemplo.

## Como conferir depois de subir
1. Railway com deploy concluído e `/api/health` ok; GitHub *Actions* com ✓.
2. Entre como Super Admin → Painel → **Saúde do sistema**: deve mostrar o commit do deploy, banco "Respondendo" e o backup com "há X h" e "OK".
3. Rotinas "Sem registro" é esperado no começo; amanhã cedo devem aparecer como OK.
