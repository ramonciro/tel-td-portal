
"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  const total = arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0);
  return total / arr.length;
}

function getNotaFinal(item) {
  const prova = Number(item?.nota_prova || 0);
  const qualidade = Number(item?.nota_qualidade || 0);
  return prova > 0 ? prova : qualidade;
}

function classificarResultado(item) {
  const nota = getNotaFinal(item);

  if (nota >= 8) return "Aprovado";
  if (nota >= 6) return "Atenção";
  return "Reforço";
}

function badgeClassificacao(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Aprovado") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Atenção") {
    return { ...base, background: "#fff7ed", color: "#c2410c" };
  }

  return { ...base, background: "#fee2e2", color: "#b91c1c" };
}

function acaoRecomendada(item) {
  const status = classificarResultado(item);

  if (status === "Aprovado") return "Manter evolução";
  if (status === "Atenção") return "Acompanhar desempenho";
  return "Aplicar reforço";
}

function novaQuestao() {
  return {
    enunciado: "",
    alternativa_a: "",
    alternativa_b: "",
    alternativa_c: "",
    alternativa_d: "",
    alternativa_correta: "A",
    peso: 1,
  };
}

export default function AvaliacoesPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [participantesMap, setParticipantesMap] = useState({});
  const [materiais, setMateriais] = useState([]);
  const [materialForm, setMaterialForm] = useState({
    titulo: "",
    cliente: "",
    tipo: "prova",
    tema: "",
    descricao: "",
    instrucoes: "",
    status: "rascunho",
    tempo_minutos: "",
  });
  const [questoes, setQuestoes] = useState([novaQuestao()]);
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [materialErro, setMaterialErro] = useState("");
  const [materialSucesso, setMaterialSucesso] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, avaliacoesData, materiaisData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
          apiFetch("/materiais-avaliativos").catch(() => []),
        ]);

        const listaTreinamentos = Array.isArray(treinamentosData) ? treinamentosData : [];
        setTreinamentos(listaTreinamentos);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setMateriais(Array.isArray(materiaisData) ? materiaisData : []);

        const participantesObj = {};

        await Promise.all(
          listaTreinamentos.map(async (t) => {
            try {
              const participantes = await apiFetch(`/treinamentos/${t.id}/participantes`).catch(() => []);
              participantesObj[String(t.id)] = Array.isArray(participantes) ? participantes : [];
            } catch {
              participantesObj[String(t.id)] = [];
            }
          })
        );

        setParticipantesMap(participantesObj);
      } catch {
        setTreinamentos([]);
        setAvaliacoes([]);
        setParticipantesMap({});
        setMateriais([]);
      }
    }

    carregar();
  }, []);

  const treinamentoOptions = useMemo(() => {
    return treinamentos.map((item) => ({
      value: item.id,
      label: `${item.tema || item.titulo || "Treinamento"}${
        item.cliente ? ` - ${item.cliente}` : ""
      }`,
    }));
  }, [treinamentos]);

  const materialOptions = useMemo(() => {
    return materiais
      .filter((item) => String(item.status || "").toLowerCase() !== "inativo")
      .map((item) => ({
        value: item.titulo,
        label: `${item.titulo} • ${item.tipo || "material"}${
          item.cliente ? ` • ${item.cliente}` : ""
        }`,
      }));
  }, [materiais]);

  const participanteOptionsPorTreinamento = useMemo(() => {
    const mapa = {};

    treinamentos.forEach((treinamento) => {
      const participantes = participantesMap[String(treinamento.id)] || [];

      mapa[String(treinamento.id)] = participantes.map((p) => ({
        value: p.nome,
        label: p.nome,
      }));
    });

    return mapa;
  }, [participantesMap, treinamentos]);

  const fields = useMemo(
    () => [
      {
        name: "treinamento_id",
        label: "Turma / treinamento",
        type: "select",
        options: treinamentoOptions,
        placeholder: "Selecione a turma",
      },
      {
        name: "titulo",
        label: "Prova / simulado aplicado",
        type: "select",
        options: materialOptions,
        placeholder: "Selecione o material (opcional)",
      },
      {
        name: "treinando_nome",
        label: "Treinando",
        type: "dependent-select",
        dependsOn: "treinamento_id",
        optionsMap: participanteOptionsPorTreinamento,
        placeholder: "Selecione o treinando",
      },
      {
        name: "nota_nps",
        label: "Satisfação (NPS)",
        type: "number",
        placeholder: "0 a 10",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        name: "nota_qualidade",
        label: "Qualidade / aproveitamento",
        type: "number",
        placeholder: "0 a 10",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        name: "nota_prova",
        label: "Nota da prova / simulado",
        type: "number",
        placeholder: "0 a 10",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        name: "comentario",
        label: "Comentário / feedback",
        type: "textarea",
        placeholder: "Comentários sobre desempenho, reforço ou evolução",
      },
    ],
    [treinamentoOptions, participanteOptionsPorTreinamento, materialOptions]
  );

  const kpis = useMemo(() => {
    const totalAvaliacoes = avaliacoes.length;
    const mediaNps = avg(avaliacoes, "nota_nps").toFixed(1);
    const mediaQualidade = avg(avaliacoes, "nota_qualidade").toFixed(1);
    const mediaProva = avg(avaliacoes, "nota_prova").toFixed(1);

    const aprovados = avaliacoes.filter(
      (item) => classificarResultado(item) === "Aprovado"
    ).length;

    const atencao = avaliacoes.filter(
      (item) => classificarResultado(item) === "Atenção"
    ).length;

    const reforco = avaliacoes.filter(
      (item) => classificarResultado(item) === "Reforço"
    ).length;

    const provas = materiais.filter((m) => String(m.tipo).toLowerCase() === "prova").length;
    const simulados = materiais.filter((m) => String(m.tipo).toLowerCase() === "simulado").length;
    const materiaisAtivos = materiais.filter((m) => String(m.status).toLowerCase() === "ativo").length;

    const porInstrutorMap = {};
    const porClienteMap = {};

    avaliacoes.forEach((item) => {
      const treinamento = treinamentos.find(
        (t) => String(t.id) === String(item.treinamento_id)
      );

      const cliente = treinamento?.cliente || "Sem cliente";
      const instrutor = treinamento?.instrutor || "Sem instrutor";

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          total: 0,
          somaQualidade: 0,
          reforco: 0,
        };
      }

      porClienteMap[cliente].total += 1;
      porClienteMap[cliente].somaQualidade += Number(item.nota_qualidade || 0);
      if (classificarResultado(item) === "Reforço") {
        porClienteMap[cliente].reforco += 1;
      }

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          total: 0,
          somaQualidade: 0,
          reforco: 0,
        };
      }

      porInstrutorMap[instrutor].total += 1;
      porInstrutorMap[instrutor].somaQualidade += Number(item.nota_qualidade || 0);
      if (classificarResultado(item) === "Reforço") {
        porInstrutorMap[instrutor].reforco += 1;
      }
    });

    const porCliente = Object.values(porClienteMap).map((item) => ({
      ...item,
      mediaQualidade: item.total
        ? (item.somaQualidade / item.total).toFixed(1)
        : "0.0",
    }));

    const rankingInstrutores = Object.values(porInstrutorMap).map((item) => ({
      ...item,
      mediaQualidade: item.total
        ? (item.somaQualidade / item.total).toFixed(1)
        : "0.0",
    }));

    return {
      totalAvaliacoes,
      mediaNps,
      mediaQualidade,
      mediaProva,
      aprovados,
      atencao,
      reforco,
      provas,
      simulados,
      materiaisAtivos,
      porCliente,
      rankingInstrutores,
    };
  }, [avaliacoes, treinamentos, materiais]);

  const columns = [
    {
      key: "treinando_nome",
      label: "Treinando",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.treinando_nome || "-"}</div>
          <div style={subCell}>
            {(() => {
              const treinamento = treinamentos.find(
                (t) => String(t.id) === String(item.treinamento_id)
              );
              return (treinamento?.tema || "Treinamento") + " • " + (treinamento?.cliente || "Sem cliente");
            })()}
          </div>
          {item.titulo ? <div style={miniTag}>{item.titulo}</div> : null}
        </div>
      ),
    },
    {
      key: "nota_nps",
      label: "NPS",
      render: (item) => <strong style={scoreBlue}>{item.nota_nps ?? "-"}</strong>,
    },
    {
      key: "nota_qualidade",
      label: "Qualidade",
      render: (item) => <strong style={scoreGreen}>{item.nota_qualidade ?? "-"}</strong>,
    },
    {
      key: "nota_prova",
      label: "Prova",
      render: (item) => <strong style={scorePurple}>{item.nota_prova ?? "-"}</strong>,
    },
    {
      key: "classificacao",
      label: "Status",
      render: (item) => {
        const label = classificarResultado(item);
        return <span style={badgeClassificacao(label)}>{label}</span>;
      },
    },
    {
      key: "comentario",
      label: "Ação recomendada",
      render: (item) => <span style={obsCell}>{acaoRecomendada(item)}</span>,
    },
  ];

  function handleMaterialField(name, value) {
    setMaterialForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function updateQuestao(index, field, value) {
    setQuestoes((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  }

  function addQuestao() {
    setQuestoes((prev) => [...prev, novaQuestao()]);
  }

  function removeQuestao(index) {
    setQuestoes((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function limparMaterialForm() {
    setEditingMaterialId(null);
    setMaterialErro("");
    setMaterialSucesso("");
    setMaterialForm({
      titulo: "",
      cliente: "",
      tipo: "prova",
      tema: "",
      descricao: "",
      instrucoes: "",
      status: "rascunho",
      tempo_minutos: "",
    });
    setQuestoes([novaQuestao()]);
  }

  function editarMaterial(item) {
    setEditingMaterialId(item.id);
    setMaterialErro("");
    setMaterialSucesso("");
    setMaterialForm({
      titulo: item.titulo || "",
      cliente: item.cliente || "",
      tipo: item.tipo || "prova",
      tema: item.tema || "",
      descricao: item.descricao || "",
      instrucoes: item.instrucoes || "",
      status: item.status || "rascunho",
      tempo_minutos: item.tempo_minutos || "",
    });

    try {
      const parsed = item.questoes_json ? JSON.parse(item.questoes_json) : [novaQuestao()];
      setQuestoes(Array.isArray(parsed) && parsed.length ? parsed : [novaQuestao()]);
    } catch {
      setQuestoes([novaQuestao()]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarMaterial() {
    try {
      setMaterialErro("");
      setMaterialSucesso("");

      if (!materialForm.titulo || !materialForm.tipo) {
        setMaterialErro("Preencha pelo menos título e tipo do material.");
        return;
      }

      const questoesValidas = questoes.filter(
        (q) =>
          q.enunciado &&
          q.alternativa_a &&
          q.alternativa_b &&
          q.alternativa_c &&
          q.alternativa_d &&
          q.alternativa_correta
      );

      const payload = {
        ...materialForm,
        tempo_minutos: materialForm.tempo_minutos || null,
        questoes_json: JSON.stringify(questoesValidas),
      };

      const url = editingMaterialId
        ? `/materiais-avaliativos/${editingMaterialId}`
        : "/materiais-avaliativos";

      const method = editingMaterialId ? "PUT" : "POST";

      await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const materiaisData = await apiFetch("/materiais-avaliativos").catch(() => []);
      setMateriais(Array.isArray(materiaisData) ? materiaisData : []);

      setMaterialSucesso(
        editingMaterialId
          ? "Material avaliativo atualizado com sucesso."
          : "Material avaliativo criado com sucesso."
      );

      limparMaterialForm();
    } catch (error) {
      setMaterialErro(error.message || "Erro ao salvar material avaliativo.");
    }
  }

  async function excluirMaterial(id) {
    const confirmar = window.confirm("Deseja realmente excluir este material?");
    if (!confirmar) return;

    try {
      setMaterialErro("");
      setMaterialSucesso("");

      await apiFetch(`/materiais-avaliativos/${id}`, {
        method: "DELETE",
      });

      const materiaisData = await apiFetch("/materiais-avaliativos").catch(() => []);
      setMateriais(Array.isArray(materiaisData) ? materiaisData : []);

      setMaterialSucesso("Material avaliativo excluído com sucesso.");

      if (editingMaterialId === id) {
        limparMaterialForm();
      }
    } catch (error) {
      setMaterialErro(error.message || "Erro ao excluir material.");
    }
  }

  return (
    <CrudPageV2
      title="Gestão de Avaliações"
      subtitle="Resultados por treinando, banco de provas e simulados e aplicação operacional."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsTitle="Base de avaliações individuais"
      recordsSubtitle="Resultado por treinando, turma e material aplicado."
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Avaliações"
              value={fmt(kpis.totalAvaliacoes)}
              subtitle="Registros lançados"
              accent="#dc2626"
            />
            <StatCard
              title="NPS médio"
              value={kpis.mediaNps}
              subtitle="Percepção do treinamento"
              accent="#2563eb"
            />
            <StatCard
              title="Qualidade média"
              value={kpis.mediaQualidade}
              subtitle="Aproveitamento geral"
              accent="#059669"
            />
            <StatCard
              title="Média prova"
              value={kpis.mediaProva}
              subtitle="Provas e simulados"
              accent="#7c3aed"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Aprovados"
              value={fmt(kpis.aprovados)}
              subtitle="Nota final ≥ 8"
              accent="#16a34a"
            />
            <StatCard
              title="Atenção"
              value={fmt(kpis.atencao)}
              subtitle="Nota entre 6 e 7,9"
              accent="#f59e0b"
            />
            <StatCard
              title="Reforço"
              value={fmt(kpis.reforco)}
              subtitle="Nota abaixo de 6"
              accent="#b91c1c"
            />
            <StatCard
              title="Materiais ativos"
              value={fmt(kpis.materiaisAtivos)}
              subtitle={`${fmt(kpis.provas)} prova(s) • ${fmt(kpis.simulados)} simulado(s)`}
              accent="#0f766e"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Resultado por cliente"
              subtitle="Leitura consolidada de desempenho por operação."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade}
                      </div>
                      <div style={itemSubMeta}>
                        {item.reforco} registro(s) em reforço
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum resultado por cliente disponível.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Leitura da qualidade por instrutor."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade}
                      </div>
                      <div style={itemSubMeta}>
                        {item.reforco} registro(s) em reforço
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum instrutor disponível.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Banco de provas e simulados"
            subtitle="Crie materiais avaliativos pelo site e use o título deles no lançamento dos resultados."
          >
            {materialErro ? <div style={errorBoxInline}>{materialErro}</div> : null}
            {materialSucesso ? <div style={successBoxInline}>{materialSucesso}</div> : null}

            <div style={materialGrid}>
              <div style={materialPanel}>
                <div style={materialHeader}>
                  <h3 style={materialTitle}>
                    {editingMaterialId ? "Editar material" : "Novo material avaliativo"}
                  </h3>
                  {editingMaterialId ? (
                    <button style={btnSecondary} onClick={limparMaterialForm}>
                      Cancelar edição
                    </button>
                  ) : null}
                </div>

                <div style={formGridMaterial}>
                  <div style={fieldWrap}>
                    <label style={label}>Título</label>
                    <input
                      style={input}
                      value={materialForm.titulo}
                      onChange={(e) => handleMaterialField("titulo", e.target.value)}
                      placeholder="Ex.: Simulado Mercantil - Atendimento"
                    />
                  </div>

                  <div style={fieldWrap}>
                    <label style={label}>Cliente</label>
                    <input
                      style={input}
                      value={materialForm.cliente}
                      onChange={(e) => handleMaterialField("cliente", e.target.value)}
                      placeholder="Cliente vinculado"
                    />
                  </div>

                  <div style={fieldWrap}>
                    <label style={label}>Tipo</label>
                    <select
                      style={input}
                      value={materialForm.tipo}
                      onChange={(e) => handleMaterialField("tipo", e.target.value)}
                    >
                      <option value="prova">Prova</option>
                      <option value="simulado">Simulado</option>
                    </select>
                  </div>

                  <div style={fieldWrap}>
                    <label style={label}>Status</label>
                    <select
                      style={input}
                      value={materialForm.status}
                      onChange={(e) => handleMaterialField("status", e.target.value)}
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>

                  <div style={fieldWrap}>
                    <label style={label}>Tema</label>
                    <input
                      style={input}
                      value={materialForm.tema}
                      onChange={(e) => handleMaterialField("tema", e.target.value)}
                      placeholder="Tema principal"
                    />
                  </div>

                  <div style={fieldWrap}>
                    <label style={label}>Tempo (min)</label>
                    <input
                      style={input}
                      type="number"
                      value={materialForm.tempo_minutos}
                      onChange={(e) => handleMaterialField("tempo_minutos", e.target.value)}
                      placeholder="Tempo sugerido"
                    />
                  </div>

                  <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                    <label style={label}>Descrição</label>
                    <textarea
                      style={textarea}
                      rows={2}
                      value={materialForm.descricao}
                      onChange={(e) => handleMaterialField("descricao", e.target.value)}
                      placeholder="Objetivo do material"
                    />
                  </div>

                  <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                    <label style={label}>Instruções</label>
                    <textarea
                      style={textarea}
                      rows={3}
                      value={materialForm.instrucoes}
                      onChange={(e) => handleMaterialField("instrucoes", e.target.value)}
                      placeholder="Orientações para aplicação"
                    />
                  </div>
                </div>

                <div style={questionsHeader}>
                  <h4 style={{ margin: 0 }}>Questões</h4>
                  <button style={btnSecondary} onClick={addQuestao}>
                    Adicionar questão
                  </button>
                </div>

                <div style={questionsGrid}>
                  {questoes.map((questao, index) => (
                    <div key={index} style={questionCard}>
                      <div style={questionCardHeader}>
                        <strong>Questão {index + 1}</strong>
                        {questoes.length > 1 ? (
                          <button
                            style={btnDangerGhost}
                            onClick={() => removeQuestao(index)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>

                      <div style={{ ...fieldWrap, marginTop: 10 }}>
                        <label style={label}>Enunciado</label>
                        <textarea
                          style={textarea}
                          rows={2}
                          value={questao.enunciado}
                          onChange={(e) => updateQuestao(index, "enunciado", e.target.value)}
                          placeholder="Digite a pergunta"
                        />
                      </div>

                      <div style={formGridMaterial}>
                        <div style={fieldWrap}>
                          <label style={label}>Alternativa A</label>
                          <input
                            style={input}
                            value={questao.alternativa_a}
                            onChange={(e) => updateQuestao(index, "alternativa_a", e.target.value)}
                          />
                        </div>

                        <div style={fieldWrap}>
                          <label style={label}>Alternativa B</label>
                          <input
                            style={input}
                            value={questao.alternativa_b}
                            onChange={(e) => updateQuestao(index, "alternativa_b", e.target.value)}
                          />
                        </div>

                        <div style={fieldWrap}>
                          <label style={label}>Alternativa C</label>
                          <input
                            style={input}
                            value={questao.alternativa_c}
                            onChange={(e) => updateQuestao(index, "alternativa_c", e.target.value)}
                          />
                        </div>

                        <div style={fieldWrap}>
                          <label style={label}>Alternativa D</label>
                          <input
                            style={input}
                            value={questao.alternativa_d}
                            onChange={(e) => updateQuestao(index, "alternativa_d", e.target.value)}
                          />
                        </div>

                        <div style={fieldWrap}>
                          <label style={label}>Correta</label>
                          <select
                            style={input}
                            value={questao.alternativa_correta}
                            onChange={(e) => updateQuestao(index, "alternativa_correta", e.target.value)}
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>

                        <div style={fieldWrap}>
                          <label style={label}>Peso</label>
                          <input
                            style={input}
                            type="number"
                            min="1"
                            step="1"
                            value={questao.peso}
                            onChange={(e) => updateQuestao(index, "peso", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={actionsRowInline}>
                  <button style={btnPrimary} onClick={salvarMaterial}>
                    {editingMaterialId ? "Atualizar material" : "Salvar material"}
                  </button>
                  <button style={btnSecondary} onClick={limparMaterialForm}>
                    Limpar
                  </button>
                </div>
              </div>

              <div style={materialPanel}>
                <h3 style={materialTitle}>Materiais cadastrados</h3>

                <div style={listGrid}>
                  {materiais.length ? (
                    materiais.map((item) => {
                      let totalQuestoes = 0;

                      try {
                        const parsed = item.questoes_json ? JSON.parse(item.questoes_json) : [];
                        totalQuestoes = Array.isArray(parsed) ? parsed.length : 0;
                      } catch {
                        totalQuestoes = 0;
                      }

                      return (
                        <div key={item.id} style={listItem}>
                          <div style={itemHeader}>
                            <div style={itemTitle}>{item.titulo}</div>
                            <div style={miniTagBlue}>{item.tipo || "material"}</div>
                          </div>

                          <div style={itemMeta}>
                            {(item.cliente || "Sem cliente") +
                              " • " +
                              (item.tema || "Sem tema")}
                          </div>

                          <div style={itemSubMeta}>
                            {totalQuestoes} questão(ões) • {item.status || "sem status"} •{" "}
                            {item.tempo_minutos ? `${item.tempo_minutos} min` : "tempo livre"}
                          </div>

                          <div style={materialCardActions}>
                            <button style={btnSmallEdit} onClick={() => editarMaterial(item)}>
                              Editar
                            </button>
                            <button style={btnSmallDelete} onClick={() => excluirMaterial(item.id)}>
                              Excluir
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={emptyText}>Nenhum material avaliativo cadastrado.</div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const itemSubMeta = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 12,
};

const emptyText = {
  color: "#64748b",
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const miniTag = {
  marginTop: 8,
  display: "inline-block",
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};

const scorePurple = {
  color: "#7c3aed",
  fontWeight: 800,
};

const obsCell = {
  color: "#334155",
  fontWeight: 600,
};

const materialGrid = {
  display: "grid",
  gridTemplateColumns: "1.3fr 1fr",
  gap: 14,
};

const materialPanel = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
};

const materialHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 12,
  flexWrap: "wrap",
};

const materialTitle = {
  margin: 0,
  color: "#0f172a",
  fontSize: 16,
};

const formGridMaterial = {
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
  resize: "vertical",
  boxSizing: "border-box",
  minHeight: 76,
};

const questionsHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginTop: 18,
  marginBottom: 12,
  flexWrap: "wrap",
};

const questionsGrid = {
  display: "grid",
  gap: 12,
};

const questionCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
};

const questionCardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const actionsRowInline = {
  display: "flex",
  gap: 8,
  marginTop: 14,
  flexWrap: "wrap",
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

const btnDangerGhost = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const miniTagBlue = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const materialCardActions = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap",
};

const btnSmallEdit = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const btnSmallDelete = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const errorBoxInline = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const successBoxInline = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};
