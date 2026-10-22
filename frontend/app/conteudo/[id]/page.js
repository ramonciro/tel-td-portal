"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import { apiFetch, getStoredUser } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";
import {
  STATUS, FAROL, ACAO, ETAPA_ROTULO, estiloBtn,
  fmtData, fmtDataHora, fmtHoras, fmtDias, agoraLocalInput,
} from "../../../lib/conteudoUi";

// Pedido de conteúdo — detalhe (22/10/2026). O horário de cada etapa é o do
// clique. Se alguém esqueceu de clicar, “Registrar em outro horário” pede
// justificativa e deixa o registro marcado como retroativo.

const GESTAO = ["coordenador", "supervisor", "assistente_treinamento", "super_admin"];
// ações que gravam um horário (podem ser lançadas em outro horário)
const ACOES_COM_HORARIO = ["iniciar_criacao", "concluir_criacao", "iniciar_ajustes", "aprovar", "pedir_ajustes", "iniciar_postagem", "concluir_postagem", "concluir_sem_postagem"];

export default function PedidoConteudoPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [p, setP] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState(null); // {tipo:'ajustes'|'cancelar'|'retro'|'etapa'|'editar', ...}

  useEffect(() => { setUser(getStoredUser()); }, []);
  const perfil = String(user?.perfil || "").toLowerCase();
  const gestao = GESTAO.includes(perfil);

  const carregar = useCallback(() => {
    apiFetch(`/conteudo/pedidos/${id}`).then(setP).catch((e) => setErro(e.message));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function executar(acao, extra = {}) {
    setOcupado(true); setErro(""); setMsg("");
    try {
      const r = await apiFetch(`/conteudo/pedidos/${id}/acao`, { method: "POST", body: JSON.stringify({ acao, ...extra }) });
      setMsg(r.message || "Feito.");
      setModal(null);
      carregar();
    } catch (e) {
      setErro(e.message);
      carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function revisao(valor) {
    setErro(""); setMsg("");
    try {
      await apiFetch(`/conteudo/pedidos/${id}/revisao`, { method: "PUT", body: JSON.stringify({ revisao: valor }) });
      carregar();
    } catch (e) { setErro(e.message); }
  }

  if (!p) {
    return (
      <PortalShell>
        <div style={{ padding: "4px 0 40px" }}>
          {erro ? <div style={alerta}>{erro}</div> : <div style={vazio}>Carregando pedido…</div>}
          <button type="button" onClick={() => router.push("/conteudo")} style={{ ...estiloBtn.base, ...estiloBtn.sec, marginTop: 12 }}>Voltar à fila</button>
        </div>
      </PortalShell>
    );
  }

  const st = STATUS[p.status] || STATUS.a_fazer;
  const f = FAROL[p.farol] || FAROL.neutro;
  const at = p.etapa_atual;
  const cliente = p.validador_tipo === "cliente";
  const rotuloAcao = (a) => {
    if (a === "aprovar") return cliente ? "Cliente aprovou" : "Aprovar";
    if (a === "pedir_ajustes") return cliente ? "Cliente pediu ajustes" : "Pedir ajustes";
    return ACAO[a]?.rotulo || a;
  };
  const acoesTempo = p.acoes.filter((a) => ACOES_COM_HORARIO.includes(a));

  function clicar(a) {
    if (a === "pedir_ajustes") return setModal({ tipo: "ajustes" });
    if (a === "cancelar") return setModal({ tipo: "cancelar" });
    if (a === "lembrar") return executar("lembrar", { dias: 2 });
    return executar(a);
  }

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16, padding: "4px 0 40px" }}>
        <PageHero
          eyebrow={p.codigo_legado ? `Produção de conteúdo · ID ${p.codigo_legado} da planilha` : "Produção de conteúdo"}
          title={p.titulo}
          subtitle={`${p.cliente} · ${p.tipo || "Sem tipo"} · ${p.analista_nome || "Sem analista"}`}
          actions={<button type="button" onClick={() => router.push("/conteudo")} style={{ ...estiloBtn.base, background: "#fff", color: colors.navy, border: "1px solid #fff" }}>← Voltar à fila</button>}
        />

        {erro && <div style={alerta}>{erro}</div>}
        {msg && <div style={aviso}>{msg}</div>}

        {p.revisao === "pendente" && (
          <div style={{ ...alerta, background: colors.warningLight, color: colors.warningText, border: "1px solid #fdba74" }}>
            <strong>Registro da planilha para revisar.</strong> {p.revisao_motivo}. Enquanto não for revisado, não entra nos indicadores.
            {gestao ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>Corrija o horário nas etapas abaixo (botão “Corrigir horário”) e depois:</span>
                <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.pri }} onClick={() => revisao("ok")}>Está correto, contar nos indicadores</button>
                <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.perigo }} onClick={() => revisao("ignorado")}>Tirar dos indicadores</button>
              </div>
            ) : null}
          </div>
        )}
        {p.revisao === "ignorado" && <div style={aviso}>Este registro foi tirado dos indicadores na revisão.{gestao && <> <button type="button" style={linkBtn} onClick={() => revisao("ok")}>Voltar a contar</button></>}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <SectionCard title="Andamento">
            <div style={{ padding: "4px 16px 16px", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...selo, background: st.bg, color: st.cor, fontSize: 13 }}>{st.rotulo}</span>
                {p.status !== "concluido" && p.status !== "cancelado" && at && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13.5 }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: f.cor }} />
                    {p.espera_cliente ? `Com o cliente ${fmtDias(at.dias_corridos)}` : `${ETAPA_ROTULO[at.etapa]}: ${fmtHoras(at.horas_uteis)}${at.prazo_h > 0 ? ` de ${fmtHoras(at.prazo_h)}` : ""}`}
                  </span>
                )}
                {p.lembrar_em && p.status === "em_validacao" && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>Lembrete em {fmtData(p.lembrar_em)}</span>}
              </div>
              {p.status === "cancelado" && <div style={{ fontSize: 13.5, color: colors.textSecondary }}>Cancelado em {fmtDataHora(p.cancelado_em)}: {p.cancelado_motivo}</div>}

              {p.acoes.length > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.acoes.map((a) => (
                    <button key={a} type="button" disabled={ocupado} onClick={() => clicar(a)}
                      style={{ ...estiloBtn.base, ...estiloBtn[ACAO[a]?.tom || "sec"], opacity: ocupado ? 0.6 : 1 }}>
                      {a === "lembrar" ? "Lembrar em 2 dias" : rotuloAcao(a)}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: colors.textMuted }}>
                  {p.pode_editar || p.status === "concluido" || p.status === "cancelado"
                    ? "Nenhuma ação pendente."
                    : "Este pedido é de outra pessoa: você pode acompanhar, mas só quem é responsável por ele (ou a coordenação) altera."}
                </div>
              )}
              {p.status === "em_validacao" && p.validador_tipo === "interno" && !gestao && (
                <div style={{ fontSize: 12.5, color: colors.textSecondary }}>A validação deste pedido é da coordenação; ela registra a aprovação aqui no portal.</div>
              )}
              {acoesTempo.length > 0 && (
                <button type="button" style={linkBtn} onClick={() => setModal({ tipo: "retro" })}>Esqueci de clicar na hora: registrar em outro horário</button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Dados do pedido"
            action={p.pode_editar ? <button type="button" style={linkBtn} onClick={() => setModal({ tipo: "editar" })}>Editar</button> : null}
          >
            <dl style={dl}>
              <Dado k="Cliente" v={p.cliente} />
              <Dado k="Tipo" v={p.tipo || "—"} />
              <Dado k="Analista" v={p.analista_nome || "Sem analista"} />
              <Dado k="Quem valida" v={cliente ? "Cliente (por e-mail)" : "Coordenação"} />
              <Dado k="Aberto em" v={fmtDataHora(p.aberto_em)} />
              <Dado k="Quem pediu" v={p.solicitante || "—"} />
              <Dado k="Prazos (h úteis)" v={`criação ${fmtHoras(p.prazo_criacao_h)} · validação ${fmtHoras(p.prazo_validacao_h)} · postagem ${fmtHoras(p.prazo_postagem_h)}`} />
              <Dado k="Pontos" v={p.pontos ?? "—"} />
            </dl>
            {p.descricao && <p style={{ margin: "0 16px 16px", fontSize: 13.5, color: colors.textSecondary, whiteSpace: "pre-wrap" }}>{p.descricao}</p>}
          </SectionCard>
        </div>

        <SectionCard
          title="Linha do tempo"
          subtitle={`Esforço do analista: criação ${fmtHoras(p.horas_criacao)} + postagem ${fmtHoras(p.horas_postagem)}. Tempo com o validador: ${fmtHoras(p.horas_validacao)} (não conta contra o analista). Rodadas: ${p.rodadas}.`}
        >
          {p.etapas.length === 0 ? (
            <div style={{ padding: "0 16px 16px", fontSize: 13.5, color: colors.textMuted }}>Ainda sem etapas. Clique em “Iniciar criação” quando começar.</div>
          ) : (
            <div style={{ display: "grid", gap: 10, padding: "4px 16px 16px" }}>
              {p.etapas.map((e) => {
                const estourou = e.prazo_h > 0 && e.horas_uteis !== null && e.horas_uteis > e.prazo_h && e.etapa !== "validacao";
                return (
                  <div key={e.id} style={{ ...bloco, border: `1px solid ${e.inconsistente ? "#fdba74" : colors.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>
                        {ETAPA_ROTULO[e.etapa]}{e.etapa !== "postagem" && e.rodada > 1 ? ` · rodada ${e.rodada}` : e.etapa === "criacao" && p.rodadas > 1 ? " · rodada 1" : ""}
                        {e.etapa === "validacao" ? (cliente ? " (cliente)" : " (coordenação)") : ""}
                      </strong>
                      <span style={{ fontSize: 13, fontWeight: 700, color: estourou ? colors.danger : colors.textPrimary }}>
                        {e.inconsistente ? "Horário inconsistente" : `${fmtHoras(e.horas_uteis)} úteis`}
                        {e.prazo_h > 0 && e.etapa !== "validacao" && !e.inconsistente ? ` (prazo ${fmtHoras(e.prazo_h)})` : ""}
                        {e.aberta ? " · em andamento" : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                      {fmtDataHora(e.inicio)} → {e.fim ? fmtDataHora(e.fim) : "agora"}
                      {e.usuario_nome ? ` · por ${e.usuario_nome}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {e.resultado === "aprovado" && <span style={{ ...selo, background: colors.successLight, color: colors.successText }}>Aprovado</span>}
                      {e.resultado === "ajustes" && <span style={{ ...selo, background: colors.warningLight, color: colors.warningText }}>Pediu ajustes</span>}
                      {e.resultado === "cancelado" && <span style={{ ...selo, background: colors.neutralLight, color: colors.textSecondary }}>Interrompida (cancelado)</span>}
                      {e.retroativo ? <span style={{ ...selo, background: "#ede9fe", color: "#6d28d9" }}>Retroativo</span> : null}
                    </div>
                    {e.observacao && <div style={{ fontSize: 13, marginTop: 6 }}>Pedido de ajuste: {e.observacao}</div>}
                    {e.justificativa && <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 4 }}>Justificativa: {e.justificativa}</div>}
                    {gestao && (
                      <button type="button" style={{ ...linkBtn, marginTop: 6 }} onClick={() => setModal({ tipo: "etapa", etapa: e })}>Corrigir horário</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {modal?.tipo === "ajustes" && (
        <ModalTexto
          titulo={cliente ? "O que o cliente pediu para ajustar?" : "O que precisa ser ajustado?"}
          rotulo="Descreva em poucas palavras (opcional)"
          confirmar="Registrar pedido de ajustes"
          onFechar={() => setModal(null)}
          onConfirmar={(t) => executar("pedir_ajustes", { observacao: t })}
          ocupado={ocupado}
        />
      )}
      {modal?.tipo === "cancelar" && (
        <ModalTexto
          titulo="Cancelar este pedido?"
          rotulo="Motivo do cancelamento"
          obrigatorio
          confirmar="Cancelar pedido"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={(t) => executar("cancelar", { motivo: t })}
          ocupado={ocupado}
        />
      )}
      {modal?.tipo === "retro" && (
        <ModalRetro acoes={acoesTempo} rotuloAcao={rotuloAcao} minimo={p.aberto_em} onFechar={() => setModal(null)} onConfirmar={executar} ocupado={ocupado} />
      )}
      {modal?.tipo === "etapa" && (
        <ModalEtapa etapa={modal.etapa} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); setMsg("Horário corrigido."); carregar(); }} />
      )}
      {modal?.tipo === "editar" && (
        <ModalEditar p={p} gestao={gestao} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); setMsg("Dados salvos."); carregar(); }} />
      )}
    </PortalShell>
  );
}

function Dado({ k, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${colors.neutralLight}` }}>
      <dt style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".03em" }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 14 }}>{v}</dd>
    </div>
  );
}

function ModalBase({ titulo, children, onFechar }) {
  return (
    <div style={modalFundo} onClick={onFechar}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalTexto({ titulo, rotulo: rot, obrigatorio, confirmar, perigo, onFechar, onConfirmar, ocupado }) {
  const [t, setT] = useState("");
  return (
    <ModalBase titulo={titulo} onFechar={onFechar}>
      <label style={rotuloStyle}>{rot}
        <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} style={{ ...campoCheio, minHeight: 80, resize: "vertical" }} maxLength={500} />
      </label>
      <Rodape>
        <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Voltar</button>
        <button type="button" disabled={ocupado || (obrigatorio && t.trim().length < 3)} onClick={() => onConfirmar(t.trim())}
          style={{ ...estiloBtn.base, ...(perigo ? { background: colors.danger, color: "#fff", border: `1px solid ${colors.danger}` } : estiloBtn.pri), opacity: ocupado || (obrigatorio && t.trim().length < 3) ? 0.5 : 1 }}>
          {confirmar}
        </button>
      </Rodape>
    </ModalBase>
  );
}

function ModalRetro({ acoes, rotuloAcao, minimo, onFechar, onConfirmar, ocupado }) {
  const [acao, setAcao] = useState(acoes[0]);
  const [quando, setQuando] = useState(agoraLocalInput());
  const [just, setJust] = useState("");
  const [obs, setObs] = useState("");
  const pronto = quando && just.trim().length >= 5;
  return (
    <ModalBase titulo="Registrar em outro horário" onFechar={onFechar}>
      <p style={{ margin: "0 0 12px", fontSize: 13.5, color: colors.textSecondary }}>
        Use quando você fez o passo mas esqueceu de clicar na hora. O registro fica marcado como retroativo e a justificativa aparece para a coordenação.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={rotuloStyle}>O que aconteceu
          <select value={acao} onChange={(e) => setAcao(e.target.value)} style={campoCheio}>
            {acoes.map((a) => <option key={a} value={a}>{rotuloAcao(a)}</option>)}
          </select>
        </label>
        <label style={rotuloStyle}>Quando
          <input type="datetime-local" value={quando} max={agoraLocalInput()} min={String(minimo || "").slice(0, 16).replace(" ", "T")} onChange={(e) => setQuando(e.target.value)} style={campoCheio} />
        </label>
        {acao === "pedir_ajustes" && (
          <label style={rotuloStyle}>O que foi pedido (opcional)
            <input value={obs} onChange={(e) => setObs(e.target.value)} style={campoCheio} maxLength={500} />
          </label>
        )}
        <label style={rotuloStyle}>Justificativa (obrigatória)
          <input value={just} onChange={(e) => setJust(e.target.value)} style={campoCheio} maxLength={500} placeholder="Ex.: terminei às 15h mas só consegui registrar no dia seguinte" />
        </label>
      </div>
      <Rodape>
        <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Voltar</button>
        <button type="button" disabled={ocupado || !pronto} onClick={() => onConfirmar(acao, { quando, justificativa: just.trim(), observacao: obs.trim() || undefined })}
          style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: ocupado || !pronto ? 0.5 : 1 }}>Registrar</button>
      </Rodape>
    </ModalBase>
  );
}

function ModalEtapa({ etapa, onFechar, onSalvo }) {
  const paraInput = (s) => (s ? String(s).slice(0, 16).replace(" ", "T") : "");
  const [ini, setIni] = useState(paraInput(etapa.inicio));
  const [fim, setFim] = useState(paraInput(etapa.fim));
  const [just, setJust] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true); setErro("");
    try {
      await apiFetch(`/conteudo/etapas/${etapa.id}`, { method: "PUT", body: JSON.stringify({ inicio: ini, fim: fim || null, justificativa: just.trim() }) });
      onSalvo();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }
  return (
    <ModalBase titulo={`Corrigir horário: ${ETAPA_ROTULO[etapa.etapa]}`} onFechar={onFechar}>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={rotuloStyle}>Início<input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} style={campoCheio} /></label>
        <label style={rotuloStyle}>Fim (deixe vazio se ainda está em andamento)<input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} style={campoCheio} /></label>
        <label style={rotuloStyle}>Justificativa da correção (obrigatória)<input value={just} onChange={(e) => setJust(e.target.value)} style={campoCheio} maxLength={500} /></label>
      </div>
      {erro && <div style={{ ...alerta, marginTop: 12 }}>{erro}</div>}
      <Rodape>
        <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Voltar</button>
        <button type="button" disabled={salvando || just.trim().length < 5 || !ini} onClick={salvar} style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: salvando || just.trim().length < 5 || !ini ? 0.5 : 1 }}>Salvar correção</button>
      </Rodape>
    </ModalBase>
  );
}

function ModalEditar({ p, gestao, onFechar, onSalvo }) {
  const [tipos, setTipos] = useState([]);
  const [analistas, setAnalistas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [f, setF] = useState({
    titulo: p.titulo, cliente: p.cliente, tipo_id: p.tipo_id || "", validador_tipo: p.validador_tipo,
    solicitante: p.solicitante || "", descricao: p.descricao || "", analista_id: p.analista_id || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    apiFetch("/conteudo/tipos").then((t) => setTipos(t.filter((x) => x.ativo || x.id === p.tipo_id))).catch(() => {});
    apiFetch("/conteudo/clientes").then(setClientes).catch(() => {});
    if (gestao) apiFetch("/conteudo/analistas").then(setAnalistas).catch(() => {});
  }, [gestao, p.tipo_id]);
  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    const corpo = { titulo: f.titulo, cliente: f.cliente, validador_tipo: f.validador_tipo, solicitante: f.solicitante, descricao: f.descricao };
    if (f.tipo_id) corpo.tipo_id = Number(f.tipo_id);
    if (gestao && String(f.analista_id) !== String(p.analista_id || "")) corpo.analista_id = f.analista_id ? Number(f.analista_id) : null;
    try {
      await apiFetch(`/conteudo/pedidos/${p.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      onSalvo();
    } catch (err) { setErro(err.message); setSalvando(false); }
  }
  return (
    <ModalBase titulo="Editar pedido" onFechar={onFechar}>
      <form onSubmit={salvar} style={{ display: "grid", gap: 12 }}>
        <label style={rotuloStyle}>Título<input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} style={campoCheio} maxLength={255} /></label>
        <label style={rotuloStyle}>Cliente
          <input list="clientes-edit" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} style={campoCheio} maxLength={150} />
          <datalist id="clientes-edit">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label style={rotuloStyle}>Tipo de material
          <select value={f.tipo_id} onChange={(e) => setF({ ...f, tipo_id: e.target.value })} style={campoCheio}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label style={rotuloStyle}>Quem valida
          <select value={f.validador_tipo} onChange={(e) => setF({ ...f, validador_tipo: e.target.value })} style={campoCheio}>
            <option value="cliente">Cliente (por e-mail)</option>
            <option value="interno">Coordenação</option>
          </select>
        </label>
        {gestao && (
          <label style={rotuloStyle}>Analista
            <select value={f.analista_id} onChange={(e) => setF({ ...f, analista_id: e.target.value })} style={campoCheio}>
              <option value="">Sem analista</option>
              {analistas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
        )}
        <label style={rotuloStyle}>Quem pediu<input value={f.solicitante} onChange={(e) => setF({ ...f, solicitante: e.target.value })} style={campoCheio} maxLength={150} /></label>
        <label style={rotuloStyle}>Detalhes<textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={{ ...campoCheio, minHeight: 70, resize: "vertical" }} /></label>
        {erro && <div style={alerta}>{erro}</div>}
        <Rodape>
          <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: salvando ? 0.6 : 1 }}>Salvar</button>
        </Rodape>
      </form>
    </ModalBase>
  );
}

function Rodape({ children }) {
  return <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>{children}</div>;
}

const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const aviso = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "48px 16px", fontSize: 14, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg };
const selo = { padding: "3px 10px", borderRadius: radius.pill, fontSize: 12, fontWeight: 800 };
const linkBtn = { background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left", font: "inherit", textDecoration: "underline" };
const dl = { margin: 0, padding: "0 16px 12px", display: "grid" };
const bloco = { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "10px 14px", background: "#fff" };
const campo = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", font: "inherit", fontSize: 13.5, color: colors.textPrimary };
const campoCheio = { ...campo, width: "100%", boxSizing: "border-box" };
const rotuloStyle = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const modalFundo = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16, overflowY: "auto" };
const modalBox = { background: "#fff", borderRadius: radius.lg, padding: 22, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(15,23,42,.3)" };
