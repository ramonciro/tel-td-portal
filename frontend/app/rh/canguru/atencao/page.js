"use client";

// Projeto Canguru · Pontos de atenção (12/11/2026): fila dos novatos com sinal nas avaliações (relatos prioritários primeiro,
// depois quem tem sinal em mais de uma avaliação) e o acompanhamento dos pontos já abertos pelos 5 passos.
// Texto livre dos novatos só aparece na ficha; aqui só os sinais.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Campo, Select, Modal, Abas, Paginacao, perfilRh, ehOperacaoRh, fmtN, fmtDia, COR_RH } from "../../../../components/RhUi";
import { Marca, SituacaoPill, STATUS_PONTO } from "../../../../components/CangaruUi";
import { SeletorVisao, useVisaoCanguru, ehSupervisor } from "../../../../components/CangaruVisao";
import { AbrirPontoForm } from "../../../../components/CangaruPonto";

const LIMITE = 40;

export default function CangaruAtencaoPage() {
  const router = useRouter();
  const operacao = ehOperacaoRh(perfilRh());
  const [visao, setVisao, visaoPronta] = useVisaoCanguru();
  const sup = ehSupervisor(visao);
  const [aba, setAba] = useState("fila");
  const [f, setF] = useState({ site: "", servico: "", ponto: "", so_prioritarios: false, so_recorrentes: false, busca: "" });
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [fila, setFila] = useState(null);
  const [pontos, setPontos] = useState(null);
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState("");
  const [abrir, setAbrir] = useState(null);
  const [msg, setMsg] = useState("");
  const primeira = useRef(true);

  useEffect(() => { if (perfilRh() && !operacao) router.replace("/rh/canguru/resultado"); }, [operacao, router]);

  const carregarFila = useCallback(() => {
    if (!operacao || !visaoPronta) return;
    const q = new URLSearchParams({ limite: String(LIMITE), deslocamento: String((pagina - 1) * LIMITE), visao });
    ["site", "servico", "ponto", "busca"].forEach((k) => { if (f[k]) q.set(k, f[k]); });
    if (f.so_prioritarios) q.set("so_prioritarios", "1");
    if (f.so_recorrentes) q.set("so_recorrentes", "1");
    apiFetch(`/rh/canguru/atencao?${q.toString()}`).then(setFila).catch((e) => setErro(e.message || "Não foi possível carregar a fila."));
  }, [f, pagina, operacao, visao, visaoPronta]);
  const carregarPontos = useCallback(() => {
    if (!operacao) return;
    apiFetch(`/rh/canguru/pontos${aba === "encerrados" ? "?status=resolvidos" : ""}`).then((r) => { setPontos(r.pontos); setEquipe(r.equipe); }).catch((e) => setErro(e.message || "Não foi possível carregar os pontos."));
  }, [aba, operacao]);
  useEffect(() => { if (aba === "fila") carregarFila(); else carregarPontos(); }, [aba, carregarFila, carregarPontos]);
  useEffect(() => { if (operacao && !equipe.length) apiFetch("/rh/canguru/pontos").then((r) => setEquipe(r.equipe)).catch(() => {}); }, [operacao]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (primeira.current) { primeira.current = false; return undefined; }
    const t = setTimeout(() => { setF((x) => ({ ...x, busca: buscaDigitada.trim() })); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  const mudar = (campo) => (valor) => { setF((x) => ({ ...x, [campo]: valor })); setPagina(1); };
  const r = fila?.resumo;
  const rotulos = fila?.rotulos_sinais || {};

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Projeto Canguru" title="Pontos de atenção"
        subtitle={sup ? "Quem o supervisor avaliou com nota baixa e o que o RH está fazendo a respeito, em cinco passos." : "Quem sinalizou problema nas avaliações e o que o RH está fazendo a respeito, em cinco passos."}
        actions={operacao && aba === "fila" ? <SeletorVisao visao={visao} onChange={(v) => { setVisao(v); setPagina(1); }} escuro /> : null} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {msg ? <div style={{ ...st.ok, marginTop: 14 }}>{msg}</div> : null}

      <div style={{ marginTop: 16 }}>
        <Abas valor={aba} onChange={(v) => { setAba(v); setMsg(""); }} abas={[{ value: "fila", label: "Fila de atenção" }, { value: "tratando", label: "Em tratamento" }, { value: "encerrados", label: "Encerrados" }]} />
      </div>

      {aba === "fila" ? (
        <div style={st.card}>
          {r ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Marca tom="neutro">{fmtN(r.total)} na fila</Marca><Marca tom="perigo">{fmtN(r.prioritarios)} {sup ? "com risco de abandono" : "prioritários"}</Marca><Marca tom="aviso">{fmtN(r.recorrentes)} recorrentes</Marca><Marca tom="neutro">{fmtN(r.com_ponto_aberto)} em tratamento</Marca><Marca tom="neutro">{fmtN(r.sem_ponto)} sem ponto aberto</Marca>
            </div>
          ) : null}
          <div style={st.filtros}>
            <Campo label="Buscar por nome ou matrícula" flex={2} minWidth={200}><input style={st.input} value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} placeholder="Nome ou matrícula" /></Campo>
            <Campo label="Site" minWidth={160}><Select value={f.site} onChange={mudar("site")} vazio="Todos" opcoes={(fila?.filtros?.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
            <Campo label="Serviço" minWidth={180}><Select value={f.servico} onChange={mudar("servico")} vazio="Todos" opcoes={(fila?.filtros?.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
            <Campo label="Ponto de atenção" minWidth={160}><Select value={f.ponto} onChange={mudar("ponto")} vazio="Todos" opcoes={[{ value: "sem", label: "Sem ponto aberto" }, { value: "com", label: "Com ponto aberto" }]} /></Campo>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={f.so_prioritarios} onChange={(e) => mudar("so_prioritarios")(e.target.checked)} />{sup ? "Só risco de abandono" : "Só relatos prioritários"}</label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={f.so_recorrentes} onChange={(e) => mudar("so_recorrentes")(e.target.checked)} />Só quem tem sinal em 2 ou mais avaliações</label>
          </div>
          {!fila ? <p style={st.vazio}>Carregando…</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead><tr><th style={st.th}>Novato</th><th style={st.th}>Site · serviço</th><th style={st.th}>{sup ? "Requisitos com nota baixa" : "O que sinalizou"}</th><th style={st.th}>Última resposta</th><th style={st.th}>Situação</th><th style={st.th}></th></tr></thead>
                <tbody>
                  {fila.itens.map((n) => (
                    <tr key={n.id}>
                      <td style={st.td}>
                        <Link href={`/rh/canguru/novato?id=${n.id}`} style={{ color: "#9d174d", fontWeight: 800, textDecoration: "none" }}>{n.nome}</Link>
                        <div style={{ fontSize: 11.5, color: colors.textMuted }}>Matrícula {n.matricula || "—"} · dia {n.dia ?? "—"}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                          {n.prioritario ? <Marca tom="perigo" titulo={sup ? "Avaliação zerada ou com sinal de abandono" : "Relato com termo de saúde ou segurança"}>{sup ? "Risco de abandono" : "Prioritário"}</Marca> : null}
                          {n.recorrente ? <Marca tom="aviso" titulo="Sinal em duas ou mais avaliações">Recorrente</Marca> : null}
                        </div>
                      </td>
                      <td style={st.td}>{n.site_rotulo || "—"}<div style={{ fontSize: 11.5, color: colors.textMuted }}>{n.servico || "—"}</div></td>
                      <td style={st.td}>
                        {n.etapas.filter((e) => e.sinais > 0).map((e) => (
                          <div key={e.tipo} style={{ fontSize: 12.5, marginBottom: 2 }}><strong>{e.tipo} dias:</strong> {(e.sinais_lista || []).map((s) => rotulos[s] || s).join(", ")}</div>
                        ))}
                      </td>
                      <td style={st.td}>{fmtDia(n.ultima_resposta)}</td>
                      <td style={st.td}>
                        {n.ponto_aberto ? <span style={{ fontSize: 12.5 }}><strong>Passo {n.ponto_aberto.passo}</strong> de 5<div style={{ fontSize: 11.5, color: colors.textMuted }}>{STATUS_PONTO[n.ponto_aberto.status]}</div></span> : <SituacaoPill situacao="pede_acao" />}
                      </td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                        {n.ponto_aberto ? <Link href={`/rh/canguru/novato?id=${n.id}`} style={{ ...st.btnMini, textDecoration: "none" }}>Abrir ficha</Link> : <button type="button" style={{ ...st.btnMini, background: "#fce7f3", color: "#9d174d" }} onClick={() => setAbrir(n)}>Abrir ponto</button>}
                      </td>
                    </tr>
                  ))}
                  {!fila.itens.length ? <tr><td colSpan={6} style={st.vazio}>Ninguém na fila com esses filtros.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
          {fila ? <Paginacao total={fila.total} limite={LIMITE} pagina={pagina} onPagina={setPagina} /> : null}
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>Ordem: {sup ? "risco de abandono" : "relatos prioritários"}, depois sinal em mais avaliações, depois a resposta mais recente. Os textos só aparecem na ficha do novato, e cada abertura de ficha fica registrada.</p>
        </div>
      ) : (
        <div style={st.card}>
          {!pontos ? <p style={st.vazio}>Carregando…</p> : !pontos.length ? <p style={st.vazio}>{aba === "tratando" ? "Nenhum ponto em tratamento no momento." : "Nenhum ponto encerrado ainda."}</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr><th style={st.th}>Novato</th><th style={st.th}>Site · serviço</th><th style={st.th}>Passo</th><th style={st.th}>Responsável</th><th style={st.th}>Prazo</th><th style={st.th}>Situação</th><th style={st.th}></th></tr></thead>
                <tbody>
                  {pontos.map((p) => (
                    <tr key={p.id}>
                      <td style={st.td}><strong>{p.nome}</strong><div style={{ fontSize: 11.5, color: colors.textMuted }}>Matrícula {p.matricula || "—"}</div></td>
                      <td style={st.td}>{p.site_rotulo || "—"}<div style={{ fontSize: 11.5, color: colors.textMuted }}>{p.servico || "—"}</div></td>
                      <td style={st.td}>{p.passo}. {p.passo_nome}</td>
                      <td style={st.td}>{p.responsavel_nome || <span style={{ color: colors.warningText, fontWeight: 700 }}>Sem responsável</span>}</td>
                      <td style={st.td}>{p.prazo ? <span style={{ color: p.atrasado ? colors.dangerText : undefined, fontWeight: p.atrasado ? 800 : 400 }}>{fmtDia(p.prazo)}{p.atrasado ? " · atrasado" : ""}</span> : "—"}</td>
                      <td style={st.td}>{STATUS_PONTO[p.status] || p.status}</td>
                      <td style={st.td}><Link href={`/rh/canguru/novato?id=${p.novato_id}`} style={{ ...st.btnMini, textDecoration: "none" }}>Abrir ficha</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {abrir ? (
        <Modal titulo={`Abrir ponto de atenção · ${abrir.nome}`} onClose={() => setAbrir(null)} largura={560}>
          <AbrirPontoForm novatoId={abrir.id} equipe={equipe} onCancelar={() => setAbrir(null)} onFeito={() => { setAbrir(null); setMsg(`Ponto aberto para ${abrir.nome}. Ele aparece em “Em tratamento”.`); carregarFila(); }} />
        </Modal>
      ) : null}
    </PortalShell>
  );
}
