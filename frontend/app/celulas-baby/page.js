"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Célula baby (16/10/2026) — lista. O instrutor vê só as células das próprias
// turmas; a coordenação vê todas. A célula abre sozinha quando a turma de
// Avaliação Técnica é concluída (ver backend/src/lib/celulaBaby.js).

const ROTULO_STATUS = { a_configurar: "A configurar", em_andamento: "Em andamento", encerrada: "Encerrada" };
const FAROL = {
  verde: { cor: colors.successText, bg: colors.successLight, texto: "No prazo" },
  amarelo: { cor: colors.warningText, bg: colors.warningLight, texto: "Atenção" },
  vermelho: { cor: colors.dangerText, bg: colors.dangerLight, texto: "Atrasada" },
  neutro: { cor: colors.textSecondary, bg: colors.neutralLight, texto: "—" },
};

const FILTROS = [
  { id: "todas", label: "Todas" },
  { id: "a_configurar", label: "A configurar" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "atrasadas", label: "Atrasadas" },
  { id: "encerrada", label: "Encerradas" },
];

function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

export default function CelulasBabyPage() {
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => {
    let ativo = true;
    apiFetch("/celulas-baby")
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message || "Não foi possível carregar as células."));
    return () => { ativo = false; };
  }, []);

  const lista = useMemo(() => {
    const todas = dados?.celulas || [];
    if (filtro === "todas") return todas;
    if (filtro === "atrasadas") return todas.filter((c) => c.atrasada);
    return todas.filter((c) => c.status === filtro);
  }, [dados, filtro]);

  const cont = dados?.contagem || {};
  const contagemDe = (id) => (id === "todas" ? (dados?.celulas || []).length : id === "atrasadas" ? cont.atrasadas : cont[id]);

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16, padding: "4px 0 40px" }}>
        <PageHero
          eyebrow="Treinamento"
          title="Células baby"
          subtitle="Acompanhamento da curva de aprendizagem dos aprovados na Avaliação Técnica, nos 7 primeiros dias de operação."
          stats={dados ? [
            { label: "A configurar", value: cont.a_configurar ?? 0 },
            { label: "Em andamento", value: cont.em_andamento ?? 0 },
            { label: "Atrasadas", value: cont.atrasadas ?? 0 },
            { label: "Encerradas", value: cont.encerradas ?? 0 },
          ] : undefined}
        />

        {erro && <div style={alerta}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Filtrar células">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              style={{ ...chip, ...(filtro === f.id ? chipAtivo : null) }}
            >
              {f.label}{dados ? ` (${contagemDe(f.id) ?? 0})` : ""}
            </button>
          ))}
        </div>

        {!dados && !erro && <div style={vazio}>Carregando células…</div>}

        {dados && lista.length === 0 && (
          <div style={vazio}>
            {(dados.celulas || []).length === 0
              ? "Nenhuma célula ainda. Quando uma turma de Avaliação Técnica for concluída, a célula aparece aqui sozinha."
              : "Nenhuma célula neste filtro."}
          </div>
        )}

        {dados && lista.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {lista.map((c) => {
              const f = FAROL[c.farol] || FAROL.neutro;
              return (
                <button key={c.id} type="button" onClick={() => router.push(`/celulas-baby/${c.id}`)} style={linha}>
                  <div style={{ flex: "2 1 220px", minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontWeight: 800, color: colors.textPrimary, fontSize: 15 }}>{c.turma_nome}</div>
                    <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
                      {c.cliente || "Sem cliente"} · Instrutor: {c.instrutor || "—"}
                    </div>
                  </div>
                  <div style={col}><span style={rot}>Início na operação</span><strong>{fmtData(c.data_inicio_operacao)}</strong></div>
                  <div style={col}><span style={rot}>Aprovados</span><strong>{c.passaram}/{c.total_pessoas}</strong></div>
                  <div style={col}><span style={rot}>Dias lançados</span><strong>{c.dias_lancados}/7</strong></div>
                  <div style={col}>
                    <span style={rot}>Situação</span>
                    <strong>{ROTULO_STATUS[c.status] || c.status}</strong>
                  </div>
                  <span style={{ ...badge, color: f.cor, background: f.bg }}>
                    {c.status === "a_configurar" && c.sem_resultado > 0 ? `${c.sem_resultado} sem resultado` : f.texto}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "48px 16px", fontSize: 14, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg };
const chip = { padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const chipAtivo = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const linha = {
  display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
  width: "100%", padding: "14px 18px", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg,
  boxShadow: "0 6px 16px rgba(15,23,42,.04)", cursor: "pointer", font: "inherit", color: colors.textPrimary,
};
const col = { flex: "1 1 110px", display: "flex", flexDirection: "column", gap: 2, fontSize: 14, textAlign: "left" };
const rot = { fontSize: 11, color: colors.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" };
const badge = { padding: "6px 12px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" };
