"use client";

// Cadastros do módulo R&S (20/10/2026): sites e padronização da grafia dos nomes.
import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";

const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
  padding: "24px 26px", boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};
const cardTitle = { margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: colors.textPrimary };
const cardDesc = { margin: "0 0 18px", fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 };
const inputSt = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: colors.textPrimary,
  padding: "8px 11px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const btnPrim = {
  background: colors.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px",
  fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const btnSec = {
  background: "#fff", color: colors.neutral, border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px",
  fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const th = {
  padding: "8px 12px", fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase",
  letterSpacing: ".04em", borderBottom: "1px solid #e2e8f0", textAlign: "left",
};
const aviso = (tipo) => ({
  padding: "9px 13px", borderRadius: 8, fontSize: 13, marginBottom: 12,
  background: tipo === "erro" ? colors.dangerLight : tipo === "ok" ? colors.successLight : "#fffbeb",
  color: tipo === "erro" ? colors.dangerText : tipo === "ok" ? colors.successText : "#92400e",
  border: tipo === "aviso" ? "1px solid #fde68a" : "none",
});

// ─── Sites ─────────────────────────────────────────────────────────
export function SitesCard() {
  const [sites, setSites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nomeEdit, setNomeEdit] = useState("");
  const [msg, setMsg] = useState(null); // { tipo, texto }
  const [mesclar, setMesclar] = useState(null); // { id, nome, conflito }
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch("/rs/sites-gestao");
      setSites(Array.isArray(r?.sites) ? r.sites : []);
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao carregar os sites." }); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function executar(fn) {
    setOcupado(true); setMsg(null);
    try { await fn(); await carregar(); }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível concluir." }); }
    finally { setOcupado(false); }
  }

  const cadastrar = (nome) => executar(async () => {
    const r = await apiFetch("/rs/sites-gestao", { method: "POST", body: JSON.stringify({ nome }) });
    setMsg({ tipo: "ok", texto: r.message || "Site cadastrado." });
    setNovo("");
  });

  const salvarNome = (s, confirmarMescla = false) => executar(async () => {
    try {
      const r = await apiFetch(`/rs/sites-gestao/${s.id}`, { method: "PUT", body: JSON.stringify({ nome: nomeEdit, mesclar: confirmarMescla }) });
      setMsg({ tipo: "ok", texto: r.message });
      setEditandoId(null); setMesclar(null);
    } catch (e) {
      // 409 do servidor: já existe um site com esse nome → pede confirmação para juntar
      if (/Já existe o site/.test(e.message || "")) { setMesclar({ id: s.id, nome: nomeEdit, texto: e.message }); return; }
      throw e;
    }
  });

  const alternarAtivo = (s) => executar(async () => {
    const r = await apiFetch(`/rs/sites-gestao/${s.id}`, { method: "PUT", body: JSON.stringify({ ativo: !s.ativo }) });
    setMsg({ tipo: "ok", texto: r.message });
  });

  const ordenados = useMemo(() => sites, [sites]);

  return (
    <div style={card}>
      <h2 style={cardTitle}>📍 Sites</h2>
      <p style={cardDesc}>
        Lista oficial de sites do R&S. Quem cria uma RP só escolhe daqui — nada de digitar o nome à mão. Ao <strong>renomear</strong>, todas as RPs
        daquele site acompanham o novo nome. Um site <strong>desativado</strong> não aparece para RPs novas, mas as antigas continuam nos relatórios.
      </p>

      {msg && <div style={aviso(msg.tipo)}>{msg.texto}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo site (ex.: Feira de Santana)"
          onKeyDown={(e) => { if (e.key === "Enter" && novo.trim() && !ocupado) cadastrar(novo); }}
          style={{ ...inputSt, flex: 1, minWidth: 220 }} maxLength={100} />
        <button onClick={() => cadastrar(novo)} disabled={ocupado || !novo.trim()} style={{ ...btnPrim, opacity: !novo.trim() ? 0.5 : 1 }}>+ Cadastrar site</button>
      </div>

      {carregando ? (
        <p style={{ color: colors.textMuted, fontSize: 13 }}>Carregando sites...</p>
      ) : ordenados.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 13 }}>Nenhum site ainda. Cadastre o primeiro acima.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={th}>Site</th><th style={{ ...th, textAlign: "right" }}>RPs</th><th style={th}>Situação</th><th style={{ ...th, textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((s) => {
              const chave = s.id || `n:${s.nome}`;
              const editando = s.id && editandoId === s.id;
              return (
                <tr key={chave} style={{ borderBottom: "1px solid #f1f5f9", opacity: s.ativo ? 1 : 0.6 }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, color: colors.textPrimary }}>
                    {editando ? (
                      <input value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)} maxLength={100} autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") salvarNome(s); if (e.key === "Escape") { setEditandoId(null); setMesclar(null); } }}
                        style={{ ...inputSt, width: "100%" }} />
                    ) : s.nome}
                    {editando && mesclar && mesclar.id === s.id && (
                      <div style={{ ...aviso("aviso"), marginTop: 8, marginBottom: 0, fontWeight: 400 }}>
                        {mesclar.texto}
                        <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                          <button onClick={() => salvarNome(s, true)} disabled={ocupado} style={{ ...btnPrim, padding: "5px 12px", background: "#d97706" }}>Juntar os dois</button>
                          <button onClick={() => setMesclar(null)} style={btnSec}>Voltar</button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: colors.textSecondary }}>{s.rps}</td>
                  <td style={{ padding: "9px 12px" }}>
                    {!s.cadastrado ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fffbeb", borderRadius: 999, padding: "3px 10px" }}>Só aparece nas RPs</span>
                    ) : s.ativo ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors.successText, background: colors.successLight, borderRadius: 999, padding: "3px 10px" }}>Ativo</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors.neutral, background: colors.neutralLight, borderRadius: 999, padding: "3px 10px" }}>Desativado</span>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {!s.cadastrado ? (
                      <button onClick={() => cadastrar(s.nome)} disabled={ocupado} style={btnSec}>Cadastrar</button>
                    ) : editando ? (
                      <>
                        <button onClick={() => salvarNome(s)} disabled={ocupado || !nomeEdit.trim()} style={{ ...btnPrim, padding: "5px 12px" }}>Salvar</button>{" "}
                        <button onClick={() => { setEditandoId(null); setMesclar(null); }} style={btnSec}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditandoId(s.id); setNomeEdit(s.nome); setMesclar(null); setMsg(null); }} style={btnSec}>Renomear</button>{" "}
                        <button onClick={() => alternarAtivo(s)} disabled={ocupado} style={btnSec}>{s.ativo ? "Desativar" : "Reativar"}</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Padronização dos nomes que já estão no banco ──────────────────
