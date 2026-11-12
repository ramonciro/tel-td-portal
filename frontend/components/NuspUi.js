"use client";

// Peças compartilhadas das telas do Núcleo de Saúde Psicossocial (NUSPSI, 06/11/2026).
// Mantidas em um arquivo só para as 5 telas do módulo terem a mesma cara e as mesmas regras de formulário.

import { useEffect, useRef, useState } from "react";
import { colors, radius } from "../lib/theme";
import { getStoredUser, apiFetch, apiDownload } from "../services/api";

export const PERFIL_COORD = "coordenador_nusp";
export const PERFIL_ANALISTA = "analista_nusp";
export const PERFIL_GESTOR = "gestor_nusp";

export function perfilNusp() {
  return String(getStoredUser()?.perfil || "").toLowerCase();
}
export const ehOperacao = (perfil) => perfil === PERFIL_COORD || perfil === PERFIL_ANALISTA;

export const TIPO_LABEL = {
  escuta_coletiva: "Escuta coletiva",
  capacitacao: "Capacitação",
  acao_intervencao: "Ação / intervenção",
  reuniao: "Reunião / alinhamento",
  monitoramento: "Monitoramento",
  comunicacao: "Comunicação / campanha",
  outros: "Outros",
};
export const FORMATO_LABEL = { presencial: "Presencial", online: "Online ao vivo", hibrido: "Híbrido" };
export const STATUS_ATV_LABEL = { planejada: "Planejada", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
export const STATUS_PLANO_LABEL = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
export const PRESENCA_LABEL = { presente: "Presente", ausente: "Ausente", justificado: "Justificado" };

export const fmtData = (iso) => {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
};
export const fmtDataOuSem = (iso, texto = "Sem data definida") => (iso ? fmtData(iso) : texto);
export const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
export const fmtHoras = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export const hojeISO = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const mesLabel = (ym) => {
  const [a, m] = String(ym || "").split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return m ? `${nomes[Number(m) - 1] || m}/${String(a).slice(2)}` : ym;
};

// ── Estilos ───────────────────────────────────────────────────────────
export const st = {
  card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 18, boxShadow: "0 8px 18px rgba(15,23,42,.04)" },
  cardTitle: { margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: colors.textPrimary },
  label: { display: "block", fontSize: 11.5, fontWeight: 700, color: colors.textSecondary, marginBottom: 4 },
  input: { width: "100%", height: 38, borderRadius: 10, border: `1px solid ${colors.border}`, padding: "0 10px", fontSize: 13, background: "#fff", color: colors.textPrimary, boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 70, borderRadius: 10, border: `1px solid ${colors.border}`, padding: "8px 10px", fontSize: 13, background: "#fff", color: colors.textPrimary, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  btn: { height: 38, padding: "0 16px", borderRadius: 10, border: 0, background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" },
  btnGhost: { height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  btnMini: { padding: "5px 10px", borderRadius: 8, border: 0, background: colors.primaryLight, color: colors.primary, fontWeight: 700, fontSize: 11.5, cursor: "pointer" },
  btnMiniDanger: { padding: "5px 10px", borderRadius: 8, border: 0, background: colors.dangerLight, color: colors.dangerText, fontWeight: 700, fontSize: 11.5, cursor: "pointer" },
  th: { textAlign: "left", fontSize: 11, fontWeight: 800, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em", padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" },
  td: { fontSize: 13, color: colors.textPrimary, padding: "9px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" },
  erro: { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 },
  ok: { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 },
  vazio: { padding: 24, textAlign: "center", color: colors.textMuted, fontSize: 13 },
  filtros: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 },
};

const CORES_BADGE = {
  concluida: [colors.successLight, colors.successText],
  em_andamento: ["#dbeafe", "#1d4ed8"],
  planejada: [colors.neutralLight, colors.textSecondary],
  pendente: [colors.neutralLight, colors.textSecondary],
  cancelada: [colors.neutralLight, colors.textMuted],
  atrasado: [colors.dangerLight, colors.dangerText],
  alerta: [colors.warningLight, colors.warningText],
  em_producao: ["#dbeafe", "#1d4ed8"],
  concluido: [colors.successLight, colors.successText],
};
export function Badge({ tom, children }) {
  const [bg, cor] = CORES_BADGE[tom] || [colors.neutralLight, colors.textSecondary];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: bg, color: cor, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function Campo({ label, children, dica, flex = 1, minWidth = 150 }) {
  return (
    <div style={{ flex, minWidth }}>
      <label style={st.label}>{label}</label>
      {children}
      {dica ? <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>{dica}</div> : null}
    </div>
  );
}

export function Select({ value, onChange, opcoes, vazio = "Todos", style }) {
  return (
    <select style={{ ...st.input, ...style }} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {vazio !== null ? <option value="">{vazio}</option> : null}
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export const opcoesDe = (lista, rotulo = "nome") => (lista || []).filter((i) => i.ativo !== 0).map((i) => ({ value: String(i.id), label: i[rotulo] }));
export const opcoesNomes = (lista) => (lista || []).map((n) => ({ value: n, label: n }));
export const opcoesMapa = (mapa) => Object.entries(mapa).map(([value, label]) => ({ value, label }));

export function Modal({ titulo, onClose, children, largura = 760 }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 12px", overflowY: "auto" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} style={{ background: "#fff", borderRadius: radius.lg, width: "100%", maxWidth: largura, padding: 22, boxShadow: "0 24px 60px rgba(15,23,42,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: colors.textPrimary }}>{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ ...st.btnGhost, height: 32, padding: "0 10px" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Barras horizontais simples (valor relativo ao maior). Cor única — o rótulo carrega a identidade.
export function Barras({ dados, valueKey = "atividades", sufixo = "", vazio = "Sem dados no período." }) {
  if (!dados || !dados.length) return <div style={st.vazio}>{vazio}</div>;
  const max = Math.max(...dados.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div>
      {dados.map((d) => {
        const v = Number(d[valueKey]) || 0;
        return (
          <div key={d.nome} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, marginBottom: 3 }}>
              <span style={{ color: colors.textSecondary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.nome}>{d.nome}</span>
              <strong style={{ color: colors.textPrimary, whiteSpace: "nowrap" }}>{fmtNum(v)}{sufixo}</strong>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: colors.neutralLight }}>
              <div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: "100%", borderRadius: 4, background: colors.primary }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Colunas({ dados, valueKey = "atividades" }) {
  if (!dados || !dados.length) return <div style={st.vazio}>Sem dados no período.</div>;
  const max = Math.max(...dados.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150, overflowX: "auto", paddingBottom: 4 }}>
      {dados.map((d) => {
        const v = Number(d[valueKey]) || 0;
        return (
          <div key={d.mes} title={`${mesLabel(d.mes)}: ${fmtNum(v)}`} style={{ flex: "1 0 34px", maxWidth: 70, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 }}>{fmtNum(v)}</span>
            <div style={{ width: "100%", height: `${Math.max(3, (v / max) * 100)}px`, maxHeight: 110, background: colors.primary, borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: 4 }}>{mesLabel(d.mes)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Paginacao({ total, limite, pagina, onPagina }) {
  const paginas = Math.max(1, Math.ceil((total || 0) / (limite || 50)));
  if (paginas <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5, color: colors.textSecondary }}>
      <button type="button" style={st.btnGhost} disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>Anterior</button>
      <span>Página {pagina} de {paginas}</span>
      <button type="button" style={st.btnGhost} disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>Próxima</button>
    </div>
  );
}

// ── Evidências: link ou arquivo (Pacote 4) ────────────────────────────
const fmtTamanho = (b) => {
  const n = Number(b || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024)).toLocaleString("pt-BR")} KB`;
};
export const ACEITA_ARQUIVO = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";

/** Uma evidência na lista: link (abre em nova aba) ou arquivo (baixa pela rota autenticada; só a equipe técnica). */
export function EvidenciaItem({ x, podeRemover, ocupado, onRemover, onErro }) {
  const baixar = async () => {
    try { await apiDownload(`/nusp/evidencias/${x.id}/arquivo`, x.arquivo_nome || "evidencia"); } catch (e) { onErro?.(e.message); }
  };
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13, flexWrap: "wrap" }}>
      {x.ehArquivo ? (
        <span style={{ flex: 1, minWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
          <span aria-hidden="true">📎 </span>
          <strong style={{ color: colors.textPrimary }}>{x.titulo || x.arquivo_nome}</strong>
          {x.titulo && x.pode_baixar ? <span style={{ color: colors.textMuted }}> · {x.arquivo_nome}</span> : null}
          {x.arquivo_tamanho ? <span style={{ color: colors.textMuted }}> · {fmtTamanho(x.arquivo_tamanho)}</span> : null}
        </span>
      ) : (
        <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, fontWeight: 700, flex: 1, minWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{x.titulo || x.url}</a>
      )}
      <span style={{ fontSize: 11.5, color: colors.textMuted }}>{x.criado_por_nome} · {x.criado_em}</span>
      {x.ehArquivo && x.pode_baixar ? <button type="button" style={st.btnMini} onClick={baixar}>Baixar</button> : null}
      {podeRemover ? <button type="button" style={st.btnMiniDanger} disabled={ocupado} onClick={() => onRemover(x)}>Remover</button> : null}
    </li>
  );
}

/** Anexar um arquivo como evidência. `acao` é o executor da tela (liga o "ocupado", mostra a mensagem e recarrega). */
export function AnexarArquivo({ entidade, entidadeId, ocupado, acao }) {
  const ref = useRef(null);
  const [titulo, setTitulo] = useState("");
  const [nome, setNome] = useState("");
  const enviar = (e) => {
    e.preventDefault();
    const arq = ref.current?.files?.[0];
    if (!arq) return;
    acao(async () => {
      const fd = new FormData();
      fd.append("entidade", entidade);
      fd.append("entidade_id", String(entidadeId));
      if (titulo.trim()) fd.append("titulo", titulo.trim());
      fd.append("arquivo", arq);
      await apiFetch("/nusp/evidencias/arquivo", { method: "POST", body: fd });
      setTitulo(""); setNome("");
      if (ref.current) ref.current.value = "";
    }, "Arquivo anexado.");
  };
  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
      <Campo label="Ou anexe um arquivo" flex={2} minWidth={240} dica="PDF, imagem, Word, Excel, PowerPoint, CSV ou TXT, até 15 MB. Só a equipe do Núcleo consegue abrir.">
        <input ref={ref} type="file" accept={ACEITA_ARQUIVO} style={{ ...st.input, height: "auto", padding: "7px 10px" }} onChange={(e) => setNome(e.target.files?.[0]?.name || "")} />
      </Campo>
      <Campo label="Título (opcional)" minWidth={170}><input style={st.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Lista de presença assinada" /></Campo>
      <button type="submit" style={st.btn} disabled={ocupado || !nome}>Enviar arquivo</button>
    </form>
  );
}
