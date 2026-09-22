"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius, estiloBadgeClassificacao } from "../../lib/theme";

// Tripulação (20/09/2026, pedido do Ramon) — visão única de todo mundo
// acompanhado pela Metodologia: quem está numa jornada coletiva de cliente,
// quem está em coaching individual, ou nos dois. Os dois vínculos nunca se
// misturam num só número (ver claude/framework-kpis-metodologia-2026-09-20.md)
// — aqui eles só aparecem lado a lado, na mesma linha da mesma pessoa.
//
// Perfil comportamental (mesmo dia, mesmo pedido do Ramon) — Lobo, Gato,
// Tubarão, Águia + DISC — mora aqui também, não numa página própria:
// cadastro manual por linha (ver perfilComportamentalController.js e o
// comentário do passo 41 em migrate.js pra fonte/critério de escolha do
// mapeamento) e, quando a pessoa também tem coaching individual, a
// orientação de abordagem sugerida aparece dentro do próprio painel de
// encontros — é isso que faz o perfil "orientar o coaching", como o Ramon
// pediu, em vez de só ficar registrado na ficha da pessoa.

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "jornada", label: "Jornada coletiva" },
  { key: "coaching", label: "Coaching individual" },
  { key: "ambos", label: "Ambos" },
];

const PERFIL_OPCOES = [
  { key: "lobo", label: "Lobo" },
  { key: "gato", label: "Gato" },
  { key: "tubarao", label: "Tubarão" },
  { key: "aguia", label: "Águia" },
];

const PERFIL_META = {
  lobo: { label: "Lobo", cor: colors.primary, fundo: colors.primaryLight },
  gato: { label: "Gato", cor: colors.successText, fundo: colors.successLight },
  tubarao: { label: "Tubarão", cor: colors.dangerText, fundo: colors.dangerLight },
  aguia: { label: "Águia", cor: colors.accentText, fundo: colors.accentLight },
};

const perfilFormVazio = {
  perfil_animal: "",
  perfil_animal_secundario: "",
  disc_letra_dominante: "",
  observacoes: "",
};

function buildPerfilMaps(perfis) {
  const porJornadaParticipante = new Map();
  const porCoaching = new Map();
  (perfis || []).forEach((perfil) => {
    if (perfil.jornada_participante_id) porJornadaParticipante.set(perfil.jornada_participante_id, perfil);
    if (perfil.coaching_individual_id) porCoaching.set(perfil.coaching_individual_id, perfil);
  });
  return { porJornadaParticipante, porCoaching };
}

function farolInfo(coaching) {
  if (!coaching) return null;
  if (coaching.farol === "em_dia") return { label: "Em dia", tone: "ok" };
  if (coaching.farol === "atrasado") return { label: "Atrasado", tone: "critico" };
  if (coaching.farol === "encerrado") return { label: "Encerrado", tone: "neutro" };
  return { label: "Aguardando 1º encontro", tone: "neutro" };
}

function badgeFarol(info) {
  if (!info) return null;
  if (info.tone === "critico") return estiloBadgeClassificacao("Crítico");
  if (info.tone === "ok") return estiloBadgeClassificacao("Saudável");
  return { ...estiloBadgeClassificacao("Atenção"), background: colors.surfaceMuted, color: colors.textSecondary };
}

