"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch, apiDownload, getStoredUser } from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Minhas atividades (16/10/2026) — Rotina do instrutor.
// Atividades que não nascem dentro de uma turma (consultoria, capacitação,
// vídeo, card…). As registradas dentro de uma turma aparecem aqui também e
// entram no total do mês. Toda atividade tem duração e soma na CH.

function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}
function fmtMinutos(m) {
  const n = Number(m || 0);
  const h = Math.floor(n / 60);
  const min = n % 60;
  if (!h) return `${min}min`;
  return min ? `${h}h ${String(min).padStart(2, "0")}min` : `${h}h`;
}
function mesAtual() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

const VAZIO = { catalogo_id: "", data_atividade: "", minutos: "", tema: "", observacao: "", instrutor: "" };

export default function MinhasAtividadesPage() {
  const usuario = getStoredUser();
  const ehInstrutor = String(usuario?.perfil || "").toLowerCase() === "instrutor";
  const [mes, setMes] = useState(mesAtual());
  const [filtroInstrutor, setFiltroInstrutor] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [instrutores, setInstrutores] = useState([]);

  const carregar = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ mes });
      if (!ehInstrutor && filtroInstrutor) qs.set("instrutor", filtroInstrutor);
      setDados(await apiFetch(`/rotina/minhas-atividades?${qs.toString()}`));
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as atividades.");
    }
  }, [mes, filtroInstrutor, ehInstrutor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!ehInstrutor) {
      apiFetch("/instrutores/opcoes").then((r) => setInstrutores(r?.nomes || [])).catch(() => {});
    }
  }, [ehInstrutor]);

  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const minutosOk = form && Number.isInteger(Number(form.minutos)) && Number(form.minutos) >= 1 && Number(form.minutos) <= 720;
  const valido = form && form.catalogo_id && form.data_atividade && minutosOk && (ehInstrutor || editandoId || form.instrutor.trim());

  function abrir() {
    setEditandoId(null);
    setForm({ ...VAZIO, data_atividade: hoje });
  }
  function abrirEdicao(r) {
    setEditandoId(r.id);
    setForm({ catalogo_id: String(r.catalogo_id || ""), data_atividade: r.data_atividade, minutos: String(r.minutos), tema: r.tema || "", observacao: r.observacao || "", instrutor: r.instrutor || "" });
  }

  async function salvar() {
    try {
      const corpo = {
        catalogo_id: Number(form.catalogo_id), data_atividade: form.data_atividade, minutos: Number(form.minutos),
        tema: form.tema, observacao: form.observacao, participante_id: null, biblioteca_id: null,
      };
      if (editandoId) {
        await apiFetch(`/rotina/registros/${editandoId}`, { method: "PUT", body: JSON.stringify(corpo) });
      } else {
        await apiFetch("/rotina/registros", { method: "POST", body: JSON.stringify({ ...corpo, ...(ehInstrutor ? {} : { instrutor: form.instrutor }) }) });
      }
      setForm(null);
      setEditandoId(null);
      setAviso(editandoId ? "Atividade atualizada." : "Atividade registrada. As horas já entram na CH.");
      setTimeout(() => setAviso(""), 2500);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
    }
  }

  async function excluir(r) {
    if (!window.confirm("Excluir esta atividade? As horas saem da CH do instrutor.")) return;
    try {
      await apiFetch(`/rotina/registros/${r.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível excluir.");
    }
  }

  const registros = useMemo(() => dados?.registros || [], [dados]);
  const total = dados?.total_minutos || 0;

  return (
    <PortalShell>
      <PageHero
        eyebrow="Rotina do instrutor"
        title="Minhas atividades"
        subtitle="Atividades que não nascem dentro de uma turma. As das turmas aparecem aqui também e entram no total do mês. Tudo soma na CH."
        stats={[
          { label: "Total do mês", value: fmtMinutos(total) },
          { label: "Atividades", value: String(registros.length) },
        ]}
      />

      {erro && <div style={alerta}>{erro}</div>}
      {aviso && <div style={okBox}>{aviso}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "16px 0" }}>
        <label style={lab}>Mês
          <input style={input} type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        {!ehInstrutor && (
          <label style={lab}>Instrutor
            <input style={input} list="lista-instrutores" placeholder="Todos" value={filtroInstrutor} onChange={(e) => setFiltroInstrutor(e.target.value)} />
          </label>
        )}
        <div style={{ flex: 1 }} />
        <button style={btnSec} onClick={() => apiDownload(`/rotina/minhas-atividades/exportar?mes=${mes}`, `atividades-instrutor-${mes}.xlsx`).catch((e) => setErro(e.message))}>
          Exportar Excel
        </button>
        {dados?.pode_registrar && <button style={btn} onClick={abrir}>+ Registrar atividade</button>}
      </div>
      <datalist id="lista-instrutores">{instrutores.map((n) => <option key={n} value={n} />)}</datalist>

      {form && (
        <section style={{ ...card, marginBottom: 16 }}>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            <strong>{editandoId ? "Editar atividade" : "Registrar atividade"}</strong>
            <div style={grade3}>
              <label style={lab}>Tipo
                <select style={input} disabled={!!editandoId} value={form.catalogo_id}
                  onChange={(e) => {
                    const c = (dados?.catalogo || []).find((a) => String(a.id) === e.target.value);
                    setForm({ ...form, catalogo_id: e.target.value, minutos: form.minutos || (c?.minutos_padrao ? String(c.minutos_padrao) : "") });
                  }}>
                  <option value="">Escolha…</option>
                  {(dados?.catalogo || []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </label>
              <label style={lab}>Data
                <input style={input} type="date" max={hoje} value={form.data_atividade} onChange={(e) => setForm({ ...form, data_atividade: e.target.value })} />
              </label>
              <label style={lab}>Duração (minutos){minutosOk ? ` = ${fmtMinutos(form.minutos)}` : ""}
                <input style={input} type="number" min={1} max={720} value={form.minutos} onChange={(e) => setForm({ ...form, minutos: e.target.value })} />
              </label>
            </div>
            {!ehInstrutor && !editandoId && (
              <label style={lab}>Instrutor
                <input style={input} list="lista-instrutores" value={form.instrutor} onChange={(e) => setForm({ ...form, instrutor: e.target.value })} />
              </label>
            )}
            <label style={lab}>Tema
              <input style={input} maxLength={300} value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
            </label>
            <label style={lab}>Observação
              <textarea style={{ ...input, minHeight: 70, fontFamily: "inherit" }} maxLength={3000} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn} disabled={!valido} onClick={salvar}>{editandoId ? "Salvar alterações" : "Registrar"}</button>
              <button style={btnSec} onClick={() => { setForm(null); setEditandoId(null); }}>Cancelar</button>
            </div>
          </div>
        </section>
      )}

      {dados?.por_tipo?.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {dados.por_tipo.map((t) => (
            <div key={t.tipo} style={kpi}>
              <div style={{ fontSize: 12, color: colors.textMuted, fontWeight: 700 }}>{t.tipo}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtMinutos(t.minutos)}</div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>{t.qtd} registro(s)</div>
            </div>
          ))}
        </div>
      )}

      <section style={card}>
        {registros.length === 0 ? (
          <div style={vazio}>Nenhuma atividade registrada neste mês.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  {!ehInstrutor && <th style={th}>Instrutor</th>}
                  <th style={th}>Atividade</th><th style={th}>Origem</th><th style={th}>Tema / pessoa</th>
                  <th style={th}>Duração</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{fmtData(r.data_atividade)}</td>
                    {!ehInstrutor && <td style={td}>{r.instrutor}</td>}
                    <td style={{ ...td, fontWeight: 700 }}>{r.tipo_nome}</td>
                    <td style={td}>
                      {r.treinamento_id ? <a href={`/turma/${r.treinamento_id}/rotina`} style={{ color: colors.primary, fontWeight: 700 }}>{r.turma_tema || "Turma"}</a> : "Avulsa"}
                    </td>
                    <td style={td}>{r.pessoa_nome || r.tema || "—"}</td>
                    <td style={td}>{fmtMinutos(r.minutos)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {!r.treinamento_id && (
                        <>
                          <button style={link} onClick={() => abrirEdicao(r)}>Editar</button>{" "}
                          <button style={{ ...link, color: colors.dangerText }} onClick={() => excluir(r)}>Excluir</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalShell>
  );
}

const card = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden" };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginTop: 12 };
const okBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "10px 16px", fontSize: 14, marginTop: 12 };
const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: "#fff" };
const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const grade3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 };
const btn = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const link = { background: "none", border: "none", color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "11px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 16px", fontSize: 14 };
const kpi = { flex: "1 1 170px", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 14px", display: "grid", gap: 2 };
