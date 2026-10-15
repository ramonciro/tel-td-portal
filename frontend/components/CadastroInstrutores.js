"use client";

/**
 * CadastroInstrutores — aba "Instrutores" de Capacidade (14/10/2026).
 * Cadastro oficial de instrutores + fila "Nomes a classificar" (nomes que
 * aparecem nas turmas e ainda não foram cadastrados). Edição: coordenador e
 * superintendente; supervisor só consulta.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getStoredUser, hasSomeRole } from "../services/api";
import { colors } from "../lib/theme";

const SUBABAS = [
  ["ativo", "Ativos"],
  ["desligado", "Desligados"],
  ["ignorado", "Não são instrutores"],
  ["classificar", "Nomes a classificar"],
];

export default function CadastroInstrutores() {
  const usuario = getStoredUser();
  const podeEditar = hasSomeRole(usuario, ["coordenador", "superintendente"]);

  const [sub, setSub] = useState("ativo");
  const [itens, setItens] = useState([]);
  const [contagem, setContagem] = useState({ ativo: 0, desligado: 0, ignorado: 0 });
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [editando, setEditando] = useState(null); // { id, situacao, motivo, data_saida, observacao }
  const [unificando, setUnificando] = useState(null); // { nome, instrutor_id, previa }

  async function carregar() {
    setLoading(true); setErro("");
    try {
      const [lista, fila] = await Promise.all([
        apiFetch("/instrutores?situacao=todos"),
        apiFetch("/instrutores/a-classificar"),
      ]);
      setItens(lista.itens || []);
      setContagem(lista.contagem || { ativo: 0, desligado: 0, ignorado: 0 });
      setPendentes(fila.itens || []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar instrutores.");
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn, msgOk) {
    setErro(""); setOk("");
    try { await fn(); if (msgOk) setOk(msgOk); await carregar(); }
    catch (e) { setErro(e.message || "Não foi possível concluir a ação."); }
  }

  const cadastrar = () => acao(async () => {
    await apiFetch("/instrutores", { method: "POST", body: JSON.stringify({ nome: novoNome }) });
    setNovoNome("");
  }, "Instrutor cadastrado.");

  const salvarEdicao = () => acao(async () => {
    const { id, ...dados } = editando;
    await apiFetch(`/instrutores/${id}`, { method: "PUT", body: JSON.stringify(dados) });
    setEditando(null);
  }, "Instrutor atualizado.");

  const classificar = (nome, a) => acao(async () => {
    await apiFetch("/instrutores/classificar", { method: "POST", body: JSON.stringify({ nome, acao: a }) });
  }, `"${nome}" classificado.`);

  async function previaUnificar(nome, instrutorId) {
    setErro("");
    try {
      const r = await apiFetch("/instrutores/classificar", {
        method: "POST", body: JSON.stringify({ nome, acao: "mesmo_que", instrutor_id: Number(instrutorId) }),
      });
      setUnificando({ nome, instrutor_id: Number(instrutorId), previa: r.previa, oficial: r.oficial });
    } catch (e) { setErro(e.message || "Não foi possível gerar a prévia."); }
  }

  const confirmarUnificar = () => acao(async () => {
    await apiFetch("/instrutores/classificar", {
      method: "POST",
      body: JSON.stringify({ nome: unificando.nome, acao: "mesmo_que", instrutor_id: unificando.instrutor_id, confirmar: true }),
    });
    setUnificando(null);
  }, "Nomes unificados e histórico atualizado.");

  const cadastrarTodos = () => acao(async () => {
    await apiFetch("/instrutores/cadastrar-todos", { method: "POST", body: "{}" });
  }, "Nomes cadastrados como instrutores ativos.");

  const removerApelido = (id) => acao(async () => {
    await apiFetch(`/instrutores/apelidos/${id}`, { method: "DELETE" });
  }, "Apelido removido.");

  const lista = itens.filter((i) => i.situacao === sub);
  const ativosParaEscolha = itens.filter((i) => i.situacao === "ativo");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={box}>
        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          Cadastro oficial de quem conta como instrutor. Só os <strong>ativos</strong> entram nos cálculos de capacidade
          e nos filtros; desligados e “não são instrutores” saem da lista, mas o histórico de horas continua intacto.
          {!podeEditar && " Você tem acesso de consulta; a edição é da Coordenação e da Superintendência."}
        </p>
      </div>

      {erro && <div style={msgErro}>{erro}</div>}
      {ok && <div style={msgOk}>{ok}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SUBABAS.map(([k, label]) => {
          const n = k === "classificar" ? pendentes.length : contagem[k] || 0;
          return (
            <button key={k} onClick={() => setSub(k)} style={sub === k ? subAtiva : subBtn}>
              {label} ({n})
            </button>
          );
        })}
      </div>

      {loading ? <p style={{ color: "#64748b", fontSize: 13 }}>Carregando...</p> : sub === "classificar" ? (
        <div style={box}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <strong style={{ fontSize: 14, color: "#0f172a" }}>Nomes que aparecem nas turmas e ainda não estão no cadastro</strong>
            {podeEditar && pendentes.length > 1 && (
              <button style={btnSec} onClick={cadastrarTodos}>Cadastrar todos como ativos</button>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: 13 }}>Nenhum nome pendente. Tudo que aparece nas turmas já está classificado.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {pendentes.map((p) => (
                <div key={p.nome} style={linha}>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{p.nome}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{p.turmas} turma(s) · {p.aulas} aula(s) · {p.metas} meta(s)</div>
                  </div>
                  {podeEditar ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button style={btnSec} onClick={() => classificar(p.nome, "novo")}>Novo instrutor</button>
                      <select style={sel} defaultValue="" onChange={(e) => { if (e.target.value) previaUnificar(p.nome, e.target.value); e.target.value = ""; }}>
                        <option value="">É o mesmo que…</option>
                        {ativosParaEscolha.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                      </select>
                      <button style={btnSec} onClick={() => classificar(p.nome, "desligado")}>Já saiu</button>
                      <button style={btnSec} onClick={() => classificar(p.nome, "ignorar")}>Não é instrutor</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={box}>
          {sub === "ativo" && podeEditar && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <input style={{ ...inp, maxWidth: 320 }} placeholder="Nome completo do novo instrutor" value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && novoNome.trim() && cadastrar()} />
              <button style={btnPri} disabled={!novoNome.trim()} onClick={cadastrar}>Cadastrar</button>
            </div>
          )}
          {lista.length === 0 ? <p style={{ color: "#64748b", fontSize: 13 }}>Nenhum registro aqui.</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              {lista.map((i) => (
                <div key={i.id} style={linha}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>
                      {i.usuario?.pessoa_id ? <Link href={`/pessoas/${i.usuario.pessoa_id}`} style={{ color: "#0f172a" }}>{i.nome}</Link> : i.nome}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {i.turmas} turma(s) · {i.aulas} aula(s) · {i.metas} meta(s) · {i.usuario ? (i.usuario.ativo ? "com login ativo" : "login inativo") : "sem login"}
                    </div>
                    {i.situacao !== "ativo" && (i.motivo || i.data_saida) && (
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {i.motivo}{i.data_saida ? ` · saída em ${String(i.data_saida).slice(0, 10).split("-").reverse().join("/")}` : ""}
                      </div>
                    )}
                    {i.apelidos.length > 0 && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        Também aparece como:{" "}
                        {i.apelidos.map((a) => (
                          <span key={a.id} style={chip}>
                            {a.apelido}
                            {podeEditar && <button style={chipX} title="Remover apelido" onClick={() => removerApelido(a.id)}>×</button>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {podeEditar && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {i.situacao === "ativo" ? (
                        <button style={btnSec} onClick={() => setEditando({ id: i.id, situacao: "desligado", motivo: "", data_saida: "", observacao: i.observacao || "" })}>Desligar…</button>
                      ) : (
                        <button style={btnSec} onClick={() => acao(() => apiFetch(`/instrutores/${i.id}`, { method: "PUT", body: JSON.stringify({ situacao: "ativo" }) }), "Instrutor reativado.")}>Reativar</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editando && (
        <div style={modalFundo} onClick={() => setEditando(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Desligar instrutor</h3>
            <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>Ele sai da lista de ativos; o histórico de turmas e horas é mantido.</p>
            <label style={lab}>Motivo (opcional)</label>
            <input style={inp} value={editando.motivo} onChange={(e) => setEditando({ ...editando, motivo: e.target.value })} placeholder="Ex.: Mudou de função" />
            <label style={lab}>Data de saída (opcional)</label>
            <input style={inp} type="date" value={editando.data_saida} onChange={(e) => setEditando({ ...editando, data_saida: e.target.value })} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button style={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
              <button style={btnPri} onClick={salvarEdicao}>Desligar</button>
            </div>
          </div>
        </div>
      )}

      {unificando && (
        <div style={modalFundo} onClick={() => setUnificando(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Unificar nomes</h3>
            <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
              “<strong>{unificando.nome}</strong>” passa a ser “<strong>{unificando.oficial}</strong>” em todo o histórico:
              {" "}{unificando.previa.turmas} turma(s), {unificando.previa.aulas} aula(s) e {unificando.previa.metas} meta(s) mensais serão alteradas.
              O nome antigo fica como apelido.
            </p>
            <p style={{ fontSize: 12, color: "#64748b" }}>Se já houver meta do mesmo mês no nome oficial, a meta dele é mantida.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button style={btnSec} onClick={() => setUnificando(null)}>Cancelar</button>
              <button style={btnPri} onClick={confirmarUnificar}>Confirmar e unificar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 8px 18px rgba(15,23,42,.04)" };
const linha = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e9eef4", borderRadius: 12, padding: "10px 14px" };
const subBtn = { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const subAtiva = { ...subBtn, background: colors.accent, color: "#fff", border: `1px solid ${colors.accent}` };
const btnPri = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnSec = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const sel = { height: 34, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 8px", fontSize: 12, color: "#334155", background: "#fff" };
const inp = { height: 38, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 10px", fontSize: 13, color: "#334155", width: "100%", boxSizing: "border-box" };
const lab = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", margin: "12px 0 4px" };
const chip = { display: "inline-flex", alignItems: "center", gap: 4, background: "#e2e8f0", borderRadius: 999, padding: "1px 8px", marginRight: 6, fontSize: 12 };
const chipX = { background: "none", border: 0, cursor: "pointer", color: "#475569", fontWeight: 800, padding: 0 };
const msgErro = { background: colors.dangerLight, color: colors.dangerText, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 };
const msgOk = { background: colors.successLight, color: colors.successText, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 };
const modalFundo = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const modal = { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 24px 48px rgba(15,23,42,.25)" };
