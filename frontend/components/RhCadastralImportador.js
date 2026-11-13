"use client";

// Importação pelo "Relatório de dados cadastrais" (arquivo geral do RM): o navegador lê o arquivo grande, separa só o que o turnover usa
// e envia duas planilhas pequenas (desligamentos e quadro mensal). CPF, RG, endereço, telefones e nascimento não saem do computador.
import { useRef, useState } from "react";
import { apiFetch } from "../services/api";
import { lerRelatorioCadastral } from "../lib/cadastralRh";
import { colors } from "../lib/theme";
import { st, fmtN, fmtDia, COR_RH } from "./RhUi";
import { RelatorioImportacao } from "./RhImportador";

const vinteQuatroMesesAtras = () => { const d = new Date(); d.setMonth(d.getMonth() - 24); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function RhCadastralImportador({ onGravado }) {
  const [arquivo, setArquivo] = useState(null);
  const [desde, setDesde] = useState(vinteQuatroMesesAtras());
  const [lido, setLido] = useState(null);
  const [rels, setRels] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [fase, setFase] = useState("");
  const inputRef = useRef(null);
  const ocupado = Boolean(fase);

  const ler = async () => {
    if (!arquivo) { setMsg({ tipo: "erro", texto: "Escolha o arquivo do Relatório de dados cadastrais." }); return; }
    setFase("Lendo o arquivo… (pode levar alguns segundos)"); setMsg({ tipo: "", texto: "" }); setRels(null); setLido(null);
    try { setLido(await lerRelatorioCadastral(arquivo, { desde, hojeIso: new Date().toISOString().slice(0, 10) })); }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não consegui ler o arquivo." }); }
    finally { setFase(""); }
  };
  const enviar = async (simular) => {
    if (!lido) return;
    setFase(simular ? "Conferindo…" : "Gravando…"); setMsg({ tipo: "", texto: "" });
    const mandar = async (caminho, file) => { const fd = new FormData(); fd.append("arquivos", file); fd.append("simular", simular ? "1" : "0"); return apiFetch(caminho, { method: "POST", body: fd }); };
    try {
      const desl = await mandar("/rh/turnover/desligamentos/importar", lido.arquivos.desligamentos);
      const quadro = await mandar("/rh/turnover/quadro/importar", lido.arquivos.quadro);
      setRels({ desl, quadro });
      if (!simular) {
        setMsg({ tipo: "ok", texto: `Gravado: ${fmtN(desl.resultado.novas)} desligamento(s) novo(s), ${fmtN(desl.resultado.atualizadas)} atualizado(s) e ${fmtN(quadro.resultado.novas + quadro.resultado.atualizadas)} linha(s) de quadro.` });
        setArquivo(null); setLido(null); if (inputRef.current) inputRef.current.value = ""; if (onGravado) onGravado();
      }
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao enviar." }); }
    finally { setFase(""); }
  };
  const simulado = rels && rels.desl.simulacao;
  const nada = rels && (rels.desl.resultado.novas + rels.desl.resultado.atualizadas + rels.quadro.resultado.novas + rels.quadro.resultado.atualizadas) === 0;
  const r = lido?.resumo;

  return (
    <div style={{ ...st.card, marginTop: 16, borderColor: "#fbcfe8" }}>
      <h3 style={st.cardTitle}>Arquivo geral (Relatório de dados cadastrais)</h3>
      <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>
        Use este caminho quando você só tem o arquivo geral do sistema (o grande, com todo mundo). O portal lê o arquivo <strong>no seu navegador</strong>, tira dele os desligamentos (matrícula, nome, cargo, serviço, site, coordenador, supervisor, admissão, demissão e motivo)
        e calcula o quadro de cada mês pelas datas de admissão e demissão. <strong>CPF, RG, endereço, telefones, e-mail e nascimento não são enviados.</strong> Os desligamentos e o quadro entram juntos.
      </p>
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginBottom: 12 }}>{msg.texto}</div> : null}
      <div style={st.filtros}>
        <div style={{ flex: 2, minWidth: 260 }}>
          <label style={st.label}>Arquivo (.xls ou .xlsx do sistema)</label>
          <input ref={inputRef} style={{ ...st.input, paddingTop: 7, height: "auto", minHeight: 38 }} type="file" accept=".xls,.xlsx,.html,.htm" onChange={(e) => { setArquivo((e.target.files || [])[0] || null); setLido(null); setRels(null); }} />
        </div>
        <div style={{ flex: 1, minWidth: 190 }}>
          <label style={st.label}>Desligamentos a partir de</label>
          <input style={st.input} type="date" value={desde} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDesde(e.target.value); setLido(null); setRels(null); }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={ler}>{fase.startsWith("Lendo") ? "Lendo…" : "1. Ler o arquivo"}</button>
        <button type="button" style={{ ...st.btn, opacity: lido && !ocupado ? 1 : 0.45 }} disabled={!lido || ocupado} onClick={() => enviar(true)}>{fase === "Conferindo…" ? "Conferindo…" : "2. Simular (não grava)"}</button>
        <button type="button" style={{ ...st.btn, opacity: simulado && !ocupado && !nada ? 1 : 0.45 }} disabled={!simulado || ocupado || nada} onClick={() => enviar(false)}>{fase === "Gravando…" ? "Gravando…" : "3. Gravar"}</button>
        {fase ? <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{fase}</span> : null}
      </div>
      {r ? (
        <div style={{ marginTop: 14, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, fontSize: 13 }}>
          <strong>O que o navegador encontrou no arquivo</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
            {[["Pessoas no arquivo", r.pessoas], ["No quadro hoje", r.ativos], ["Desligamentos que entram", r.desligamentos], ["Anteriores a " + fmtDia(desde), r.foraDoPeriodo], ["Com data futura (aviso prévio)", r.futuros], ["Meses de quadro", `${r.meses} (${r.de} a ${r.ate})`]].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{typeof v === "number" ? fmtN(v) : v}</div></div>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: colors.textMuted }}>Arquivo de {r.tamanhoOriginalMb} MB reduzido para cerca de {fmtN(r.tamanhoEnvioKb)} KB de envio. Quem tem desligamento com data futura entra na próxima importação, quando a data chegar.{r.semAdmissao ? ` ${fmtN(r.semAdmissao)} linha(s) sem data de admissão foram ignoradas.` : ""}</p>
        </div>
      ) : null}
      {rels ? (
        <>
          <RelatorioImportacao rel={rels.desl} titulo="Desligamentos" campos={[["Pedidos de demissão", rels.desl.resumo.voluntarios], ["Iniciativa da empresa", rels.desl.resumo.involuntarios], ["Outros motivos", rels.desl.resumo.outros], ["Sem motivo", rels.desl.resumo.nao_informado], ["Saída precoce", rels.desl.resumo.saida_precoce], ["Ligados ao Canguru", rels.desl.resumo.ligados_ao_canguru]]} />
          <RelatorioImportacao rel={rels.quadro} titulo="Quadro mensal" campos={[["Meses", rels.quadro.resumo.meses]]} />
        </>
      ) : null}
    </div>
  );
}
