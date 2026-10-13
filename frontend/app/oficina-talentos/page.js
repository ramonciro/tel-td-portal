"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";

// Oficina de Talentos (Metodologia) — Fase 1 (13/10/2026): gestão das turmas,
// grade livre, link público de inscrição, fila de conferência, lista de
// espera e exportação Excel. Backend: /api/oficina-talentos. Acesso: perfil
// "metodologia" (o PortalShell também exige isso pelo menu).

const STATUS_TURMA = {
  rascunho: { label: "Rascunho", bg: colors.neutralLight, text: colors.neutral },
  inscricoes_abertas: { label: "Inscrições abertas", bg: colors.successLight, text: colors.successText },
  inscricoes_encerradas: { label: "Inscrições encerradas", bg: colors.warningLight, text: colors.warningText },
  em_andamento: { label: "Em andamento", bg: colors.primaryLight, text: colors.primary },
  encerrada: { label: "Encerrada", bg: colors.neutralLight, text: colors.neutral },
};

const STATUS_INSCRICAO = {
  confirmado: { label: "Confirmado", bg: colors.successLight, text: colors.successText },
  em_conferencia: { label: "Em conferência", bg: colors.warningLight, text: colors.warningText },
  lista_espera: { label: "Lista de espera", bg: colors.infoLight, text: "#0369a1" },
  cancelado: { label: "Cancelado", bg: colors.dangerLight, text: colors.dangerText },
  desistente: { label: "Desistente", bg: colors.neutralLight, text: colors.neutral },
};

const MODALIDADES = { presencial: "Presencial", online: "Online", hibrido: "Híbrido" };

const FORM_VAZIO = {
  nome: "",
  descricao: "",
  data_inicio: "",
  data_fim: "",
  horario: "",
  modalidade: "presencial",
  local_nome: "",
  endereco: "",
  vagas: "",
  inscricoes_ate: "",
  status: "rascunho",
  cargos_elegiveis: "Operador(a)\nMonitor(a)\nInstrutor(a)",
  cargos_almejados: "Supervisor(a)\nInstrutor(a)\nMonitor(a)\nAnalista\nCoordenador(a)\nOutro",
  modulos: [],
};

const moduloVazio = () => ({ titulo: "", data: "", hora_inicio: "", hora_fim: "", carga_horaria: "" });

function formatarCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

function periodoTurma(t) {
  if (!t.data_inicio) return "Datas a definir";
  if (!t.data_fim || t.data_fim === t.data_inicio) return formatDateBR(t.data_inicio);
  return `${formatDateBR(t.data_inicio)} a ${formatDateBR(t.data_fim)}`;
}

function turmaParaForm(t) {
  return {
    nome: t.nome || "",
    descricao: t.descricao || "",
    data_inicio: t.data_inicio || "",
    data_fim: t.data_fim || "",
    horario: t.horario || "",
    modalidade: t.modalidade || "presencial",
    local_nome: t.local_nome || "",
    endereco: t.endereco || "",
    vagas: t.vagas === null || t.vagas === undefined ? "" : String(t.vagas),
    inscricoes_ate: t.inscricoes_ate || "",
    status: t.status || "rascunho",
    cargos_elegiveis: (t.cargos_elegiveis || []).join("\n"),
    cargos_almejados: (t.cargos_almejados || []).join("\n"),
    modulos: (t.modulos || []).map((m) => ({
      titulo: m.titulo || "",
      data: m.data || "",
      hora_inicio: m.hora_inicio || "",
      hora_fim: m.hora_fim || "",
      carga_horaria: m.carga_horaria === null || m.carga_horaria === undefined ? "" : String(m.carga_horaria),
    })),
  };
}

