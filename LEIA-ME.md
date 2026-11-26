# Pacote 1 da revisão geral — dependências, CORS, rota perigosa e CI (26/11/2026)

Sobe por cima do que já está no GitHub (mesmos caminhos). Nada de banco: **não tem migração**.

## O que muda

1. **Dependências atualizadas** (vulnerabilidades críticas/altas do `npm audit`)
   - Frontend: Next.js 16.3.4 → **16.4.6** (e `eslint-config-next` junto), `sharp` e `source-map-js` corrigidos.
   - Backend: Express 4.22.2 (corrige `body-parser` e `proxy-addr`). Só o `package-lock.json` muda.
   - Sobraram avisos **moderados** (uuid, dentro de `exceljs` e `node-cron`) e 1 alto no `image-size` (dentro do `pptxgenjs`, biblioteca que só roda no navegador de quem gera o PPT). Corrigir esses exigiria trocar de versão maior das bibliotecas — fica para depois.
2. **CORS restrito**: a API só aceita chamadas de navegador vindas do portal (`FRONTEND_URL` do Railway, `https://tel-td-portal.vercel.app` e `localhost` para desenvolvimento). Chamadas sem navegador (healthcheck, servidor a servidor) seguem normais. Para liberar outro endereço (domínio próprio, preview da Vercel) crie no Railway a variável `CORS_ORIGINS` com os endereços separados por vírgula.
3. **Rota `/api/zerar-dashboard` removida** (apagava toda a base com um POST de super_admin; nenhuma tela usava). O script de linha de comando `npm run db:zero` continua existindo.
4. **Rotas `/api/admin/jobs/*` só para Super Admin** (radar, pendências, lembretes, certificados, conquistas, backup): elas rodam o trabalho de **todos** os ambientes, e antes qualquer coordenador/supervisor/superintendente de um ambiente podia disparar. O agendamento automático não muda. Nenhuma tela usava essas rotas. *(Se você as dispara à mão com um token que não é de Super Admin, avise.)*
5. **CI no GitHub** (`.github/workflows/ci.yml`): a cada push roda checagem de sintaxe, lint e build do frontend e mostra ✓/✗ ao lado do commit. **Não trava nem atrasa o deploy.**
6. `index.js` passa a exportar o `app` (só abre a porta quando executado direto, como o Railway faz) — preparação para os testes do próximo pacote. Sem efeito em produção.

## Arquivos (sobem nos mesmos caminhos)
- `backend/package.json`, `backend/package-lock.json`
- `backend/src/index.js`
- `backend/src/lib/corsOrigens.js` (novo)
- `frontend/package.json`, `frontend/package-lock.json`
- `.github/workflows/ci.yml` (novo)

> **Atenção com a pasta `.github`:** por começar com ponto, ela pode não subir no arrastar-e-soltar. Se não aparecer no GitHub, use *Add file → Create new file*, digite `.github/workflows/ci.yml` no nome e cole o conteúdo do arquivo `ci.yml` que está na raiz deste zip.

## Como conferir depois de subir
- Railway: o deploy precisa terminar e `https://tel-td-portal-production.up.railway.app/api/health` responder `"status":"ok"`.
- Vercel: o build do frontend precisa concluir; abra o portal, faça login, abra o Dashboard e uma turma.
- Teste rápido de CORS: se o portal carregar normalmente (login, listas), está certo. Se aparecer erro de rede/CORS no navegador, crie `CORS_ORIGINS` com o endereço usado para abrir o portal.
- GitHub → aba *Actions*: deve aparecer a execução "Verificação".

## Como desfazer
Todos os itens são independentes e reversíveis pelo GitHub (reverter o commit). O Express e o Next foram testados aqui (build do frontend e subida do backend).
