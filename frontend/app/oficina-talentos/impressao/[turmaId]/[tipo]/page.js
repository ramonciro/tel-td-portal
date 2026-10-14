"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../../services/api";
import { formatDateBR } from "../../../../../lib/date";

// Impressão da Oficina de Talentos (Fase 2, 13/10/2026) — fora do PortalShell,
// pensada para imprimir / "Salvar como PDF" no navegador (mesmo caminho dos
// certificados da Treinamento). Rotas:
//   /oficina-talentos/impressao/<turmaId>/certificados  → todos os certificados da turma
//   /oficina-talentos/impressao/<turmaId>/OT-XXXXXXXXXX → um certificado só (pelo código)
//   /oficina-talentos/impressao/<turmaId>/frequencia    → lista de frequência (assinatura em papel)
// Como o login fica no navegador, quem abre precisa estar logado no Portal.

const LOGO = "/logo-td.png";

function horasTexto(h) {
  if (h === null || h === undefined) return null;
  return `${Number(h).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} horas`;
}

function periodoTexto(ini, fim) {
  if (!ini) return null;
  if (!fim || fim === ini) return `em ${formatDateBR(ini)}`;
  return `de ${formatDateBR(ini)} a ${formatDateBR(fim)}`;
}

export default function ImpressaoOficinaPage() {
  const params = useParams();
  const turmaId = Array.isArray(params?.turmaId) ? params.turmaId[0] : params?.turmaId;
  const tipo = decodeURIComponent(Array.isArray(params?.tipo) ? params.tipo[0] : params?.tipo || "");

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    setOrigem(window.location.origin);
    if (!turmaId || !tipo) return;
    const caminho =
      tipo === "frequencia"
        ? `/oficina-talentos/turmas/${turmaId}/frequencia`
        : tipo === "certificados"
        ? `/oficina-talentos/turmas/${turmaId}/certificados`
        : `/oficina-talentos/turmas/${turmaId}/certificados?codigo=${encodeURIComponent(tipo)}`;
    apiFetch(caminho)
      .then(setDados)
      .catch((e) => setErro(e.message || "Não foi possível carregar. Entre no Portal e tente novamente."));
  }, [turmaId, tipo]);

  const ehFrequencia = tipo === "frequencia";

  return (
    <div className="pagina">
      <style>{CSS}</style>

      <div className="barra">
        <button onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <span>{ehFrequencia ? "Lista de frequência" : "Certificados"} — use “Salvar como PDF” na janela de impressão.</span>
      </div>

      {erro && <div className="erro">{erro}</div>}
      {!dados && !erro && <div className="erro">Carregando…</div>}

      {dados && !ehFrequencia && dados.certificados.length === 0 && <div className="erro">Nenhum certificado emitido para imprimir.</div>}

      {dados &&
        !ehFrequencia &&
        dados.certificados.map((c) => (
          <section className="certificado" key={c.id}>
            <div className="faixa">
              <img src={LOGO} alt="Portal T&D" />
            </div>
            <div className="corpo">
              <p className="sobre">Metodologia e Desenvolvimento</p>
              <h1>CERTIFICADO</h1>
              <p className="texto">Certificamos que</p>
              <p className="nome">{c.nome}</p>
              <p className="texto">
                participou da <strong>Oficina de Talentos — {c.turma_nome}</strong>
                {periodoTexto(c.data_inicio, c.data_fim) ? `, realizada ${periodoTexto(c.data_inicio, c.data_fim)}` : ""}
                {horasTexto(c.carga_horaria) ? `, com carga horária de ${horasTexto(c.carga_horaria)}` : ""}
                {c.percentual_presenca !== null ? ` e frequência de ${Number(c.percentual_presenca).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""}.
              </p>
              <div className="assinaturas">
                <div>
                  <div className="linha" />
                  <strong>{dados.turma.assinatura1_nome || " "}</strong>
                  <span>{dados.turma.assinatura1_cargo}</span>
                </div>
                <div>
                  <div className="linha" />
                  <strong>{dados.turma.assinatura2_nome || " "}</strong>
                  <span>{dados.turma.assinatura2_cargo}</span>
                </div>
              </div>
            </div>
            <p className="validacao">
              Código de validação: <strong>{c.codigo}</strong> · Confira em {origem}/validar-oficina/{c.codigo}
            </p>
          </section>
        ))}

      {dados && ehFrequencia && (
        <section className="lista">
          <div className="listaTopo">
            <img src={LOGO} alt="Portal T&D" />
            <div>
              <h2>Lista de frequência — Oficina de Talentos</h2>
              <p>{dados.turma.nome}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                {dados.modulos.map((m) => (
                  <th key={m.id} className="mod">
                    {m.titulo}
                    <small>{[m.data ? formatDateBR(m.data) : null, m.hora_inicio && m.hora_fim ? `${m.hora_inicio}–${m.hora_fim}` : null].filter(Boolean).join(" ")}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.inscritos.map((i) => (
                <tr key={i.inscricao_id}>
                  <td>{i.nome}</td>
                  <td>{i.matricula}</td>
                  {dados.modulos.map((m) => (
                    <td key={m.id} className="ass" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

const CSS = `
  @page { size: A4 landscape; margin: 0; }
  body { background: #e5e7eb !important; }
  .pagina { font-family: Inter, Arial, sans-serif; color: #0f172a; }
  .barra { position: sticky; top: 0; z-index: 5; background: #0b1220; color: #fff; padding: 10px 16px; display: flex; gap: 14px; align-items: center; font-size: 13px; }
  .barra button { background: #B45309; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
  .erro { max-width: 600px; margin: 40px auto; background: #fff; padding: 20px; border-radius: 12px; text-align: center; }
  .certificado { position: relative; width: 297mm; height: 210mm; margin: 16px auto; background: #fff; box-sizing: border-box; border: 6px double #0b1220; overflow: hidden; page-break-after: always; break-after: page; }
  .certificado .faixa { background: #0b1220; height: 38mm; display: flex; align-items: center; justify-content: center; }
  .certificado .faixa img { height: 26mm; width: auto; }
  .certificado .corpo { text-align: center; padding: 8mm 24mm 0; }
  .sobre { margin: 0; font-size: 11pt; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
  h1 { margin: 4mm 0 2mm; font-size: 34pt; letter-spacing: 8px; color: #0b1220; }
  .texto { font-size: 13pt; line-height: 1.6; color: #334155; margin: 2mm 0; }
  .nome { font-size: 28pt; font-weight: 800; color: #1d4ed8; margin: 3mm 0; border-bottom: 2px solid #f59e0b; display: inline-block; padding: 0 10mm 1mm; }
  .assinaturas { display: flex; justify-content: space-around; margin-top: 16mm; }
  .assinaturas > div { width: 80mm; display: flex; flex-direction: column; gap: 1mm; font-size: 11pt; }
  .assinaturas .linha { border-top: 1.5px solid #0f172a; margin-bottom: 1mm; }
  .assinaturas span { color: #64748b; font-size: 10pt; }
  .validacao { position: absolute; bottom: 6mm; left: 0; right: 0; text-align: center; font-size: 8.5pt; color: #64748b; margin: 0; }
  .lista { width: 297mm; min-height: 210mm; margin: 16px auto; background: #fff; padding: 12mm; box-sizing: border-box; }
  .listaTopo { display: flex; gap: 12px; align-items: center; background: #0b1220; color: #fff; padding: 6mm; border-radius: 6px; margin-bottom: 6mm; }
  .listaTopo img { height: 14mm; }
  .listaTopo h2 { margin: 0; font-size: 15pt; } .listaTopo p { margin: 2px 0 0; font-size: 11pt; opacity: .85; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #94a3b8; padding: 3mm 2mm; text-align: left; }
  th.mod { text-align: center; } th small { display: block; font-weight: 400; color: #64748b; }
  td.ass { min-width: 32mm; }
  @media print {
    body { background: #fff !important; }
    .barra { display: none; }
    .certificado, .lista { margin: 0; box-shadow: none; }
  }
`;
