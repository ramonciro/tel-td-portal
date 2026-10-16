"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import CelulaBabyCurva from "../../../components/CelulaBabyCurva";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";

// Célula baby — detalhe (16/10/2026). Fluxo, na ordem das abas:
//   1 Resultado da avaliação  → instrutor marca quem passou / em berço / não seguiu
//   2 Início e indicadores    → data de início na operação + indicadores livres (meta opcional)
//   3 Lançamento diário       → grade pessoa × D1..D7, uma aba por indicador
//   4 Curva de aprendizagem   → realizado por pessoa e média da turma
//   5 Encerramento            → parecer por pessoa + relatório final
// Só quem passou entra nos passos 3 a 5. D1..D7 são 7 dias de OPERAÇÃO em
// sequência, não dias do calendário.

const RESULTADOS = [
  { id: "passou", label: "Passou", cor: colors.successText, bg: colors.successLight },
  { id: "em_berco", label: "Em berço", cor: colors.warningText, bg: colors.warningLight },
  { id: "nao_seguiu", label: "Não seguiu", cor: colors.dangerText, bg: colors.dangerLight },
];
const PARECERES = [
  { id: "atingiu", label: "Atingiu a curva" },
  { id: "parcial", label: "Parcial" },
  { id: "abaixo", label: "Abaixo da curva" },
];
const ROTULO_STATUS = { a_configurar: "A configurar", em_andamento: "Em andamento", encerrada: "Encerrada" };

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// cor da célula de lançamento contra a meta de referência (quando existe)
function corContraMeta(valor, ind) {
  if (valor === null || valor === undefined || ind.meta === null || ind.meta === undefined) return null;
  const meta = Number(ind.meta);
  const maior = ind.sentido !== "menor";
  const ok = maior ? valor >= meta : valor <= meta;
  if (ok) return { bg: colors.successLight, cor: colors.successText };
  const tol = Math.abs(meta) * 0.1;
  const perto = maior ? valor >= meta - tol : valor <= meta + tol;
  return perto ? { bg: "#fef3c7", cor: "#92400e" } : { bg: colors.dangerLight, cor: colors.dangerText };
}

