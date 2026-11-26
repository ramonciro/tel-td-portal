"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch, getStoredUser } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";

// Saúde do sistema (O7, 26/11/2026) — só o Super Admin. Reúne o que antes só se via no Railway:
// versão no ar, banco, backup, último disparo de cada rotina automática e os últimos erros do servidor.
// Os dados vêm de GET /api/admin/saude (nada aqui altera dados).

const ATUALIZA_A_CADA_MS = 60_000;

const SITUACAO = {
  ok:          { texto: "OK",              fundo: colors.successLight, cor: colors.successText },
  atrasado:    { texto: "Atrasado",        fundo: colors.warningLight, cor: colors.warningText },
  erro:        { texto: "Falhou",          fundo: colors.dangerLight,  cor: colors.dangerText },
  sem_registro:{ texto: "Sem registro",    fundo: colors.neutralLight, cor: colors.neutral },
  desligado:   { texto: "Desligado",       fundo: colors.neutralLight, cor: colors.neutral },
};

const GERAL = {
  ok:      { icone: "✓", titulo: "Tudo certo",            fundo: colors.successLight, cor: colors.successText, texto: "Banco respondendo, backup em dia e rotinas automáticas rodando." },
  atencao: { icone: "!", titulo: "Atenção",               fundo: colors.warningLight, cor: colors.warningText, texto: "Há algo pedindo olhar: veja os itens marcados abaixo." },
  critico: { icone: "✕", titulo: "Problema no sistema",   fundo: colors.dangerLight,  cor: colors.dangerText,  texto: "O banco não está respondendo ou as migrações não terminaram." },
};

