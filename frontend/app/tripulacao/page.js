"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius, estiloBadgeClassificacao } from "../../lib/theme";

// Tripulação (20/09/2026, pedido do Ramon) — visão única de todo mundo
// acompanhado pela Metodologia: quem está numa jornada coletiva de cliente,
// quem está em coaching individual, ou nos dois. Os dois vínculos nunca se
// misturam num só número (ver claude/framework-kpis-metodologia-2026-09-20.md)
// — aqui eles só aparecem lado a lado, na mesma linha da mesma pessoa.

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "jornada", label: "Jornada coletiva" },
  { key: "coaching", label: "Coaching individual" },
  { key: "ambos", label: "Ambos" },
];

function farolInfo(coaching) {
  if (!coaching) return null;
  if (coaching.farol === "em_dia") return { label: "Em dia", tone: "ok" };
  if (coaching.farol === "atrasado") return { label: "Atrasado", tone: "critico" };
  if (coaching.farol === "encerrado") return { label: "Encerrado", tone: "neutro" };
  return { label: "Aguardando 1º encontro", tone: "neutro" };
}

function badgeFarol(info) {
  if (!info) return null;
  if (info.tone === "critico") return estiloBadgeClassificacao("Crítico");
  if (info.tone === "ok") return estiloBadgeClassificacao("Saudável");
  return { ...estiloBadgeClassificacao("Atenção"), background: colors.surfaceMuted, color: colors.textSecondary };
}