export default function OficinaTalentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  // tela: 'lista' | 'form' | 'turma'
  const [tela, setTela] = useState("lista");
  const [turmaAtual, setTurmaAtual] = useState(null); // detalhe (com módulos)
  const [inscricoes, setInscricoes] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  const carregarTurmas = useCallback(async () => {
    try {
      setLoading(true);
      const dados = await apiFetch("/oficina-talentos/turmas");
      setTurmas(Array.isArray(dados) ? dados : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar as turmas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarTurmas();
  }, [carregarTurmas]);

  function limparMensagens() {
    setErro("");
    setAviso("");
  }

  const linkDaTurma = (t) =>
    typeof window !== "undefined" ? `${window.location.origin}/inscricao-oficina/${t.token}` : `/inscricao-oficina/${t.token}`;

  async function copiarLink(t) {
    limparMensagens();
    const link = linkDaTurma(t);
    try {
      await navigator.clipboard.writeText(link);
      setAviso("Link de inscrição copiado.");
    } catch {
      setAviso(`Link de inscrição: ${link}`);
    }
  }

  async function abrirTurma(id) {
    limparMensagens();
    try {
      const [detalhe, lista] = await Promise.all([
        apiFetch(`/oficina-talentos/turmas/${id}`),
        apiFetch(`/oficina-talentos/turmas/${id}/inscricoes`),
      ]);
      setTurmaAtual(detalhe);
      setInscricoes(Array.isArray(lista) ? lista : []);
      setFiltroStatus("todos");
      setBusca("");
      setTela("turma");
    } catch (e) {
      setErro(e.message || "Erro ao abrir a turma.");
    }
  }

  async function recarregarTurmaAtual() {
    if (!turmaAtual) return;
    await abrirTurma(turmaAtual.id);
    carregarTurmas();
  }

  function novaTurma() {
    limparMensagens();
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setTela("form");
  }

  async function editarTurma(id) {
    limparMensagens();
    try {
      const detalhe = await apiFetch(`/oficina-talentos/turmas/${id}`);
      setEditandoId(id);
      setForm(turmaParaForm(detalhe));
      setTela("form");
    } catch (e) {
      setErro(e.message || "Erro ao abrir a turma para edição.");
    }
  }

  async function salvarTurma(e) {
    e.preventDefault();
    limparMensagens();
    try {
      setSaving(true);
      const corpo = { ...form };
      const salva = editandoId
        ? await apiFetch(`/oficina-talentos/turmas/${editandoId}`, { method: "PUT", body: JSON.stringify(corpo) })
        : await apiFetch("/oficina-talentos/turmas", { method: "POST", body: JSON.stringify(corpo) });
      await carregarTurmas();
      setAviso(editandoId ? "Turma atualizada." : "Turma criada. Copie o link de inscrição e abra as inscrições quando quiser.");
      await abrirTurma(salva.id);
    } catch (e2) {
      setErro(e2.message || "Erro ao salvar a turma.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicar(id) {
    limparMensagens();
    try {
      const nova = await apiFetch(`/oficina-talentos/turmas/${id}/duplicar`, { method: "POST" });
      await carregarTurmas();
      setAviso("Turma duplicada como rascunho. Ajuste datas, local e abra as inscrições.");
      await editarTurma(nova.id);
    } catch (e) {
      setErro(e.message || "Erro ao duplicar a turma.");
    }
  }

  async function excluir(t) {
    limparMensagens();
    const qtd = turmaAtual && turmaAtual.id === t.id ? inscricoes.length : t.total_inscritos || 0;
    const msg =
      qtd > 0
        ? `Excluir a turma "${t.nome}" e as ${qtd} inscrição(ões) dela? Isso apaga também o histórico dessas inscrições e não pode ser desfeito.`
        : `Excluir a turma "${t.nome}"?`;
    if (!window.confirm(msg)) return;
    try {
      await apiFetch(`/oficina-talentos/turmas/${t.id}${qtd > 0 ? "?confirmar=true" : ""}`, { method: "DELETE" });
      setAviso(qtd > 0 ? `Turma e ${qtd} inscrição(ões) excluídas.` : "Turma excluída.");
      setTela("lista");
      setTurmaAtual(null);
      carregarTurmas();
    } catch (e) {
      setErro(e.message || "Erro ao excluir a turma.");
    }
  }

  async function alterarStatusInscricao(inscricao, status, forcar = false) {
    limparMensagens();
    try {
      await apiFetch(`/oficina-talentos/inscricoes/${inscricao.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, forcar }),
      });
      await recarregarTurmaAtual();
    } catch (e) {
      if (/vagas desta turma/i.test(e.message || "") && !forcar) {
        if (window.confirm(`${e.message}\n\nConfirmar mesmo assim, acima do limite de vagas?`)) {
          return alterarStatusInscricao(inscricao, status, true);
        }
        return;
      }
      setErro(e.message || "Erro ao atualizar a inscrição.");
    }
  }

  async function exportar() {
    limparMensagens();
    try {
      await apiDownload(`/oficina-talentos/turmas/${turmaAtual.id}/inscricoes/exportar`, `oficina-talentos-turma-${turmaAtual.id}.xlsx`);
    } catch (e) {
      setErro(e.message || "Erro ao exportar.");
    }
  }

  /* ─── derivados ─────────────────────────────────────────────────────── */
  const resumoGeral = useMemo(
    () => ({
      turmas: turmas.length,
      abertas: turmas.filter((t) => t.status === "inscricoes_abertas").length,
      inscritos: turmas.reduce((a, t) => a + t.total_inscritos, 0),
      conferencia: turmas.reduce((a, t) => a + t.em_conferencia, 0),
    }),
    [turmas]
  );

  const contagem = useMemo(() => {
    const c = { confirmado: 0, em_conferencia: 0, lista_espera: 0, cancelado: 0, desistente: 0 };
    inscricoes.forEach((i) => {
      if (c[i.status] !== undefined) c[i.status] += 1;
    });
    return c;
  }, [inscricoes]);

  const inscricoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return inscricoes.filter((i) => {
      if (filtroStatus !== "todos" && i.status !== filtroStatus) return false;
      if (!termo) return true;
      return [i.nome, i.matricula, i.cpf, i.email, i.cargo_atual, i.cargo_almejado]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [inscricoes, filtroStatus, busca]);

  const maxPorDia = useMemo(
    () => Math.max(1, ...(turmaAtual?.inscricoes_por_dia || []).map((d) => d.total)),
    [turmaAtual]
  );

  /* ─── render ────────────────────────────────────────────────────────── */
  return (
    <PortalShell>
      <div style={pagina}>
        <PageHero
          eyebrow="Ambiente Metodologia"
          title="Oficina de Talentos"
          subtitle="Turmas, link de inscrição, conferência por matrícula + CPF, lista de espera e histórico de quem quer formar liderança."
          actions={
            tela === "lista" ? (
              <button style={btnPrimario} onClick={novaTurma}>
                + Nova turma
              </button>
            ) : null
          }
        />

        {erro && <div style={alertaErro}>{erro}</div>}
        {aviso && <div style={alertaOk}>{aviso}</div>}

        {/* ───────────── LISTA ───────────── */}
        {tela === "lista" && (
          <>
            <div style={gradeKpi}>
              <StatCard title="Turmas" value={resumoGeral.turmas} accent={colors.primary} />
              <StatCard title="Inscrições abertas" value={resumoGeral.abertas} accent={colors.success} />
              <StatCard title="Inscritos (total)" value={resumoGeral.inscritos} accent={colors.accent} />
              <StatCard title="Em conferência" value={resumoGeral.conferencia} accent={colors.warning} />
            </div>

            <SectionCard title="Turmas da Oficina" subtitle="Cada turma tem o próprio link de inscrição, vagas e grade.">
              {loading ? (
                <div style={vazio}>Carregando…</div>
              ) : turmas.length === 0 ? (
                <div style={vazio}>Nenhuma turma ainda. Clique em “Nova turma” para criar a primeira.</div>
              ) : (
                <div style={gradeCards}>
                  {turmas.map((t) => {
                    const st = STATUS_TURMA[t.status] || STATUS_TURMA.rascunho;
                    const ocupadas = t.confirmados + t.em_conferencia;
                    return (
                      <div key={t.id} style={cartao}>
                        <div style={cartaoTopo}>
                          <div>
                            <div style={cartaoTitulo}>{t.nome}</div>
                            <div style={cartaoSub}>
                              {periodoTurma(t)}
                              {t.local_nome ? ` · ${t.local_nome}` : ""}
                            </div>
                          </div>
                          <span style={{ ...selo, background: st.bg, color: st.text }}>{st.label}</span>
                        </div>

                        <div style={numerosLinha}>
                          <Numero rotulo="Vagas" valor={t.vagas === null ? "—" : `${ocupadas}/${t.vagas}`} />
                          <Numero rotulo="Confirmados" valor={t.confirmados} />
                          <Numero rotulo="Conferência" valor={t.em_conferencia} />
                          <Numero rotulo="Espera" valor={t.lista_espera} />
                        </div>

                        <div style={acoes}>
                          <button style={btnPrimario} onClick={() => abrirTurma(t.id)}>
                            Abrir
                          </button>
                          <button style={btnSecundario} onClick={() => copiarLink(t)}>
                            Copiar link
                          </button>
                          <button style={btnSecundario} onClick={() => editarTurma(t.id)}>
                            Editar
                          </button>
                          <button style={btnSecundario} onClick={() => duplicar(t.id)}>
                            Duplicar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </>
        )}

        {/* ───────────── FORMULÁRIO ───────────── */}
        {tela === "form" && (
          <SectionCard
            title={editandoId ? "Editar turma" : "Nova turma"}
            subtitle="A grade e a carga horária são livres — preencha o que valer para esta turma."
            action={
              <button style={btnSecundario} onClick={() => (turmaAtual && editandoId ? abrirTurma(editandoId) : setTela("lista"))}>
                ← Voltar
              </button>
            }
          >
            <form onSubmit={salvarTurma}>
              <div style={gradeForm}>
                <Campo rotulo="Nome da turma *" cheio>
                  <input style={entrada} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Oficina de Talentos — Feira de Santana · Fev/2027" />
                </Campo>
                <Campo rotulo="Apresentação (aparece na página de inscrição)" cheio>
                  <textarea style={{ ...entrada, minHeight: 90, resize: "vertical" }} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </Campo>
                <Campo rotulo="Início">
                  <input type="date" style={entrada} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
                </Campo>
                <Campo rotulo="Término">
                  <input type="date" style={entrada} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                </Campo>
                <Campo rotulo="Horário">
                  <input style={entrada} value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="Ex.: 08h às 12h" />
                </Campo>
                <Campo rotulo="Modalidade">
                  <select style={entrada} value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value })}>
                    {Object.entries(MODALIDADES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Local">
                  <input style={entrada} value={form.local_nome} onChange={(e) => setForm({ ...form, local_nome: e.target.value })} placeholder="Ex.: Tel Feira de Santana" />
                </Campo>
                <Campo rotulo="Endereço">
                  <input style={entrada} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                </Campo>
                <Campo rotulo="Vagas (vazio = sem limite)">
                  <input type="number" min="0" style={entrada} value={form.vagas} onChange={(e) => setForm({ ...form, vagas: e.target.value })} />
                </Campo>
                <Campo rotulo="Inscrições até (opcional)">
                  <input type="date" style={entrada} value={form.inscricoes_ate} onChange={(e) => setForm({ ...form, inscricoes_ate: e.target.value })} />
                </Campo>
                <Campo rotulo="Situação da turma" cheio>
                  <select style={entrada} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_TURMA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <span style={dica}>
                    O link só funciona fora de “Rascunho” e só aceita inscrições em “Inscrições abertas”. Encerre as
                    inscrições aqui quando a procura for suficiente.
                  </span>
                </Campo>
                <Campo rotulo="Cargos elegíveis (um por linha)">
                  <textarea style={{ ...entrada, minHeight: 90 }} value={form.cargos_elegiveis} onChange={(e) => setForm({ ...form, cargos_elegiveis: e.target.value })} />
                </Campo>
                <Campo rotulo="Opções de cargo almejado (um por linha)">
                  <textarea style={{ ...entrada, minHeight: 90 }} value={form.cargos_almejados} onChange={(e) => setForm({ ...form, cargos_almejados: e.target.value })} />
                </Campo>
              </div>

              <div style={gradeBloco}>
                <div style={gradeBlocoTopo}>
                  <h3 style={h3}>Grade / programação</h3>
                  <button type="button" style={btnSecundario} onClick={() => setForm({ ...form, modulos: [...form.modulos, moduloVazio()] })}>
                    + Adicionar módulo
                  </button>
                </div>
                {form.modulos.length === 0 && <div style={dica}>Sem módulos por enquanto — a grade pode ser preenchida depois.</div>}
                {form.modulos.map((m, idx) => (
                  <div key={idx} style={moduloCard}>
                    <input
                      style={entrada}
                      placeholder="Título do módulo"
                      value={m.titulo}
                      onChange={(e) => setForm({ ...form, modulos: form.modulos.map((x, i) => (i === idx ? { ...x, titulo: e.target.value } : x)) })}
                    />
                    <div style={moduloLinha}>
                      <input type="date" style={entrada} value={m.data} onChange={(e) => setForm({ ...form, modulos: form.modulos.map((x, i) => (i === idx ? { ...x, data: e.target.value } : x)) })} />
                      <input type="time" style={entrada} value={m.hora_inicio} onChange={(e) => setForm({ ...form, modulos: form.modulos.map((x, i) => (i === idx ? { ...x, hora_inicio: e.target.value } : x)) })} />
                      <input type="time" style={entrada} value={m.hora_fim} onChange={(e) => setForm({ ...form, modulos: form.modulos.map((x, i) => (i === idx ? { ...x, hora_fim: e.target.value } : x)) })} />
                      <input type="number" min="0" step="0.5" style={entrada} placeholder="Carga horária (h)" value={m.carga_horaria} onChange={(e) => setForm({ ...form, modulos: form.modulos.map((x, i) => (i === idx ? { ...x, carga_horaria: e.target.value } : x)) })} />
                      <button type="button" style={btnPerigo} onClick={() => setForm({ ...form, modulos: form.modulos.filter((_, i) => i !== idx) })}>
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
                {form.modulos.length > 0 && (
                  <div style={dica}>
                    Carga horária total da turma:{" "}
                    <strong>{form.modulos.reduce((a, m) => a + (Number(String(m.carga_horaria).replace(",", ".")) || 0), 0)} h</strong>
                  </div>
                )}
              </div>

              <div style={rodapeForm}>
                <button type="button" style={btnSecundario} onClick={() => (turmaAtual && editandoId ? abrirTurma(editandoId) : setTela("lista"))}>
                  Cancelar
                </button>
                <button type="submit" style={btnSalvar} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar turma"}
                </button>
              </div>
            </form>
          </SectionCard>
        )}

        {/* ───────────── TURMA (inscritos) ───────────── */}
        {tela === "turma" && turmaAtual && (
          <>
            <SectionCard
              title={turmaAtual.nome}
              subtitle={`${periodoTurma(turmaAtual)}${turmaAtual.horario ? ` · ${turmaAtual.horario}` : ""}${
                turmaAtual.local_nome ? ` · ${turmaAtual.local_nome}` : ""
              }`}
              action={
                <div style={acoes}>
                  <button style={btnSecundario} onClick={() => { setTela("lista"); carregarTurmas(); }}>
                    ← Turmas
                  </button>
                  <button style={btnSecundario} onClick={() => copiarLink(turmaAtual)}>
                    Copiar link
                  </button>
                  <button style={btnSecundario} onClick={() => editarTurma(turmaAtual.id)}>
                    Editar
                  </button>
                  <button style={btnPerigo} onClick={() => excluir(turmaAtual)}>
                    Excluir
                  </button>
                </div>
              }
            >
              <div style={linhaLink}>
                <span style={{ ...selo, background: (STATUS_TURMA[turmaAtual.status] || STATUS_TURMA.rascunho).bg, color: (STATUS_TURMA[turmaAtual.status] || STATUS_TURMA.rascunho).text }}>
                  {(STATUS_TURMA[turmaAtual.status] || STATUS_TURMA.rascunho).label}
                </span>
                <code style={codigoLink}>{linkDaTurma(turmaAtual)}</code>
              </div>

              <div style={gradeKpi}>
                <StatCard title="Vagas" value={turmaAtual.vagas === null ? "Sem limite" : `${contagem.confirmado + contagem.em_conferencia}/${turmaAtual.vagas}`} accent={colors.primary} />
                <StatCard title="Confirmados" value={contagem.confirmado} accent={colors.success} />
                <StatCard title="Em conferência" value={contagem.em_conferencia} accent={colors.warning} />
                <StatCard title="Lista de espera" value={contagem.lista_espera} accent={colors.info} />
              </div>

              {turmaAtual.modulos?.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={h3}>
                    Grade{turmaAtual.carga_horaria_prevista ? ` · ${Number(turmaAtual.carga_horaria_prevista)} h` : ""}
                  </h3>
                  <div style={{ display: "grid", gap: 6 }}>
                    {turmaAtual.modulos.map((m) => (
                      <div key={m.id} style={moduloResumo}>
                        <strong>{m.titulo}</strong>
                        <span style={{ color: colors.textSecondary }}>
                          {[m.data ? formatDateBR(m.data) : null, m.hora_inicio && m.hora_fim ? `${m.hora_inicio}–${m.hora_fim}` : null, m.carga_horaria ? `${m.carga_horaria} h` : null].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {turmaAtual.inscricoes_por_dia?.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={h3}>Inscrições por dia</h3>
                  <div style={{ display: "grid", gap: 4 }}>
                    {turmaAtual.inscricoes_por_dia.map((d) => (
                      <div key={d.dia} style={barraLinha}>
                        <span style={barraRotulo}>{formatDateBR(d.dia)}</span>
                        <div style={barraTrilho}>
                          <div style={{ ...barraPreenchida, width: `${(d.total / maxPorDia) * 100}%` }} />
                        </div>
                        <span style={barraValor}>{d.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Inscritos"
              subtitle="“Em conferência” = matrícula + CPF não bateram com o cadastro ou o cargo está fora da lista elegível. Cargo almejado é visível só para a Metodologia."
              action={
                <button style={btnPrimario} onClick={exportar}>
                  Exportar Excel
                </button>
              }
            >
              <div style={filtros}>
                <input style={{ ...entrada, flex: 1, minWidth: 220 }} placeholder="Buscar por nome, matrícula, CPF, e-mail ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <select style={{ ...entrada, width: 200 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                  <option value="todos">Todas as situações ({inscricoes.length})</option>
                  {Object.entries(STATUS_INSCRICAO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label} ({contagem[k]})
                    </option>
                  ))}
                </select>
              </div>

              {inscricoesFiltradas.length === 0 ? (
                <div style={vazio}>Nenhuma inscrição encontrada.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tabela}>
                    <thead>
                      <tr>
                        {["Nome", "Matrícula / CPF", "Cargo atual → almejado", "Situação", "Ações"].map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inscricoesFiltradas.map((i) => {
                        const st = STATUS_INSCRICAO[i.status] || STATUS_INSCRICAO.em_conferencia;
                        return (
                          <tr key={i.id}>
                            <td style={td}>
                              <strong>{i.nome}</strong>
                              <div style={tdSub}>{i.email}</div>
                              <div style={tdSub}>
                                {[i.escolaridade, i.horario_trabalho].filter(Boolean).join(" · ")}
                              </div>
                            </td>
                            <td style={td}>
                              {i.matricula}
                              <div style={tdSub}>{formatarCpf(i.cpf)}</div>
                              <div style={tdSub}>{i.pessoa_id ? (i.vinculo === "manual" ? "Cadastro: confirmado por você" : "Cadastro: matrícula + CPF ✓") : "Sem vínculo ao cadastro"}</div>
                            </td>
                            <td style={td}>
                              {i.cargo_atual || "—"}
                              <div style={tdSub}>→ {i.cargo_almejado === "Outro" && i.cargo_almejado_outro ? `Outro: ${i.cargo_almejado_outro}` : i.cargo_almejado || "—"}</div>
                            </td>
                            <td style={td}>
                              <span style={{ ...selo, background: st.bg, color: st.text }}>{st.label}</span>
                              {i.motivo_conferencia && <div style={{ ...tdSub, color: colors.warningText }}>{i.motivo_conferencia}</div>}
                            </td>
                            <td style={td}>
                              <div style={acoes}>
                                {i.status !== "confirmado" && (
                                  <button style={btnMini(colors.successLight, colors.successText)} onClick={() => alterarStatusInscricao(i, "confirmado")}>
                                    Confirmar
                                  </button>
                                )}
                                {i.status !== "lista_espera" && i.status !== "cancelado" && i.status !== "desistente" && (
                                  <button style={btnMini(colors.infoLight, "#0369a1")} onClick={() => alterarStatusInscricao(i, "lista_espera")}>
                                    Espera
                                  </button>
                                )}
                                {i.status !== "cancelado" && (
                                  <button style={btnMini(colors.dangerLight, colors.dangerText)} onClick={() => alterarStatusInscricao(i, "cancelado")}>
                                    Cancelar
                                  </button>
                                )}
                                {(i.status === "cancelado" || i.status === "desistente") && (
                                  <button style={btnMini(colors.warningLight, colors.warningText)} onClick={() => alterarStatusInscricao(i, "em_conferencia")}>
                                    Reabrir
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </PortalShell>
  );
}

function Campo({ rotulo, cheio, children }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: cheio ? "1 / -1" : undefined, fontSize: 12, fontWeight: 700, color: colors.textSecondary, alignContent: "start" }}>
      {rotulo}
      {children}
    </label>
  );
}

function Numero({ rotulo, valor }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: colors.textPrimary }}>{valor}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, fontWeight: 700 }}>{rotulo}</div>
    </div>
  );
}

/* ─── estilos ──────────────────────────────────────────────────────────── */
const pagina = { padding: "28px 32px", maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 };
const gradeKpi = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 };
const gradeCards = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 };
const cartao = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 18, display: "grid", gap: 14 };
const cartaoTopo = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const cartaoTitulo = { fontWeight: 800, fontSize: 15, color: colors.textPrimary };
const cartaoSub = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const numerosLinha = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "10px 0", borderTop: `1px solid ${colors.surfaceMuted}`, borderBottom: `1px solid ${colors.surfaceMuted}` };
const acoes = { display: "flex", gap: 8, flexWrap: "wrap" };
const selo = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: radius.pill, whiteSpace: "nowrap", display: "inline-block" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 0", fontSize: 14 };
const alertaErro = { background: colors.dangerLight, color: colors.dangerText, border: `1px solid ${colors.dangerText}33`, borderRadius: radius.sm, padding: "12px 16px", fontSize: 14, fontWeight: 700 };
const alertaOk = { background: colors.successLight, color: colors.successText, border: `1px solid ${colors.successText}33`, borderRadius: radius.sm, padding: "12px 16px", fontSize: 14, fontWeight: 700, wordBreak: "break-all" };
const gradeForm = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 };
const entrada = { width: "100%", padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: colors.surface, fontWeight: 500, color: colors.textPrimary };
const dica = { fontSize: 12, color: colors.textMuted, fontWeight: 500, lineHeight: 1.5 };
const h3 = { fontSize: 15, fontWeight: 800, margin: 0, color: colors.textPrimary };
const gradeBloco = { display: "grid", gap: 10, marginBottom: 24, paddingTop: 16, borderTop: `1px solid ${colors.surfaceMuted}` };
const gradeBlocoTopo = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const moduloCard = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 12, display: "grid", gap: 8 };
const moduloLinha = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "center" };
const rodapeForm = { display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: `1px solid ${colors.surfaceMuted}` };
const linhaLink = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const codigoLink = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: "6px 10px", fontSize: 12, wordBreak: "break-all" };
const moduloResumo = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: colors.surfaceMuted, borderRadius: radius.sm, padding: "8px 12px", fontSize: 13 };
const barraLinha = { display: "grid", gridTemplateColumns: "90px 1fr 32px", alignItems: "center", gap: 10 };
const barraRotulo = { fontSize: 12, color: colors.textSecondary };
const barraTrilho = { height: 8, background: colors.surfaceMuted, borderRadius: radius.pill, overflow: "hidden" };
const barraPreenchida = { height: "100%", background: colors.primary, borderRadius: radius.pill };
const barraValor = { fontSize: 12, fontWeight: 800, color: colors.textPrimary, textAlign: "right" };
const filtros = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, whiteSpace: "nowrap" };
const td = { padding: "12px", verticalAlign: "top", borderBottom: `1px solid ${colors.surfaceMuted}` };
const tdSub = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const btnPrimario = { padding: "9px 18px", background: colors.accent, color: "#fff", border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSecundario = { padding: "9px 18px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnPerigo = { padding: "9px 18px", background: colors.dangerLight, color: colors.dangerText, border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSalvar = { padding: "10px 24px", background: colors.navy, color: "#fff", border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 14, fontWeight: 800 };
const btnMini = (bg, cor) => ({ padding: "5px 10px", background: bg, color: cor, border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 12, fontWeight: 700 });
