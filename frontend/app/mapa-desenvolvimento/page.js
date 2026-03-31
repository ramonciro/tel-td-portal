"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../services/api";
import {
  formatDateBR,
  toDateInputLocal,
  parseLocalDate,
} from "../../lib/date";

function emptyJourneyForm() {
  return {
    id: "",
    titulo: "",
    cliente: "",
    publico_alvo: "",
    objetivo: "",
    status: "planejada",
    data_inicio: "",
    data_fim: "",
  };
}

function emptyActionForm() {
  return {
    id: "",
    jornada_id: "",
    titulo: "",
    descricao: "",
    responsavel: "",
    status: "planejada",
    data_inicio: "",
    data_fim: "",
    carga_horaria: "",
    participantes_previstos: "",
    turma_ids: [],
  };
}

function formatDate(value) {
  return formatDateBR(value);
}

function getStatusTone(status) {
  const key = String(status || "").toLowerCase().trim();

  if (["concluida", "concluído", "concluido"].includes(key)) {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
      label: "Concluída",
    };
  }

  if (["em_andamento", "em andamento"].includes(key)) {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
      label: "Em andamento",
    };
  }

  if (["cancelada", "cancelado"].includes(key)) {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
      label: "Cancelada",
    };
  }

  return {
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    label: "Planejada",
  };
}

function isValidDateRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return true;

  const inicio = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);

  if (!inicio || !fim) return true;
  return fim >= inicio;
}

