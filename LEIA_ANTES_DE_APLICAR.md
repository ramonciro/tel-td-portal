# Pacote — Perfil Comportamental (Lobo/Gato/Tubarão/Águia + DISC) (20/09/2026)

Implementa o pedido de incluir perfil comportamental (Lobo, Gato, Tubarão,
Águia) e DISC no processo de coaching. Registro manual por enquanto, com o
banco pronto pra um questionário pontuado dentro do portal mais pra frente.
Não cria página nova nem item de menu — tudo mora dentro da tela de
Tripulação, que já existe.

## Arquivos deste pacote (5 no total)

**Backend — substituir:**
- `backend/src/database/migrate.js`
- `backend/src/index.js`

**Backend — novos (criar):**
- `backend/src/controllers/perfilComportamentalController.js`
- `backend/src/routes/perfilComportamentalRoutes.js`

**Frontend — substituir:**
- `frontend/app/tripulacao/page.js`

## De onde veio a definição do perfil

Você pediu pra eu pesquisar e definir a melhor versão, já que não é um
framework único e padronizado de mercado. Fiz busca na web (IBC Coaching,
que credita o modelo a uma adaptação da Teoria da Dominância Cerebral de Ned
Herrmann, e mais 3-4 artigos de RH/coaching sobre o mesmo teste) e cheguei
numa versão consolidada, mantendo só o que era consistente entre as fontes:

- **Tubarão** — direto, competitivo, orientado a resultado, decide rápido.
  DISC aproximado: **D (Dominância)**.
- **Gato** — comunicador, empático, gosta de grupo, evita conflito. DISC
  aproximado: **I (Influência)**, com traços de S.
- **Águia** — visionária, criativa, foca no panorama geral, perde detalhe.
  DISC aproximado: **I (Influência)**, com traços de D.
- **Lobo** — metódico, detalhista, confiável, avesso a risco e a pressão.
  DISC aproximado: **C (Conformidade)**, com traços de S.

Importante: essa relação animal↔DISC **não é uma equivalência científica
fechada** — as fontes divergem em detalhe entre si, e o próprio blog do
Método DISC avisa que analogias com animais "podem facilitar uma conversa
inicial, mas não substituem uma metodologia estruturada". Por isso o sistema
trata os dois como registros independentes (você pode preencher só o
animal, só a letra DISC, ou os dois) — nunca um gerado automaticamente a
partir do outro.

## O que muda pra você, na prática

- Na tela de **Tripulação**, cada pessoa ganhou uma coluna **Perfil**: um
  selo colorido (Lobo/Gato/Tubarão/Águia) se já cadastrado, ou um botão
  "+ Perfil" pra cadastrar agora. O cadastro é rápido: perfil principal,
  perfil secundário (opcional, muita gente é uma mistura), letra DISC
  dominante (opcional) e observações livres.
- **A parte que orienta o coaching**: ao abrir "Ver encontros" de alguém que
  já tem coaching individual, se essa pessoa tiver perfil cadastrado
  aparece um quadro **"Abordagem sugerida"** com a característica do perfil
  e uma orientação prática de como abordar aquela pessoa no encontro (ex.:
  pra um Lobo, "leve dados prontos, evite surpresas"; pra um Tubarão, "vá
  direto ao ponto, dê autonomia"). Se a pessoa ainda não tem perfil
  cadastrado, aparece um aviso com um atalho pra cadastrar ali mesmo.

## Banco de dados

Uma tabela nova, criada automaticamente pelo `migrate.js` na próxima subida
do backend: `pessoas_metodologia`. Independente de `coaching_individual` e
de `jornada_participantes` — o perfil é da PESSOA, não do vínculo — mas com
link opcional pros dois (sem FK, mesmo padrão já usado no coaching
individual), então dá pra cadastrar perfil de quem só está em jornada
coletiva, sem coaching ainda.

## Ordem de aplicação

1. Backend primeiro (os 4 arquivos) — reinicie o backend no Railway pra
   `migrate.js` rodar e criar a tabela nova.
2. Frontend depois (o `tripulacao/page.js`) — pode subir junto ou logo em
   seguida.

Nenhuma rota nova de página, nenhum item de menu novo — não precisa mexer
em `PortalShell.js` nem no guard `METODOLOGIA_ROTAS` desta vez.

## O que foi testado

- `node -c` em todos os arquivos de backend alterados/novos — sintaxe OK.
- `npx next build` do frontend — sucesso, continuam as mesmas 45 rotas de
  antes (não criei página nova, só editei a de Tripulação) — sem erro.

Não testei contra um banco MySQL real (o ambiente aqui não tem um) — a
validação foi sintática e de build. Se algo se comportar diferente do
esperado assim que subir, me manda o erro que eu corrijo.

## Pendência em aberto

Hoje o cadastro é manual, um por vez, direto na tela de Tripulação — como
combinamos. O questionário dentro do portal pra pontuar DISC automaticamente
(campos `disc_d`/`disc_i`/`disc_s`/`disc_c` já existem no banco pra isso)
fica pra quando você quiser entrar nessa etapa.
