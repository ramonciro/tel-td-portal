/**
 * conquistasJob.js
 *
 * Fase 3 do roadmap de competitividade — job diário que calcula as
 * conquistas de gamificação (treinando e instrutor) para cada empresa
 * ativa. Ver services/gamificacaoService.js para as regras (sem IA, sem
 * custo — tudo calculado a partir de dados que o portal já registra).
 *
 * Idempotente: pode ser executado quantas vezes for preciso no mesmo dia
 * sem duplicar conquistas (INSERT IGNORE + UNIQUE no banco).
 */

const { listarEmpresasAtivas } = require("./pendenciasDigest");
const { calcularConquistasTreinandos } = require("../services/gamificacaoService");

async function rodarCalculoConquistas() {
  const empresas = await listarEmpresasAtivas();
  const resultados = [];

  for (const empresa of empresas) {
    // eslint-disable-next-line no-await-in-loop
    const treinandos = await calcularConquistasTreinandos(empresa.id);
    resultados.push({ empresa: empresa.nome, treinandos });
  }

  return resultados;
}

module.exports = { rodarCalculoConquistas };
