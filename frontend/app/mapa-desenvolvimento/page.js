"use client";

// Mapa de Desenvolvimento (22/09/2026, pedido do Ramon): este arquivo tinha
// ~4000 linhas e 6 entidades (jornadas, ações, coaching, participantes,
// etapas, clientes da metodologia) todas juntas. Foi particionado em
// componentes menores dentro de ./componentes — helpers.js (funções puras e
// valores iniciais), estilos.js (estilos e pequenos componentes visuais
// compartilhados) e um arquivo por seção de tela (AbaGeral, AbaJornadas,
// AbaAcoes, AbaCoaching e os cards que cada uma compõe). Nenhuma lógica foi
// alterada: todo o state, efeitos, handlers e dados memoizados continuam
// aqui, exatamente como antes — só a marcação JSX de cada aba foi movida
// para fora, recebendo os dados já calculados e os handlers via props.
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
import { toDateInputLocal } from "../../lib/date";

import {
  fmtNumber,
  fmtHours,
  normalize,
  canonicalStatus,
  isValidDateRange,
  extrairMensagemErro,
  getPrazoInfo,
  getJourneyAttention,
  getActionAttention,
  getCoachingAttention,
  journeyInitial,
  actionInitial,
  coachingInitial,
  participantInitial,
  etapaInitial,
  clienteMetInitial,
  STATUS_OPTIONS,
} from "./componentes/helpers";

import {
  inputStyle,
  labelStyle,
  buttonSecondaryStyle,
  tabButton,
  tabBar,
  kpiGrid,
  filtersPanel,
  errorAlert,
  successAlert,
} from "./componentes/estilos";

import AbaGeral from "./componentes/AbaGeral";
import AbaJornadas from "./componentes/AbaJornadas";
import AbaAcoes from "./componentes/AbaAcoes";
import AbaCoaching from "./componentes/AbaCoaching";