function buildLinhas(participantes, coachings) {
  const porParticipanteId = new Map();
  const semJornada = [];
  (coachings || []).forEach((c) => {
    if (c.jornada_participante_id) porParticipanteId.set(c.jornada_participante_id, c);
    else semJornada.push(c);
  });

  const linhasJornada = (participantes || []).map((p) => {
    const coaching = porParticipanteId.get(p.id) || null;
    return {
      key: `jp-${p.id}`,
      nome: p.nome,
      cliente: p.cliente || "Sem cliente",
      jornadaParticipanteId: p.id,
      jornadaNome: p.jornada_nome,
      statusJornada: p.status_jornada,
      coaching,
      vinculo: coaching ? "ambos" : "jornada",
    };
  });

  const linhasCoachingSolo = semJornada.map((c) => ({
    key: `ci-${c.id}`,
    nome: c.nome,
    cliente: c.cliente || "Sem cliente",
    jornadaParticipanteId: null,
    jornadaNome: null,
    statusJornada: null,
    coaching: c,
    vinculo: "coaching",
  }));

  return [...linhasJornada, ...linhasCoachingSolo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const formVazio = { nome: "", cliente: "", cargo: "", cadencia_dias: 30, jornada_participante_id: "" };

export default function TripulacaoPage() {
  const [participantes, setParticipantes] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [expandido, setExpandido] = useState(null);
  const [encontros, setEncontros] = useState({});
  const [novaData, setNovaData] = useState({});
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [salvando, setSalvando] = useState(false);
  // Editar/excluir por vínculo (22/09/2026, pedido do Ramon) — coachingEmEdicao
  // guarda o registro inteiro de coaching_individual sendo editado (não só o
  // id), pra preservar no PUT os campos que este formulário não mostra
  // (matrícula, responsável, status, datas, observações) e nunca apagá-los
  // sem querer — o PUT do backend substitui o registro inteiro.
  const [coachingEmEdicao, setCoachingEmEdicao] = useState(null);
  const [confirmarExcluirCoaching, setConfirmarExcluirCoaching] = useState(null);
  const [confirmarExcluirJornada, setConfirmarExcluirJornada] = useState(null);
  const [excluindoCoaching, setExcluindoCoaching] = useState(false);
  const [excluindoJornada, setExcluindoJornada] = useState(false);
  const [perfilExpandido, setPerfilExpandido] = useState(null);
  const [perfilForm, setPerfilForm] = useState(perfilFormVazio);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  // Lista de clientes exclusiva da Metodologia (20/09/2026) — mesma lista
  // usada no Mapa de Desenvolvimento, ver migrate.js passo 42. Só pra
  // popular o <select> de Cliente do coaching individual, sem duplicar
  // cadastro nenhum.
  const [metodologiaClientes, setMetodologiaClientes] = useState([]);

  async function carregar() {
    setCarregando(true);
    const [pResult, cResult, perfilResult, clientesResult] = await Promise.allSettled([
      apiFetch("/jornada-participantes"),
      apiFetch("/coaching-individual"),
      apiFetch("/perfis-comportamentais"),
      apiFetch("/metodologia-clientes"),
    ]);
    if (pResult.status === "fulfilled") setParticipantes(pResult.value);
    if (cResult.status === "fulfilled") setCoachings(cResult.value);
    if (perfilResult.status === "fulfilled") setPerfis(perfilResult.value);
    if (clientesResult.status === "fulfilled") setMetodologiaClientes(clientesResult.value);
    if (pResult.status === "rejected" && cResult.status === "rejected") {
      setErro("Não foi possível carregar a tripulação.");
    } else {
      setErro("");
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const linhas = useMemo(() => buildLinhas(participantes, coachings), [participantes, coachings]);
  const linhasFiltradas = useMemo(
    () => (filtro === "todos" ? linhas : linhas.filter((l) => l.vinculo === filtro)),
    [linhas, filtro]
  );
  const { porJornadaParticipante: perfilPorJornada, porCoaching: perfilPorCoaching } = useMemo(
    () => buildPerfilMaps(perfis),
    [perfis]
  );

  function perfilDaLinha(linha) {
    if (linha.coaching && perfilPorCoaching.has(linha.coaching.id)) return perfilPorCoaching.get(linha.coaching.id);
    if (linha.jornadaParticipanteId && perfilPorJornada.has(linha.jornadaParticipanteId)) {
      return perfilPorJornada.get(linha.jornadaParticipanteId);
    }
    return null;
  }

  const participantesSemCoaching = useMemo(
    () => linhas.filter((l) => l.vinculo === "jornada"),
    [linhas]
  );

  // Mesma lógica de "injeta o valor atual se não estiver mais na lista
  // ativa" usada em mapa-desenvolvimento/page.js — o campo cliente do
  // coaching individual continua VARCHAR livre no banco, então um valor já
  // salvo antes desta lista existir (ou depois renomeado/desativado) não
  // pode simplesmente sumir do <select>.
  const opcoesClienteCoaching = useMemo(() => {
    const nomes = metodologiaClientes
      .filter((item) => (item.status || "ativo") === "ativo")
      .map((item) => item.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const atual = String(form.cliente || "").trim();
    if (atual && !nomes.includes(atual)) {
      return [...nomes, atual];
    }
    return nomes;
  }, [metodologiaClientes, form.cliente]);

  async function abrirEncontros(coachingId) {
    if (expandido === coachingId) {
      setExpandido(null);
      return;
    }
    setExpandido(coachingId);
    try {
      const lista = await apiFetch(`/coaching-individual/${coachingId}/encontros`);
      setEncontros((prev) => ({ ...prev, [coachingId]: lista }));
    } catch {
      setEncontros((prev) => ({ ...prev, [coachingId]: [] }));
    }
  }

  async function registrarEncontro(coachingId) {
    const data = novaData[coachingId];
    if (!data) return;
    try {
      await apiFetch(`/coaching-individual/${coachingId}/encontros`, {
        method: "POST",
        body: JSON.stringify({ data_encontro: data }),
      });
      setNovaData((prev) => ({ ...prev, [coachingId]: "" }));
      const lista = await apiFetch(`/coaching-individual/${coachingId}/encontros`);
      setEncontros((prev) => ({ ...prev, [coachingId]: lista }));
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível registrar o encontro.");
    }
  }

  function abrirNovoForm(linhaJornada) {
    setCoachingEmEdicao(null);
    if (linhaJornada) {
      setForm({
        nome: linhaJornada.nome,
        cliente: linhaJornada.cliente,
        cargo: "",
        cadencia_dias: 30,
        jornada_participante_id: String(linhaJornada.jornadaParticipanteId),
      });
    } else {
      setForm(formVazio);
    }
    setFormAberto(true);
  }

  // Editar/excluir por vínculo (22/09/2026, pedido do Ramon) — abre o mesmo
  // formulário de "Novo coaching individual", pré-preenchido, em modo edição.
  function abrirEditarCoaching(coaching) {
    setCoachingEmEdicao(coaching);
    setForm({
      nome: coaching.nome || "",
      cliente: coaching.cliente || "",
      cargo: coaching.cargo || "",
      cadencia_dias: coaching.cadencia_dias || 30,
      jornada_participante_id: coaching.jornada_participante_id ? String(coaching.jornada_participante_id) : "",
    });
    setFormAberto(true);
  }

  function fecharFormCoaching() {
    setFormAberto(false);
    setForm(formVazio);
    setCoachingEmEdicao(null);
  }

  // GET devolve data_inicio/data_fim como ISO completo ("2026-01-10T00:00:00.000Z"),
  // porque é assim que o driver serializa colunas DATE. Reenviar esse valor
  // inteiro no PUT quebra a atualização (a coluna é DATE, não aceita o
  // sufixo "T...Z" — testado localmente e confirmado). Corta pra "YYYY-MM-DD".
  function apenasData(valor) {
    if (!valor) return null;
    return String(valor).slice(0, 10);
  }

  async function salvarNovoCoaching(e) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    try {
      if (coachingEmEdicao) {
        // PUT substitui o registro inteiro no backend — por isso reenviamos
        // aqui os campos que este formulário não edita, com o valor que já
        // estava salvo, em vez de deixá-los de fora (o que os zeraria).
        await apiFetch(`/coaching-individual/${coachingEmEdicao.id}`, {
          method: "PUT",
          body: JSON.stringify({
            matricula: coachingEmEdicao.matricula || null,
            responsavel_id: coachingEmEdicao.responsavel_id || null,
            status: coachingEmEdicao.status || "ativo",
            data_inicio: apenasData(coachingEmEdicao.data_inicio),
            data_fim: apenasData(coachingEmEdicao.data_fim),
            observacoes: coachingEmEdicao.observacoes || null,
            nome: form.nome,
            cliente: form.cliente || null,
            cargo: form.cargo || null,
            cadencia_dias: Number(form.cadencia_dias || 30),
            jornada_participante_id: form.jornada_participante_id || null,
          }),
        });
      } else {
        await apiFetch("/coaching-individual", {
          method: "POST",
          body: JSON.stringify({
            nome: form.nome,
            cliente: form.cliente || null,
            cargo: form.cargo || null,
            cadencia_dias: Number(form.cadencia_dias || 30),
            jornada_participante_id: form.jornada_participante_id || null,
          }),
        });
      }
      fecharFormCoaching();
      carregar();
    } catch (err) {
      alert(err.message || `Não foi possível ${coachingEmEdicao ? "atualizar" : "criar"} o coaching individual.`);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirCoaching(coachingId) {
    setExcluindoCoaching(true);
    try {
      await apiFetch(`/coaching-individual/${coachingId}`, { method: "DELETE" });
      setConfirmarExcluirCoaching(null);
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível excluir este coaching individual.");
    } finally {
      setExcluindoCoaching(false);
    }
  }

  async function excluirJornada(participanteId) {
    setExcluindoJornada(true);
    try {
      await apiFetch(`/jornada-participantes/${participanteId}`, { method: "DELETE" });
      setConfirmarExcluirJornada(null);
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível excluir este vínculo de jornada.");
    } finally {
      setExcluindoJornada(false);
    }
  }

  function abrirPerfil(linha) {
    if (perfilExpandido === linha.key) {
      setPerfilExpandido(null);
      return;
    }
    const existente = perfilDaLinha(linha);
    setPerfilForm(
      existente
        ? {
            perfil_animal: existente.perfil_animal || "",
            perfil_animal_secundario: existente.perfil_animal_secundario || "",
            disc_letra_dominante: existente.disc_letra_dominante || "",
            observacoes: existente.observacoes || "",
          }
        : perfilFormVazio
    );
    setPerfilExpandido(linha.key);
  }

  async function salvarPerfil(linha) {
    setSalvandoPerfil(true);
    try {
      const existente = perfilDaLinha(linha);
      const payload = {
        nome: linha.nome,
        cliente: linha.cliente,
        jornada_participante_id: linha.jornadaParticipanteId || null,
        coaching_individual_id: linha.coaching?.id || null,
        perfil_animal: perfilForm.perfil_animal || null,
        perfil_animal_secundario: perfilForm.perfil_animal_secundario || null,
        disc_letra_dominante: perfilForm.disc_letra_dominante || null,
        observacoes: perfilForm.observacoes || null,
      };

      if (existente) {
        await apiFetch(`/perfis-comportamentais/${existente.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/perfis-comportamentais", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setPerfilExpandido(null);
      carregar();
    } catch (err) {
      alert(err.message || "Não foi possível salvar o perfil comportamental.");
    } finally {
      setSalvandoPerfil(false);
    }
  }

  return (
    <PortalShell>
      <PageHero
        eyebrow="Ambiente Metodologia"
        title="Tripulação"
        subtitle="Todas as pessoas acompanhadas — jornada coletiva, coaching individual, ou os dois. Cada vínculo mantém seu próprio farol, sem se misturar num só número."
        stats={[
          { label: "em jornada coletiva", value: participantes.length },
          { label: "em coaching individual", value: coachings.length },
          { label: "exibidas nesta lista", value: linhasFiltradas.length },
        ]}
        actions={
          <button style={botaoPrimario} onClick={() => abrirNovoForm(null)}>
            + Coaching individual
          </button>
        }
      />

      {erro && <div style={avisoErro}>{erro}</div>}

      {formAberto && (
        <SectionCard
          title={coachingEmEdicao ? "Editar coaching individual" : "Novo coaching individual"}
          subtitle={
            coachingEmEdicao
              ? "Ajuste os dados deste coaching. O vínculo com a jornada coletiva também pode ser mudado aqui."
              : "Pode ser uma pessoa já em jornada, ou alguém sem jornada nenhuma (ex.: diretoria)"
          }
        >

          <form onSubmit={salvarNovoCoaching} style={formGrid}>
            <label style={campoLabel}>
              Nome
              <input
                style={campoInput}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </label>
            <label style={campoLabel}>
              Cliente
              <select
                style={campoInput}
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              >
                <option value="">Selecione</option>
                {opcoesClienteCoaching.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={campoLabel}>
              Cargo
              <input
                style={campoInput}
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </label>
            <label style={campoLabel}>
              Cadência combinada (dias)
              <input
                type="number"
                min={1}
                style={campoInput}
                value={form.cadencia_dias}
                onChange={(e) => setForm({ ...form, cadencia_dias: e.target.value })}
              />
            </label>
            <label style={campoLabel}>
              Vincular a alguém já em jornada (opcional)
              <select
                style={campoInput}
                value={form.jornada_participante_id}
                onChange={(e) => setForm({ ...form, jornada_participante_id: e.target.value })}
              >
                <option value="">Sem jornada — só coaching</option>
                {participantesSemCoaching.map((p) => (
                  <option key={p.jornadaParticipanteId} value={p.jornadaParticipanteId}>
                    {p.nome} — {p.cliente}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button type="submit" style={botaoPrimario} disabled={salvando}>
                {salvando ? "Salvando…" : coachingEmEdicao ? "Salvar alterações" : "Salvar"}
              </button>
              <button type="button" style={botaoSecundario} onClick={fecharFormCoaching}>
                Cancelar
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 0 16px", flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            style={filtro === f.key ? abaAtiva : abaInativa}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SectionCard>
        {carregando ? (
          <p style={vazio}>Carregando…</p>
        ) : !linhasFiltradas.length ? (
          <p style={vazio}>Nenhuma pessoa encontrada para este filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={linhaCabecalho}>
              <span>Pessoa</span>
              <span>Cliente</span>
              <span>Vínculo</span>
              <span>Perfil</span>
              <span>Coaching</span>
              <span style={{ textAlign: "right" }}>Ações</span>
            </div>
            {linhasFiltradas.map((linha) => {
              const farol = farolInfo(linha.coaching);
              const badge = badgeFarol(farol);
              const perfil = perfilDaLinha(linha);
              const perfilMeta = perfil?.perfil_animal ? PERFIL_META[perfil.perfil_animal] : null;
              return (
                <div key={linha.key}>
                  <div style={linhaTabela}>
                    <div style={{ fontWeight: 700, color: colors.textPrimary }}>{linha.nome}</div>
                    <div style={{ color: colors.textSecondary, fontSize: 13.5 }}>{linha.cliente}</div>
                    <div>
                      <span style={badgeVinculo(linha.vinculo)}>{vinculoLabel(linha.vinculo)}</span>
                    </div>
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        {perfilMeta ? (
                          <span style={{ ...pillBase, background: perfilMeta.fundo, color: perfilMeta.cor }}>
                            {perfilMeta.label}
                          </span>
                        ) : (
                          <span style={{ color: colors.textMuted, fontSize: 12.5 }}>—</span>
                        )}
                      </div>
                      <button style={linkBotaoPequeno} onClick={() => abrirPerfil(linha)}>
                        {perfilExpandido === linha.key ? "Fechar" : perfilMeta ? "Editar perfil" : "+ Perfil"}
                      </button>
                    </div>
                    <div>{farol ? <span style={badge}>{farol.label}</span> : <span style={{ color: colors.textMuted }}>—</span>}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {linha.coaching ? (
                        <button style={linkBotao} onClick={() => abrirEncontros(linha.coaching.id)}>
                          {expandido === linha.coaching.id ? "Fechar" : "Ver encontros"}
                        </button>
                      ) : (
                        <button style={linkBotao} onClick={() => abrirNovoForm(linha)}>
                          + Coaching
                        </button>
                      )}

                      {linha.coaching && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {linha.vinculo === "ambos" && <span style={rotuloAcao}>Coaching:</span>}
                          {confirmarExcluirCoaching === linha.coaching.id ? (
                            <>
                              <button
                                style={linkBotaoPequeno}
                                onClick={() => excluirCoaching(linha.coaching.id)}
                                disabled={excluindoCoaching}
                              >
                                {excluindoCoaching ? "Excluindo…" : "Confirmar"}
                              </button>
                              <button style={linkBotaoPequeno} onClick={() => setConfirmarExcluirCoaching(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button style={linkBotaoPequeno} onClick={() => abrirEditarCoaching(linha.coaching)}>
                                Editar
                              </button>
                              <button
                                style={{ ...linkBotaoPequeno, color: colors.dangerText }}
                                onClick={() => setConfirmarExcluirCoaching(linha.coaching.id)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {linha.jornadaParticipanteId && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {linha.vinculo === "ambos" && <span style={rotuloAcao}>Jornada:</span>}
                          {confirmarExcluirJornada === linha.jornadaParticipanteId ? (
                            <>
                              <button
                                style={linkBotaoPequeno}
                                onClick={() => excluirJornada(linha.jornadaParticipanteId)}
                                disabled={excluindoJornada}
                              >
                                {excluindoJornada ? "Excluindo…" : "Confirmar"}
                              </button>
                              <button style={linkBotaoPequeno} onClick={() => setConfirmarExcluirJornada(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              style={{ ...linkBotaoPequeno, color: colors.dangerText }}
                              onClick={() => setConfirmarExcluirJornada(linha.jornadaParticipanteId)}
                            >
                              Excluir vínculo
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {perfilExpandido === linha.key && (
                    <div style={painelExpandido}>
                      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 10, fontWeight: 700 }}>
                        Perfil comportamental — {linha.nome}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          salvarPerfil(linha);
                        }}
                        style={formGrid}
                      >
                        <label style={campoLabel}>
                          Perfil (animal)
                          <select
                            style={campoInput}
                            value={perfilForm.perfil_animal}
                            onChange={(e) => setPerfilForm({ ...perfilForm, perfil_animal: e.target.value })}
                          >
                            <option value="">Não registrado</option>
                            {PERFIL_OPCOES.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={campoLabel}>
                          Perfil secundário (opcional)
                          <select
                            style={campoInput}
                            value={perfilForm.perfil_animal_secundario}
                            onChange={(e) => setPerfilForm({ ...perfilForm, perfil_animal_secundario: e.target.value })}
                          >
                            <option value="">Nenhum</option>
                            {PERFIL_OPCOES.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={campoLabel}>
                          DISC dominante (opcional)
                          <select
                            style={campoInput}
                            value={perfilForm.disc_letra_dominante}
                            onChange={(e) => setPerfilForm({ ...perfilForm, disc_letra_dominante: e.target.value })}
                          >
                            <option value="">—</option>
                            <option value="D">D — Dominância</option>
                            <option value="I">I — Influência</option>
                            <option value="S">S — Estabilidade</option>
                            <option value="C">C — Conformidade</option>
                          </select>
                        </label>
                        <label style={{ ...campoLabel, gridColumn: "1 / -1" }}>
                          Observações
                          <textarea
                            style={{ ...campoInput, minHeight: 60, fontFamily: "inherit" }}
                            value={perfilForm.observacoes}
                            onChange={(e) => setPerfilForm({ ...perfilForm, observacoes: e.target.value })}
                          />
                        </label>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                          <button type="submit" style={botaoPrimario} disabled={salvandoPerfil}>
                            {salvandoPerfil ? "Salvando…" : "Salvar perfil"}
                          </button>
                          <button type="button" style={botaoSecundario} onClick={() => setPerfilExpandido(null)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {linha.coaching && expandido === linha.coaching.id && (
                    <div style={painelExpandido}>
                      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 10 }}>
                        Cadência combinada: {linha.coaching.cadencia_dias} dias
                        {linha.coaching.responsavel_nome ? ` · Coach: ${linha.coaching.responsavel_nome}` : ""}
                      </div>

                      {perfil?.orientacao_coaching ? (
                        <div style={{ ...avisoOrientacao, borderLeftColor: perfilMeta?.cor || colors.primary }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>
                            Abordagem sugerida — perfil {perfil.orientacao_coaching.label}
                            {perfil.disc_letra_dominante ? ` · DISC ${perfil.disc_letra_dominante}` : ""}
                          </div>
                          <div style={{ marginBottom: 4 }}>{perfil.orientacao_coaching.descricao}</div>
                          <div>{perfil.orientacao_coaching.abordagemCoaching}</div>
                        </div>
                      ) : (
                        <div style={avisoSemPerfil}>
                          Nenhum perfil comportamental registrado ainda —{" "}
                          <button style={linkBotaoInline} onClick={() => abrirPerfil(linha)}>
                            cadastrar perfil
                          </button>{" "}
                          pra receber uma sugestão de abordagem aqui.
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                        <input
                          type="date"
                          style={campoInput}
                          value={novaData[linha.coaching.id] || ""}
                          onChange={(e) => setNovaData((prev) => ({ ...prev, [linha.coaching.id]: e.target.value }))}
                        />
                        <button style={botaoSecundario} onClick={() => registrarEncontro(linha.coaching.id)}>
                          Registrar encontro
                        </button>
                      </div>

                      {(encontros[linha.coaching.id] || []).length ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {encontros[linha.coaching.id].map((enc) => (
                            <div key={enc.id} style={{ fontSize: 12.5, color: colors.textSecondary }}>
                              {new Date(enc.data_encontro).toLocaleDateString("pt-BR")}
                              {enc.observacoes ? ` — ${enc.observacoes}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={vazio}>Nenhum encontro registrado ainda.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </PortalShell>
  );
}

function vinculoLabel(vinculo) {
  if (vinculo === "jornada") return "Jornada coletiva";
  if (vinculo === "coaching") return "Coaching individual";
  return "Ambos";
}

function badgeVinculo(vinculo) {
  const base = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: radius.pill,
    fontWeight: 700,
    fontSize: 11,
  };
  if (vinculo === "jornada") return { ...base, background: colors.primaryLight, color: colors.primary };
  if (vinculo === "coaching") return { ...base, background: colors.accentLight, color: colors.accentText };
  return { ...base, background: colors.successLight, color: colors.successText };
}

const linhaCabecalho = {
  display: "grid",
  gridTemplateColumns: "1.3fr 0.9fr 1fr 0.9fr 1.1fr 0.9fr",
  gap: 12,
  padding: "8px 4px 12px",
  borderBottom: `1.5px solid ${colors.border}`,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: colors.textMuted,
  fontWeight: 700,
};

const linhaTabela = {
  display: "grid",
  gridTemplateColumns: "1.3fr 0.9fr 1fr 0.9fr 1.1fr 0.9fr",
  gap: 12,
  alignItems: "center",
  padding: "12px 4px",
  borderBottom: `1px solid ${colors.border}`,
};

const pillBase = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: radius.pill,
  fontWeight: 700,
  fontSize: 11,
};

const rotuloAcao = {
  fontSize: 10.5,
  color: colors.textMuted,
  fontWeight: 700,
  textTransform: "uppercase",
};

const linkBotaoPequeno = {
  border: "none",
  background: "transparent",
  color: colors.primary,
  fontWeight: 700,
  fontSize: 11.5,
  cursor: "pointer",
  padding: 0,
};

const linkBotaoInline = {
  border: "none",
  background: "transparent",
  color: colors.primary,
  fontWeight: 700,
  fontSize: "inherit",
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};

const avisoOrientacao = {
  background: "#fff",
  borderLeft: "3px solid",
  borderRadius: radius.sm,
  padding: "10px 12px",
  fontSize: 12.5,
  color: colors.textSecondary,
  lineHeight: 1.5,
};

const avisoSemPerfil = {
  background: colors.surfaceMuted,
  borderRadius: radius.sm,
  padding: "10px 12px",
  fontSize: 12.5,
  color: colors.textSecondary,
};

const painelExpandido = {
  background: colors.surfaceMuted,
  borderRadius: radius.md,
  padding: 14,
  margin: "0 4px 12px",
};

const vazio = {
  fontSize: 13.5,
  color: colors.textMuted,
  margin: 0,
};

const abaAtiva = {
  padding: "9px 16px",
  borderRadius: radius.pill,
  border: "none",
  background: colors.navy,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const abaInativa = {
  ...abaAtiva,
  background: colors.surfaceMuted,
  color: colors.textSecondary,
};

const botaoPrimario = {
  padding: "10px 16px",
  borderRadius: radius.md,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const botaoSecundario = {
  padding: "10px 16px",
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.textPrimary,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const linkBotao = {
  border: "none",
  background: "transparent",
  color: colors.primary,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const campoLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: colors.textSecondary,
};

const campoInput = {
  padding: "9px 12px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  fontSize: 13.5,
};

const avisoErro = {
  marginTop: 16,
  padding: "12px 16px",
  borderRadius: 12,
  background: colors.dangerLight,
  color: colors.dangerText,
  fontSize: 13.5,
};
