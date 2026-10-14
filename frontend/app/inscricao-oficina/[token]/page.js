"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import API_URL from "../../../services/api";
import { colors, radius, brandGradientDark } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";

// Página PÚBLICA de inscrição da Oficina de Talentos (13/10/2026) — sem login
// e fora do PortalShell, com a logo do Portal T&D (decisão do Ramon: o portal
// substitui o Doity e a Oficina passa a usar a identidade do Portal).
// Fala só com /api/public/oficina/:token. O token da turma define a empresa,
// então esta página não precisa saber nada sobre ambiente/login.

const LOGO = "/logo-td.png";
const fmtH = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const MODALIDADE = { presencial: "Presencial", online: "Online", hibrido: "Híbrido" };

function mascaraCpf(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const FORM_VAZIO = {
  nome: "",
  email: "",
  cpf: "",
  matricula: "",
  escolaridade: "",
  horario_trabalho: "",
  cargo_atual: "",
  cargo_atual_outro: "",
  cargo_almejado: "",
  cargo_almejado_outro: "",
  website: "", // honeypot — fica escondido; humano nunca preenche
  aceite: false,
};

export default function InscricaoOficinaPage() {
  const params = useParams();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;

  const [turma, setTurma] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    fetch(`${API_URL}/public/oficina/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelado) setNaoEncontrada(true);
          return null;
        }
        if (!r.ok) throw new Error("falha");
        return r.json();
      })
      .then((dados) => {
        if (!cancelado && dados) setTurma(dados);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar a página agora. Tente novamente em instantes.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const resp = await fetch(`${API_URL}/public/oficina/${encodeURIComponent(token)}/inscricoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      let dados = {};
      try {
        dados = await resp.json();
      } catch {}
      if (!resp.ok) {
        setErro(dados.error || "Não foi possível enviar sua inscrição.");
        return;
      }
      setResultado(dados);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const periodo = turma
    ? turma.data_inicio && turma.data_fim && turma.data_inicio !== turma.data_fim
      ? `${formatDateBR(turma.data_inicio)} a ${formatDateBR(turma.data_fim)}`
      : turma.data_inicio
      ? formatDateBR(turma.data_inicio)
      : null
    : null;

  return (
    <div style={fundo}>
      <div style={coluna}>
        <header style={topo}>
          <img src={LOGO} alt="Portal T&D" style={logo} />
          <span style={topoTexto}>Portal T&D · Metodologia e Desenvolvimento</span>
        </header>

        {carregando && <div style={cartao}>Carregando…</div>}

        {!carregando && naoEncontrada && (
          <div style={cartao}>
            <h1 style={h1}>Link de inscrição não encontrado</h1>
            <p style={texto}>Confira o endereço recebido ou fale com a equipe de Metodologia e Desenvolvimento.</p>
          </div>
        )}

        {!carregando && !naoEncontrada && !turma && erro && <div style={alertaErro}>{erro}</div>}

        {turma && (
          <>
            <section style={hero}>
              <p style={eyebrow}>Oficina de Talentos</p>
              <h1 style={{ ...h1, color: "#fff", margin: "4px 0 8px" }}>{turma.nome}</h1>
              <div style={heroMeta}>
                {periodo && <span>📅 {periodo}</span>}
                {turma.horario && <span>🕒 {turma.horario}</span>}
                {turma.modalidade && <span>🏷️ {MODALIDADE[turma.modalidade] || turma.modalidade}</span>}
                {turma.carga_horaria_prevista ? <span>⏱️ {fmtH(turma.carga_horaria_prevista)} h</span> : null}
              </div>
              {(turma.local_nome || turma.endereco) && (
                <p style={heroLocal}>
                  📍 {[turma.local_nome, turma.endereco].filter(Boolean).join(" — ")}
                </p>
              )}
            </section>

            {turma.descricao && (
              <section style={cartao}>
                <h2 style={h2}>Sobre a oficina</h2>
                <p style={{ ...texto, whiteSpace: "pre-line" }}>{turma.descricao}</p>
              </section>
            )}

            {turma.modulos?.length > 0 && (
              <section style={cartao}>
                <h2 style={h2}>Programação</h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {turma.modulos.map((m, i) => (
                    <div key={i} style={moduloLinha}>
                      <strong style={{ color: colors.textPrimary }}>{m.titulo}</strong>
                      <span style={moduloDetalhe}>
                        {[
                          m.data ? formatDateBR(m.data) : null,
                          m.hora_inicio && m.hora_fim ? `${m.hora_inicio} às ${m.hora_fim}` : null,
                          m.carga_horaria ? `${fmtH(m.carga_horaria)} h` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resultado ? (
              <section style={{ ...cartao, borderColor: colors.successText }}>
                <h2 style={{ ...h2, color: colors.successText }}>
                  {resultado.situacao === "lista_espera" ? "Você entrou na lista de espera" : "Inscrição recebida"}
                </h2>
                <p style={texto}>{resultado.mensagem}</p>
              </section>
            ) : !turma.inscricoes_abertas ? (
              <section style={cartao}>
                <h2 style={h2}>Inscrições encerradas</h2>
                <p style={texto}>
                  As inscrições para esta turma não estão abertas no momento. Em caso de dúvida, fale com a equipe de
                  Metodologia e Desenvolvimento.
                </p>
              </section>
            ) : (
              <form onSubmit={enviar} style={cartao} noValidate>
                <h2 style={h2}>Ficha de inscrição</h2>

                {turma.lista_espera ? (
                  <div style={avisoEspera}>
                    As vagas estão preenchidas. Você pode se inscrever mesmo assim: sua inscrição entra na{" "}
                    <strong>lista de espera</strong> e a equipe avisa se abrir vaga.
                  </div>
                ) : turma.vagas_restantes !== null ? (
                  <p style={{ ...texto, marginTop: 0 }}>
                    Vagas restantes: <strong>{turma.vagas_restantes}</strong>
                  </p>
                ) : null}

                <p style={dica}>
                  Esta oficina é voltada a colaboradores da empresa. Use o mesmo nome, CPF e matrícula do seu cadastro.
                </p>

                {erro && <div style={alertaErro}>{erro}</div>}

                <div style={grade}>
                  <Campo rotulo="Nome completo *" cheio>
                    <input style={entrada} value={form.nome} onChange={(e) => set("nome", e.target.value)} autoComplete="name" />
                  </Campo>

                  <Campo rotulo="E-mail *" cheio>
                    <input
                      style={entrada}
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      autoComplete="email"
                    />
                  </Campo>

                  <Campo rotulo="CPF *">
                    <input
                      style={entrada}
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={form.cpf}
                      onChange={(e) => set("cpf", mascaraCpf(e.target.value))}
                    />
                  </Campo>

                  <Campo rotulo="Matrícula *">
                    <input
                      style={entrada}
                      inputMode="numeric"
                      value={form.matricula}
                      onChange={(e) => set("matricula", e.target.value.replace(/\s/g, ""))}
                    />
                  </Campo>

                  <Campo rotulo="Escolaridade *" cheio>
                    <select style={entrada} value={form.escolaridade} onChange={(e) => set("escolaridade", e.target.value)}>
                      <option value="">Selecione</option>
                      {turma.escolaridades.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Campo>

                  <Campo rotulo="Horário de trabalho *" cheio>
                    <input
                      style={entrada}
                      placeholder="Ex.: 08h às 14h20"
                      value={form.horario_trabalho}
                      onChange={(e) => set("horario_trabalho", e.target.value)}
                    />
                  </Campo>

                  <Campo rotulo="Cargo atual *">
                    <select style={entrada} value={form.cargo_atual} onChange={(e) => set("cargo_atual", e.target.value)}>
                      <option value="">Selecione</option>
                      {[...turma.cargos_elegiveis, "Outro"].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Campo>

                  {form.cargo_atual === "Outro" && (
                    <Campo rotulo="Qual é o seu cargo? *">
                      <input
                        style={entrada}
                        value={form.cargo_atual_outro}
                        onChange={(e) => set("cargo_atual_outro", e.target.value)}
                      />
                    </Campo>
                  )}

                  <Campo rotulo="Cargo que você almeja *" cheio={form.cargo_almejado !== "Outro"}>
                    <select
                      style={entrada}
                      value={form.cargo_almejado}
                      onChange={(e) => set("cargo_almejado", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {turma.cargos_almejados.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <span style={dicaPequena}>
                      A oficina é aberta a quem quer aprender sobre liderança, inclusive para seguir carreira em outra
                      área.
                    </span>
                  </Campo>

                  {form.cargo_almejado === "Outro" && (
                    <Campo rotulo="Qual cargo? *">
                      <input
                        style={entrada}
                        value={form.cargo_almejado_outro}
                        onChange={(e) => set("cargo_almejado_outro", e.target.value)}
                      />
                    </Campo>
                  )}
                </div>

                {/* Honeypot: invisível para pessoas, robôs costumam preencher. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
                  <label>
                    Não preencha este campo
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(e) => set("website", e.target.value)}
                    />
                  </label>
                </div>

                <label style={aceiteLinha}>
                  <input
                    type="checkbox"
                    checked={form.aceite}
                    onChange={(e) => set("aceite", e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Declaro que as informações são verdadeiras e autorizo a equipe de Metodologia e Desenvolvimento
                    (T&D) a usar meus dados exclusivamente para a gestão da Oficina de Talentos e para o meu histórico
                    de desenvolvimento no Portal T&D.
                  </span>
                </label>

                <button type="submit" style={botao} disabled={enviando}>
                  {enviando ? "Enviando…" : turma.lista_espera ? "Entrar na lista de espera" : "Enviar inscrição"}
                </button>
              </form>
            )}
          </>
        )}

        <footer style={rodape}>Portal T&D</footer>
      </div>
    </div>
  );
}

function Campo({ rotulo, cheio, children }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: cheio ? "1 / -1" : undefined, fontSize: 13, fontWeight: 700, color: colors.textSecondary }}>
      {rotulo}
      {children}
    </label>
  );
}

/* ─── estilos ──────────────────────────────────────────────────────────── */
const fundo = { minHeight: "100vh", padding: "24px 16px 48px" };
const coluna = { maxWidth: 760, margin: "0 auto", display: "grid", gap: 16, position: "relative" };
const topo = { display: "flex", alignItems: "center", gap: 12 };
const logo = { height: 44, width: "auto", borderRadius: radius.sm };
const topoTexto = { fontSize: 13, fontWeight: 700, color: colors.textSecondary };
const hero = { background: brandGradientDark, color: "#fff", borderRadius: radius.lg, padding: "24px 26px" };
const eyebrow = { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 };
const heroMeta = { display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 14, fontWeight: 600 };
const heroLocal = { margin: "10px 0 0", fontSize: 14, opacity: 0.95 };
const cartao = {
  background: colors.surface,
  borderRadius: radius.lg,
  padding: "20px 22px",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 1px 4px rgba(0,0,0,.05)",
  position: "relative",
};
const h1 = { fontSize: 24, fontWeight: 900, margin: "0 0 8px", color: colors.textPrimary };
const h2 = { fontSize: 17, fontWeight: 800, margin: "0 0 12px", color: colors.textPrimary };
const texto = { fontSize: 14, lineHeight: 1.6, color: colors.textSecondary, margin: "0 0 8px" };
const dica = { fontSize: 13, color: colors.textSecondary, margin: "0 0 16px" };
const dicaPequena = { fontSize: 12, fontWeight: 500, color: colors.textMuted };
const moduloLinha = { display: "grid", gap: 2, padding: "10px 12px", background: colors.surfaceMuted, borderRadius: radius.sm, fontSize: 14 };
const moduloDetalhe = { fontSize: 12, color: colors.textSecondary };
const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const entrada = {
  width: "100%",
  padding: "11px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: 15,
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: colors.surface,
  fontWeight: 500,
  color: colors.textPrimary,
};
const aceiteLinha = { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: colors.textSecondary, lineHeight: 1.5, margin: "18px 0" };
const botao = {
  width: "100%",
  padding: "14px 20px",
  background: colors.accent,
  color: "#fff",
  border: "none",
  borderRadius: radius.sm,
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};
const alertaErro = {
  background: colors.dangerLight,
  color: colors.dangerText,
  border: `1px solid ${colors.dangerText}33`,
  borderRadius: radius.sm,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 14,
};
const avisoEspera = {
  background: colors.warningLight,
  color: colors.warningText,
  border: `1px solid ${colors.warningText}33`,
  borderRadius: radius.sm,
  padding: "12px 16px",
  fontSize: 14,
  marginBottom: 14,
};
const rodape = { textAlign: "center", fontSize: 12, color: colors.textMuted, marginTop: 8 };