export default function MapaDesenvolvimentoPage() {
  const [activeTab, setActiveTab] = useState("geral");

  const [jornadas, setJornadas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [participantesJornada, setParticipantesJornada] = useState([]);
  const [turmas, setTurmas] = useState([]);
  // Coaching individual (20/09/2026) — trilha à parte, pessoa a pessoa, que
  // nunca entra no total_coachings acima (esse é o plano/ação coletiva de
  // coaching, coaching_planos). Só usado aqui pra mostrar "+N em coaching
  // individual" no card da jornada — o acompanhamento de verdade (farol,
  // cadência, encontros) vive em /tripulacao.
  const [coachingIndividual, setCoachingIndividual] = useState([]);
  // Etapas da jornada / portos e Clientes da Metodologia (20/09/2026) — ver
  // comentários de etapaInitial e clienteMetInitial em ./componentes/helpers.
  const [etapasJornada, setEtapasJornada] = useState([]);
  const [metodologiaClientes, setMetodologiaClientes] = useState([]);
  // Catálogo de Trilhas, usado só pro <select> de "trilha vinculada" no
  // cadastro de etapa — não precisa de tratamento de erro próprio, já cai
  // no Promise.allSettled do loadAll() como as demais fontes.
  const [trilhasCatalogo, setTrilhasCatalogo] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    jornada_id: "",
    status: "",
    busca: "",
    cliente: "",
  });

  const [jornadaForm, setJornadaForm] = useState(journeyInitial);
  const [acaoForm, setAcaoForm] = useState(actionInitial);
  const [coachingForm, setCoachingForm] = useState(coachingInitial);
  const [participanteForm, setParticipanteForm] = useState(participantInitial);
  const [arquivoTripulacao, setArquivoTripulacao] = useState(null);
  const [etapaForm, setEtapaForm] = useState(etapaInitial);
  const [clienteMetForm, setClienteMetForm] = useState(clienteMetInitial);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!erro && !notice) return undefined;

    const timer = window.setTimeout(() => {
      setErro("");
      setNotice("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [erro, notice]);

  useEffect(() => {
    setErro("");
    setNotice("");
  }, [activeTab]);

  // Bugfix: antes cada fetch tinha um .catch(() => []) individual, então uma
  // falha real do backend (ex.: tabela ausente, 500, tenant sem permissão)
  // era silenciosamente convertida em "lista vazia" — o usuário via o mapa
  // em branco sem nenhum aviso do que deu errado. Agora usamos
  // Promise.allSettled e reportamos quais seções falharam.
  const FONTES_MAPA = [
    { key: "jornadas", label: "jornadas", path: "/jornadas-desenvolvimento", setter: setJornadas },
    { key: "acoes", label: "ações", path: "/acoes-desenvolvimento", setter: setAcoes },
    { key: "coachings", label: "coaching", path: "/coaching-planos", setter: setCoachings },
    // Endpoint enxuto (id + nome) em vez de /api/usuarios — evita mandar
    // para o navegador a lista completa de usuários com dados sensíveis
    // (inclusive senha em hash) só para preencher um <select>.
    { key: "usuarios", label: "usuários", path: "/acoes-desenvolvimento/responsaveis-disponiveis", setter: setUsuarios },
    { key: "participantes", label: "participantes", path: "/jornada-participantes", setter: setParticipantesJornada },
    // Endpoint dedicado do Oceano (não /api/treinamentos) para não depender
    // das permissões da página de Turmas — aqui basta o acesso ao módulo
    // Metodologia e Desenvolvimento (authorizeRoles("metodologia")), já
    // garantido pelo restante da página, e o payload é enxuto (só os campos
    // usados no pré-preenchimento).
    { key: "turmas", label: "turmas", path: "/acoes-desenvolvimento/turmas-disponiveis", setter: setTurmas },
    { key: "coachingIndividual", label: "coaching individual", path: "/coaching-individual", setter: setCoachingIndividual },
    { key: "etapasJornada", label: "etapas da jornada", path: "/jornadas-etapas", setter: setEtapasJornada },
    { key: "metodologiaClientes", label: "clientes da metodologia", path: "/metodologia-clientes", setter: setMetodologiaClientes },
    // Reaproveita /api/trilhas (já restrito a authorizeRoles("metodologia"))
    // só para popular o <select> de "trilha vinculada" da etapa — não
    // duplica lógica de acesso nem cria endpoint novo pra isso.
    { key: "trilhasCatalogo", label: "trilhas", path: "/trilhas", setter: setTrilhasCatalogo },
  ];

  async function loadAll() {
    setLoading(true);
    setErro("");

    try {
      const resultados = await Promise.allSettled(
        FONTES_MAPA.map((fonte) => apiFetch(fonte.path))
      );

      const falhas = [];
      resultados.forEach((resultado, index) => {
        const fonte = FONTES_MAPA[index];
        if (resultado.status === "fulfilled") {
          const dados = resultado.value;
          fonte.setter(Array.isArray(dados) ? dados : []);
        } else {
          fonte.setter([]);
          falhas.push(
            `${fonte.label} (${extrairMensagemErro(resultado.reason, "erro desconhecido")})`
          );
        }
      });

      if (falhas.length) {
        setErro(`Não foi possível carregar: ${falhas.join("; ")}.`);
      }
    } catch (error) {
      setErro(
        extrairMensagemErro(error, "Erro ao carregar o Mapa de Desenvolvimento.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleExportarEvidencias() {
    setExportando(true);
    setErro("");
    try {
      await apiDownload(
        "/acoes-desenvolvimento/exportar",
        "evidencia-mapa-desenvolvimento.xlsx"
      );
    } catch (error) {
      setErro(
        extrairMensagemErro(error, "Erro ao exportar evidências do Mapa de Desenvolvimento.")
      );
    } finally {
      setExportando(false);
    }
  }

  async function saveJornada(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!String(jornadaForm.titulo || "").trim()) {
      setErro("Informe o nome da jornada.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(jornadaForm.data_inicio, jornadaForm.data_fim)) {
      setErro("A data fim da jornada não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        titulo: jornadaForm.titulo,
        cliente: jornadaForm.cliente || null,
        publico_alvo: jornadaForm.publico_alvo || null,
        objetivo: jornadaForm.objetivo || null,
        status: jornadaForm.status || "planejada",
        data_inicio: jornadaForm.data_inicio || null,
        data_fim: jornadaForm.data_fim || null,
      };

      if (jornadaForm.id) {
        await apiFetch(`/jornadas-desenvolvimento/${jornadaForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Jornada atualizada com sucesso.");
      } else {
        await apiFetch("/jornadas-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Jornada registrada com sucesso.");
      }

      setJornadaForm(journeyInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar jornada."));
    } finally {
      setSaving(false);
    }
  }

  async function saveParticipante(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!participanteForm.jornada_id) {
      setErro("Selecione a jornada do participante.");
      setSaving(false);
      return;
    }

    if (!String(participanteForm.nome || "").trim()) {
      setErro("Informe o nome da pessoa.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(participanteForm.jornada_id),
        nome: participanteForm.nome,
        matricula: participanteForm.matricula || null,
        cliente: participanteForm.cliente || null,
        turma: participanteForm.turma || null,
        cargo: participanteForm.cargo || null,
        supervisor: participanteForm.supervisor || null,
        status_jornada: participanteForm.status_jornada || "em_percurso",
      };

      await apiFetch("/jornada-participantes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setParticipanteForm((prev) => ({ ...participantInitial, jornada_id: prev.jornada_id }));
      setNotice("Participante vinculado com sucesso.");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao criar participante da jornada."));
    } finally {
      setSaving(false);
    }
  }

  async function importarTripulacao() {
    setSaving(true);
    setErro("");
    setNotice("");

    if (!participanteForm.jornada_id) {
      setErro("Selecione a jornada antes de importar os participantes.");
      setSaving(false);
      return;
    }

    if (!arquivoTripulacao) {
      setErro("Selecione o arquivo de importação.");
      setSaving(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("jornada_id", String(participanteForm.jornada_id));
      formData.append("arquivo", arquivoTripulacao);

      const data = await apiFetch("/jornada-participantes/importar", {
        method: "POST",
        body: formData,
      });

      setArquivoTripulacao(null);
      setNotice(data?.message || "Participantes importados com sucesso.");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao importar participantes."));
    } finally {
      setSaving(false);
    }
  }

  async function removeParticipante(id) {
    const ok = window.confirm("Deseja realmente remover esta pessoa da jornada?");
    if (!ok) return;

    try {
      await apiFetch(`/jornada-participantes/${id}`, { method: "DELETE" });
      setNotice("Pessoa removida da jornada com sucesso.");
      setErro("");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao remover participante da jornada."));
    }
  }

  async function saveAcao(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!acaoForm.jornada_id) {
      setErro("Selecione a jornada da ação.");
      setSaving(false);
      return;
    }

    if (!String(acaoForm.titulo || "").trim()) {
      setErro("Informe o título da ação.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(acaoForm.data_inicio, acaoForm.data_fim)) {
      setErro("A data fim da ação não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(acaoForm.jornada_id),
        titulo: acaoForm.titulo,
        descricao: acaoForm.descricao || null,
        responsavel_id: acaoForm.responsavel_id
          ? Number(acaoForm.responsavel_id)
          : null,
        status: acaoForm.status || "planejada",
        data_inicio: acaoForm.data_inicio || null,
        data_fim: acaoForm.data_fim || null,
        carga_horaria: Number(acaoForm.carga_horaria || 0),
        participantes_previstos: Number(acaoForm.participantes_previstos || 0),
        quantidade_turmas_sessoes: Number(acaoForm.quantidade_turmas_sessoes || 0),
        participantes_realizados: Number(acaoForm.participantes_realizados || 0),
        horas_planejadas: Number(acaoForm.horas_planejadas || 0),
        horas_realizadas: Number(acaoForm.horas_realizadas || 0),
        subtipo: acaoForm.subtipo || null,
        turma_id: acaoForm.turma_id ? Number(acaoForm.turma_id) : null,
      };

      if (acaoForm.id) {
        await apiFetch(`/acoes-desenvolvimento/${acaoForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Ação atualizada com sucesso.");
      } else {
        await apiFetch("/acoes-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Ação registrada com sucesso.");
      }

      setAcaoForm(actionInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar ação."));
    } finally {
      setSaving(false);
    }
  }

  async function saveCoaching(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!String(coachingForm.titulo || "").trim()) {
      setErro("Informe o título do coaching ou mentoria.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(coachingForm.data_inicio, coachingForm.data_fim)) {
      setErro("A data fim do coaching não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: coachingForm.jornada_id ? Number(coachingForm.jornada_id) : null,
        acao_id: coachingForm.acao_id ? Number(coachingForm.acao_id) : null,
        tipo_coaching: coachingForm.tipo_coaching,
        titulo: coachingForm.titulo,
        publico_alvo: coachingForm.publico_alvo || null,
        objetivo: coachingForm.objetivo || null,
        responsavel_id: coachingForm.responsavel_id || null,
        participantes_previstos: Number(coachingForm.participantes_previstos || 0),
        participantes_realizados: Number(coachingForm.participantes_realizados || 0),
        sessoes_previstas: Number(coachingForm.sessoes_previstas || 0),
        sessoes_realizadas: Number(coachingForm.sessoes_realizadas || 0),
        carga_horaria_sessao: Number(coachingForm.carga_horaria_sessao || 0),
        horas_totais: Number(coachingForm.horas_totais || 0),
        horas_planejadas: Number(coachingForm.horas_planejadas || 0),
        status: coachingForm.status || "planejado",
        data_inicio: coachingForm.data_inicio || null,
        data_fim: coachingForm.data_fim || null,
      };

      if (coachingForm.id) {
        await apiFetch(`/coaching-planos/${coachingForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Coaching atualizado com sucesso.");
      } else {
        await apiFetch("/coaching-planos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Coaching registrado com sucesso.");
      }

      setCoachingForm(coachingInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar coaching ou mentoria."));
    } finally {
      setSaving(false);
    }
  }

  async function removeRegistro(tipo, id) {
    const ok = window.confirm("Deseja realmente excluir este registro?");
    if (!ok) return;

    try {
      const pathMap = {
        jornada: `/jornadas-desenvolvimento/${id}`,
        acao: `/acoes-desenvolvimento/${id}`,
        coaching: `/coaching-planos/${id}`,
        etapa: `/jornadas-etapas/${id}`,
        clienteMetodologia: `/metodologia-clientes/${id}`,
      };

      await apiFetch(pathMap[tipo], { method: "DELETE" });
      setNotice("Registro excluído com sucesso.");
      setErro("");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao excluir registro."));
    }
  }

  async function saveEtapa(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!etapaForm.jornada_id) {
      setErro("Selecione a jornada da etapa.");
      setSaving(false);
      return;
    }

    if (!String(etapaForm.nome || "").trim()) {
      setErro("Informe o nome da etapa.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(etapaForm.data_inicio, etapaForm.data_fim)) {
      setErro("O prazo final da etapa não pode ser menor que o início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(etapaForm.jornada_id),
        nome: etapaForm.nome,
        objetivo: etapaForm.objetivo || null,
        tipo: etapaForm.tipo || "treinamento",
        status: etapaForm.status || "planejada",
        responsavel_id: etapaForm.responsavel_id ? Number(etapaForm.responsavel_id) : null,
        data_inicio: etapaForm.data_inicio || null,
        data_fim: etapaForm.data_fim || null,
        carga_horaria_prevista: Number(etapaForm.carga_horaria_prevista || 0),
        carga_horaria_realizada: Number(etapaForm.carga_horaria_realizada || 0),
        observacoes: etapaForm.observacoes || null,
        trilha_id: etapaForm.trilha_id ? Number(etapaForm.trilha_id) : null,
      };

      if (etapaForm.id) {
        await apiFetch(`/jornadas-etapas/${etapaForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Etapa atualizada com sucesso.");
      } else {
        await apiFetch("/jornadas-etapas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Etapa registrada com sucesso.");
      }

      setEtapaForm((prev) => ({ ...etapaInitial, jornada_id: prev.jornada_id }));
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar etapa da jornada."));
    } finally {
      setSaving(false);
    }
  }

  function editEtapa(item) {
    setEtapaForm({
      id: item.id,
      jornada_id: item.jornada_id ? String(item.jornada_id) : "",
      nome: item.nome || "",
      tipo: item.tipo || "treinamento",
      objetivo: item.objetivo || "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
      responsavel_id: item.responsavel_id ? String(item.responsavel_id) : "",
      carga_horaria_prevista: String(item.carga_horaria_prevista || ""),
      carga_horaria_realizada: String(item.carga_horaria_realizada || ""),
      observacoes: item.observacoes || "",
      trilha_id: item.trilha_id ? String(item.trilha_id) : "",
    });
  }

  async function saveClienteMetodologia(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!String(clienteMetForm.nome || "").trim()) {
      setErro("Informe o nome do cliente.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        nome: clienteMetForm.nome,
        status: clienteMetForm.status || "ativo",
        observacoes: clienteMetForm.observacoes || null,
      };

      if (clienteMetForm.id) {
        await apiFetch(`/metodologia-clientes/${clienteMetForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Cliente atualizado com sucesso.");
      } else {
        await apiFetch("/metodologia-clientes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Cliente cadastrado com sucesso.");
      }

      setClienteMetForm(clienteMetInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar cliente da metodologia."));
    } finally {
      setSaving(false);
    }
  }

  function editClienteMetodologia(item) {
    setClienteMetForm({
      id: item.id,
      nome: item.nome || "",
      status: item.status || "ativo",
      observacoes: item.observacoes || "",
    });
  }

  async function alternarStatusCliente(item) {
    const novoStatus = item.status === "ativo" ? "inativo" : "ativo";
    try {
      await apiFetch(`/metodologia-clientes/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: item.nome,
          status: novoStatus,
          observacoes: item.observacoes || null,
        }),
      });
      setNotice(novoStatus === "ativo" ? "Cliente reativado com sucesso." : "Cliente desativado com sucesso.");
      setErro("");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao atualizar status do cliente."));
    }
  }

  function editJornada(item) {
    setJornadaForm({
      id: item.id,
      titulo: item.titulo || item.nome || "",
      cliente: item.cliente || "",
      publico_alvo: item.publico_alvo || item.publico_macro || "",
      objetivo: item.objetivo || "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
    });
    setParticipanteForm((prev) => ({ ...prev, jornada_id: String(item.id) }));
    setActiveTab("jornadas");
  }

  // Pré-preenche (sem travar) horas e participantes realizados a partir dos
  // dados reais de uma turma já executada — usuário continua podendo editar
  // os valores depois de selecionar a turma.
  function handleSelecionarTurma(turmaIdValue) {
    const turma = turmas.find((t) => String(t.id) === String(turmaIdValue));
    setAcaoForm((prev) => ({
      ...prev,
      turma_id: turmaIdValue,
      horas_realizadas: turma ? String(turma.carga_horaria || 0) : prev.horas_realizadas,
      participantes_realizados: turma
        ? String(turma.participantes_presentes || turma.participantes || 0)
        : prev.participantes_realizados,
    }));
  }

  function editAcao(item) {
    setAcaoForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      titulo: item.titulo || item.tema || "",
      descricao: item.descricao || "",
      responsavel_id: item.responsavel_id ? String(item.responsavel_id) : "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
      carga_horaria: String(item.carga_horaria || ""),
      participantes_previstos: String(item.participantes_previstos || ""),
      quantidade_turmas_sessoes: String(item.quantidade_turmas_sessoes || ""),
      participantes_realizados: String(item.participantes_realizados || ""),
      horas_planejadas: String(item.horas_planejadas || ""),
      horas_realizadas: String(item.horas_realizadas || ""),
      subtipo: item.subtipo || "",
      turma_id: item.turma_id ? String(item.turma_id) : "",
    });
    setActiveTab("acoes");
  }

  function editCoaching(item) {
    setCoachingForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      acao_id: item.acao_id || "",
      tipo_coaching: item.tipo_coaching || "coaching",
      titulo: item.titulo || "",
      publico_alvo: item.publico_alvo || "",
      objetivo: item.objetivo || "",
      responsavel_id: item.responsavel_id || "",
      participantes_previstos: String(item.participantes_previstos || ""),
      participantes_realizados: String(item.participantes_realizados || ""),
      sessoes_previstas: String(item.sessoes_previstas || ""),
      sessoes_realizadas: String(item.sessoes_realizadas || ""),
      carga_horaria_sessao: String(item.carga_horaria_sessao || ""),
      horas_totais: String(item.horas_totais || ""),
      horas_planejadas: String(item.horas_planejadas || ""),
      status: canonicalStatus(item.status) || "planejado",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
    });
    setActiveTab("coaching");
  }

  const usuariosMap = useMemo(() => {
    const map = {};
    usuarios.forEach((u) => {
      map[String(u.id)] = u.nome || `Usuário ${u.id}`;
    });
    return map;
  }, [usuarios]);

  const participantesEnriquecidos = useMemo(() => {
    return participantesJornada.map((item) => {
      const jornada = jornadas.find((j) => String(j.id) === String(item.jornada_id));
      return {
        ...item,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
      };
    });
  }, [participantesJornada, jornadas]);

  const participantesPorJornada = useMemo(() => {
    return participantesEnriquecidos.reduce((acc, item) => {
      const key = String(item.jornada_id || "");
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [participantesEnriquecidos]);

  const etapasPorJornada = useMemo(() => {
    return etapasJornada.reduce((acc, item) => {
      const key = String(item.jornada_id || "");
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [etapasJornada]);

  // Só clientes ativos entram como opção nos formulários — inativos
  // continuam existindo (e visíveis na seção de gestão) só não aparecem
  // mais pra evitar cadastro novo em cima de um nome "desligado".
  const metodologiaClientesAtivos = useMemo(() => {
    return metodologiaClientes
      .filter((item) => (item.status || "ativo") === "ativo")
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }, [metodologiaClientes]);

  // Os campos "cliente" continuam VARCHAR livre no banco (histórico), então
  // se o valor já salvo não estiver mais na lista ativa (renomeado,
  // desativado, ou de antes desta lista existir) ele é injetado como opção
  // extra — senão o <select> mostraria em branco e o usuário acharia que o
  // dado sumiu.
  function opcoesCliente(valorAtual) {
    const nomes = metodologiaClientesAtivos.map((item) => item.nome);
    const atual = String(valorAtual || "").trim();
    if (atual && !nomes.includes(atual)) {
      return [...nomes, atual];
    }
    return nomes;
  }

  const trilhasMap = useMemo(() => {
    const map = {};
    trilhasCatalogo.forEach((item) => {
      map[String(item.id)] = item.titulo;
    });
    return map;
  }, [trilhasCatalogo]);

  const jornadasEnriquecidas = useMemo(() => {
    return jornadas.map((jornada) => {
      const acoesDaJornada = acoes.filter(
        (a) => String(a.jornada_id) === String(jornada.id)
      );
      const coachingsDaJornada = coachings.filter(
        (c) => String(c.jornada_id || "") === String(jornada.id)
      );

      const horasTotais =
        acoesDaJornada.reduce(
          (acc, item) => acc + Number(item.horas_realizadas || 0),
          0
        ) +
        coachingsDaJornada.reduce(
          (acc, item) => acc + Number(item.horas_totais || 0),
          0
        );

      return {
        ...jornada,
        nome: jornada.nome || jornada.titulo,
        publico_macro: jornada.publico_macro || jornada.publico_alvo,
        total_acoes: acoesDaJornada.length,
        total_coachings: coachingsDaJornada.length,
        total_tripulantes: (participantesPorJornada[String(jornada.id)] || []).length,
        tripulacao_preview: (participantesPorJornada[String(jornada.id)] || []).slice(0, 4),
        // Coaching individual é indexado pelo jornada_id do participante
        // vinculado (coaching_individual.jornada_participante_id →
        // jornada_participantes.jornada_id), não por um jornada_id direto
        // na própria tabela — por isso o filtro passa por
        // jornada_participante_jornada_id, que o backend já traz pronto.
        total_coaching_individual: coachingIndividual.filter(
          (c) => String(c.jornada_participante_jornada_id || "") === String(jornada.id)
        ).length,
        horas_totais: horasTotais,
        prazo_info: getPrazoInfo(jornada),
        attention_info: getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada),
        status_canonico: canonicalStatus(jornada.status),
      };
    });
  }, [jornadas, acoes, coachings, participantesPorJornada, coachingIndividual]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));

      return {
        ...acao,
        tema: acao.tema || acao.titulo,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
        cliente: jornada?.cliente || "",
        responsavel_nome:
          usuariosMap[String(acao.responsavel_id)] || "Não definido",
        prazo_info: getPrazoInfo(acao),
        attention_info: getActionAttention(acao),
        status_canonico: canonicalStatus(acao.status),
      };
    });
  }, [acoes, jornadas, usuariosMap]);

  const coachingsEnriquecidos = useMemo(() => {
    return coachings.map((item) => {
      const jornada = jornadas.find((j) => String(j.id) === String(item.jornada_id || ""));
      const acao = acoes.find((a) => String(a.id) === String(item.acao_id || ""));

      return {
        ...item,
        jornada_nome: jornada?.nome || jornada?.titulo || "Independente",
        acao_nome: acao?.tema || acao?.titulo || "Sem ação vinculada",
        cliente: jornada?.cliente || "",
        responsavel_nome:
          usuariosMap[String(item.responsavel_id)] || item.responsavel || "Não definido",
        prazo_info: getPrazoInfo(item),
        attention_info: getCoachingAttention(item),
        status_canonico: canonicalStatus(item.status),
      };
    });
  }, [coachings, jornadas, acoes, usuariosMap]);

  const clientesDisponiveis = useMemo(() => {
    const nomes = new Set(
      jornadas.map((item) => String(item.cliente || "").trim()).filter(Boolean)
    );
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [jornadas]);

  const filteredJornadas = useMemo(() => {
    return jornadasEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.id) === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [item.nome, item.objetivo, item.publico_macro, item.cliente].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [jornadasEnriquecidas, filters]);

  const filteredAcoes = useMemo(() => {
    return acoesEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id) === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [
            item.tema,
            item.descricao,
            item.jornada_nome,
            item.responsavel_nome,
          ].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [acoesEnriquecidas, filters]);

  const filteredCoachings = useMemo(() => {
    return coachingsEnriquecidos.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [
            item.titulo,
            item.tipo_coaching,
            item.publico_alvo,
            item.objetivo,
            item.jornada_nome,
            item.acao_nome,
            item.responsavel_nome,
          ].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [coachingsEnriquecidos, filters]);

  const jornadasFluxo = useMemo(() => {
    return filteredJornadas.map((jornada) => {
      const acoesDaJornada = filteredAcoes.filter(
        (item) => String(item.jornada_id) === String(jornada.id)
      );

      const coachingsDaJornada = filteredCoachings.filter(
        (item) => String(item.jornada_id || "") === String(jornada.id)
      );

      const totalBlocos = acoesDaJornada.length + coachingsDaJornada.length;
      const concluidos =
        acoesDaJornada.filter((item) => canonicalStatus(item.status) === "concluido").length +
        coachingsDaJornada.filter((item) => canonicalStatus(item.status) === "concluido").length;

      const progresso = totalBlocos ? Math.round((concluidos / totalBlocos) * 100) : 0;

      const proximoPasso =
        acoesDaJornada.find((item) => canonicalStatus(item.status) !== "concluido")?.tema ||
        coachingsDaJornada.find((item) => canonicalStatus(item.status) !== "concluido")?.titulo ||
        "Estruturar os próximos passos";

      return {
        ...jornada,
        acoesDaJornada,
        coachingsDaJornada,
        concluidos,
        progresso,
        proximoPasso,
      };
    });
  }, [filteredJornadas, filteredAcoes, filteredCoachings]);

  // Visão gerencial pedida no projeto: jornadas agrupadas por cliente
  // (SAFRA, CREA, DASA etc.), não uma lista plana. Clientes com jornada vêm
  // ordenados alfabeticamente; jornadas sem cliente informado ficam num
  // grupo à parte, ao final.
  const jornadasFluxoAgrupadas = useMemo(() => {
    const grupos = new Map();
    jornadasFluxo.forEach((jornada) => {
      const cliente = String(jornada.cliente || "").trim();
      const chave = cliente || "__sem_cliente__";
      if (!grupos.has(chave)) {
        grupos.set(chave, { cliente: cliente || "Sem cliente definido", itens: [] });
      }
      grupos.get(chave).itens.push(jornada);
    });

    const comCliente = Array.from(grupos.values())
      .filter((g) => g.cliente !== "Sem cliente definido")
      .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
    const semCliente = grupos.get("__sem_cliente__");

    return semCliente ? [...comCliente, semCliente] : comCliente;
  }, [jornadasFluxo]);

  const kpis = useMemo(() => {
    return {
      jornadas: filteredJornadas.length,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      tripulacao: filteredJornadas.reduce(
        (acc, item) => acc + Number(item.total_tripulantes || 0),
        0
      ),
      participantesImpactados:
        filteredAcoes.reduce(
          (acc, item) => acc + Number(item.participantes_realizados || 0),
          0
        ) +
        filteredCoachings.reduce(
          (acc, item) => acc + Number(item.participantes_realizados || 0),
          0
        ),
      horasTotais:
        filteredAcoes.reduce(
          (acc, item) => acc + Number(item.horas_realizadas || 0),
          0
        ) +
        filteredCoachings.reduce(
          (acc, item) => acc + Number(item.horas_totais || 0),
          0
        ),
      concluidas:
        filteredAcoes.filter((i) => canonicalStatus(i.status) === "concluido").length +
        filteredCoachings.filter((i) => canonicalStatus(i.status) === "concluido").length,
    };
  }, [filteredJornadas, filteredAcoes, filteredCoachings]);

  const acoesOptions = useMemo(() => {
    return [...acoesEnriquecidas].sort((a, b) =>
      String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR")
    );
  }, [acoesEnriquecidas]);

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 18 }}>
        <PageHero
          eyebrow="Mapa de Desenvolvimento"
          title="Jornadas, ações e coaching de desenvolvimento em um só lugar"
          subtitle="Acompanhe jornadas por cliente, ações de desenvolvimento e coaching/mentoria, com indicadores e exportação de evidências para conformidade."
          stats={[
            { label: "jornadas", value: fmtNumber(kpis.jornadas) },
            { label: "ações", value: fmtNumber(kpis.acoes) },
            { label: "coaching e mentoria", value: fmtNumber(kpis.coachings) },
          ]}
          actions={
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={handleExportarEvidencias}
              disabled={exportando}
            >
              {exportando ? "Exportando..." : "⬇ Exportar evidência (MPT)"}
            </button>
          }
        />

        <div style={tabBar}>
          {[
            ["geral", "Visão geral"],
            ["jornadas", "Jornadas"],
            ["acoes", "Ações"],
            ["coaching", "Coaching e mentoria"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={tabButton(activeTab === key)}
            >
              {label}
            </button>
          ))}
        </div>

        <SectionCard
          title="Indicadores gerais"
          subtitle="Leitura macro do desenvolvimento e do volume em curso."
        >
          <div style={kpiGrid}>
            <StatCard title="Jornadas ativas" value={fmtNumber(kpis.jornadas)} accent="#2563eb" />
            <StatCard title="Ações" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Coaching e mentoria" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Participantes" value={fmtNumber(kpis.tripulacao)} accent="#16a34a" />
            <StatCard title="Público impactado" value={fmtNumber(kpis.participantesImpactados)} accent="#b45309" />
            <StatCard title="Horas totais" value={fmtHours(kpis.horasTotais)} accent="#0f766e" />
            <StatCard title="Entregas concluídas" value={fmtNumber(kpis.concluidas)} accent="#1d4ed8" />
          </div>
        </SectionCard>

        <SectionCard
          title="Filtros"
          subtitle="Refine por jornada, cliente, status e busca."
          action={
            <button
              style={buttonSecondaryStyle()}
              onClick={() =>
                setFilters({
                  jornada_id: "",
                  status: "",
                  busca: "",
                  cliente: "",
                })
              }
            >
              Limpar filtros
            </button>
          }
        >
          <div style={filtersPanel}>
            <label style={labelStyle()}>
              Jornada
              <select
                value={filters.jornada_id}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, jornada_id: e.target.value }))
                }
                style={inputStyle()}
              >
                <option value="">Todas</option>
                {jornadas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome || item.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Cliente
              <select
                value={filters.cliente}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, cliente: e.target.value }))
                }
                style={inputStyle()}
              >
                <option value="">Todos</option>
                {clientesDisponiveis.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Status
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, status: e.target.value }))
                }
                style={inputStyle()}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), gridColumn: "span 2" }}>
              Busca
              <input
                value={filters.busca}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, busca: e.target.value }))
                }
                placeholder="Jornada, ação, coaching, mentoria..."
                style={inputStyle()}
              />
            </label>
          </div>

          {(erro || notice) && (
            <div style={{ marginTop: 14 }}>
              {erro ? <div style={errorAlert}>{erro}</div> : null}
              {notice ? (
                <div style={{ ...successAlert, marginTop: erro ? 10 : 0 }}>
                  {notice}
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        {activeTab === "geral" && (
          <AbaGeral
            loading={loading}
            jornadasFluxo={jornadasFluxo}
            jornadasFluxoAgrupadas={jornadasFluxoAgrupadas}
            filteredAcoes={filteredAcoes}
            editJornada={editJornada}
            removeRegistro={removeRegistro}
            editAcao={editAcao}
          />
        )}

        {activeTab === "jornadas" && (
          <AbaJornadas
            clienteMetForm={clienteMetForm}
            setClienteMetForm={setClienteMetForm}
            saveClienteMetodologia={saveClienteMetodologia}
            editClienteMetodologia={editClienteMetodologia}
            alternarStatusCliente={alternarStatusCliente}
            metodologiaClientes={metodologiaClientes}
            jornadaForm={jornadaForm}
            setJornadaForm={setJornadaForm}
            saveJornada={saveJornada}
            opcoesCliente={opcoesCliente}
            etapaForm={etapaForm}
            setEtapaForm={setEtapaForm}
            saveEtapa={saveEtapa}
            editEtapa={editEtapa}
            jornadas={jornadas}
            trilhasCatalogo={trilhasCatalogo}
            usuarios={usuarios}
            filteredJornadas={filteredJornadas}
            etapasPorJornada={etapasPorJornada}
            trilhasMap={trilhasMap}
            removeRegistro={removeRegistro}
            participanteForm={participanteForm}
            setParticipanteForm={setParticipanteForm}
            saveParticipante={saveParticipante}
            importarTripulacao={importarTripulacao}
            arquivoTripulacao={arquivoTripulacao}
            setArquivoTripulacao={setArquivoTripulacao}
            participantesPorJornada={participantesPorJornada}
            removeParticipante={removeParticipante}
            loading={loading}
            jornadasFluxo={jornadasFluxo}
            editJornada={editJornada}
            saving={saving}
            setErro={setErro}
            setNotice={setNotice}
          />
        )}

        {activeTab === "acoes" && (
          <AbaAcoes
            acaoForm={acaoForm}
            setAcaoForm={setAcaoForm}
            saveAcao={saveAcao}
            jornadas={jornadas}
            turmas={turmas}
            usuarios={usuarios}
            handleSelecionarTurma={handleSelecionarTurma}
            saving={saving}
            setErro={setErro}
            setNotice={setNotice}
            loading={loading}
            filteredAcoes={filteredAcoes}
            editAcao={editAcao}
            removeRegistro={removeRegistro}
          />
        )}

        {activeTab === "coaching" && (
          <AbaCoaching
            coachingForm={coachingForm}
            setCoachingForm={setCoachingForm}
            saveCoaching={saveCoaching}
            jornadas={jornadas}
            acoesOptions={acoesOptions}
            usuarios={usuarios}
            saving={saving}
            setErro={setErro}
            setNotice={setNotice}
            loading={loading}
            filteredCoachings={filteredCoachings}
            editCoaching={editCoaching}
            removeRegistro={removeRegistro}
          />
        )}
      </div>
    </PortalShell>
  );
}
