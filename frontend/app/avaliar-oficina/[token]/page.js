"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import API_URL from "../../../services/api";
import { colors, radius, brandGradientDark } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";

// Página PÚBLICA para o participante avaliar os módulos da Oficina de Talentos (21/10/2026).
// Sem login e fora do PortalShell. Quem avalia se identifica com CPF + matrícula e só vê os
// módulos em que sua presença foi registrada. A avaliação é anônima para a equipe: ela vê
// médias e comentários, nunca o nome. Fala só com /api/public/oficina/:token/reacoes.

const LOGO = "/logo-td.png";
const NOTAS = [
  { n: 1, rotulo: "Ruim" }, { n: 2, rotulo: "Regular" }, { n: 3, rotulo: "Bom" }, { n: 4, rotulo: "Muito bom" }, { n: 5, rotulo: "Excelente" },
];

function mascaraCpf(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

async function chamar(token, caminho, corpo) {
  const resp = await fetch(`${API_URL}/public/oficina/${encodeURIComponent(token)}${caminho}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  let dados = {};
  try { dados = await resp.json(); } catch {}
  if (!resp.ok) throw new Error(dados.error || "Não foi possível concluir agora. Tente novamente.");
  return dados;
}

export default function AvaliarOficinaPage() {
  const params = useParams();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;

  const [cpf, setCpf] = useState("");
  const [matricula, setMatricula] = useState("");
  const [dados, setDados] = useState(null); // { participante, turma, modulos }
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [rascunho, setRascunho] = useState({}); // moduloId -> { nota, comentario }
  const [enviandoId, setEnviandoId] = useState(null);

  async function entrar(e) {
    e.preventDefault();
    setErro(""); setOk(""); setCarregando(true);
    try {
      setDados(await chamar(token, "/reacoes/consultar", { cpf, matricula }));
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }

  function ajustar(id, campo, valor) {
    setRascunho((r) => ({ ...r, [id]: { ...(r[id] || {}), [campo]: valor } }));
  }

  async function enviar(modulo) {
    const r = rascunho[modulo.id] || {};
    const nota = r.nota ?? modulo.nota;
    if (!nota) { setErro("Escolha uma nota de 1 a 5 antes de enviar."); return; }
    setErro(""); setOk(""); setEnviandoId(modulo.id);
    try {
      const resp = await chamar(token, "/reacoes", { cpf, matricula, modulo_id: modulo.id, nota, comentario: r.comentario || "" });
      setOk(resp.mensagem || "Avaliação registrada.");
      setDados((d) => ({ ...d, modulos: d.modulos.map((m) => (m.id === modulo.id ? { ...m, nota } : m)) }));
    } catch (err) { setErro(err.message); }
    finally { setEnviandoId(null); }
  }

  return (
    <div style={fundo}>
      <div style={coluna}>
        <header style={topo}>
          <img src={LOGO} alt="Portal T&D" style={logo} />
          <span style={topoTexto}>Portal T&D · Metodologia e Desenvolvimento</span>
        </header>

        <div style={hero}>
          <p style={eyebrow}>Oficina de Talentos</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>{dados ? dados.turma : "Avalie os módulos que você participou"}</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.95 }}>
            Leva menos de um minuto por módulo. Sua avaliação é anônima para a equipe: ela vê só as médias e os comentários, sem o seu nome.
          </p>
        </div>

        {erro ? <div role="alert" style={alertaErro}>{erro}</div> : null}
        {ok ? <div role="status" style={alertaOk}>{ok}</div> : null}

        {!dados ? (
          <form onSubmit={entrar} style={cartao}>
            <p style={dica}>Para começar, informe os mesmos dados da sua inscrição.</p>
            <div style={grade}>
              <label style={rotulo}>CPF
                <input style={entrada} inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" required />
              </label>
              <label style={rotulo}>Matrícula
                <input style={entrada} autoComplete="off" value={matricula} onChange={(e) => setMatricula(e.target.value)} required />
              </label>
            </div>
            <button type="submit" style={botao} disabled={carregando}>{carregando ? "Conferindo…" : "Continuar"}</button>
          </form>
        ) : (
          <>
            <div style={cartao}>
              <p style={{ margin: 0, fontSize: 15 }}>Olá, <strong>{dados.participante}</strong>! {dados.modulos.length ? "Escolha uma nota para cada módulo e, se quiser, deixe um comentário." : "Ainda não há módulos com presença registrada para você avaliar. Volte depois do próximo encontro."}</p>
            </div>
            {dados.modulos.map((m) => {
              const r = rascunho[m.id] || {};
              const nota = r.nota ?? m.nota;
              return (
                <div key={m.id} style={cartao}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{m.titulo}</strong>
                    {m.data ? <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{formatDateBR(m.data)}</span> : null}
                  </div>
                  <div role="radiogroup" aria-label={`Nota para ${m.titulo}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                    {NOTAS.map((o) => (
                      <button key={o.n} type="button" role="radio" aria-checked={nota === o.n} onClick={() => ajustar(m.id, "nota", o.n)}
                        style={{ ...notaBtn, background: nota === o.n ? colors.navy : "#fff", color: nota === o.n ? "#fff" : colors.textPrimary, borderColor: nota === o.n ? colors.navy : colors.border }}>
                        <strong style={{ fontSize: 16 }}>{o.n}</strong>
                        <span style={{ fontSize: 11 }}>{o.rotulo}</span>
                      </button>
                    ))}
                  </div>
                  <textarea style={{ ...entrada, minHeight: 64 }} maxLength={500} placeholder="Comentário (opcional): o que funcionou e o que pode melhorar?" value={r.comentario ?? ""} onChange={(e) => ajustar(m.id, "comentario", e.target.value)} />
                  <button type="button" style={{ ...botao, marginTop: 12 }} disabled={enviandoId === m.id} onClick={() => enviar(m)}>
                    {enviandoId === m.id ? "Enviando…" : m.nota ? "Atualizar avaliação" : "Enviar avaliação"}
                  </button>
                </div>
              );
            })}
          </>
        )}
        <p style={rodape}>Portal T&D — Metodologia e Desenvolvimento</p>
      </div>
    </div>
  );
}