export default function MapaDesenvolvimentoPage() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [jornadas, setJornadas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);

  const [journeyForm, setJourneyForm] = useState(emptyJourneyForm());
  const [actionForm, setActionForm] = useState(emptyActionForm());

  const [salvandoJornada, setSalvandoJornada] = useState(false);
  const [salvandoAcao, setSalvandoAcao] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    try {
      setLoading(true);
      setErro("");
      setSucesso("");

      const [jornadasResp, acoesResp, turmasResp] = await Promise.all([
        apiFetch("/jornadas-desenvolvimento").catch(() => []),
        apiFetch("/acoes-desenvolvimento").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      setJornadas(Array.isArray(jornadasResp) ? jornadasResp : []);
      setAcoes(Array.isArray(acoesResp) ? acoesResp : []);
      setTurmasDisponiveis(Array.isArray(turmasResp) ? turmasResp : []);
    } catch (err) {
      setErro(err.message || "Erro ao carregar o Mapa de Desenvolvimento.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarJornada() {
    try {
      if (!journeyForm.titulo) {
        setErro("Informe o título da jornada.");
        return;
      }

      if (!isValidDateRange(journeyForm.data_inicio, journeyForm.data_fim)) {
        setErro("A data fim da jornada não pode ser anterior à data início.");
        return;
      }

      setSalvandoJornada(true);
      setErro("");
      setSucesso("");

      const payload = {
        titulo: journeyForm.titulo,
        cliente: journeyForm.cliente || null,
        publico_alvo: journeyForm.publico_alvo || null,
        objetivo: journeyForm.objetivo || null,
        status: journeyForm.status || "planejada",
        data_inicio: journeyForm.data_inicio || null,
        data_fim: journeyForm.data_fim || null,
      };

      if (journeyForm.id) {
        await apiFetch(`/jornadas-desenvolvimento/${journeyForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Jornada atualizada com sucesso.");
      } else {
        await apiFetch("/jornadas-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Jornada cadastrada com sucesso.");
      }

      setJourneyForm(emptyJourneyForm());
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao salvar jornada.");
    } finally {
      setSalvandoJornada(false);
    }
  }

  async function salvarAcao() {
    try {
      if (!actionForm.jornada_id || !actionForm.titulo) {
        setErro("Informe a jornada e o título da ação.");
        return;
      }

      if (!isValidDateRange(actionForm.data_inicio, actionForm.data_fim)) {
        setErro("A data fim da ação não pode ser anterior à data início.");
        return;
      }

      setSalvandoAcao(true);
      setErro("");
      setSucesso("");

      const payload = {
        jornada_id: Number(actionForm.jornada_id),
        titulo: actionForm.titulo,
        descricao: actionForm.descricao || null,
        responsavel: actionForm.responsavel || null,
        status: actionForm.status || "planejada",
        data_inicio: actionForm.data_inicio || null,
        data_fim: actionForm.data_fim || null,
        carga_horaria: Number(actionForm.carga_horaria || 0),
        participantes_previstos: Number(actionForm.participantes_previstos || 0),
        turma_ids: Array.isArray(actionForm.turma_ids) ? actionForm.turma_ids : [],
      };

      if (actionForm.id) {
        await apiFetch(`/acoes-desenvolvimento/${actionForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Ação atualizada com sucesso.");
      } else {
        await apiFetch("/acoes-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Ação cadastrada com sucesso.");
      }

      setActionForm(emptyActionForm());
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao salvar ação.");
    } finally {
      setSalvandoAcao(false);
    }
  }

  async function removerJornada(item) {
    const confirmar = window.confirm(
      `Deseja remover a jornada "${item.titulo}"?`
    );
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");
      await apiFetch(`/jornadas-desenvolvimento/${item.id}`, {
        method: "DELETE",
      });
      setSucesso("Jornada removida com sucesso.");
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao remover jornada.");
    }
  }

  async function removerAcao(item) {
    const confirmar = window.confirm(`Deseja remover a ação "${item.titulo}"?`);
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");
      await apiFetch(`/acoes-desenvolvimento/${item.id}`, {
        method: "DELETE",
      });
      setSucesso("Ação removida com sucesso.");
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao remover ação.");
    }
  }

  function editarJornada(item) {
    setJourneyForm({
      id: item.id || "",
      titulo: item.titulo || "",
      cliente: item.cliente || "",
      publico_alvo: item.publico_alvo || "",
      objetivo: item.objetivo || "",
      status: item.status || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editarAcao(item) {
    setActionForm({
      id: item.id || "",
      jornada_id: item.jornada_id || "",
      titulo: item.titulo || "",
      descricao: item.descricao || "",
      responsavel: item.responsavel || "",
      status: item.status || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
      carga_horaria: String(item.carga_horaria || ""),
      participantes_previstos: String(item.participantes_previstos || ""),
      turma_ids: Array.isArray(item.turmas_vinculadas)
        ? item.turmas_vinculadas.map((t) => Number(t.id))
        : [],
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limparJornada() {
    setJourneyForm(emptyJourneyForm());
  }

  function limparAcao() {
    setActionForm(emptyActionForm());
  }

  const clientes = useMemo(() => {
    const values = new Set();

    jornadas.forEach((j) => {
      if (j?.cliente) values.add(j.cliente);
    });

    turmasDisponiveis.forEach((t) => {
      if (t?.cliente) values.add(t.cliente);
    });

    return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
  }, [jornadas, turmasDisponiveis]);

  const jornadasFiltradas = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();

    return jornadas.filter((item) => {
      const matchBusca =
        !termo ||
        String(item.titulo || "").toLowerCase().includes(termo) ||
        String(item.cliente || "").toLowerCase().includes(termo) ||
        String(item.publico_alvo || "").toLowerCase().includes(termo);

      const matchCliente =
        !filtroCliente || String(item.cliente || "") === String(filtroCliente);

      const matchStatus =
        !filtroStatus ||
        String(item.status || "").toLowerCase() === String(filtroStatus).toLowerCase();

      return matchBusca && matchCliente && matchStatus;
    });
  }, [jornadas, busca, filtroCliente, filtroStatus]);

  const acoesPorJornada = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();
    const mapa = {};

    acoes.forEach((acao) => {
      const matchBusca =
        !termo ||
        String(acao.titulo || "").toLowerCase().includes(termo) ||
        String(acao.responsavel || "").toLowerCase().includes(termo) ||
        String(acao.descricao || "").toLowerCase().includes(termo);

      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));
      const clienteJornada = jornada?.cliente || "";

      const matchCliente =
        !filtroCliente || String(clienteJornada) === String(filtroCliente);

      const matchStatus =
        !filtroStatus ||
        String(acao.status || "").toLowerCase() === String(filtroStatus).toLowerCase();

      if (!matchBusca || !matchCliente || !matchStatus) return;

      if (!mapa[acao.jornada_id]) mapa[acao.jornada_id] = [];
      mapa[acao.jornada_id].push(acao);
    });

    return mapa;
  }, [acoes, jornadas, busca, filtroCliente, filtroStatus]);

  const resumo = useMemo(() => {
    const totalJornadas = jornadas.length;
    const totalAcoes = acoes.length;
    const totalTurmasVinculadas = acoes.reduce(
      (acc, item) => acc + Number(item.quantidade_turmas_sessoes || 0),
      0
    );
    const totalHoras = acoes.reduce(
      (acc, item) => acc + Number(item.horas_realizadas || 0),
      0
    );
    const totalParticipantes = acoes.reduce(
      (acc, item) => acc + Number(item.participantes_realizados || 0),
      0
    );

    return {
      totalJornadas,
      totalAcoes,
      totalTurmasVinculadas,
      totalHoras,
      totalParticipantes,
    };
  }, [jornadas, acoes]);

  if (loading) {
    return <div style={loadingWrap}>Carregando mapa de desenvolvimento...</div>;
  }

  return (
    <div style={page}>
      <div style={hero}>
        <div style={heroBadge}>Mapa de desenvolvimento</div>
        <h1 style={heroTitle}>Jornadas, ações e vínculo com turmas</h1>
        <p style={heroSubtitle}>
          Gestão consolidada das jornadas do portal, agora conectando ações do mapa
          às turmas reais já existentes no projeto.
        </p>

        <div style={heroGrid}>
          <InfoCard label="Jornadas" value={resumo.totalJornadas} />
          <InfoCard label="Ações" value={resumo.totalAcoes} />
          <InfoCard label="Turmas vinculadas" value={resumo.totalTurmasVinculadas} />
          <InfoCard label="Horas realizadas" value={resumo.totalHoras} />
          <InfoCard label="Participantes realizados" value={resumo.totalParticipantes} />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={filtersCard}>
        <div style={filtersRow}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar jornada, ação, cliente ou responsável"
            style={searchInput}
          />

          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            style={field}
          >
            <option value="">Todos os clientes</option>
            {clientes.map((cliente) => (
              <option key={cliente} value={cliente}>
                {cliente}
              </option>
            ))}
          </select>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            style={field}
          >
            <option value="">Todos os status</option>
            <option value="planejada">Planejada</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>

          <button style={btnSecondary} onClick={carregarTudo}>
            Atualizar dados
          </button>
        </div>
      </div>

      <div style={gridForms}>
        <div style={sectionCard}>
          <h2 style={sectionTitle}>
            {journeyForm.id ? "Editar jornada" : "Cadastrar jornada"}
          </h2>
          <p style={sectionSubtitle}>
            Estruture a jornada principal do mapa antes de vincular ações.
          </p>

          <div style={formGrid}>
            <Field label="Título da jornada">
              <input
                value={journeyForm.titulo}
                onChange={(e) =>
                  setJourneyForm((prev) => ({ ...prev, titulo: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Cliente">
              <input
                value={journeyForm.cliente}
                onChange={(e) =>
                  setJourneyForm((prev) => ({ ...prev, cliente: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Público-alvo">
              <input
                value={journeyForm.publico_alvo}
                onChange={(e) =>
                  setJourneyForm((prev) => ({
                    ...prev,
                    publico_alvo: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Status">
              <select
                value={journeyForm.status}
                onChange={(e) =>
                  setJourneyForm((prev) => ({ ...prev, status: e.target.value }))
                }
                style={field}
              >
                <option value="planejada">Planejada</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </Field>

            <Field label="Data início">
              <input
                type="date"
                value={journeyForm.data_inicio}
                onChange={(e) =>
                  setJourneyForm((prev) => ({
                    ...prev,
                    data_inicio: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Data fim">
              <input
                type="date"
                value={journeyForm.data_fim}
                onChange={(e) =>
                  setJourneyForm((prev) => ({ ...prev, data_fim: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Objetivo" full>
              <textarea
                value={journeyForm.objetivo}
                onChange={(e) =>
                  setJourneyForm((prev) => ({ ...prev, objetivo: e.target.value }))
                }
                style={textarea}
              />
            </Field>
          </div>

          <div style={actionsRow}>
            <button
              style={btnPrimary}
              onClick={salvarJornada}
              disabled={salvandoJornada}
            >
              {salvandoJornada
                ? "Salvando..."
                : journeyForm.id
                ? "Salvar jornada"
                : "Cadastrar jornada"}
            </button>

            <button style={btnSecondary} onClick={limparJornada}>
              Limpar
            </button>
          </div>
        </div>

        <div style={sectionCard}>
          <h2 style={sectionTitle}>
            {actionForm.id ? "Editar ação" : "Cadastrar ação"}
          </h2>
          <p style={sectionSubtitle}>
            Vincule a ação a uma jornada e relacione uma ou mais turmas reais do portal.
          </p>

          <div style={formGrid}>
            <Field label="Jornada">
              <select
                value={actionForm.jornada_id}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    jornada_id: e.target.value,
                  }))
                }
                style={field}
              >
                <option value="">Selecione</option>
                {jornadas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.titulo} {item.cliente ? `• ${item.cliente}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Título da ação">
              <input
                value={actionForm.titulo}
                onChange={(e) =>
                  setActionForm((prev) => ({ ...prev, titulo: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Responsável">
              <input
                value={actionForm.responsavel}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    responsavel: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Status">
              <select
                value={actionForm.status}
                onChange={(e) =>
                  setActionForm((prev) => ({ ...prev, status: e.target.value }))
                }
                style={field}
              >
                <option value="planejada">Planejada</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </Field>

            <Field label="Data início">
              <input
                type="date"
                value={actionForm.data_inicio}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    data_inicio: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Data fim">
              <input
                type="date"
                value={actionForm.data_fim}
                onChange={(e) =>
                  setActionForm((prev) => ({ ...prev, data_fim: e.target.value }))
                }
                style={field}
              />
            </Field>

            <Field label="Carga horária base">
              <input
                type="number"
                min="0"
                step="0.5"
                value={actionForm.carga_horaria}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    carga_horaria: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Participantes previstos">
              <input
                type="number"
                min="0"
                value={actionForm.participantes_previstos}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    participantes_previstos: e.target.value,
                  }))
                }
                style={field}
              />
            </Field>

            <Field label="Turmas vinculadas" full>
              <select
                multiple
                value={actionForm.turma_ids.map(String)}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((opt) =>
                    Number(opt.value)
                  );
                  setActionForm((prev) => ({
                    ...prev,
                    turma_ids: values,
                  }));
                }}
                style={{ ...field, height: 140, padding: 12 }}
              >
                {turmasDisponiveis.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {(turma.tema || "Sem nome")} • {turma.cliente || "Sem cliente"} •{" "}
                    {formatDate(turma.data_inicio || turma.data)}
                  </option>
                ))}
              </select>
              <div style={helperMini}>
                Segure Ctrl no computador para selecionar mais de uma turma.
              </div>
            </Field>

            <Field label="Descrição" full>
              <textarea
                value={actionForm.descricao}
                onChange={(e) =>
                  setActionForm((prev) => ({
                    ...prev,
                    descricao: e.target.value,
                  }))
                }
                style={textarea}
              />
            </Field>
          </div>

          <div style={actionsRow}>
            <button
              style={btnPrimary}
              onClick={salvarAcao}
              disabled={salvandoAcao}
            >
              {salvandoAcao
                ? "Salvando..."
                : actionForm.id
                ? "Salvar ação"
                : "Cadastrar ação"}
            </button>

            <button style={btnSecondary} onClick={limparAcao}>
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div style={sectionCard}>
        <h2 style={sectionTitle}>Mapa consolidado</h2>
        <p style={sectionSubtitle}>
          Visualização das jornadas e das ações vinculadas, incluindo as turmas reais do projeto.
        </p>

        <div style={journeyList}>
          {jornadasFiltradas.map((jornada) => {
            const tone = getStatusTone(jornada.status);
            const acoesDaJornada = acoesPorJornada[jornada.id] || [];

            return (
              <div key={jornada.id} style={journeyCard}>
                <div style={journeyHeader}>
                  <div>
                    <div style={journeyTitle}>{jornada.titulo}</div>
                    <div style={journeyMeta}>
                      {jornada.cliente || "Sem cliente"} •{" "}
                      {jornada.publico_alvo || "Público não informado"}
                    </div>
                  </div>

                  <div style={{ ...statusBadge, ...tone }}>{tone.label}</div>
                </div>

                <div style={journeySummaryGrid}>
                  <SummaryItem
                    label="Período"
                    value={`${formatDate(jornada.data_inicio)} até ${formatDate(
                      jornada.data_fim
                    )}`}
                  />
                  <SummaryItem
                    label="Ações vinculadas"
                    value={acoesDaJornada.length}
                  />
                  <SummaryItem
                    label="Objetivo"
                    value={jornada.objetivo || "-"}
                  />
                </div>

                <div style={actionsRow}>
                  <button style={btnSecondary} onClick={() => editarJornada(jornada)}>
                    Editar jornada
                  </button>
                  <button
                    style={btnDangerMini}
                    onClick={() => removerJornada(jornada)}
                  >
                    Remover jornada
                  </button>
                </div>

                <div style={actionsList}>
                  {acoesDaJornada.length ? (
                    acoesDaJornada.map((acao) => {
                      const toneAcao = getStatusTone(acao.status);

                      return (
                        <div key={acao.id} style={actionCard}>
                          <div style={actionHeader}>
                            <div>
                              <div style={actionTitle}>{acao.titulo}</div>
                              <div style={actionMeta}>
                                {acao.responsavel || "Responsável não informado"}
                              </div>
                            </div>

                            <div style={{ ...statusBadge, ...toneAcao }}>
                              {toneAcao.label}
                            </div>
                          </div>

                          <div style={actionDesc}>{acao.descricao || "-"}</div>

                          <div style={actionGrid}>
                            <MetricItem
                              label="Período"
                              value={`${formatDate(acao.data_inicio)} até ${formatDate(
                                acao.data_fim
                              )}`}
                            />
                            <MetricItem
                              label="Participantes previstos"
                              value={acao.participantes_previstos || 0}
                            />
                            <MetricItem
                              label="Turmas / sessões"
                              value={acao.quantidade_turmas_sessoes || 0}
                            />
                            <MetricItem
                              label="Participantes realizados"
                              value={acao.participantes_realizados || 0}
                            />
                            <MetricItem
                              label="Horas planejadas"
                              value={acao.horas_planejadas || 0}
                            />
                            <MetricItem
                              label="Horas realizadas"
                              value={acao.horas_realizadas || 0}
                            />
                          </div>

                          {Array.isArray(acao.turmas_vinculadas) &&
                          acao.turmas_vinculadas.length ? (
                            <div style={{ marginTop: 12 }}>
                              <div style={miniSectionTitle}>Turmas vinculadas</div>

                              <div style={tagsRow}>
                                {acao.turmas_vinculadas.map((turma) => (
                                  <button
                                    key={turma.id}
                                    type="button"
                                    onClick={() =>
                                      (window.location.href = `/turma/${turma.id}`)
                                    }
                                    style={tagButton}
                                  >
                                    {turma.tema || `Turma ${turma.id}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div style={actionsRow}>
                            <button style={btnSecondary} onClick={() => editarAcao(acao)}>
                              Editar ação
                            </button>
                            <button
                              style={btnDangerMini}
                              onClick={() => removerAcao(acao)}
                            >
                              Remover ação
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={emptyBox}>Nenhuma ação vinculada a esta jornada.</div>
                  )}
                </div>
              </div>
            );
          })}

          {!jornadasFiltradas.length ? (
            <div style={emptyBox}>Nenhuma jornada encontrada com os filtros atuais.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div style={{ ...fieldWrap, gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={infoCard}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={summaryItem}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

function MetricItem({ label, value }) {
  return (
    <div style={metricItem}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
};

const loadingWrap = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  color: "#334155",
  fontWeight: 700,
  background: "#f8fafc",
};

const hero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  width: "fit-content",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
};

const heroSubtitle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroGrid = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const infoCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 14,
};

const infoLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  color: "rgba(255,255,255,.68)",
};

const infoValue = {
  marginTop: 6,
  fontWeight: 800,
  fontSize: 22,
};

const filtersCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 16,
  border: "1px solid #e2e8f0",
};

const filtersRow = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr auto",
  gap: 12,
};

const gridForms = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const sectionCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
};

const sectionTitle = {
  margin: 0,
  fontSize: 24,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.5,
};

const formGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  background: "#fff",
};

const textarea = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 92,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "12px",
  resize: "vertical",
  background: "#fff",
};

const searchInput = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
};

const actionsRow = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnDangerMini = {
  background: "#fff1f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const helperMini = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 12,
};

const errorBox = {
  marginTop: 16,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  marginTop: 16,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const journeyList = {
  marginTop: 16,
  display: "grid",
  gap: 16,
};

const journeyCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  background: "#fff",
};

const journeyHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const journeyTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0f172a",
};

const journeyMeta = {
  marginTop: 4,
  color: "#64748b",
};

const statusBadge = {
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const journeySummaryGrid = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const summaryItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
};

const summaryLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const summaryValue = {
  marginTop: 6,
  color: "#0f172a",
  fontWeight: 700,
};

const actionsList = {
  marginTop: 16,
  display: "grid",
  gap: 12,
};

const actionCard = {
  border: "1px solid #dbe4f0",
  borderRadius: 16,
  padding: 16,
  background: "#fbfdff",
};

const actionHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const actionTitle = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const actionMeta = {
  marginTop: 4,
  color: "#64748b",
};

const actionDesc = {
  marginTop: 10,
  color: "#334155",
  lineHeight: 1.5,
};

const actionGrid = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const metricItem = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
};

const metricLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const metricValue = {
  marginTop: 6,
  color: "#0f172a",
  fontWeight: 800,
};

const miniSectionTitle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
};

const tagsRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const tagButton = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const emptyBox = {
  marginTop: 12,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  padding: 18,
  color: "#64748b",
  textAlign: "center",
};
