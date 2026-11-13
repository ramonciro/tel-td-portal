"use client";

// Cadastros do RH (12/11/2026): limites do farol, mínimo de pessoas por recorte, temas e a ligação de cada afirmação a um tema.
// Só o coordenador do RH altera; mudar temas e limites recalcula na hora os resultados já importados (o farol e os temas são calculados na leitura).
import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Badge, perfilRh, PERFIL_COORD, COR_RH } from "../../../components/RhUi";
import CangaruRegras from "../../../components/CangaruRegras";

export default function CadastrosRhPage() {
  const perfil = perfilRh();
  const coord = perfil === PERFIL_COORD;
  const [cfg, setCfg] = useState(null);
  const [lim, setLim] = useState({ farol_verde_min: "", farol_amarelo_min: "", min_recorte: "" });
  const [novoTema, setNovoTema] = useState("");
  const [edicao, setEdicao] = useState({ id: null, nome: "" });
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState({ tipo: "", texto: "" });

  const carregar = useCallback(() => {
    apiFetch("/rh/config")
      .then((r) => { setCfg(r); setLim({ farol_verde_min: String(r.limites.farol_verde_min), farol_amarelo_min: String(r.limites.farol_amarelo_min), min_recorte: String(r.limites.min_recorte) }); })
      .catch((e) => setMsg({ tipo: "erro", texto: e.message || "Não foi possível carregar os cadastros." }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (fn, ok) => {
    setMsg({ tipo: "", texto: "" });
    try { const r = await fn(); setMsg({ tipo: "ok", texto: ok || r?.message || "Salvo." }); carregar(); return true; }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível salvar." }); return false; }
  };
  const enviar = (url, metodo, corpo) => apiFetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

  const salvarLimites = () => executar(() => enviar("/rh/config/limites", "PUT", { farol_verde_min: Number(lim.farol_verde_min), farol_amarelo_min: Number(lim.farol_amarelo_min), min_recorte: Number(lim.min_recorte) }));
  const criarTema = async () => { if (await executar(() => enviar("/rh/config/temas", "POST", { nome: novoTema }), "Tema criado.")) setNovoTema(""); };
  const salvarTema = async (t) => { if (await executar(() => enviar(`/rh/config/temas/${t.id}`, "PUT", { nome: edicao.nome }), "Tema renomeado.")) setEdicao({ id: null, nome: "" }); };
  const alternarTema = (t) => executar(() => enviar(`/rh/config/temas/${t.id}`, "PUT", { ativo: t.ativo ? 0 : 1 }), t.ativo ? "Tema desativado." : "Tema ativado.");
  const ligar = (numero, temaId) => executar(() => enviar(`/rh/config/afirmacoes/${numero}`, "PUT", { tema_id: temaId === "" ? null : Number(temaId) }), "Afirmação ligada ao tema.");

  const temas = cfg?.temas || [];
  const nTema = (id) => (cfg?.perguntas || []).filter((p) => p.tema_id === id).length;
  const perguntas = (cfg?.perguntas || []).filter((p) => !filtro || (filtro === "sem" ? p.tema_id === null : String(p.tema_id) === filtro));

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Cadastros" subtitle="Limites do farol, temas da pesquisa de clima, e as regras do Projeto Canguru." />
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginTop: 14 }}>{msg.texto}</div> : null}
      {!coord ? <div style={{ ...st.card, marginTop: 16, color: colors.textSecondary, fontSize: 13.5 }}>Só o coordenador do RH altera os cadastros.</div> : null}
      {!cfg ? <p style={{ color: colors.textMuted, marginTop: 16 }}>Carregando…</p> : (
        <>
          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Farol e mínimo por grupo</h3>
            <div style={st.filtros}>
              <Campo label="Verde a partir de (% positivo)" minWidth={190}><input style={st.input} type="number" min="1" max="100" step="0.1" value={lim.farol_verde_min} disabled={!coord} onChange={(e) => setLim({ ...lim, farol_verde_min: e.target.value })} /></Campo>
              <Campo label="Amarelo a partir de (% positivo)" minWidth={190}><input style={st.input} type="number" min="0" max="99" step="0.1" value={lim.farol_amarelo_min} disabled={!coord} onChange={(e) => setLim({ ...lim, farol_amarelo_min: e.target.value })} /></Campo>
              <Campo label={`Mínimo de pessoas por grupo (não menos que ${cfg.minimo_absoluto})`} minWidth={230}><input style={st.input} type="number" min={cfg.minimo_absoluto} step="1" value={lim.min_recorte} disabled={!coord} onChange={(e) => setLim({ ...lim, min_recorte: e.target.value })} /></Campo>
            </div>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 10px" }}>Abaixo do limite do amarelo é vermelho. A mudança do farol vale na hora para todos os ciclos. A mudança do mínimo por grupo vale a partir da próxima importação.</p>
            {coord ? <button type="button" style={{ ...st.btn, background: COR_RH }} onClick={salvarLimites}>Salvar limites</button> : null}
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Temas</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={st.th}>Tema</th><th style={{ ...st.th, textAlign: "right" }}>Afirmações</th><th style={st.th}>Situação</th><th style={st.th}></th></tr></thead>
                <tbody>
                  {temas.map((t) => (
                    <tr key={t.id}>
                      <td style={st.td}>
                        {edicao.id === t.id ? <input style={st.input} value={edicao.nome} maxLength={150} onChange={(e) => setEdicao({ id: t.id, nome: e.target.value })} /> : <strong>{t.nome}</strong>}
                      </td>
                      <td style={{ ...st.td, textAlign: "right" }}>{nTema(t.id)}</td>
                      <td style={st.td}><Badge tom={t.ativo ? "concluida" : "pendente"}>{t.ativo ? "Ativo" : "Desativado"}</Badge></td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                        {coord ? (edicao.id === t.id ? (
                          <>
                            <button type="button" style={{ ...st.btnMini, marginRight: 6 }} onClick={() => salvarTema(t)}>Salvar</button>
                            <button type="button" style={st.btnMini} onClick={() => setEdicao({ id: null, nome: "" })}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button type="button" style={{ ...st.btnMini, marginRight: 6 }} onClick={() => setEdicao({ id: t.id, nome: t.nome })}>Renomear</button>
                            <button type="button" style={st.btnMini} onClick={() => alternarTema(t)}>{t.ativo ? "Desativar" : "Ativar"}</button>
                          </>
                        )) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {coord ? (
              <div style={{ ...st.filtros, marginTop: 12 }}>
                <Campo label="Novo tema" flex={2} minWidth={240}><input style={st.input} value={novoTema} maxLength={150} onChange={(e) => setNovoTema(e.target.value)} placeholder="Ex.: Segurança psicológica" /></Campo>
                <div style={{ alignSelf: "flex-end" }}><button type="button" style={{ ...st.btn, background: COR_RH, opacity: novoTema.trim() ? 1 : 0.5 }} disabled={!novoTema.trim()} onClick={criarTema}>Criar tema</button></div>
              </div>
            ) : null}
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Afirmações da pesquisa ({cfg.perguntas.length})</h3>
            <div style={st.filtros}>
              <div style={{ minWidth: 260 }}><label style={st.label}>Mostrar</label><Select value={filtro} onChange={setFiltro} vazio="Todas as afirmações" opcoes={[{ value: "sem", label: "Sem tema" }, ...temas.map((t) => ({ value: String(t.id), label: t.nome }))]} /></div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={st.th}>Nº</th><th style={st.th}>Afirmação</th><th style={st.th}>Tema</th></tr></thead>
                <tbody>
                  {perguntas.map((p) => (
                    <tr key={p.numero}>
                      <td style={st.td}>{p.numero}</td><td style={st.td}>{p.texto}</td>
                      <td style={{ ...st.td, minWidth: 240 }}>
                        <select style={st.input} value={p.tema_id === null ? "" : String(p.tema_id)} disabled={!coord} onChange={(e) => ligar(p.numero, e.target.value)}>
                          <option value="">Sem tema</option>
                          {temas.filter((t) => t.ativo || t.id === p.tema_id).map((t) => <option key={t.id} value={String(t.id)}>{t.nome}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>Uma afirmação sem tema não entra no índice de nenhum tema, mas continua na lista de afirmações. As 41 afirmações são as da pesquisa do Prime RH.</p>
          </div>
        </>
      )}
      <CangaruRegras />
    </PortalShell>
  );
}
