# Pacote 1 — Correções críticas do Portal T&D

Data: 11/09/2026

Este pacote contém os **6 arquivos alterados** para resolver os 6 itens críticos
listados no "Pacote 1" do roadmap (`roadmap-definitivo-avaliacao-completa-2026-09.md`).
Todas as correções foram testadas localmente (banco de dados limpo + chamadas reais
à API simulando cada perfil de usuário) antes desta entrega.

## Como aplicar

Suba os 6 arquivos abaixo para o mesmo caminho no seu repositório GitHub
(substituindo os existentes), na ordem que preferir — não há dependência entre eles:

```
backend/src/controllers/adminController.js
backend/src/controllers/certificadosController.js
backend/src/controllers/trilhasRelacionaisController.js
backend/src/database/migrate.js
backend/src/index.js
frontend/app/admin/nova-empresa/page.js
```

Depois do commit, Vercel (frontend) e Railway (backend) fazem o deploy automático,
como sempre. Nenhuma variável de ambiente nova é necessária.

**Atenção especial ao `migrate.js`**: ele roda automaticamente no boot do backend
(Railway). Em ambientes que **já existem** (produção atual), a tabela
`treinamento_participantes` já foi criada com o schema antigo e `CREATE TABLE IF
NOT EXISTS` não vai alterá-la — a correção protege qualquer banco **novo** dali
pra frente (relevante para o onboarding da IBM). Se quiser que o ambiente atual
também passe a ter as colunas completas (cliente, turma, supervisor, operação,
status_presença), me avise que preparo uma migration incremental separada — não
inclusa aqui porque exigiria decidir o que fazer com dados já existentes na tabela
velha. Não tenho acesso ao banco de produção para saber quantas linhas ela tem
lá hoje, então prefiro não presumir nada — me avise se quiser essa migration.

## O que foi corrigido

1. **Biblioteca — upload/download quebrado.** O backend salvava o arquivo em disco
   e devolvia um link, mas nada servia essa pasta publicamente — todo link dava
   404. Agora a pasta `uploads/` é servida em `/uploads/...`, com uma lista de
   extensões permitidas (pdf, doc/docx, xls/xlsx, ppt/pptx, txt, csv, imagens,
   mp4, zip — qualquer outro tipo, incluindo executáveis, é rejeitado) e limite de
   25MB por arquivo.
   ⚠️ Limitação que **continua existindo** e não foi resolvida aqui (é maior):
   o disco do Railway não é persistente entre deploys — um redeploy apaga os
   arquivos enviados. Isso já está registrado no roadmap como um item separado
   (migrar para armazenamento externo tipo S3/Cloudinary).

2. **Tabela `treinamento_participantes` duplicada na migration.** Existiam dois
   `CREATE TABLE IF NOT EXISTS` para a mesma tabela em `migrate.js`, com schemas
   diferentes e incompatíveis. Num banco novo, o primeiro (mais antigo e
   incompleto) sempre "vencia" e a tela de roster de participantes ficava sem as
   colunas que o código realmente usa. Removido o bloco antigo — mantido só o
   schema correto e completo. Testado criando um banco vazio do zero e
   confirmando a estrutura final da tabela.

3. **Senha do administrador do tenant exposta em texto plano.** O campo "Senha
   temporária" no assistente de criação de novo tenant não tinha
   `type="password"` — qualquer pessoa olhando a tela via a senha sendo digitada.
   Corrigido.

4. **Treinando podia emitir/consultar certificado em nome de outra pessoa.** Os
   endpoints de certificado aceitavam `usuario_nome`/`usuario_email` enviados
   pelo próprio formulário sem checar se quem pedia era coordenação/supervisão.
   Um treinando podia, por exemplo, ver a frequência e nota de outro colega, ou
   emitir um certificado com o nome de outra pessoa. Agora, para
   treinando/instrutor, os dados do próprio usuário logado sempre prevalecem;
   coordenação/supervisão/superintendência continuam podendo emitir para
   qualquer participante (é assim que a emissão em lote funciona).

5. **Injeção de SQL em `/api/admin/empresas/:id`.** O `id` da empresa era
   colocado direto dentro da query, sem parametrização — uma rota restrita a
   super_admin, mas ainda assim uma injeção clássica. Corrigido forçando o valor
   a número antes de usá-lo. Testado com payloads de injeção (incluindo uma
   tentativa de `DROP TABLE`) confirmando que não têm mais efeito nenhum.

6. **Trilhas de outro cliente acessíveis por ID.** O catálogo de trilhas
   (`/api/trilhas`) já filtrava por cliente para treinando/instrutor, mas quem
   acessava uma trilha diretamente pelo ID (`/api/trilhas/:id`, o progresso, e
   marcar etapa como concluída) não tinha essa mesma checagem — bastava
   conhecer/adivinhar o ID de uma trilha de outro cliente do mesmo tenant para
   ver todo o conteúdo dela, ou até marcar etapas como concluídas nela. Corrigido
   nos três endpoints, com o mesmo critério já usado no catálogo (coordenação/
   supervisão continuam vendo tudo).

## O que foi testado

Rodei o backend localmente contra um banco de testes e simulei os 4 cenários que
mais importavam:
- Um treinando do cliente "Mercantil" acessando uma trilha do próprio cliente
  (funciona) e uma de outro cliente ("Global Foods") pelo ID direto (bloqueado,
  nos três endpoints de trilha).
- Um treinando tentando emitir/consultar certificado em nome de outra pessoa
  (o sistema ignora o nome forjado e usa sempre o do próprio usuário logado).
- Tentativas de injeção de SQL contra `/api/admin/empresas/:id` (neutralizadas).
- Upload de um PDF (funciona e fica de fato baixável) e de um `.exe` (rejeitado).
- Migração completa rodada do zero num banco vazio, confirmando o schema final
  correto de `treinamento_participantes`.
- Conferi também que coordenação/supervisão continuam com acesso total (nenhuma
  das correções restringe por engano quem já deveria ter acesso amplo).

## O que não foi feito nesta rodada (por decisão, não por esquecimento)

- Verificação automatizada de segurança (DAST/HawkScan): o ambiente onde estou
  rodando não tem o CLI do HawkScan instalado nem uma chave de API configurada,
  então não foi possível rodar uma varredura automática contra a aplicação. A
  validação das correções acima foi feita manualmente (testes de API simulando
  ataque real), o que cobre especificamente os 6 itens deste pacote — mas não
  substitui uma varredura completa se você tiver como rodar uma.
- Migration retroativa dos dados já existentes em `treinamento_participantes`
  em produção (ver aviso acima).
- Armazenamento persistente para os arquivos da Biblioteca no Railway (item já
  registrado à parte no roadmap, é uma mudança de arquitetura maior).

Qualquer dúvida ou se algo se comportar diferente do esperado depois do deploy,
me avise.
