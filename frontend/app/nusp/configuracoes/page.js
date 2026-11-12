"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Badge, fmtNum, opcoesMapa } from "../../../components/NuspUi";

const TIPOS_PROG = { nucleo: "Núcleo", comite: "Comitê", projeto: "Projeto" };

// Lista de cadastro simples (unidades, programas, frentes, dimensões) com criar / renomear / ativar-desativar.
function CadastroLista({ tipo, titulo, itens, extra, onMudou, rotuloNovo }) {
  const [nome, setNome] = useState("");
  const [campoExtra, setCampoExtra] = useState(extra?.padrao ?? "");
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState("");

  const criar = async (e) => {
    e.preventDefault();
    setErro("");
    try {
      const corpo = { nome };
      if (extra) corpo[extra.campo] = campoExtra;
      await apiFetch(`/nusp/cadastros/${tipo}`, { method: "POST", body: JSON.stringify(corpo) });
      setNome("");
      onMudou();
    } catch (err) { setErro(err.message); }
  };
  const salvar = async (item, mudancas) => {
    setErro("");
    try {
      const corpo = { nome: item.nome, ativo: item.ativo, ...(extra ? { [extra.campo]: item[extra.campo] } : {}), ...mudancas };
      if (tipo === "dimensoes" || tipo === "motivos" || tipo === "encaminhamentos") corpo.ordem = item.ordem;
      await apiFetch(`/nusp/cadastros/${tipo}/${item.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      setEditando(null);
      onMudou();
    } catch (err) { setErro(err.message); }
  };

  return (
    <SectionCard title={titulo}>
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <form onSubmit={criar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <Campo label={rotuloNovo} flex={2} minWidth={200}><input style={st.input} value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} required /></Campo>
        {extra ? (
          <Campo label={extra.rotulo} minWidth={160}>
            <Select value={campoExtra} onChange={setCampoExtra} opcoes={extra.opcoes} vazio={extra.vazio ?? null} />
          </Campo>
        ) : null}
        <button type="submit" style={st.btn}>Adicionar</button>
      </form>
      {!itens.length ? <div style={st.vazio}>Nada cadastrado.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td style={st.td}>
                  {editando?.id === i.id ? (
                    <input style={st.input} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus />
                  ) : (
                    <span style={{ color: i.ativo === 0 ? colors.textMuted : colors.textPrimary }}>{i.nome}</span>
                  )}
                </td>
                {extra ? <td style={st.td}>{extra.mostrar(i)}</td> : null}
                <td style={st.td}>{i.ativo === 0 ? <Badge tom="cancelada">Inativo</Badge> : <Badge tom="concluida">Ativo</Badge>}</td>
                <td style={{ ...st.td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {editando?.id === i.id ? (
                    <>
                      <button type="button" style={st.btnMini} onClick={() => salvar(i, { nome: editando.nome })}>Salvar</button>{" "}
                      <button type="button" style={st.btnGhost} onClick={() => setEditando(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button type="button" style={st.btnMini} onClick={() => setEditando({ id: i.id, nome: i.nome })}>Renomear</button>{" "}
                      <button type="button" style={i.ativo === 0 ? st.btnMini : st.btnMiniDanger} onClick={() => salvar(i, { ativo: i.ativo === 0 ? 1 : 0 })}>{i.ativo === 0 ? "Reativar" : "Desativar"}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

function ImportadorPlanilha() {
  const [arquivo, setArquivo] = useState(null);
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [escutas, setEscutas] = useState(false);

  const enviar = async (simular) => {
    if (!arquivo) { setErro("Escolha a planilha (.xlsx) primeiro."); return; }
    setOcupado(true); setErro("");
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      setRel(await apiFetch(`/nusp/importar?${[simular ? "simular=1" : "", escutas ? "escutas=1" : ""].filter(Boolean).join("&")}`, { method: "POST", body: fd }));
    } catch (e) { setErro(e.message); setRel(null); } finally { setOcupado(false); }
  };

  const bloco = (titulo, o, chaves) => (
    <div style={{ background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{titulo}</div>
      {chaves.map(([k, rot]) => (o[k] !== undefined ? (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}><span style={{ color: colors.textSecondary }}>{rot}</span><strong>{fmtNum(o[k])}</strong></div>
      ) : null))}
      {o.linhas_com_problema?.length ? <div style={{ fontSize: 11.5, color: colors.warningText, marginTop: 6 }}>Linhas com problema (número na aba): {o.linhas_com_problema.join(", ")}</div> : null}
    </div>
  );

  return (
    <SectionCard title="Importar a planilha “NUSPSI — Visão Nacional”" subtitle="Traz o histórico das abas Base de Atividades, Plano de Ação e Participantes. Se importar de novo, nada é duplicado.">
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept=".xlsx" onChange={(e) => { setArquivo(e.target.files?.[0] || null); setRel(null); }} />
        <button type="button" style={st.btnGhost} disabled={ocupado} onClick={() => enviar(true)}>Simular (não grava)</button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: colors.textSecondary }}>
          <input type="checkbox" checked={escutas} onChange={(e) => { setEscutas(e.target.checked); setRel(null); }} />
          Incluir escutas individuais (acolhimentos)
        </label>
        <button type="button" style={st.btn} disabled={ocupado || !rel?.simulacao} onClick={() => enviar(false)} title={rel?.simulacao ? "" : "Rode a simulação antes"}>Importar de verdade</button>
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 12px" }}>
        Faça sempre a simulação primeiro. Participantes sem matrícula na planilha só são aceitos se o nome bater com uma única pessoa já cadastrada. As “Escuta individual” só entram se a opção acima estiver marcada, e entram apenas com os dados administrativos (data, unidade, pessoa e analista): a planilha antiga não tem resumo e nenhum texto é copiado. Sem matrícula, a pessoa é ligada pelo nome (se só houver uma com esse nome) ou cadastrada sem matrícula; a ficha fica marcada “matrícula a completar”. Nome repetido no cadastro não entra, para não misturar pessoas.
        O relatório mostra só números e linhas, nunca nomes.
      </p>
      {rel && (
        <>
          <div style={rel.simulacao ? st.ok : { ...st.ok, background: colors.infoLight, color: "#075985", borderColor: "#bae6fd" }}>
            {rel.simulacao ? "Simulação feita, nada foi gravado." : "Planilha importada."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {bloco("Atividades", rel.atividades, [["lidas", "Lidas"], ["importadas", "Importadas"], ["ja_existiam", "Já existiam"], ["escuta_individual_adiada", "Escuta individual (adiadas)"], ["sem_data_definida", "Planejadas importadas sem data definida"], ["sem_data_ou_tema", "Sem tema, ou iniciada/concluída sem data (não importadas)"], ["sem_dimensao", "Sem dimensão reconhecida"], ["concluidas_sem_evidencia", "Concluídas sem link de evidência"]])}
            {bloco("Planos de ação", rel.planos, [["lidos", "Lidos"], ["importados", "Importados"], ["ja_existiam", "Já existiam"], ["sem_data_definida", "Importados sem data ou prazo definidos"], ["sem_dimensao", "Sem dimensão reconhecida"], ["concluidos_sem_evidencia", "Concluídos sem link de evidência"]])}
            {bloco("Participantes", rel.participantes, [["lidos", "Lidos"], ["gravados", "Gravados"], ["escuta_individual_adiada", "Escuta individual (adiados)"], ["sem_atividade", "Sem atividade correspondente"], ["sem_matricula_sem_par", "Sem matrícula e sem par"], ["erros", "Com erro"]])}
            {rel.escutas?.incluidas ? bloco("Escutas individuais (acolhimentos)", rel.escutas, [["lidas", "Lidas"], ["importadas", "Importadas"], ["por_nome_sem_matricula", "  das quais por nome, sem matrícula"], ["pessoas_novas_sem_matricula", "  pessoas novas cadastradas sem matrícula"], ["ja_existiam", "Já existiam"], ["sem_data", "Sem data"], ["nome_repetido_no_cadastro", "Nome repetido no cadastro (não importadas)"], ["sem_nome_nem_matricula", "Sem nome nem matrícula"], ["erros", "Com erro"]]) : null}
          </div>
          {rel.unidades_novas?.length ? <p style={{ fontSize: 12.5, marginTop: 10 }}><strong>{rel.simulacao ? "Unidades novas que serão criadas:" : "Unidades novas criadas:"}</strong> {rel.unidades_novas.join(", ")}</p> : null}
          {rel.avisos?.length ? (
            <ul style={{ fontSize: 12.5, color: colors.warningText, paddingLeft: 18 }}>{rel.avisos.slice(0, 30).map((a, i) => <li key={i}>{a}</li>)}</ul>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export default function ConfiguracoesNuspPage() {
  const [cad, setCad] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => { apiFetch("/nusp/cadastros").then(setCad).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const progs = (cad?.programas || []).filter((p) => p.ativo !== 0);
  const nomeProg = (id) => (cad?.programas || []).find((p) => p.id === id)?.nome || "—";

  return (
    <PortalShell title="Núcleo de Saúde Psicossocial" subtitle="Cadastros e importação">
      <PageHero
        eyebrow="Núcleo de Saúde Psicossocial"
        title="Cadastros e importação"
        subtitle="Mantidos pela coordenação do Núcleo. Novos comitês entram aqui, como um novo programa."
        actions={<Link href="/usuarios" style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none", background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }}>Gestão de Usuários</Link>}
      />
      {erro ? <div style={st.erro}>{erro}</div> : null}
      <div style={{ display: "grid", gap: 16 }}>
        <ImportadorPlanilha />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
          <CadastroLista tipo="programas" titulo="Programas e comitês" rotuloNovo="Novo programa / comitê" itens={cad?.programas || []} onMudou={carregar}
            extra={{ campo: "tipo", rotulo: "Tipo", padrao: "comite", opcoes: opcoesMapa(TIPOS_PROG), mostrar: (i) => TIPOS_PROG[i.tipo] || i.tipo }} />
          <CadastroLista tipo="frentes" titulo="Frentes de atuação" rotuloNovo="Nova frente" itens={cad?.frentes || []} onMudou={carregar}
            extra={{ campo: "programa_id", rotulo: "Programa", padrao: progs[0] ? String(progs[0].id) : "", opcoes: progs.map((p) => ({ value: String(p.id), label: p.nome })), mostrar: (i) => nomeProg(i.programa_id) }} />
          <CadastroLista tipo="unidades" titulo="Unidades / sites" rotuloNovo="Nova unidade" itens={cad?.unidades || []} onMudou={carregar} />
          <CadastroLista tipo="dimensoes" titulo="Dimensões da pesquisa de riscos" rotuloNovo="Nova dimensão" itens={cad?.dimensoes || []} onMudou={carregar} />
          <CadastroLista tipo="motivos" titulo="Motivos do acolhimento" rotuloNovo="Novo motivo (categoria geral, sem diagnóstico)" itens={cad?.motivos || []} onMudou={carregar} />
          <CadastroLista tipo="encaminhamentos" titulo="Encaminhamentos do acolhimento" rotuloNovo="Novo encaminhamento" itens={cad?.encaminhamentos || []} onMudou={carregar} />
        </div>
      </div>
    </PortalShell>
  );
}
