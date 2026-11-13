"use client";

// Canguru para o cliente (13/11/2026): o coordenador do RH escolhe quais SERVIÇOS (e, se quiser, quais sites) um cliente enxerga
// do Projeto Canguru. O cliente vê só números agregados desses serviços, sem nomes nem relatos. O analista só consulta.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";
import { st, COR_RH, fmtDia, perfilRh, PERFIL_COORD } from "./RhUi";

export default function CangaruLiberacoes() {
  const coordenador = perfilRh() === PERFIL_COORD;
  const [d, setD] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [cliente, setCliente] = useState("");
  const [servicos, setServicos] = useState([]);
  const [sites, setSites] = useState([]);
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => { apiFetch("/rh/canguru/liberacoes").then(setD).catch((e) => setErro(e.message || "Não foi possível carregar as liberações do Canguru.")); }, []);
  useEffect(() => { carregar(); apiFetch("/rh/clientes").then((r) => setClientes(r.clientes || [])).catch(() => setClientes([])); }, [carregar]);

  const alterna = (lista, setLista, v) => setLista(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const liberar = async () => {
    setOcupado(true); setMsg(""); setErro("");
    try {
      const r = await apiFetch("/rh/canguru/liberacoes", { method: "POST", body: JSON.stringify({ cliente, servicos, sites }) });
      setMsg(r.message || "Liberado."); setCliente(""); setServicos([]); setSites([]); setBusca(""); carregar();
    } catch (e) { setErro(e.message || "Não foi possível liberar."); }
    finally { setOcupado(false); }
  };
  const retirar = async (l) => {
    if (!window.confirm(`Retirar o Canguru de “${l.cliente}”? O cliente deixa de ver o resultado.`)) return;
    setOcupado(true); setMsg(""); setErro("");
    try { const r = await apiFetch(`/rh/canguru/liberacoes/${l.id}`, { method: "DELETE" }); setMsg(r.message || "Liberação retirada."); carregar(); }
    catch (e) { setErro(e.message || "Não foi possível retirar."); }
    finally { setOcupado(false); }
  };

  const ativas = (d?.liberacoes || []).filter((l) => l.ativa);
  const antigas = (d?.liberacoes || []).filter((l) => !l.ativa);
  const opSrv = (d?.opcoes?.servicos || []).filter((s) => !busca.trim() || s.valor.toLowerCase().includes(busca.trim().toLowerCase()));
  const chip = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? COR_RH : colors.border}`, background: on ? "#fdf2f8" : "#fff", fontSize: 12.5, cursor: "pointer", fontWeight: on ? 800 : 500, color: on ? "#9d174d" : colors.textPrimary || "#0f172a" });

  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <h3 style={st.cardTitle}>Acesso do cliente ao Canguru</h3>
      <p style={{ margin: "-6px 0 12px", fontSize: 12.5, color: colors.textSecondary }}>
        O cliente entra com o próprio login e vê só o resultado agregado dos serviços que você escolher aqui (e o comparativo entre períodos). Nunca vê nome de novato, relato nem grupo com menos novatos que o mínimo do projeto.
      </p>
      {erro ? <div style={{ ...st.erro, marginBottom: 10 }}>{erro}</div> : null}
      {msg ? <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#166534" }}>{msg}</div> : null}

      {ativas.length ? (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={st.th}>Cliente</th><th style={st.th}>Serviços liberados</th><th style={st.th}>Liberado por</th>{coordenador ? <th style={st.th} /> : null}</tr></thead>
            <tbody>
              {ativas.map((l) => (
                <tr key={l.id}>
                  <td style={st.td}><strong>{l.cliente}</strong></td>
                  <td style={st.td}>{l.servicos.join(", ")}{l.sites.length ? <div style={{ fontSize: 12, color: colors.textSecondary }}>Só nos sites: {l.sites.join(", ")}</div> : null}</td>
                  <td style={st.td}>{l.liberado_por || "—"} · {fmtDia(l.liberado_em)}</td>
                  {coordenador ? <td style={st.td}><button type="button" style={{ ...st.btnGhost, height: 32 }} disabled={ocupado} onClick={() => retirar(l)}>Retirar acesso</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : d ? <p style={{ ...st.vazio, margin: "0 0 12px" }}>O Canguru ainda não foi liberado para nenhum cliente.</p> : null}

      {coordenador && d ? (
        <div style={{ borderTop: ativas.length ? `1px solid ${colors.border}` : "none", paddingTop: ativas.length ? 12 : 0 }}>
          <div style={{ minWidth: 260, maxWidth: 420 }}>
            <label style={st.label}>Liberar para o cliente</label>
            <input list="rh-cg-clientes" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente (igual ao do acesso dele)" style={{ ...st.input, width: "100%" }} maxLength={100} />
            <datalist id="rh-cg-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={st.label}>Serviços que ele pode ver ({servicos.length} escolhido{servicos.length === 1 ? "" : "s"})</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço" style={{ ...st.input, width: "100%", maxWidth: 320, marginBottom: 8 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {opSrv.map((s) => <label key={s.valor} style={chip(servicos.includes(s.valor))}><input type="checkbox" checked={servicos.includes(s.valor)} onChange={() => alterna(servicos, setServicos, s.valor)} style={{ margin: 0 }} />{s.valor} <span style={{ opacity: 0.6 }}>({s.novatos})</span></label>)}
              {!opSrv.length ? <span style={{ fontSize: 13, color: colors.textMuted }}>Nenhum serviço encontrado.</span> : null}
            </div>
          </div>
          {d.opcoes.sites.length ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Limitar a alguns sites (opcional){sites.length ? ` · ${sites.length} escolhido${sites.length === 1 ? "" : "s"}` : ""}</summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {d.opcoes.sites.map((s) => <label key={s.valor} style={chip(sites.includes(s.valor))}><input type="checkbox" checked={sites.includes(s.valor)} onChange={() => alterna(sites, setSites, s.valor)} style={{ margin: 0 }} />{s.rotulo}</label>)}
              </div>
            </details>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <button type="button" style={{ ...st.btn, background: COR_RH, opacity: cliente.trim() && servicos.length && !ocupado ? 1 : 0.5 }} disabled={!cliente.trim() || !servicos.length || ocupado} onClick={liberar}>Liberar Canguru</button>
          </div>
        </div>
      ) : !coordenador ? <p style={{ fontSize: 12.5, color: colors.textMuted, margin: 0 }}>Só o coordenador do RH libera ou retira o acesso.</p> : null}
      {antigas.length ? <p style={{ fontSize: 12, color: colors.textMuted, margin: "12px 0 0" }}>Já retiradas: {antigas.map((l) => `${l.cliente} (${fmtDia(l.revogado_em)})`).join(", ")}.</p> : null}
    </div>
  );
}
