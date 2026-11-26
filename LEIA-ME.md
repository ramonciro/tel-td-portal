# Pacote 2 da revisão geral — subtipos por ambiente + testes automatizados (26/11/2026)

**Sobe por cima do Pacote 1** (este zip já traz o `index.js` completo, com as mudanças do Pacote 1). Mesmos caminhos do GitHub.
Tem **migração automática** (roda sozinha na subida do Railway, é idempotente e não apaga nada).

## 1) Subtipos por ambiente (decisão: "cada ambiente")
- Cada ambiente passa a ter o **seu** catálogo de subtipos (tabela `subtipos` ganha `empresa_id`).
- Na subida, todo ambiente existente recebe uma **cópia do catálogo atual** (mesmos nomes, mesmo item de sistema "Avaliação Técnica"). **Nada muda nas turmas**: o subtipo é gravado como texto e continua igual.
- Daqui para frente, **criar, renomear e desativar** só afeta o ambiente de quem está logado. Renomear atualiza turmas, ações, jornadas, encontros e metas MPT **só daquele ambiente**. Um ambiente não consegue editar o catálogo de outro (devolve "não encontrado").
- Ambiente novo recebe a cópia do "catálogo modelo" na primeira consulta. O Super Admin sem ambiente enxerga/edita o modelo.
- A validação do subtipo ao salvar turma/ação/jornada/meta usa o catálogo do ambiente.
- A regra de **Avaliação Técnica** (justificado = falta, eliminação por 3 faltas, Reembolso, Radar) continua reconhecendo o nome "Avaliação Técnica" e também o nome que cada ambiente tiver dado ao item de sistema.
- Ponto de atenção: registros **antigos sem `empresa_id`** (legado) não acompanham renomeação feita num ambiente.
- Não há mudança nas telas.

## 2) Testes automatizados (O1 e O2) — 32 testes, ~30 s
Veja `backend/tests/LEIA-ME.md`. Resumo: regras da Avaliação Técnica, Radar × R&S, subtipos por ambiente e, principalmente, **isolamento entre ambientes**: todas as rotas de leitura (≈280 × 6 perfis) e de escrita (≈8 mil requisições) conferindo que o ambiente A nunca vê nem altera dado do B. Eu testei os testes: removendo de propósito um filtro de ambiente, o teste falha apontando a rota.
- **O que os testes já encontraram:** as rotas `/api/admin/jobs/*` deixavam qualquer coordenador disparar o trabalho de todos os ambientes (corrigido no Pacote 1). Fora isso, **nenhum vazamento de leitura ou escrita entre ambientes** nas rotas exercitadas.
- Observações para você decidir (não mudei): `/api/auth/ambientes` é pública de propósito (seletor do login) e lista o **nome, código, logo e cor de todos os ambientes** para qualquer pessoa. E o arquivo `tests/consultas-sem-ambiente.baseline.json` registra 9 consultas de apoio (mapas por id, catálogo de salas, nomes de Avaliação Técnica) que não filtram por ambiente e que eu avaliei como seguras.

## 3) CI com testes
`.github/workflows/ci.yml` (v2) agora também sobe um MySQL 9 e roda `npm test`. Continua **sem travar o deploy**. É a primeira vez que os testes rodam no MySQL 9 do GitHub (aqui rodei em MariaDB); se a primeira execução ficar vermelha por diferença de versão do banco, me mande a mensagem que eu ajusto.
Substitua o `ci.yml` do Pacote 1 (mesma observação sobre a pasta `.github`: se não subir arrastando, crie o arquivo pelo botão *Create new file*).

## Arquivos
- `backend/src/index.js`, `backend/src/lib/subtipos.js`, `backend/src/lib/corsOrigens.js`
- `backend/src/controllers/` — `subtiposController`, `acoesDesenvolvimentoController`, `mptController`, `jornadaPresencaController`, `jornadasDesenvolvimentoController`
- `backend/src/database/migrate.js`
- `backend/package.json` (scripts `test`, `test:rapido`, `test:baseline`, `verificar:sintaxe`)
- `backend/tests/**` (novo)
- `.github/workflows/ci.yml` (atualizado)

## Como conferir depois de subir
1. Deploy do Railway concluído e `/api/health` com `"status":"ok"`.
2. Menu **Subtipos** (coordenação): a lista deve aparecer igual à de antes. Renomeie um subtipo de teste e confira que as turmas daquele ambiente acompanham.
3. GitHub → *Actions*: a execução "Verificação" com ✓ (backend com testes, frontend, segurança informativa).