function fmtDataHora(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtHa(horas) {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return "há menos de 1 h";
  if (horas < 48) return `há ${Math.round(horas)} h`;
  return `há ${Math.round(horas / 24)} dias`;
}

function fmtUptime(seg) {
  if (!Number.isFinite(seg)) return "—";
  if (seg < 3600) return `${Math.max(1, Math.round(seg / 60))} min`;
  if (seg < 172800) return `${Math.round(seg / 3600)} h`;
  return `${Math.round(seg / 86400)} dias`;
}

function fmtDuracao(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

// O resultado de cada rotina vem como texto JSON ({"emitidos":4,...}); aqui vira "emitidos: 4 · atualizados: 12".
function fmtResumo(texto) {
  if (!texto) return "—";
  try {
    const v = JSON.parse(texto);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const partes = Object.entries(v)
        .filter(([, valor]) => valor === null || ["string", "number", "boolean"].includes(typeof valor))
        .map(([k, valor]) => `${k.replace(/_/g, " ")}: ${valor === true ? "sim" : valor === false ? "não" : valor ?? "—"}`);
      return partes.length ? partes.join(" · ") : "Concluída";
    }
    if (Array.isArray(v)) return `${v.length} item(ns)`;
    return String(v);
  } catch {
    return texto;
  }
}

function Pill({ situacao }) {
  const s = SITUACAO[situacao] || SITUACAO.sem_registro;
  return <span style={{ ...pill, background: s.fundo, color: s.cor }}>{s.texto}</span>;
}

export default function SaudePage() {
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const d = await apiFetch("/admin/saude");
      setDados(d);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não consegui carregar a saúde do sistema.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (String(user?.perfil || "").toLowerCase() !== "super_admin") {
      router.replace("/inicio");
      return;
    }
    carregar();
    const t = setInterval(carregar, ATUALIZA_A_CADA_MS);
    return () => clearInterval(t);
  }, [carregar, router]);

  const geral = dados ? (GERAL[dados.geral] || GERAL.ok) : null;

  return (
    <PortalShell>
      <div style={pagina}>
        <PageHero
          title="Saúde do sistema"
          subtitle="Versão no ar, banco, backup, rotinas automáticas e últimos erros — numa tela só"
          icon="🩺"
          actions={
            <>
              <button style={btnHero} onClick={carregar}>↻ Atualizar</button>
              <button style={btnHero} onClick={() => router.push("/admin")}>← Voltar ao painel</button>
            </>
          }
        />

        {erro && <div style={alertaErro}>{erro}</div>}
        {carregando && !dados && <p style={{ color: colors.textSecondary }}>Carregando…</p>}

        {dados && (
          <>
            <div style={{ ...bannerGeral, background: geral.fundo, color: geral.cor }}>
              <span style={bannerIcone}>{geral.icone}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{geral.titulo}</div>
                <div style={{ fontSize: 13 }}>{geral.texto}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}>
                Atualizado em {fmtDataHora(dados.gerado_em)} (renova sozinho a cada minuto)
              </div>
            </div>

            <div style={gradeCards}>
              <div style={card}>
                <div style={cardTitulo}>Versão no ar</div>
                <div style={cardValor}>{dados.versao.commit_curto || "—"}</div>
                <div style={cardSub}>{dados.versao.mensagem_commit || "Sem mensagem de commit"}</div>
                <div style={cardSub}>Ligado {fmtUptime(dados.versao.no_ar_ha_segundos)} atrás · Node {dados.versao.node}</div>
              </div>

              <div style={card}>
                <div style={cardTitulo}>Banco de dados</div>
                <div style={cardValor}>{dados.banco.responde ? "Respondendo" : "Fora do ar"}</div>
                <div style={cardSub}>Resposta em {dados.banco.latencia_ms} ms · migrações {dados.banco.migracoes === "ok" ? "concluídas" : "pendentes"}</div>
                {dados.banco.ultima_falha_em && (
                  <div style={cardSub}>Última falha: {fmtDataHora(dados.banco.ultima_falha_em)}</div>
                )}
                {dados.banco.migracoes_detalhe && dados.banco.migracoes_detalhe.registrado && (
                  <div style={cardSub}>
                    {dados.banco.migracoes_detalhe.numeradas_aplicadas} migração(ões) numerada(s)
                    {dados.banco.migracoes_detalhe.ultima_numerada ? ` · última: ${dados.banco.migracoes_detalhe.ultima_numerada.id} em ${fmtDataHora(dados.banco.migracoes_detalhe.ultima_numerada.aplicada_em)}` : ""}
                    {dados.banco.migracoes_detalhe.legado ? ` · legado rodou em ${fmtDuracao(dados.banco.migracoes_detalhe.legado.duracao_ms)}` : ""}
                  </div>
                )}
                {dados.banco.migracoes_detalhe && dados.banco.migracoes_detalhe.legado && dados.banco.migracoes_detalhe.legado.avisos > 0 && (
                  <div style={{ ...cardSub, color: colors.warningText }}>
                    ⚠ {dados.banco.migracoes_detalhe.legado.avisos} passo(s) das migrações antigas não concluíram e seguiram: {dados.banco.migracoes_detalhe.legado.detalhe}
                  </div>
                )}
                {dados.banco.migracoes_detalhe && dados.banco.migracoes_detalhe.alteradas_depois_de_aplicadas && dados.banco.migracoes_detalhe.alteradas_depois_de_aplicadas.length > 0 && (
                  <div style={{ ...cardSub, color: colors.warningText }}>
                    ⚠ Migração já aplicada foi alterada depois ({dados.banco.migracoes_detalhe.alteradas_depois_de_aplicadas.join(", ")}). Mudança nova vai em arquivo novo.
                  </div>
                )}
              </div>

              <div style={card}>
                <div style={cardTitulo}>Backup externo <Pill situacao={dados.backup.situacao} /></div>
                <div style={cardValor}>{dados.backup.configurado ? fmtHa(dados.backup.horas_desde_ultimo_ok) : "Desligado"}</div>
                <div style={cardSub}>
                  {dados.backup.configurado
                    ? `Último backup bem-sucedido (alerta acima de ${dados.backup.limite_horas} h)`
                    : "Faltam as variáveis BACKUP_S3_* no servidor"}
                </div>
                {dados.backup.ultimo && dados.backup.ultimo.erro && (
                  <div style={{ ...cardSub, color: colors.dangerText }}>Último erro: {dados.backup.ultimo.erro}</div>
                )}
                {dados.backup.em_execucao && <div style={cardSub}>Backup em andamento agora…</div>}
              </div>
            </div>

            <section style={secao}>
              <h2 style={secaoTitulo}>Rotinas automáticas</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={tabela}>
                  <thead>
                    <tr>
                      <th style={th}>Rotina</th>
                      <th style={th}>Quando roda</th>
                      <th style={th}>Situação</th>
                      <th style={th}>Última execução</th>
                      <th style={th}>Duração</th>
                      <th style={th}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.jobs.map((j) => (
                      <tr key={j.chave}>
                        <td style={{ ...td, fontWeight: 700, color: colors.textPrimary }}>{j.nome}</td>
                        <td style={td}>{j.quando}</td>
                        <td style={td}><Pill situacao={j.situacao} /></td>
                        <td style={td}>
                          {fmtDataHora(j.ultima_execucao_em)}
                          {j.horas_desde_ultima !== null && <div style={miudo}>{fmtHa(j.horas_desde_ultima)}</div>}
                        </td>
                        <td style={td}>{fmtDuracao(j.duracao_ms)}</td>
                        <td style={{ ...td, maxWidth: 320, wordBreak: "break-word" }}>
                          {j.situacao === "erro" ? <span style={{ color: colors.dangerText }}>{j.erro}</span> : fmtResumo(j.resumo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={nota}>
                "Sem registro" significa que a rotina ainda não rodou depois que esta tela entrou no ar. Some sozinho no primeiro horário de cada uma.
                O backup tem o próprio cartão acima.
              </p>
            </section>

            <section style={secao}>
              <h2 style={secaoTitulo}>
                Últimos erros do servidor
                <span style={{ ...pill, background: colors.neutralLight, color: colors.neutral, marginLeft: 10 }}>
                  {dados.erros.total_desde_inicio} desde {fmtDataHora(dados.erros.desde)}
                </span>
              </h2>
              {dados.erros.itens.length === 0 ? (
                <p style={{ color: colors.successText, fontWeight: 700, margin: "8px 0 0" }}>Nenhum erro desde que o servidor foi ligado.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tabela}>
                    <thead>
                      <tr>
                        <th style={th}>Quando</th>
                        <th style={th}>Tipo</th>
                        <th style={th}>Rota</th>
                        <th style={th}>Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.erros.itens.map((e, i) => (
                        <tr key={`${e.quando}-${i}`}>
                          <td style={td}>{fmtDataHora(e.quando)}</td>
                          <td style={td}>{e.origem}{e.status ? ` (${e.status})` : ""}</td>
                          <td style={td}>{e.metodo ? `${e.metodo} ` : ""}{e.rota || "—"}</td>
                          <td style={{ ...td, maxWidth: 360, wordBreak: "break-word" }}>{e.mensagem || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={nota}>
                Mostra os 30 mais recentes. A lista zera a cada reinício do servidor (cada deploy). Não guarda dados de pessoas: só método, rota e mensagem curta.
                O detalhe completo continua nos registros do Railway.
              </p>
            </section>
          </>
        )}
      </div>
    </PortalShell>
  );
}

const pagina = { padding: "28px 32px", maxWidth: 1300, margin: "0 auto" };
const btnHero = {
  padding: "10px 16px", background: "rgba(255,255,255,0.12)", color: "#fff",
  border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
};
const alertaErro = {
  background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca",
  borderRadius: 10, padding: "12px 16px", margin: "16px 0", fontSize: 13.5,
};
const bannerGeral = {
  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
  borderRadius: 14, padding: "16px 20px", margin: "24px 0 20px",
};
const bannerIcone = {
  width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.7)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18,
};
const gradeCards = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 20 };
const card = { background: "#fff", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6" };
const cardTitulo = { fontSize: 12, fontWeight: 800, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".03em", display: "flex", alignItems: "center", gap: 8 };
const cardValor = { fontSize: 24, fontWeight: 900, color: colors.textPrimary, margin: "8px 0 4px" };
const cardSub = { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 };
const secao = { background: "#fff", borderRadius: 14, padding: 22, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6" };
const secaoTitulo = { fontSize: 15, fontWeight: 800, color: colors.textPrimary, margin: "0 0 14px", display: "flex", alignItems: "center" };
const tabela = { width: "100%", borderCollapse: "collapse" };
const th = {
  textAlign: "left", fontSize: 11.5, fontWeight: 800, color: colors.textMuted, textTransform: "uppercase",
  letterSpacing: ".03em", padding: "0 12px 10px", borderBottom: `1px solid ${colors.border}`,
};
const td = { padding: "12px", borderBottom: `1px solid ${colors.border}`, fontSize: 13, color: colors.textSecondary, verticalAlign: "top" };
const miudo = { fontSize: 11.5, color: colors.textMuted, marginTop: 2 };
const nota = { fontSize: 12, color: colors.textMuted, margin: "12px 0 0" };
const pill = { fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: radius.pill, whiteSpace: "nowrap", textTransform: "none", letterSpacing: 0 };