const ROTULO_CAMPO = { site: "Site", produto: "Produto", cargo: "Cargo" };

export function PadronizacaoCard() {
  const [grupos, setGrupos] = useState(null); // null = ainda não analisou
  const [analisando, setAnalisando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [marcados, setMarcados] = useState({});
  const [destinos, setDestinos] = useState({});
  const [msg, setMsg] = useState(null);

  const chaveDe = (g) => `${g.campo}|${g.variantes.map((v) => v.valor).join("¦")}`;

  async function analisar() {
    setAnalisando(true); setMsg(null);
    try {
      const r = await apiFetch("/rs/padronizacao");
      const lista = Array.isArray(r?.grupos) ? r.grupos : [];
      setGrupos(lista);
      setMarcados(Object.fromEntries(lista.map((g) => [chaveDe(g), true])));
      setDestinos(Object.fromEntries(lista.map((g) => [chaveDe(g), g.destino])));
      if (!lista.length) setMsg({ tipo: "ok", texto: "Tudo certo: todos os nomes já estão na grafia padrão." });
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao analisar." }); }
    finally { setAnalisando(false); }
  }

  const selecionados = (grupos || []).filter((g) => marcados[chaveDe(g)]);
  const rpsAfetadas = selecionados.reduce((s, g) => s + g.variantes.filter((v) => v.valor !== (destinos[chaveDe(g)] || g.destino)).reduce((x, v) => x + v.rps, 0), 0);

  async function aplicar() {
    if (!selecionados.length) return;
    if (!window.confirm(`Padronizar ${selecionados.length} nome(s), atualizando cerca de ${rpsAfetadas} RP(s)? Dá para conferir tudo na lista de RPs depois.`)) return;
    setAplicando(true); setMsg(null);
    try {
      const itens = selecionados.map((g) => ({ campo: g.campo, de: g.variantes.map((v) => v.valor), para: destinos[chaveDe(g)] || g.destino }));
      const r = await apiFetch("/rs/padronizacao", { method: "POST", body: JSON.stringify({ itens }) });
      setMsg({ tipo: "ok", texto: r.message || "Nomes padronizados." });
      await analisar();
      setMsg({ tipo: "ok", texto: r.message || "Nomes padronizados." });
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Erro ao padronizar. Nada foi alterado." }); }
    finally { setAplicando(false); }
  }

  return (
    <div style={card}>
      <h2 style={cardTitle}>🔤 Padronizar nomes já cadastrados</h2>
      <p style={cardDesc}>
        Corrige a grafia de Site, Produto e Cargo das RPs que já existem: tudo com inicial maiúscula (ex.: "FEIRA DE SANTANA" → "Feira de Santana"),
        mantendo siglas como IBM e RH em maiúsculas. Primeiro você vê a lista do que vai mudar; nada é alterado até clicar em aplicar. Dá para ajustar o nome final de cada linha.
      </p>
      {msg && <div style={aviso(msg.tipo)}>{msg.texto}</div>}

      {grupos === null || grupos.length === 0 ? (
        <button onClick={analisar} disabled={analisando} style={btnPrim}>{analisando ? "Analisando..." : "🔍 Ver o que seria alterado"}</button>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10, maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
                <tr>
                  <th style={th}></th><th style={th}>Campo</th><th style={th}>Como está hoje</th><th style={th}>Ficará como</th><th style={{ ...th, textAlign: "right" }}>RPs</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const k = chaveDe(g);
                  return (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9", opacity: marcados[k] ? 1 : 0.5 }}>
                      <td style={{ padding: "8px 12px" }}>
                        <input type="checkbox" checked={!!marcados[k]} onChange={(e) => setMarcados((m) => ({ ...m, [k]: e.target.checked }))} />
                      </td>
                      <td style={{ padding: "8px 12px", color: colors.textMuted }}>{ROTULO_CAMPO[g.campo]}</td>
                      <td style={{ padding: "8px 12px", color: colors.textSecondary }}>
                        {g.variantes.map((v) => (
                          <div key={v.valor}><code style={{ fontSize: 12 }}>{v.valor}</code> <span style={{ color: colors.textMuted, fontSize: 11 }}>({v.rps})</span></div>
                        ))}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <input value={destinos[k] ?? g.destino} maxLength={200}
                          onChange={(e) => setDestinos((d) => ({ ...d, [k]: e.target.value }))} style={{ ...inputSt, width: "100%", minWidth: 160, fontWeight: 600 }} />
                        {g.junta_nomes && <div style={{ fontSize: 11, color: "#92400e", marginTop: 3 }}>junta {g.variantes.length} grafias num nome só</div>}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: colors.textSecondary }}>{g.total_rps}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={aplicar} disabled={aplicando || !selecionados.length} style={{ ...btnPrim, opacity: !selecionados.length ? 0.5 : 1 }}>
              {aplicando ? "Aplicando..." : `Aplicar ${selecionados.length} ajuste${selecionados.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => { setGrupos(null); setMsg(null); }} disabled={aplicando} style={btnSec}>Cancelar</button>
            <span style={{ fontSize: 12, color: colors.textMuted }}>≈ {rpsAfetadas} RP(s) serão atualizadas</span>
          </div>
        </>
      )}
    </div>
  );
}
