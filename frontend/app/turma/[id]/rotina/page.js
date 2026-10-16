"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TurmaPageShell from "../../../../components/TurmaPageShell";
import { apiFetch } from "../../../../services/api";
import { colors, radius } from "../../../../lib/theme";

// Rotina do instrutor (16/10/2026) — por turma.
//  · Avaliação Técnica: checklist (Véspera/Início/Final), responsabilidades com
//    prazo e farol, diário de bordo e atividades.
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
  const abaAtual = avTec ? aba : "atividades";

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
            {estado.revisao_plano && (
              <Kpi rotulo="Revisão do plano" valor={FAROL_REVISAO[estado.revisao_plano.farol].texto}
                cor={FAROL_REVISAO[estado.revisao_plano.farol].cor}
                detalhe={estado.revisao_plano.prazo ? `prazo ${fmtData(estado.revisao_plano.prazo)}` : ""} />
            )}
          </div>

          {!estado.pode_editar && (
            <div style={aviso2}>Você está só visualizando a rotina desta turma. Quem edita é o instrutor da turma ou a coordenação.</div>
          )}

          {avTec && (
            <div style={abas}>
              {[
                ["checklist", "Checklist"],
                ["responsabilidades", "Responsabilidades"],
                ["diario", "Diário de bordo"],
                ["atividades", "Atividades"],
              ].map(([k, l]) => (
                <button key={k} onClick={() => setAba(k)} style={{ ...aba_, ...(aba === k ? abaOn : null) }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {abaAtual === "checklist" && <Checklist estado={estado} acao={acao} id={id} />}
          {abaAtual === "responsabilidades" && <Responsabilidades estado={estado} acao={acao} id={id} />}
          {abaAtual === "diario" && <Diario estado={estado} acao={acao} id={id} />}
          {abaAtual === "atividades" && <Atividades estado={estado} acao={acao} id={id} />}

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
