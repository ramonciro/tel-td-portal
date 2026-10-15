import { apiFetch } from "../services/api";

/**
 * "Chamada sem cronograma" (15/10/2026): turma antiga, que só tem chamada na
 * tabela legada, ganha cronograma e segue a chamada por ele. Primeiro simula
 * (nada é gravado) para avisar o usuário quanto da chamada antiga entra nos
 * dias novos; depois de confirmar, gera de verdade.
 *
 * Devolve { href } com a página da chamada (ou do cronograma), { cancelado: true }
 * se o usuário desistiu, ou { aviso } quando o cronograma foi criado mas é
 * preciso parar para avisar algo. Erros do servidor sobem como exceção.
 */
export async function gerarCronogramaEAbrirChamada(turmaId, confirmar = (m) => window.confirm(m)) {
  const corpo = (extra) => JSON.stringify({ treinamento_id: Number(turmaId), ...extra });

  const sim = await apiFetch("/turma-aulas/gerar-cronograma", { method: "POST", body: corpo({ simular: true }) });
  const antiga = sim?.chamada_antiga || {};
  const linhas = [
    `O portal vai criar ${sim?.total_dias ?? 0} aula(s) no cronograma desta turma (dias úteis entre o início e o fim).`,
  ];
  if (Number(antiga.total) > 0) {
    linhas.push(
      `A turma tem ${antiga.total} registro(s) de chamada antiga: ${antiga.encaixadas} serão encaixados nos dias do cronograma.`
    );
    const soltos = Number(antiga.sem_dia || 0) + Number(antiga.sem_participante || 0);
    if (soltos > 0) {
      linhas.push(
        `${soltos} não têm dia ou nome correspondente (${antiga.sem_dia || 0} fora dos dias do cronograma, ${antiga.sem_participante || 0} com nome que não está na lista da turma). Eles ficam guardados, mas deixam de entrar nas taxas de presença.`
      );
    }
  }
  linhas.push("Continuar?");
  if (!confirmar(linhas.join("\n\n"))) return { cancelado: true };

  const r = await apiFetch("/turma-aulas/gerar-cronograma", { method: "POST", body: corpo({}) });
  if (r?.chamada_antiga?.importacao_falhou) {
    return {
      href: `/turma/${turmaId}/cronograma`,
      aviso:
        "Cronograma criado, mas não foi possível encaixar a chamada antiga nos dias novos. Ela continua valendo nas taxas até a primeira chamada nova; avise a coordenação antes de lançar chamadas.",
    };
  }
  const aula = r?.aula_sugerida;
  return {
    href: aula
      ? `/turma/${turmaId}/chamada?turma_aula_id=${aula.turma_aula_id}&data_aula=${aula.data_aula}`
      : `/turma/${turmaId}/cronograma`,
  };
}
