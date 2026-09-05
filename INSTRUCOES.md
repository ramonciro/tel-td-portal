# Sprint R&S 1 — Instruções Completas de Instalação

## Estrutura do zip

```
sprint_rs1/
├── migrations/
│   ├── 01_create_rs_sites.sql
│   ├── 02_create_rs_produtos.sql
│   ├── 03_create_rps.sql
│   ├── 04_seeds_rs_sites.sql       ← ajustar empresa_id antes de rodar
│   └── 05_alter_usuarios_perfil.sql ← ler aviso antes de rodar
│
├── backend/
│   └── src/
│       ├── controllers/
│       │   └── rsController.js     → copiar para backend/src/controllers/
│       └── middleware/
│           └── rsMiddleware.js     → copiar para backend/src/middleware/
│
└── frontend/
    ├── lib/
    │   └── perfilUtils.js          → copiar para frontend/lib/
    ├── app/rs/rps/
    │   └── page.js                 → copiar para frontend/app/rs/rps/
    └── patches/
        ├── PATCH_index_backend.js  → instruções para index.js
        ├── PATCH_sidebar.js        → instruções para o sidebar
        └── PATCH_login_redirect.js → instruções para o login
```

---

## Passo 1 — Migrations (Railway Query Editor — UMA por vez)

### 01, 02, 03: Criar tabelas
Rodar em ordem. Cada um cria uma tabela nova, sem risco.

### 04: Seeds de sites
```
⚠️ ANTES de rodar: abrir o arquivo e trocar empresa_id = 1
pelo ID real da Tel na tabela empresas/clientes.
```

### 05: Alterar ENUM de perfil
```
⚠️ ANTES de rodar:
1. No Railway Query Editor, executar:
   SHOW CREATE TABLE usuarios;

2. No resultado, localizar a linha do campo 'perfil' e copiar
   todos os valores atuais do ENUM.

3. Abrir o arquivo 05_alter_usuarios_perfil.sql e garantir
   que o ALTER TABLE lista TODOS os valores existentes
   + os dois novos: 'coordenador_rs', 'gestor_rs'

   Se omitir um valor existente, usuários com aquele perfil
   ficarão com o campo inválido.
```

---

## Passo 2 — Backend: copiar arquivos

```
rsController.js  →  backend/src/controllers/rsController.js
rsMiddleware.js  →  backend/src/middleware/rsMiddleware.js
```

---

## Passo 3 — Backend: patch no index.js

Abrir o arquivo `patches/PATCH_index_backend.js` e:

**3a.** Adicionar os dois imports no topo do index.js:
```js
const rsController                     = require('./controllers/rsController');
const { rsAccessRequired, bloquearRS } = require('./middleware/rsMiddleware');
```

**3b.** Adicionar `bloquearRS` nas rotas sensíveis de T&D.
Ver exemplos comentados no arquivo de patch.

**3c.** Registrar as 7 rotas novas do R&S antes do `app.listen`.

---

## Passo 4 — Frontend: copiar arquivos

```
perfilUtils.js  →  frontend/lib/perfilUtils.js
page.js         →  frontend/app/rs/rps/page.js
                   (criar as pastas rs/ e rps/ se não existirem)
```

---

## Passo 5 — Frontend: patch no sidebar

Abrir `patches/PATCH_sidebar.js` e seguir as instruções:

1. Importar `podeAcessarRS` e `podeAcessarTD` do perfilUtils
2. Envolver itens do T&D com `{verTD && (...)}`
3. Adicionar seção R&S envolta com `{verRS && (...)}`

Usuários de R&S veem apenas o menu R&S.
super_admin vê os dois menus separados por um divisor.

---

## Passo 6 — Frontend: patch no login

Abrir `patches/PATCH_login_redirect.js` e seguir as instruções:

Localizar o `router.push('/inicio')` que ocorre após login bem-sucedido
e substituir pela função `getRedirectPosLogin(user.perfil)`.

Resultado pós-login:
- `coordenador_rs` / `gestor_rs` → `/rs/rps`
- Todos os outros perfis → `/inicio`

---

## Passo 7 — Criar usuários de R&S

No portal (página /usuarios), criar os usuários do time de R&S
com os novos perfis:

| Perfil         | Pode fazer                              |
|----------------|-----------------------------------------|
| coordenador_rs | Criar, editar, excluir RPs + relatórios |
| gestor_rs      | Somente visualizar RPs e relatórios     |

---

## Passo 8 — Checklist de validação

### Backend
- [ ] Rota `/api/rs/sites` retorna a lista de sites (teste no Postman/Insomnia)
- [ ] Rota `/api/rs/rps` com token de `coordenador_rs` retorna 200
- [ ] Rota `/api/treinamentos` com token de `coordenador_rs` retorna 403
- [ ] Rota `/api/rs/rps` sem token retorna 401

### Frontend — usuário coordenador_rs
- [ ] Login redireciona para `/rs/rps` (não para `/inicio`)
- [ ] Sidebar mostra apenas a seção R&S (sem menus de T&D)
- [ ] Acesso direto a `/turmas` redireciona para `/rs/rps`
- [ ] Botão "+ Nova RP" está visível
- [ ] Modal abre com setor OPERACIONAL por padrão
- [ ] Toggle para ESTRATÉGICO: Cargo aparece, campos Av. Técnica somem
- [ ] Autocomplete de produto funciona ao digitar 2+ caracteres
- [ ] Salvar cria a RP e aparece na listagem

### Frontend — usuário gestor_rs
- [ ] Login redireciona para `/rs/rps`
- [ ] Botão "+ Nova RP" NÃO aparece
- [ ] Botões de editar e excluir NÃO aparecem nas linhas

### Frontend — super_admin
- [ ] Sidebar mostra T&D e R&S separados por divisor
- [ ] Consegue acessar `/turmas` normalmente
- [ ] Consegue acessar `/rs/rps` normalmente

---

## Próximos entregáveis (Sprint R&S 2)

- `/api/rs/dashboard` — KPIs consolidados
- `/api/rs/relatorio` — dados das pivot tables
- `/rs` — Dashboard com StatCards e gráfico de status
- `/rs/relatorio` — Relatório mensal + exportação Excel
