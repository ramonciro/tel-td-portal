# Pacote — Etapas da jornada (portos), Clientes da Metodologia e redesign de Trilhas (20/09/2026)

Responde às duas dúvidas que você trouxe depois de testar o Ambiente
Metodologia: "não vi um lugar pra incluir um grupo na jornada" e "as
trilhas ainda não fazem sentido pra mim, parece algo solto".

Sobre a primeira: o cadastro de jornada/grupo já existe — fica em **Mapa
de Desenvolvimento → aba Jornadas**, não em Tripulação (Tripulação é só
coaching individual e perfil comportamental). Não criei nada duplicado
para isso, só deixo registrado aqui pra você achar mais fácil da próxima
vez.

Sobre a segunda, você tinha razão: Trilhas realmente estava solta,
estruturalmente. Investigando o motivo, apareceu um problema maior por
trás — é o que este pacote resolve.

## Achado: o indicador "Adesão ao Cronograma" nunca funcionou

A etapa da jornada com prazo (a tabela `jornadas_etapas`, o que
chamamos de "porto") já tinha toda a lógica pronta no backend desde o
pacote de KPIs — inclusive é o `data_fim` dela que alimenta o indicador
"Adesão ao Cronograma" no card de KPIs de Desenvolvimento. Só que
**nunca existiu uma tela pra cadastrar essas etapas**. Sem etapa
cadastrada, esse indicador sempre esteve vazio, silenciosamente, desde
que foi entregue. Isso não tinha relação com Trilhas — foi descoberto
investigando o que você reportou.

## O que este pacote entrega

**1. Etapas da jornada ("portos"), com tela nova.** Dentro de Mapa de
Desenvolvimento → aba Jornadas, logo abaixo do cadastro da jornada:
cadastre etapas com nome, tipo, objetivo, responsável, prazo (início e
fim — é isso que passa a alimentar o indicador de Adesão), carga
horária prevista/realizada e, se fizer sentido, uma trilha do catálogo
vinculada como conteúdo de apoio. Corrige o indicador vazio.

**2. Lista de clientes exclusiva da Metodologia.** Nova seção "Clientes
da Metodologia", no topo da aba Jornadas — cadastre os nomes uma vez
(pode ativar/desativar depois). **Esta lista não tem nenhuma relação
com a lista de clientes da Treinamento** — são duas listas
independentes no banco, exatamente como você pediu. A partir daqui, os
campos "Cliente" da jornada, do participante, do coaching individual
(em Tripulação) e da trilha deixam de ser texto livre e viram um
`<select>` alimentado por esta lista — acaba o problema de "Safra",
"SAFRA Bank" e "Banco Safra" virarem três clientes diferentes nos
filtros.

**3. Trilhas reestruturada,** seguindo sua orientação de que ela deveria
"ser independente dos outros módulos" e estar "mais organizada":
- O tipo de etapa "Turma" foi removido — era o único ponto que
  acoplava Trilhas à Treinamento (buscava `/api/treinamentos` para
  vincular uma turma real a uma etapa). Agora Trilhas só tem
  Conteúdo, Avaliação e Prática.
- Campo "Cliente" trocado de texto livre para o `<select>` da nova
  lista exclusiva.
- Visual todo refeito em cima do `theme.js` (as mesmas cores, raios de
  borda e componentes `SectionCard`/`StatCard` já usados em Tripulação
  e KPIs de Desenvolvimento) — antes usava cores fixas em hexadecimal
  espalhadas pelo arquivo e um ícone de emoji solto que nem aparecia
  de fato (o `PageHero` não tem esse campo).

**O que eu não toquei, por decisão sua:** o rastreamento de progresso
por login (`trilha_progresso`) e a conquista de gamificação ao concluir
uma trilha continuam exatamente como estavam — infraestrutura válida
para quando o treinando ganhar acesso ao portal, só ainda não é usada
agora, e você foi claro que isso é uma etapa futura.

## Arquivos deste pacote (8 no total)

**Backend — substituir:**
- `backend/src/database/migrate.js`
- `backend/src/index.js`
- `backend/src/controllers/jornadasEtapasController.js`

**Backend — novos (criar):**
- `backend/src/controllers/metodologiaClientesController.js`
- `backend/src/routes/metodologiaClientesRoutes.js`

**Frontend — substituir:**
- `frontend/app/mapa-desenvolvimento/page.js`
- `frontend/app/tripulacao/page.js`
- `frontend/app/trilhas/page.js`

## Banco de dados

Duas mudanças novas, aplicadas automaticamente pelo `migrate.js` na
próxima subida do backend:

- Tabela nova `metodologia_clientes` (id, nome, status, observacoes,
  empresa_id) — sem FK, sem nenhuma relação com a tabela `clientes` da
  Treinamento.
- Coluna nova `trilha_id` em `jornadas_etapas` (opcional, sem FK) — o
  vínculo "trilha vinculada" no cadastro de etapa.

Os campos "cliente" que já existiam (`jornadas_desenvolvimento`,
`jornada_participantes`, `trilhas_aprendizagem`, `coaching_individual`)
continuam `VARCHAR` livre no banco — não converti para chave
estrangeira, pra não quebrar nenhum dado já digitado. O que muda é só
que o formulário agora oferece nomes desta lista num `<select>`, em vez
de deixar digitar qualquer coisa. Se um registro antigo já tiver um
nome de cliente que não está mais na lista ativa, o próprio nome
aparece como opção extra no `<select>` daquele registro — o dado não
some.

## Ordem de aplicação

1. Backend primeiro (os 5 arquivos) — reinicie o backend no Railway pra
   `migrate.js` rodar e criar a tabela/coluna novas.
2. Frontend depois (os 3 arquivos) — pode subir junto ou logo em
   seguida.

Nenhuma rota nova de página, nenhum item de menu novo — não precisa
mexer em `PortalShell.js` nem no guard `METODOLOGIA_ROTAS`.

## O que foi testado

- `node -c` em todos os arquivos de backend alterados/novos — sintaxe
  OK.
- `npx next build` do frontend — sucesso, continuam as mesmas 45 rotas
  de antes (não criei página nova) — sem erro.

Não testei contra um banco MySQL real (o ambiente aqui não tem um) — a
validação foi sintática e de build. Se algo se comportar diferente do
esperado assim que subir, me manda o erro que eu corrijo.

## Pendência natural desta entrega

Depois de cadastrar as primeiras etapas com prazo, vale conferir o
card "Adesão ao Cronograma" em KPIs de Desenvolvimento — ele deve
parar de aparecer vazio.
