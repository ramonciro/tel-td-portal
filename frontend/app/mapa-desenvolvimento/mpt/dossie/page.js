"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import { Cabecalho, CSS_BASE, agoraBahia, fmtH, lerParametros, rotuloPeriodo, TXT_SITUACAO } from "../ImpressaoBase";

// Dossiê da Comprovação MPT para imprimir / salvar em PDF (Pacote 2, 04/11/2026): por subdivisão, a cobertura,
// o quadro por operação e a lista de pessoas com horas e situação. As evidências linha a linha ficam no Excel
// (aba Evidências) e no extrato individual. CPF nunca aparece.
//   /mapa-desenvolvimento/mpt/dossie?subtipo=<s>&ano=2026
//   /mapa-desenvolvimento/mpt/dossie?de=2026-01-01&ate=2026-06-30          (todas as subdivisões)

const TXT_FAROL = { verde: "Em dia (90% ou mais)", amarelo: "Atenção (80 a 89%)", vermelho: "Abaixo (menos de 80%)", cinza: "Meta não definida" };

export default function DossieMptPage() {
  const [resumo, setResumo] = useState(null);
  const [pessoas, setPessoas] = useState(null);
  const [erro, setErro] = useState("");
  const [params, setParams] = useState(null);

  useEffect(() => {
    const p = lerParametros();
    setParams(p);
    const q = new URLSearchParams(p.periodo).toString();
    Promise.all([apiFetch(`/mpt/resumo?${q}`), apiFetch(`/mpt/pessoas?${q}`)])
      .then(([r, ps]) => {
        setResumo(r);
        setPessoas(ps);
      })
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal com o perfil da Metodologia e tente novamente."));
  }, []);

  const geradoEm = agoraBahia();
  const periodo = resumo?.periodo;
  const parcial = periodo && !periodo.completo;
  const subs = (resumo?.subdivisoes || []).filter((s) => !params?.subtipo || s.subtipo === params.subtipo);
  const avisos = resumo?.avisos || {};

  return (
    <div className="pagina">
      <style>{CSS_BASE}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>Dossiê da Comprovação MPT — use “Salvar como PDF” na janela de impressão.</span>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {resumo && subs.length === 0 && <div className="erro">Não há horas por subdivisão nesse período.</div>}

      {resumo && subs.length > 0 && (
        <div className="folha">
          <Cabecalho
            titulo="Comprovação de horas de desenvolvimento por subdivisão"
            linhaSub={`${params?.subtipo ? params.subtipo : "Todas as subdivisões"} · período ${rotuloPeriodo(periodo)} · gerado em ${geradoEm}`}
          />
          {parcial && (
            <div className="aviso">
              Período parcial: as horas são do intervalo escolhido. A meta é anual, então não foi comparada aqui (sem farol e sem “atingiu / abaixo”). Para a leitura da meta, use o ano-calendário inteiro.
            </div>
          )}

          {subs.map((s) => {
            const gente = (pessoas?.pessoas || []).filter((p) => p.subtipo === s.subtipo);
            return (
              <div key={s.subtipo} style={{ breakInside: "avoid-page" }}>
                <h2 className="secao">
                  {s.subtipo}
                  <span className="sub"> · {s.meta_horas !== null ? `meta ${parcial ? "anual (referência)" : "interna"}: ${fmtH(s.meta_horas)} h por pessoa` : "meta não definida"}</span>
                </h2>
                <table className="grade">
                  <thead>
                    <tr>
                      <th>Pessoas</th>
                      {!parcial && <th>Atingiram</th>}
                      {!parcial && <th>Abaixo</th>}
                      {!parcial && <th>Sem nenhuma hora</th>}
                      {!parcial && <th>% que atingiu</th>}
                      <th>Horas em jornadas</th>
                      <th>Horas em turmas</th>
                      {!parcial && <th>Farol</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="c">{s.pessoas}</td>
                      {!parcial && <td className="c">{s.atingiram}</td>}
                      {!parcial && <td className="c">{s.abaixo}</td>}
                      {!parcial && <td className="c">{s.sem_hora}</td>}
                      {!parcial && <td className="c">{s.pct === null ? "—" : `${s.pct}%`}</td>}
                      <td className="c">{fmtH(s.horas_jornada)}</td>
                      <td className="c">{fmtH(s.horas_turma)}</td>
                      {!parcial && <td className="c">{TXT_FAROL[s.farol]}</td>}
                    </tr>
                  </tbody>
                </table>

                {s.por_cliente.length > 1 && (
                  <table className="grade" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th className="nome">Operação</th>
                        <th>Pessoas</th>
                        {!parcial && <th>Atingiram</th>}
                        {!parcial && <th>Abaixo</th>}
                        {!parcial && <th>Sem hora</th>}
                        {!parcial && <th>%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {s.por_cliente.map((c) => (
                        <tr key={c.cliente}>
                          <td className="nome">{c.cliente}</td>
                          <td className="c">{c.pessoas}</td>
                          {!parcial && <td className="c">{c.atingiram}</td>}
                          {!parcial && <td className="c">{c.abaixo}</td>}
                          {!parcial && <td className="c">{c.sem_hora}</td>}
                          {!parcial && <td className="c">{c.pct === null ? "—" : `${c.pct}%`}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <table className="grade" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th className="nome">Pessoa</th>
                      <th>Matrícula</th>
                      <th className="nome">Operação</th>
                      <th>Horas</th>
                      <th>{parcial ? "Meta anual (ref.)" : "Meta"}</th>
                      {!parcial && <th>Situação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {gente.map((p) => (
                      <tr key={p.chave}>
                        <td className="nome">{p.nome}{!p.vinculada ? " *" : ""}</td>
                        <td className="c">{p.matricula || "—"}</td>
                        <td className="nome">{p.cliente}</td>
                        <td className="c">{fmtH(p.horas)}</td>
                        <td className="c">{fmtH(parcial ? p.meta_anual : p.meta)}</td>
                        {!parcial && <td className={`c ${p.situacao}`}>{TXT_SITUACAO[p.situacao]}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="legenda">
            * Pessoa que entrou na conta só pelo nome, sem matrícula ou CPF ligados ao cadastro único.
          </div>
          <h2 className="secao">Como a conta é feita</h2>
          <div className="legenda">
            Fontes: encontros de jornada e aulas de turma que têm subdivisão. A mesma hora nunca conta duas vezes. Só conta presença registrada como “presente” (justificado e ausente não somam hora). Mesma pessoa, mesma subdivisão e mesmo dia: conta uma vez só, a de maior carga. O universo é quem está inscrito nas jornadas ou turmas da subdivisão, mesmo com zero hora. A meta é interna de gestão, em horas por pessoa no ano-calendário, definida pela Metodologia — não é exigência legal. O CPF não consta neste documento. As evidências linha a linha estão no dossiê em Excel e no extrato individual.
          </div>
          <h2 className="secao">Pontos de atenção nos dados</h2>
          <div className="legenda">
            Encontros de jornada sem subdivisão (fora da conta): {avisos.encontros_sem_subdivisao || 0} · Turmas com subdivisão sem cronograma (fora da conta): {avisos.turmas_sem_cronograma || 0} · Presenças de turma com nome fora da lista de treinandos (não contadas): {avisos.presencas_sem_vinculo || 0} · Aulas com carga estimada: {avisos.cargas_estimadas || 0} · Pessoas ligadas só pelo nome: {avisos.pessoas_sem_cadastro || 0}.
          </div>
          <div className="assinaturas">
            <div>
              <div className="linha" />
              Metodologia / Coordenação de T&D
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
