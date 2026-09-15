"use client";

/**
 * app/reembolso-transporte/page.js — Pacote Salas/Assistente/CPF/Horas/
 * Farol MPT (15/09/2026) + planilha no modelo do financeiro (15/09/2026,
 * tarde — ver reembolsoTransporteController.js pro raciocínio completo)
 *
 * Presença Nominal / Reembolso de Transporte (decisões 14-16, 19):
 * seleciona uma turma classificada como "Avaliação Técnica" (subtipo, ver
 * treinamentos/page.js) e mostra nome completo + CPF + dias em treinamento
 * de cada participante, com exportação em Excel no modelo real de
 * solicitação de VT. Restrito a Coordenador, Assistente de Treinamento e
 * Super Admin (mesmos perfis que podem ver CPF) — ver
 * backend/src/controllers/reembolsoTransporteController.js.
 *
 * A Assistente enxerga turma de qualquer cliente/tenant aqui (acesso
 * cross-tenant decidido no controller, nunca no clientMiddleware — ver
 * lib/tenantScope.js). Toda visualização e exportação fica registrada em
 * auditoria (decisão 19), automaticamente pelo backend.
 *
 * Dados bancários/PIX: cadastrados aqui mesmo, por CPF, e reaproveitados em
 * qualquer outra turma da mesma pessoa (não é dado da turma, é da pessoa —
 * ver dados_bancarios_colaborador no backend). "Salvar dados bancários" e
 * "Exportar Excel" são ações separadas de propósito: dá pra corrigir um
 * dado bancário sem precisar re-exportar, e vice-versa.
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

const CAMPOS_BANCARIOS = ["banco", "agencia", "operacao", "conta", "dv", "tipo_chave_pix", "chave_pix"];

export default function ReembolsoTransportePage() {
  const [usuario, setUsuario] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [linhas, setLinhas] = useState([]); // cópia editável dos itens (dados bancários)
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [salvandoBancarios, setSalvandoBancarios] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [valorPassagem, setValorPassagem] = useState("");
  const [motivo, setMotivo] = useState("");
  const [responsavel, setResponsavel] = useState("");

  const temAcesso = hasSomeRole(usuario, ["coordenador", "assistente_treinamento"]);

  useEffect(() => {
    const u = getStoredUser();
    setUsuario(u);
    setResponsavel(u?.nome || "");
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

  async function carregarDetalhe(periodo = {}) {
    if (!turmaId) return;
    try {
      setLoadingDetalhe(true);
      setError("");
      const params = new URLSearchParams();
      if (periodo.inicio) params.set("inicio", periodo.inicio);
      if (periodo.fim) params.set("fim", periodo.fim);
      const qs = params.toString();
      const data = await apiFetch(`/reembolso-transporte/${turmaId}${qs ? `?${qs}` : ""}`);
      setDetalhe(data);
      setLinhas((data.itens || []).map((item) => ({ ...item })));
      setValorPassagem(data.valor_passagem_padrao != null ? String(data.valor_passagem_padrao) : "5.9");
      setMotivo((prev) => prev || `${data.turma?.tema || ""}${data.turma?.cliente ? ` — ${data.turma.cliente}` : ""}`.toUpperCase());
    } catch (err) {
      setError(err.message || "Não foi possível carregar a lista nominal.");
    } finally {
      setLoadingDetalhe(false);
    }
  }

  useEffect(() => {
    if (!turmaId) { setDetalhe(null); setLinhas([]); setPeriodoInicio(""); setPeriodoFim(""); setMotivo(""); return; }
    carregarDetalhe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmaId]);

  const turmasOrdenadas = useMemo(
    () => [...turmas].sort((a, b) => String(b.data_inicio || b.data || "").localeCompare(String(a.data_inicio || a.data || ""))),
    [turmas]
  );

  function atualizarCampo(index, campo, valor) {
    setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, [campo]: valor } : linha)));
  }

  function aplicarPeriodo() {
    setAviso("");
    carregarDetalhe({ inicio: periodoInicio, fim: periodoFim });
  }

  function limparPeriodo() {
    setPeriodoInicio("");
    setPeriodoFim("");
    carregarDetalhe({});
  }

  async function salvarDadosBancarios() {
    if (!turmaId) return;
    try {
      setSalvandoBancarios(true);
      setError("");
      setAviso("");
      const itens = linhas
        .filter((l) => l.cpf)
        .map((l) => ({ cpf: l.cpf, nome: l.nome, ...Object.fromEntries(CAMPOS_BANCARIOS.map((c) => [c, l[c] || ""])) }));
      const resp = await apiFetch(`/reembolso-transporte/${turmaId}/dados-bancarios`, {
        method: "PUT",
        body: JSON.stringify({ itens }),
      });
      setAviso(`Dados bancários salvos (${resp.salvos} participante(s)). Ficam valendo pra qualquer outra turma da mesma pessoa.`);
    } catch (err) {
      setError(err.message || "Não foi possível salvar os dados bancários.");
    } finally {
      setSalvandoBancarios(false);
    }
  }

  async function exportar() {
    if (!turmaId) return;
    try {
      setExportando(true);
      setError("");
      const params = new URLSearchParams();
      if (periodoInicio) params.set("inicio", periodoInicio);
      if (periodoFim) params.set("fim", periodoFim);
      if (valorPassagem) params.set("valor_passagem", valorPassagem);
      if (motivo) params.set("motivo", motivo);
      if (responsavel) params.set("responsavel", responsavel);
      await apiDownload(`/reembolso-transporte/${turmaId}/exportar?${params.toString()}`, `solicitacao-vt-turma-${turmaId}.xlsx`);
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
          subtitle="Solicitação de Vale Transporte no modelo do financeiro, com CPF, dados bancários/PIX e dias em treinamento."
        />

        {error && <div style={alertError}>{error}</div>}
        {aviso && <div style={alertOk}>{aviso}</div>}

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
                </div>

                <div style={paramsGrid}>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Período da requisição — início</span>
                    <input type="date" style={inputStyle} value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                  </label>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Período da requisição — fim</span>
                    <input type="date" style={inputStyle} value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <button type="button" style={secondaryButton} onClick={aplicarPeriodo}>Aplicar recorte</button>
                    <button type="button" style={linkButton} onClick={limparPeriodo}>Usar turma inteira</button>
                  </div>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Valor da passagem (ida) — R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      style={inputStyle}
                      value={valorPassagem}
                      onChange={(e) => setValorPassagem(e.target.value)}
                    />
                  </label>
                  <label style={{ ...fieldWrap, gridColumn: "span 2" }}>
                    <span style={fieldLabel}>Motivo do treinamento</span>
                    <input type="text" style={inputStyle} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </label>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Responsável pelo preenchimento</span>
                    <input type="text" style={inputStyle} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
                  </label>
                </div>
                <p style={emptyHint}>
                  Sem período informado, a exportação conta a presença da turma inteira. O valor da passagem informado aqui fica salvo como padrão dessa turma pras próximas exportações (o total do dia é sempre 2x esse valor — ida e volta).
                </p>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4, marginBottom: 12 }}>
                  <button type="button" style={secondaryButton} onClick={salvarDadosBancarios} disabled={salvandoBancarios || !linhas.length}>
                    {salvandoBancarios ? "Salvando..." : "Salvar dados bancários"}
                  </button>
                  <button type="button" style={exportButton} onClick={exportar} disabled={exportando || !linhas.length}>
                    {exportando ? "Exportando..." : "Exportar Excel"}
                  </button>
                </div>

                {!linhas.length ? (
                  <p style={emptyHint}>Esta turma ainda não tem participantes cadastrados{periodoInicio || periodoFim ? " neste período" : ""}.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Nome completo</th>
                          <th style={th}>CPF</th>
                          <th style={th}>Dias</th>
                          <th style={th}>Banco</th>
                          <th style={th}>Agência</th>
                          <th style={th}>OP</th>
                          <th style={th}>Conta</th>
                          <th style={th}>DV</th>
                          <th style={th}>Tipo de Chave</th>
                          <th style={th}>Chave PIX</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((item, index) => (
                          <tr key={`${item.cpf || item.nome}-${index}`}>
                            <td style={td}>{item.nome}</td>
                            <td style={td}>{formatCpf(item.cpf)}</td>
                            <td style={td}>{item.dias_em_treinamento}</td>
                            <td style={tdInput}><input style={cellInput} value={item.banco || ""} onChange={(e) => atualizarCampo(index, "banco", e.target.value)} placeholder="ex.: NUBANK" /></td>
                            <td style={tdInput}><input style={cellInput} value={item.agencia || ""} onChange={(e) => atualizarCampo(index, "agencia", e.target.value)} /></td>
                            <td style={tdInput}><input style={cellInput} value={item.operacao || ""} onChange={(e) => atualizarCampo(index, "operacao", e.target.value)} /></td>
                            <td style={tdInput}><input style={cellInput} value={item.conta || ""} onChange={(e) => atualizarCampo(index, "conta", e.target.value)} /></td>
                            <td style={tdInput}><input style={cellInput} value={item.dv || ""} onChange={(e) => atualizarCampo(index, "dv", e.target.value)} /></td>
                            <td style={tdInput}>
                              <select style={cellInput} value={item.tipo_chave_pix || ""} onChange={(e) => atualizarCampo(index, "tipo_chave_pix", e.target.value)}>
                                <option value="">—</option>
                                <option value="CPF">CPF</option>
                                <option value="Celular">Celular</option>
                                <option value="E-mail">E-mail</option>
                                <option value="Aleatória">Aleatória</option>
                              </select>
                            </td>
                            <td style={tdInput}><input style={cellInput} value={item.chave_pix || ""} onChange={(e) => atualizarCampo(index, "chave_pix", e.target.value)} /></td>
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

const page = { minHeight: "100vh", padding: "28px clamp(18px, 3vw, 42px) 48px", maxWidth: 1300, margin: "0 auto", boxSizing: "border-box" };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, marginTop: 16 };
const fieldWrap = { display: "grid", gap: 6 };
const fieldLabel = { fontSize: 11, fontWeight: 800, color: "#334155" };
const inputStyle = { width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 10, background: "#f8fafc", color: "#0f172a", padding: "0 11px", outline: "none", fontSize: 12.5 };
const emptyHint = { marginTop: 12, fontSize: 12, color: "#64748b" };
const detalheHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 };
const paramsGrid = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 4 };
const exportButton = { border: 0, background: colors.accent, color: "#fff", borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButton = { border: "1px solid #dbe2ea", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const linkButton = { border: 0, background: "transparent", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "underline" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" };
const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", color: "#0f172a", whiteSpace: "nowrap" };
const tdInput = { padding: "5px 6px", borderBottom: "1px solid #f1f5f9" };
const cellInput = { width: "100%", minWidth: 90, height: 32, boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", padding: "0 8px", outline: "none", fontSize: 12 };
const alertError = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
const alertOk = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 12, fontWeight: 700 };
