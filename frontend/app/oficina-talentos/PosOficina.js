"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";

// Oficina de Talentos — depois do encontro (21/10/2026): avaliação dos módulos pelos
// participantes (anônima), acompanhamento 30/60/90 dias com o gestor e banco de talentos.
// Backend: oficinaPosController.js (/oficina-talentos/reacoes, /acompanhamentos, /banco-talentos).

const fmt = (v, suf = "") => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suf}`);

const ABAS = [
  { id: "reacoes", label: "Avaliação dos módulos" },
  { id: "acomp", label: "Acompanhamento 30/60/90" },
  { id: "banco", label: "Banco de talentos" },
];

const SITUACAO = {
  atrasado: { label: "Atrasado", bg: "#fee2e2", cor: "#991b1b" },
  a_vencer: { label: "Vence em 7 dias", bg: "#fef3c7", cor: "#92400e" },
  futuro: { label: "Agendado", bg: "#e0f2fe", cor: "#075985" },
  realizado: { label: "Realizado", bg: "#dcfce7", cor: "#166534" },
  dispensado: { label: "Dispensado", bg: "#f1f5f9", cor: "#475569" },
};
const RESULTADO = { evoluiu: "Evoluiu", manteve: "Manteve", precisa_apoio: "Precisa de apoio" };

export default function PosOficina({ turmas, setErro, setAviso }) {
  const [aba, setAba] = useState("reacoes");
  const [turmaId, setTurmaId] = useState("");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {ABAS.map((a) => (
          <button key={a.id} type="button" onClick={() => setAba(a.id)} style={aba === a.id ? abaAtiva : abaInativa}>{a.label}</button>
        ))}
        <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)} style={{ ...entrada, marginLeft: "auto", maxWidth: 280 }} aria-label="Turma">
          <option value="">{aba === "reacoes" ? "Escolha a turma" : "Todas as turmas"}</option>
          {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </div>
      {aba === "reacoes" && <Reacoes turmaId={turmaId} setErro={setErro} setAviso={setAviso} />}
      {aba === "acomp" && <Acompanhamento turmaId={turmaId} setErro={setErro} setAviso={setAviso} />}
      {aba === "banco" && <Banco turmaId={turmaId} setErro={setErro} />}
    </div>
  );
}

/* ───────────── Avaliação dos módulos ───────────── */
function Reacoes({ turmaId, setErro, setAviso }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    if (!turmaId) { setDados(null); return; }
    let vivo = true;
    setErro("");
    apiFetch(`/oficina-talentos/reacoes?turma_id=${turmaId}`).then((d) => { if (vivo) setDados(d); }).catch((e) => setErro(e.message || "Erro ao carregar."));
    return () => { vivo = false; };
  }, [turmaId, setErro]);

  if (!turmaId) return <SectionCard title="Avaliação dos módulos"><p style={vazio}>Escolha uma turma acima para ver como os participantes avaliaram cada módulo.</p></SectionCard>;
  if (!dados) return <SectionCard title="Avaliação dos módulos"><p style={vazio}>Carregando…</p></SectionCard>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/avaliar-oficina/${dados.turma.token}` : "";
  async function copiar() {
    try { await navigator.clipboard.writeText(link); setAviso("Link de avaliação copiado. Envie aos participantes depois de cada encontro."); } catch { setAviso(link); }
  }

  return (
    <SectionCard
      title={`Avaliação dos módulos — ${dados.turma.nome}`}
      subtitle="Cada participante avalia só os módulos em que esteve presente. A avaliação é anônima: aqui aparecem notas e comentários, nunca o nome."
      action={<button type="button" style={btnPrimario} onClick={copiar}>Copiar link de avaliação</button>}
    >
      <div style={gradeKpi}>
        <StatCard title="Respostas" value={dados.geral.respostas} accent={colors.primary} />
        <StatCard title="Nota média" value={fmt(dados.geral.media)} subtitle="de 1 a 5" accent={colors.success} />
      </div>
      {!dados.modulos.length ? <p style={vazio}>Esta turma ainda não tem módulos na grade.</p> : (
        <div style={{ display: "grid", gap: 12, padding: "0 16px 16px" }}>
          {dados.modulos.map((m) => {
            const max = Math.max(1, ...m.distribuicao);
            return (
              <div key={m.id} style={cartaoModulo}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <strong>{m.titulo}</strong>
                  <span style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    {m.data ? `${formatDateBR(m.data)} · ` : ""}{m.respostas} resposta(s){m.taxa_resposta !== null ? ` de ${m.presentes} presente(s) (${m.taxa_resposta}%)` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 18, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
                  <div><div style={{ fontSize: 26, fontWeight: 900 }}>{fmt(m.media)}</div><div style={{ fontSize: 11, color: colors.textMuted }}>média</div></div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }} aria-label="Distribuição das notas">
                    {m.distribuicao.map((q, i) => (
                      <div key={i} style={{ textAlign: "center", width: 34 }}>
                        <div style={{ height: 44, display: "flex", alignItems: "flex-end" }}><div style={{ width: "100%", height: `${(q / max) * 100}%`, minHeight: q ? 4 : 0, background: colors.primary, borderRadius: 4 }} /></div>
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>{i + 1}★ · {q}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {m.comentarios.length ? (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
                    {m.comentarios.map((c, i) => <li key={i}>“{c.texto}” <span style={{ color: colors.textMuted }}>({c.nota}★)</span></li>)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/* ───────────── Acompanhamento 30/60/90 ───────────── */
function Acompanhamento({ turmaId, setErro, setAviso }) {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState(null); // item
  const [form, setForm] = useState({ status: "realizado", resultado: "evoluiu", gestor_nome: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro("");
      const q = new URLSearchParams();
      if (turmaId) q.set("turma_id", turmaId);
      if (filtro) q.set("situacao", filtro);
      setDados(await apiFetch(`/oficina-talentos/acompanhamentos${q.toString() ? `?${q}` : ""}`));
    } catch (e) { setErro(e.message || "Erro ao carregar os acompanhamentos."); }
  }, [turmaId, filtro, setErro]);
  useEffect(() => { carregar(); }, [carregar]);

  function abrir(item) {
    setEditando(item);
    setForm({ status: item.status === "pendente" ? "realizado" : item.status, resultado: item.resultado || "evoluiu", gestor_nome: item.gestor_nome || "", observacao: item.observacao || "" });
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      setSalvando(true); setErro("");
      await apiFetch(`/oficina-talentos/acompanhamentos/${editando.id}`, { method: "PUT", body: JSON.stringify(form) });
      setAviso("Acompanhamento registrado."); setEditando(null);
      await carregar();
    } catch (err) { setErro(err.message || "Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  const r = dados?.resumo || {};
  return (
    <>
      <SectionCard title="Acompanhamento pós-oficina" subtitle="Aos 30, 60 e 90 dias do fim da turma, o gestor responde se quem concluiu evoluiu, manteve ou precisa de apoio. Só entra quem recebeu certificado.">
        <div style={gradeKpi}>
          <StatCard title="Atrasados" value={r.atrasado ?? 0} accent={colors.danger} />
          <StatCard title="Vencem em 7 dias" value={r.a_vencer ?? 0} accent={colors.warning} />
          <StatCard title="Agendados" value={r.futuro ?? 0} accent={colors.info} />
          <StatCard title="Realizados" value={r.realizado ?? 0} accent={colors.success} />
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ ...entrada, maxWidth: 240 }} aria-label="Situação">
            <option value="">Todas as situações</option>
            {Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {!dados ? <p style={vazio}>Carregando…</p> : !dados.itens.length ? <p style={vazio}>Nenhum acompanhamento neste filtro. Eles aparecem automaticamente depois que os certificados são emitidos.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead><tr>{["Pessoa", "Turma", "Marco", "Previsto para", "Situação", "Resultado", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {dados.itens.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>{a.nome}<div style={{ fontSize: 11.5, color: colors.textMuted }}>{a.cargo_atual || ""}</div></td>
                    <td style={td}>{a.turma_nome}</td><td style={td}>{a.marco} dias</td><td style={td}>{formatDateBR(a.data_prevista)}</td>
                    <td style={td}><span style={{ ...selo, background: SITUACAO[a.situacao].bg, color: SITUACAO[a.situacao].cor }}>{SITUACAO[a.situacao].label}</span></td>
                    <td style={td}>{a.resultado ? RESULTADO[a.resultado] : "—"}{a.gestor_nome ? <div style={{ fontSize: 11.5, color: colors.textMuted }}>com {a.gestor_nome}</div> : null}</td>
                    <td style={td}><button type="button" style={linkBtn} onClick={() => abrir(a)}>{a.status === "pendente" ? "Registrar" : "Editar"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {editando ? (
        <SectionCard title={`${editando.nome} — retorno de ${editando.marco} dias`} subtitle={editando.turma_nome}>
          <form onSubmit={salvar} style={{ display: "grid", gap: 12, padding: "0 16px 16px" }}>
            <label style={rotulo}>Situação
              <select style={entrada} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="realizado">Realizado</option><option value="pendente">Voltar para pendente</option><option value="dispensado">Dispensado (não se aplica)</option>
              </select>
            </label>
            {form.status === "realizado" ? (
              <label style={rotulo}>Resultado
                <select style={entrada} value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })}>
                  {Object.entries(RESULTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            ) : null}
            <label style={rotulo}>Com quem conversou (gestor)
              <input style={entrada} maxLength={150} value={form.gestor_nome} onChange={(e) => setForm({ ...form, gestor_nome: e.target.value })} />
            </label>
            <label style={rotulo}>Observação
              <textarea style={{ ...entrada, minHeight: 70 }} maxLength={1000} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnSecundario} onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" style={btnPrimario} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </>
  );
}

/* ───────────── Banco de talentos ───────────── */
function Banco({ turmaId, setErro }) {
  const [dados, setDados] = useState(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    setErro("");
    apiFetch(`/oficina-talentos/banco-talentos${turmaId ? `?turma_id=${turmaId}` : ""}`).then((d) => { if (vivo) setDados(d); }).catch((e) => setErro(e.message || "Erro ao carregar o banco de talentos."));
    return () => { vivo = false; };
  }, [turmaId, setErro]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (dados?.talentos || []).filter((x) => !t || [x.nome, x.cargo_almejado, x.turma_nome].join(" ").toLowerCase().includes(t));
  }, [dados, busca]);

  return (
    <SectionCard title="Banco de talentos" subtitle="Quem concluiu a oficina e ainda não foi promovido, com o cargo que almeja e as requisições abertas do R&S que combinam. Visível só para a Metodologia.">
      <div style={gradeKpi}>
        <StatCard title="Concluintes sem promoção" value={dados?.total ?? "—"} accent={colors.primary} />
        <StatCard title="Com vaga compatível" value={dados?.com_vaga_compativel ?? "—"} accent={colors.success} />
        <StatCard title="RPs abertas no R&S" value={dados?.rps_abertas ?? "—"} accent={colors.info} />
      </div>
      <div style={{ padding: "0 16px 12px" }}><input style={{ ...entrada, maxWidth: 320 }} placeholder="Buscar por nome ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      {!dados ? <p style={vazio}>Carregando…</p> : !lista.length ? <p style={vazio}>Nenhum concluinte encontrado.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tabela}>
            <thead><tr>{["Pessoa", "Cargo atual", "Cargo almejado", "Turma", "Presença", "Vagas abertas que combinam"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.inscricao_id}>
                  <td style={td}><strong>{t.nome}</strong></td><td style={td}>{t.cargo_atual || "—"}</td><td style={td}>{t.cargo_almejado}</td>
                  <td style={td}>{t.turma_nome}</td><td style={td}>{fmt(t.presenca_pct, "%")}</td>
                  <td style={td}>{t.vagas_compativeis.length ? t.vagas_compativeis.map((v) => <div key={v.id} style={{ fontSize: 12.5 }}>{v.cargo} · {v.site} · {v.setor} · {v.dias} dias</div>) : <span style={{ color: colors.textMuted }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

const entrada = { width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: "9px 11px", fontSize: 14, background: "#fff", color: colors.textPrimary, fontFamily: "inherit" };
const rotulo = { display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: colors.textSecondary };
const abaBase = { padding: "10px 18px", borderRadius: radius.sm, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14 };
const abaAtiva = { ...abaBase, background: colors.navy, color: "#fff" };
const abaInativa = { ...abaBase, background: colors.surfaceMuted, color: colors.textSecondary };
const btnPrimario = { background: colors.accent, color: "#fff", border: 0, borderRadius: radius.sm, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const btnSecundario = { background: "#fff", color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const linkBtn = { background: "none", border: 0, color: "#1d4ed8", fontWeight: 800, cursor: "pointer", fontSize: 12.5, padding: 0 };
const gradeKpi = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, padding: 16 };
const vazio = { padding: 16, margin: 0, color: colors.textMuted, fontSize: 14 };
const cartaoModulo = { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 14, background: colors.surfaceMuted };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const selo = { display: "inline-block", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" };
