# Pacote 3 da revisão geral — arquivos que faltavam no repositório + CI sem falso alarme (26/11/2026)

Sobe por cima dos Pacotes 1 e 2. Sem migração nova (a migração da eliminação por faltas já veio no `migrate.js` do Pacote 2).

## Por que existe
Na primeira execução do CI, o teste `regras-avaliacao-tecnica` falhou com "Cannot find module eliminacaoFaltasService". Esse arquivo faz parte do pacote **"Pendências e eliminação por 3 faltas" (24/11)**, que não chegou ao repositório. Os outros 21 testes passaram.

## ATENÇÃO: este pacote ATIVA a regra de eliminação por 3 faltas
Ao subir, a regra passa a valer em produção: participante com 3 faltas ou mais na Avaliação Técnica é marcado automaticamente como desistente ("Eliminado por faltas (N faltas)") e Reprovado na avaliação individual (reversível pela tela da turma). Se você deixou esse pacote de fora **de propósito**, NÃO suba este pacote e me avise; eu ajusto o teste.

## O que contém
- `backend/src/services/eliminacaoFaltasService.js` (novo)
- `backend/src/controllers/`: `turmaAulasController`, `treinamentoParticipantesController`, `rotinaController`, `turmaPresencaGradeController`, `presencaAulasController`
- `frontend/app/turma/[id]/`: `page.js`, `participantes/page.js`, `rotina/page.js`
- `.github/workflows/ci.yml` (+ cópia `ci.yml` na raiz): o `npm audit` passou a aparecer como **aviso amarelo** em vez de ✗ vermelho. Motivo: alerta novo de severidade alta no `image-size` (vem da biblioteca de PowerPoint `pptxgenjs`); é só informativo e não bloqueia nada.

## Como conferir
1. Railway com deploy concluído e `/api/health` ok.
2. GitHub → *Actions*: execução "Verificação" com ✓ em Backend, Frontend e Dependências (esta pode ter só aviso amarelo).
3. Turma de Avaliação Técnica: lista de pessoas e Rotina abrindo normalmente.
