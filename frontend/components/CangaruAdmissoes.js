"use client";

// Projeto Canguru · Admissões em lote (13/11/2026): planilha com Matrícula e Data de admissão para completar os novatos que
// ficaram sem data (sem ela o portal não sabe em que dia do Canguru a pessoa está). Simula antes de gravar.
import { useRef, useState } from "react";
import { apiFetch, apiDownload } from "../services/api";
import { colors } from "../lib/theme";
import { st, fmtN, fmtDia, COR_RH } from "./RhUi";

export default function CangaruAdmissoes({ onVoltar }) {
  const [arquivo, setArquivo] = useState(null);
  const [rel, setRel] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  const enviar = async (simular) => {
    if (!arquivo) { setMsg({ tipo: "erro", texto: "Escolha a planilha (.xlsx) com matrícula e data de admissão." }); return; }
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const fd = new FormData();
      fd.append("arquivos", arquivo); fd.append("simular", simular ? "1" : "0");
      const r = await apiFetch("/rh/canguru/admissoes", { method: "POST", body: fd });
      setRel(r);
      if (!simular) { setMsg({ tipo: "ok", texto: `Admissões salvas: ${fmtN(r.resultado.gravadas)} novato(s) atualizados.` }); setArquivo(null); if (inputRef.current) inputRef.current.value = ""; }
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao enviar a planilha." }); }
    finally { setOcupado(false); }
  };
  const baixarModelo = () => apiDownload("/rh/canguru/admissoes/modelo", "modelo_admissoes_canguru.xlsx").catch((e) => setMsg({ tipo: "erro", texto: e.message || "Não foi possível baixar o modelo." }));
  const simulado = rel && rel.simulacao;
  const nadaAGravar = rel && (rel.resultado.novas + rel.resultado.alteradas) === 0;

  return (
    <>
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginTop: 14 }}>{msg.texto}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>1. Escolha a planilha de admissões</h3>
        <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>Precisa ter as colunas <strong>Matrícula</strong> e <strong>Data de admissão</strong> (dia/mês/ano). A coluna Nome é opcional e serve só para conferir. Só entram novatos que já estão no Canguru.</p>
        <div style={st.filtros}>
          <div style={{ flex: 2, minWidth: 260 }}>
            <label style={st.label}>Planilha (.xlsx)</label>
            <input ref={inputRef} style={{ ...st.input, paddingTop: 7, height: "auto", minHeight: 38 }} type="file" accept=".xlsx,.csv" onChange={(e) => { setArquivo((e.target.files || [])[0] || null); setRel(null); }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? "Conferindo…" : "Simular (não grava)"}</button>
          <button type="button" style={{ ...st.btn, opacity: simulado && !ocupado && !nadaAGravar ? 1 : 0.45 }} disabled={!simulado || ocupado || nadaAGravar} onClick={() => enviar(false)}>Salvar as datas</button>
          <button type="button" style={st.btnGhost} onClick={baixarModelo}>Baixar modelo com os novatos sem data</button>
        </div>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>A data da planilha vale como “informada pelo RH”: o cadastro de pessoas não troca mais essa data sozinho. Quem já tinha outra data aparece na lista de alterações antes de você salvar.</p>
      </div>

      {rel ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>{rel.simulacao ? "2. O que o portal encontrou (nada foi gravado)" : "Gravado"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {[["Linhas lidas", rel.linhas.lidas], ["Datas novas", rel.resultado.novas], ["Datas trocadas", rel.resultado.alteradas], ["Já estavam iguais", rel.resultado.iguais], ["Linhas com problema", rel.problemas.length], ["Repetidas na planilha", rel.linhas.duplicadas]].map(([k, v]) => (
              <div key={k} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{fmtN(v)}</div>
              </div>
            ))}
          </div>
          {rel.avisos?.length ? <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: colors.warningText }}>{rel.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}

          {rel.alteracoes?.length ? (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Datas que serão trocadas</h4>
              <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead><tr><th style={st.th}>Linha</th><th style={st.th}>Novato</th><th style={st.th}>Matrícula</th><th style={st.th}>Data atual</th><th style={st.th}>Nova data</th></tr></thead>
                  <tbody>{rel.alteracoes.map((a) => <tr key={`${a.linha}-${a.matricula}`}><td style={st.td}>{a.linha}</td><td style={st.td}>{a.nome || "—"}</td><td style={st.td}>{a.matricula}</td><td style={st.td}>{fmtDia(a.antes)}</td><td style={st.td}><strong>{fmtDia(a.depois)}</strong></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {rel.problemas?.length ? (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Linhas que não entram</h4>
              <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead><tr><th style={st.th}>Linha</th><th style={st.th}>Matrícula</th><th style={st.th}>Nome</th><th style={st.th}>Motivo</th></tr></thead>
                  <tbody>{rel.problemas.map((p, i) => <tr key={i}><td style={st.td}>{p.linha}</td><td style={st.td}>{p.matricula || "—"}</td><td style={st.td}>{p.nome || "—"}</td><td style={st.td}>{p.motivo}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {!rel.simulacao && onVoltar ? <p style={{ marginTop: 14 }}><button type="button" style={st.btnGhost} onClick={onVoltar}>Voltar às avaliações</button></p> : null}
        </div>
      ) : null}
    </>
  );
}
