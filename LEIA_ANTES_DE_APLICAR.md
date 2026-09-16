[LEIA_ANTES_DE_APLICAR.md](https://github.com/user-attachments/files/32307958/LEIA_ANTES_DE_APLICAR.md)
# Redesign Gestão de Usuários — Leia antes de aplicar

## O que tem neste zip

2 arquivos, ambos para **substituir** o arquivo equivalente no repositório (mesmo caminho):

```
backend/src/index.js
frontend/app/usuarios/page.js
```

Sem migração de banco.

## O que mudou

Isto substitui o ajuste pontual de cores que eu tinha feito antes (aquele já está aplicado e
continua valendo). Esta entrega é a redefinição de layout que você pediu: nova aparência,
mantendo a identidade navy + laranja do portal, e três funcionalidades novas.

### 1. Layout novo

- Cabeçalho com faixa em gradiente (navy → laranja) e 4 cartões de indicadores (Total, Ativos,
  Inativos, Metodologia) — antes era só uma barra de filtros cinza sobre a tabela.
- Barra "Distribuição por perfil" virou um gráfico de proporção colorido (antes era uma lista de
  chips soltos).
- Aviso "N usuários sem operação" ganhou destaque visual (antes passava despercebido).
- Avatares com anel colorido no tom do perfil do usuário.
- Badges de status ("Ativo"/"Inativo") como pílulas coloridas em vez de texto simples.
- Modal de novo usuário/edição com fundo desfocado (blur), em vez do preto liso de antes.
- Estado vazio (quando a busca não encontra ninguém) ganhou um ícone e texto orientativo, em vez
  de uma tabela em branco.

### 2. Alternar entre lista e cartões

Dois botões ("Lista" / "Cartões") ao lado da busca. "Cartões" é útil para conferir muitos usuários
de uma vez sem rolar uma tabela larga — mostra nome, e-mail, perfil, operações vinculadas e status
por usuário, num grid responsivo.

### 3. Ações em lote

Botão "Selecionar usuários" liga um modo de seleção (checkbox em cada linha/cartão). Com um ou mais
selecionados, aparece uma barra com:
- **Ativar selecionados** / **Desativar selecionados** — muda o status de vários usuários de uma vez
  (mesmo endpoint já usado para ativar/desativar um usuário, só que em sequência para cada
  selecionado — nenhum endpoint novo de risco).
- **Excluir selecionados** — pede confirmação (mostra quantos serão excluídos) antes de apagar.
- **Exportar selecionados** — gera o Excel só com os usuários marcados.
- Botões "Selecionar visíveis" (marca todos que estão na tela após o filtro/busca atual) e "Limpar".

Cada ação em lote respeita as mesmas permissões de perfil que já existiam para editar/excluir um
usuário por vez — se seu perfil não pode excluir, o botão de excluir em lote nem aparece.

### 4. Exportar Excel

Botão "Exportar Excel" no topo exporta a lista de usuários (todos ou só os filtrados pela busca/
chip de perfil, dependendo do que está na tela) com nome, e-mail, perfil, operações vinculadas,
status e data de criação — mesmo padrão visual das outras planilhas do portal (cabeçalho estilizado,
larguras de coluna ajustadas). Novo endpoint no backend: `GET /api/usuarios/exportar` (mesmo
controle de tenant e o mesmo log de auditoria que as outras exportações do sistema já têm).

## Pesquisa de referência

Você pediu para eu buscar modelos de páginas de gestão de usuários antes de redesenhar — pesquisei
padrões de telas de administração (dashboards com cartões de KPI + gráfico de distribuição no topo,
alternância lista/cartões para até algumas dezenas de itens, avatares com iniciais coloridas,
status como badges, ações em lote com barra de confirmação, uso de sombra suave em vez de bordas
para separar cartões) e apliquei o que fazia sentido para uma tela de administração interna como
esta — sem copiar o visual de rede social do modelo que você anexou (que era só inspiração de
"não quero tudo cinza", como você mesmo disse).

## Como aplicar

1. No GitHub, suba os 2 arquivos acima no mesmo caminho, substituindo os existentes.
2. O Vercel faz o deploy automático do frontend assim que o `main` for atualizado. O backend
   (Railway) também reimplanta automaticamente — a única mudança nele é a rota nova de exportação,
   não mexe em nada que já existia.

## O que testar depois do deploy

- Abrir **Gestão de Usuários** e conferir o novo layout (cartões de indicadores, gráfico de
  distribuição, aviso de "sem operação").
- Alternar entre "Lista" e "Cartões" e ver os usuários nos dois formatos.
- Clicar em "Selecionar usuários", marcar 2 ou 3, e testar "Exportar selecionados" e "Ativar/
  Desativar selecionados" (dá pra desfazer clicando de novo). "Excluir selecionados" pede
  confirmação antes de apagar de verdade — teste com cuidado ou cancele na confirmação.
- Clicar em "Exportar Excel" (sem seleção) e conferir que baixa a lista completa/filtrada.
- Abrir "+ Novo usuário" e conferir o fundo desfocado do modal.

## Validação feita antes da entrega

- `npm run build` do frontend passou sem erros (43 rotas).
- Testei a tela de ponta a ponta num ambiente local (login, listagem, alternância lista/cartões,
  seleção em lote, exportação) com capturas de tela — anexei 3 delas nesta entrega para você já ter
  uma prévia sem precisar esperar o deploy.
- Testei a rota nova `/api/usuarios/exportar` direto (sem seleção, com seleção única e múltipla) e
  conferi o arquivo `.xlsx` gerado e o registro de auditoria.
