"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CelulaBabyCurva from "../../../../components/CelulaBabyCurva";
import { apiFetch } from "../../../../services/api";

// Relatório final da Célula baby (16/10/2026) — fora do PortalShell, para
// imprimir / "Salvar como PDF" no navegador (mesmo caminho dos certificados).
// Precisa estar logado no Portal: os dados vêm da API com o seu login.

const RESULTADO = { passou: "Passou", em_berco: "Em berço", nao_seguiu: "Não seguiu" };
const PARECER = { atingiu: "Atingiu a curva", parcial: "Parcial", abaixo: "Abaixo da curva" };
const STATUS = { a_configurar: "A configurar", em_andamento: "Em andamento", encerrada: "Encerrada" };

const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

export default function RelatorioCelulaBaby() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!id) return;
    apiFetch(`/celulas-baby/${id}`).then(setD).catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [id]);

  const passaram = (d?.pessoas || []).filter((p) => p.resultado === "passou");
  const dias = d?.dias || 7;

  return (
    <div className="pagina">
      <style>{CSS}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>Relatório da célula baby — use “Salvar como PDF” na janela de impressão.</span>
      </div>

      {erro && <div className="erro">{erro}</div>}
      {!d && !erro && <div className="erro">Carregando…</div>}

      {d && (
        <article className="folha">
          <header className="topo">
            <img src="/logo-td.png" alt="Portal T&D" />
            <div>
              <p className="sobre">Treinamento e Desenvolvimento</p>
              <h1>Célula baby — relatório final</h1>
            </div>
          </header>

          <section className="info">
            <div><span>Turma</span><strong>{d.celula.turma_nome}</strong></div>
            <div><span>Cliente</span><strong>{d.celula.cliente || "—"}</strong></div>
            <div><span>Instrutor</span><strong>{d.celula.instrutor || "—"}</strong></div>
            <div><span>Início na operação</span><strong>{fmtData(d.celula.data_inicio_operacao)}</strong></div>
            <div><span>Situação</span><strong>{STATUS[d.celula.status] || d.celula.status}</strong></div>
            <div><span>Encerrada em</span><strong>{d.celula.encerrada_em ? new Date(d.celula.encerrada_em).toLocaleDateString("pt-BR") : "—"}</strong></div>
          </section>

          <h2>Resultado da avaliação técnica e parecer</h2>
          <table>
            <thead><tr><th>Nome</th><th>Matrícula</th><th>Resultado</th><th>Parecer da curva</th><th>Observação</th></tr></thead>
            <tbody>
              {d.pessoas.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td><td>{p.matricula || "—"}</td>
                  <td>{RESULTADO[p.resultado] || "Sem resultado"}</td>
                  <td>{PARECER[p.parecer] || "—"}</td>
                  <td>{p.observacao || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {d.indicadores.map((ind) => {
            const valorDe = (pessoaId, dia) => {
              const l = d.lancamentos.find((x) => x.indicador_id === ind.id && x.pessoa_row_id === pessoaId && x.dia === dia);
              return l ? l.valor : null;
            };
            return (
              <section key={ind.id} className="indicador">
                <h2>{ind.nome}{ind.unidade ? ` (${ind.unidade})` : ""}</h2>
                <p className="leg">{ind.sentido === "menor" ? "Menor é melhor" : "Maior é melhor"}{ind.meta !== null ? ` · meta de referência ${fmt(ind.meta)}` : " · sem meta definida"}</p>
                <CelulaBabyCurva pessoas={passaram} dias={dias} valorDe={valorDe} meta={ind.meta} unidade={ind.unidade || ""} />
                <table>
                  <thead>
                    <tr><th>Pessoa</th>{Array.from({ length: dias }, (_, i) => <th key={i}>D{i + 1}</th>)}<th>Média</th></tr>
                  </thead>
                  <tbody>
                    {passaram.map((p) => {
                      const vs = Array.from({ length: dias }, (_, i) => valorDe(p.id, i + 1));
                      const ok = vs.filter((v) => v !== null);
                      return (
                        <tr key={p.id}>
                          <td>{p.nome}</td>
                          {vs.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}
                          <td className="num"><strong>{ok.length ? fmt(ok.reduce((a, b) => a + b, 0) / ok.length) : "—"}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

          <h2>Relatório do instrutor</h2>
          <p className="texto">{d.celula.relatorio_final || "(sem relatório final registrado)"}</p>
        </article>
      )}
    </div>
  );
}

const CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  body { background: #e5e7eb !important; }
  .pagina { font-family: Inter, Arial, sans-serif; color: #0f172a; }
  .barra { position: sticky; top: 0; z-index: 5; background: #0b1220; color: #fff; padding: 10px 16px; display: flex; gap: 14px; align-items: center; font-size: 13px; }
  .barra button { background: #B45309; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
  .erro { max-width: 600px; margin: 40px auto; background: #fff; padding: 20px; border-radius: 12px; text-align: center; }
  .folha { width: 190mm; margin: 16px auto; background: #fff; padding: 12mm; box-sizing: border-box; }
  .topo { display: flex; gap: 14px; align-items: center; background: #0b1220; color: #fff; padding: 5mm 6mm; border-radius: 6px; margin-bottom: 6mm; }
  .topo img { height: 14mm; }
  .topo h1 { margin: 0; font-size: 16pt; }
  .sobre { margin: 0 0 2px; font-size: 8.5pt; letter-spacing: 2px; text-transform: uppercase; color: #cbd5e1; }
  .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-bottom: 6mm; }
  .info div { display: flex; flex-direction: column; font-size: 10pt; }
  .info span { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
  h2 { font-size: 12pt; margin: 7mm 0 2mm; color: #0b1220; border-bottom: 2px solid #B45309; padding-bottom: 1mm; }
  .leg { margin: 0 0 2mm; font-size: 9pt; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 3mm; }
  th, td { border: 1px solid #cbd5e1; padding: 2mm; text-align: left; }
  th { background: #f1f5f9; }
  td.num { text-align: center; }
  .indicador { break-inside: avoid; page-break-inside: avoid; }
  .texto { white-space: pre-wrap; font-size: 10.5pt; line-height: 1.55; }
  @media print {
    body { background: #fff !important; }
    .barra { display: none; }
    .folha { margin: 0; width: auto; padding: 0; }
    .topo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .legendaBotao { border: 0; }
  }
`;
