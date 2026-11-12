"use client";

// Pesquisas de clima (12/11/2026): lista de ciclos e importação da planilha do Prime RH em dois passos (simular, depois importar).
// A pesquisa é anônima: nome, login, matrícula e supervisor da planilha não são gravados.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, FarolPill, pct1, dec1, fmtN, fmtDia, perfilRh, ehOperacaoRh, PERFIL_COORD } from "../../../components/RhUi";

export default function PesquisasClimaPage() {
  const perfil = perfilRh();
  const operacao = ehOperacaoRh(perfil);
  const [ciclos, setCiclos] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [form, setForm] = useState({ nome: "", cliente: "" });
  const [arquivo, setArquivo] = useState(null);
  const [rel, setRel] = useState(null);
  const [substituir, setSubstituir] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  const carregar = useCallback(() => {
    apiFetch("/rh/clima/ciclos").then((r) => setCiclos(r.ciclos || [])).catch((e) => { setCiclos([]); setMsg({ tipo: "erro", texto: e.message || "Não foi possível carregar os ciclos." }); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (simular) => {
    if (!arquivo) { setMsg({ tipo: "erro", texto: "Escolha a planilha (.xlsx) exportada do Prime RH." }); return; }
    if (!form.nome.trim()) { setMsg({ tipo: "erro", texto: "Dê um nome ao ciclo, por exemplo “ACM/INSS 2º semestre 2026”." }); return; }
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      fd.append("nome", form.nome.trim());
      fd.append("cliente", form.cliente.trim());
      fd.append("simular", simular ? "1" : "0");
      if (!simular && substituir) fd.append("substituir", "1");
      const r = await apiFetch("/rh/clima/importar", { method: "POST", body: fd });
      setRel(r);
      if (!simular) {
        setMsg({ tipo: "ok", texto: `Pesquisa importada: ${fmtN(r.linhas.respondentes)} respondentes.` });
        setArquivo(null); if (inputRef.current) inputRef.current.value = "";
        setSubstituir(false);
        carregar();
      }
    } catch (e) {
      if (!simular && e.message && /Já existe um ciclo/.test(e.message)) setSubstituir(false);
      setMsg({ tipo: "erro", texto: e.message || "Erro ao importar a planilha." });
    } finally { setOcupado(false); }
  };

  const excluir = async (c) => {
    if (!window.confirm(`Excluir a pesquisa "${c.nome}"? Os resultados deste ciclo serão apagados e não dá para desfazer.`)) return;
    try { await apiFetch(`/rh/clima/ciclos/${c.id}`, { method: "DELETE" }); setMsg({ tipo: "ok", texto: "Ciclo excluído." }); carregar(); }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível excluir." }); }
  };

  const simulado = rel && rel.simulacao;
  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Clima organizacional" title="Pesquisas de clima" subtitle="Importe a planilha do Prime RH e acompanhe os ciclos já importados." />
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginTop: 14 }}>{msg.texto}</div> : null}

      {operacao ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>Importar uma pesquisa</h3>
          <div style={st.filtros}>
            <Campo label="Nome do ciclo" flex={2} minWidth={240}><input style={st.input} value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); setRel(null); }} placeholder="Ex.: ACM/INSS 2º semestre 2026" maxLength={150} /></Campo>
            <Campo label="Cliente (opcional)" flex={1} minWidth={180}><input style={st.input} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Ex.: ACM / INSS" maxLength={150} /></Campo>
            <Campo label="Planilha do Prime RH (.xlsx)" flex={2} minWidth={240}><input ref={inputRef} style={{ ...st.input, paddingTop: 7 }} type="file" accept=".xlsx" onChange={(e) => { setArquivo(e.target.files?.[0] || null); setRel(null); }} /></Campo>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={{ ...st.btn, background: "#be185d", opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? "Conferindo…" : "1. Simular (não grava)"}</button>
            <button type="button" style={{ ...st.btn, opacity: simulado && !ocupado ? 1 : 0.45 }} disabled={!simulado || ocupado} onClick={() => enviar(false)}>2. Importar de verdade</button>
          </div>
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>Nome, login, matrícula e supervisor da planilha <strong>não são gravados</strong>. O portal guarda só contagens por afirmação, em grupos de pelo menos 10 pessoas.</p>

          {rel ? (
            <div style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{rel.simulacao ? "O que o portal encontrou (nada foi gravado)" : "Importado"}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {[
                  ["Respondentes", fmtN(rel.linhas.respondentes)],
                  ["Período das respostas", `${fmtDia(rel.ciclo.data_ini)} a ${fmtDia(rel.ciclo.data_fim)}`],
                  ["Afirmações e notas", `${rel.qualidade.afirmacoes_identificadas} + ${rel.qualidade.notas_identificadas} áreas`],
                  ["Respostas repetidas descartadas", fmtN(rel.linhas.duplicados_removidos)],
                  ["Positivas / negativas", `${pct1(rel.resultado.pos_pct)} / ${pct1(rel.resultado.neg_pct)}`],
                  ["Nota média das áreas", dec1(rel.resultado.nota_media)],
                ].map(([k, v]) => (
                  <div key={k} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
              {rel.avisos?.length ? <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: colors.warningText }}>{rel.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}
              {rel.simulacao && rel.ja_existe ? (
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
                  Já existe um ciclo com este nome: substituir o resultado dele por esta planilha
                </label>
              ) : null}
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <strong>Recortes que serão gerados (mínimo de {rel.minimo_recorte} pessoas por grupo):</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {rel.recortes.map((r) => (
                    <span key={r.tipo} style={{ padding: "3px 10px", borderRadius: 999, background: colors.neutralLight, fontSize: 12, fontWeight: 700 }}>
                      {r.nome}: {r.grupos} {r.grupos === 1 ? "grupo" : "grupos"}{r.com_demais ? " + Demais" : ""}{r.restrito ? " (só equipe do RH)" : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 13 }}>Prévia dos temas:</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "4px 18px", marginTop: 6 }}>
                  {rel.resultado.temas.map((t) => (
                    <div key={t.nome} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0", borderBottom: `1px solid ${colors.border}` }}>
                      <span>{t.nome}</span><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><strong>{pct1(t.pos_pct)}</strong><FarolPill farol={t.farol} /></span>
                    </div>
                  ))}
                </div>
              </div>
              {!rel.simulacao && rel.ciclo.id ? <p style={{ marginTop: 12 }}><Link href={`/rh/clima/resultado?ciclo=${rel.ciclo.id}`} style={{ color: "#9d174d", fontWeight: 800 }}>Abrir o resultado do ciclo →</Link></p> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ ...st.card, marginTop: 16, color: colors.textSecondary, fontSize: 13.5 }}>A importação é feita pela equipe do RH. Você pode abrir o resultado de qualquer ciclo abaixo.</div>
      )}

      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>Ciclos importados</h3>
        {!ciclos ? <p style={st.vazio}>Carregando…</p> : !ciclos.length ? <p style={st.vazio}>Nenhuma pesquisa importada ainda.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={st.th}>Pesquisa</th><th style={st.th}>Cliente</th><th style={st.th}>Período das respostas</th><th style={{ ...st.th, textAlign: "right" }}>Respondentes</th><th style={st.th}>Importada por</th><th style={st.th}></th></tr></thead>
              <tbody>
                {ciclos.map((c) => (
                  <tr key={c.id}>
                    <td style={st.td}><strong>{c.nome}</strong></td><td style={st.td}>{c.cliente || "—"}</td>
                    <td style={st.td}>{fmtDia(c.data_ini)} a {fmtDia(c.data_fim)}</td><td style={{ ...st.td, textAlign: "right" }}>{fmtN(c.n_respondentes)}</td>
                    <td style={st.td}>{c.importado_por_nome || "—"}<div style={{ fontSize: 11, color: colors.textMuted }}>{c.importado_em}</div></td>
                    <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                      <Link href={`/rh/clima/resultado?ciclo=${c.id}`} style={{ ...st.btnMini, textDecoration: "none", marginRight: 6 }}>Resultado</Link>
                      <Link href={`/rh/clima/recortes?ciclo=${c.id}`} style={{ ...st.btnMini, textDecoration: "none", marginRight: 6 }}>Recortes</Link>
                      {perfil === PERFIL_COORD ? <button type="button" style={st.btnMiniDanger} onClick={() => excluir(c)}>Excluir</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