function buildLinhas(participantes, coachings) {
  const porParticipanteId = new Map();
  const semJornada = [];
  (coachings || []).forEach((c) => {
    if (c.jornada_participante_id) porParticipanteId.set(c.jornada_participante_id, c);
    else semJornada.push(c);
  });

  const linhasJornada = (participantes || []).map((p) => {
    const coaching = porParticipanteId.get(p.id) || null;
    return {
      key: `jp-${p.id}`,
      nome: p.nome,
      cliente: p.cliente || "Sem cliente",
      jornadaParticipanteId: p.id,
      jornadaNome: p.jornada_nome,
      statusJornada: p.status_jornada,
      coaching,
      vinculo: coaching ? "ambos" : "jornada",
    };
  });

  const linhasCoachingSolo = semJornada.map((c) => ({
    key: `ci-${c.id}`,
    nome: c.nome,
    cliente: c.cliente || "Sem cliente",
    jornadaParticipanteId: null,
    jornadaNome: null,
    statusJornada: null,
    coaching: c,
    vinculo: "coaching",
  }));

  return [...linhasJornada, ...linhasCoachingSolo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const formVazio = { nome: "", cliente: "", cargo: "", cadencia_dias: 30, jornada_participante_id: "" };

export default function TripulacaoPage() {
  const [participantes, setParticipantes] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [expandido, setExpandido] = useState(null);
  const [encontros, setEncontros] = useState({});
  const [novaData, setNovaData] = useState({});
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [pResult, cResult] = await Promise.allSettled([
      apiFetch("/jornada-participantes"),
      apiFetch("/coaching-individual"),
    ]);
    if (pResult.status === "fulfilled") setParticipantes(pResult.value);
    if (cResult.status === "fulfilled") setCoachings(cResult.value);
    if (pResult.status === "rejected" && cResult.status === "rejected") {
      setErro("Não foi possível carregar a tripulação.");
    } else {
      setErro("");
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const linhas = useMemo(() => buildLinhas(participantes, coachings), [participantes, coachings]);
  const linhasFiltradas = useMemo(
    () => (filtro === "todos" ? linhas : linhas.filter((l) => l.vinculo === filtro)),
    [linhas, filtro]
  );

  const participantesSemCoaching = useMemo(
    () => linhas.filter((l) => l.vinculo === "jornada"),
    [linhas]
  );

  async function abrirEncontros(coachingId) {
    if (expandido === coachingId) {
      setExpandido(null);
      return;
    }
    setExpandido(coachingId);
    try {
      const lista = await apiFetch(`/coaching-individual/${coachingId}/encontros`);
      setEncontros((prev) => ({ ...prev, [coachingId]: lista }));
    } catch {
      setEncontros((prev) => ({ ...prev, [coachingId]: [] }));
    }
  }

  async function registrarEncontro(coachingId) {
    const data = novaData[coachingId];
    if (!data) return;
    try {
      await apiFetch(`/coaching-individual/${coachingId}/encontros`, {
        method: "POST",
        body: JSON.stringify({ data_encontro: data }),
      });
      setNovaData((prev) => ({ ...prev, [coachingId]: "" }));
      const lista = await apiFetch(`/coaching-individual/${coachingId}/encontros`);
      setEncontros((prev) => ({ ...prev, [coachingId]: lista }));
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível registrar o encontro.");
    }
  }

  function abrirNovoForm(linhaJornada) {
    if (linhaJornada) {
      setForm({
        nome: linhaJornada.nome,
        cliente: linhaJornada.cliente,
        cargo: "",
        cadencia_dias: 30,
        jornada_participante_id: String(linhaJornada.jornadaParticipanteId),
      });
    } else {
      setForm(formVazio);
    }
    setFormAberto(true);
  }

  async function salvarNovoCoaching(e) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/coaching-individual", {
        method: "POST",
        body: JSON.stringify({
          nome: form.nome,
          cliente: form.cliente || null,
          cargo: form.cargo || null,
          cadencia_dias: Number(form.cadencia_dias || 30),
          jornada_participante_id: form.jornada_participante_id || null,
        }),
      });
      setFormAberto(false);
      setForm(formVazio);
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível criar o coaching individual.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PortalShell>
      <PageHero
        eyebrow="Ambiente Metodologia"
        title="Tripulação"
        subtitle="Todas as pessoas acompanhadas — jornada coletiva, coaching individual, ou os dois. Cada vínculo mantém seu próprio farol, sem se misturar num só número."
        stats={[
          { label: "em jornada coletiva", value: participantes.length },
          { label: "em coaching individual", value: coachings.length },
          { label: "exibidas nesta lista", value: linhasFiltradas.length },
        ]}
        actions={
          <button style={botaoPrimario} onClick={() => abrirNovoForm(null)}>
            + Coaching individual
          </button>
        }
      />

      {erro && <div style={avisoErro}>{erro}</div>}

      {formAberto && (
        <SectionCard title="Novo coaching individual" subtitle="Pode ser uma pessoa já em jornada, ou alguém sem jornada nenhuma (ex.: diretoria)">
          <form onSubmit={salvarNovoCoaching} style={formGrid}>
            <label style={campoLabel}>
              Nome
              <input
                style={campoInput}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </label>
            <label style={campoLabel}>
              Cliente
              <input
                style={campoInput}
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              />
            </label>
            <label style={campoLabel}>
              Cargo
              <input
                style={campoInput}
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </label>
            <label style={campoLabel}>
              Cadência combinada (dias)
              <input
                type="number"
                min={1}
                style={campoInput}
                value={form.cadencia_dias}
                onChange={(e) => setForm({ ...form, cadencia_dias: e.target.value })}
              />
            </label>
            <label style={campoLabel}>
              Vincular a alguém já em jornada (opcional)
              <select
                style={campoInput}
                value={form.jornada_participante_id}
                onChange={(e) => setForm({ ...form, jornada_participante_id: e.target.value })}
              >
                <option value="">Sem jornada — só coaching</option>
                {participantesSemCoaching.map((p) => (
                  <option key={p.jornadaParticipanteId} value={p.jornadaParticipanteId}>
                    {p.nome} — {p.cliente}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button type="submit" style={botaoPrimario} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" style={botaoSecundario} onClick={() => setFormAberto(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 0 16px", flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            style={filtro === f.key ? abaAtiva : abaInativa}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SectionCard>
        {carregando ? (
          <p style={vazio}>Carregando…</p>
        ) : !linhasFiltradas.length ? (
          <p style={vazio}>Nenhuma pessoa encontrada para este filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={linhaCabecalho}>
              <span>Pessoa</span>
              <span>Cliente</span>
              <span>Vínculo</span>
              <span>Coaching</span>
              <span></span>
            </div>
            {linhasFiltradas.map((linha) => {
              const farol = farolInfo(linha.coaching);
              const badge = badgeFarol(farol);
              return (
                <div key={linha.key}>
                  <div style={linhaTabela}>
                    <div style={{ fontWeight: 700, color: colors.textPrimary }}>{linha.nome}</div>
                    <div style={{ color: colors.textSecondary, fontSize: 13.5 }}>{linha.cliente}</div>
                    <div>
                      <span style={badgeVinculo(linha.vinculo)}>{vinculoLabel(linha.vinculo)}</span>
                    </div>
                    <div>{farol ? <span style={badge}>{farol.label}</span> : <span style={{ color: colors.textMuted }}>—</span>}</div>
                    <div style={{ textAlign: "right" }}>
                      {linha.coaching ? (
                        <button style={linkBotao} onClick={() => abrirEncontros(linha.coaching.id)}>
                          {expandido === linha.coaching.id ? "Fechar" : "Ver encontros"}
                        </button>
                      ) : (
                        <button style={linkBotao} onClick={() => abrirNovoForm(linha)}>
                          + Coaching
                        </button>
                      )}
                    </div>
                  </div>

                  {linha.coaching && expandido === linha.coaching.id && (
                    <div style={painelExpandido}>
                      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 10 }}>
                        Cadência combinada: {linha.coaching.cadencia_dias} dias
                        {linha.coaching.responsavel_nome ? ` · Coach: ${linha.coaching.responsavel_nome}` : ""}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <input
                          type="date"
                          style={campoInput}
                          value={novaData[linha.coaching.id] || ""}
                          onChange={(e) => setNovaData((prev) => ({ ...prev, [linha.coaching.id]: e.target.value }))}
                        />
                        <button style={botaoSecundario} onClick={() => registrarEncontro(linha.coaching.id)}>
                          Registrar encontro
                        </button>
                      </div>

                      {(encontros[linha.coaching.id] || []).length ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {encontros[linha.coaching.id].map((enc) => (
                            <div key={enc.id} style={{ fontSize: 12.5, color: colors.textSecondary }}>
                              {new Date(enc.data_encontro).toLocaleDateString("pt-BR")}
                              {enc.observacoes ? ` — ${enc.observacoes}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={vazio}>Nenhum encontro registrado ainda.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </PortalShell>
  );
}

function vinculoLabel(vinculo) {
  if (vinculo === "jornada") return "Jornada coletiva";
  if (vinculo === "coaching") return "Coaching individual";
  return "Ambos";
}

function badgeVinculo(vinculo) {
  const base = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: radius.pill,
    fontWeight: 700,
    fontSize: 11,
  };
  if (vinculo === "jornada") return { ...base, background: colors.primaryLight, color: colors.primary };
  if (vinculo === "coaching") return { ...base, background: colors.accentLight, color: colors.accentText };
  return { ...base, background: colors.successLight, color: colors.successText };
}

const linhaCabecalho = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr 1.1fr 1.2fr 0.9fr",
  gap: 12,
  padding: "8px 4px 12px",
  borderBottom: `1.5px solid ${colors.border}`,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: colors.textMuted,
  fontWeight: 700,
};

const linhaTabela = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr 1.1fr 1.2fr 0.9fr",
  gap: 12,
  alignItems: "center",
  padding: "12px 4px",
  borderBottom: `1px solid ${colors.border}`,
};

const painelExpandido = {
  background: colors.surfaceMuted,
  borderRadius: radius.md,
  padding: 14,
  margin: "0 4px 12px",
};

const vazio = {
  fontSize: 13.5,
  color: colors.textMuted,
  margin: 0,
};

const abaAtiva = {
  padding: "9px 16px",
  borderRadius: radius.pill,
  border: "none",
  background: colors.navy,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const abaInativa = {
  ...abaAtiva,
  background: colors.surfaceMuted,
  color: colors.textSecondary,
};

const botaoPrimario = {
  padding: "10px 16px",
  borderRadius: radius.md,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const botaoSecundario = {
  padding: "10px 16px",
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.textPrimary,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const linkBotao = {
  border: "none",
  background: "transparent",
  color: colors.primary,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const campoLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: colors.textSecondary,
};

const campoInput = {
  padding: "9px 12px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  fontSize: 13.5,
};

const avisoErro = {
  marginTop: 16,
  padding: "12px 16px",
  borderRadius: 12,
  background: colors.dangerLight,
  color: colors.dangerText,
  fontSize: 13.5,
};
