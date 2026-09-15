"use client";

/**
 * app/reembolso-transporte/page.js — Pacote Salas/Assistente/CPF/Horas/
 * Farol MPT (15/09/2026)
 *
 * Presença Nominal / Reembolso de Transporte (decisões 14-16, 19):
 * seleciona uma turma classificada como "Avaliação Técnica" (subtipo, ver
 * treinamentos/page.js) e mostra nome completo + CPF + dias em treinamento
 * de cada participante, com exportação em Excel. Restrito a Coordenador,
 * Assistente de Treinamento e Super Admin (mesmos perfis que podem ver
 * CPF) — ver backend/src/controllers/reembolsoTransporteController.js.
 *
 * A Assistente enxerga turma de qualquer cliente/tenant aqui (acesso
 * cross-tenant decidido no controller, nunca no clientMiddleware — ver
 * lib/tenantScope.js). Toda visualização e exportação fica registrada em
 * auditoria (decisão 19), automaticamente pelo backend.
 *
 * Nota: esta página ainda não está no menu do PortalShell — mesma decisão
 * pendente das outras telas novas deste pacote (Ramon pediu pra deixar
 * pro final). Funciona por URL direta.
 */

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import { apiFetch, apiDownload, getStoredUser, hasSomeRole } from "../../services/api";
import { colors } from "../../lib/theme";

function formatDate(value) {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
}

function formatCpf(cpf) {
  if (!cpf) return "—";
  const digits = String(cpf).replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function ReembolsoTransportePage() {
  const [usuario, setUsuario] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");

  const temAcesso = hasSomeRole(usuario, ["coordenador", "assistente_treinamento"]);

  useEffect(() => {
    setUsuario(getStoredUser());
  }, []);

  useEffect(() => {
    async function carregarTurmas() {
      try {
        setLoadingTurmas(true);
        setError("");
        const data = await apiFetch("/reembolso-transporte/turmas");
        setTurmas(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Não foi possível carregar as turmas de Avaliação Técnica.");
      } finally {
        setLoadingTurmas(false);
      }
    }
    carregarTurmas();
  }, []);

  useEffect(() => {
    if (!turmaId) { setDetalhe(null); return; }
    let cancelado = false;
    async function carregarDetalhe() {
      try {
        setLoadingDetalhe(true);
        setError("");
        const data = await apiFetch(`/reembolso-transporte/${turmaId}`);
        if (!cancelado) setDetalhe(data);
      } catch (err) {
        if (!cancelado) setError(err.message || "Não foi possível carregar a lista nominal.");
      } finally {
        if (!cancelado) setLoadingDetalhe(false);
      }
    }
    carregarDetalhe();
    return () => { cancelado = true; };
  }, [turmaId]);

  const turmasOrdenadas = useMemo(
    () => [...turmas].sort((a, b) => String(b.data_inicio || b.data || "").localeCompare(String(a.data_inicio || a.data || ""))),
    [turmas]
  );

  async function exportar() {
    if (!turmaId) return;
    try {
      setExportando(true);
      setError("");
      await apiDownload(`/reembolso-transporte/${turmaId}/exportar`, `reembolso-transporte-turma-${turmaId}.xlsx`);
    } catch (err) {
      setError(err.message || "Não foi possível exportar a lista.");
    } finally {
      setExportando(false);
    }
  }

  if (usuario && !temAcesso) {
    return (
      <PortalShell>
        <main style={page}>
          <div style={alertError}>Esta tela é restrita a Coordenador, Super Admin e Assistente de Treinamento (mesmos perfis com acesso a CPF).</div>
        </main>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <main style={page}>
        <PageHero
          eyebrow="Portal T&D · Conformidade"
          title="Presença Nominal / Reembolso de Transporte"
          subtitle="Lista nominal com CPF e dias em treinamento, para turmas classificadas como Avaliação Técnica."
        />

        {error && <div style={alertError}>{error}</div>}

        <section style={card}>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Turma (Avaliação Técnica)</span>
            <select
              style={inputStyle}
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
              disabled={loadingTurmas}
            >
              <option value="">{loadingTurmas ? "Carregando turmas..." : "Selecione a turma"}</option>
              {turmasOrdenadas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tema} — {t.cliente} ({formatDate(t.data_inicio || t.data)})
                </option>
              ))}
            </select>
          </label>

          {!loadingTurmas && turmasOrdenadas.length === 0 && (
            <p style={emptyHint}>Nenhuma turma está classificada como "Avaliação Técnica" ainda. Defina a subdivisão no cadastro da turma (tela Treinamentos) para ela aparecer aqui.</p>
          )}
        </section>

        {turmaId && (
          <section style={{ ...card, marginTop: 16 }}>
            {loadingDetalhe ? (
              <div style={emptyHint}>Carregando lista nominal...</div>
            ) : detalhe ? (
              <>
                <div style={detalheHeader}>
                  <div>
                    <strong style={{ fontSize: 15, color: "#0f172a" }}>{detalhe.turma?.tema}</strong>
                    <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{detalhe.turma?.cliente}</span>
                  </div>
                  <button type="button" style={exportButton} onClick={exportar} disabled={exportando || !detalhe.itens?.length}>
                    {exportando ? "Exportando..." : "Exportar Excel"}
                  </button>
                </div>

                {!detalhe.itens?.length ? (
                  <p style={emptyHint}>Esta turma ainda não tem participantes cadastrados.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Nome completo</th>
                          <th style={th}>CPF</th>
                          <th style={th}>Matrícula</th>
                          <th style={th}>Dias em treinamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.itens.map((item, index) => (
                          <tr key={index}>
                            <td style={td}>{item.nome}</td>
                            <td style={td}>{formatCpf(item.cpf)}</td>
                            <td style={td}>{item.matricula || "—"}</td>
                            <td style={td}>{item.dias_em_treinamento}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>
        )}
      </main>
    </PortalShell>
  );
}

const page = { minHeight: "100vh", padding: "28px clamp(18px, 3vw, 42px) 48px", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, marginTop: 16 };
const fieldWrap = { display: "grid", gap: 6, maxWidth: 460 };
const fieldLabel = { fontSize: 11, fontWeight: 800, color: "#334155" };
const inputStyle = { width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 10, background: "#f8fafc", color: "#0f172a", padding: "0 11px", outline: "none", fontSize: 12.5 };
const emptyHint = { marginTop: 12, fontSize: 12, color: "#64748b" };
const detalheHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 };
const exportButton = { border: 0, background: colors.accent, color: "#fff", borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", color: "#0f172a" };
const alertError = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
