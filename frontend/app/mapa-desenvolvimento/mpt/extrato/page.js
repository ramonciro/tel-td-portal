"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import { Cabecalho, CSS_BASE, agoraBahia, dataBR, fmtH, lerParametros, qsApi, rotuloPeriodo, TXT_SITUACAO } from "../ImpressaoBase";

// Extrato individual da Comprovação MPT (Pacote 2, 04/11/2026): uma pessoa por subdivisão, com as horas de
// jornada E de turma, linha a linha. As linhas que não contam (mesmo dia e mesma subdivisão) aparecem marcadas,
// com o motivo. Em lote (?lote=1) sai uma folha por pessoa. CPF nunca aparece.
//   /mapa-desenvolvimento/mpt/extrato?subtipo=<s>&chave=<k>&ano=2026            → uma pessoa
//   /mapa-desenvolvimento/mpt/extrato?subtipo=<s>&lote=1&de=2026-01-01&ate=...   → todas da subdivisão (ou do recorte)

export default function ExtratoMptPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [params, setParams] = useState(null);

  useEffect(() => {
    const p = lerParametros();
    setParams(p);
    if (!p.subtipo) {
      setErro("Escolha a subdivisão na aba Comprovação MPT antes de imprimir o extrato.");
      return;
    }
    if (!p.lote && !p.chave) {
      setErro("Escolha a pessoa (ou o lote) na aba Comprovação MPT antes de imprimir o extrato.");
      return;
    }
    apiFetch(`/mpt/pessoas?${qsApi(p)}`)
      .then(setDados)
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal com o perfil da Metodologia e tente novamente."));
  }, []);

  const geradoEm = agoraBahia();
  const periodo = dados?.periodo;
  const parcial = periodo && !periodo.completo;
  const lista = dados?.pessoas || [];

  return (
    <div className="pagina">
      <style>{CSS_BASE}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>{params?.lote ? `Extratos individuais (${lista.length} pessoa(s))` : "Extrato individual"} — use “Salvar como PDF” na janela de impressão.</span>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {dados && lista.length === 0 && <div className="erro">Nenhuma pessoa encontrada nesse recorte.</div>}

      {lista.map((p, idx) => {
        const contadas = p.evidencias.filter((e) => e.contada);
        const naoContadas = p.evidencias.length - contadas.length;
        const hJornada = contadas.filter((e) => e.fonte === "jornada").reduce((a, e) => a + e.horas, 0);
        const hTurma = contadas.filter((e) => e.fonte === "turma").reduce((a, e) => a + e.horas, 0);
        return (
          <div key={p.chave} className={`folha ${idx < lista.length - 1 ? "quebra" : ""}`}>
            <Cabecalho
              titulo="Extrato individual — Comprovação de horas de desenvolvimento"
              linhaSub={`${p.subtipo} · período ${rotuloPeriodo(periodo)} · gerado em ${geradoEm}`}
            />
            <div className="ficha">
              <div><b>Pessoa:</b> {p.nome}</div>
              <div><b>Matrícula:</b> {p.matricula || "—"}</div>
              <div><b>Operação:</b> {p.cliente || "—"}</div>
              <div><b>Subdivisão:</b> {p.subtipo}</div>
            </div>

            <table className="grade">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fonte</th>
                  <th className="nome">Jornada / turma</th>
                  <th className="nome">Encontro / aula</th>
                  <th>Horas</th>
                  <th>Conta?</th>
                </tr>
              </thead>
              <tbody>
                {p.evidencias.length === 0 ? (
                  <tr><td colSpan={6} className="c">Nenhuma presença registrada nessa subdivisão no período.</td></tr>
                ) : (
                  p.evidencias.map((e, i) => (
                    <tr key={`${e.fonte}-${e.origem_id}-${i}`} className={e.contada ? "" : "nao"}>
                      <td className="c">{dataBR(e.data)}</td>
                      <td className="c">{e.fonte === "turma" ? "Turma" : "Jornada"}</td>
                      <td className="nome">{e.contexto}</td>
                      <td className="nome">{e.titulo}{e.estimada ? " (carga estimada)" : ""}</td>
                      <td className="c">{fmtH(e.horas)}</td>
                      <td className="c">{e.contada ? "Sim" : "Não — mesmo dia"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td colSpan={4}>Total de horas contadas no período</td>
                  <td className="c">{fmtH(p.horas)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4}>Em jornadas / em turmas</td>
                  <td className="c" colSpan={2}>{fmtH(hJornada)} h / {fmtH(hTurma)} h</td>
                </tr>
                <tr>
                  <td colSpan={4}>{parcial ? "Meta anual (referência — não comparada neste período)" : "Meta interna de horas por pessoa no ano"}</td>
                  <td className="c" colSpan={2}>{parcial ? (p.meta_anual ? `${fmtH(p.meta_anual)} h` : "Não definida") : p.meta !== null ? `${fmtH(p.meta)} h` : "Não definida"}</td>
                </tr>
                {!parcial && (
                  <tr>
                    <td colSpan={4}>Situação</td>
                    <td className={`c ${p.situacao}`} colSpan={2}>{TXT_SITUACAO[p.situacao]}</td>
                  </tr>
                )}
              </tfoot>
            </table>

            {naoContadas > 0 && (
              <div className="aviso">
                {naoContadas} registro(s) acima não somam horas: no mesmo dia e na mesma subdivisão a hora conta uma vez só (vale a maior carga).
              </div>
            )}
            {!p.vinculada && (
              <div className="aviso">Esta pessoa entrou na conta só pelo nome, sem matrícula ou CPF ligados ao cadastro único. Confira se não há outro registro dela.</div>
            )}
            <div className="legenda">
              Contam apenas presenças registradas como “presente”; justificado e ausente não somam hora. A meta é interna de gestão, definida pela Metodologia — não é exigência legal. Documento com nome da pessoa: uso interno, guarde conforme a política de dados da empresa.
            </div>
            <div className="assinaturas">
              <div>
                <div className="linha" />
                Metodologia / Coordenação de T&D
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
