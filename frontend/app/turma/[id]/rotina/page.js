"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TurmaPageShell from "../../../../components/TurmaPageShell";
import { apiFetch, apiDownload, getStoredUser } from "../../../../services/api";
import { colors, radius } from "../../../../lib/theme";

// Rotina do instrutor (16/10/2026) — por turma.
//  · Avaliação Técnica: checklist (Véspera/Início/Final), responsabilidades com
//    prazo e farol, diário de bordo e atividades.
//    + Avaliação individual dos candidatos (notas 5–10, média, Aprovado/Em berço/Reprovado).
//  · Demais turmas (formação continuada): só atividades.
// Toda atividade registrada tem duração e SOMA na CH do instrutor.

const FAROL = {
  feito: { cor: colors.successText, bg: colors.successLight, texto: "Feito" },
  atrasada: { cor: colors.dangerText, bg: colors.dangerLight, texto: "Atrasada" },
  vence_hoje: { cor: colors.warningText, bg: colors.warningLight, texto: "Vence hoje" },
  vence_amanha: { cor: colors.warningText, bg: colors.warningLight, texto: "Vence amanhã" },
  a_fazer: { cor: colors.textSecondary, bg: colors.neutralLight, texto: "No prazo" },
  continuo: { cor: colors.textSecondary, bg: colors.neutralLight, texto: "Contínua" },
};
const FAROL_REVISAO = {
  verde: { cor: colors.successText, bg: colors.successLight, texto: "Feita" },
  amarelo: { cor: colors.warningText, bg: colors.warningLight, texto: "Pendente" },
  vermelho: { cor: colors.dangerText, bg: colors.dangerLight, texto: "Atrasada" },
  neutro: { cor: colors.textSecondary, bg: colors.neutralLight, texto: "Aguardando o fim da turma" },
};

