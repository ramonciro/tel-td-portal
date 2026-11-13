"use client";

// Projeto Canguru · Ficha do novato (12/11/2026): as três avaliações lado a lado, com os textos que a pessoa escreveu,
// a data de admissão e o ponto de atenção. Só a equipe do RH abre; cada abertura fica registrada.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Campo, perfilRh, ehOperacaoRh, fmtDia, COR_RH } from "../../../../components/RhUi";
import { SituacaoPill, BarraDias, ChipsEtapas, Marca, Pilula, fmtDataHora } from "../../../../components/CangaruUi";
import { AbrirPontoForm, PontoCard } from "../../../../components/CangaruPonto";
import { useVisaoCanguru, SeletorVisao, ehSupervisor } from "../../../../components/CangaruVisao";

const enviar = (url, metodo, corpo) => apiFetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

function SimNao({ valor, bom = 1 }) {
  if (valor === null || valor === undefined) return <span style={{ color: colors.textMuted }}>—</span>;
  const ok = valor === bom;
  return <Pilula bg={ok ? colors.successLight : colors.dangerLight} cor={ok ? colors.successText : colors.dangerText}>{valor === 1 ? "Sim" : "Não"}</Pilula>;
}
function Nota({ valor, max }) {
  if (valor === null || valor === undefined) return <span style={{ color: colors.textMuted }}>—</span>;
  const baixa = valor <= max;
  return <Pilula bg={baixa ? colors.dangerLight : colors.successLight} cor={baixa ? colors.dangerText : colors.successText}>{valor} de 5</Pilula>;
}
function Linha({ rotulo, children }) {
  return <div style={{ padding: "7px 0", borderTop: `1px solid ${colors.border}` }}><div style={{ fontSize: 11, fontWeight: 800, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>{rotulo}</div>{children}</div>;
}
const Texto = ({ children }) => (children ? <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 4, padding: "6px 8px", background: "#f8fafc", borderRadius: 8 }}>{children}</div> : null);

