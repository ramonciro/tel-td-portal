"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import ConteudoIndicadores from "../../components/ConteudoIndicadores";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, radius, corDoCliente } from "../../lib/theme";
import {
  STATUS, FAROL, ACAO, ACAO_RAPIDA, estiloBtn,
  fmtData, fmtDataHora, fmtHoras, fmtDias,
} from "../../lib/conteudoUi";

// Produção de conteúdo (22/10/2026) — fila dos pedidos de material dos analistas.
// O analista vê todos os pedidos e age só nos seus (a API é quem garante isso);
// coordenação, supervisão e assistente agem em todos; superintendente só lê.

const GESTAO = ["coordenador", "supervisor", "assistente_treinamento", "super_admin"];
const COLUNAS = [
  { id: "a_fazer", titulo: "A fazer", status: ["a_fazer"] },
  { id: "em_criacao", titulo: "Em criação", status: ["em_criacao"] },
  { id: "em_validacao", titulo: "Em validação", status: ["em_validacao"] },
  { id: "em_ajustes", titulo: "Em ajustes", status: ["em_ajustes"] },
  { id: "postagem", titulo: "Validado / postagem", status: ["validado", "em_postagem"] },
];
const ABAS = [
  { id: "fila", label: "Fila" },
  { id: "concluidos", label: "Concluídos" },
  { id: "indicadores", label: "Indicadores" },
  { id: "revisar", label: "Revisar histórico", gestao: true },
  { id: "catalogo", label: "Tipos e prazos" },
];

export default function ConteudoPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [aba, setAba] = useState("fila");
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);

  useEffect(() => { setUser(getStoredUser()); }, []);
  const perfil = String(user?.perfil || "").toLowerCase();
  const gestao = GESTAO.includes(perfil);
  const somenteLeitura = perfil === "superintendente";

  const carregarResumo = useCallback(() => {
    apiFetch("/conteudo/resumo").then(setResumo).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregarResumo(); }, [carregarResumo]);

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16, padding: "4px 0 40px" }}>
        <PageHero
          eyebrow="Conteúdo"
          title="Produção de conteúdo"
          subtitle="Pedidos de material dos analistas: criação, validação e postagem, com o tempo medido em horas úteis."
          actions={!somenteLeitura && user ? (
            <button type="button" onClick={() => setNovo(true)} style={{ ...estiloBtn.base, background: "#fff", color: colors.navy, border: "1px solid #fff" }}>
              + Novo pedido
            </button>
          ) : null}
          stats={resumo ? [
            { label: "Em aberto", value: resumo.abertos },
            { label: "Atrasados", value: resumo.atrasados },
            { label: "Cliente sem retorno (2+ dias)", value: resumo.sem_retorno_cliente },
            { label: "Concluídos no mês", value: resumo.concluidos_no_mes },
          ] : undefined}
        />

        {erro && <div style={alerta}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Seções">
          {ABAS.filter((a) => !a.gestao || gestao).map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              style={{ ...chip, ...(aba === a.id ? chipAtivo : null) }}>
              {a.label}{a.id === "revisar" && resumo?.revisar ? ` (${resumo.revisar})` : ""}
            </button>
          ))}
        </div>

        {aba === "fila" && <Fila user={user} gestao={gestao} resumo={resumo} onMudou={carregarResumo} router={router} />}
        {aba === "concluidos" && <Concluidos router={router} />}
        {aba === "indicadores" && <ConteudoIndicadores perfil={perfil} />}
        {aba === "revisar" && gestao && <Revisar router={router} onMudou={carregarResumo} />}
        {aba === "catalogo" && <Catalogo coordenador={perfil === "coordenador" || perfil === "super_admin"} onMudou={carregarResumo} />}
      </div>

      {novo && (
        <NovoPedido
          gestao={gestao}
          onFechar={() => setNovo(false)}
          onCriado={(id) => { setNovo(false); router.push(`/conteudo/${id}`); }}
        />
      )}
    </PortalShell>
  );
}

/* ----------------------------------------------------------------- fila */

