# Migração Next.js 14 → 16 (Portal T&D)

Este pacote contém a migração do frontend para o Next.js 16 (React 19),
combinada com Ramon após o plano em
`plano-migracao-nextjs-15-16-2026-09.md` (também salvo no projeto). A
auditoria de risco, o motivo de ir direto para o 16 (em vez de parar no 15)
e o resultado dos testes estão no relatório
`relatorio-migracao-nextjs16-2026-09.md` (salvo no projeto) — este arquivo
é só o "como aplicar".

## O que mudou

**Só 3 arquivos** — a auditoria previu (e o teste confirmou) zero mudança
de código de aplicação necessária, porque o frontend não usa nenhum dos
recursos afetados pelas mudanças de quebra do Next 15/16 (ver relatório).

- `package.json` — `next` 14.2.35 → **16.3.4**; `react` e `react-dom`
  18.3.1 → **19.3.0**; adicionado `eslint` + `eslint-config-next` como
  devDependency (gerado pelo codemod oficial do Next — não afeta build nem
  runtime, é só uma configuração de lint disponível para uso futuro, sem
  script `lint` ligado a nada).
- `package-lock.json` — atualizado para as novas versões.
- `eslint.config.mjs` **(novo)** — configuração padrão do
  `eslint-config-next`, gerada automaticamente pelo codemod oficial.
  Nenhum script do `package.json` chama lint (nem `next build` roda lint
  automaticamente a partir do Next 16), então este arquivo é inofensivo —
  fica disponível caso você queira rodar `npx eslint .` manualmente no
  futuro.

Nenhum arquivo de `app/`, `components/`, `lib/` ou `services/` precisou
mudar.

## Como aplicar

1. Substitua `frontend/package.json`, `frontend/package-lock.json` no seu
   repositório e adicione `frontend/eslint.config.mjs` (novo).
2. **Recomendação de segurança extra, por ser major version:** aplique
   isso numa branch separada (ex.: `migracao-nextjs-16`) e abra um PR, em
   vez de subir direto na branch de produção. Como o projeto já está
   conectado ao Vercel via GitHub, isso gera automaticamente um preview
   deployment real — dá pra conferir a URL de preview funcionando de
   verdade antes de fazer o merge para produção. Depois de conferir (ou
   se preferir confiar direto na validação já feita, descrita no
   relatório), é só mergear.
3. Nenhuma variável de ambiente nova é necessária — o Vercel já está
   configurado com Node.js 24.x, acima do mínimo exigido pelo Next 16
   (20.9+).
4. O backend (Railway/Express) **não muda nada** — esta migração é só do
   frontend.

## O que já foi validado antes de entregar

Ver o relatório completo, mas resumindo: build de produção local rodou
limpo sob Turbopack (motor de build novo, padrão a partir do Next 16);
30 páginas testadas via navegador real automatizado (login sintético,
todas as telas principais, as duas rotas dinâmicas de turma, navegação
pelo menu) sem nenhum erro de console, warning de hidratação ou exceção
não tratada; um fluxo de escrita completo (criar material na Biblioteca,
do preenchimento do formulário até o card aparecer na listagem) testado
de ponta a ponta pela interface real, também sem erro.
