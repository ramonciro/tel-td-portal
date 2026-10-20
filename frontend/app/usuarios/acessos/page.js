"use client";

/**
 * app/usuarios/acessos/page.js — Códigos de primeiro acesso dos treinandos (21/10/2026)
 *
 * Cada treinando novo recebe um código próprio (em vez da senha única). Aqui a
 * coordenação vê quem ainda não acessou, gera/renova códigos, copia o código de
 * uma pessoa e baixa a lista em Excel para entregar.
 */

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";

const SITUACOES = [
  { id: "", label: "Todas" },
  { id: "aguardando", label: "Aguardando primeiro acesso" },
  { id: "senha_padrao", label: "Sem código (senha antiga)" },
  { id: "codigo_vencido", label: "Código vencido" },
  { id: "ativa", label: "Já acessaram" },
];

const COR = {
  ativa: { bg: "#dcfce7", cor: "#166534" },
  aguardando: { bg: "#dbeafe", cor: "#1e40af" },
  senha_padrao: { bg: "#fef3c7", cor: "#92400e" },
  codigo_vencido: { bg: "#fee2e2", cor: "#991b1b" },
};

function fmtData(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default function AcessosPage() {
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState("");
  const [situacao, setSituacao] = useState("");
  const [busca, setBusca] = useState("");
  const [resumo, setResumo] = useState(null);
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const qs = turmaId ? `?treinamento_id=${turmaId}` : "";

  async function carregar() {
    try {
      setLoading(true);
      setErro("");
      const [r, l] = await Promise.all([
        apiFetch(`/acesso-inicial/resumo${qs}`),
        apiFetch(`/acesso-inicial/lista${qs}`),
      ]);
      setResumo(r);
      setLista(Array.isArray(l) ? l : []);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar os acessos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiFetch("/treinamentos").then((d) => setTurmas(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [turmaId]);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter((l) =>
      (!situacao || l.situacao === situacao) &&
      (!t || [l.nome, l.identificador, l.cliente].join(" ").toLowerCase().includes(t))
    );
  }, [lista, situacao, busca]);

  async function gerar(renovarTodos) {
    const aviso = renovarTodos
      ? "Gerar novos códigos para TODOS que ainda não acessaram (os códigos atuais deixam de valer)?"
      : "Gerar códigos para quem está sem código ou com código vencido? Quem ainda usa a senha antiga passa a precisar do código novo.";
    if (!window.confirm(aviso)) return;
    try {
      setTrabalhando(true); setErro(""); setOk("");
      const r = await apiFetch("/acesso-inicial/gerar", {
        method: "POST",
        body: JSON.stringify({ treinamento_id: turmaId ? Number(turmaId) : null, renovar_todos: renovarTodos }),
      });
      setOk(`${r.gerados} código(s) gerado(s).`);
      await carregar();
    } catch (e) {
      setErro(e.message || "Erro ao gerar códigos.");
    } finally {
      setTrabalhando(false);
    }
  }

  async function novoCodigo(l) {
    if (!window.confirm(`Gerar um novo código para ${l.nome}? Ela(e) precisará criar uma nova senha no próximo acesso.`)) return;
    try {
      setErro(""); setOk("");
      const r = await apiFetch(`/acesso-inicial/regenerar/${l.id}`, { method: "POST" });
      setOk(`Novo código de ${r.nome}: ${r.codigo}`);
      await carregar();
    } catch (e) {
      setErro(e.message || "Erro ao gerar o código.");
    }
  }

  async function copiar(codigo) {
    try { await navigator.clipboard.writeText(codigo); setOk(`Código ${codigo} copiado.`); } catch { setOk(`Código: ${codigo}`); }
  }

  function mensagemPronta(l) {
    const origem = typeof window !== "undefined" ? window.location.origin : "";
    return [
      `Olá, ${String(l.nome || "").split(" ")[0]}! Seu acesso ao Portal T&D está liberado.`,
      origem ? `Endereço: ${origem}` : null,
      `Login: ${l.identificador || "seu CPF ou matrícula"}`,
      `Código de primeiro acesso: ${l.codigo}${l.expira_em ? ` (vale até ${fmtData(l.expira_em)})` : ""}`,
      "No primeiro acesso você cria a sua senha.",
    ].filter(Boolean).join("\n");
  }

  async function copiarMensagem(l) {
    const texto = mensagemPronta(l);
    try { await navigator.clipboard.writeText(texto); setOk(`Mensagem de ${l.nome} copiada — é só colar no WhatsApp ou no e-mail.`); }
    catch { setOk(texto); }
  }

  async function exportar() {
    try { setErro(""); await apiDownload(`/acesso-inicial/exportar${qs}`, "codigos-de-acesso.xlsx"); }
    catch (e) { setErro(e.message || "Erro ao exportar."); }
  }

  return (
    <PortalShell>
      <PageHero
        eyebrow="Gestão de Usuários"
        title="Códigos de primeiro acesso"
        subtitle="Cada treinando entra com um código próprio e cria a sua senha no primeiro acesso. O código vale por 14 dias."
        stats={resumo ? [
          { label: "Treinandos", value: resumo.total },
          { label: "Aguardando acesso", value: resumo.aguardando },
          { label: "Sem código", value: resumo.senha_padrao },
          { label: "Código vencido", value: resumo.codigo_vencido },
          { label: "Já acessaram", value: resumo.ativa },
        ] : undefined}
        actions={
          <>
            <button type="button" onClick={exportar} style={btn("#fff", "#0f172a")}>Baixar lista (Excel)</button>
            <button type="button" onClick={() => gerar(false)} disabled={trabalhando} style={btn("#d97706", "#fff")}>
              {trabalhando ? "Gerando…" : "Gerar códigos pendentes"}
            </button>
          </>
        }
      />

      {erro ? <div style={alerta("#fee2e2", "#991b1b")}>{erro}</div> : null}
      {ok ? <div style={alerta("#dcfce7", "#166534")}>{ok}</div> : null}

      <div style={{ marginTop: 16 }}>
        <SectionCard
          title="Treinandos"
          subtitle="Filtre por turma para entregar os códigos só de quem entrou nela."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)} style={campo}>
                <option value="">Todas as turmas</option>
                {turmas.map((t) => <option key={t.id} value={t.id}>{t.tema || `Turma ${t.id}`}{t.cliente ? ` — ${t.cliente}` : ""}</option>)}
              </select>
              <select value={situacao} onChange={(e) => setSituacao(e.target.value)} style={campo}>
                {SITUACOES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou matrícula" style={campo} />
            </div>
          }
        >
          {loading ? <p style={{ padding: 16, color: colors.textMuted }}>Carregando…</p> : !filtrada.length ? (
            <p style={{ padding: 16, color: colors.textMuted }}>Nenhum treinando encontrado com esse filtro.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>{["Nome", "Login (CPF/matrícula)", "Operação", "Situação", "Código", "Vale até", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtrada.map((l) => (
                    <tr key={l.id}>
                      <td style={td}>{l.nome}</td>
                      <td style={td}>{l.identificador || "—"}</td>
                      <td style={td}>{l.cliente || "—"}</td>
                      <td style={td}><span style={{ background: COR[l.situacao].bg, color: COR[l.situacao].cor, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{l.situacao_rotulo}</span></td>
                      <td style={{ ...td, fontFamily: "monospace", fontWeight: 800, letterSpacing: ".06em" }}>
                        {l.codigo ? <button type="button" onClick={() => copiar(l.codigo)} title="Copiar" style={{ ...linkBtn, fontFamily: "monospace" }}>{l.codigo}</button> : "—"}
                      </td>
                      <td style={td}>{fmtData(l.expira_em)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {l.codigo ? <button type="button" onClick={() => copiarMensagem(l)} style={{ ...linkBtn, marginRight: 12 }}>Copiar mensagem</button> : null}
                        <button type="button" onClick={() => novoCodigo(l)} style={linkBtn}>Novo código</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const campo = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "#fff", minWidth: 140 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };
const linkBtn = { background: "none", border: 0, color: "#1d4ed8", fontWeight: 800, cursor: "pointer", fontSize: 12, padding: 0 };
const btn = (bg, cor) => ({ background: bg, color: cor, border: 0, borderRadius: 10, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" });
const alerta = (bg, cor) => ({ marginTop: 12, background: bg, color: cor, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700 });