function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}
function fmtDiaCurto(d) {
  if (!d) return "—";
  const [, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}`;
}
function fmtHoras(h) {
  const n = Number(h || 0);
  const horas = Math.floor(n + 1e-9);
  const min = Math.round((n - horas) * 60);
  if (!min) return `${horas}h`;
  return horas ? `${horas}h ${String(min).padStart(2, "0")}min` : `${min}min`;
}
function fmtMinutos(m) {
  return fmtHoras(Number(m || 0) / 60);
}

export default function RotinaTurmaPage() {
  const { id } = useParams() || {};
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aba, setAba] = useState("checklist");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const d = await apiFetch(`/rotina/turmas/${id}`);
      setEstado(d);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a rotina da turma.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const avTec = estado?.modo === "avaliacao_tecnica";
  // Diário de bordo vale para toda turma; o resto das abas é só da Avaliação Técnica (27/10/2026).
  const abaAtual = avTec ? aba : (aba === "diario" ? "diario" : "atividades");

  async function acao(fn, okMsg) {
    try {
      setErro("");
      await fn();
      if (okMsg) {
        setAviso(okMsg);
        setTimeout(() => setAviso(""), 2500);
      }
      await carregar();
      return true;
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
      return false;
    }
  }

  const resumo = useMemo(() => {
    if (!estado) return null;
    const chk = estado.checklist || [];
    const resp = chk.reduce((s, e) => s + e.respondidos, 0);
    const tot = chk.reduce((s, e) => s + e.total, 0);
    const atrasadas = (estado.tarefas || []).filter((t) => t.situacao === "atrasada").length;
    const diasOk = (estado.diario || []).filter((d) => d.texto && d.texto.trim()).length;
    const diasPassados = (estado.diario || []).filter((d) => !d.futuro).length;
    return { resp, tot, atrasadas, diasOk, diasPassados };
  }, [estado]);

  const turmaCab = estado?.turma
    ? { ...estado.turma, data_inicio: estado.turma.data_inicio, data_fim: estado.turma.data_fim }
    : null;

  return (
    <TurmaPageShell id={id} treinamento={turmaCab} loading={carregando} abaAtiva="rotina">
      {erro && <div style={alerta}>{erro}</div>}
      {aviso && <div style={okBox}>{aviso}</div>}

      {estado && (
        <>
          <div style={faixa}>
            <Kpi rotulo="Horas desta turma" valor={fmtHoras(estado.horas.total)}
              detalhe={`${fmtHoras(estado.horas.sala)} em sala + ${fmtHoras(estado.horas.atividades)} em atividades`} />
            {avTec && resumo && (
              <>
                <Kpi rotulo="Checklist" valor={`${resumo.resp}/${resumo.tot}`} detalhe="itens respondidos" />
                <Kpi rotulo="Responsabilidades atrasadas" valor={String(resumo.atrasadas)}
                  cor={resumo.atrasadas ? colors.dangerText : colors.successText} detalhe="com prazo vencido" />
                <Kpi rotulo="Diário de bordo" valor={`${resumo.diasOk}/${resumo.diasPassados}`} detalhe="dias registrados" />
              </>
            )}
            {!avTec && resumo && (
              <Kpi rotulo="Diário de bordo" valor={`${resumo.diasOk}/${resumo.diasPassados}`} detalhe="dias registrados" />
            )}
            {estado.revisao_plano && (
              <Kpi rotulo="Revisão do plano" valor={FAROL_REVISAO[estado.revisao_plano.farol].texto}
                cor={FAROL_REVISAO[estado.revisao_plano.farol].cor}
                detalhe={estado.revisao_plano.prazo ? `prazo ${fmtData(estado.revisao_plano.prazo)}` : ""} />
            )}
          </div>

          {!estado.pode_editar && (
            <div style={aviso2}>Você está só visualizando a rotina desta turma. Quem edita é o instrutor da turma ou a coordenação.</div>
          )}

          <div style={abas}>
            {(avTec
              ? [
                  ["checklist", "Checklist"],
                  ["responsabilidades", "Responsabilidades"],
                  ["diario", "Diário de bordo"],
                  ["atividades", "Atividades"],
                  ["avaliacao", "Avaliação individual"],
                ]
              : [
                  ["atividades", "Atividades"],
                  ["diario", "Diário de bordo"],
                ]
            ).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)} style={{ ...aba_, ...(abaAtual === k ? abaOn : null) }}>
                {l}
              </button>
            ))}
          </div>

          {abaAtual === "checklist" && <Checklist estado={estado} acao={acao} id={id} />}
          {abaAtual === "responsabilidades" && <Responsabilidades estado={estado} acao={acao} id={id} />}
          {abaAtual === "diario" && <Diario estado={estado} acao={acao} id={id} />}
          {abaAtual === "atividades" && <Atividades estado={estado} acao={acao} id={id} />}
          {abaAtual === "avaliacao" && <Avaliacao id={id} />}

          {avTec && estado.celula_baby && (
            <div style={{ ...card, marginTop: 16 }}>
              <strong>Célula baby desta turma:</strong>{" "}
              <a href={`/celulas-baby/${estado.celula_baby.id}`} style={{ color: colors.primary, fontWeight: 700 }}>abrir acompanhamento</a>
            </div>
          )}
        </>
      )}
    </TurmaPageShell>
  );
}

/* ───────────────────────── checklist ───────────────────────── */

function Checklist({ estado, acao, id }) {
  const pode = estado.pode_editar;
  const [obs, setObs] = useState({});

  function responder(item, resposta) {
    const nova = item.resposta === resposta ? null : resposta;
    const texto = obs[item.id] !== undefined ? obs[item.id] : item.obs || "";
    return acao(() =>
      apiFetch(`/rotina/turmas/${id}/checklist/${item.id}`, { method: "PUT", body: JSON.stringify({ resposta: nova, obs: texto }) })
    );
  }
  function salvarObs(item) {
    if (obs[item.id] === undefined || obs[item.id] === (item.obs || "")) return;
    return acao(() =>
      apiFetch(`/rotina/turmas/${id}/checklist/${item.id}`, { method: "PUT", body: JSON.stringify({ resposta: item.resposta, obs: obs[item.id] }) })
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {estado.checklist.map((et) => (
        <section key={et.etapa} style={card}>
          <div style={cabCard}>
            <div>
              <h2 style={h2}>{et.rotulo}</h2>
              <p style={sub}>
                {et.etapa === "vespera" && "Responda antes do primeiro dia."}
                {et.etapa === "inicio" && "Durante os primeiros dias da turma."}
                {et.etapa === "final" && "No fechamento da turma."}
              </p>
            </div>
            <span style={{ ...badge, ...(et.respondidos === et.total ? { background: colors.successLight, color: colors.successText } : { background: colors.neutralLight, color: colors.textSecondary }) }}>
              {et.respondidos}/{et.total}
            </span>
          </div>
          <div style={{ display: "grid" }}>
            {et.itens.map((it) => (
              <div key={it.id} style={itemLinha}>
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: colors.textPrimary || "#0f172a" }}>{it.texto}</div>
                  {(it.resposta || obs[it.id] !== undefined) && (
                    <input
                      style={{ ...input, marginTop: 6 }}
                      placeholder="Observação (opcional)"
                      disabled={!pode}
                      value={obs[it.id] !== undefined ? obs[it.id] : it.obs || ""}
                      onChange={(e) => setObs({ ...obs, [it.id]: e.target.value })}
                      onBlur={() => salvarObs(it)}
                      maxLength={1000}
                    />
                  )}
                  {it.respondido_por && it.resposta && (
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                      {it.respondido_por}{it.respondido_em ? ` · ${new Date(it.respondido_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                    </div>
                  )}
                </div>
                <div style={seg}>
                  {[["sim", "Sim"], ["nao", "Não"], ["na", "N/A"]].map(([v, l]) => (
                    <button
                      key={v}
                      disabled={!pode}
                      onClick={() => responder(it, v)}
                      style={{
                        ...segBtn,
                        ...(it.resposta === v
                          ? v === "sim" ? segSim : v === "nao" ? segNao : segNa
                          : null),
                        cursor: pode ? "pointer" : "default",
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ───────────────────────── responsabilidades ───────────────────────── */

function Responsabilidades({ estado, acao, id }) {
  const pode = estado.pode_editar;
  return (
    <section style={card}>
      <div style={cabCard}>
        <div>
          <h2 style={h2}>Responsabilidades do instrutor</h2>
          <p style={sub}>O prazo é calculado pelas datas desta turma ({fmtData(estado.turma.data_inicio)} a {fmtData(estado.turma.data_fim)}). O farol muda sozinho.</p>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tabela}>
          <thead>
            <tr>
              <th style={th}>Feito</th>
              <th style={th}>Item</th>
              <th style={th}>O que fazer</th>
              <th style={th}>Prazo</th>
              <th style={th}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {estado.tarefas.map((t) => {
              const f = FAROL[t.situacao] || FAROL.a_fazer;
              return (
                <tr key={t.id}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={t.feito}
                      disabled={!pode}
                      aria-label={`Marcar ${t.item} como feito`}
                      onChange={(e) =>
                        acao(() => apiFetch(`/rotina/turmas/${id}/tarefas/${t.id}`, { method: "PUT", body: JSON.stringify({ feito: e.target.checked }) }))
                      }
                    />
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{t.item}</td>
                  <td style={{ ...td, color: colors.textSecondary }}>{t.o_que_fazer}</td>
                  <td style={td}>{t.prazo ? fmtData(t.prazo) : "—"}</td>
                  <td style={td}>
                    <span style={{ ...badge, background: f.bg, color: f.cor }}>
                      {f.texto}{t.situacao === "atrasada" ? ` (${t.dias_atraso}d)` : ""}
                    </span>
                    {t.feito && t.feito_por && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{t.feito_por}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────────────────────── diário de bordo ───────────────────────── */

function Diario({ estado, acao, id }) {
  const dias = estado.diario;
  const pode = estado.pode_editar;
  const inicial = useMemo(() => {
    const hoje = estado.hoje;
    return (dias.find((d) => d.data === hoje) || [...dias].reverse().find((d) => !d.futuro) || dias[0] || {}).data;
  }, [dias, estado.hoje]);
  const [sel, setSel] = useState(inicial);
  const dia = dias.find((d) => d.data === sel) || dias[0];
  const [texto, setTexto] = useState(dia?.texto || "");

  useEffect(() => {
    setTexto(dia?.texto || "");
  }, [dia?.data, dia?.texto]);

  if (!dia) return <div style={vazio}>Esta turma ainda não tem dias definidos. Gere o cronograma para registrar o diário.</div>;
  const presenca = dia.presenca;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16, alignItems: "start" }}>
      <section style={card}>
        <div style={cabCard}>
          <div>
            <h2 style={h2}>Dias da turma</h2>
            <p style={sub}>Um registro por dia.</p>
          </div>
        </div>
        <div>
          {dias.map((d, i) => {
            const preenchido = d.texto && d.texto.trim();
            return (
              <button key={d.data} onClick={() => setSel(d.data)} style={{ ...diaBtn, ...(d.data === dia.data ? diaOn : null) }}>
                <span style={{ fontWeight: 800 }}>D{i + 1} · {fmtDiaCurto(d.data)}</span>
                <span style={{ fontSize: 12, color: d.futuro ? colors.textMuted : preenchido ? colors.successText : colors.warningText }}>
                  {d.futuro ? "Ainda não chegou" : preenchido ? "Registrado" : "Pendente"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <div style={cabCard}>
          <div>
            <h2 style={h2}>Diário de bordo · {fmtData(dia.data)}</h2>
            <p style={sub}>Registro do dia, escrito pelo instrutor. A presença vem da chamada — não é preciso digitar de novo.</p>
          </div>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presenca ? (
              <>
                <span style={{ ...badge, background: colors.successLight, color: colors.successText }}>{presenca.presentes} presentes</span>
                <span style={{ ...badge, background: colors.dangerLight, color: colors.dangerText }}>{presenca.ausentes} ausentes</span>
                <span style={{ ...badge, background: colors.warningLight, color: colors.warningText }}>{presenca.justificados} justificados</span>
                {presenca.pendentes > 0 && <span style={{ ...badge, background: colors.neutralLight, color: colors.textSecondary }}>{presenca.pendentes} sem chamada</span>}
              </>
            ) : (
              <span style={{ ...badge, background: colors.neutralLight, color: colors.textSecondary }}>Chamada deste dia ainda não lançada</span>
            )}
          </div>
          <textarea
            style={{ ...input, minHeight: 180, resize: "vertical", fontFamily: "inherit" }}
            placeholder={dia.futuro ? "Este dia ainda não chegou." : "O que aconteceu hoje: conteúdo dado, ocorrências, atrasos, dificuldades da turma…"}
            disabled={!pode || dia.futuro}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={8000}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              style={btn}
              disabled={!pode || dia.futuro || texto === (dia.texto || "")}
              onClick={() => acao(() => apiFetch(`/rotina/turmas/${id}/diario/${dia.data}`, { method: "PUT", body: JSON.stringify({ texto }) }), "Diário salvo.")}
            >
              Salvar diário
            </button>
            {dia.atualizado_por && <span style={{ fontSize: 12, color: colors.textMuted }}>Última edição: {dia.atualizado_por}</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── atividades ───────────────────────── */

const FORM_VAZIO = { catalogo_id: "", data_atividade: "", minutos: "", participante_id: "", tema: "", observacao: "", biblioteca_id: "" };

function Atividades({ estado, acao, id }) {
  const pode = estado.pode_editar;
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ nome: "", descricao: "", minutos_padrao: "", pede_pessoa: false });
  const [form, setForm] = useState(null); // null = fechado; objeto = aberto
  const [editandoId, setEditandoId] = useState(null);
  const [biblioteca, setBiblioteca] = useState(null);

  const escolhidas = estado.atividades.filter((a) => a.escolhida);
  const disponiveis = estado.atividades.filter((a) => Number(a.ativo) === 1 || a.escolhida);
  const catSel = form ? escolhidas.find((a) => String(a.id) === String(form.catalogo_id)) : null;

  function alternar(a) {
    if (!pode) return;
    if (Number(a.tem_prazo_fim_turma) === 1 && a.escolhida) return;
    const usada = estado.registros.some((r) => Number(r.catalogo_id) === Number(a.id));
    if (a.escolhida && usada) return;
    const ids = estado.atividades.filter((x) => x.escolhida).map((x) => x.id);
    const novos = a.escolhida ? ids.filter((i) => i !== a.id) : [...ids, a.id];
    acao(() => apiFetch(`/rotina/turmas/${id}/atividades`, { method: "PUT", body: JSON.stringify({ catalogo_ids: novos }) }));
  }

  async function criarNova() {
    const ok = await acao(async () => {
      const r = await apiFetch("/rotina/catalogo", {
        method: "POST",
        body: JSON.stringify({ ...nova, minutos_padrao: nova.minutos_padrao === "" ? null : Number(nova.minutos_padrao) }),
      });
      const ids = estado.atividades.filter((x) => x.escolhida).map((x) => x.id);
      await apiFetch(`/rotina/turmas/${id}/atividades`, { method: "PUT", body: JSON.stringify({ catalogo_ids: [...ids, r.id] }) });
    }, "Atividade criada no catálogo e marcada nesta turma.");
    if (ok) {
      setNova({ nome: "", descricao: "", minutos_padrao: "", pede_pessoa: false });
      setNovaAberta(false);
    }
  }

  function abrirForm(catalogoId) {
    const cat = escolhidas.find((a) => a.id === catalogoId) || escolhidas[0];
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, catalogo_id: cat ? String(cat.id) : "", data_atividade: estado.hoje, minutos: cat?.minutos_padrao ? String(cat.minutos_padrao) : "" });
    if (biblioteca === null) apiFetch("/biblioteca").then((b) => setBiblioteca(Array.isArray(b) ? b : [])).catch(() => setBiblioteca([]));
  }
  function abrirEdicao(r) {
    setEditandoId(r.id);
    setForm({
      catalogo_id: String(r.catalogo_id || ""), data_atividade: r.data_atividade, minutos: String(r.minutos),
      participante_id: r.participante_id ? String(r.participante_id) : "", tema: r.tema || "", observacao: r.observacao || "",
      biblioteca_id: r.biblioteca_id ? String(r.biblioteca_id) : "",
    });
    if (biblioteca === null) apiFetch("/biblioteca").then((b) => setBiblioteca(Array.isArray(b) ? b : [])).catch(() => setBiblioteca([]));
  }

  async function salvarRegistro() {
    const corpo = {
      treinamento_id: Number(id), catalogo_id: Number(form.catalogo_id), data_atividade: form.data_atividade,
      minutos: Number(form.minutos), participante_id: form.participante_id ? Number(form.participante_id) : null,
      tema: form.tema, observacao: form.observacao, biblioteca_id: form.biblioteca_id ? Number(form.biblioteca_id) : null,
    };
    const ok = await acao(
      () => editandoId
        ? apiFetch(`/rotina/registros/${editandoId}`, { method: "PUT", body: JSON.stringify(corpo) })
        : apiFetch("/rotina/registros", { method: "POST", body: JSON.stringify(corpo) }),
      editandoId ? "Atividade atualizada." : "Atividade registrada. As horas já entram na sua CH."
    );
    if (ok) {
      setForm(null);
      setEditandoId(null);
    }
  }

  const minutosOk = Number.isInteger(Number(form?.minutos)) && Number(form?.minutos) >= 1 && Number(form?.minutos) <= 720;
  const formValido = form && form.catalogo_id && form.data_atividade && minutosOk;
  const rev = estado.revisao_plano;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={card}>
        <div style={cabCard}>
          <div>
            <h2 style={h2}>Atividades desta formação</h2>
            <p style={sub}>Escolha o que será usado nesta turma. O que não for marcado não aparece no registro.</p>
          </div>
          {pode && <button style={btnSec} onClick={() => setNovaAberta((v) => !v)}>+ Nova atividade</button>}
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {disponiveis.map((a) => {
              const trava = Number(a.tem_prazo_fim_turma) === 1 && a.escolhida;
              return (
                <button
                  key={a.id}
                  onClick={() => alternar(a)}
                  disabled={!pode}
                  title={a.descricao || ""}
                  style={{ ...chip, ...(a.escolhida ? chipOn : null), cursor: pode && !trava ? "pointer" : "default" }}
                >
                  {a.escolhida ? "✓ " : ""}{a.nome}{trava ? " (obrigatória)" : ""}
                </button>
              );
            })}
          </div>
          {novaAberta && (
            <div style={{ border: `1px dashed ${colors.border}`, borderRadius: radius.md, padding: 14, display: "grid", gap: 10 }}>
              <strong style={{ fontSize: 14 }}>Nova atividade no catálogo</strong>
              <div style={grade2}>
                <label style={lab}>Nome
                  <input style={input} value={nova.nome} maxLength={120} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
                </label>
                <label style={lab}>Duração padrão (min, opcional)
                  <input style={input} type="number" min={1} max={720} value={nova.minutos_padrao} onChange={(e) => setNova({ ...nova, minutos_padrao: e.target.value })} />
                </label>
              </div>
              <label style={lab}>Descrição (opcional)
                <input style={input} value={nova.descricao} maxLength={1000} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
              </label>
              <label style={{ ...lab, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={nova.pede_pessoa} onChange={(e) => setNova({ ...nova, pede_pessoa: e.target.checked })} />
                Refere-se a uma pessoa da turma (ex.: escuta individual)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} disabled={!nova.nome.trim()} onClick={criarNova}>Criar e marcar nesta turma</button>
                <button style={btnSec} onClick={() => setNovaAberta(false)}>Cancelar</button>
              </div>
              <p style={{ ...sub, margin: 0 }}>A atividade fica no catálogo para todas as turmas; a coordenação pode ajustar depois.</p>
            </div>
          )}
        </div>
      </section>

      {rev && (
        <section style={card}>
          <div style={cabCard}>
            <div>
              <h2 style={h2}>Revisão do plano de aula</h2>
              <p style={sub}>Ao concluir a turma: ajustar dinâmicas, ordem do conteúdo, incluir ou retirar da grade. Prazo: {rev.prazo ? fmtData(rev.prazo) : "—"} (2 dias úteis após o fim da turma).</p>
            </div>
            <span style={{ ...badge, background: FAROL_REVISAO[rev.farol].bg, color: FAROL_REVISAO[rev.farol].cor }}>
              {FAROL_REVISAO[rev.farol].texto}{rev.dias_atraso ? ` (${rev.dias_atraso}d)` : ""}
            </span>
          </div>
          {pode && !rev.feita && (
            <div style={{ padding: 16 }}>
              <button style={btn} onClick={() => abrirForm(rev.catalogo_id)}>Registrar revisão</button>
            </div>
          )}
        </section>
      )}

      <section style={card}>
        <div style={cabCard}>
          <div>
            <h2 style={h2}>Registro de atividades</h2>
            <p style={sub}>Duração obrigatória: o tempo entra na CH do instrutor (sala + atividades).</p>
          </div>
          {pode && <button style={btn} onClick={() => abrirForm()} disabled={!escolhidas.length}>+ Registrar atividade</button>}
        </div>

        {form && (
          <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}`, display: "grid", gap: 10, background: "#f8fafc" }}>
            <strong style={{ fontSize: 14 }}>{editandoId ? "Editar atividade" : "Nova atividade"}</strong>
            <div style={grade3}>
              <label style={lab}>Tipo
                <select style={input} disabled={!!editandoId} value={form.catalogo_id}
                  onChange={(e) => {
                    const c = escolhidas.find((a) => String(a.id) === e.target.value);
                    setForm({ ...form, catalogo_id: e.target.value, minutos: form.minutos || (c?.minutos_padrao ? String(c.minutos_padrao) : "") });
                  }}>
                  <option value="">Escolha…</option>
                  {escolhidas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </label>
              <label style={lab}>Data
                <input style={input} type="date" max={estado.hoje} value={form.data_atividade} onChange={(e) => setForm({ ...form, data_atividade: e.target.value })} />
              </label>
              <label style={lab}>Duração (minutos){minutosOk ? ` = ${fmtMinutos(form.minutos)}` : ""}
                <input style={input} type="number" min={1} max={720} value={form.minutos} onChange={(e) => setForm({ ...form, minutos: e.target.value })} />
              </label>
            </div>
            <div style={grade2}>
              {Number(catSel?.pede_pessoa) === 1 ? (
                <label style={lab}>Pessoa da turma
                  <select style={input} value={form.participante_id} onChange={(e) => setForm({ ...form, participante_id: e.target.value })}>
                    <option value="">Escolha…</option>
                    {estado.participantes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
              ) : (
                <label style={lab}>Tema
                  <input style={input} value={form.tema} maxLength={300} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
                </label>
              )}
              <label style={lab}>Material da Biblioteca (opcional)
                <select style={input} value={form.biblioteca_id} onChange={(e) => setForm({ ...form, biblioteca_id: e.target.value })}>
                  <option value="">Nenhum</option>
                  {(biblioteca || []).map((b) => <option key={b.id} value={b.id}>{b.titulo}</option>)}
                </select>
              </label>
            </div>
            <label style={lab}>Observação
              <textarea style={{ ...input, minHeight: 70, fontFamily: "inherit" }} value={form.observacao} maxLength={3000} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn} disabled={!formValido} onClick={salvarRegistro}>{editandoId ? "Salvar alterações" : "Registrar"}</button>
              <button style={btnSec} onClick={() => { setForm(null); setEditandoId(null); }}>Cancelar</button>
            </div>
          </div>
        )}

        {estado.registros.length === 0 ? (
          <div style={vazio}>Nenhuma atividade registrada nesta turma ainda.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabela}>
              <thead>
                <tr>
                  <th style={th}>Data</th><th style={th}>Atividade</th><th style={th}>Pessoa / tema</th>
                  <th style={th}>Duração</th><th style={th}>Observação</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {estado.registros.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{fmtData(r.data_atividade)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.tipo_nome}</td>
                    <td style={td}>
                      {r.pessoa_nome || r.tema || "—"}
                      {r.biblioteca_titulo && <div style={{ fontSize: 12, color: colors.textMuted }}>Biblioteca: {r.biblioteca_titulo}</div>}
                    </td>
                    <td style={td}>{fmtMinutos(r.minutos)}</td>
                    <td style={{ ...td, color: colors.textSecondary }}>{r.observacao || "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {pode && (
                        <>
                          <button style={link} onClick={() => abrirEdicao(r)}>Editar</button>{" "}
                          <button
                            style={{ ...link, color: colors.dangerText }}
                            onClick={() => { if (window.confirm("Excluir esta atividade? As horas saem da CH do instrutor.")) acao(() => apiFetch(`/rotina/registros/${r.id}`, { method: "DELETE" }), "Atividade excluída."); }}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {estado.ritmo_mes?.length > 0 && (
        <section style={card}>
          <div style={cabCard}>
            <div>
              <h2 style={h2}>Ritmo do mês · {estado.turma.cliente}</h2>
              <p style={sub}>Referência, não é meta rígida. Conta as atividades registradas para este cliente no mês.</p>
            </div>
          </div>
          <div style={{ padding: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {estado.ritmo_mes.map((r) => (
              <div key={r.tipo} style={ritmo}>
                <div style={{ fontSize: 12, color: colors.textMuted, fontWeight: 700 }}>{r.tipo}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{r.qtd_mes}</div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>referência: {r.referencia}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, cor }) {
  return (
    <div style={kpi}>
      <div style={{ fontSize: 11, fontWeight: 800, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".04em" }}>{rotulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || colors.navy, lineHeight: 1.15 }}>{valor}</div>
      {detalhe && <div style={{ fontSize: 12, color: colors.textSecondary }}>{detalhe}</div>}
    </div>
  );
}

/* ───────────────────────── avaliação individual (Avaliação Técnica) ───────────────────────── */

const RESULTADOS_AV = [
  ["passou", "Aprovado"],
  ["em_berco", "Em berço"],
  ["nao_seguiu", "Reprovado"],
];
const RES_COR = {
  passou: { cor: colors.successText, bg: colors.successLight },
  em_berco: { cor: colors.warningText, bg: colors.warningLight },
  nao_seguiu: { cor: colors.dangerText, bg: colors.dangerLight },
};
const NOTAS_OPCOES = [5, 6, 7, 8, 9, 10];

function mediaDe(notas, criterios) {
  const v = criterios.map((c) => notas?.[c.chave]);
  if (v.some((n) => n === null || n === undefined || n === "")) return null;
  const soma = v.reduce((s, n) => s + Number(n), 0);
  return Math.round((soma / v.length) * 100) / 100;
}
function fmtMedia(m) {
  return m === null || m === undefined ? "—" : Number(m).toFixed(1).replace(".", ",");
}

function Avaliacao({ id }) {
  const [dados, setDados] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const usuario = getStoredUser();
  const gestao = ["coordenador", "assistente_treinamento"].includes(usuario?.perfil);

  const carregar = useCallback(async () => {
    try {
      const d = await apiFetch(`/rotina/turmas/${id}/avaliacao`);
      setDados(d);
      setLinhas(
        (d.linhas || []).map((l) => ({
          participante_id: l.participante_id,
          nome: l.nome,
          matricula: l.matricula,
          notas: { ...l.notas },
          resultado: l.resultado || "",
          observacao: l.observacao || "",
          provas_papel: l.provas_papel || [],
        }))
      );
      setSujo(false);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a avaliação individual.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criterios = dados?.criterios || [];
  const celulaIniciada = !!dados?.celula && dados.celula.status !== "a_configurar";
  const editavel = !!dados?.pode_editar;
  // com a célula iniciada, só a coordenação mexe no resultado
  const resultadoTravado = celulaIniciada && !gestao;

  function mudar(pid, campo, valor, criterio) {
    setSujo(true);
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.participante_id !== pid) return l;
        if (criterio) return { ...l, notas: { ...l.notas, [criterio]: valor === "" ? null : Number(valor) } };
        return { ...l, [campo]: valor };
      })
    );
  }

  const contagem = useMemo(() => {
    const c = { passou: 0, em_berco: 0, nao_seguiu: 0 };
    linhas.forEach((l) => {
      if (c[l.resultado] !== undefined) c[l.resultado] += 1;
    });
    return c;
  }, [linhas]);

  const pendencias = useMemo(() => {
    const p = [];
    linhas.forEach((l) => {
      const m = mediaDe(l.notas, criterios);
      if (m === null) p.push(`${l.nome}: faltam notas`);
      else if (!l.resultado) p.push(`${l.nome}: falta o resultado`);
      else if (m < (dados?.media_minima || 6) && !String(l.observacao).trim()) p.push(`${l.nome}: média abaixo de ${dados?.media_minima || 6} pede observação`);
    });
    return p;
  }, [linhas, criterios, dados]);

  function corpo(registrar) {
    return {
      registrar,
      linhas: linhas.map((l) => ({
        participante_id: l.participante_id,
        notas: l.notas,
        resultado: l.resultado || null,
        observacao: l.observacao,
      })),
    };
  }

  async function salvar(registrar) {
    setOcupado(true);
    setErro("");
    try {
      await apiFetch(`/rotina/turmas/${id}/avaliacao`, { method: "PUT", body: JSON.stringify(corpo(registrar)) });
      setAviso(registrar ? "Avaliação registrada e encerrada." : "Rascunho salvo.");
      setTimeout(() => setAviso(""), 3000);
      setConfirmando(false);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
      setConfirmando(false);
    } finally {
      setOcupado(false);
    }
  }

  async function reabrir() {
    setOcupado(true);
    setErro("");
    try {
      await apiFetch(`/rotina/turmas/${id}/avaliacao/reabrir`, { method: "POST" });
      setAviso("Avaliação reaberta para edição.");
      setTimeout(() => setAviso(""), 3000);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível reabrir.");
    } finally {
      setOcupado(false);
    }
  }

  async function exportar() {
    try {
      setErro("");
      await apiDownload(`/rotina/turmas/${id}/avaliacao/exportar`, `avaliacao-individual-turma-${id}.xlsx`);
    } catch (e) {
      setErro(e.message || "Não foi possível exportar.");
    }
  }

  if (!dados) return erro ? <div style={alerta}>{erro}</div> : <div style={vazio}>Carregando avaliação individual…</div>;

  const registrada = !!dados.registro;

  return (
    <div>
      {erro && <div style={alerta}>{erro}</div>}
      {aviso && <div style={okBox}>{aviso}</div>}

      <div style={faixa}>
        <Kpi rotulo="Candidatos" valor={String(linhas.length)} detalhe="nesta turma" />
        <Kpi rotulo="Aprovado" valor={String(contagem.passou)} cor={colors.successText} />
        <Kpi rotulo="Em berço" valor={String(contagem.em_berco)} cor={colors.warningText} />
        <Kpi rotulo="Reprovado" valor={String(contagem.nao_seguiu)} cor={colors.dangerText} />
      </div>

      {registrada && (
        <div style={okBox}>
          Avaliação registrada{dados.registro.registrada_por ? ` por ${dados.registro.registrada_por}` : ""}
          {dados.registro.registrada_em ? ` em ${fmtData(dados.registro.registrada_em)}` : ""}.
          {gestao ? " Você pode ajustar notas e resultados (as mudanças ficam na Auditoria)." : " Para alterar, peça à coordenação."}
        </div>
      )}
      {!editavel && !registrada && dados.so_leitura_motivo === "perfil" && (
        <div style={aviso2}>Você está só visualizando. Quem preenche é o instrutor da turma ou a coordenação.</div>
      )}
      {celulaIniciada && editavel && (
        <div style={aviso2}>
          A célula baby já foi iniciada.{" "}
          {gestao ? "Mudar o resultado de alguém fica registrado na Auditoria." : "Só a coordenação altera o resultado; você ainda pode ajustar notas e observações."}
        </div>
      )}

      <div style={card}>
        <div style={cabCard}>
          <div>
            <h2 style={h2}>Avaliação individual dos candidatos</h2>
            <p style={sub}>
              Notas inteiras de {dados.nota_min} a {dados.nota_max} em cada critério. A média é calculada; abaixo de {dados.media_minima} a observação é obrigatória.
              Esta tela não substitui a planilha em papel e não soma horas na CH.
            </p>
          </div>
          <button style={btnSec} onClick={exportar}>Exportar Excel</button>
        </div>

        {!linhas.length ? (
          <div style={vazio}>Esta turma ainda não tem candidatos cadastrados. Inclua os participantes na turma para avaliar.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...tabela, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={th}>Candidato</th>
                  {criterios.map((c) => (
                    <th key={c.chave} style={{ ...th, textAlign: "center", minWidth: 84 }}>{c.rotulo}</th>
                  ))}
                  <th style={{ ...th, textAlign: "center" }}>Média</th>
                  <th style={th}>Resultado</th>
                  <th style={{ ...th, minWidth: 200 }}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const m = mediaDe(l.notas, criterios);
                  const baixa = m !== null && m < dados.media_minima;
                  const obsFalta = baixa && !String(l.observacao).trim();
                  const rc = RES_COR[l.resultado];
                  return (
                    <tr key={l.participante_id}>
                      <td style={td}>
                        <strong style={{ color: colors.navy }}>{l.nome}</strong>
                        {l.matricula ? <div style={{ fontSize: 12, color: colors.textMuted }}>{l.matricula}</div> : null}
                        {(l.provas_papel || []).length > 0 && (
                          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }} title="Nota importada da prova em papel (referência para o quiz / avaliação final; não preenche as notas)">
                            Prova em papel: {l.provas_papel.map((p) => `${p.titulo} ${Number(p.nota).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`).join(" · ")}
                          </div>
                        )}
                      </td>
                      {criterios.map((c) => {
                        const n = l.notas[c.chave];
                        const vermelho = n !== null && n !== undefined && n < dados.media_minima;
                        return (
                          <td key={c.chave} style={{ ...td, textAlign: "center" }}>
                            <select
                              aria-label={`${c.rotulo} de ${l.nome}`}
                              disabled={!editavel || ocupado}
                              value={n ?? ""}
                              onChange={(e) => mudar(l.participante_id, null, e.target.value, c.chave)}
                              style={{
                                ...selNota,
                                ...(vermelho ? { background: colors.dangerLight, color: colors.dangerText, borderColor: "#fca5a5" } : null),
                              }}
                            >
                              <option value="">—</option>
                              {NOTAS_OPCOES.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                      <td style={{ ...td, textAlign: "center", fontWeight: 800, color: baixa ? colors.dangerText : colors.navy }}>{fmtMedia(m)}</td>
                      <td style={td}>
                        {editavel && !resultadoTravado ? (
                          <select
                            aria-label={`Resultado de ${l.nome}`}
                            disabled={ocupado}
                            value={l.resultado}
                            onChange={(e) => mudar(l.participante_id, "resultado", e.target.value)}
                            style={{ ...selRes, ...(rc ? { background: rc.bg, color: rc.cor, borderColor: rc.cor } : null) }}
                          >
                            <option value="">Escolher…</option>
                            {RESULTADOS_AV.map(([k, r]) => (
                              <option key={k} value={k}>{r}</option>
                            ))}
                          </select>
                        ) : rc ? (
                          <span style={{ ...badge, background: rc.bg, color: rc.cor }}>{RESULTADOS_AV.find(([k]) => k === l.resultado)?.[1]}</span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>—</span>
                        )}
                      </td>
                      <td style={td}>
                        <input
                          aria-label={`Observação de ${l.nome}`}
                          disabled={!editavel || ocupado}
                          value={l.observacao}
                          maxLength={1000}
                          placeholder={baixa ? "Obrigatória (média abaixo de 6)" : "Opcional"}
                          onChange={(e) => mudar(l.participante_id, "observacao", e.target.value)}
                          style={{ ...input, ...(obsFalta ? { borderColor: "#fca5a5", background: colors.dangerLight } : null) }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: "14px 16px", borderTop: `1px solid ${colors.border}`, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            Quem for <strong>Aprovado</strong> entra automaticamente na célula baby da turma.
            {dados.celula ? (
              <>
                {" "}
                <a href={`/celulas-baby/${dados.celula.id}`} style={{ color: colors.primary, fontWeight: 700 }}>Abrir a célula baby</a>
              </>
            ) : null}
          </div>

          {editavel && linhas.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button style={btnSec} disabled={ocupado || !sujo} onClick={() => salvar(false)}>Salvar rascunho</button>
              {!registrada && (
                <button style={{ ...btn, opacity: pendencias.length ? 0.55 : 1 }} disabled={ocupado || pendencias.length > 0} onClick={() => setConfirmando(true)}>
                  Registrar e encerrar avaliação
                </button>
              )}
              {sujo && <span style={{ fontSize: 12, color: colors.warningText, fontWeight: 700 }}>Há alterações não salvas.</span>}
            </div>
          )}

          {editavel && !registrada && pendencias.length > 0 && linhas.length > 0 && (
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              Para registrar, falta: {pendencias.slice(0, 3).join("; ")}
              {pendencias.length > 3 ? ` e mais ${pendencias.length - 3}` : ""}.
            </div>
          )}

          {confirmando && (
            <div style={{ ...aviso2, border: `1px solid ${colors.border}`, display: "grid", gap: 10 }}>
              <span>
                Registrar e encerrar a avaliação de {linhas.length} candidato(s)? Depois disso só a coordenação consegue alterar. Faça isto ao fim da turma, depois de lançar a planilha em papel.
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} disabled={ocupado} onClick={() => salvar(true)}>Sim, registrar</button>
                <button style={btnSec} disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {dados.pode_reabrir && (
            <div>
              <button style={link} disabled={ocupado} onClick={reabrir}>Reabrir avaliação para edição</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const selNota = { padding: "7px 8px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", fontSize: 14, fontWeight: 700, minWidth: 56, textAlign: "center" };
const selRes = { padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", fontSize: 13, fontWeight: 800, minWidth: 120 };

/* ───────────────────────── estilos ───────────────────────── */

const card = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden" };
const cabCard = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "16px 16px 12px", flexWrap: "wrap", borderBottom: `1px solid ${colors.border}` };
const h2 = { margin: 0, fontSize: 17, fontWeight: 800, color: colors.navy };
const sub = { margin: "4px 0 0", fontSize: 13, color: colors.textSecondary };
const faixa = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const kpi = { flex: "1 1 170px", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 14px", display: "grid", gap: 2 };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginBottom: 12 };
const okBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "10px 16px", fontSize: 14, marginBottom: 12 };
const aviso2 = { background: colors.neutralLight, color: colors.textSecondary, borderRadius: radius.md, padding: "10px 16px", fontSize: 13, marginBottom: 12 };
const abas = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const aba_ = { padding: "9px 16px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const abaOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const badge = { padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
const itemLinha = { display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid ${colors.border}` };
const seg = { display: "flex", gap: 6 };
const segBtn = { padding: "7px 14px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13 };
const segSim = { background: colors.successLight, color: colors.successText, borderColor: "#86efac" };
const segNao = { background: colors.dangerLight, color: colors.dangerText, borderColor: "#fca5a5" };
const segNa = { background: colors.neutralLight, color: colors.textPrimary || "#0f172a", borderColor: "#cbd5e1" };
const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: "#fff" };
const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const grade2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 };
const grade3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 };
const btn = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const link = { background: "none", border: "none", color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 };
const chip = { padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13 };
const chipOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "11px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "36px 16px", fontSize: 14 };
const diaBtn = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", padding: "12px 16px", border: "none", borderBottom: `1px solid ${colors.border}`, background: "#fff", cursor: "pointer", fontSize: 14, textAlign: "left" };
const diaOn = { background: colors.accentLight };
const ritmo = { flex: "1 1 180px", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 14px", display: "grid", gap: 2 };
