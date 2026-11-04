"use client";

// Mapa de Desenvolvimento — aba "Comprovação MPT" (04/11/2026).
//
// Horas de desenvolvimento por pessoa e por subdivisão (jornadas + turmas com subtipo) contra a META INTERNA
// de horas definida pela Metodologia. A meta é de gestão, nunca uma exigência legal. O farol é a % de pessoas
// que atingiram a meta e não entra em média com nenhum outro indicador. Sem meta cadastrada, a tela diz
// "meta não definida" e não inventa número.
//
// Nome e matrícula só aparecem aqui (Metodologia). CPF nunca sai do servidor.

import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "../../../components/SectionCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { compactInputStyle, buttonPrimaryStyle, buttonSecondaryStyle, buttonDangerStyle } from "./estilos";

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(Number(n || 0));
const dec = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(n || 0));
const dataBR = (iso) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

const FAROL = {
  verde: { icone: "✓", texto: "Em dia", cor: colors.successText, bg: colors.successLight },
  amarelo: { icone: "◔", texto: "Atenção", cor: colors.warningText, bg: colors.warningLight },
  vermelho: { icone: "⚠", texto: "Abaixo", cor: colors.dangerText, bg: colors.dangerLight },
  cinza: { icone: "•", texto: "Meta não definida", cor: colors.neutral, bg: colors.neutralLight },
};

const SITUACAO = {
  atingiu: { texto: "Atingiu a meta", icone: "✓", cor: colors.successText, bg: colors.successLight },
  abaixo: { texto: "Abaixo da meta", icone: "◔", cor: colors.warningText, bg: colors.warningLight },
  sem_hora: { texto: "Sem nenhuma hora", icone: "⚠", cor: colors.dangerText, bg: colors.dangerLight },
  sem_meta: { texto: "Meta não definida", icone: "•", cor: colors.neutral, bg: colors.neutralLight },
};

function Pill({ info }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: info.cor, background: info.bg, whiteSpace: "nowrap" }}>
      <span aria-hidden="true">{info.icone}</span>
      {info.texto}
    </span>
  );
}

