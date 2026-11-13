"use client";

// Projeto Canguru · Importar avaliações (12/11/2026): até 6 planilhas de uma vez (avaliação de 30, 60 e 90 dias), em dois passos:
// simular (não grava nada, mostra o que foi achado e quem precisa de conferência) e importar de verdade.
// O portal não guarda o login da planilha; o nome vem do cadastro de pessoas.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, perfilRh, ehOperacaoRh, fmtN, COR_RH } from "../../../../components/RhUi";
import { Marca } from "../../../../components/CangaruUi";
import CangaruAdmissoes from "../../../../components/CangaruAdmissoes";

const TIPO_CONFLITO = {
  nome_diferente: "A matrícula existe, mas com outro nome",
  sem_cadastro: "Matrícula sem cadastro no portal",
  sem_matricula: "Sem matrícula na planilha",
};

export default function CangaruImportarPage() {
  const router = useRouter();
  const operacao = ehOperacaoRh(perfilRh());
  const [arquivos, setArquivos] = useState([]);
  const [incluirFora, setIncluirFora] = useState(false);
  const [rel, setRel] = useState(null);
  const [decisoes, setDecisoes] = useState({});
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);
  const [aba, setAba] = useState("avaliacoes");

  useEffect(() => { if (perfilRh() && !operacao) router.replace("/rh/canguru/resultado"); }, [operacao, router]);

  const enviar = async (simular, decisoesUsadas) => {
    if (!arquivos.length) { setMsg({ tipo: "erro", texto: "Escolha pelo menos uma planilha (.xlsx) de avaliação de 30, 60 ou 90 dias." }); return; }
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const fd = new FormData();
      arquivos.forEach((a) => fd.append("arquivos", a));
      fd.append("simular", simular ? "1" : "0");
      fd.append("incluir_fora", incluirFora ? "1" : "0");
      fd.append("decisoes", JSON.stringify(decisoesUsadas || {}));
      const r = await apiFetch("/rh/canguru/importar", { method: "POST", body: fd });
      setRel(r);
      if (simular) {
        // Começa com o que o servidor sugeriu (pular), mantendo o que a pessoa já escolheu.
        const novas = {};
        (r.conflitos || []).forEach((c) => { novas[c.chave] = (decisoesUsadas || {})[c.chave] || { acao: c.decisao === "cadastrar" ? "cadastrar" : "pular" }; });
        setDecisoes(novas);
      } else {
        setMsg({ tipo: "ok", texto: `Importação concluída: ${fmtN(r.avaliacoes.importadas)} avaliações novas e ${fmtN(r.avaliacoes.atualizadas)} atualizadas.` });
        setArquivos([]); if (inputRef.current) inputRef.current.value = "";
      }
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao importar as planilhas." }); }
    finally { setOcupado(false); }
  };

  const escolher = (chave, acao, pessoaId) => setDecisoes((x) => ({ ...x, [chave]: acao === "vincular" ? { acao, pessoa_id: pessoaId } : { acao } }));
  const emMassa = (acao) => {
    const novas = {};
    (rel?.conflitos || []).forEach((c) => {
      if (acao === "cadastrar" && c.pode_cadastrar) novas[c.chave] = { acao: "cadastrar" };
      else if (acao === "cadastrar") novas[c.chave] = decisoes[c.chave] || { acao: "pular" };
      else novas[c.chave] = { acao: "pular" };
    });
    setDecisoes(novas);
  };
  const resumoDecisoes = Object.values(decisoes).reduce((a, d) => { a[d.acao] = (a[d.acao] || 0) + 1; return a; }, {});
  const simulado = rel && rel.simulacao;
  const alterouDecisoes = simulado && (rel.conflitos || []).some((c) => (decisoes[c.chave]?.acao || "pular") !== c.decisao);

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Projeto Canguru" title="Importar avaliações" subtitle="Planilhas das avaliações de 30, 60 e 90 dias. O tipo de cada linha vem da coluna “Tipo de Pesquisa”." />
      <div role="tablist" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {[["avaliacoes", "Avaliações 30, 60 e 90 dias"], ["admissoes", "Datas de admissão em lote"]].map(([k, rot]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)} style={{ ...st.btnGhost, ...(aba === k ? { background: COR_RH, color: "#fff", borderColor: COR_RH } : {}) }}>{rot}</button>
        ))}
      </div>
      {aba === "admissoes" ? <CangaruAdmissoes onVoltar={() => setAba("avaliacoes")} /> : (
      <>
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginTop: 14 }}>{msg.texto}</div> : null}

      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>1. Escolha as planilhas</h3>
        <div style={st.filtros}>
          <div style={{ flex: 2, minWidth: 260 }}>
            <label style={st.label}>Planilhas (.xlsx), até 6 de uma vez</label>
            <input ref={inputRef} style={{ ...st.input, paddingTop: 7, height: "auto", minHeight: 38 }} type="file" accept=".xlsx" multiple onChange={(e) => { setArquivos(Array.from(e.target.files || []).slice(0, 6)); setRel(null); setDecisoes({}); }} />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          <input type="checkbox" checked={incluirFora} onChange={(e) => { setIncluirFora(e.target.checked); setRel(null); }} />
          Incluir cargos fora da operação (por padrão ficam de fora: só entram operador e telemarketing)
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={{ ...st.btn, background: COR_RH, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={() => enviar(true, decisoes)}>{ocupado ? "Conferindo…" : simulado ? "Conferir de novo (não grava)" : "Simular (não grava)"}</button>
          <button type="button" style={{ ...st.btn, opacity: simulado && !ocupado && !alterouDecisoes ? 1 : 0.45 }} disabled={!simulado || ocupado || alterouDecisoes} onClick={() => enviar(false, decisoes)}>Importar de verdade</button>
        </div>
        {alterouDecisoes ? <p style={{ fontSize: 12.5, color: colors.warningText, margin: "10px 0 0", fontWeight: 700 }}>Você mudou as escolhas da conferência. Clique em “Conferir de novo” para ver o efeito antes de importar.</p> : null}
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>O login da planilha <strong>não é gravado</strong>. O nome do novato vem do cadastro de pessoas. Textos livres ficam visíveis só para a equipe do RH, e códigos de doença (CID) são apagados dos textos.</p>
      </div>

      {rel ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>{rel.simulacao ? "2. O que o portal encontrou (nada foi gravado)" : "Importado"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {[
              ["Linhas lidas", fmtN(rel.linhas.lidas)],
              ["Novatos diferentes", fmtN(rel.novatos.distintos)],
              ["Achados pela matrícula", fmtN(rel.novatos.vinculados_por_matricula + rel.novatos.vinculados_por_nome)],
              ["Vinculados na conferência", fmtN(rel.novatos.vinculados_pela_conferencia)],
              ["A cadastrar", fmtN(rel.novatos.a_cadastrar)],
              ["Pulados", fmtN(rel.novatos.pulados)],
              ["Fora da operação", fmtN(rel.novatos.fora_da_operacao)],
              ["Sem data de admissão", fmtN(rel.qualidade.sem_admissao)],
            ].map(([k, v]) => (
              <div key={k} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Arquivos:</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {rel.arquivos.map((a) => <li key={a.nome}>{a.nome}: {fmtN(a.linhas)} linhas, avaliação de {a.tipos.length ? a.tipos.map((t) => `${t} dias`).join(" e ") : "tipo não reconhecido"}</li>)}
            </ul>
            <div style={{ marginTop: 6 }}>Avaliações lidas: {Object.entries(rel.avaliacoes.por_tipo).map(([t, n]) => `${t} dias: ${fmtN(n)}`).join(" · ")}</div>
            {rel.linhas.duplicadas_removidas ? <div>Respostas repetidas descartadas (vale a mais recente): {fmtN(rel.linhas.duplicadas_removidas)}</div> : null}
            {!rel.simulacao ? <div style={{ marginTop: 4 }}>Gravadas: {fmtN(rel.avaliacoes.importadas)} novas, {fmtN(rel.avaliacoes.atualizadas)} atualizadas, {fmtN(rel.avaliacoes.puladas)} puladas.</div> : null}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Marca tom="aviso">{fmtN(rel.sinais.novatos_com_sinal)} com sinal de atenção</Marca>
            <Marca tom="aviso">{fmtN(rel.sinais.recorrentes)} em 2 ou mais avaliações</Marca>
            <Marca tom="neutro">{fmtN(rel.sinais.nas_tres)} nas 3 avaliações</Marca>
            <Marca tom="perigo">{fmtN(rel.sinais.prioritarios)} relatos prioritários</Marca>
          </div>

          {rel.avisos?.length ? <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: colors.warningText }}>{rel.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}

          {rel.fora_da_operacao?.length && !incluirFora ? (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <strong>Cargos fora da operação (ficam de fora):</strong>{" "}
              {rel.fora_da_operacao.map((x) => `${x.funcao} (${x.novatos})`).join(" · ")}
            </div>
          ) : null}

          {rel.conflitos?.length ? (
            <div style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 4px", fontSize: 14 }}>Conferência: {fmtN(rel.conflitos.length)} {rel.conflitos.length === 1 ? "pessoa precisa" : "pessoas precisam"} da sua decisão</h4>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Sem decisão a linha é pulada. “Cadastrar” cria a pessoa no cadastro do portal com a matrícula e o nome da planilha; “Vincular” usa uma pessoa que já existe.</p>
              {rel.simulacao ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                  <button type="button" style={st.btnGhost} onClick={() => emMassa("cadastrar")}>Cadastrar todos os novos</button>
                  <button type="button" style={st.btnGhost} onClick={() => emMassa("pular")}>Pular todos</button>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>Escolhas: {Object.entries(resumoDecisoes).map(([k, v]) => `${v} ${k === "pular" ? "pular" : k === "cadastrar" ? "cadastrar" : "vincular"}`).join(" · ") || "nenhuma"}</span>
                </div>
              ) : null}
              <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead><tr><th style={st.th}>Na planilha</th><th style={st.th}>Situação</th><th style={st.th}>No cadastro do portal</th><th style={st.th}>O que fazer</th></tr></thead>
                  <tbody>
                    {rel.conflitos.map((c) => {
                      const d = decisoes[c.chave] || { acao: "pular" };
                      return (
                        <tr key={c.chave}>
                          <td style={st.td}><strong>{c.nome}</strong><div style={{ fontSize: 11.5, color: colors.textMuted }}>Matrícula {c.matricula || "—"} · {c.site || "—"} · avaliações {c.avaliacoes.join(", ")}</div></td>
                          <td style={st.td}>{TIPO_CONFLITO[c.tipo] || c.tipo}</td>
                          <td style={st.td}>{c.candidatos.length ? c.candidatos.map((p) => <div key={p.id} style={{ fontSize: 12.5 }}>{p.nome} · mat. {p.matricula || "—"}</div>) : <span style={{ color: colors.textMuted }}>Não encontrado</span>}</td>
                          <td style={{ ...st.td, minWidth: 220 }}>
                            {rel.simulacao ? (
                              <select style={st.input} value={d.acao === "vincular" ? `v:${d.pessoa_id}` : d.acao} onChange={(e) => { const v = e.target.value; if (v.startsWith("v:")) escolher(c.chave, "vincular", Number(v.slice(2))); else escolher(c.chave, v); }}>
                                <option value="pular">Pular</option>
                                {c.pode_cadastrar ? <option value="cadastrar">Cadastrar como nova pessoa</option> : null}
                                {c.candidatos.map((p) => <option key={p.id} value={`v:${p.id}`}>Vincular a {p.nome}</option>)}
                              </select>
                            ) : <span style={{ fontWeight: 700 }}>{c.decisao === "cadastrar" ? "Cadastrada" : c.decisao === "vincular" ? "Vinculada" : "Pulada"}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!rel.simulacao ? (
            <p style={{ marginTop: 14 }}>
              <Link href="/rh/canguru" style={{ color: "#9d174d", fontWeight: 800 }}>Abrir o acompanhamento →</Link>{" "}·{" "}
              <Link href="/rh/canguru/atencao" style={{ color: "#9d174d", fontWeight: 800 }}>Ver pontos de atenção →</Link>
            </p>
          ) : null}
        </div>
      ) : null}
      </>
      )}
    </PortalShell>
  );
}
