# Marca da empresa no restante do portal + correção sobre o Dasa Front

## Antes de tudo: uma correção

O achado que te passei no pacote anterior — "o registro do Dasa Front tem um campo `cliente: 'Claro'` estranho" — **estava errado, e o erro foi meu**. Veio de uma leitura malformada de log da Railway (dois resultados de consultas diferentes se misturaram no texto que reconstruí). Refiz a leitura de um jeito confiável e confirmei direto na estrutura da tabela: **`empresas` nunca teve essa coluna**. Não mexi em nada porque não havia nada de errado pra corrigir. Detalhe completo no relatório anexo.

De caminho, já aproveitei pra confirmar que o Dasa Front está certinho: código/subdomínio/contato corretos, João Lobo ativo e já com senha própria (já usou o portal de verdade), zero turmas/certificados (normal, tenant novo). Pode seguir com o IBM sem pendência aqui.

## O que foi feito

**Backend** (`backend/src/routes/authRoutes.js`): o login agora devolve também a marca da empresa do usuário (`user.empresa`: nome, cor, logo) — antes só a tela de login usava isso.

**Frontend** (`frontend/components/PortalShell.js`): o menu lateral e o cabeçalho do resto do portal agora usam essa marca — cor de destaque do item ativo e logo, tanto no computador quanto no celular. Empresas sem cor/logo cadastrados continuam com a aparência padrão de sempre, sem mudança nenhuma.

## Como aplicar

1. Substituir os 2 arquivos acima nos mesmos caminhos do seu repositório.
2. Commit + push (deploy automático).
3. Nenhuma variável de ambiente nova, nenhuma migração nova.

## Como foi testado

- Comparação lado a lado entre um tenant com cor/logo próprios e um sem — capturas em anexo confirmam a cor certa aplicada e o fallback de logo funcionando.
- As 12 verificações de isolamento da Fase 4, as 9 de regressão, e as 7 do login multi-ambiente — todas re-executadas, todas passando.
- `next build` limpo (39/39 rotas).

## Pendência sua (mesma situação de antes)

Uma segunda função temporária que criei na Railway pra consultar produção com segurança (`data-verify-temp`) ainda existe — só leitura, nunca escreveu nada, mas o ideal é remover. Precisa de confirmação com dois fatores no painel da Railway (minhas ferramentas não têm acesso a isso). Mesmo processo de quando você removeu a `db-query-temp` anterior.

## Sugestão de próximo passo

Preencher `cor_primaria`/`logo_url` de verdade para "Tel Centro de Contatos" e "Dasa Front" no formulário de editar empresa (painel admin) — assim que preenchido, o portal inteiro já reflete automaticamente, sem precisar de nova entrega.
