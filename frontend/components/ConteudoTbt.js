"use client";

import { useCallback, useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { apiFetch } from "../services/api";
import { colors, radius } from "../lib/theme";
import { estiloBtn, fmtData, fmtDataHora, fmtDias } from "../lib/conteudoUi";

// Aba "TBT e séries" (Pacote 3, 23/10/2026).
// O #TBT do analista é o material criado DEPOIS da ação em piso: o instrutor realiza a turma e,
// só então, o analista cria o material. Por isso não há pedido semanal automático: esta aba lista
// as TBT já realizadas que ainda não têm material e abre o pedido com um clique, já ligado à
// turma e à série do cliente.

const JANELAS = [
  { dias: 45, rotulo: "Últimos 45 dias" },
  { dias: 90, rotulo: "Últimos 90 dias" },
  { dias: 180, rotulo: "Últimos 180 dias" },
];

function ddmm(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : "";
}

export default function ConteudoTbt({ perfil, onCriarPedido, onMudou }) {
  const podeEscrever = ["coordenador", "supervisor", "assistente_treinamento", "analista_conteudo", "super_admin"].includes(perfil);
  const coordenador = perfil === "coordenador" || perfil === "super_admin";
  const [dias, setDias] = useState(45);
  const [pend, setPend] = useState(null);
  const [series, setSeries] = useState(null);
  const [disp, setDisp] = useState(null);
  const [verDisp, setVerDisp] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [dispensando, setDispensando] = useState(null);
  const [editandoSerie, setEditandoSerie] = useState(undefined); // undefined = fechado; null = nova

  const carregar = useCallback(() => {
    apiFetch(`/conteudo/tbt/pendentes?dias=${dias}`).then((r) => { setPend(r); setErro(""); }).catch((e) => setErro(e.message));
    apiFetch("/conteudo/series").then(setSeries).catch((e) => setErro(e.message));
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!verDisp) return;
    apiFetch("/conteudo/tbt/dispensadas").then(setDisp).catch((e) => setErro(e.message));
  }, [verDisp, pend?.dispensadas]);

  function criarPedido(t) {
    const s = t.serie ? (series?.series || []).find((x) => x.id === t.serie.id) : null;
    onCriarPedido({
      titulo: `${t.serie?.nome || `#TBT ${t.cliente}`} — ${ddmm(t.realizada_em)}`,
      cliente: s?.cliente || t.cliente,
      tipo_id: s?.tipo_id || "",
      turma: { id: t.id, tema: t.tema, cliente: t.cliente, realizada_em: t.realizada_em },
      serie_nome: t.serie?.nome || null,
    });
  }

  async function voltarParaLista(id) {
    try {
      await apiFetch(`/conteudo/tbt/${id}/dispensar`, { method: "DELETE" });
      setMsg("A turma voltou para a lista de TBT aguardando material.");
      carregar();
      onMudou?.();
      if (verDisp) apiFetch("/conteudo/tbt/dispensadas").then(setDisp).catch(() => {});
    } catch (e) { setErro(e.message); }
  }

  const itens = pend?.itens || [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {erro && <div style={alerta}>{erro}</div>}
      {msg && <div style={aviso}>{msg}</div>}

      <SectionCard
        title="TBT realizadas aguardando material"
        subtitle="O material do #TBT nasce depois da ação em piso. Assim que o instrutor realiza a turma, ela aparece aqui até alguém abrir o pedido."
        action={
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={campo} aria-label="Período">
            {JANELAS.map((j) => <option key={j.dias} value={j.dias}>{j.rotulo}</option>)}
          </select>
        }
      >
        {!pend ? (
          <div style={vazio}>Carregando…</div>
        ) : itens.length === 0 ? (
          <div style={vazio}>Nenhuma TBT esperando material neste período. Tudo em dia.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, padding: "4px 16px 8px" }}>
            {itens.map((t) => (
              <div key={t.id} style={linhaTbt}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <strong style={{ fontSize: 14.5 }}>{t.tema}</strong>
                  <div style={sub}>
                    {[t.cliente, `realizada em ${fmtData(t.realizada_em)}`, t.serie ? t.serie.nome : "sem série"].join(" · ")}
                  </div>
                  <div style={sub}>{t.instrutores.join(" · ")}{t.motivo === "co-instrutores" ? " · reconhecida pelos co-instrutores" : ""}</div>
                </div>
                <span style={{ ...selo, whiteSpace: "nowrap", background: t.dias_espera >= 7 ? colors.warningLight : colors.neutralLight, color: t.dias_espera >= 7 ? colors.warningText : colors.textSecondary }}>
                  {t.dias_espera === 0 ? "hoje" : `esperando ${fmtDias(t.dias_espera)}`}
                </span>
                {podeEscrever ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.pri, padding: "7px 12px" }} onClick={() => criarPedido(t)}>Criar pedido</button>
                    <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.sec, padding: "7px 12px" }} onClick={() => setDispensando(t)}>Não precisa de material</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "10px 16px 14px", fontSize: 12.5, color: colors.textMuted, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>O portal reconhece a TBT pelo nome da turma (“TBT”) ou por ter mais de um instrutor. Se uma turma entrou por engano, marque “Não precisa de material”.</span>
          {(pend?.dispensadas ?? 0) > 0 && (
            <button type="button" style={linkBtn} onClick={() => setVerDisp((v) => !v)}>
              {verDisp ? "Esconder as dispensadas" : `Ver as ${pend.dispensadas} dispensada(s)`}
            </button>
          )}
        </div>
        {verDisp && disp && (
          <div style={{ padding: "0 16px 16px", display: "grid", gap: 6 }}>
            {disp.length === 0 && <span style={sub}>Nenhuma turma dispensada.</span>}
            {disp.map((d) => (
              <div key={d.id} style={linhaDisp}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{d.tema || `Turma ${d.id}`}</strong>
                  <div style={sub}>{[d.cliente, d.realizada_em ? fmtData(d.realizada_em) : null, d.motivo, d.usuario_nome ? `por ${d.usuario_nome}` : null, d.em ? fmtDataHora(d.em) : null].filter(Boolean).join(" · ")}</div>
                </div>
                {podeEscrever && <button type="button" style={linkBtn} onClick={() => voltarParaLista(d.id)}>Voltar para a lista</button>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Séries por cliente"
        subtitle="Cada cliente tem a sua série de #TBT (“Em 90 dias” = entregues nos últimos 90 dias). “Da turma ao material” é o tempo, em dias corridos, entre a ação em piso e o material concluído."
        action={coordenador ? <button type="button" style={{ ...estiloBtn.base, ...estiloBtn.sec, padding: "7px 12px" }} onClick={() => setEditandoSerie(null)}>+ Nova série</button> : null}
      >
        {!series ? (
          <div style={vazio}>Carregando…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>{["Série", "Cliente", "Entregues", "Em aberto", "Em 90 dias", "Último concluído", "Aguardando", "Da turma ao material", ""].map((h) => <th key={h || "ed"} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {series.series.map((s) => (
                  <tr key={s.id} style={{ opacity: s.ativo ? 1 : 0.55 }}>
                    <td style={td}><strong>{s.nome}</strong>{!s.ativo && <span style={{ ...selo, marginLeft: 6, background: colors.neutralLight, color: colors.textMuted }}>Arquivada</span>}</td>
                    <td style={td}>{s.cliente}</td>
                    <td style={td}>{s.concluidos}</td>
                    <td style={td}>{s.abertos}</td>
                    <td style={td}>{s.concluidos_90d}</td>
                    <td style={td}>{s.ultimo_concluido_em ? fmtData(s.ultimo_concluido_em) : "—"}</td>
                    <td style={td}>{s.aguardando_material ? <span style={{ ...selo, background: colors.warningLight, color: colors.warningText }}>{s.aguardando_material}</span> : "0"}</td>
                    <td style={td}>
                      {s.da_turma_ao_material_dias.mediana === null ? <span style={{ color: colors.textMuted }}>sem dados</span> : `${String(s.da_turma_ao_material_dias.mediana).replace(".", ",")} dias`}
                      {s.da_turma_ao_material_dias.n > 0 && <div style={sub}>{s.da_turma_ao_material_dias.n} material(is) ligado(s) à turma</div>}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{coordenador && <button type="button" style={linkBtn} onClick={() => setEditandoSerie(s)}>Editar</button>}</td>
                  </tr>
                ))}
                {series.series.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: colors.textMuted }} colSpan={9}>Nenhuma série cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {series && series.aguardando_sem_serie > 0 && (
          <div style={{ padding: "10px 16px 14px", fontSize: 12.5, color: colors.warningText }}>
            {series.aguardando_sem_serie} TBT aguardando material é de um cliente sem série{coordenador ? ". Crie a série em “+ Nova série” para acompanhar esse cliente." : ". Peça à coordenação para criar a série."}
          </div>
        )}
        <div style={{ padding: "0 16px 14px", fontSize: 12.5, color: colors.textMuted }}>
          Os pedidos antigos com “#TBT” no título já foram ligados à série do cliente. Eles não têm turma, então não entram no tempo “da turma ao material”.
        </div>
      </SectionCard>

      {dispensando && (
        <ModalDispensa
          turma={dispensando}
          onFechar={() => setDispensando(null)}
          onFeito={() => { setDispensando(null); setMsg("Pronto: a turma saiu da lista. Dá para desfazer em “Ver as dispensadas”."); carregar(); onMudou?.(); }}
        />
      )}
      {editandoSerie !== undefined && (
        <ModalSerie
          serie={editandoSerie}
          onFechar={() => setEditandoSerie(undefined)}
          onSalvo={() => { setEditandoSerie(undefined); setMsg("Série salva."); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalBase({ titulo, onFechar, children }) {
  return (
    <div style={modalFundo} onClick={onFechar}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalDispensa({ turma, onFechar, onFeito }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      await apiFetch(`/conteudo/tbt/${turma.id}/dispensar`, { method: "POST", body: JSON.stringify({ motivo }) });
      onFeito();
    } catch (err) { setErro(err.message); setSalvando(false); }
  }
  return (
    <ModalBase titulo="Esta turma não precisa de material?" onFechar={onFechar}>
      <form onSubmit={salvar} style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 14 }}><strong>{turma.tema}</strong> · {turma.cliente} · {fmtData(turma.realizada_em)}</div>
        <label style={rotulo}>Motivo (opcional)
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} style={campoCheio} maxLength={300} placeholder="Ex.: não é TBT; o cliente não pediu material" />
        </label>
        {erro && <div style={alerta}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: salvando ? 0.6 : 1 }}>Tirar da lista</button>
        </div>
      </form>
    </ModalBase>
  );
}

function ModalSerie({ serie, onFechar, onSalvo }) {
  const nova = !serie;
  const [tipos, setTipos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [f, setF] = useState({ nome: serie?.nome || "", cliente: serie?.cliente || "", tipo_id: serie?.tipo_id || "", ativo: serie ? serie.ativo : true });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    apiFetch("/conteudo/tipos").then((t) => setTipos(t.filter((x) => x.ativo || x.id === serie?.tipo_id))).catch(() => {});
    apiFetch("/conteudo/clientes").then(setClientes).catch(() => {});
  }, [serie?.tipo_id]);
  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!f.nome.trim() || !f.cliente.trim()) { setErro("Informe o nome da série e o cliente."); return; }
    setSalvando(true);
    try {
      const corpo = { nome: f.nome, cliente: f.cliente, tipo_id: f.tipo_id ? Number(f.tipo_id) : null, ativo: f.ativo };
      await apiFetch(nova ? "/conteudo/series" : `/conteudo/series/${serie.id}`, { method: nova ? "POST" : "PUT", body: JSON.stringify(corpo) });
      onSalvo();
    } catch (err) { setErro(err.message); setSalvando(false); }
  }
  return (
    <ModalBase titulo={nova ? "Nova série de #TBT" : "Editar série"} onFechar={onFechar}>
      <form onSubmit={salvar} style={{ display: "grid", gap: 12 }}>
        <label style={rotulo}>Nome da série
          <input autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={campoCheio} maxLength={120} placeholder="#TBT Nome do cliente" />
        </label>
        <label style={rotulo}>Cliente
          <input list="clientes-serie" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} style={campoCheio} maxLength={150} />
          <datalist id="clientes-serie">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label style={rotulo}>Tipo de material padrão
          <select value={f.tipo_id} onChange={(e) => setF({ ...f, tipo_id: e.target.value })} style={campoCheio}>
            <option value="">Sem tipo padrão</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        {!nova && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Série ativa <span style={{ fontSize: 12, color: colors.textMuted }}>(arquivada, deixa de ser usada nos novos pedidos; o histórico fica)</span>
          </label>
        )}
        {erro && <div style={alerta}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onFechar} style={{ ...estiloBtn.base, ...estiloBtn.sec }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{ ...estiloBtn.base, ...estiloBtn.pri, opacity: salvando ? 0.6 : 1 }}>Salvar</button>
        </div>
      </form>
    </ModalBase>
  );
}

const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const aviso = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "32px 16px", fontSize: 14 };
const campo = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", fontFamily: "inherit", fontSize: 13.5, color: colors.textPrimary };
const campoCheio = { ...campo, width: "100%", boxSizing: "border-box" };
const rotulo = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const selo = { padding: "2px 8px", borderRadius: radius.pill, fontSize: 11.5, fontWeight: 800 };
const sub = { fontSize: 12, color: colors.textMuted, marginTop: 2 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textMuted, borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "middle" };
const linkBtn = { background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" };
const linhaTbt = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: "#fff" };
const linhaDisp = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.surfaceMuted };
const modalFundo = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16, overflowY: "auto" };
const modalBox = { background: "#fff", borderRadius: radius.lg, padding: 22, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(15,23,42,.3)" };
