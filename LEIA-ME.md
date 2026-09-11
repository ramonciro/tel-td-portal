# Painel super-admin — Visão consolidada entre tenants

Este pacote implementa o item do roadmap "Painel super-admin com visão
consolidada entre tenants": uma tela nova que agrega a saúde de todos os
tenants (Comércio, e os próximos que entrarem, como IBM) numa visão só, em
vez de precisar abrir tenant por tenant.

## O que foi feito

**2 arquivos, nenhuma mudança de backend.** Como o roadmap já apontava, a
maior parte do dado necessário já existia — a tela nova só consome os dois
endpoints que o `/admin` já usa (`/admin/stats` e `/admin/empresas`); não
precisou de nenhuma rota, coluna ou migração nova.

- `frontend/app/admin/consolidado/page.js` **(novo)** — a tela consolidada.
- `frontend/app/admin/page.js` **(modificado)** — só adiciona um botão
  "📊 Visão consolidada" no cabeçalho, levando para a tela nova. Nenhuma
  outra linha do arquivo mudou.

## O que a tela mostra

Conforme conversamos: uso vs. limites por tenant, alertas acionáveis e
volume agregado, com atalho direto para o tenant.

1. **KPIs agregados** (mesmos totais do `/admin`, para servir como resumo
   executivo autônomo se alguém abrir só esta tela): tenants ativos,
   usuários, turmas e certificados somados entre todos os tenants.
2. **Alertas** — lista priorizada (crítico → atenção → info) do que merece
   atenção agora, calculada a partir dos dados que já existem, sem
   necessidade de nenhum campo novo no banco:
   - Uso de usuários ou turmas **≥ 90%** do limite → crítico.
   - Uso **≥ 70%** do limite → atenção.
   - Tenant ativo sem e-mail de contato cadastrado → atenção (onboarding
     incompleto).
   - Tenant ativo sem nenhuma turma cadastrada → atenção (tenant parado).
   - Tenant desativado → informativo.

   Cada alerta tem um botão "Ver tenant" que leva direto para
   `/admin/empresa/[id]`, a tela de gestão daquele tenant que já existe.
3. **Comparativo lado a lado** — uma tabela com todos os tenants (nome,
   plano, status, uso de usuários e turmas com barra de progresso,
   certificados emitidos, data de criação), ordenada para trazer primeiro
   quem tem algum alerta crítico. Cada linha tem um botão "Gerenciar" para
   o mesmo atalho.

O `/admin` original **não foi alterado** além do botão novo — os cards por
tenant, filtros e o fluxo de criar/editar/desativar tenant continuam
exatamente como estavam.

## Como aplicar

1. Adicione o arquivo novo `frontend/app/admin/consolidado/page.js`.
2. Substitua `frontend/app/admin/page.js` pelo arquivo deste pacote (a
   única mudança real é o botão "Visão consolidada" no cabeçalho — o resto
   do arquivo é idêntico ao que já está em produção).
3. Nenhuma variável de ambiente, migração de banco ou dependência nova é
   necessária.

## O que já foi testado antes de entregar

Build de produção local (Turbopack) gerou a rota nova sem erros. Testei com
navegador real automatizado (Playwright), autenticado como super_admin via
JWT sintético (sem senha real envolvida), contra o banco de teste local com
os 2 tenants que já existem lá:

- Navegação `/admin` → botão "Visão consolidada" → `/admin/consolidado` e
  volta, sem erro de console.
- Os alertas calculados batem com o dado real do banco de teste (ambos os
  tenants sem e-mail de contato cadastrado, por exemplo, geraram o alerta
  esperado).
- Botões "Ver tenant" (nos alertas) e "Gerenciar" (na tabela) navegam
  corretamente para `/admin/empresa/[id]`.
- Simulei um cenário de tenant perto do limite (baixando temporariamente o
  limite de usuários de um tenant de teste) para confirmar que o alerta
  crítico aparece, com o badge vermelho certo, e que a tabela reordena para
  trazer esse tenant para o topo — depois desfiz a alteração, era só teste.
- Conferi que o número mostrado como limite (ex.: "4/50") bate exatamente
  com o que o `/admin` já mostra nos cards de cada tenant — a primeira
  versão que testei aqui mostrava "∞" num caso em que o `/admin` mostra
  "50" (tenant sem `limite_usuarios` preenchido no banco); corrigi para
  usar o mesmo valor padrão (50 usuários / 100 turmas) que o resto do
  painel já usa, evitando as duas telas mostrarem números diferentes para
  o mesmo tenant.

## Fica de fora deste pacote (não é bloqueio, é escopo)

Os alertas de uso (90%/70%) e de onboarding incompleto cobrem o que dá para
derivar dos dados que já existem hoje. Coisas que dependeriam de dado novo
(ex.: um alerta de "pagamento pendente", já que o portal não tem essa
informação hoje) ficam fora até existir essa informação no sistema.
