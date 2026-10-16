"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Catálogo e modelos da Rotina do instrutor (16/10/2026) — coordenação.
//  · Catálogo de atividades: o que o instrutor pode escolher/registrar.
//  · Modelo da Avaliação Técnica: checklist (Véspera/Início/Final) e
//    responsabilidades com prazo. Mudar o modelo vale para as turmas NOVAS;
//    turmas já abertas mantêm a cópia que receberam.

const ETAPAS = [["vespera", "Véspera"], ["inicio", "Início"], ["final", "Final"]];
const ANCORAS = [["inicio", "Início da turma"], ["fim", "Fim da turma"], ["continuo", "Contínua (sem prazo)"]];

export default function RotinaCatalogoPage() {
  const [aba, setAba] = useState("catalogo");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function ok(msg) {
    setAviso(msg);
    setTimeout(() => setAviso(""), 2500);
  }

  return (
    <PortalShell>
      <PageHero
        eyebrow="Rotina do instrutor"
        title="Catálogo e modelos"
        subtitle="Atividades que o instrutor pode registrar, e o modelo de checklist e responsabilidades da Avaliação Técnica."
      />
      {erro && <div style={alerta}>{erro}</div>}
      {aviso && <div style={okBox}>{aviso}</div>}
      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        {[["catalogo", "Catálogo de atividades"], ["modelo", "Modelo da Avaliação Técnica"]].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ ...aba_, ...(aba === k ? abaOn : null) }}>{l}</button>
        ))}
      </div>
      {aba === "catalogo" ? <Catalogo setErro={setErro} ok={ok} /> : <Modelo setErro={setErro} ok={ok} />}
    </PortalShell>
  );
}

/* ───────────────────────── catálogo ───────────────────────── */