function CartaoSupervisor({ a, rotulos }) {
  const det = a.detalhes || [];
  return (
    <div style={{ ...st.card, borderColor: a.zerada || a.sinais > 0 ? "#fca5a5" : colors.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{a.tipo === 90 ? 85 : a.tipo} dias</strong>
        <span style={{ fontSize: 12, color: colors.textMuted }}>Respondida em {fmtDataHora(a.respondida_em)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 6 }}>Avaliador(a): {a.supervisor_nome || "—"}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {a.zerada ? <Marca tom="perigo">Notas zeradas (fora da média)</Marca>
          : a.sinais > 0 ? <Marca tom="perigo">{a.sinais} {a.sinais === 1 ? "requisito com nota baixa" : "requisitos com nota baixa"}: {(a.sinais_lista || []).map((x) => rotulos[x] || x).join(", ")}</Marca>
          : <Marca tom="neutro">Sem nota baixa</Marca>}
        {a.media !== null && a.media !== undefined ? <Marca tom="neutro">Média {Number(a.media).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Marca> : null}
        {a.prioritario ? <Marca tom="perigo" titulo={a.prioritario_termos ? `Termos: ${a.prioritario_termos}` : undefined}>Risco de abandono</Marca> : null}
      </div>
      {Object.keys(rotulos).map((k) => {
        const d = det.filter((x) => x.r === k);
        return (
          <Linha key={k} rotulo={rotulos[k]}>
            <Nota valor={a.notas?.[k]} max={2} />
            {d.map((x, i) => (
              <div key={i}>
                {x.c || x.o ? <div style={{ fontSize: 12.5, marginTop: 4 }}>{[x.c, x.o].filter(Boolean).join(" · ")}</div> : null}
                <Texto>{x.t}</Texto>
              </div>
            ))}
          </Linha>
        );
      })}
    </div>
  );
}

export default function FichaNovatoPage() {
  const router = useRouter();
  const operacao = ehOperacaoRh(perfilRh());
  const [visao, setVisao] = useVisaoCanguru();
  const sup = ehSupervisor(visao);
  const [id, setId] = useState(null);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [adm, setAdm] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => { if (perfilRh() && !operacao) router.replace("/rh/canguru/resultado"); }, [operacao, router]);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("id");
    if (v && /^\d+$/.test(v)) setId(v); else setErro("Novato não informado. Abra a ficha pela tela de acompanhamento.");
  }, []);

  const carregar = useCallback(async () => {
    if (!id || !operacao) return;
    try { const r = await apiFetch(`/rh/canguru/novatos/${id}`); setD(r); setAdm(r.novato.data_admissao ? String(r.novato.data_admissao).slice(0, 10) : ""); }
    catch (e) { setErro(e.message || "Não foi possível abrir a ficha."); }
  }, [id, operacao]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvarAdmissao = async () => {
    setErro(""); setMsg("");
    try { await enviar(`/rh/canguru/novatos/${id}/admissao`, "PUT", { data_admissao: adm }); setMsg("Data de admissão salva. As etapas foram recalculadas."); await carregar(); }
    catch (e) { setErro(e.message || "Não foi possível salvar a data."); }
  };

  const n = sup ? (d?.novato_supervisor || d?.novato) : d?.novato;
  const rot = d?.rotulos_sinais || {};
  const aberto = (d?.pontos || []).find((p) => ["aberto", "em_andamento"].includes(p.status));
  const max = 90;

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Projeto Canguru" title={n ? n.nome : "Ficha do novato"} subtitle={n ? `Matrícula ${n.matricula || "—"} · ${n.site_rotulo || "—"} · ${n.servico || "—"}` : "Avaliações e ponto de atenção"} />
      <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}><SeletorVisao visao={visao} onChange={setVisao} /></div>
      <p style={{ marginTop: 12 }}><Link href={`/rh/canguru?visao=${visao}`} style={{ color: "#9d174d", fontWeight: 800, fontSize: 13 }}>← Voltar ao acompanhamento</Link></p>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      {msg ? <div style={st.ok}>{msg}</div> : null}
      {!d && !erro ? <p style={{ color: colors.textMuted }}>Carregando…</p> : null}

      {n ? (
        <>
          <div style={{ ...st.card, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <SituacaoPill situacao={n.situacao} />
              {n.prioritario ? <Marca tom="perigo">{sup ? "Risco de abandono" : "Prioritário"}</Marca> : null}
              {n.recorrente ? <Marca tom="aviso">Recorrente</Marca> : null}
              <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{n.funcao || "—"} · supervisor(a) {n.supervisor || "—"} · coordenação {n.coordenador || "—"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              <div>
                <BarraDias dia={n.dia} etapas={n.etapas} max={max} />
                <div style={{ fontSize: 12, color: colors.textMuted, margin: "2px 0 8px" }}>{n.dia === null || n.dia === undefined ? "Sem data de admissão: informe ao lado para calcular as etapas." : `Dia ${n.dia} desde a admissão`}</div>
                <ChipsEtapas etapas={n.etapas} />
              </div>
              <div>
                <Campo label={`Data de admissão${n.admissao_origem === "manual" ? " (informada pelo RH)" : n.data_admissao ? " (do cadastro)" : ""}`} minWidth={0}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={st.input} type="date" value={adm} onChange={(e) => setAdm(e.target.value)} />
                    <button type="button" style={{ ...st.btnGhost, opacity: adm ? 1 : 0.5 }} disabled={!adm} onClick={salvarAdmissao}>Salvar</button>
                  </div>
                </Campo>
                <p style={{ fontSize: 11.5, color: colors.textMuted, margin: "6px 0 0" }}>A data informada aqui não é trocada quando as planilhas são importadas de novo.</p>
              </div>
            </div>
          </div>

          <h3 style={{ margin: "20px 0 8px", fontSize: 15 }}>{sup ? "Avaliações do supervisor" : "Avaliações"}</h3>
          {sup ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Notas de 0 a 5 que o supervisor deu a cada requisito. Os comentários são do avaliador; use só para acompanhar e conversar. Esta abertura ficou registrada no histórico de acessos do RH.</p>
              {!d.avaliacoes_supervisor?.length ? <div style={{ ...st.card, ...{ color: colors.textMuted } }}>Nenhuma avaliação do supervisor importada ainda.</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
                  {d.avaliacoes_supervisor.map((a) => <CartaoSupervisor key={a.tipo} a={a} rotulos={d.requisitos || {}} />)}
                </div>
              )}
            </>
          ) : (<>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Os textos abaixo são do próprio novato. Use só para acompanhar e conversar; esta abertura ficou registrada no histórico de acessos do RH.</p>
          {!d.avaliacoes.length ? <div style={{ ...st.card, ...{ color: colors.textMuted } }}>Nenhuma avaliação respondida ainda.</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              {d.avaliacoes.map((a) => (
                <div key={a.tipo} style={{ ...st.card, borderColor: a.sinais > 0 ? "#fca5a5" : colors.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 15 }}>{a.tipo} dias</strong>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>Respondida em {fmtDataHora(a.respondida_em)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {a.sinais > 0 ? <Marca tom="perigo">{a.sinais} {a.sinais === 1 ? "sinal" : "sinais"}: {(a.sinais_lista || []).map((s) => rot[s] || s).join(", ")}</Marca> : <Marca tom="neutro">Sem sinal</Marca>}
                    {a.prioritario ? <Marca tom="perigo" titulo={a.prioritario_termos ? `Termos: ${a.prioritario_termos}` : undefined}>Relato prioritário</Marca> : null}
                  </div>
                  <Linha rotulo="A empresa atendeu as expectativas?"><SimNao valor={a.esp} /><Texto>{a.esp_motivo}</Texto></Linha>
                  <Linha rotulo="Sentiu-se acolhido(a)?"><SimNao valor={a.acolhido} />{a.acolhido_area ? <span style={{ fontSize: 12.5, marginLeft: 8 }}>Faltou em: {a.acolhido_area}</span> : null}<Texto>{a.acolhido_texto}</Texto></Linha>
                  <Linha rotulo="O líder é um bom gestor?"><SimNao valor={a.lider} />{a.lider_motivo ? <span style={{ fontSize: 12.5, marginLeft: 8 }}>Motivo: {a.lider_motivo}</span> : null}<Texto>{a.lider_texto}</Texto></Linha>
                  <Linha rotulo="Nota das atividades"><Nota valor={a.nota_ativ} max={2} />{a.ativ_motivo ? <div style={{ fontSize: 12.5, marginTop: 4 }}>{a.ativ_motivo}</div> : null}{a.ativ_area ? <div style={{ fontSize: 12.5 }}>Área: {a.ativ_area}</div> : null}<Texto>{a.ativ_texto}</Texto></Linha>
                  <Linha rotulo="Nota das áreas de apoio"><Nota valor={a.nota_apoio} max={2} /><Texto>{a.apoio_texto}</Texto></Linha>
                  <Linha rotulo="Nota do clima com os colegas"><Nota valor={a.nota_clima} max={2} /><Texto>{a.clima_texto}</Texto></Linha>
                </div>
              ))}
            </div>
          )}
          </>)}

          <h3 style={{ margin: "20px 0 8px", fontSize: 15 }}>Ponto de atenção</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {(d.pontos || []).map((p) => <PontoCard key={p.id} ponto={p} equipe={d.equipe} onMudou={carregar} />)}
            {!aberto ? (
              abrindo ? (
                <div style={st.card}><AbrirPontoForm novatoId={n.id} equipe={d.equipe} onCancelar={() => setAbrindo(false)} onFeito={() => { setAbrindo(false); setMsg("Ponto de atenção aberto."); carregar(); }} /></div>
              ) : (
                <div><button type="button" style={{ ...st.btn, background: COR_RH }} onClick={() => setAbrindo(true)}>Abrir ponto de atenção</button></div>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </PortalShell>
  );
}
