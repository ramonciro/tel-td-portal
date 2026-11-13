"use client";

// Importador de planilha do RH (13/11/2026): escolhe o arquivo, simula (não grava nada), mostra o que entra e o que não entra,
// e só então grava. Serve para desligamentos, quadro mensal e pesquisa de desligamento (mesmo fluxo da importação do Canguru).
import { useRef, useState } from "react";
import { apiFetch, apiDownload } from "../services/api";
import { colors } from "../lib/theme";
import { st, fmtN, COR_RH } from "./RhUi";

/** Relatório de uma importação (simulada ou gravada): números, avisos e linhas que não entram. */
export function RelatorioImportacao({ rel, campos = [], titulo }) {
  const quadros = [["Linhas lidas", rel.linhas.lidas], ["Novas", rel.resultado.novas], ["Atualizadas", rel.resultado.atualizadas], ["Já estavam iguais", rel.resultado.iguais], ["Linhas com problema", rel.problemas.length], ["Repetidas na planilha", rel.linhas.duplicadas], ...campos];
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{titulo ? `${titulo}: ` : ""}{rel.simulacao ? "o que o portal encontrou (nada foi gravado)" : "gravado"}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {quadros.map(([k, v]) => (
          <div key={k} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{typeof v === "number" ? fmtN(v) : v}</div>
          </div>
        ))}
      </div>
      {rel.avisos?.length ? <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: colors.warningText }}>{rel.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}
      {rel.problemas?.length ? (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Linhas que não entram ({fmtN(rel.problemas.length)})</h4>
          <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead><tr><th style={st.th}>Linha</th><th style={st.th}>Matrícula</th><th style={st.th}>Motivo</th></tr></thead>
              <tbody>{rel.problemas.slice(0, 300).map((p, i) => <tr key={i}><td style={st.td}>{p.linha}</td><td style={st.td}>{p.matricula || "—"}</td><td style={st.td}>{p.motivo}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RhImportador({ titulo, ajuda, endpoint, modelo, modeloNome, campos, onGravado }) {
  const [arquivo, setArquivo] = useState(null);
  const [rel, setRel] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  const enviar = async (simular) => {
    if (!arquivo) { setMsg({ tipo: "erro", texto: "Escolha a planilha (.xlsx) primeiro." }); return; }
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const fd = new FormData();
      fd.append("arquivos", arquivo); fd.append("simular", simular ? "1" : "0");
      const r = await apiFetch(endpoint, { method: "POST", body: fd });
      setRel(r);
      if (!simular) {
        setMsg({ tipo: "ok", texto: `Gravado: ${fmtN(r.resultado.novas)} novo(s) e ${fmtN(r.resultado.atualizadas)} atualizado(s).` });
        setArquivo(null); if (inputRef.current) inputRef.current.value = "";
        if (onGravado) onGravado();
      }
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao enviar a planilha." }); }
    finally { setOcupado(false); }
  };
  const baixarModelo = () => apiDownload(`/rh/turnover/modelo?tipo=${modelo}`, modeloNome).catch((e) => setMsg({ tipo: "erro", texto: e.message || "Não foi possível baixar o modelo." }));
  const simulado = rel && rel.simulacao;
  const nadaAGravar = rel && (rel.resultado.novas + rel.resultado.atualizadas) === 0;

  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <h3 style={st.cardTitle}>{titulo}</h3>
      <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>{ajuda}</p>
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginBottom: 12 }}>{msg.texto}</div> : null}
      <div style={st.filtros}>
        <div style={{ flex: 2, minWidth: 260 }}>
          <label style={st.label}>Planilha (.xlsx)</label>
          <input ref={inputRef} style={{ ...st.input, paddingTop: 7, height: "auto", minHeight: 38 }} type="file" accept=".xlsx,.csv" onChange={(e) => { setArquivo((e.target.files || [])[0] || null); setRel(null); }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? "Conferindo…" : "Simular (não grava)"}</button>
        <button type="button" style={{ ...st.btn, opacity: simulado && !ocupado && !nadaAGravar ? 1 : 0.45 }} disabled={!simulado || ocupado || nadaAGravar} onClick={() => enviar(false)}>Gravar</button>
        <button type="button" style={st.btnGhost} onClick={baixarModelo}>Baixar modelo</button>
      </div>

      {rel ? <RelatorioImportacao rel={rel} campos={campos ? campos(rel) : []} /> : null}
    </div>
  );
}
