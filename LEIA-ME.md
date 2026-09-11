# Pacote 2 — Débito técnico e robustez (Portal T&D)

Este pacote contém os arquivos alterados para os 9 itens do Pacote 2 do
[roadmap definitivo](https://claude.ai — ver projeto "Portal T&D", doc
`roadmap-definitivo-avaliacao-completa-2026-09.md`). O relatório completo,
com causa raiz e teste de cada item, está em
`relatorio-pacote2-debito-tecnico-2026-09.md` (também salvo no projeto).

## Como aplicar

1. Substitua no seu repositório GitHub cada arquivo abaixo pelo equivalente
   deste zip (mesmo caminho relativo, a partir da raiz do repo).
2. **Importante — dependências:** dois `package.json` foram alterados
   (`backend/package.json` e `frontend/package.json`), junto com os
   `package-lock.json` correspondentes. Depois de substituir os arquivos,
   rode `npm install` em cada pasta (local) **ou** apenas faça o commit/push
   normal — o Railway e o Vercel já rodam `npm install` sozinhos no deploy.
3. Nenhuma variável de ambiente nova é necessária.
4. A tabela `auditoria_log` e o ajuste nas 8 tabelas do Oceano/Trilhas/
   Certificados são aplicados automaticamente pela migration no primeiro
   boot do backend após o deploy (mesmo mecanismo já usado no Pacote 1) —
   não precisa rodar nada manualmente no banco.

## Arquivos neste pacote

**Backend** (`backend/`):
- `package.json`, `package-lock.json` — dependência `xlsx` trocada de
  `^0.18.5` (vulnerável, sem correção disponível no npm) para
  `npm:@e965/xlsx@^0.20.3` (mirror oficial do SheetJS, mesma API).
- `src/database/migrate.js` — remove o `DEFAULT 1` perigoso de `empresa_id`
  em 8 tabelas; cria a tabela `auditoria_log` automaticamente.
- `src/index.js` — transações nas exclusões/reimportações destrutivas,
  limite de tamanho de upload nas rotas de importação restantes, remoção de
  vazamento de erro técnico.
- `src/controllers/treinamentoParticipantesController.js` — transação na
  reimportação de participantes via Excel.
- `src/routes/authRoutes.js` — rate limit em "esqueci minha senha".
- `src/controllers/turmaAulasController.js`, `src/jobs/lembretesAula.js` —
  alinhamento dos status de aula (`ministrada`/`parcial` → valores reais:
  `em_andamento`/`concluida`).
- `src/controllers/presencaAulasController.js` — exige justificativa quando
  o status da chamada é "Justificado".
- `src/controllers/auditoriaController.js` — mensagem de erro atualizada
  (a tabela agora é criada automaticamente).
- Demais controllers/middlewares/services listados abaixo — apenas remoção
  de vazamento de detalhe técnico de erro nas respostas de erro:
  `adminController.js`, `analyticsController.js`, `capacidadeController.js`,
  `certificadosController.js`, `muralController.js`, `necessidadesController.js`,
  `trilhasRelacionaisController.js`, `materiaisAvaliativosController.js`,
  `acoesDesenvolvimentoController.js`, `bibliotecaController.js`,
  `frequenciaIndividualController.js`, `avaliacoesTreinandosController.js`,
  `dashboardTreinamentosController.js`, `presencaResumoController.js`,
  `respostasAvaliativasController.js`, `middlewares/auth.js`,
  `middlewares/authorizeRoles.js`, `routes/dashboardRoutes.js`,
  `services/mailer.js`.

**Frontend** (`frontend/`):
- `package.json`, `package-lock.json` — mesma troca do `xlsx`; `next`
  atualizado de `14.2.5` para `14.2.35` (patches de segurança, mesma versão
  major/minor, sem breaking changes).
- `services/api.js` — remoção do header `X-Client-ID` morto (substituído
  há tempos pelo isolamento via JWT).
- `app/turma/[id]/chamada/page.js` — validação de justificativa obrigatória
  antes de salvar a chamada.

## O que NÃO precisa de ação manual

- A correção do `DEFAULT` perigoso e a criação de `auditoria_log` rodam
  sozinhas no próximo boot do backend (via `runMigrations()`), tanto em
  produção quanto em qualquer ambiente novo.
- Não há dado para migrar/corrigir manualmente — os dois itens de schema são
  aditivos/corretivos e não apagam nem alteram dado existente.
