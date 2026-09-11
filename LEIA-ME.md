# Pacote 3 (parte 1) — Acesso restrito por cliente + Certificado automático (Portal T&D)

Este pacote contém os arquivos alterados para os dois primeiros itens do
Pacote 3 do [roadmap definitivo](https://claude.ai — ver projeto "Portal
T&D", doc `roadmap-definitivo-avaliacao-completa-2026-09.md`): "Acesso
restrito por cliente (generalizar)" e "Certificado automático ao concluir a
turma". O relatório completo, com causa raiz e teste de cada item, está em
`relatorio-pacote3-parte1-2026-09.md` (também salvo no projeto).

## Como aplicar

1. Substitua no seu repositório GitHub cada arquivo abaixo pelo equivalente
   deste zip (mesmo caminho relativo, a partir da raiz do repo) — dois
   arquivos são **novos** (`src/lib/acessoCliente.js` e
   `src/jobs/certificadosAutomaticos.js`), o restante já existe e é só
   substituir.
2. Nenhuma dependência nova, nenhuma variável de ambiente nova, nenhuma
   migration nova. É só código de aplicação.
3. Reinicie o backend (redeploy normal) para o novo job (05h diário) entrar
   no agendamento — o log de boot passa a mostrar "certificados 05h diário"
   na linha de agendamentos automáticos.

## Arquivos neste pacote

**Backend** (`backend/`):
- `src/lib/acessoCliente.js` **(novo)** — helper central de restrição por
  cliente: `usuarioTemAcessoAoCliente()` (checagem pontual de um recurso já
  carregado) e `filtroClientesSQL()` (recorte em listagens). Trata
  corretamente o caso de usuário vinculado a mais de um cliente
  (`"ClienteX, ClienteY"`), o que a única checagem existente antes deste
  pacote (em Trilhas) não fazia.
- `src/routes/entityCrud.js` — novo hook opcional `listFiltro` no router
  genérico de CRUD, usado para aplicar o recorte por cliente na listagem de
  Treinamentos sem duplicar o router inteiro.
- `src/index.js` — liga o `listFiltro` à rota `/api/treinamentos`; adiciona
  o `require` e a rota `POST /api/admin/jobs/rodar-certificados-automaticos`
  (disparo manual do job, mesma restrição de perfil dos outros três jobs já
  existentes).
- `src/controllers/trilhasRelacionaisController.js` — retrofit para usar o
  helper central (corrige, de brinde, o bug de multi-cliente que já existia
  aqui).
- `src/controllers/treinamentoParticipantesController.js` — checagem de
  cliente na leitura, importação por Excel, chamada, criação e nas duas
  rotas de exclusão de participantes de uma turma.
- `src/controllers/bibliotecaController.js` — recorte por cliente na
  listagem (não existia nenhum antes).
- `src/controllers/certificadosController.js` — checagem de cliente no
  preview e na emissão; extração da função compartilhada
  `registrarCertificado()` (usada também pelo job novo); correção do
  bug de duplicidade quando não há e-mail (chave única não deduplica
  `NULL`); correção da consulta a uma coluna inexistente
  (`treinamento_participantes.email`) no caminho de e-mail não informado —
  agora resolve pela tabela `usuarios`.
- `src/controllers/muralController.js` — checagem de cliente na leitura do
  mural da turma.
- `src/jobs/certificadosAutomaticos.js` **(novo)** — job que emite/atualiza
  certificado automaticamente para toda turma concluída (status explícito
  OU `data_fim` já passada, exceto cancelada), reaproveitando a mesma regra
  de elegibilidade (frequência ≥ 75%) já usada pela emissão manual.
- `src/jobs/scheduler.js` — agenda o novo job para rodar todo dia às 05h.

## O que NÃO precisa de ação manual

- Não há dado para migrar — nenhuma tabela nova, nenhuma coluna nova.
- O job de certificados automáticos começa a rodar sozinho no próximo dia
  às 05h; se quiser ver o efeito imediatamente após o deploy, dispare uma
  vez manualmente via `POST /api/admin/jobs/rodar-certificados-automaticos`
  (autenticado como coordenador/supervisor/superintendente).
- Rodar o job de novo nunca duplica certificado já emitido — ele atualiza
  o existente (frequência/nota), mesmo para participantes sem e-mail
  cadastrado.
