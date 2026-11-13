"use client";

// Projeto Canguru · Admissões em lote (13/11/2026): planilha com Matrícula e Data de admissão para completar os novatos que
// ficaram sem data (sem ela o portal não sabe em que dia do Canguru a pessoa está). Simula antes de gravar.
import { useRef, useState } from "react";
import { apiFetch, apiDownload } from "../services/api";
import { colors } from "../lib/theme";
import { st, fmtN, fmtDia, COR_RH } from "./RhUi";
import { lerAdmissoesDoCadastral, cruzarAdmissoes, csvAdmissoes } from "../lib/cadastralRh";

export default function CangaruAdmissoes({ onVoltar }) {
  const [arquivo, setArquivo] = useState(null);
  const [rel, setRel] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);
  // Cruzamento com o relatório cadastral (feito no navegador: o arquivo é grande e tem dados pessoais que não saem do computador)
  const [cadFile, setCadFile] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [cruz, setCruz] = useState(null);
  const [incluirConferir, setIncluirConferir] = useState(false);
  const [incluirComData, setIncluirComData] = useState(false);
  const cadRef = useRef(null);

  const lerCadastral = async () => {
    if (!cadFile) { setMsg({ tipo: "erro", texto: "Escolha o Relatório de dados cadastrais (.xls)." }); return; }
    setLendo(true); setMsg({ tipo: "", texto: "" }); setRel(null); setCruz(null);
    try {
      const [lista, cad] = await Promise.all([apiFetch("/rh/canguru/admissoes/novatos"), lerAdmissoesDoCadastral(cadFile)]);
      const r = cruzarAdmissoes(lista.novatos, cad.mapa, { hoje: lista.hoje, incluirComData });
      setCruz({ ...r, total: lista.novatos.length, hoje: lista.hoje, lidas: cad.lidas, comData: incluirComData, novatos: lista.novatos, mapa: cad.mapa });
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não consegui ler o relatório cadastral." }); }
    finally { setLendo(false); }
  };
  const simularDoCadastral = async () => {
    if (!cruz) return;
    const itens = [...cruz.prontas, ...(incluirConferir ? cruz.conferir : [])];
    if (!itens.length) { setMsg({ tipo: "erro", texto: "Não há datas para enviar." }); return; }
    const f = new File([csvAdmissoes(itens)], "admissoes_do_cadastral.csv", { type: "text/csv" });
    setArquivo(f); if (inputRef.current) inputRef.current.value = "";
    await enviar(true, f);
  };

  const enviar = async (simular, arq) => {
    const arquivo_ = arq || arquivo;
    if (!arquivo_) { setMsg({ tipo: "erro", texto: "Escolha a planilha (.xlsx) com matrícula e data de admissão." }); return; }
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const fd = new FormData();
      fd.append("arquivos", arquivo_); fd.append("simular", simular ? "1" : "0");
      const r = await apiFetch("/rh/canguru/admissoes", { method: "POST", body: fd });
      setRel(r);
      if (!simular) { setMsg({ tipo: "ok", texto: `Admissões salvas: ${fmtN(r.resultado.gravadas)} novato(s) atualizados.${r.lote_id ? ` Importação nº ${r.lote_id}: dá para desfazer na aba “Histórico e desfazer” da página Importar.` : ""}` }); setArquivo(null); if (inputRef.current) inputRef.current.value = ""; }
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
        <h3 style={st.cardTitle}>Preencher pelo relatório cadastral (mais rápido)</h3>
        <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>Envie o <strong>Relatório de dados cadastrais</strong> do sistema. O portal procura cada novato pela matrícula e pega a data de admissão. O arquivo é lido <strong>no seu navegador</strong>: CPF, endereço, telefone e os demais dados pessoais não saem do computador; só matrícula, nome e data vão para a conferência.</p>
        <div style={st.filtros}>
          <div style={{ flex: 2, minWidth: 260 }}>
            <label style={st.label}>Relatório de dados cadastrais (.xls)</label>
            <input ref={cadRef} style={{ ...st.input, paddingTop: 7, height: "auto", minHeight: 38 }} type="file" accept=".xls,.html,.htm" onChange={(e) => { setCadFile((e.target.files || [])[0] || null); setCruz(null); }} />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          <input type="checkbox" checked={incluirComData} onChange={(e) => { setIncluirComData(e.target.checked); setCruz(null); }} />
          Comparar também quem já tem data (a simulação mostra o que seria trocado)
        </label>
        <button type="button" style={{ ...st.btn, background: COR_RH, opacity: lendo ? 0.6 : 1 }} disabled={lendo} onClick={lerCadastral}>{lendo ? "Lendo o arquivo…" : "Ler e conferir"}</button>
        {cruz ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              {[["Novatos no Canguru", cruz.total], ["Já tinham data (fora)", cruz.comData ? 0 : cruz.jaTem], ["Datas encontradas", cruz.prontas.length], ["Para conferir", cruz.conferir.length], ["Sem cadastro no relatório", cruz.sem.length]].map(([k, v]) => (
                <div key={k} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{fmtN(v)}</div>
                </div>
              ))}
            </div>
            {cruz.conferir.length ? (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={incluirConferir} onChange={(e) => setIncluirConferir(e.target.checked)} />
                  Incluir também os {fmtN(cruz.conferir.length)} “para conferir” (por padrão ficam de fora)
                </label>
                <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                    <thead><tr><th style={st.th}>Novato</th><th style={st.th}>Matrícula</th><th style={st.th}>Data no cadastral</th><th style={st.th}>Por que conferir</th></tr></thead>
                    <tbody>{cruz.conferir.map((x) => <tr key={x.matricula}><td style={st.td}>{x.nome}</td><td style={st.td}>{x.matricula}</td><td style={st.td}>{fmtDia(x.adm)}</td><td style={st.td}>{x.motivo}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {cruz.sem.length ? (
              <details style={{ marginTop: 12, fontSize: 13 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>{fmtN(cruz.sem.length)} novato(s) não aparecem no relatório (o arquivo cobre só algumas filiais)</summary>
                <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                    <thead><tr><th style={st.th}>Novato</th><th style={st.th}>Matrícula</th></tr></thead>
                    <tbody>{cruz.sem.map((x, i) => <tr key={`${x.matricula}-${i}`}><td style={st.td}>{x.nome}</td><td style={st.td}>{x.matricula || "—"}</td></tr>)}</tbody>
                  </table>
                </div>
                <p style={{ margin: "6px 0 0", color: colors.textMuted }}>Para esses, envie o relatório cadastral das outras filiais ou use a planilha manual abaixo.</p>
              </details>
            ) : null}
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={{ ...st.btn, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado || !(cruz.prontas.length + (incluirConferir ? cruz.conferir.length : 0))} onClick={simularDoCadastral}>
                {ocupado ? "Conferindo…" : `Simular com ${fmtN(cruz.prontas.length + (incluirConferir ? cruz.conferir.length : 0))} data(s) (não grava)`}
              </button>
              {simulado && arquivo && arquivo.name === "admissoes_do_cadastral.csv" ? (
                <button type="button" style={{ ...st.btn, background: "#b45309", opacity: !ocupado && !nadaAGravar ? 1 : 0.45 }} disabled={ocupado || nadaAGravar} onClick={() => enviar(false)}>Salvar as datas</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>Ou escolha uma planilha de admissões</h3>
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
