"use client";

// Liberação para o cliente (13/11/2026): o coordenador do RH libera (ou retira) o resultado de uma pesquisa para um cliente.
// O analista só consulta. Mostra também quem já tem acesso de cliente e quando entrou pela última vez.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";
import { st, Badge, COR_RH, fmtDia, perfilRh, PERFIL_COORD } from "./RhUi";

const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "nunca");

export default function RhLiberacoes({ cicloId, cicloCliente }) {
  const coordenador = perfilRh() === PERFIL_COORD;
  const [d, setD] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [cliente, setCliente] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    if (!cicloId) return;
    apiFetch(`/rh/clima/liberacoes?ciclo=${cicloId}`).then(setD).catch((e) => setErro(e.message || "Não foi possível carregar as liberações."));
  }, [cicloId]);
  useEffect(() => { setD(null); setMsg(""); setErro(""); carregar(); }, [carregar]);
  useEffect(() => { apiFetch("/rh/clientes").then((r) => setClientes(r.clientes || [])).catch(() => setClientes([])); }, []);
  useEffect(() => { setCliente(cicloCliente || ""); }, [cicloId, cicloCliente]);

  const liberar = async () => {
    setOcupado(true); setMsg(""); setErro("");
    try { const r = await apiFetch("/rh/clima/liberacoes", { method: "POST", body: JSON.stringify({ ciclo_id: Number(cicloId), cliente }) }); setMsg(r.message || "Liberado."); carregar(); }
    catch (e) { setErro(e.message || "Não foi possível liberar."); }
    finally { setOcupado(false); }
  };
  const retirar = async (l) => {
    if (!window.confirm(`Retirar a liberação para “${l.cliente}”? O cliente deixa de ver esta pesquisa.`)) return;
    setOcupado(true); setMsg(""); setErro("");
    try { const r = await apiFetch(`/rh/clima/liberacoes/${l.id}`, { method: "DELETE" }); setMsg(r.message || "Liberação retirada."); carregar(); }
    catch (e) { setErro(e.message || "Não foi possível retirar."); }
    finally { setOcupado(false); }
  };

  const ativas = (d?.liberacoes || []).filter((l) => l.ativa);
  const antigas = (d?.liberacoes || []).filter((l) => !l.ativa);
  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <h3 style={st.cardTitle}>Acesso do cliente a esta pesquisa</h3>
      <p style={{ margin: "-6px 0 12px", fontSize: 12.5, color: colors.textSecondary }}>
        O cliente entra com o próprio login e vê só o relatório “para o cliente” (sem cargo nem coordenação, grupos pequenos não aparecem), o Excel e os planos de ação marcados como visíveis. Nunca vê resposta individual.
      </p>
      {erro ? <div style={{ ...st.erro, marginBottom: 10 }}>{erro}</div> : null}
      {msg ? <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#166534" }}>{msg}</div> : null}

      {ativas.length ? (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={st.th}>Cliente</th><th style={st.th}>Liberado por</th><th style={st.th}>Aberturas</th><th style={st.th}>Último acesso</th>{coordenador ? <th style={st.th}></th> : null}</tr></thead>
            <tbody>
              {ativas.map((l) => (
                <tr key={l.id}>
                  <td style={st.td}><strong>{l.cliente}</strong></td>
                  <td style={st.td}>{l.liberado_por || "—"} · {quando(l.liberado_em)}</td>
                  <td style={st.td}>{l.acessos}</td><td style={st.td}>{quando(l.ultimo_acesso)}</td>
                  {coordenador ? <td style={st.td}><button type="button" style={{ ...st.btnGhost, height: 32 }} disabled={ocupado} onClick={() => retirar(l)}>Retirar acesso</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : d ? <p style={{ ...st.vazio, margin: "0 0 12px" }}>Esta pesquisa ainda não foi liberada para nenhum cliente.</p> : null}

      {coordenador ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 260, flex: "1 1 260px" }}>
            <label style={st.label}>Liberar para o cliente</label>
            <input list="rh-clientes" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" style={{ ...st.input, width: "100%" }} maxLength={100} />
            <datalist id="rh-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <button type="button" style={{ ...st.btn, background: COR_RH, opacity: cliente.trim() && !ocupado ? 1 : 0.5 }} disabled={!cliente.trim() || ocupado} onClick={liberar}>Liberar</button>
        </div>
      ) : <p style={{ fontSize: 12.5, color: colors.textMuted, margin: 0 }}>Só o coordenador do RH libera ou retira o acesso.</p>}

      {antigas.length ? <p style={{ fontSize: 12, color: colors.textMuted, margin: "12px 0 0" }}>Já retiradas: {antigas.map((l) => `${l.cliente} (${fmtDia(l.revogado_em)})`).join(", ")}.</p> : null}

      {d?.usuarios?.length ? (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <div style={{ ...st.label, marginBottom: 6 }}>Acessos de cliente cadastrados</div>
          {d.usuarios.map((u) => (
            <div key={u.id} style={{ fontSize: 13, padding: "3px 0" }}>
              <strong>{u.nome}</strong> · {u.clientes.join(", ") || "sem cliente"} · último acesso: {quando(u.ultimo_acesso)} {!u.ativo ? <Badge tone="neutral">inativo</Badge> : null}
            </div>
          ))}
        </div>
      ) : null}
      {coordenador ? <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>Para criar o login do cliente, abra <Link href="/usuarios" style={{ color: "#9d174d", fontWeight: 800 }}>Gestão de Usuários</Link> e escolha o perfil “Cliente (RH)”, com o cliente dele.</p> : null}
    </div>
  );
}