function Catalogo({ setErro, ok }) {
  const [itens, setItens] = useState(null);
  const [edit, setEdit] = useState(null); // {id|null, ...campos}

  const carregar = useCallback(async () => {
    try {
      const d = await apiFetch("/rotina/catalogo");
      setItens(d.itens);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o catálogo.");
    }
  }, [setErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    try {
      const corpo = {
        nome: edit.nome, descricao: edit.descricao, pede_pessoa: !!edit.pede_pessoa,
        minutos_padrao: edit.minutos_padrao === "" || edit.minutos_padrao == null ? null : Number(edit.minutos_padrao),
        marcada_padrao: !!edit.marcada_padrao, marcada_padrao_avtec: !!edit.marcada_padrao_avtec, ativo: edit.ativo !== false && edit.ativo !== 0,
      };
      if (edit.id) await apiFetch(`/rotina/catalogo/${edit.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      else await apiFetch("/rotina/catalogo", { method: "POST", body: JSON.stringify(corpo) });
      setEdit(null);
      ok("Catálogo atualizado.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
    }
  }

  async function alternarAtivo(i) {
    try {
      await apiFetch(`/rotina/catalogo/${i.id}`, {
        method: "PUT",
        body: JSON.stringify({ nome: i.nome, descricao: i.descricao, pede_pessoa: !!i.pede_pessoa, minutos_padrao: i.minutos_padrao, ativo: !i.ativo }),
      });
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível alterar.");
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={btn} onClick={() => setEdit({ id: null, nome: "", descricao: "", minutos_padrao: "", pede_pessoa: false, marcada_padrao: false, marcada_padrao_avtec: false, ativo: true })}>+ Nova atividade</button>
      </div>

      {edit && (
        <section style={{ ...card, marginBottom: 16 }}>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            <strong>{edit.id ? "Editar atividade" : "Nova atividade"}</strong>
            <div style={grade2}>
              <label style={lab}>Nome
                <input style={input} maxLength={120} value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
              </label>
              <label style={lab}>Duração padrão (minutos, opcional)
                <input style={input} type="number" min={1} max={720} value={edit.minutos_padrao ?? ""} onChange={(e) => setEdit({ ...edit, minutos_padrao: e.target.value })} />
              </label>
            </div>
            <label style={lab}>Descrição
              <input style={input} maxLength={1000} value={edit.descricao || ""} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} />
            </label>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <label style={chk}><input type="checkbox" checked={!!edit.pede_pessoa} onChange={(e) => setEdit({ ...edit, pede_pessoa: e.target.checked })} /> Refere-se a uma pessoa da turma</label>
              <label style={chk}><input type="checkbox" checked={!!edit.marcada_padrao} onChange={(e) => setEdit({ ...edit, marcada_padrao: e.target.checked })} /> Já vem marcada em formação continuada</label>
              <label style={chk}><input type="checkbox" checked={!!edit.marcada_padrao_avtec} onChange={(e) => setEdit({ ...edit, marcada_padrao_avtec: e.target.checked })} /> Já vem marcada em Avaliação Técnica</label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn} disabled={!String(edit.nome || "").trim()} onClick={salvar}>Salvar</button>
              <button style={btnSec} onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </section>
      )}

      <section style={card}>
        {itens === null ? <div style={vazio}>Carregando…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>
                  <th style={th}>Atividade</th><th style={th}>Duração padrão</th><th style={th}>Pede pessoa</th>
                  <th style={th}>Uso</th><th style={th}>Situação</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} style={{ opacity: i.ativo ? 1 : 0.55 }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{i.nome}{Number(i.tem_prazo_fim_turma) === 1 ? " · obrigatória, com prazo ao concluir a turma" : ""}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>{i.descricao}</div>
                    </td>
                    <td style={td}>{i.minutos_padrao ? `${i.minutos_padrao} min` : "—"}</td>
                    <td style={td}>{Number(i.pede_pessoa) ? "Sim" : "Não"}</td>
                    <td style={td}>{i.registros_em_uso} registro(s) · {i.turmas_em_uso} turma(s)</td>
                    <td style={td}>{i.ativo ? "Ativa" : "Desativada"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button style={link} onClick={() => setEdit({ ...i })}>Editar</button>{" "}
                      {!Number(i.tem_prazo_fim_turma) && !Number(i.sistema) && (
                        <button style={link} onClick={() => alternarAtivo(i)}>{i.ativo ? "Desativar" : "Reativar"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ───────────────────────── modelo ───────────────────────── */

function Modelo({ setErro, ok }) {
  const [checklist, setChecklist] = useState(null);
  const [tarefas, setTarefas] = useState([]);
  const [sujo, setSujo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await apiFetch("/rotina/modelos");
      setChecklist(d.checklist.map((c) => ({ etapa: c.etapa, texto: c.texto })));
      setTarefas(d.tarefas.map((t) => ({ item: t.item, o_que_fazer: t.o_que_fazer || "", ancora: t.ancora, offset_dias: t.offset_dias, dias_uteis: !!t.dias_uteis })));
      setSujo(false);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o modelo.");
    }
  }, [setErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mover(lista, set, idx, delta) {
    const j = idx + delta;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[idx], nova[j]] = [nova[j], nova[idx]];
    set(nova);
    setSujo(true);
  }

  async function salvar() {
    try {
      await apiFetch("/rotina/modelos", {
        method: "PUT",
        body: JSON.stringify({
          checklist: checklist.filter((c) => c.texto.trim()),
          tarefas: tarefas.filter((t) => t.item.trim()).map((t) => ({ ...t, offset_dias: Number(t.offset_dias) || 0 })),
        }),
      });
      ok("Modelo salvo. Vale para as turmas novas.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar o modelo.");
    }
  }

  if (!checklist) return <div style={vazio}>Carregando…</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={aviso2}>Mudanças aqui valem para as turmas de Avaliação Técnica criadas daqui para frente. As turmas que já abriram a rotina mantêm o checklist e as responsabilidades que receberam.</div>

      {ETAPAS.map(([etapa, rotulo]) => (
        <section key={etapa} style={card}>
          <div style={cab}><h2 style={h2}>Checklist · {rotulo}</h2></div>
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {checklist.map((c, idx) => c.etapa !== etapa ? null : (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input style={input} maxLength={500} value={c.texto} onChange={(e) => { const n = [...checklist]; n[idx] = { ...c, texto: e.target.value }; setChecklist(n); setSujo(true); }} />
                <button style={mini} title="Subir" onClick={() => mover(checklist, setChecklist, idx, -1)}>↑</button>
                <button style={mini} title="Descer" onClick={() => mover(checklist, setChecklist, idx, 1)}>↓</button>
                <button style={{ ...mini, color: colors.dangerText }} title="Remover" onClick={() => { setChecklist(checklist.filter((_, i) => i !== idx)); setSujo(true); }}>✕</button>
              </div>
            ))}
            <div><button style={btnSec} onClick={() => { setChecklist([...checklist, { etapa, texto: "" }]); setSujo(true); }}>+ Adicionar item</button></div>
          </div>
        </section>
      ))}

      <section style={card}>
        <div style={cab}><h2 style={h2}>Responsabilidades</h2></div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          {tarefas.map((t, idx) => (
            <div key={idx} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 10, display: "grid", gap: 8 }}>
              <div style={grade2}>
                <label style={lab}>Item
                  <input style={input} maxLength={200} value={t.item} onChange={(e) => { const n = [...tarefas]; n[idx] = { ...t, item: e.target.value }; setTarefas(n); setSujo(true); }} />
                </label>
                <label style={lab}>O que fazer
                  <input style={input} maxLength={600} value={t.o_que_fazer} onChange={(e) => { const n = [...tarefas]; n[idx] = { ...t, o_que_fazer: e.target.value }; setTarefas(n); setSujo(true); }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={lab}>Prazo conta a partir de
                  <select style={input} value={t.ancora} onChange={(e) => { const n = [...tarefas]; n[idx] = { ...t, ancora: e.target.value }; setTarefas(n); setSujo(true); }}>
                    {ANCORAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                {t.ancora !== "continuo" && (
                  <>
                    <label style={{ ...lab, width: 130 }}>Dias (− antes, + depois)
                      <input style={input} type="number" min={-60} max={60} value={t.offset_dias} onChange={(e) => { const n = [...tarefas]; n[idx] = { ...t, offset_dias: e.target.value }; setTarefas(n); setSujo(true); }} />
                    </label>
                    <label style={chk}><input type="checkbox" checked={t.dias_uteis} onChange={(e) => { const n = [...tarefas]; n[idx] = { ...t, dias_uteis: e.target.checked }; setTarefas(n); setSujo(true); }} /> Contar só dias úteis</label>
                  </>
                )}
                <div style={{ flex: 1 }} />
                <button style={mini} title="Subir" onClick={() => mover(tarefas, setTarefas, idx, -1)}>↑</button>
                <button style={mini} title="Descer" onClick={() => mover(tarefas, setTarefas, idx, 1)}>↓</button>
                <button style={{ ...mini, color: colors.dangerText }} title="Remover" onClick={() => { setTarefas(tarefas.filter((_, i) => i !== idx)); setSujo(true); }}>✕</button>
              </div>
            </div>
          ))}
          <div><button style={btnSec} onClick={() => { setTarefas([...tarefas, { item: "", o_que_fazer: "", ancora: "continuo", offset_dias: 0, dias_uteis: false }]); setSujo(true); }}>+ Adicionar responsabilidade</button></div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} disabled={!sujo} onClick={salvar}>Salvar modelo</button>
        <button style={btnSec} disabled={!sujo} onClick={carregar}>Descartar alterações</button>
      </div>
    </div>
  );
}

const card = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden" };
const cab = { padding: "14px 16px", borderBottom: `1px solid ${colors.border}` };
const h2 = { margin: 0, fontSize: 16, fontWeight: 800, color: colors.navy };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginTop: 12 };
const okBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "10px 16px", fontSize: 14, marginTop: 12 };
const aviso2 = { background: colors.neutralLight, color: colors.textSecondary, borderRadius: radius.md, padding: "10px 16px", fontSize: 13 };
const aba_ = { padding: "9px 16px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const abaOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: "#fff" };
const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const chk = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: colors.textPrimary };
const grade2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 };
const btn = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const mini = { padding: "7px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", cursor: "pointer", fontWeight: 800 };
const link = { background: "none", border: "none", color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "11px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 16px", fontSize: 14 };