export default function CelulaBabyDetalhe() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aba, setAba] = useState(null);
  const [indAtivo, setIndAtivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/celulas-baby/${id}`);
      setD(r);
      setErro("");
      setAba((atual) => atual || (r.celula.status === "a_configurar" ? "resultado" : r.celula.status === "encerrada" ? "curva" : "lancamento"));
      setIndAtivo((atual) => (atual && r.indicadores.some((i) => i.id === atual) ? atual : r.indicadores[0]?.id || null));
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a célula.");
    }
  }, [id]);

  useEffect(() => { if (id) carregar(); }, [id, carregar]);

  async function acao(fn, ok) {
    setOcupado(true); setErro(""); setAviso("");
    try {
      const r = await fn();
      if (ok) setAviso(ok);
      await carregar();
      return r;
    } catch (e) {
      setErro(e.message || "Não foi possível concluir a ação.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const c = d?.celula;
  const podeEditar = !!d?.permissoes?.editar && c?.status !== "encerrada";
  const passaram = useMemo(() => (d?.pessoas || []).filter((p) => p.resultado === "passou"), [d]);

  const valorDe = useCallback(
    (indicadorId) => (pessoaId, dia) => {
      const l = (d?.lancamentos || []).find((x) => x.indicador_id === indicadorId && x.pessoa_row_id === pessoaId && x.dia === dia);
      return l ? l.valor : null;
    },
    [d]
  );

  if (!d) {
    return (
      <PortalShell>
        <div style={{ padding: "48px 16px", textAlign: "center", color: colors.textMuted }}>
          {erro || "Carregando célula…"}
        </div>
      </PortalShell>
    );
  }

  const dias = d.dias || 7;
  const abas = [
    { id: "resultado", label: "1 · Resultado da avaliação" },
    { id: "indicadores", label: "2 · Início e indicadores" },
    { id: "lancamento", label: "3 · Lançamento diário" },
    { id: "curva", label: "4 · Curva de aprendizagem" },
    { id: "encerramento", label: "5 · Encerramento" },
  ];

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16, padding: "4px 0 48px" }}>
        <PageHero
          eyebrow={`Célula baby · ${ROTULO_STATUS[c.status] || c.status}`}
          title={c.turma_nome || "Célula baby"}
          subtitle={`${c.cliente || "Sem cliente"} · Instrutor: ${c.instrutor || "—"}${c.data_inicio_operacao ? ` · Início na operação: ${c.data_inicio_operacao.split("-").reverse().join("/")}` : ""}`}
          stats={[
            { label: "Passaram", value: passaram.length },
            { label: "Em berço", value: d.pessoas.filter((p) => p.resultado === "em_berco").length },
            { label: "Não seguiram", value: d.pessoas.filter((p) => p.resultado === "nao_seguiu").length },
            { label: "Sem resultado", value: d.pessoas.filter((p) => !p.resultado).length },
          ]}
          actions={
            <>
              <button type="button" style={btnHero} onClick={() => apiDownload(`/celulas-baby/${id}/exportar`, `celula-baby-${id}.xlsx`).catch((e) => setErro(e.message))}>Excel</button>
              <button type="button" style={btnHero} onClick={() => window.open(`/celulas-baby/${id}/relatorio`, "_blank")}>Relatório</button>
            </>
          }
        />

        {erro && <div style={alertaErro} role="alert">{erro}</div>}
        {aviso && <div style={alertaOk} role="status">{aviso}</div>}
        {!d.permissoes.editar && <div style={alertaInfo}>Você pode consultar esta célula, mas só o instrutor da turma (ou a coordenação) altera.</div>}
        {c.atrasada && <div style={alertaErro}>Esta célula passou do prazo de 7 dias de operação sem ser encerrada.</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Etapas da célula">
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              style={{ ...chip, ...(aba === a.id ? chipAtivo : null) }}>{a.label}</button>
          ))}
        </div>

        {aba === "resultado" && (
          <SectionCard title="Resultado da avaliação técnica" subtitle="Defina quem passou, quem ficou em berço e quem não seguiu no processo seletivo. Só quem passou entra no acompanhamento.">
            <div style={{ display: "grid", gap: 8 }}>
              {d.pessoas.map((p) => (
                <div key={p.id} style={linhaPessoa}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.nome}</strong>
                    {p.matricula && <span style={{ color: colors.textMuted, marginLeft: 8, fontSize: 12 }}>mat. {p.matricula}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RESULTADOS.map((r) => {
                      const ativo = p.resultado === r.id;
                      return (
                        <button key={r.id} type="button" disabled={!podeEditar || ocupado} aria-pressed={ativo}
                          onClick={() => acao(() => apiFetch(`/celulas-baby/${id}/pessoas/${p.id}`, { method: "PUT", body: JSON.stringify({ resultado: ativo ? null : r.id }) }))}
                          style={{ ...segmento, ...(ativo ? { background: r.bg, color: r.cor, borderColor: r.cor } : null), opacity: podeEditar ? 1 : 0.6 }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {podeEditar && c.status === "a_configurar" && (
              <p style={dica}>Depois de marcar os resultados, vá para “2 · Início e indicadores” para informar a data de início na operação e iniciar o acompanhamento.</p>
            )}
          </SectionCard>
        )}

        {aba === "indicadores" && (
          <ConfigIndicadores d={d} id={id} podeEditar={podeEditar} ocupado={ocupado} acao={acao} />
        )}

        {aba === "lancamento" && (
          <Lancamento d={d} id={id} podeEditar={podeEditar && c.status === "em_andamento"} indAtivo={indAtivo} setIndAtivo={setIndAtivo}
            passaram={passaram} dias={dias} recarregar={carregar} setErro={setErro} />
        )}

        {aba === "curva" && (
          <SectionCard title="Curva de aprendizagem" subtitle="Realizado por pessoa em cada dia de operação. A linha grossa é a média da turma; clique no nome para ocultar uma pessoa.">
            {d.indicadores.length === 0 ? (
              <p style={dica}>Cadastre os indicadores em “2 · Início e indicadores” para ver a curva.</p>
            ) : passaram.length === 0 ? (
              <p style={dica}>Ninguém foi marcado como “Passou” ainda.</p>
            ) : (
              <>
                <PillsIndicadores d={d} indAtivo={indAtivo} setIndAtivo={setIndAtivo} />
                {(() => {
                  const ind = d.indicadores.find((i) => i.id === indAtivo) || d.indicadores[0];
                  return (
                    <CelulaBabyCurva key={ind.id} pessoas={passaram} dias={dias} valorDe={valorDe(ind.id)} meta={ind.meta} unidade={ind.unidade || ""} />
                  );
                })()}
              </>
            )}
          </SectionCard>
        )}

        {aba === "encerramento" && (
          <Encerramento d={d} id={id} podeEditar={podeEditar} gestao={d.permissoes.gestao} ocupado={ocupado} acao={acao} passaram={passaram} setErro={setErro} />
        )}
      </div>
    </PortalShell>
  );
}

function PillsIndicadores({ d, indAtivo, setIndAtivo }) {
  if (d.indicadores.length < 2) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {d.indicadores.map((i) => (
        <button key={i.id} type="button" onClick={() => setIndAtivo(i.id)} aria-pressed={indAtivo === i.id}
          style={{ ...chip, ...(indAtivo === i.id ? chipAtivo : null), padding: "6px 12px" }}>
          {i.nome}{i.unidade ? ` (${i.unidade})` : ""}
        </button>
      ))}
    </div>
  );
}

/* ───────────── aba 2: início e indicadores ───────────── */

function ConfigIndicadores({ d, id, podeEditar, ocupado, acao }) {
  const c = d.celula;
  const [data, setData] = useState(c.data_inicio_operacao || "");
  const [novo, setNovo] = useState({ nome: "", unidade: "", sentido: "maior", meta: "" });
  const [instrutor, setInstrutor] = useState(c.instrutor || "");
  useEffect(() => setData(c.data_inicio_operacao || ""), [c.data_inicio_operacao]);
  useEffect(() => setInstrutor(c.instrutor || ""), [c.instrutor]);

  const passaram = d.pessoas.filter((p) => p.resultado === "passou").length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard title="Início na operação" subtitle="Dia em que os aprovados saíram da avaliação técnica e foram para a operação (D1).">
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <label style={rotulo}>
            Data de início
            <input type="date" value={data} disabled={!podeEditar} onChange={(e) => setData(e.target.value)} style={campo} />
          </label>
          {podeEditar && (
            <button type="button" style={btnSec} disabled={ocupado}
              onClick={() => acao(() => apiFetch(`/celulas-baby/${id}`, { method: "PUT", body: JSON.stringify({ data_inicio_operacao: data || null }) }), "Data salva.")}>
              Salvar data
            </button>
          )}
        </div>
        {d.permissoes.gestao && (
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 14 }}>
            <label style={{ ...rotulo, flex: "1 1 240px" }}>
              Instrutor responsável (nome igual ao do login do instrutor)
              <input value={instrutor} onChange={(e) => setInstrutor(e.target.value)} style={campo} maxLength={150} />
            </label>
            <button type="button" style={btnSec} disabled={ocupado || instrutor.trim() === (c.instrutor || "")}
              onClick={() => acao(() => apiFetch(`/celulas-baby/${id}`, { method: "PUT", body: JSON.stringify({ instrutor }) }), "Instrutor atualizado.")}>
              Salvar instrutor
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Indicadores"
        subtitle="Você define os indicadores desta operação (TMA, qualidade, produtividade, aderência…). A meta de referência é opcional: com meta, a célula de lançamento ganha cor."
        action={podeEditar ? (
          <button type="button" style={btnSec} disabled={ocupado}
            onClick={() => acao(() => apiFetch(`/celulas-baby/${id}/indicadores/copiar`, { method: "POST" }), "Indicadores copiados da última célula deste cliente.")}>
            Copiar da última célula do cliente
          </button>
        ) : null}
      >
        {d.indicadores.length === 0 && <p style={dica}>Nenhum indicador ainda.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {d.indicadores.map((i) => (
            <IndicadorLinha key={i.id} ind={i} id={id} podeEditar={podeEditar} ocupado={ocupado} acao={acao} />
          ))}
        </div>

        {podeEditar && (
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}
            onSubmit={(e) => {
              e.preventDefault();
              acao(() => apiFetch(`/celulas-baby/${id}/indicadores`, { method: "POST", body: JSON.stringify(novo) }), "Indicador adicionado.")
                .then((r) => r && setNovo({ nome: "", unidade: "", sentido: "maior", meta: "" }));
            }}
          >
            <label style={{ ...rotulo, flex: "2 1 180px" }}>Novo indicador
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: TMA" style={campo} maxLength={120} />
            </label>
            <label style={{ ...rotulo, flex: "0 1 90px" }}>Unidade
              <input value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} placeholder="seg, %" style={campo} maxLength={30} />
            </label>
            <label style={{ ...rotulo, flex: "0 1 150px" }}>Melhor quando
              <select value={novo.sentido} onChange={(e) => setNovo({ ...novo, sentido: e.target.value })} style={campo}>
                <option value="maior">Maior é melhor</option>
                <option value="menor">Menor é melhor</option>
              </select>
            </label>
            <label style={{ ...rotulo, flex: "0 1 110px" }}>Meta (opcional)
              <input value={novo.meta} onChange={(e) => setNovo({ ...novo, meta: e.target.value })} inputMode="decimal" placeholder="—" style={campo} />
            </label>
            <button type="submit" style={btnPrim} disabled={ocupado || !novo.nome.trim()}>Adicionar</button>
          </form>
        )}
      </SectionCard>

      {podeEditar && c.status === "a_configurar" && (
        <SectionCard title="Iniciar acompanhamento">
          <p style={{ ...dica, marginTop: 0 }}>
            {passaram} pessoa(s) marcada(s) como “Passou” · {d.indicadores.length} indicador(es) · início {c.data_inicio_operacao ? c.data_inicio_operacao.split("-").reverse().join("/") : "não informado"}.
            Os indicadores podem ser ajustados depois de iniciar.
          </p>
          <button type="button" style={btnPrim} disabled={ocupado}
            onClick={() => acao(() => apiFetch(`/celulas-baby/${id}/iniciar`, { method: "POST" }), "Acompanhamento iniciado. Já dá para lançar o D1.")}>
            Iniciar acompanhamento
          </button>
        </SectionCard>
      )}
    </div>
  );
}

function IndicadorLinha({ ind, id, podeEditar, ocupado, acao }) {
  const [f, setF] = useState({ nome: ind.nome, unidade: ind.unidade || "", sentido: ind.sentido, meta: ind.meta ?? "" });
  useEffect(() => setF({ nome: ind.nome, unidade: ind.unidade || "", sentido: ind.sentido, meta: ind.meta ?? "" }), [ind]);
  const mudou = f.nome !== ind.nome || (f.unidade || "") !== (ind.unidade || "") || f.sentido !== ind.sentido || String(f.meta) !== String(ind.meta ?? "");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: 10, background: "#f8fafc", borderRadius: radius.md }}>
      <label style={{ ...rotulo, flex: "2 1 160px" }}>Nome
        <input value={f.nome} disabled={!podeEditar} onChange={(e) => setF({ ...f, nome: e.target.value })} style={campo} maxLength={120} />
      </label>
      <label style={{ ...rotulo, flex: "0 1 90px" }}>Unidade
        <input value={f.unidade} disabled={!podeEditar} onChange={(e) => setF({ ...f, unidade: e.target.value })} style={campo} maxLength={30} />
      </label>
      <label style={{ ...rotulo, flex: "0 1 150px" }}>Melhor quando
        <select value={f.sentido} disabled={!podeEditar} onChange={(e) => setF({ ...f, sentido: e.target.value })} style={campo}>
          <option value="maior">Maior é melhor</option>
          <option value="menor">Menor é melhor</option>
        </select>
      </label>
      <label style={{ ...rotulo, flex: "0 1 110px" }}>Meta
        <input value={f.meta} disabled={!podeEditar} onChange={(e) => setF({ ...f, meta: e.target.value })} inputMode="decimal" placeholder="—" style={campo} />
      </label>
      {podeEditar && (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={btnSec} disabled={ocupado || !mudou}
            onClick={() => acao(() => apiFetch(`/celulas-baby/${id}/indicadores/${ind.id}`, { method: "PUT", body: JSON.stringify(f) }), "Indicador salvo.")}>Salvar</button>
          <button type="button" style={btnPerigo} disabled={ocupado}
            onClick={() => { if (window.confirm(`Excluir o indicador “${ind.nome}” e todos os lançamentos dele?`)) acao(() => apiFetch(`/celulas-baby/${id}/indicadores/${ind.id}`, { method: "DELETE" }), "Indicador excluído."); }}>Excluir</button>
        </div>
      )}
    </div>
  );
}

/* ───────────── aba 3: lançamento diário ───────────── */

function Lancamento({ d, id, podeEditar, indAtivo, setIndAtivo, passaram, dias, recarregar, setErro }) {
  const ind = d.indicadores.find((i) => i.id === indAtivo) || d.indicadores[0];
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState("");
  const salvo = useRef({});

  useEffect(() => { setRascunho({}); }, [d.lancamentos, ind?.id]);

  if (d.celula.status === "a_configurar") {
    return <SectionCard title="Lançamento diário"><p style={dica}>Inicie o acompanhamento em “2 · Início e indicadores” para lançar os dias.</p></SectionCard>;
  }
  if (!ind) return <SectionCard title="Lançamento diário"><p style={dica}>Cadastre ao menos um indicador em “2 · Início e indicadores”.</p></SectionCard>;
  if (!passaram.length) return <SectionCard title="Lançamento diário"><p style={dica}>Ninguém foi marcado como “Passou”.</p></SectionCard>;

  const valorSalvo = (pessoaId, dia) => {
    const l = d.lancamentos.find((x) => x.indicador_id === ind.id && x.pessoa_row_id === pessoaId && x.dia === dia);
    return l ? l.valor : null;
  };
  const chaveCel = (pessoaId, dia) => `${ind.id}:${pessoaId}:${dia}`;

  async function gravar(pessoaId, dia) {
    const k = chaveCel(pessoaId, dia);
    if (!(k in rascunho)) return;
    const texto = String(rascunho[k]).trim();
    const atual = valorSalvo(pessoaId, dia);
    if ((texto === "" && atual === null) || (texto !== "" && Number(texto.replace(",", ".")) === atual)) {
      setRascunho((r) => { const n = { ...r }; delete n[k]; return n; });
      return;
    }
    setSalvando(k);
    try {
      await apiFetch(`/celulas-baby/${id}/lancamentos`, {
        method: "PUT",
        body: JSON.stringify({ itens: [{ indicador_id: ind.id, pessoa_row_id: pessoaId, dia, valor: texto === "" ? null : texto }] }),
      });
      setErro("");
      await recarregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar o lançamento.");
    } finally {
      setSalvando("");
    }
  }

  const media = (pessoaId) => {
    const vs = Array.from({ length: dias }, (_, i) => valorSalvo(pessoaId, i + 1)).filter((v) => v !== null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };

  return (
    <SectionCard
      title="Lançamento diário"
      subtitle={`${ind.nome}${ind.unidade ? ` (${ind.unidade})` : ""} · ${ind.sentido === "menor" ? "menor é melhor" : "maior é melhor"}${ind.meta !== null && ind.meta !== undefined ? ` · meta de referência ${fmt(ind.meta)}` : " · sem meta definida"}. D1 a D7 são dias de operação em sequência.`}
    >
      <PillsIndicadores d={d} indAtivo={ind.id} setIndAtivo={setIndAtivo} />
      <div style={{ overflowX: "auto" }}>
        <table style={tabela}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", minWidth: 180 }}>Pessoa</th>
              {Array.from({ length: dias }, (_, i) => <th key={i} style={th}>D{i + 1}</th>)}
              <th style={th}>Média</th>
            </tr>
          </thead>
          <tbody>
            {passaram.map((p) => (
              <tr key={p.id}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{p.nome}</td>
                {Array.from({ length: dias }, (_, i) => {
                  const dia = i + 1;
                  const k = chaveCel(p.id, dia);
                  const sv = valorSalvo(p.id, dia);
                  const texto = k in rascunho ? rascunho[k] : sv === null ? "" : String(sv).replace(".", ",");
                  const cor = k in rascunho ? null : corContraMeta(sv, ind);
                  return (
                    <td key={dia} style={td}>
                      <input
                        aria-label={`${p.nome}, D${dia}, ${ind.nome}`}
                        value={texto}
                        disabled={!podeEditar}
                        inputMode="decimal"
                        onChange={(e) => setRascunho((r) => ({ ...r, [k]: e.target.value }))}
                        onBlur={() => gravar(p.id, dia)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        style={{ ...celula, ...(cor ? { background: cor.bg, color: cor.cor, borderColor: cor.cor } : null), ...(salvando === k ? { opacity: 0.5 } : null) }}
                      />
                    </td>
                  );
                })}
                <td style={{ ...td, fontWeight: 800 }}>{fmt(media(p.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={dica}>
        {podeEditar ? "Digite o valor e tecle Enter (ou saia do campo) para salvar. Apague o valor para remover o lançamento." : "Somente leitura."}
        {ind.meta !== null && ind.meta !== undefined && " Verde = dentro da meta · amarelo = até 10% fora · vermelho = mais de 10% fora."}
      </p>
    </SectionCard>
  );
}

/* ───────────── aba 5: encerramento ───────────── */

function Encerramento({ d, id, podeEditar, gestao, ocupado, acao, passaram, setErro }) {
  const c = d.celula;
  const [relatorio, setRelatorio] = useState(c.relatorio_final || "");
  const [obs, setObs] = useState({});
  useEffect(() => setRelatorio(c.relatorio_final || ""), [c.relatorio_final]);

  async function encerrar(confirmar) {
    setErro("");
    try {
      await apiFetch(`/celulas-baby/${id}/encerrar`, { method: "POST", body: JSON.stringify({ relatorio_final: relatorio, confirmar }) });
      await acao(async () => ({}), "Célula encerrada.");
    } catch (e) {
      if (/sem parecer/i.test(e.message || "")) {
        if (window.confirm(e.message)) return encerrar(true);
        return;
      }
      setErro(e.message || "Não foi possível encerrar.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard title="Parecer por pessoa" subtitle="Como cada pessoa fechou a curva de aprendizagem nos 7 primeiros dias de operação.">
        {passaram.length === 0 && <p style={dica}>Ninguém foi marcado como “Passou”.</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {passaram.map((p) => (
            <div key={p.id} style={{ ...linhaPessoa, alignItems: "start" }}>
              <strong>{p.nome}</strong>
              <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PARECERES.map((x) => {
                    const ativo = p.parecer === x.id;
                    return (
                      <button key={x.id} type="button" aria-pressed={ativo} disabled={!podeEditar || ocupado}
                        onClick={() => acao(() => apiFetch(`/celulas-baby/${id}/pessoas/${p.id}`, { method: "PUT", body: JSON.stringify({ parecer: ativo ? null : x.id }) }))}
                        style={{ ...segmento, ...(ativo ? { background: colors.primaryLight, color: colors.primary, borderColor: colors.primary } : null) }}>
                        {x.label}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  aria-label={`Observação sobre ${p.nome}`}
                  placeholder="Observação (opcional)"
                  disabled={!podeEditar}
                  value={p.id in obs ? obs[p.id] : p.observacao || ""}
                  onChange={(e) => setObs({ ...obs, [p.id]: e.target.value })}
                  onBlur={() => {
                    if (!(p.id in obs) || obs[p.id] === (p.observacao || "")) return;
                    acao(() => apiFetch(`/celulas-baby/${id}/pessoas/${p.id}`, { method: "PUT", body: JSON.stringify({ observacao: obs[p.id] }) }));
                  }}
                  rows={2} maxLength={1000} style={{ ...campo, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Relatório final" subtitle="Texto do instrutor sobre a turma na operação. Entra no relatório para impressão e no Excel.">
        <textarea
          aria-label="Relatório final"
          value={relatorio}
          disabled={!podeEditar}
          onChange={(e) => setRelatorio(e.target.value)}
          rows={7} maxLength={8000}
          placeholder="Como a turma evoluiu nos indicadores, pontos de atenção, recomendações…"
          style={{ ...campo, width: "100%", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {podeEditar && (
            <button type="button" style={btnSec} disabled={ocupado}
              onClick={() => acao(() => apiFetch(`/celulas-baby/${id}`, { method: "PUT", body: JSON.stringify({ relatorio_final: relatorio }) }), "Relatório salvo.")}>Salvar relatório</button>
          )}
          {podeEditar && c.status === "em_andamento" && (
            <button type="button" style={btnPrim} disabled={ocupado} onClick={() => encerrar(false)}>Encerrar célula</button>
          )}
          {c.status === "encerrada" && gestao && (
            <button type="button" style={btnSec} disabled={ocupado}
              onClick={() => { if (window.confirm("Reabrir esta célula para correções?")) acao(() => apiFetch(`/celulas-baby/${id}/reabrir`, { method: "POST" }), "Célula reaberta."); }}>Reabrir célula</button>
          )}
          {c.status === "encerrada" && <span style={{ alignSelf: "center", color: colors.textSecondary, fontSize: 13 }}>Encerrada{c.encerrada_em ? ` em ${new Date(c.encerrada_em).toLocaleDateString("pt-BR")}` : ""}.</span>}
        </div>
      </SectionCard>
    </div>
  );
}

/* ───────────── estilos ───────────── */

const btnHero = { background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.55)", borderRadius: radius.md, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPrim = { background: colors.accent, color: "#fff", border: 0, borderRadius: radius.md, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { background: "#fff", color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPerigo = { ...btnSec, color: colors.dangerText, borderColor: "#fecaca" };
const chip = { padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const chipAtivo = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const segmento = { padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 12.5, cursor: "pointer" };
const linhaPessoa = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", background: "#f8fafc", borderRadius: radius.md };
const rotulo = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const campo = { padding: "9px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, color: colors.textPrimary, background: "#fff", minWidth: 0 };
const dica = { fontSize: 13, color: colors.textSecondary, margin: "12px 0 0", lineHeight: 1.5 };
const alertaErro = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const alertaOk = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const alertaInfo = { background: colors.infoLight, color: "#075985", border: "1px solid #bae6fd", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const tabela = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 };
const th = { padding: "8px 6px", fontSize: 12, fontWeight: 800, color: colors.textSecondary, textAlign: "center", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "6px 4px", textAlign: "center", borderBottom: `1px solid #f1f5f9` };
const celula = { width: 64, padding: "7px 4px", textAlign: "center", border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 14, background: "#fff", color: colors.textPrimary };