export default function AbaMpt({ subtiposCatalogo = [] }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  // Período (Pacote 2): ano-calendário (padrão) ou intervalo de datas. Intervalo parcial mostra as horas,
  // mas NÃO compara com a meta anual.
  const [modo, setModo] = useState("ano");
  const [de, setDe] = useState(`${anoAtual}-01-01`);
  const [ate, setAte] = useState(`${anoAtual}-12-31`);
  const [baixando, setBaixando] = useState("");
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [metasForm, setMetasForm] = useState({});
  const [salvando, setSalvando] = useState("");
  const [foco, setFoco] = useState(null); // { subtipo, cliente?, situacao? }
  const [pessoas, setPessoas] = useState(null);
  const [aberta, setAberta] = useState("");

  const periodoOk = modo === "ano" || (/^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate) && de <= ate);
  const qsPeriodo = modo === "ano" ? `ano=${ano}` : `de=${de}&ate=${ate}`;
  const rotuloPeriodo = modo === "ano" ? `${ano}` : `${dataBR(de)} a ${dataBR(ate)}`;

  const carregar = useCallback(async () => {
    if (!periodoOk) return;
    try {
      setCarregando(true);
      setErro("");
      const r = await apiFetch(`/mpt/resumo?${qsPeriodo}`);
      setResumo(r);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a Comprovação MPT.");
    } finally {
      setCarregando(false);
    }
  }, [qsPeriodo, periodoOk]);

  useEffect(() => { carregar(); }, [carregar]);

  const metasPorSubtipo = useMemo(() => new Map((resumo?.metas || []).map((m) => [m.subtipo, m.horas_meta])), [resumo]);

  const nomesSubdivisao = useMemo(() => {
    const set = new Set((Array.isArray(subtiposCatalogo) ? subtiposCatalogo : []).map((s) => s.nome));
    for (const s of resumo?.subdivisoes || []) set.add(s.subtipo);
    for (const m of resumo?.metas || []) set.add(m.subtipo);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [subtiposCatalogo, resumo]);

  async function salvarMeta(subtipo) {
    const valor = String(metasForm[subtipo] ?? "").trim();
    if (!valor) return;
    try {
      setSalvando(subtipo); setErro(""); setAviso("");
      await apiFetch("/mpt/metas", { method: "PUT", body: JSON.stringify({ subtipo, horas_meta: valor }) });
      setAviso(`Meta de "${subtipo}" salva.`);
      setMetasForm((p) => { const n = { ...p }; delete n[subtipo]; return n; });
      await carregar();
      if (foco && foco.subtipo === subtipo) await abrirPessoas(foco);
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a meta.");
    } finally {
      setSalvando("");
    }
  }

  async function removerMeta(subtipo) {
    if (!window.confirm(`Remover a meta interna de "${subtipo}"? A subdivisão volta a ficar com "meta não definida".`)) return;
    try {
      setSalvando(subtipo); setErro(""); setAviso("");
      await apiFetch(`/mpt/metas?subtipo=${encodeURIComponent(subtipo)}`, { method: "DELETE" });
      setAviso(`Meta de "${subtipo}" removida.`);
      await carregar();
      if (foco && foco.subtipo === subtipo) await abrirPessoas(foco);
    } catch (e) {
      setErro(e.message || "Não foi possível remover a meta.");
    } finally {
      setSalvando("");
    }
  }

  async function abrirPessoas(f) {
    setFoco(f);
    setPessoas(null);
    setAberta("");
    try {
      const q = new URLSearchParams(qsPeriodo);
      q.set("subtipo", f.subtipo);
      if (f.cliente) q.set("cliente", f.cliente);
      if (f.situacao) q.set("situacao", f.situacao);
      const r = await apiFetch(`/mpt/pessoas?${q.toString()}`);
      setPessoas(r);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as pessoas.");
      setPessoas({ pessoas: [], total: 0 });
    }
  }

  const parcial = Boolean(resumo?.periodo) && !resumo.periodo.completo;
  const subdivisoes = resumo?.subdivisoes || [];

  async function baixarDossie(subtipo) {
    try {
      setBaixando(subtipo || "__todas");
      setErro("");
      const q = new URLSearchParams(qsPeriodo);
      if (subtipo) q.set("subtipo", subtipo);
      await apiDownload(`/mpt/dossie?${q.toString()}`, "dossie-mpt.xlsx");
    } catch (e) {
      setErro(e.message || "Não foi possível gerar o dossiê.");
    } finally {
      setBaixando("");
    }
  }
  // Páginas de impressão (abrem em outra aba; "Imprimir / Salvar como PDF" no navegador).
  const urlImpressao = (tipo, extra = {}) => {
    const q = new URLSearchParams(qsPeriodo);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/mapa-desenvolvimento/mpt/${tipo}?${q.toString()}`;
  };
  const avisos = resumo?.avisos || {};
  const temAviso = ["encontros_sem_subdivisao", "turmas_sem_cronograma", "presencas_sem_vinculo", "cargas_estimadas", "pessoas_sem_cadastro"].some((k) => avisos[k] > 0);

  return (
    <>
      <SectionCard
        title="Comprovação MPT por subdivisão"
        subtitle={`Horas de desenvolvimento por pessoa em ${rotuloPeriodo}, somando encontros de jornada e aulas de turma com subtipo. A meta é interna, definida pela Metodologia — não é exigência legal.`}
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "flex", gap: 6, alignItems: "center" }}>
              Período
              <select aria-label="Tipo de período" value={modo} onChange={(e) => { setModo(e.target.value); setFoco(null); setPessoas(null); }} style={{ ...compactInputStyle(), width: 150 }}>
                <option value="ano">Ano-calendário</option>
                <option value="intervalo">Intervalo de datas</option>
              </select>
            </label>
            {modo === "ano" ? (
              <select aria-label="Ano" value={ano} onChange={(e) => { setAno(Number(e.target.value)); setFoco(null); setPessoas(null); }} style={{ ...compactInputStyle(), width: 100 }}>
                {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <>
                <input aria-label="Data inicial" type="date" value={de} onChange={(e) => { setDe(e.target.value); setFoco(null); setPessoas(null); }} style={{ ...compactInputStyle(), width: 150 }} />
                <span style={{ fontSize: 12, color: "#334155" }}>até</span>
                <input aria-label="Data final" type="date" value={ate} onChange={(e) => { setAte(e.target.value); setFoco(null); setPessoas(null); }} style={{ ...compactInputStyle(), width: 150 }} />
              </>
            )}
          </div>
        }
      >
        {erro && <div style={alerta(true)}>{erro}</div>}
        {aviso && <div style={alerta(false)}>{aviso}</div>}
        {!periodoOk && <div style={alerta(true)}>Informe a data inicial e a data final (a final não pode ser anterior à inicial).</div>}
        {parcial && (
          <div style={{ ...alerta(false), background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
            Período parcial: as horas abaixo são só do intervalo escolhido. A meta é anual, então ela aparece apenas como referência e não há farol nem "atingiu / abaixo". Para a leitura da meta, use o ano-calendário.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
          <button type="button" style={buttonSecondaryStyle()} disabled={!periodoOk || baixando === "__todas"} onClick={() => baixarDossie("")}>
            {baixando === "__todas" ? "Gerando..." : "⬇ Dossiê em Excel (todas as subdivisões)"}
          </button>
          <a href={periodoOk ? urlImpressao("dossie") : undefined} target="_blank" rel="noreferrer" style={{ ...linkBotao, opacity: periodoOk ? 1 : 0.5, pointerEvents: periodoOk ? "auto" : "none" }}>
            🖨 Dossiê para imprimir / PDF (todas)
          </a>
        </div>

        <div style={{ fontSize: 12.5, color: colors.textSecondary, lineHeight: 1.5 }}>
          Como a conta funciona: conta só quem esteve <strong>presente</strong> (justificado não soma hora). No mesmo dia e na mesma subdivisão, a hora conta <strong>uma vez só</strong> (vale a maior carga), para nunca superestimar a evidência. O universo é quem está inscrito nas jornadas ou turmas da subdivisão, mesmo com zero hora.
        </div>
      </SectionCard>

      <SectionCard title="Metas internas de horas por pessoa" subtitle="Defina quantas horas por pessoa no ano cada subdivisão pede. O farol só acende depois que a meta existe.">
        <div style={{ display: "grid", gap: 8 }}>
          {nomesSubdivisao.length === 0 && <div style={vazio}>Nenhuma subdivisão cadastrada. O catálogo fica na tela Subtipos.</div>}
          {nomesSubdivisao.map((nome) => {
            const atual = metasPorSubtipo.get(nome);
            const digitado = metasForm[nome];
            return (
              <div key={nome} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", border: `1px solid ${colors.border}`, borderRadius: 12, padding: "8px 12px", background: "#fff" }}>
                <strong style={{ flex: "1 1 240px", fontSize: 13.5, color: colors.textPrimary }}>{nome}</strong>
                <span style={{ fontSize: 12.5, color: colors.textSecondary, minWidth: 150 }}>
                  {atual !== undefined ? <>Meta atual: <strong>{dec(atual)} h</strong> por pessoa</> : "Meta não definida"}
                </span>
                <input
                  aria-label={`Meta de horas para ${nome}`}
                  inputMode="decimal"
                  placeholder="Horas por pessoa"
                  value={digitado ?? ""}
                  onChange={(e) => setMetasForm((p) => ({ ...p, [nome]: e.target.value }))}
                  style={{ ...compactInputStyle(), width: 150 }}
                />
                <button type="button" style={buttonPrimaryStyle(salvando === nome || !String(digitado ?? "").trim())} disabled={salvando === nome || !String(digitado ?? "").trim()} onClick={() => salvarMeta(nome)}>
                  {atual !== undefined ? "Atualizar meta" : "Definir meta"}
                </button>
                {atual !== undefined && (
                  <button type="button" style={buttonDangerStyle()} disabled={salvando === nome} onClick={() => removerMeta(nome)}>
                    Remover
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Cobertura por subdivisão e operação" subtitle="Quantas pessoas já atingiram a meta de horas em cada subdivisão. Clique em um número para ver quem é.">
        {carregando && !resumo ? (
          <div style={vazio}>Carregando...</div>
        ) : subdivisoes.length === 0 ? (
          <div style={vazio}>
            Ainda não há horas por subdivisão em {rotuloPeriodo}. Para começar: escolha a <strong>subdivisão padrão</strong> na jornada (aba Jornadas) ou em cada encontro, e use o campo <strong>Subdivisão</strong> nas turmas. As turmas com subtipo e chamada lançada já entram sozinhas.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {subdivisoes.map((s) => {
              const f = parcial ? { icone: "•", texto: "Período parcial", cor: colors.neutral, bg: colors.neutralLight } : FAROL[s.farol] || FAROL.cinza;
              return (
                <div key={s.subtipo} style={{ border: `1px solid ${colors.border}`, borderRadius: 14, background: "#fff", padding: "12px 16px", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div>
                      <strong style={{ fontSize: 15, color: colors.textPrimary }}>{s.subtipo}</strong>
                      <span style={{ fontSize: 12.5, color: colors.textSecondary, marginLeft: 10 }}>
                        {s.metas_diferentes ? "metas diferentes entre ambientes" : s.meta_horas !== null ? `meta ${parcial ? "anual (referência)" : "interna"}: ${dec(s.meta_horas)} h por pessoa` : "meta não definida"}
                      </span>
                    </div>
                    <Pill info={f} />
                  </div>

                  <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                    <Numero valor={s.pessoas} rotulo="pessoas no universo" onClick={() => abrirPessoas({ subtipo: s.subtipo })} />
                    {!parcial && (
                      <>
                        <Numero valor={s.atingiram} rotulo="atingiram a meta" cor={colors.successText} onClick={() => abrirPessoas({ subtipo: s.subtipo, situacao: "atingiu" })} />
                        <Numero valor={s.abaixo} rotulo="abaixo da meta" cor={s.abaixo ? colors.warningText : undefined} onClick={() => abrirPessoas({ subtipo: s.subtipo, situacao: "abaixo" })} />
                        <Numero valor={s.sem_hora} rotulo="sem nenhuma hora" cor={s.sem_hora ? colors.dangerText : undefined} onClick={() => abrirPessoas({ subtipo: s.subtipo, situacao: "sem_hora" })} />
                        <Numero valor={s.pct === null ? "—" : `${s.pct}%`} rotulo="atingiram (cobertura)" cor={f.cor} />
                      </>
                    )}
                  </div>

                  <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    Horas contadas {modo === "ano" ? "no ano" : "no período"}: <strong>{dec(s.horas_jornada)} h</strong> em jornadas · <strong>{dec(s.horas_turma)} h</strong> em turmas
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" style={buttonSecondaryStyle()} disabled={baixando === s.subtipo} onClick={() => baixarDossie(s.subtipo)}>
                      {baixando === s.subtipo ? "Gerando..." : "⬇ Dossiê em Excel"}
                    </button>
                    <a href={urlImpressao("dossie", { subtipo: s.subtipo })} target="_blank" rel="noreferrer" style={linkBotao}>🖨 Dossiê para imprimir / PDF</a>
                    <a href={urlImpressao("extrato", { subtipo: s.subtipo, lote: "1" })} target="_blank" rel="noreferrer" style={linkBotao}>🖨 Extratos individuais (todas as pessoas)</a>
                  </div>

                  {s.por_cliente.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={tabela}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: "left" }}>Operação</th>
                            <th style={th}>Pessoas</th>
                            {!parcial && <th style={th}>Atingiram</th>}
                            {!parcial && <th style={th}>Abaixo</th>}
                            {!parcial && <th style={th}>Sem hora</th>}
                            {!parcial && <th style={th}>Situação</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {s.por_cliente.map((c) => (
                            <tr key={c.cliente}>
                              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                                <button type="button" style={linkBtn} onClick={() => abrirPessoas({ subtipo: s.subtipo, cliente: c.cliente })}>{c.cliente}</button>
                              </td>
                              <td style={td}>{fmt(c.pessoas)}</td>
                              {!parcial && <td style={td}>{fmt(c.atingiram)}</td>}
                              {!parcial && <td style={td}>{fmt(c.abaixo)}</td>}
                              {!parcial && <td style={td}>{fmt(c.sem_hora)}</td>}
                              {!parcial && <td style={td}><Pill info={FAROL[c.farol] || FAROL.cinza} />{c.pct !== null ? <span style={{ marginLeft: 6, fontSize: 12, color: colors.textSecondary }}>{c.pct}%</span> : null}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {temAviso && (
        <SectionCard title="Pontos de atenção nos dados" subtitle="O que ficou fora da conta ou foi estimado, para você corrigir na origem.">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, color: colors.textPrimary }}>
            {avisos.encontros_sem_subdivisao > 0 && <li><strong>{fmt(avisos.encontros_sem_subdivisao)}</strong> encontro(s) de {rotuloPeriodo} ficaram de fora porque não têm subdivisão (nem no encontro, nem na jornada). Defina a subdivisão padrão da jornada.</li>}
            {avisos.turmas_sem_cronograma > 0 && <li><strong>{fmt(avisos.turmas_sem_cronograma)}</strong> turma(s) com subtipo não têm cronograma de aulas e não entram na conta. Gere o cronograma e lance a chamada.</li>}
            {avisos.presencas_sem_vinculo > 0 && <li><strong>{fmt(avisos.presencas_sem_vinculo)}</strong> presença(s) de turma estão com um nome que não está na lista de treinandos da turma e não foram contadas.</li>}
            {avisos.cargas_estimadas > 0 && <li><strong>{fmt(avisos.cargas_estimadas)}</strong> presença(s) de turma usaram carga estimada (a aula não tem carga real nem planejada; foi usada a carga da turma dividida pelas aulas).</li>}
            {avisos.pessoas_sem_cadastro > 0 && <li><strong>{fmt(avisos.pessoas_sem_cadastro)}</strong> pessoa(s) entraram só pelo nome, sem matrícula ou CPF ligados ao cadastro único. O mesmo nome em jornada e turma pode ser contado como duas pessoas.</li>}
          </ul>
        </SectionCard>
      )}

      {foco && (
        <SectionCard
          title={`Pessoas — ${foco.subtipo}`}
          subtitle={[foco.cliente ? `Operação: ${foco.cliente}` : null, foco.situacao ? `Situação: ${SITUACAO[foco.situacao]?.texto}` : null, `Período ${rotuloPeriodo}`].filter(Boolean).join(" · ")}
          action={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={urlImpressao("extrato", { subtipo: foco.subtipo, lote: "1", cliente: foco.cliente, situacao: foco.situacao })} target="_blank" rel="noreferrer" style={linkBotao}>🖨 Extratos deste recorte</a>
              <button type="button" style={buttonSecondaryStyle()} onClick={() => { setFoco(null); setPessoas(null); }}>Fechar</button>
            </div>
          }
        >
          {!pessoas ? (
            <div style={vazio}>Carregando...</div>
          ) : pessoas.pessoas.length === 0 ? (
            <div style={vazio}>Nenhuma pessoa nesse recorte.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Pessoa</th>
                    <th style={th}>Matrícula</th>
                    <th style={{ ...th, textAlign: "left" }}>Operação</th>
                    <th style={th}>Horas / meta</th>
                    <th style={th}>Situação</th>
                    <th style={th}>Evidência</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.pessoas.map((p) => {
                    const sit = SITUACAO[p.situacao] || SITUACAO.sem_meta;
                    const abertaAqui = aberta === p.chave;
                    return (
                      <FragmentoPessoa key={p.chave} p={p} sit={parcial ? { icone: "•", texto: "Período parcial", cor: colors.neutral, bg: colors.neutralLight } : sit} aberta={abertaAqui} onToggle={() => setAberta(abertaAqui ? "" : p.chave)} urlExtrato={urlImpressao("extrato", { subtipo: p.subtipo, chave: p.chave })} />
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>{fmt(pessoas.total)} pessoa(s). O CPF não é exibido.</div>
            </div>
          )}
        </SectionCard>
      )}
    </>
  );
}

function FragmentoPessoa({ p, sit, aberta, onToggle, urlExtrato }) {
  return (
    <>
      <tr>
        <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
          {p.nome}
          {!p.vinculada && <span title="Entrou só pelo nome: sem matrícula ou CPF ligados ao cadastro único" style={{ marginLeft: 6, fontSize: 11, color: colors.warningText }}>sem cadastro</span>}
        </td>
        <td style={td}>{p.matricula || "—"}</td>
        <td style={{ ...td, textAlign: "left" }}>{p.cliente}</td>
        <td style={td}>{dec(p.horas)} h{p.meta !== null ? ` / ${dec(p.meta)} h` : p.meta_anual ? ` (meta anual ${dec(p.meta_anual)} h)` : ""}</td>
        <td style={td}><Pill info={sit} /></td>
        <td style={td}>
          <button type="button" style={linkBtn} onClick={onToggle} aria-expanded={aberta}>
            {aberta ? "Ocultar" : p.evidencias.length ? `Ver ${p.evidencias.length} registro(s)` : "Sem registros"}
          </button>
          {" · "}
          <a href={urlExtrato} target="_blank" rel="noreferrer" style={{ ...linkBtn, textDecoration: "underline" }}>Extrato</a>
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={6} style={{ ...td, background: "#f8fafc", textAlign: "left" }}>
            {p.evidencias.length === 0 ? (
              <span style={{ fontSize: 12.5, color: colors.textSecondary }}>Nenhuma presença registrada nessa subdivisão no período.</span>
            ) : (
              <table style={{ ...tabela, background: "#fff" }}>
                <thead>
                  <tr>
                    <th style={th}>Data</th>
                    <th style={th}>Fonte</th>
                    <th style={{ ...th, textAlign: "left" }}>Registro</th>
                    <th style={th}>Horas</th>
                    <th style={th}>Conta?</th>
                  </tr>
                </thead>
                <tbody>
                  {p.evidencias.map((ev, i) => (
                    <tr key={`${ev.fonte}-${ev.origem_id}-${i}`} style={{ opacity: ev.contada ? 1 : 0.6 }}>
                      <td style={td}>{dataBR(ev.data)}</td>
                      <td style={td}>{ev.fonte === "turma" ? "Turma" : "Jornada"}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        <strong>{ev.titulo}</strong>
                        <span style={{ color: colors.textSecondary }}> · {ev.contexto}</span>
                      </td>
                      <td style={td}>{dec(ev.horas)} h{ev.estimada ? " (estimada)" : ""}</td>
                      <td style={td} title={ev.motivo_nao_contada || ""}>{ev.contada ? "Sim" : "Não — mesmo dia"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Numero({ valor, rotulo, cor, onClick }) {
  const corpo = (
    <>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary, lineHeight: 1.1 }}>{typeof valor === "number" ? fmt(valor) : valor}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{rotulo}</div>
    </>
  );
  if (!onClick) return <div style={{ minWidth: 110 }}>{corpo}</div>;
  return (
    <button type="button" onClick={onClick} style={{ minWidth: 110, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }} title="Ver as pessoas">
      {corpo}
    </button>
  );
}

const alerta = (erro) => ({
  margin: "0 0 12px",
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 12.5,
  fontWeight: 700,
  background: erro ? "#fef2f2" : "#ecfdf5",
  border: `1px solid ${erro ? "#fecaca" : "#a7f3d0"}`,
  color: erro ? "#991b1b" : "#047857",
});
const vazio = { borderRadius: 14, border: `1px dashed ${colors.border}`, padding: "16px 18px", fontSize: 13.5, color: colors.textSecondary, background: "#fff" };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { padding: "7px 8px", fontSize: 11.5, fontWeight: 800, color: "#334155", textAlign: "center", borderBottom: `1px solid ${colors.border}`, background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "7px 8px", textAlign: "center", borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const linkBotao = { display: "inline-block", padding: "8px 14px", borderRadius: 10, border: `1px solid ${colors.border}`, background: "#fff", color: colors.primary, fontWeight: 800, fontSize: 12.5, textDecoration: "none" };
const linkBtn = { background: "none", border: "none", padding: 0, color: colors.primary, fontWeight: 800, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" };
