"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/PortalShell";
import SectionCard from "../../../../components/SectionCard";
import StatCard from "../../../../components/StatCard";
import { apiFetch } from "../../../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("pt-BR");
}

function toInputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function statusLabel(value) {
  const key = String(value || "").toLowerCase().trim();

  if (key === "ministrada") return "Ministrada";
  if (key === "parcial") return "Parcial";
  if (key === "reprogramada") return "Reprogramada";
  if (key === "cancelada") return "Cancelada";
  return "Planejada";
}

function statusStyle(value) {
  const label = statusLabel(value);

  const base = {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (label === "Ministrada") return { ...base, background: "#dcfce7", color: "#166534" };
  if (label === "Parcial") return { ...base, background: "#fef3c7", color: "#92400e" };
  if (label === "Reprogramada") return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  if (label === "Cancelada") return { ...base, background: "#fee2e2", color: "#b91c1c" };
  return { ...base, background: "#e2e8f0", color: "#475569" };
}

function desempenhoBadge(value) {
  const taxa = Number(value || 0);

  const base = {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (taxa >= 90) return { ...base, background: "#dcfce7", color: "#166534" };
  if (taxa >= 70) return { ...base, background: "#fef3c7", color: "#92400e" };
  return { ...base, background: "#fee2e2", color: "#b91c1c" };
}

const emptyForm = {
  id: null,
  dia_numero: "",
  data_aula: "",
  ordem: 1,
  titulo: "",
  objetivo: "",
  conteudo_planejado: "",
  metodologia: "",
  carga_horaria_planejada: "",
  instrutor_responsavel: "",
  material_apoio: "",
  status_execucao: "planejada",
  conteudo_ministrado: "",
  carga_horaria_real: "",
  observacoes_execucao: "",
  reprogramada: false,
  motivo_reprogramacao: "",
};

export default function CronogramaTurmaPage({ params }) {
  const { id } = params;

  const [treinamento, setTreinamento] = useState(null);
  const [aulas, setAulas] = useState([]);
  const [resumoApi, setResumoApi] = useState(null);
  const [presencaResumoMap, setPresencaResumoMap] = useState({});
  const [presencaModal, setPresencaModal] = useState({
    open: false,
    aula: null,
    registros: [],
  });

  const [form, setForm] = useState(emptyForm);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [salvandoPresenca, setSalvandoPresenca] = useState(false);

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    try {
      setLoading(true);
      setErro("");

      const [turmaData, aulasData, resumoData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`).catch(() => null),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
        apiFetch(`/turma-aulas/resumo/${id}`).catch(() => null),
      ]);

      const listaAulas = Array.isArray(aulasData) ? aulasData : [];

      setTreinamento(turmaData || null);
      setAulas(listaAulas);
      setResumoApi(resumoData || null);

      const resumoEntries = await Promise.all(
        listaAulas.map(async (aula) => {
          const data = await apiFetch(`/presenca-aulas/resumo/${aula.id}`).catch(() => null);
          return [aula.id, data?.resumo || null];
        })
      );

      const resumoMap = {};
      resumoEntries.forEach(([aulaId, resumo]) => {
        resumoMap[aulaId] = resumo;
      });
      setPresencaResumoMap(resumoMap);
    } catch (error) {
      setErro(error.message || "Erro ao carregar cronograma da turma.");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function limparFormulario() {
    setForm({
      ...emptyForm,
      instrutor_responsavel: treinamento?.instrutor || "",
    });
    setErro("");
    setSucesso("");
  }

  function editarAula(item) {
    setForm({
      id: item.id,
      dia_numero: String(item.dia_numero || ""),
      data_aula: toInputDate(item.data_aula),
      ordem: String(item.ordem || 1),
      titulo: item.titulo || "",
      objetivo: item.objetivo || "",
      conteudo_planejado: item.conteudo_planejado || "",
      metodologia: item.metodologia || "",
      carga_horaria_planejada: String(item.carga_horaria_planejada || ""),
      instrutor_responsavel: item.instrutor_responsavel || "",
      material_apoio: item.material_apoio || "",
      status_execucao: item.status_execucao || "planejada",
      conteudo_ministrado: item.conteudo_ministrado || "",
      carga_horaria_real: String(item.carga_horaria_real || ""),
      observacoes_execucao: item.observacoes_execucao || "",
      reprogramada: Boolean(item.reprogramada),
      motivo_reprogramacao: item.motivo_reprogramacao || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarAula(event) {
    event.preventDefault();

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const payload = {
        treinamento_id: Number(id),
        dia_numero: Number(form.dia_numero || 0),
        data_aula: form.data_aula,
        ordem: Number(form.ordem || 1),
        titulo: form.titulo,
        objetivo: form.objetivo,
        conteudo_planejado: form.conteudo_planejado,
        metodologia: form.metodologia,
        carga_horaria_planejada: Number(form.carga_horaria_planejada || 0),
        instrutor_responsavel: form.instrutor_responsavel,
        material_apoio: form.material_apoio,
        status_execucao: form.status_execucao,
        conteudo_ministrado: form.conteudo_ministrado,
        carga_horaria_real: Number(form.carga_horaria_real || 0),
        observacoes_execucao: form.observacoes_execucao,
        reprogramada: form.reprogramada,
        motivo_reprogramacao: form.motivo_reprogramacao,
        ministrada_em:
          form.status_execucao === "ministrada" || form.status_execucao === "parcial"
            ? new Date().toISOString().slice(0, 19).replace("T", " ")
            : null,
      };

      if (form.id) {
        await apiFetch(`/turma-aulas/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Aula atualizada com sucesso.");
      } else {
        await apiFetch("/turma-aulas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Aula criada com sucesso.");
      }

      limparFormulario();
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao salvar aula.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirAula(idAula) {
    const confirmar = window.confirm("Deseja realmente excluir esta aula?");
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");

      await apiFetch(`/turma-aulas/${idAula}`, {
        method: "DELETE",
      });

      setSucesso("Aula excluída com sucesso.");
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao excluir aula.");
    }
  }

  async function gerarCronogramaBase() {
    const confirmar = window.confirm(
      "Deseja gerar o cronograma base desta turma? Isso cria uma aula inicial por dia."
    );
    if (!confirmar) return;

    try {
      setGerando(true);
      setErro("");
      setSucesso("");

      await apiFetch("/turma-aulas/gerar-cronograma", {
        method: "POST",
        body: JSON.stringify({ treinamento_id: Number(id) }),
      });

      setSucesso("Cronograma base gerado com sucesso.");
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao gerar cronograma.");
    } finally {
      setGerando(false);
    }
  }

  async function abrirPresencaAula(aula) {
    try {
      setErro("");
      setSucesso("");

      await apiFetch("/presenca-aulas/inicializar", {
        method: "POST",
        body: JSON.stringify({ turma_aula_id: Number(aula.id) }),
      });

      const registros = await apiFetch(`/presenca-aulas?turma_aula_id=${aula.id}`).catch(() => []);

      setPresencaModal({
        open: true,
        aula,
        registros: Array.isArray(registros) ? registros : [],
      });
    } catch (error) {
      setErro(error.message || "Erro ao abrir presença da aula.");
    }
  }

  function alterarStatusPresenca(index, status) {
    setPresencaModal((prev) => {
      const next = [...prev.registros];
      next[index] = {
        ...next[index],
        status,
      };
      return { ...prev, registros: next };
    });
  }

  function alterarJustificativa(index, justificativa) {
    setPresencaModal((prev) => {
      const next = [...prev.registros];
      next[index] = {
        ...next[index],
        justificativa,
      };
      return { ...prev, registros: next };
    });
  }

  async function salvarPresenca() {
    try {
      setSalvandoPresenca(true);
      setErro("");
      setSucesso("");

      await apiFetch("/presenca-aulas/salvar", {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(presencaModal.aula.id),
          registros: presencaModal.registros.map((item) => ({
            treinando_nome: item.treinando_nome,
            status: item.status,
            justificativa: item.justificativa,
          })),
        }),
      });

      setSucesso("Presença por aula salva com sucesso.");
      setPresencaModal({ open: false, aula: null, registros: [] });
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao salvar presença da aula.");
    } finally {
      setSalvandoPresenca(false);
    }
  }

  const resumo = useMemo(() => {
    return resumoApi?.resumo || {
      total_aulas: 0,
      planejadas: 0,
      ministradas: 0,
      parciais: 0,
      reprogramadas: 0,
      canceladas: 0,
      carga_planejada: 0,
      carga_real: 0,
      aderencia_aulas: 0,
      aderencia_carga: 0,
      desvio_carga: 0,
    };
  }, [resumoApi]);

  const agrupadas = useMemo(() => {
    const mapa = {};

    aulas.forEach((aula) => {
      const chave = `${aula.dia_numero}-${toInputDate(aula.data_aula)}`;
      if (!mapa[chave]) {
        mapa[chave] = {
          dia_numero: aula.dia_numero,
          data_aula: aula.data_aula,
          aulas: [],
        };
      }
      mapa[chave].aulas.push(aula);
    });

    return Object.values(mapa).sort((a, b) => {
      if (a.dia_numero !== b.dia_numero) return a.dia_numero - b.dia_numero;
      return String(a.data_aula).localeCompare(String(b.data_aula));
    });
  }, [aulas]);

  const resumoDias = useMemo(() => {
    return Array.isArray(resumoApi?.por_dia) ? resumoApi.por_dia : [];
  }, [resumoApi]);

  const alertas = useMemo(() => {
    return Array.isArray(resumoApi?.alertas) ? resumoApi.alertas : [];
  }, [resumoApi]);

  const topRight = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => (window.location.href = `/turma/${id}`)}
        style={btnSecondary}
      >
        Voltar para turma
      </button>
      <button
        type="button"
        onClick={gerarCronogramaBase}
        style={btnPrimary}
        disabled={gerando}
      >
        {gerando ? "Gerando..." : "Gerar cronograma base"}
      </button>
    </div>
  );

  return (
    <PortalShell
      title="Cronograma Pedagógico"
      subtitle={`Planejamento e execução da turma ${treinamento?.tema || ""}`}
      topRight={topRight}
    >
      {loading ? (
        <div style={loadingBox}>Carregando cronograma...</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {erro ? <div style={errorBox}>{erro}</div> : null}
          {sucesso ? <div style={successBox}>{sucesso}</div> : null}

          <div style={heroPanel}>
            <div>
              <div style={heroBadge}>Plano de execução</div>
              <h2 style={heroTitle}>Aderência da turma</h2>
              <p style={heroText}>
                Acompanhe o cronograma planejado, o que foi realmente ministrado, os desvios da execução e a presença por aula.
              </p>
            </div>

            <div style={heroMetrics}>
              <div style={heroMetricCard}>
                <span style={heroMetricLabel}>Aderência de aulas</span>
                <strong style={heroMetricValue}>{fmt(resumo.aderencia_aulas || 0)}%</strong>
              </div>
              <div style={heroMetricCard}>
                <span style={heroMetricLabel}>Aderência de carga</span>
                <strong style={heroMetricValue}>{fmt(resumo.aderencia_carga || 0)}%</strong>
              </div>
              <div style={heroMetricCard}>
                <span style={heroMetricLabel}>Desvio de carga</span>
                <strong style={heroMetricValue}>{fmt(resumo.desvio_carga || 0)}h</strong>
              </div>
            </div>
          </div>

          <div style={heroGrid}>
            <StatCard title="Aulas" value={fmt(resumo.total_aulas || 0)} subtitle="Total planejado" accent="#2563eb" />
            <StatCard title="Ministradas" value={fmt(resumo.ministradas || 0)} subtitle="Execução concluída" accent="#16a34a" />
            <StatCard title="Parciais" value={fmt(resumo.parciais || 0)} subtitle="Execução incompleta" accent="#f59e0b" />
            <StatCard title="Planejadas" value={fmt(resumo.planejadas || 0)} subtitle="Aguardando execução" accent="#475569" />
          </div>

          <div style={heroGrid}>
            <StatCard title="Reprogramadas" value={fmt(resumo.reprogramadas || 0)} subtitle="Aulas remanejadas" accent="#1d4ed8" />
            <StatCard title="Canceladas" value={fmt(resumo.canceladas || 0)} subtitle="Não executadas" accent="#dc2626" />
            <StatCard title="Carga planejada" value={`${fmt(resumo.carga_planejada || 0)}h`} subtitle="Somatório previsto" accent="#06b6d4" />
            <StatCard title="Carga real" value={`${fmt(resumo.carga_real || 0)}h`} subtitle="Somatório ministrado" accent="#0891b2" />
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Alertas prontos para acompanhamento da execução da turma."
          >
            {alertas.length ? (
              <div style={alertsGrid}>
                {alertas.map((item, index) => (
                  <div key={`${item}-${index}`} style={alertItem}>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyText}>Sem alertas no momento.</div>
            )}
          </SectionCard>

          <SectionCard
            title="Painel por dia"
            subtitle="Resumo diário da aderência da turma."
          >
            {resumoDias.length ? (
              <div style={daysSummaryGrid}>
                {resumoDias.map((dia) => (
                  <div key={`${dia.dia_numero}-${dia.data_aula}`} style={daySummaryCard}>
                    <div style={daySummaryTop}>
                      <div>
                        <div style={daySummaryTitle}>Dia {dia.dia_numero}</div>
                        <div style={daySummaryMeta}>{formatDate(dia.data_aula)}</div>
                      </div>
                      <span style={desempenhoBadge(dia.aderencia_aulas)}>
                        {fmt(dia.aderencia_aulas)}%
                      </span>
                    </div>

                    <div style={daySummaryLine}>
                      {fmt(dia.total_aulas)} aula(s) • {fmt(dia.ministradas)} ministrada(s) • {fmt(dia.parciais)} parcial(is)
                    </div>
                    <div style={daySummaryLine}>
                      {fmt(dia.planejadas)} planejada(s) • {fmt(dia.reprogramadas)} reprogramada(s) • {fmt(dia.canceladas)} cancelada(s)
                    </div>
                    <div style={daySummaryLine}>
                      Carga: {fmt(dia.carga_real)}h / {fmt(dia.carga_planejada)}h
                    </div>
                    <div style={daySummaryLine}>
                      Desvio: {fmt(dia.desvio_carga)}h
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyText}>Sem dados diários para exibir.</div>
            )}
          </SectionCard>

          <SectionCard
            title={form.id ? "Editar aula da turma" : "Nova aula da turma"}
            subtitle="Cadastre o plano da aula e, quando necessário, registre o que foi realmente ministrado."
          >
            <form onSubmit={salvarAula} style={formGrid}>
              <div style={fieldWrap}>
                <label style={label}>Dia da turma</label>
                <input style={input} type="number" name="dia_numero" value={form.dia_numero} onChange={handleChange} min="1" />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Data da aula</label>
                <input style={input} type="date" name="data_aula" value={form.data_aula} onChange={handleChange} />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Ordem no dia</label>
                <input style={input} type="number" name="ordem" value={form.ordem} onChange={handleChange} min="1" />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Status</label>
                <select style={input} name="status_execucao" value={form.status_execucao} onChange={handleChange}>
                  <option value="planejada">Planejada</option>
                  <option value="ministrada">Ministrada</option>
                  <option value="parcial">Parcial</option>
                  <option value="reprogramada">Reprogramada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Título</label>
                <input style={input} name="titulo" value={form.titulo} onChange={handleChange} placeholder="Ex.: Sistemas e acessos" />
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Objetivo</label>
                <textarea style={textarea} name="objetivo" value={form.objetivo} onChange={handleChange} rows={3} />
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Conteúdo planejado</label>
                <textarea style={textarea} name="conteudo_planejado" value={form.conteudo_planejado} onChange={handleChange} rows={4} />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Metodologia</label>
                <input style={input} name="metodologia" value={form.metodologia} onChange={handleChange} placeholder="Ex.: expositiva, prática, simulação" />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Carga horária planejada</label>
                <input style={input} type="number" step="0.1" name="carga_horaria_planejada" value={form.carga_horaria_planejada} onChange={handleChange} />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Instrutor responsável</label>
                <input style={input} name="instrutor_responsavel" value={form.instrutor_responsavel} onChange={handleChange} />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Material de apoio</label>
                <input style={input} name="material_apoio" value={form.material_apoio} onChange={handleChange} placeholder="Link ou referência" />
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Conteúdo ministrado</label>
                <textarea style={textarea} name="conteudo_ministrado" value={form.conteudo_ministrado} onChange={handleChange} rows={4} />
              </div>

              <div style={fieldWrap}>
                <label style={label}>Carga horária real</label>
                <input style={input} type="number" step="0.1" name="carga_horaria_real" value={form.carga_horaria_real} onChange={handleChange} />
              </div>

              <div style={{ ...fieldWrap, alignSelf: "end" }}>
                <label style={checkboxWrap}>
                  <input type="checkbox" name="reprogramada" checked={form.reprogramada} onChange={handleChange} />
                  <span>Marcar como reprogramada</span>
                </label>
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Motivo da reprogramação</label>
                <textarea style={textarea} name="motivo_reprogramacao" value={form.motivo_reprogramacao} onChange={handleChange} rows={3} />
              </div>

              <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                <label style={label}>Observações da execução</label>
                <textarea style={textarea} name="observacoes_execucao" value={form.observacoes_execucao} onChange={handleChange} rows={4} />
              </div>

              <div style={actionsRow}>
                <button type="submit" style={btnPrimary} disabled={salvando}>
                  {salvando ? "Salvando..." : form.id ? "Atualizar aula" : "Cadastrar aula"}
                </button>

                <button type="button" style={btnSecondary} onClick={limparFormulario}>
                  Limpar
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="Cronograma por dia"
            subtitle="Acompanhe o planejado, o ministrado e a presença por aula."
          >
            {agrupadas.length ? (
              <div style={daysGrid}>
                {agrupadas.map((dia) => (
                  <div key={`${dia.dia_numero}-${dia.data_aula}`} style={dayCard}>
                    <div style={dayHeader}>
                      <div>
                        <div style={dayTitle}>Dia {dia.dia_numero}</div>
                        <div style={dayMeta}>{formatDate(dia.data_aula)}</div>
                      </div>
                    </div>

                    <div style={aulasGrid}>
                      {dia.aulas.map((aula) => {
                        const resumoPresenca = presencaResumoMap[aula.id];

                        return (
                          <div key={aula.id} style={aulaCard}>
                            <div style={aulaTop}>
                              <strong style={aulaTitle}>
                                {aula.ordem}. {aula.titulo}
                              </strong>
                              <span style={statusStyle(aula.status_execucao)}>
                                {statusLabel(aula.status_execucao)}
                              </span>
                            </div>

                            <div style={aulaText}>
                              <strong>Objetivo:</strong> {aula.objetivo || "-"}
                            </div>
                            <div style={aulaText}>
                              <strong>Planejado:</strong> {aula.conteudo_planejado || "-"}
                            </div>
                            <div style={aulaText}>
                              <strong>Ministrado:</strong> {aula.conteudo_ministrado || "-"}
                            </div>

                            <div style={aulaMiniRow}>
                              <span>Planejada: {Number(aula.carga_horaria_planejada || 0)}h</span>
                              <span>Real: {Number(aula.carga_horaria_real || 0)}h</span>
                            </div>

                            <div style={aulaMiniRow}>
                              <span>Instrutor: {aula.instrutor_responsavel || "-"}</span>
                            </div>

                            <div style={presencaBox}>
                              <div style={presencaTitle}>Presença da aula</div>
                              {resumoPresenca ? (
                                <div style={presencaGrid}>
                                  <span>{fmt(resumoPresenca.total)} treinandos</span>
                                  <span>{fmt(resumoPresenca.presentes)} presentes</span>
                                  <span>{fmt(resumoPresenca.ausentes)} ausentes</span>
                                  <span>{fmt(resumoPresenca.justificados)} justificados</span>
                                  <span>{fmt(resumoPresenca.pendentes)} pendentes</span>
                                  <span style={desempenhoBadge(resumoPresenca.taxa_presenca)}>
                                    {fmt(resumoPresenca.taxa_presenca)}%
                                  </span>
                                </div>
                              ) : (
                                <div style={emptyText}>Sem presença inicializada.</div>
                              )}
                            </div>

                            <div style={aulaActions}>
                              <button type="button" style={btnPresence} onClick={() => abrirPresencaAula(aula)}>
                                Presença por aula
                              </button>
                              <button type="button" style={btnEdit} onClick={() => editarAula(aula)}>
                                Editar
                              </button>
                              <button type="button" style={btnDelete} onClick={() => excluirAula(aula.id)}>
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyText}>
                Nenhuma aula cadastrada. Você pode gerar o cronograma base ou cadastrar manualmente.
              </div>
            )}
          </SectionCard>

          {presencaModal.open ? (
            <SectionCard
              title={`Presença da aula: ${presencaModal.aula?.titulo || ""}`}
              subtitle="Atualize o status de presença dos treinandos vinculados a esta aula."
            >
              <div style={presenceList}>
                {presencaModal.registros.map((item, index) => (
                  <div key={`${item.treinando_nome}-${index}`} style={presenceRow}>
                    <div style={presenceName}>{item.treinando_nome}</div>

                    <div style={presenceControls}>
                      <select
                        style={input}
                        value={item.status || "pendente"}
                        onChange={(e) => alterarStatusPresenca(index, e.target.value)}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="presente">Presente</option>
                        <option value="ausente">Ausente</option>
                        <option value="justificado">Justificado</option>
                      </select>

                      <input
                        style={input}
                        value={item.justificativa || ""}
                        onChange={(e) => alterarJustificativa(index, e.target.value)}
                        placeholder="Justificativa"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={actionsRow}>
                <button type="button" style={btnPrimary} onClick={salvarPresenca} disabled={salvandoPresenca}>
                  {salvandoPresenca ? "Salvando..." : "Salvar presença"}
                </button>

                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => setPresencaModal({ open: false, aula: null, registros: [] })}
                >
                  Fechar
                </button>
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}
    </PortalShell>
  );
}

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const heroPanel = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 22,
  color: "#ffffff",
  boxShadow: "0 14px 30px rgba(29, 78, 216, 0.18)",
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 14,
};

const heroBadge = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.14)",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
};

const heroText = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,.88)",
  lineHeight: 1.6,
};

const heroMetrics = {
  display: "grid",
  gap: 10,
};

const heroMetricCard = {
  background: "rgba(255,255,255,.12)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 6,
};

const heroMetricLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "rgba(255,255,255,.82)",
};

const heroMetricValue = {
  fontSize: 28,
  lineHeight: 1.1,
};

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const daysSummaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const daySummaryCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 8,
};

const daySummaryTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const daySummaryTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const daySummaryMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const daySummaryLine = {
  color: "#334155",
  lineHeight: 1.45,
  fontSize: 13,
};

const alertsGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  color: "#334155",
  lineHeight: 1.5,
  fontWeight: 600,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const textarea = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
  resize: "vertical",
};

const checkboxWrap = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  color: "#334155",
  fontWeight: 700,
};

const actionsRow = {
  display: "flex",
  gap: 8,
  gridColumn: "1 / -1",
  flexWrap: "wrap",
  marginTop: 10,
};

const btnPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const btnEdit = {
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const btnDelete = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff1f2",
  color: "#be123c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const btnPresence = {
  border: "1px solid #bbf7d0",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#f0fdf4",
  color: "#166534",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const daysGrid = {
  display: "grid",
  gap: 14,
};

const dayCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 12,
};

const dayHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const dayTitle = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 18,
};

const dayMeta = {
  color: "#64748b",
  marginTop: 4,
};

const aulasGrid = {
  display: "grid",
  gap: 10,
};

const aulaCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 8,
};

const aulaTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const aulaTitle = {
  color: "#0f172a",
};

const aulaText = {
  color: "#334155",
  lineHeight: 1.45,
};

const aulaMiniRow = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 13,
};

const presencaBox = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 8,
};

const presencaTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const presencaGrid = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  color: "#334155",
  fontSize: 13,
};

const aulaActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const presenceList = {
  display: "grid",
  gap: 10,
};

const presenceRow = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
};

const presenceName = {
  fontWeight: 800,
  color: "#0f172a",
};

const presenceControls = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: 10,
};

const emptyText = {
  color: "#64748b",
};