function Fila({ user, gestao, resumo, onMudou, router }) {
  const ehAnalista = String(user?.perfil || "").toLowerCase() === "analista_conteudo";
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [meus, setMeus] = useState(null); // null = ainda não decidido
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(0);

  const meusAtivo = meus ?? ehAnalista; // analista começa em “Meus pedidos”; clicar muda

  const carregar = useCallback(() => {
    const qs = new URLSearchParams({ escopo: "abertos" });
    apiFetch(`/conteudo/pedidos?${qs}`).then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const clientes = useMemo(() => [...new Set((dados || []).map((p) => p.cliente))].sort(), [dados]);
  const tipos = useMemo(() => [...new Set((dados || []).map((p) => p.tipo).filter(Boolean))].sort(), [dados]);

  const lista = useMemo(() => (dados || []).filter((p) => {
    if (meusAtivo && !p.sou_dono) return false;
    if (cliente && p.cliente !== cliente) return false;
    if (tipo && p.tipo !== tipo) return false;
    if (busca) {
      const t = busca.toLowerCase();
      if (![p.titulo, p.cliente, p.analista_nome, p.tipo].some((x) => String(x || "").toLowerCase().includes(t))) return false;
    }
    return true;
  }), [dados, meusAtivo, cliente, tipo, busca]);

  async function acaoRapida(e, p, acao) {
    e.stopPropagation();
    setOcupado(p.id);
    setErro("");
    try {
      await apiFetch(`/conteudo/pedidos/${p.id}/acao`, { method: "POST", body: JSON.stringify({ acao }) });
      carregar();
      onMudou();
    } catch (err) {
      setErro(err.message);
      carregar();
    } finally {
      setOcupado(0);
    }
  }

  if (erro && !dados) return <div style={alerta}>{erro}</div>;
  if (!dados) return <div style={vazio}>Carregando a fila…</div>;

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {ehAnalista && (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setMeus(true)} style={{ ...chip, ...(meusAtivo ? chipAtivo : null) }}>Meus pedidos</button>
            <button type="button" onClick={() => setMeus(false)} style={{ ...chip, ...(!meusAtivo ? chipAtivo : null) }}>Todos</button>
          </div>
        )}
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={campo} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo} aria-label="Tipo de material">
          <option value="">Todos os tipos</option>
          {tipos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, cliente ou analista" style={{ ...campo, minWidth: 260 }} aria-label="Buscar" />
        {resumo?.por_analista?.length > 0 && gestao && (
          <span style={{ fontSize: 12.5, color: colors.textSecondary }}>
            {resumo.por_analista.map((a) => `${a.analista}: ${a.abertos}`).join(" · ")}
          </span>
        )}
      </div>

      {erro && <div style={alerta}>{erro}</div>}

      {lista.length === 0 ? (
        <div style={vazio}>
          {dados.length === 0 ? "Nenhum pedido em aberto. Use “Novo pedido” para começar." : "Nenhum pedido com esses filtros."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
          {COLUNAS.map((col) => {
            const itens = lista.filter((p) => col.status.includes(p.status));
            return (
              <div key={col.id} style={colunaBox}>
                <div style={colunaTopo}>
                  <strong style={{ fontSize: 13 }}>{col.titulo}</strong>
                  <span style={contador}>{itens.length}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {itens.length === 0 && <div style={{ fontSize: 12.5, color: colors.textMuted, padding: "8px 4px" }}>Vazio</div>}
                  {itens.map((p) => (
                    <Cartao key={p.id} p={p} ocupado={ocupado === p.id} onAbrir={() => router.push(`/conteudo/${p.id}`)} onAcao={(e, a) => acaoRapida(e, p, a)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Cartao({ p, ocupado, onAbrir, onAcao }) {
  const f = FAROL[p.farol] || FAROL.neutro;
  const cc = corDoCliente(p.cliente);
  const rapida = (p.acoes || []).find((a) => ACAO_RAPIDA.includes(a));
  const at = p.etapa_atual;
  let tempo = "";
  if (at) {
    if (p.espera_cliente) tempo = `Aguardando o cliente ${fmtDias(at.dias_corridos)}`;
    else tempo = `${fmtHoras(at.horas_uteis)}${at.prazo_h > 0 ? ` de ${fmtHoras(at.prazo_h)}` : ""}`;
  }
  return (
    <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }} style={cartao}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...selo, background: cc.bg, color: cc.text }}>{p.cliente}</span>
        <span style={{ fontSize: 11.5, color: colors.textSecondary }}>{p.tipo || "Sem tipo"}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 14, color: colors.textPrimary, margin: "6px 0 4px", lineHeight: 1.3 }}>{p.titulo}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>
        {p.analista_nome || "Sem analista"} · aberto em {fmtData(p.aberto_em)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {p.revisao === "pendente" && <span style={{ ...selo, background: colors.warningLight, color: colors.warningText }}>Revisar</span>}
        {p.retrabalho && <span style={{ ...selo, background: colors.warningLight, color: colors.warningText }}>Rodada {p.rodadas}</span>}
        <span style={{ ...selo, background: colors.neutralLight, color: colors.textSecondary }}>
          Valida: {p.validador_tipo === "interno" ? "coordenação" : "cliente"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: f.cor === colors.accentBright ? colors.accentText : f.cor }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: f.cor, display: "inline-block" }} />
          {p.farol === "neutro" ? (tempo || f.texto) : tempo || f.texto}
        </span>
        {rapida && (
          <button type="button" disabled={ocupado} onClick={(e) => onAcao(e, rapida)} style={{ ...estiloBtn.base, ...estiloBtn.pri, padding: "6px 10px", fontSize: 12, opacity: ocupado ? 0.6 : 1 }}>
            {ocupado ? "…" : ACAO[rapida].rotulo}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ concluídos */

function Concluidos({ router }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  useEffect(() => {
    apiFetch("/conteudo/pedidos?escopo=concluidos&limite=400").then(setDados).catch((e) => setErro(e.message));
  }, []);
  const lista = useMemo(() => (dados || []).filter((p) => !busca || [p.titulo, p.cliente, p.analista_nome, p.tipo].some((x) => String(x || "").toLowerCase().includes(busca.toLowerCase()))), [dados, busca]);
  if (erro) return <div style={alerta}>{erro}</div>;
  if (!dados) return <div style={vazio}>Carregando…</div>;
  return (
    <SectionCard title="Pedidos concluídos" subtitle="Tempos em horas úteis. A espera do cliente é mostrada à parte e não conta contra o analista.">
      <div style={{ padding: "0 16px 12px" }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" style={{ ...campo, minWidth: 260 }} aria-label="Buscar nos concluídos" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tabela}>
          <thead>
            <tr>{["Pedido", "Cliente", "Tipo", "Analista", "Concluído em", "Criação", "Validação", "Postagem", "Rodadas"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/conteudo/${p.id}`)} style={{ cursor: "pointer" }}>
                <td style={td}><strong>{p.titulo}</strong>{p.revisao === "pendente" && <span style={{ ...selo, marginLeft: 6, background: colors.warningLight, color: colors.warningText }}>Revisar</span>}</td>
                <td style={td}>{p.cliente}</td>
                <td style={td}>{p.tipo}</td>
                <td style={td}>{p.analista_nome || "—"}</td>
                <td style={td}>{fmtDataHora(p.concluido_em)}</td>
                <td style={td}>{fmtHoras(p.horas_criacao)}{p.prazo_criacao_h > 0 && p.horas_criacao > p.prazo_criacao_h ? <span style={{ color: colors.danger }}> ▲</span> : null}</td>
                <td style={td}>{fmtHoras(p.horas_validacao)}</td>
                <td style={td}>{fmtHoras(p.horas_postagem)}</td>
                <td style={td}>{p.rodadas}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: colors.textMuted }} colSpan={9}>Nenhum pedido concluído.</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/* --------------------------------------------------------- revisar histórico */

function Revisar({ router, onMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    apiFetch("/conteudo/pedidos?revisar=1&escopo=todos&limite=500").then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function marcar(p, revisao) {
    setErro("");
    try {
      await apiFetch(`/conteudo/pedidos/${p.id}/revisao`, { method: "PUT", body: JSON.stringify({ revisao }) });
      carregar();
      onMudou();
    } catch (e) {
      setErro(e.message);
    }
  }
  if (!dados) return <div style={vazio}>{erro || "Carregando…"}</div>;
  return (
    <SectionCard title="Registros da planilha para revisar" subtitle="Estes pedidos têm horários que não fazem sentido (ex.: fim antes do início) e por isso não entram nos indicadores. Corrija o horário no pedido, ou diga que está certo, ou tire dos indicadores.">
      {erro && <div style={{ ...alerta, margin: "0 16px 12px" }}>{erro}</div>}
      {dados.length === 0 ? (
        <div style={{ ...vazio, margin: 16 }}>Nada para revisar.</div>
      ) : (
        <div style={{ display: "grid", gap: 10, padding: 16 }}>
          {dados.map((p) => (
            <div key={p.id} style={{ ...cartao, cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    <span style={{ color: colors.textMuted, fontWeight: 700 }}>ID {p.codigo_legado} · </span>{p.titulo}
                  </div>
                  <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{p.cliente} · {p.tipo} · {p.analista_nome}</div>
                  <div style={{ fontSize: 13, color: colors.warningText, marginTop: 6 }}>{p.revisao_motivo}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.pri }} onClick={() => router.push(`/conteudo/${p.id}`)}>Abrir e corrigir</button>
                  <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.sec }} onClick={() => marcar(p, "ok")}>Está correto</button>
                  <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.perigo }} onClick={() => marcar(p, "ignorado")}>Tirar dos indicadores</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------- tipos e prazos */

function Catalogo({ coordenador, onMudou }) {
  const [tipos, setTipos] = useState(null);
  const [exp, setExp] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [imp, setImp] = useState(null);

  const carregar = useCallback(() => {
    apiFetch("/conteudo/tipos").then(setTipos).catch((e) => setErro(e.message));
    apiFetch("/conteudo/expediente").then(setExp).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTipo(t, campos) {
    setErro(""); setMsg("");
    try {
      await apiFetch(`/conteudo/tipos/${t.id}`, { method: "PUT", body: JSON.stringify(campos) });
      setMsg("Salvo.");
      carregar();
    } catch (e) { setErro(e.message); carregar(); }
  }
  async function criarTipo() {
    if (!novoNome.trim()) return;
    setErro(""); setMsg("");
    try {
      await apiFetch("/conteudo/tipos", { method: "POST", body: JSON.stringify({ nome: novoNome.trim() }) });
      setNovoNome("");
      carregar();
    } catch (e) { setErro(e.message); }
  }
  async function salvarExp() {
    setErro(""); setMsg("");
    try {
      await apiFetch("/conteudo/expediente", { method: "PUT", body: JSON.stringify(exp) });
      setMsg("Expediente salvo. Vale para os cálculos daqui para frente.");
    } catch (e) { setErro(e.message); }
  }
  async function simular() {
    setErro(""); setMsg("");
    try { setImp(await apiFetch("/conteudo/importar-historico", { method: "POST", body: JSON.stringify({}) })); }
    catch (e) { setErro(e.message); }
  }
  async function importar() {
    setErro(""); setMsg("");
    try {
      const r = await apiFetch("/conteudo/importar-historico", { method: "POST", body: JSON.stringify({ confirmar: true }) });
      setImp(null);
      setMsg(`${r.importados} pedido(s) importado(s). ${r.a_revisar.length} foram para a aba “Revisar histórico”.`);
      onMudou();
      carregar();
    } catch (e) { setErro(e.message); }
  }

  if (!tipos) return <div style={vazio}>{erro || "Carregando…"}</div>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {erro && <div style={alerta}>{erro}</div>}
      {msg && <div style={aviso}>{msg}</div>}

      <SectionCard
        title="Tipos de material, prazos e pontos"
        subtitle="Prazos em horas úteis. O prazo é fixo por tipo: quem define é a coordenação. Prazo 0 significa sem prazo."
      >
        <div style={{ overflowX: "auto" }}>
          <table style={tabela}>
            <thead>
              <tr>{["Tipo", "Criação (h)", "Validação (h)", "Postagem (h)", "Pontos", "Pedidos", "Ativo"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <LinhaTipo key={`${t.id}-${t.prazo_criacao_h}-${t.prazo_validacao_h}-${t.prazo_postagem_h}-${t.pontos}`} t={t} editavel={coordenador} onSalvar={(c) => salvarTipo(t, c)} />
              ))}
            </tbody>
          </table>
        </div>
        {coordenador && (
          <div style={{ display: "flex", gap: 8, padding: 16, flexWrap: "wrap" }}>
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Novo tipo de material" style={{ ...campo, minWidth: 260 }} aria-label="Novo tipo" />
            <button type="button" onClick={criarTipo} style={{ ...estiloBtn.base, ...estiloBtn.pri }}>Adicionar tipo</button>
          </div>
        )}
      </SectionCard>

      {exp && (
        <SectionCard title="Expediente usado nos prazos" subtitle="Horas fora deste horário, fins de semana e almoço não contam. Feriados não são descontados.">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16, alignItems: "end" }}>
            {[["manha_ini", "Manhã: início"], ["manha_fim", "Manhã: fim"], ["tarde_ini", "Tarde: início"], ["tarde_fim", "Tarde: fim"]].map(([k, rot]) => (
              <label key={k} style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>
                {rot}
                <input type="time" value={exp[k]} disabled={!coordenador} onChange={(e) => setExp({ ...exp, [k]: e.target.value })} style={campo} />
              </label>
            ))}
            {coordenador && <button type="button" onClick={salvarExp} style={{ ...estiloBtn.base, ...estiloBtn.pri }}>Salvar expediente</button>}
          </div>
        </SectionCard>
      )}

      {coordenador && (
        <SectionCard title="Histórico da planilha" subtitle="Traz os pedidos da planilha “Acompanhamento Analistas Conteúdo” para o portal. Pode rodar mais de uma vez: o que já entrou não é duplicado.">
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {!imp && <div><button type="button" onClick={simular} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Ver o que será importado</button></div>}
            {imp && (
              <>
                <div style={{ fontSize: 14 }}>
                  No arquivo: <strong>{imp.no_arquivo}</strong> · já importados: <strong>{imp.ja_importados}</strong> · a importar: <strong>{imp.a_importar}</strong>
                </div>
                {imp.a_revisar.length > 0 && (
                  <div style={{ fontSize: 13.5 }}>
                    <strong>{imp.a_revisar.length} entrarão marcados para revisão</strong> e só contam nos indicadores depois que você revisar:
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {imp.a_revisar.map((r) => <li key={r.id}>ID {r.id} ({r.analista}, {r.cliente}): {r.motivos.join("; ")}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {imp.a_importar > 0 && <button type="button" onClick={importar} style={{ ...estiloBtn.base, ...estiloBtn.pri }}>Importar {imp.a_importar} pedido(s)</button>}
                  <button type="button" onClick={() => setImp(null)} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Fechar</button>
                </div>
              </>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function LinhaTipo({ t, editavel, onSalvar }) {
  const [v, setV] = useState({ c: t.prazo_criacao_h, v: t.prazo_validacao_h, p: t.prazo_postagem_h, pt: t.pontos });
  const num = (k, coluna) => (
    <input
      type="number" min="0" step="0.5" value={v[k]} disabled={!editavel}
      onChange={(e) => setV({ ...v, [k]: e.target.value })}
      onBlur={() => { if (String(v[k]) !== String(t[coluna])) onSalvar({ [coluna]: v[k] }); }}
      style={{ ...campo, width: 84 }} aria-label={`${t.nome}: ${coluna}`}
    />
  );
  return (
    <tr style={{ opacity: t.ativo ? 1 : 0.5 }}>
      <td style={td}><strong>{t.nome}</strong></td>
      <td style={td}>{num("c", "prazo_criacao_h")}</td>
      <td style={td}>{num("v", "prazo_validacao_h")}</td>
      <td style={td}>{num("p", "prazo_postagem_h")}</td>
      <td style={td}>{num("pt", "pontos")}</td>
      <td style={td}>{t.pedidos}</td>
      <td style={td}>
        <input type="checkbox" checked={!!t.ativo} disabled={!editavel} onChange={(e) => onSalvar({ ativo: e.target.checked ? 1 : 0 })} aria-label={`${t.nome} ativo`} />
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------ novo pedido */

function NovoPedido({ gestao, onFechar, onCriado }) {
  const [tipos, setTipos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [analistas, setAnalistas] = useState([]);
  const [f, setF] = useState({ titulo: "", cliente: "", tipo_id: "", validador_tipo: "cliente", analista_id: "", solicitante: "", descricao: "", aberto_em: "" });
  const [retro, setRetro] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiFetch("/conteudo/tipos").then((t) => setTipos(t.filter((x) => x.ativo))).catch(() => {});
    apiFetch("/conteudo/clientes").then(setClientes).catch(() => {});
    if (gestao) apiFetch("/conteudo/analistas").then(setAnalistas).catch(() => {});
  }, [gestao]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!f.titulo.trim() || !f.cliente.trim() || !f.tipo_id) { setErro("Preencha título, cliente e tipo de material."); return; }
    setSalvando(true);
    try {
      const corpo = { ...f, tipo_id: Number(f.tipo_id), analista_id: f.analista_id ? Number(f.analista_id) : undefined };
      if (!retro || !f.aberto_em) delete corpo.aberto_em;
      const r = await apiFetch("/conteudo/pedidos", { method: "POST", body: JSON.stringify(corpo) });
      onCriado(r.id);
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  const tipoSel = tipos.find((t) => String(t.id) === String(f.tipo_id));
  return (
    <div style={modalFundo} onClick={onFechar}>
      <form style={modal} onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Novo pedido de material</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={rotulo}>Título
            <input autoFocus value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} style={campoCheio} maxLength={255} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <label style={rotulo}>Cliente
              <input list="clientes-conteudo" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} style={campoCheio} maxLength={150} />
              <datalist id="clientes-conteudo">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label style={rotulo}>Tipo de material
              <select value={f.tipo_id} onChange={(e) => setF({ ...f, tipo_id: e.target.value })} style={campoCheio}>
                <option value="">Escolha…</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
          </div>
          {tipoSel && (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
              Prazo deste tipo: criação {fmtHoras(tipoSel.prazo_criacao_h)} · validação {fmtHoras(tipoSel.prazo_validacao_h)} · postagem {fmtHoras(tipoSel.prazo_postagem_h)} (horas úteis) · {tipoSel.pontos} ponto(s)
            </div>
          )}
          <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "10px 12px", margin: 0 }}>
            <legend style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary, padding: "0 6px" }}>Quem valida</legend>
            <label style={radioLinha}><input type="radio" name="validador" checked={f.validador_tipo === "cliente"} onChange={() => setF({ ...f, validador_tipo: "cliente" })} /> Cliente <span style={ajuda}>(você envia por e-mail; o portal só mede a espera)</span></label>
            <label style={radioLinha}><input type="radio" name="validador" checked={f.validador_tipo === "interno"} onChange={() => setF({ ...f, validador_tipo: "interno" })} /> Coordenação <span style={ajuda}>(a coordenação aprova ou pede ajustes aqui no portal)</span></label>
          </fieldset>
          {gestao && (
            <label style={rotulo}>Analista
              <select value={f.analista_id} onChange={(e) => setF({ ...f, analista_id: e.target.value })} style={campoCheio}>
                <option value="">Sem analista (fica na fila para alguém assumir)</option>
                {analistas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
          )}
          <label style={rotulo}>Quem pediu (opcional)
            <input value={f.solicitante} onChange={(e) => setF({ ...f, solicitante: e.target.value })} style={campoCheio} maxLength={150} />
          </label>
          <label style={rotulo}>Detalhes (opcional)
            <textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={{ ...campoCheio, minHeight: 70, resize: "vertical" }} />
          </label>
          <label style={{ ...radioLinha, fontSize: 13 }}>
            <input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} /> O pedido foi aberto antes de hoje
          </label>
          {retro && (
            <label style={rotulo}>Data e hora da abertura
              <input type="datetime-local" value={f.aberto_em} onChange={(e) => setF({ ...f, aberto_em: e.target.value })} style={campoCheio} />
            </label>
          )}
        </div>
        {erro && <div style={{ ...alerta, marginTop: 12 }}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: salvando ? 0.6 : 1 }}>{salvando ? "Criando…" : "Criar pedido"}</button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ estilos */

const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const aviso = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "48px 16px", fontSize: 14, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg };
const chip = { padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const chipAtivo = { background: colors.navy, color: "#fff", border: `1px solid ${colors.navy}` };
const campo = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", font: "inherit", fontSize: 13.5, color: colors.textPrimary };
const campoCheio = { ...campo, width: "100%", boxSizing: "border-box" };
const rotulo = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const radioLinha = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: colors.textPrimary, padding: "3px 0" };
const ajuda = { fontSize: 12, color: colors.textMuted };
const colunaBox = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 10 };
const colunaTopo = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" };
const contador = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.pill, padding: "1px 9px", fontSize: 12, fontWeight: 800, color: colors.textSecondary };
const cartao = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 12, boxShadow: "0 4px 12px rgba(15,23,42,.04)", cursor: "pointer", textAlign: "left" };
const selo = { padding: "2px 8px", borderRadius: radius.pill, fontSize: 11.5, fontWeight: 800 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textMuted, borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "middle" };
const modalFundo = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16, overflowY: "auto" };
const modal = { background: "#fff", borderRadius: radius.lg, padding: 22, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(15,23,42,.3)" };