const fundo = { minHeight: "100vh", padding: "24px 16px 48px" };
const coluna = { maxWidth: 680, margin: "0 auto", display: "grid", gap: 16 };
const topo = { display: "flex", alignItems: "center", gap: 12 };
const logo = { height: 44, width: "auto", borderRadius: radius.sm };
const topoTexto = { fontSize: 13, fontWeight: 700, color: colors.textSecondary };
const hero = { background: brandGradientDark, color: "#fff", borderRadius: radius.lg, padding: "22px 24px" };
const eyebrow = { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 };
const cartao = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 20, boxShadow: "0 8px 22px rgba(15,23,42,.05)" };
const dica = { fontSize: 13, color: colors.textSecondary, margin: "0 0 14px" };
const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const rotulo = { display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: colors.textSecondary };
const entrada = { width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: "11px 12px", fontSize: 15, background: "#fff", color: colors.textPrimary, fontFamily: "inherit" };
const botao = { background: colors.accent, color: "#fff", border: 0, borderRadius: radius.sm, padding: "12px 20px", fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 16 };
const notaBtn = { display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 74, padding: "9px 10px", border: "1px solid", borderRadius: radius.sm, cursor: "pointer", fontFamily: "inherit" };
const alertaErro = { background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "11px 14px", fontSize: 14, fontWeight: 700 };
const alertaOk = { background: colors.successLight, color: colors.successText, borderRadius: radius.sm, padding: "11px 14px", fontSize: 14, fontWeight: 700 };
const rodape = { textAlign: "center", fontSize: 12, color: colors.textMuted, marginTop: 8 };
