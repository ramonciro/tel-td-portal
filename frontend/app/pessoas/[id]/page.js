"use client";

/**
 * app/pessoas/[id]/page.js — Perfil da Pessoa / visão 360º (28/09/2026)
 *
 * Ver claude/proposta-perfil-pessoa-360-2026-09-28.md no projeto Portal T&D.
 * Depois de fechar a Fase 3 do Cadastro Único (backfill de pessoa_id
 * aplicado em produção), Ramon pediu uma tela real, não um relatório, que
 * reúna num lugar só o que hoje está espalhado em até seis cadastros:
 * turmas de treinamento, jornada de desenvolvimento, coaching individual,
 * perfil comportamental (Metodologia), conta de acesso e dados bancários.
 *
 * Consome GET /api/pessoas/:id (pessoasController.js). CPF sempre vem
 * mascarado do backend pra quem não tem perfil autorizado — a tela nunca
 * decide isso sozinha, só exibe o que a API manda. O mesmo vale para dados
 * bancários: se a API não incluir esse bloco na resposta, a seção
 * simplesmente não aparece (em vez de aparecer vazia ou com placeholder).
 *
 * Entrada: link "Ver perfil completo" a partir de Turmas → Participantes,
 * Tripulação, Mapa de Desenvolvimento → Jornada e Gestão de Usuários — cada
 * uma dessas telas recebe esse link separadamente; esta página só cobre o
 * destino.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors, estiloBadgeStatus } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";

function formatDate(v) {
  return v ? formatDateBR(v) : "—";
}

function selosIdentidade(status) {
  if (status === "confirmada") {
    return { label: "Identidade confirmada (CPF)", background: colors.successLight, color: colors.successText };
  }
  return { label: "Identidade provisória (matrícula/nome)", background: colors.warningLight, color: colors.warningText };
}

function statusJornadaLabel(v) {
  return {
    nao_iniciado: "Não iniciado",
    em_percurso: "Em percurso",
    concluido: "Concluído",
    em_sustentacao: "Em sustentação",
  }[String(v || "")] || (v || "—");
}

function farolCoaching({ status, cadenciaDias, ultimoEncontro }) {
  if (String(status).toLowerCase() !== "ativo") {
    return { label: "Encerrado", background: colors.neutralLight, color: colors.neutral };
  }
  if (!ultimoEncontro) {
    return { label: "Sem encontro registrado", background: colors.dangerLight, color: colors.dangerText };
  }
  const dias = Math.floor((Date.now() - new Date(ultimoEncontro).getTime()) / 86400000);
  if (dias > Number(cadenciaDias || 30)) {
    return { label: `Atrasado (${dias}d desde o último encontro)`, background: colors.dangerLight, color: colors.dangerText };
  }
  return { label: "Em dia", background: colors.successLight, color: colors.successText };
}

export default function PerfilPessoaPage() {
  const params = useParams();
  const id = params?.id;

  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    async function carregar() {
      try {
        setLoading(true);
        setErro("");
        const resposta = await apiFetch(`/pessoas/${id}`);
        if (!cancelado) setDados(resposta || null);
      } catch (err) {
        if (!cancelado) setErro(err.message || "Não foi possível carregar o perfil desta pessoa.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, [id]);

  if (loading) {
    return (
      <PortalShell>
        <main style={page}>
          <p style={emptyHint}>Carregando perfil...</p>
        </main>
      </PortalShell>
    );
  }

  if (erro || !dados?.pessoa) {
    return (
      <PortalShell>
        <main style={page}>
          <div style={alertError}>{erro || "Pessoa não encontrada."}</div>
        </main>
      </PortalShell>
    );
  }

  const { pessoa, turmas = [], jornadas = [], coaching = [], metodologia, usuario, dados_bancarios: dadosBancarios } = dados;
  const selo = selosIdentidade(pessoa.status_identidade);

  return (
    <PortalShell>
      <main style={page}>
        <PageHero
          eyebrow="Portal T&D · Cadastro único"
          title={pessoa.nome}
          subtitle={`${pessoa.cliente || "Sem cliente vinculado"} · Matrícula ${pessoa.matricula || "—"}`}
        />

        <section style={card}>
          <div style={identidadeHeader}>
            <div>
              <span style={fieldLabel}>CPF</span>
              <p style={fieldValue}>{pessoa.cpf || "Não informado"}</p>
            </div>
            <div>
              <span style={fieldLabel}>Matrícula</span>
              <p style={fieldValue}>{pessoa.matricula || "—"}</p>
            </div>
            <div>
              <span style={fieldLabel}>Cliente/operação</span>
              <p style={fieldValue}>{pessoa.cliente || "—"}</p>
            </div>
            <div>
              <span style={fieldLabel}>Cadastro único desde</span>
              <p style={fieldValue}>{formatDate(pessoa.criada_em)}</p>
            </div>
          </div>
          <span style={{ ...badge, background: selo.background, color: selo.color, marginTop: 14 }}>{selo.label}</span>
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={sectionTitle}>Turmas de treinamento ({turmas.length})</h2>
          {!turmas.length ? (
            <p style={emptyHint}>Nenhuma turma de treinamento registrada para esta pessoa.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Turma</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Instrutor</th>
                    <th style={th}>Data</th>
                    <th style={th}>Status</th>
                    <th style={th}>Presença</th>
                  </tr>
                </thead>
                <tbody>
                  {turmas.map((t) => {
                    const estiloStatus = estiloBadgeStatus(t.status_turma);
                    return (
                      <tr key={t.treinamento_id}>
                        <td style={td}>{t.tema}</td>
                        <td style={td}>{t.cliente || "—"}</td>
                        <td style={td}>{t.instrutor || "—"}</td>
                        <td style={td}>{formatDate(t.data_inicio || t.data)}</td>
                        <td style={td}><span style={{ ...badge, ...estiloStatus }}>{t.status_turma || "—"}</span></td>
                        <td style={td}>{t.status_presenca || "pendente"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={sectionTitle}>Jornada de desenvolvimento ({jornadas.length})</h2>
          {!jornadas.length ? (
            <p style={emptyHint}>Nenhuma jornada de desenvolvimento coletiva registrada para esta pessoa.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Jornada</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Cargo</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadas.map((j) => (
                    <tr key={j.participante_id}>
                      <td style={td}>{j.jornada_nome}</td>
                      <td style={td}>{j.cliente || "—"}</td>
                      <td style={td}>{j.cargo || "—"}</td>
                      <td style={td}>{statusJornadaLabel(j.status_jornada)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={sectionTitle}>Coaching individual ({coaching.length})</h2>
          {!coaching.length ? (
            <p style={emptyHint}>Nenhum coaching individual registrado para esta pessoa.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {coaching.map((c) => {
                const farol = farolCoaching({ status: c.status, cadenciaDias: c.cadencia_dias, ultimoEncontro: c.ultimo_encontro });
                return (
                  <div key={c.id} style={coachingCard}>
                    <div>
                      <strong style={{ fontSize: 13, color: "#0f172a" }}>{c.cargo || "Coaching individual"}</strong>
                      <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>
                        Início {formatDate(c.data_inicio)} · Cadência a cada {c.cadencia_dias} dias · Último encontro {formatDate(c.ultimo_encontro)}
                      </span>
                    </div>
                    <span style={{ ...badge, background: farol.background, color: farol.color }}>{farol.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={sectionTitle}>Perfil comportamental</h2>
          {!metodologia ? (
            <p style={emptyHint}>Nenhum perfil comportamental registrado para esta pessoa.</p>
          ) : (
            <div style={identidadeHeader}>
              <div>
                <span style={fieldLabel}>Perfil (animal)</span>
                <p style={fieldValue}>{metodologia.perfil_animal || "—"}{metodologia.perfil_animal_secundario ? ` / ${metodologia.perfil_animal_secundario}` : ""}</p>
              </div>
              <div>
                <span style={fieldLabel}>DISC — letra dominante</span>
                <p style={fieldValue}>{metodologia.disc_letra_dominante || "—"}</p>
              </div>
              <div>
                <span style={fieldLabel}>Origem</span>
                <p style={fieldValue}>{metodologia.origem === "manual" ? "Cadastro manual" : metodologia.origem}</p>
              </div>
              <div>
                <span style={fieldLabel}>Atualizado em</span>
                <p style={fieldValue}>{formatDate(metodologia.updated_at)}</p>
              </div>
            </div>
          )}
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={sectionTitle}>Conta de acesso ao Portal</h2>
          {!usuario ? (
            <p style={emptyHint}>Esta pessoa ainda não tem login no Portal.</p>
          ) : (
            <div style={identidadeHeader}>
              <div>
                <span style={fieldLabel}>E-mail</span>
                <p style={fieldValue}>{usuario.email}</p>
              </div>
              <div>
                <span style={fieldLabel}>Perfil de acesso</span>
                <p style={fieldValue}>{usuario.perfil}</p>
              </div>
              <div>
                <span style={fieldLabel}>Situação</span>
                <p style={fieldValue}>{usuario.ativo ? "Ativo" : "Inativo"}</p>
              </div>
            </div>
          )}
        </section>

        {dadosBancarios && (
          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={sectionTitle}>Dados bancários / PIX</h2>
            <div style={identidadeHeader}>
              <div>
                <span style={fieldLabel}>Banco</span>
                <p style={fieldValue}>{dadosBancarios.banco || "—"}</p>
              </div>
              <div>
                <span style={fieldLabel}>Agência / Conta</span>
                <p style={fieldValue}>{dadosBancarios.agencia || "—"} / {dadosBancarios.conta || "—"}{dadosBancarios.dv ? `-${dadosBancarios.dv}` : ""}</p>
              </div>
              <div>
                <span style={fieldLabel}>Chave PIX</span>
                <p style={fieldValue}>{dadosBancarios.chave_pix ? `${dadosBancarios.tipo_chave_pix || ""} · ${dadosBancarios.chave_pix}` : "—"}</p>
              </div>
              <div>
                <span style={fieldLabel}>Atualizado em</span>
                <p style={fieldValue}>{formatDate(dadosBancarios.atualizado_em)}</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </PortalShell>
  );
}

const page = { minHeight: "100vh", padding: "28px clamp(18px, 3vw, 42px) 48px", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20 };
const identidadeHeader = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 };
const fieldLabel = { fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const fieldValue = { margin: "4px 0 0", fontSize: 13.5, fontWeight: 700, color: "#0f172a" };
const sectionTitle = { fontSize: 14, fontWeight: 800, color: "#0f172a", margin: "0 0 12px" };
const emptyHint = { fontSize: 12.5, color: "#64748b" };
const badge = { display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", color: "#0f172a" };
const coachingCard = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb" };
const alertError = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
