"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams }   from "next/navigation";
import TurmaPageShell                       from "../../../../components/TurmaPageShell";
import { apiDownload, apiFetch }            from "../../../../services/api";
import { formatDateBR }                     from "../../../../lib/date";
import { colors }                           from "../../../../lib/theme";

function formatDate(v) { return formatDateBR(v); }

function emptyForm(cliente = "", turma = "", supervisor = "") {
  return { nome: "", matricula: "", cpf: "", cliente, turma, supervisor, operacao: "", data_admissao: "" };
}

function formatCpf(cpf) {
  if (!cpf) return "—";
  const digits = String(cpf).replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/* ─── STATUS de presença → estilo ─── */
function estiloStatus(status) {
  const s = String(status || "pendente").toLowerCase();
  if (s === "presente")  return { background: colors.successLight, color: colors.successText };
  if (s === "ausente")   return { background: colors.dangerLight,  color: colors.dangerText  };
  if (s === "justificado") return { background: colors.warningLight, color: colors.warningText };
  return { background: "#f1f5f9", color: "#64748b" };
}

/* ─── FREQUÊNCIA → estilo ─── */
function estiloFreq(pct) {
  const n = Number(pct || 0);
  if (n >= 90) return { background: colors.successLight, color: colors.successText };
  if (n >= 75) return { background: colors.warningLight, color: colors.warningText };
  return         { background: colors.dangerLight,  color: colors.dangerText  };
}

export default function ParticipantesTurmaPage() {
  const { id } = useParams() || {};
  const searchParams = useSearchParams();

  const [treinamento,   setTreinamento]   = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [frequencias,   setFrequencias]   = useState([]);
  const [arquivo,       setArquivo]       = useState(null);
  const [form,          setForm]          = useState(emptyForm());
  const [loading,       setLoading]       = useState(true);
  const [importando,    setImportando]    = useState(false);
  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [salvando,      setSalvando]      = useState(false);
  const [erro,          setErro]          = useState("");
  const [sucesso,       setSucesso]       = useState("");
  const [busca,         setBusca]         = useState("");

  /* Seções colapsáveis */
  // Bugfix: o botão "Importar treinandos" da página Gestão de Turmas
  // (presenças) mandava pra cá mas essa seção começa sempre fechada — o
  // usuário clicava numa ação que prometia "importar" e caía numa lista
  // vazia, sem pista de que precisava abrir "↑ Importar Excel" primeiro.
  // Agora, vindo de ?abrir_import=1, a seção já abre sozinha.
  const [abrirImport, setAbrirImport] = useState(() => searchParams.get("abrir_import") === "1");
  const [abrirManual, setAbrirManual] = useState(false);
  // 28/10/2026 — "Incluir pessoa já cadastrada": busca no Cadastro Único e inclui sem redigitar.
  const [abrirCadastrada, setAbrirCadastrada] = useState(false);
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const [achadas, setAchadas] = useState({ itens: [], contas_sem_cadastro: [] });
  const [buscandoPessoa, setBuscandoPessoa] = useState(false);
  const [incluindoId, setIncluindoId] = useState(null);

  useEffect(() => { carregarTudo(); }, [id]);

  async function carregarTudo() {
    if (!id) return;
    try {
      setLoading(true);
      setErro(""); setSucesso("");
      const [dadosTreinamento, listaParticipantes, frequenciaData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
        apiFetch(`/frequencia-individual?treinamento_id=${id}`).catch(() => null),
      ]);
      setTreinamento(dadosTreinamento || null);
      setParticipantes(Array.isArray(listaParticipantes) ? listaParticipantes : []);
      setFrequencias(Array.isArray(frequenciaData?.itens) ? frequenciaData.itens : []);
      setForm(emptyForm(
        dadosTreinamento?.cliente   || "",
        dadosTreinamento?.tema      || "",
        dadosTreinamento?.supervisor || ""
      ));
    } catch (err) {
      setErro(err.message || "Erro ao carregar participantes.");
    } finally {
      setLoading(false);
    }
  }

  async function importarExcel() {
    if (!arquivo) { setErro("Selecione um arquivo Excel."); return; }
    try {
      setImportando(true); setErro(""); setSucesso("");
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      fd.append("treinamento_id", String(id));
      const resultado = await apiFetch("/treinamentos/importar-participantes", { method: "POST", body: fd });

      // Inclusão de usuários (treinandos), 25/09/2026: a importação agora
      // também gera acesso ao portal em lote (Decisão 2 do Ramon) — mostra
      // pro coordenador quantas contas nasceram e quantos participantes
      // ficaram sem login (sem CPF/matrícula na planilha).
      const partesResumo = ["Participantes importados com sucesso."];
      if (resultado?.contas_criadas) {
        partesResumo.push(`${resultado.contas_criadas} conta(s) de acesso criada(s).`);
      }
      if (resultado?.contas_atualizadas) {
        partesResumo.push(`${resultado.contas_atualizadas} conta(s) existente(s) atualizada(s) com este cliente.`);
      }
      if (resultado?.sem_identificador_login) {
        partesResumo.push(`${resultado.sem_identificador_login} participante(s) sem CPF/matrícula ficaram sem login.`);
      }
      setSucesso(partesResumo.join(" "));
      setArquivo(null); setAbrirImport(false);
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao importar Excel.");
    } finally {
      setImportando(false);
    }
  }

  // Pedido do Ramon (29/09/2026): "Preciso do Excel base para importação dos
  // treinandos nas turmas" — modelo já vem com Cliente/Turma/Supervisor
  // desta turma preenchidos (ver baixarModeloImportacaoParticipantes no
  // backend), então só falta preencher nome, operação, data de admissão e
  // matrícula/CPF de cada treinando.
  async function baixarModelo() {
    try {
      setBaixandoModelo(true); setErro(""); setSucesso("");
      await apiDownload(
        `/treinamentos/${id}/modelo-importacao-participantes`,
        `modelo-importacao-participantes-turma-${id}.xlsx`
      );
    } catch (err) {
      setErro(err.message || "Erro ao baixar o modelo.");
    } finally {
      setBaixandoModelo(false);
    }
  }

  useEffect(() => {
    if (!abrirCadastrada) return undefined;
    const termo = buscaPessoa.trim();
    if (termo.length < 2) { setAchadas({ itens: [], contas_sem_cadastro: [] }); return undefined; }
    const t = setTimeout(async () => {
      try {
        setBuscandoPessoa(true);
        const r = await apiFetch(`/treinamentos/${id}/pessoas-cadastradas?busca=${encodeURIComponent(termo)}`);
        setAchadas({ itens: r?.itens || [], contas_sem_cadastro: r?.contas_sem_cadastro || [] });
      } catch (err) {
        setErro(err.message || "Erro ao buscar pessoas.");
      } finally {
        setBuscandoPessoa(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPessoa, abrirCadastrada, id]);

  async function incluirPessoaCadastrada(pessoa) {
    try {
      setIncluindoId(pessoa.id); setErro(""); setSucesso("");
      const r = await apiFetch(`/treinamentos/${id}/participantes`, {
        method: "POST",
        body: JSON.stringify({
          pessoa_id: pessoa.id,
          cliente: treinamento?.cliente || pessoa.cliente || "",
          turma: treinamento?.tema || "",
          supervisor: treinamento?.supervisor || "",
        }),
      });
      await carregarTudo();
      setSucesso(r?.message || `${pessoa.nome} incluído(a) na turma.`);
      const novaConta = r?.vinculo?.conta === "criada" ? "aguardando_primeiro_acesso" : null;
      setAchadas((prev) => ({ ...prev, itens: prev.itens.map((i) => (i.id === pessoa.id ? { ...i, na_turma: true, conta: novaConta || i.conta } : i)) }));
    } catch (err) {
      setErro(err.message || "Não foi possível incluir esta pessoa.");
    } finally {
      setIncluindoId(null);
    }
  }

  async function adicionarParticipanteManual() {
    // Ajuste 15/09/2026 (fim de tarde): matrícula deixou de ser obrigatória
    // — turma de Avaliação Técnica cadastra gente sem matrícula/login no RH
    // de origem, identificada só pelo CPF. Agora exige nome, cliente, turma
    // e pelo menos um dos dois (matrícula OU CPF).
    if (!form.nome || !form.cliente || !form.turma) {
      setErro("Preencha nome, cliente e turma. Matrícula ou CPF ajudam o portal a reconhecer quem já tem cadastro."); return;
    }
    try {
      setSalvando(true); setErro(""); setSucesso("");
      const resp = await apiFetch(`/treinamentos/${id}/participantes`, {
        method: "POST",
        body: JSON.stringify({
          nome: form.nome, matricula: form.matricula, cpf: form.cpf, cliente: form.cliente,
          turma: form.turma, supervisor: form.supervisor,
          operacao: form.operacao, data_admissao: form.data_admissao || "",
        }),
      });
      setForm(emptyForm(treinamento?.cliente || "", treinamento?.tema || "", treinamento?.supervisor || ""));
      setAbrirManual(false);
      await carregarTudo();
      setSucesso(resp?.message || "Participante adicionado com sucesso.");
    } catch (err) {
      setErro(err.message || "Não foi possível adicionar manualmente.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarPrimeiraAula() {
    try {
      setErro(""); setSucesso("");
      await apiDownload(`/treinamentos/${id}/exportar-primeira-aula`, `turma-${id}-primeira-aula.xlsx`);
      setSucesso("Arquivo exportado com sucesso.");
    } catch (err) { setErro(err.message || "Erro ao exportar."); }
  }

  async function removerParticipante(item) {
    if (!window.confirm(`Remover ${item.nome} da turma?`)) return;
    try {
      setErro(""); setSucesso("");
      if (!item?.id) throw new Error("Participante sem identificador.");
      await apiFetch(`/treinamentos/participantes/${item.id}`, { method: "DELETE" });
      setParticipantes((prev) => prev.filter((p) => p.id !== item.id));
      setSucesso("Participante removido.");
      await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao remover."); }
  }

  /* Resumo rápido */
  const resumo = useMemo(() => {
    const total    = participantes.length;
    const removidos = participantes.filter(
      (p) => String(p.status_presenca || "").toLowerCase() === "removido"
    ).length;
    const ativos   = total - removidos;
    return { total, ativos, inativos: removidos };
  }, [participantes]);

  /* Lista filtrada */
  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return participantes;
    return participantes.filter((p) =>
      [p.nome, p.matricula, p.cpf, p.operacao, p.supervisor]
        .join(" ").toLowerCase().includes(t)
    );
  }, [participantes, busca]);

  function campo(key) {
    return (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="participantes">

      {/* Feedback */}
      {erro    && <div style={errorBox}>{erro}</div>}
      {sucesso && <div style={successBox}>{sucesso}</div>}

      {/* ── KPIs rápidos ── */}
      <div style={kpiRow}>
        {[
          { label: "Total",   value: resumo.total,   cor: "#334155"         },
          { label: "Ativos",  value: resumo.ativos,  cor: colors.success    },
          { label: "Inativos",value: resumo.inativos,cor: resumo.inativos > 0 ? colors.danger : "#94a3b8" },
          { label: "Com freq.",
            value: frequencias.length,
            cor: frequencias.length > 0 ? colors.primary : "#94a3b8" },
        ].map(({ label, value, cor }) => (
          <div key={label} style={kpiChip}>
            <span style={{ fontSize: 26, fontWeight: 900, color: cor, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
          </div>
        ))}

        {/* Ações no canto direito dos KPIs */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={btnOutline} onClick={() => { setAbrirImport((v) => !v); setAbrirManual(false); setAbrirCadastrada(false); }}>
            {abrirImport ? "Fechar import" : "↑ Importar Excel"}
          </button>
          <button style={btnOutline} onClick={() => { setAbrirCadastrada((v) => !v); setAbrirImport(false); setAbrirManual(false); }}>
            {abrirCadastrada ? "Fechar busca" : "🔎 Incluir pessoa já cadastrada"}
          </button>
          <button style={btnOutline} onClick={() => { setAbrirManual((v) => !v); setAbrirImport(false); setAbrirCadastrada(false); }}>
            {abrirManual ? "Fechar form." : "+ Adicionar manual"}
          </button>
          <button style={btnOutline} onClick={exportarPrimeiraAula}>
            Exportar 1ª aula
          </button>
        </div>
      </div>

      {/* ── Seção: Importar Excel (colapsável) ── */}
      {abrirImport && (
        <div style={secaoCard}>
          <div style={secaoHeader}>
            <div>
              <div style={secaoTitulo}>Importar base via Excel</div>
              <div style={secaoSub}>Importe uma única vez e reutilize nas aulas do cronograma.</div>
            </div>
            <button style={btnOutline} onClick={baixarModelo} disabled={baixandoModelo}>
              {baixandoModelo ? "Gerando…" : "⬇ Baixar modelo"}
            </button>
          </div>
          <div style={importRow}>
            <input
              type="file" accept=".xlsx,.xls"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              style={{ fontSize: 13 }}
            />
            <button style={btnCoral} onClick={importarExcel} disabled={importando}>
              {importando ? "Importando…" : "Importar"}
            </button>
          </div>
          <p style={helperText}>
            Colunas obrigatórias: <strong>nome</strong>, <strong>cliente</strong>,{" "}
            <strong>turma</strong>, <strong>supervisor</strong>,{" "}
            <strong>operacao</strong>, <strong>data_admissao</strong>, e pelo menos uma
            das duas: <strong>matricula</strong> ou <strong>cpf</strong> (em turma de
            Avaliação Técnica, sem matrícula/login no RH de origem, use a coluna cpf).
            Não sabe o formato? Use o botão <strong>Baixar modelo</strong> acima —
            ele já vem com cliente, turma e supervisor preenchidos.
          </p>
          <p style={{ ...helperText, color: colors.dangerText, fontWeight: 600, marginTop: 6 }}>
            Atenção: importar uma planilha substitui toda a lista de participantes
            desta turma e apaga a chamada/presença já lançada para ela. Se a turma
            já tem chamada feita, confira com cuidado antes de reimportar.
          </p>
        </div>
      )}

      {/* ── Seção: Incluir pessoa já cadastrada (colapsável) ── */}
      {abrirCadastrada && (
        <div style={secaoCard}>
          <div style={secaoTitulo}>Incluir pessoa já cadastrada</div>
          <div style={secaoSub}>
            Procure por nome, matrícula ou CPF. Quem já existe no portal entra na turma com o mesmo
            cadastro e a mesma conta de acesso — sem digitar de novo e sem duplicar.
          </div>
          <input
            autoFocus
            value={buscaPessoa}
            onChange={(e) => setBuscaPessoa(e.target.value)}
            placeholder="Digite pelo menos 2 letras do nome, ou a matrícula / CPF"
            style={{ ...fieldInput, width: "100%", marginTop: 10 }}
          />
          {buscandoPessoa && <p style={{ ...helperText, marginTop: 8 }}>Buscando…</p>}
          {!buscandoPessoa && buscaPessoa.trim().length >= 2 && achadas.itens.length === 0 && (
            <p style={{ ...helperText, marginTop: 8 }}>
              Ninguém encontrado com esse termo. Se a pessoa é nova, use <strong>+ Adicionar manual</strong>.
            </p>
          )}
          {achadas.itens.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {achadas.itens.map((p) => {
                const conta = {
                  ativa: { t: "Conta ativa", bg: colors.successLight, c: colors.successText },
                  aguardando_primeiro_acesso: { t: "Aguardando 1º acesso", bg: colors.warningLight, c: colors.warningText },
                  inativa: { t: "Conta inativa", bg: colors.dangerLight, c: colors.dangerText },
                  sem_conta: { t: "Sem conta de acesso", bg: "#f1f5f9", c: "#64748b" },
                }[p.conta] || { t: "", bg: "#f1f5f9", c: "#64748b" };
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid #e9eef4", borderRadius: 10, padding: "8px 12px" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#334155" }}>{p.nome}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {p.matricula ? `Matrícula ${p.matricula}` : "Sem matrícula"}
                        {p.cpf_final ? ` · CPF final ${p.cpf_final}` : ""}
                        {p.cliente ? ` · ${p.cliente}` : ""}
                      </div>
                    </div>
                    <span style={{ ...conta, background: conta.bg, color: conta.c, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{conta.t}</span>
                    {p.na_turma ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.successText }}>✓ Já está nesta turma</span>
                    ) : (
                      <button style={btnCoral} disabled={incluindoId === p.id} onClick={() => incluirPessoaCadastrada(p)}>
                        {incluindoId === p.id ? "Incluindo…" : "Incluir na turma"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {achadas.contas_sem_cadastro.length > 0 && (
            <p style={{ ...helperText, marginTop: 10 }}>
              Também há conta(s) criada(s) na Gestão de Usuários com esse nome (
              {achadas.contas_sem_cadastro.map((u) => u.nome).join(", ")}) que ainda não estão ligadas a uma pessoa.
              Ao incluir a pessoa pelo <strong>nome completo</strong> em <strong>+ Adicionar manual</strong>,
              o portal liga a conta ao cadastro automaticamente.
            </p>
          )}
        </div>
      )}

      {/* ── Seção: Formulário manual (colapsável) ── */}
      {abrirManual && (
        <div style={secaoCard}>
          <div style={secaoTitulo}>Adicionar participante manualmente</div>
          <div style={secaoSub}>Inclusão individual usando a mesma estrutura da base da turma.</div>
          <div style={formGrid}>
            {[
              { key: "nome",          label: "Nome",          placeholder: "Nome completo" },
              { key: "matricula",     label: "Matrícula",     placeholder: "Matrícula (ou deixe em branco se só tiver CPF)" },
              { key: "cpf",           label: "CPF",           placeholder: "Somente números" },
              { key: "cliente",       label: "Cliente",       placeholder: "Cliente" },
              { key: "turma",         label: "Turma",         placeholder: "Turma" },
              { key: "supervisor",    label: "Supervisor",    placeholder: "Supervisor" },
              { key: "operacao",      label: "Operação",      placeholder: "Operação" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={fieldWrap}>
                <label style={fieldLabel}>{label}</label>
                <input
                  value={form[key]}
                  onChange={campo(key)}
                  placeholder={placeholder}
                  style={fieldInput}
                />
              </div>
            ))}
            <div style={fieldWrap}>
              <label style={fieldLabel}>Data admissão</label>
              <input
                type="date"
                value={form.data_admissao}
                onChange={campo("data_admissao")}
                style={fieldInput}
              />
            </div>
          </div>
          <p style={helperText}>
            Matrícula e CPF são opcionais, mas é por eles (e pelo nome) que o portal reconhece quem já
            tem cadastro e vincula à turma sem duplicar. Sem nenhum dos dois a pessoa entra na turma,
            mas ainda não consegue acessar o portal. Quem já foi cadastrado antes? Use{" "}
            <strong>Incluir pessoa já cadastrada</strong>.
          </p>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button style={btnCoral} onClick={adicionarParticipanteManual} disabled={salvando}>
              {salvando ? "Salvando…" : "Adicionar participante"}
            </button>
            <button style={btnGhost} onClick={() => setAbrirManual(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Tabela de participantes ── */}
      <div style={tabelaCard}>
        <div style={tabelaHeader}>
          <div>
            <span style={secaoTitulo}>Base da turma</span>
            <span style={contagem}>
              {" "}{listaFiltrada.length} de {participantes.length} participante{participantes.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              placeholder="Buscar participante…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={searchInput}
            />
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                {["Nome","Matrícula","CPF","Cliente","Supervisor","Operação","Admissão","Status","Freq.",""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan={10} style={tdVazio}>
                    {busca ? "Nenhum participante encontrado para a busca." : "Nenhum participante importado ainda."}
                  </td>
                </tr>
              ) : (
                listaFiltrada.map((item, idx) => {
                  const freq = frequencias.find(
                    (f) => String(f.treinando_nome || "").trim().toLowerCase() ===
                           String(item.nome || "").trim().toLowerCase()
                  );
                  const statusStr = item.status_presenca || "pendente";
                  return (
                    <tr key={item.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{item.nome}</td>
                      <td style={{ ...td, color: "#64748b" }}>{item.matricula || "—"}</td>
                      <td style={{ ...td, color: "#64748b" }}>{formatCpf(item.cpf)}</td>
                      <td style={td}>{item.cliente}</td>
                      <td style={td}>{item.supervisor || "—"}</td>
                      <td style={td}>{item.operacao   || "—"}</td>
                      <td style={{ ...td, color: "#64748b" }}>{formatDate(item.data_admissao)}</td>
                      <td style={td}>
                        <span style={{ ...pill, ...estiloStatus(statusStr) }}>
                          {statusStr}
                        </span>
                      </td>
                      <td style={td}>
                        {freq ? (
                          <span style={{ ...pill, ...estiloFreq(freq.frequencia_percentual) }}>
                            {freq.frequencia_percentual}%
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>s/d</span>
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                          {item.pessoa_id && (
                            <a href={`/pessoas/${item.pessoa_id}`} style={linkPerfil} title="Ver perfil completo">
                              Perfil
                            </a>
                          )}
                          <button style={btnRemover} onClick={() => removerParticipante(item)}>
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TurmaPageShell>
  );
}

/* ── Estilos ─────────────────────────────── */
const errorBox   = { background: colors.dangerLight,  color: colors.dangerText,  border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const successBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };

const kpiRow  = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 };
const kpiChip = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "10px 16px" };

const linkPerfil = { color: colors.accent, fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" };
const btnCoral   = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnOutline = { background: "#fff", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGhost   = { background: "#f8fafc", color: "#94a3b8", border: "1px solid #e9eef4", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const secaoCard   = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18, marginBottom: 12 };
const secaoHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 };
const secaoTitulo = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const secaoSub    = { fontSize: 13, color: "#94a3b8", marginTop: 2 };
const contagem    = { fontSize: 13, color: "#94a3b8", fontWeight: 500 };

const importRow  = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 };
const helperText = { margin: 0, fontSize: 12, color: "#94a3b8" };

const formGrid   = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 14 };
const fieldWrap  = { display: "flex", flexDirection: "column", gap: 5 };
const fieldLabel = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const fieldInput = { height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" };

const tabelaCard   = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18 };
const tabelaHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 };
const searchInput  = { height: 36, paddingLeft: 32, paddingRight: 10, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", width: 220 };

const tableWrap = { overflowX: "auto" };
const table     = { width: "100%", borderCollapse: "collapse" };
const th        = { textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" };
const td        = { padding: "10px 12px", borderBottom: "1px solid #f8fafc", fontSize: 13, color: "#334155", verticalAlign: "middle" };
const tdVazio   = { padding: "24px 12px", textAlign: "center", color: "#94a3b8", fontSize: 13 };

const pill     = { display: "inline-block", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 };
const btnRemover = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" };
