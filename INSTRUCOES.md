# Módulo R&S — Entrega Final
**Baseado no código real do projeto (tel-td-portal-main)**

---

## O que mudou em relação às entregas anteriores

Após análise do código-fonte completo, as entregas anteriores foram corrigidas:

| Item anterior         | Situação real              | Ação                                      |
|-----------------------|----------------------------|-------------------------------------------|
| `rsMiddleware.js`     | Desnecessário              | Removido — `authorizeRoles` já bloqueia   |
| `perfilUtils.js`      | Desnecessário              | Removido — `hasSomeRole` já existe no projeto |
| Tema dark (navy)      | Inconsistente com o portal | Corrigido — usa tema claro + `colors` de `theme.js` |
| Export manual com fetch | Desnecessário            | Corrigido — usa `apiDownload` já existente |
| `npm install xlsx`    | Já instalado               | `xlsx: ^0.18.5` já está no `package.json` |
| Layout standalone     | Inconsistente              | Corrigido — todas as páginas usam `PortalShell` |
| Migrations duplicadas | Já estão no projeto        | Não incluídas nesta entrega               |

---

## Estrutura dos arquivos

```
modulo_rs_final/
├── backend/
│   └── src/
│       └── controllers/
│           └── rsController.js          ← substituir o existente (se já foi criado)
│                                          ou adicionar novo
├── frontend/
│   ├── components/
│   │   └── PortalShell.js              ← substituir o existente
│   ├── app/
│   │   ├── login/
│   │   │   └── page.js                 ← substituir o existente
│   │   └── rs/
│   │       ├── page.js                 ← novo (Dashboard)
│   │       ├── rps/
│   │       │   └── page.js             ← novo (Listagem)
│   │       └── relatorio/
│   │           └── page.js             ← novo (Relatório)
└── patches/
    └── PATCH_index_rs_routes.js        ← trecho a inserir no index.js
```

---

## Passo 1 — Backend: rsController.js

Copiar para:
```
backend/src/controllers/rsController.js
```

Se o arquivo já existia de uma entrega anterior, substituir integralmente.

---

## Passo 2 — Backend: patch no index.js

Abrir `patches/PATCH_index_rs_routes.js`.

**2a.** Adicionar o import no topo do `backend/src/index.js`, junto com os outros requires:
```js
const {
  listar: listarRPs, criar: criarRP, detalhe: detalheRP,
  editar: editarRP, excluir: excluirRP,
  getSites: getRSSites, getProdutos: getRSProdutos,
  getDashboard: getRSDashboard, getRelatorio: getRSRelatorio,
  exportar: exportarRS,
} = require("./controllers/rsController");
```

**2b.** Adicionar o bloco de rotas **ANTES de `async function iniciarAplicacao()`**:
Copiar as 10 linhas de `app.get/post/put/delete` do arquivo de patch.

---

## Passo 3 — Frontend: PortalShell.js

Substituir `frontend/components/PortalShell.js` pelo arquivo desta entrega.

O que mudou:
- 3 itens R&S adicionados ao array `menuItems` (roles: `coordenador_rs`, `gestor_rs`)
- Redirect automático: se RS user tentar acessar rota fora de `/rs/*`, vai para `/rs/rps`

---

## Passo 4 — Frontend: login/page.js

Substituir `frontend/app/login/page.js` pelo arquivo desta entrega.

O que mudou: após login bem-sucedido, verifica o perfil:
- `coordenador_rs` ou `gestor_rs` → `/rs/rps`
- Todos os outros → `/inicio` (comportamento original mantido)

---

## Passo 5 — Frontend: páginas R&S

Criar as pastas e copiar os arquivos:

```
frontend/app/rs/page.js           → Dashboard R&S
frontend/app/rs/rps/page.js       → Listagem de RPs
frontend/app/rs/relatorio/page.js → Relatório mensal
```

As pastas `rs/`, `rs/rps/` e `rs/relatorio/` devem ser criadas se não existirem.

---

## Passo 6 — Banco de dados

As migrations já estão no projeto em `database/migrations/`:
- `01_create_rs_sites.sql`
- `02_create_rs_produtos.sql`
- `03_create_rps.sql`
- `04_seeds_rs_sites.sql` ← ajustar `empresa_id` antes de rodar
- `05_alter_usuarios_perfil.sql` ← ler o aviso interno antes de rodar

Se ainda não foram rodadas no Railway, rodar agora uma por vez.

---

## Passo 7 — Criar usuários de R&S

Na página `/usuarios`, criar os usuários do time com os novos perfis:

| Perfil         | O que pode fazer                            |
|----------------|---------------------------------------------|
| coordenador_rs | Criar, editar, excluir RPs + ver relatório |
| gestor_rs      | Somente visualizar RPs e relatório          |

---

## Checklist de validação

### Backend
- [ ] `GET /api/rs/sites` com token de `coordenador_rs` → retorna lista
- [ ] `GET /api/treinamentos` com token de `coordenador_rs` → retorna 403 ✓
- [ ] `POST /api/rs/rps` com token de `gestor_rs` → retorna 403 ✓
- [ ] `GET /api/rs/rps` sem token → retorna 401 ✓
- [ ] `GET /api/rs/exportar?mes=2026-07` → faz download do .xlsx com 3 abas ✓

### Frontend — coordenador_rs
- [ ] Login redireciona para `/rs/rps`
- [ ] Sidebar mostra apenas: Dashboard R&S, Requisições, Relatório Mensal
- [ ] Acesso direto a `/turmas` redireciona para `/rs/rps`
- [ ] Botão "+ Nova RP" aparece na listagem
- [ ] Modal: toggle OPERACIONAL mostra Av. Técnica, oculta Cargo
- [ ] Modal: toggle ESTRATÉGICO mostra Cargo e Fechamento, oculta Av. Técnica
- [ ] Autocomplete de produto funciona ao digitar 2+ caracteres
- [ ] Salvar cria RP e aparece na tabela
- [ ] Linha TOTAL no rodapé soma corretamente
- [ ] Dashboard carrega KPIs, barras de status, top produtos e sites
- [ ] Relatório: filtro Operacional → só tabela Por Produto
- [ ] Relatório: filtro Estratégico → só tabela Por Cargo
- [ ] Botão Exportar faz download do arquivo `.xlsx`

### Frontend — gestor_rs
- [ ] Login redireciona para `/rs/rps`
- [ ] Botão "+ Nova RP" NÃO aparece
- [ ] Botões ✏️ e 🗑 NÃO aparecem nas linhas
- [ ] Consegue ver Dashboard e Relatório normalmente

---

## Arquivos a deletar (se foram criados em entregas anteriores)

- `backend/src/middleware/rsMiddleware.js` → remover
- `frontend/lib/perfilUtils.js` → remover
- Quaisquer arquivos `PATCH_*.js` de sprints anteriores → podem ser descartados
