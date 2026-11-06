"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Modal, Badge, opcoesDe, perfilNusp, ehOperacao, PERFIL_COORD } from "../../../components/NuspUi";

const STATUS = { em_producao: "Em produção", concluido: "Concluído" };
const VAZIO = { titulo: "", link: "", status: "em_producao", responsavel_nome: "", programa_id: "" };

export default function MateriaisPage() {
  const [perfil, setPerfil] = useState("");
  const [cad, setCad] = useState(null);
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { setPerfil(perfilNusp()); }, []);
  const opera = ehOperacao(perfil);
  const coord = perfil === PERFIL_COORD;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { const r = await apiFetch("/nusp/materiais"); setItens(r.itens || []); setErro(""); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); apiFetch("/nusp/cadastros").then(setCad).catch(() => {}); }, [carregar]);

  const salvar = async (e) => {
    e.preventDefault();
    try {
      const corpo = { ...form.dados };
      Object.keys(corpo).forEach((k) => { if (corpo[k] === "") corpo[k] = null; });
      if (form.id) await apiFetch(`/nusp/materiais/${form.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      else await apiFetch("/nusp/materiais", { method: "POST", body: JSON.stringify(corpo) });
      setForm(null); setMsg("Material salvo."); carregar();
    } catch (err) { setForm((x) => ({ ...x, erro: err.message })); }
  };
  const excluir = async (m) => {
    if (typeof window !== "undefined" && !window.confirm(`Excluir o material "${m.titulo}"?`)) return;
    try { await apiFetch(`/nusp/materiais/${m.id}`, { method: "DELETE" }); setMsg("Material excluído."); carregar(); } catch (e) { setErro(e.message); }
  };
  const set = (k, v) => setForm((x) => ({ ...x, dados: { ...x.dados, [k]: v } }));

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Materiais">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Materiais"
        subtitle="Controle do que está em produção e do que já foi concluído, com o link para o arquivo."
        actions={opera ? <button type="button" style={st.btn} onClick={() => setForm({ dados: { ...VAZIO } })}>+ Novo material</button> : null}
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      <div style={{ ...st.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr><th style={st.th}>Material</th><th style={st.th}>Programa</th><th style={st.th}>Responsável</th><th style={st.th}>Status</th><th style={st.th}>Arquivo</th><th style={st.th} /></tr></thead>
            <tbody>
              {itens.map((m) => (
                <tr key={m.id}>
                  <td style={st.td}><strong>{m.titulo}</strong></td>
                  <td style={st.td}>{m.programa || "—"}</td>
                  <td style={st.td}>{m.responsavel_nome || "—"}</td>
                  <td style={st.td}><Badge tom={m.status}>{STATUS[m.status] || m.status}</Badge></td>
                  <td style={st.td}>{m.link ? <a href={m.link} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, fontWeight: 700 }}>Abrir</a> : "—"}</td>
                  <td style={st.td}>
                    {opera ? <button type="button" style={st.btnMini} onClick={() => setForm({ id: m.id, dados: { titulo: m.titulo, link: m.link || "", status: m.status, responsavel_nome: m.responsavel_nome || "", programa_id: m.programa_id ? String(m.programa_id) : "" } })}>Editar</button> : null}{" "}
                    {coord ? <button type="button" style={st.btnMiniDanger} onClick={() => excluir(m)}>Excluir</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!itens.length && <div style={st.vazio}>{carregando ? "Carregando…" : "Nenhum material cadastrado."}</div>}
      </div>

      {form && (
        <Modal titulo={form.id ? "Editar material" : "Novo material"} onClose={() => setForm(null)} largura={560}>
          <form onSubmit={salvar}>
            {form.erro ? <div style={st.erro}>{form.erro}</div> : null}
            <div style={{ display: "grid", gap: 12 }}>
              <Campo label="Título *"><input style={st.input} value={form.dados.titulo} maxLength={200} onChange={(e) => set("titulo", e.target.value)} required /></Campo>
              <Campo label="Link do arquivo"><input style={st.input} value={form.dados.link} onChange={(e) => set("link", e.target.value)} placeholder="https://…" /></Campo>
              <Campo label="Status"><Select value={form.dados.status} onChange={(v) => set("status", v)} opcoes={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} vazio={null} /></Campo>
              <Campo label="Responsável"><input style={st.input} value={form.dados.responsavel_nome} maxLength={150} onChange={(e) => set("responsavel_nome", e.target.value)} /></Campo>
              <Campo label="Programa / comitê"><Select value={form.dados.programa_id} onChange={(v) => set("programa_id", v)} opcoes={opcoesDe(cad?.programas)} vazio="Selecione" /></Campo>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button type="button" style={st.btnGhost} onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" style={st.btn}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </PortalShell>
  );
}
