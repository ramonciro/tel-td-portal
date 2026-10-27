"use client";

import { useCallback, useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { GRAV, fmtData, Kpi, alerta, ok, caixa, tabela, th, td, mini, vazio, badge, badgePeq, link, chip, chipOn } from "./ui";

// Radar da semana (Pacote 3, 26/10/2026): os 5 maiores riscos com a decisão sugerida,
// o que mudou desde a semana passada, faróis com tendência e a prevenção do próprio portal.

const COR_FAROL = { verde: colors.success, amarelo: "#ca8a04", laranja: "#ea580c", vermelho: colors.dangerText };
const TEND = {
  melhorou: { seta: "↓", texto: "melhorou", cor: colors.successText },
  piorou: { seta: "↑", texto: "piorou", cor: colors.dangerText },
  igual: { seta: "=", texto: "igual", cor: colors.textSecondary },
  novo: { seta: "·", texto: "sem comparação ainda", cor: colors.textMuted },
};

function prazoTexto(i) {
  if (i.dias_para_prazo === null || i.dias_para_prazo === undefined) return "sem prazo definido";
  const d = i.dias_para_prazo;
  const quando = d === 0 ? "hoje" : d === 1 ? "amanhã" : d < 0 ? `venceu há ${-d} dia(s)` : `em ${d} dias`;
  return `prazo ${fmtData(i.prazo)} (${quando})`;
}

function Acoes({ item, motivos, onFeito, onErro }) {
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState(motivos?.[0] || "");
  const [outro, setOutro] = useState("");
  const [dias, setDias] = useState(14);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (rota, corpo) => {
    setEnviando(true);
    try {
      await apiFetch(`/preventivo/radar-itens/${item.id}/${rota}`, { method: "POST", body: JSON.stringify(corpo || {}) });
      setAbrindo(false);
      onFeito();
    } catch (e) {
      onErro(e.message || "Não foi possível atualizar o item.");
    } finally {
      setEnviando(false);
    }
  };
  const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {item.link && <a href={item.link} style={{ ...chip, textDecoration: "none" }}>Abrir</a>}
        <button type="button" style={chip} disabled={enviando} onClick={() => enviar("resolver")}>Resolvido</button>
        <button type="button" style={{ ...chip, ...(abrindo ? chipOn : {}) }} onClick={() => setAbrindo((v) => !v)}>Ignorar com motivo</button>
      </div>
      {abrindo && (
        <div style={{ ...caixa, marginTop: 8, background: "#f8fafc", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select aria-label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={campo}>
            {(motivos || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {motivo === "Outro" && <input aria-label="Descreva o motivo" placeholder="Descreva o motivo" value={outro} onChange={(e) => setOutro(e.target.value)} style={{ ...campo, minWidth: 220 }} />}
          <select aria-label="Ignorar por" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={campo}>
            {[7, 14, 30].map((d) => <option key={d} value={d}>por {d} dias</option>)}
          </select>
          <button type="button" style={{ ...chip, ...chipOn }} disabled={enviando || motivoFinal.length < 3} onClick={() => enviar("ignorar", { motivo: motivoFinal, dias })}>Confirmar</button>
        </div>
      )}
    </div>
  );
}
const campo = { padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: 13, background: "#fff", color: colors.textPrimary };

function CartaoRisco({ item, motivos, numero, onFeito, onErro }) {
  const g = GRAV[item.gravidade] || GRAV.media;
  return (
    <div style={{ ...caixa, borderLeft: `4px solid ${g.cor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <strong style={{ fontSize: 15 }}>{numero ? `${numero}. ` : ""}{item.titulo}</strong>
          <div style={mini}>{item.origem_nome} · dono sugerido: {item.dono || "Coordenação"} · {prazoTexto(item)}{item.novo ? " · novo nesta semana" : ` · aberto há ${item.dias_aberto} dia(s)`}{item.reabertos ? " · reaberto" : ""}</div>
        </div>
        <span style={{ ...badge, color: g.cor, background: g.bg }}>{g.texto}</span>
      </div>
      {item.detalhe && <p style={{ ...mini, margin: "8px 0 0" }}>{item.detalhe}</p>}
      <p style={{ margin: "8px 0 0", fontSize: 14, color: colors.textPrimary }}><strong>Decisão sugerida:</strong> {item.decisao}</p>
      <Acoes item={item} motivos={motivos} onFeito={onFeito} onErro={onErro} />
    </div>
  );
}

function Delta({ agora, antes, inverso }) {
  if (antes === null || antes === undefined) return <span style={mini}>sem comparação</span>;
  const d = agora - antes;
  if (!d) return <span style={mini}>igual à semana passada ({antes})</span>;
  const melhor = inverso ? d > 0 : d < 0;
  return <span style={{ ...mini, color: melhor ? colors.successText : colors.dangerText, fontWeight: 700 }}>{d > 0 ? "↑" : "↓"} {Math.abs(d)} vs. semana passada ({antes})</span>;
}

export default function RadarSemana() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [todos, setTodos] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch("/preventivo/radar-semanal");
      setD(r);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o Radar da semana.");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const feito = () => { setAviso(""); carregar(); };
  if (erro && !d) return <div style={alerta}>{erro}</div>;
  if (!d) return <p style={vazio}>Carregando…</p>;

  const m = d.mudancas;
  const resto = d.itens.filter((i) => !d.top5.some((t) => t.id === i.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(erro || aviso) && <div style={alerta}>{erro || aviso}</div>}
      {!d.abertos && <div style={ok}>Nenhum risco aberto agora. Tudo o que o Radar acompanha está em ordem.</div>}

      <p style={{ ...mini, margin: 0 }}>
        Semana de {fmtData(d.semana_inicio)}
        {d.gerado_em ? ` · retrato de segunda gerado em ${new Date(d.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : " · retrato de segunda ainda não gerado"}
        {" · a lista abaixo é calculada agora e comparada com 7 dias atrás."}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Kpi rotulo="Riscos abertos" valor={d.abertos} nota={`${d.por_gravidade.critica} crítico(s) · ${d.por_gravidade.alta} alto(s) · ${d.por_gravidade.media} atenção`} cor={d.por_gravidade.critica ? colors.dangerText : undefined} />
        <Kpi rotulo="Novos desde a semana passada" valor={m.tem_historico ? m.novos : "—"} nota={m.tem_historico ? `${m.novos_criticos} crítico(s)` : "Radar começa a comparar na próxima semana"} />
        <Kpi rotulo="Resolvidos na semana" valor={m.resolvidos} nota={`${m.resolvidos_a_tempo} a tempo`} cor={m.resolvidos ? colors.successText : undefined} />
        <Kpi rotulo="Alertas tratados a tempo (30 dias)" valor={d.prevencao.percentual === null ? "—" : `${d.prevencao.percentual}%`} nota={d.prevencao.total ? `${d.prevencao.a_tempo} de ${d.prevencao.total} com prazo` : "ainda sem prazos vencidos"} />
      </div>

      <SectionCard title="Os 5 maiores riscos da semana" subtitle="Ordenados por gravidade e proximidade do prazo (no máximo 3 do mesmo tipo). Cada um traz o dono sugerido e a decisão que ainda dá tempo de tomar.">
        {!d.top5.length ? <p style={vazio}>Nada a decidir agora.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {d.top5.map((i, n) => <CartaoRisco key={i.id} item={i} numero={n + 1} motivos={d.motivos} onFeito={feito} onErro={setAviso} />)}
          </div>
        )}
      </SectionCard>

      <SectionCard title="O que mudou desde a semana passada" subtitle={m.tem_historico ? undefined : "O Radar guarda cada risco desde a primeira leitura; a comparação começa quando houver 7 dias de história."}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ ...caixa, flex: "1 1 220px" }}>
            <div style={mini}>Riscos abertos</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{m.abertos_agora}</div>
            <Delta agora={m.abertos_agora} antes={m.abertos_antes} />
          </div>
          <div style={{ ...caixa, flex: "1 1 220px" }}>
            <div style={mini}>Críticos</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{m.criticos_agora}</div>
            <Delta agora={m.criticos_agora} antes={m.criticos_antes} />
          </div>
          <div style={{ ...caixa, flex: "1 1 220px" }}>
            <div style={mini}>Seguem abertos da semana passada</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{m.persistentes}</div>
            <span style={mini}>{m.persistentes_criticos} crítico(s)</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <strong style={{ fontSize: 14 }}>Novos</strong>
            {!m.lista_novos.length ? <p style={{ ...mini, margin: "6px 0 0" }}>Nenhum risco novo.</p> : (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>{m.lista_novos.map((i) => <li key={i.id}>{i.titulo}</li>)}</ul>
            )}
          </div>
          <div style={{ flex: "1 1 320px" }}>
            <strong style={{ fontSize: 14 }}>Resolvidos</strong>
            {!m.lista_resolvidos.length ? <p style={{ ...mini, margin: "6px 0 0" }}>Nenhum risco resolvido na semana.</p> : (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>{m.lista_resolvidos.map((i) => <li key={i.id}>{i.titulo}{i.a_tempo === 1 ? " (a tempo)" : ""}</li>)}</ul>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Faróis" subtitle="Quantos riscos de cada tipo estão abertos, a tendência contra 7 dias atrás e quantos dias faltam para o prazo mais próximo.">
        <div style={{ overflowX: "auto" }}>
          <table style={tabela}>
            <thead>
              <tr>
                <th style={th}>Farol</th>
                <th style={th}>Abertos</th>
                <th style={th}>Semana passada</th>
                <th style={th}>Tendência</th>
                <th style={th}>Prazo mais próximo</th>
              </tr>
            </thead>
            <tbody>
              {d.farois.map((f) => {
                const t = TEND[f.tendencia] || TEND.novo;
                return (
                  <tr key={f.id}>
                    <td style={td}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COR_FAROL[f.cor], marginRight: 8 }} />
                      <strong>{f.nome}</strong>
                      {f.criticos > 0 && <div style={mini}>{f.criticos} crítico(s)</div>}
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>{f.valor}</td>
                    <td style={td}>{f.anterior === null ? "—" : f.anterior}</td>
                    <td style={{ ...td, color: t.cor, fontWeight: 700 }}>{t.seta} {t.texto}</td>
                    <td style={td}>{f.proximo_prazo_dias === null ? "—" : f.proximo_prazo_dias === 0 ? "hoje" : `em ${f.proximo_prazo_dias} dia(s)`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title={`Demais riscos abertos (${resto.length})`}
        subtitle="Tudo o que o Radar acompanha e ficou fora do top 5."
        action={resto.length ? <button type="button" style={chip} onClick={() => setTodos((v) => !v)}>{todos ? "Ocultar" : "Mostrar"}</button> : null}
      >
        {!resto.length ? <p style={vazio}>Nenhum outro risco aberto.</p> : todos ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resto.map((i) => <CartaoRisco key={i.id} item={i} motivos={d.motivos} onFeito={feito} onErro={setAviso} />)}
          </div>
        ) : <p style={vazio}>Clique em Mostrar para ver a lista completa.</p>}
      </SectionCard>

      {(d.ignorados.length > 0 || d.calibragem.length > 0) && (
        <SectionCard title="Ignorados e calibragem" subtitle="Os motivos para ignorar mostram quais alertas não servem e ajudam a calibrar as regras do Radar.">
          {d.ignorados.length > 0 && (
            <ul style={{ margin: "0 0 12px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {d.ignorados.map((i) => (
                <li key={i.id} style={{ ...caixa, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{i.titulo}</strong>
                    <div style={mini}>Motivo: {i.motivo} · até {fmtData(i.ate)}{i.por ? ` · por ${i.por}` : ""}</div>
                  </div>
                  <button type="button" style={chip} onClick={async () => { try { await apiFetch(`/preventivo/radar-itens/${i.id}/reabrir`, { method: "POST", body: "{}" }); feito(); } catch (e) { setAviso(e.message); } }}>Reabrir</button>
                </li>
              ))}
            </ul>
          )}
          {d.calibragem.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead><tr><th style={th}>Tipo de risco</th><th style={th}>Motivo para ignorar</th><th style={th}>Vezes</th></tr></thead>
                <tbody>{d.calibragem.map((c) => <tr key={`${c.origem}|${c.motivo}`}><td style={td}>{c.origem_nome}</td><td style={td}>{c.motivo}</td><td style={td}>{c.qtd}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
