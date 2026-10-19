"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TurmaPageShell from "../../../../../../components/TurmaPageShell";
import { apiFetch, apiDownload } from "../../../../../../services/api";
import { colors, radius } from "../../../../../../lib/theme";

// Editor de uma importação de prova em papel (16/10/2026).
// Esquerda: as folhas digitalizadas (foto/PDF) guardadas no Portal.
// Direita: digitação assistida — letras marcadas (A–D, "-" em branco) ou a nota
// final já corrigida. Nada altera as notas da turma até a confirmação.

const STATUS = {
  rascunho: { texto: "Rascunho", cor: colors.warningText, bg: colors.warningLight },
  confirmado: { texto: "Confirmada", cor: colors.successText, bg: colors.successLight },
  desfeito: { texto: "Desfeita", cor: colors.textSecondary, bg: colors.neutralLight },
};

const fmtNota = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const fmtTam = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function linhasIniciais(linhas) {
  const o = {};
  for (const l of linhas) {
    o[l.participante_id] = {
      faltou: !!l.faltou,
      respostas: l.respostas || "",
      nota: l.respostas ? "" : l.nota === null || l.nota === undefined ? "" : String(l.nota).replace(".", ","),
    };
  }
  return o;
}

export default function ProvaPapelEditorPage() {
  const { id, loteId } = useParams() || {};
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState({});
  const [cab, setCab] = useState({ titulo: "", nota_maxima: "", data_aplicacao: "" });
  const [sujo, setSujo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [errosLinha, setErrosLinha] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [confirma, setConfirma] = useState(null); // 'confirmar' | 'desfazer' | 'excluir'
  const [arquivoAberto, setArquivoAberto] = useState(null);
  const [visor, setVisor] = useState(null); // { url, tipo }
  const [visorErro, setVisorErro] = useState("");
  const inputArq = useRef(null);
  const inputPlan = useRef(null);
  const [previa, setPrevia] = useState(null); // resultado da leitura da planilha
  const [verTodos, setVerTodos] = useState(false);

  const carregar = useCallback(async (manterEdicao = false) => {
    if (!loteId) return null;
    try {
      const r = await apiFetch(`/provas-papel/lotes/${loteId}`);
      setD(r);
      if (!manterEdicao) {
        setEdit(linhasIniciais(r.linhas));
        setCab({
          titulo: r.lote.titulo,
          nota_maxima: String(r.lote.nota_maxima).replace(".", ","),
          data_aplicacao: r.lote.data_aplicacao || "",
        });
        setSujo(false);
      }
      setErro("");
      return r;
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a importação.");
      return null;
    } finally {
      setCarregando(false);
    }
  }, [loteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // abre a primeira folha automaticamente
  useEffect(() => {
    if (d?.arquivos?.length && !arquivoAberto) abrirArquivo(d.arquivos[0].id);
    if (d && !d.arquivos.length) { setArquivoAberto(null); setVisor(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.arquivos?.length]);

  async function abrirArquivo(arqId) {
    setArquivoAberto(arqId);
    setVisor(null);
    setVisorErro("");
    try {
      const r = await apiFetch(`/provas-papel/lotes/${loteId}/arquivos/${arqId}/url`);
      setVisor({ url: r.url, tipo: r.tipo });
    } catch (e) {
      setVisorErro(e.message || "Não foi possível abrir a folha.");
    }
  }

  function mudaLinha(pid, patch) {
    setEdit((p) => ({ ...p, [pid]: { ...p[pid], ...patch } }));
    setSujo(true);
    setErrosLinha((p) => { if (!p[pid]) return p; const n = { ...p }; delete n[pid]; return n; });
  }

  async function salvar({ silencioso = false } = {}) {
    setOcupado(true);
    try {
      setErro("");
      const linhas = Object.entries(edit).map(([pid, v]) => ({
        participante_id: Number(pid), faltou: v.faltou, respostas: v.faltou ? "" : v.respostas, nota: v.faltou ? "" : v.nota,
      }));
      const corpo = { titulo: cab.titulo, data_aplicacao: cab.data_aplicacao || null, linhas };
      if (!d.material) corpo.nota_maxima = cab.nota_maxima;
      const r = await apiFetch(`/provas-papel/lotes/${loteId}`, { method: "PUT", body: JSON.stringify(corpo) });
      const mapa = {};
      (r.erros || []).forEach((x) => { mapa[x.participante_id] = x.erro; });
      setErrosLinha(mapa);
      await carregar(true);
      if ((r.erros || []).length) {
        setErro(`${r.erros.length} linha(s) não foram salvas: corrija os avisos em vermelho.`);
        return false;
      }
      setSujo(false);
      if (!silencioso) { setAviso("Rascunho salvo."); setTimeout(() => setAviso((a) => (a === "Rascunho salvo." ? "" : a)), 2500); }
      return true;
    } catch (e) {
      setErro(e.message || "Não foi possível salvar.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    setConfirma(null);
    if (sujo && !(await salvar({ silencioso: true }))) return;
    setOcupado(true);
    try {
      const r = await apiFetch(`/provas-papel/lotes/${loteId}/confirmar`, { method: "POST" });
      setAviso(`Importação confirmada: ${r.notas} nota(s) lançada(s) (${r.atualizadas} atualizada(s), ${r.criadas} nova(s)).`);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível confirmar.");
    } finally {
      setOcupado(false);
    }
  }

  async function desfazer() {
    setConfirma(null);
    setOcupado(true);
    try {
      const r = await apiFetch(`/provas-papel/lotes/${loteId}/desfazer`, { method: "POST" });
      setAviso(`Importação desfeita: ${r.restauradas || 0} nota(s) restaurada(s), ${r.removidas || 0} removida(s), ${r.preservadas || 0} preservada(s) por terem sido alteradas depois.`);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível desfazer.");
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    setConfirma(null);
    setOcupado(true);
    try {
      await apiFetch(`/provas-papel/lotes/${loteId}`, { method: "DELETE" });
      window.location.href = `/turma/${id}/avaliacoes/papel`;
    } catch (e) {
      setErro(e.message || "Não foi possível excluir.");
      setOcupado(false);
    }
  }

  async function enviarArquivos(ev) {
    const arquivos = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!arquivos.length) return;
    setOcupado(true);
    setErro("");
    let enviados = 0;
    for (const f of arquivos) {
      try {
        const fd = new FormData();
        fd.append("arquivo", f);
        await apiFetch(`/provas-papel/lotes/${loteId}/arquivos`, { method: "POST", body: fd });
        enviados += 1;
      } catch (e) {
        setErro(`${f.name}: ${e.message || "não foi possível enviar."}`);
        break;
      }
    }
    if (enviados) {
      setArquivoAberto(null);
      await carregar(true);
      const msg = `${enviados} folha(s) guardada(s).`;
      setAviso(msg);
      setTimeout(() => setAviso((a) => (a === msg ? "" : a)), 2500);
    }
    setOcupado(false);
  }

  async function removerArquivo(arqId) {
    setOcupado(true);
    try {
      await apiFetch(`/provas-papel/lotes/${loteId}/arquivos/${arqId}`, { method: "DELETE" });
      if (arquivoAberto === arqId) { setArquivoAberto(null); setVisor(null); }
      await carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível remover a folha.");
    } finally {
      setOcupado(false);
    }
  }

  async function baixarModelo() {
    try {
      await apiDownload(`/provas-papel/lotes/${loteId}/modelo`, `modelo-notas-prova-papel-${loteId}.xlsx`);
    } catch (e) {
      setErro(e.message || "Não foi possível baixar o modelo.");
    }
  }

  async function enviarPlanilha(ev) {
    const f = (ev.target.files || [])[0];
    ev.target.value = "";
    if (!f) return;
    setOcupado(true);
    setErro("");
    setPrevia(null);
    setVerTodos(false);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      const r = await apiFetch(`/provas-papel/lotes/${loteId}/planilha`, { method: "POST", body: fd });
      setPrevia(r);
    } catch (e) {
      setErro(e.message || "Não foi possível ler a planilha.");
    } finally {
      setOcupado(false);
    }
  }

  function aplicarPlanilha() {
    if (!previa) return;
    setEdit((p) => {
      const n = { ...p };
      for (const l of previa.linhas) {
        n[l.participante_id] = { faltou: !!l.faltou, respostas: l.respostas || "", nota: l.nota || "" };
      }
      return n;
    });
    setErrosLinha({});
    setSujo(true);
    const msg = `${previa.linhas.length} linha(s) da planilha aplicadas no rascunho. Confira abaixo e clique em Salvar rascunho.`;
    setAviso(msg);
    setTimeout(() => setAviso((a) => (a === msg ? "" : a)), 6000);
    setPrevia(null);
  }

  async function exportar() {
    try {
      await apiDownload(`/provas-papel/lotes/${loteId}/exportar`, `prova-papel-${loteId}.xlsx`);
    } catch (e) {
      setErro(e.message || "Não foi possível exportar.");
    }
  }

  const st = d ? STATUS[d.lote.status] || STATUS.rascunho : null;
  const pode = !!d?.pode_editar;
  const lancados = d ? d.linhas.filter((l) => !l.faltou && l.nota_10 !== null).length : 0;
  const faltaram = d ? d.linhas.filter((l) => l.faltou).length : 0;
  const total = d ? d.linhas.length : 0;

  return (
    <TurmaPageShell id={id} treinamento={d?.turma || null} loading={carregando} abaAtiva="avaliacoes">
      <div style={{ marginBottom: 14 }}>
        <a href={`/turma/${id}/avaliacoes/papel`} style={link}>← Provas feitas no papel</a>
      </div>
      {erro && <div style={alerta}>{erro}</div>}
      {aviso && <div style={okBox}>{aviso}</div>}

      {d && (
        <>
          <div style={cabecalho}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={h2}>{d.lote.titulo}</h2>
              <span style={{ ...badge, color: st.cor, background: st.bg }}>{st.texto}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btnSec} onClick={exportar}>Exportar Excel</button>
              {pode && <button type="button" style={btnSec} disabled={ocupado || !sujo} onClick={() => salvar()}>Salvar rascunho</button>}
              {pode && <button type="button" style={btn} disabled={ocupado} onClick={() => setConfirma("confirmar")}>Confirmar importação</button>}
              {d.pode_desfazer && <button type="button" style={btnPerigo} disabled={ocupado} onClick={() => setConfirma("desfazer")}>Desfazer importação</button>}
              {d.pode_excluir && <button type="button" style={btnSec} disabled={ocupado} onClick={() => setConfirma("excluir")}>Excluir rascunho</button>}
            </div>
          </div>

          {confirma && (
            <div style={caixaConfirma}>
              {confirma === "confirmar" && (
                <p style={{ margin: 0 }}>
                  Confirmar grava {lancados} nota(s) na escala de 0 a 10 em Avaliações{d.material ? " e conta a prova como uma tentativa de quem teve as respostas digitadas" : ""}.
                  {" "}Dashboard, Analytics e Certificados passam a usar essas notas. A coordenação pode desfazer depois.
                </p>
              )}
              {confirma === "desfazer" && (
                <p style={{ margin: 0 }}>
                  Desfazer devolve as notas anteriores e remove as tentativas criadas por esta importação. Notas que foram alteradas depois da importação são preservadas.
                </p>
              )}
              {confirma === "excluir" && <p style={{ margin: 0 }}>Excluir apaga este rascunho e as folhas anexadas. Nenhuma nota é alterada.</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" style={confirma === "confirmar" ? btn : btnPerigo}
                  onClick={confirma === "confirmar" ? confirmar : confirma === "desfazer" ? desfazer : excluir}>
                  Sim, {confirma === "confirmar" ? "confirmar" : confirma === "desfazer" ? "desfazer" : "excluir"}
                </button>
                <button type="button" style={btnSec} onClick={() => setConfirma(null)}>Voltar</button>
              </div>
            </div>
          )}

          <div style={faixa}>
            <Kpi rotulo="Treinandos" valor={String(total)} />
            <Kpi rotulo="Com nota" valor={`${lancados}/${total}`} cor={lancados + faltaram === total ? colors.successText : colors.warningText} />
            <Kpi rotulo="Faltaram" valor={String(faltaram)} />
            <Kpi rotulo="Tipo" valor={d.material ? `${d.material.total_questoes} questões` : "Só nota"} detalhe={d.material ? "correção pelo gabarito" : `nota máxima ${fmtNota(d.lote.nota_maxima)}`} />
          </div>

          {d.material && d.material.sem_gabarito > 0 && (
            <div style={avisoBox}>{d.material.sem_gabarito} questão(ões) desta prova estão sem gabarito cadastrado e contarão como erro. Corrija na prova antes de confirmar, ou lance a nota final.</div>
          )}

          <div style={duasColunas}>
            {/* folhas */}
            <section style={{ ...painel, ...colunaFolhas }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <h3 style={h3}>Folhas digitalizadas</h3>
                {d.pode_anexar && (
                  <>
                    <input ref={inputArq} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style={{ display: "none" }} onChange={enviarArquivos} />
                    <button type="button" style={btnSec} disabled={ocupado} onClick={() => inputArq.current?.click()}>Anexar foto ou PDF</button>
                  </>
                )}
              </div>
              {d.arquivos.length === 0 ? (
                <div style={vazio}>Nenhuma folha anexada. A foto ou o PDF é opcional, mas fica guardado como comprovação.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {d.arquivos.map((a, i) => (
                      <button key={a.id} type="button" onClick={() => abrirArquivo(a.id)}
                        style={{ ...chip, ...(arquivoAberto === a.id ? chipOn : {}) }} title={`${a.nome} · ${fmtTam(a.tamanho)}`}>
                        {a.tipo === "pdf" || /pdf/i.test(a.tipo || "") ? "PDF" : "Foto"} {i + 1}
                      </button>
                    ))}
                  </div>
                  <div style={visorBox}>
                    {visorErro && <div style={{ ...vazio, color: colors.dangerText }}>{visorErro}</div>}
                    {!visorErro && !visor && <div style={vazio}>Abrindo…</div>}
                    {visor && /pdf/i.test(visor.tipo || "") && (
                      <iframe title="Folha da prova" src={visor.url} style={{ width: "100%", height: 560, border: 0 }} />
                    )}
                    {visor && !/pdf/i.test(visor.tipo || "") && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={visor.url} alt="Folha da prova digitalizada" style={{ width: "100%", display: "block" }} />
                    )}
                  </div>
                  {arquivoAberto && (() => {
                    const a = d.arquivos.find((x) => x.id === arquivoAberto);
                    if (!a) return null;
                    return (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8, fontSize: 12, color: colors.textSecondary }}>
                        <span>{a.nome} · {fmtTam(a.tamanho)}{a.enviado_por ? ` · ${a.enviado_por}` : ""}</span>
                        {(d.pode_anexar && (d.lote.status === "rascunho" || d.pode_desfazer)) && (
                          <button type="button" style={{ ...link, color: colors.dangerText }} disabled={ocupado} onClick={() => removerArquivo(a.id)}>Remover folha</button>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </section>

            {/* digitação */}
            <section style={{ ...painel, ...colunaDigitacao }}>
              <h3 style={{ ...h3, marginBottom: 10 }}>Lançamento</h3>
              {pode ? (
                <div style={{ ...grade, marginBottom: 12 }}>
                  <label style={lab}>Título
                    <input style={input} value={cab.titulo} maxLength={200} onChange={(e) => { setCab((p) => ({ ...p, titulo: e.target.value })); setSujo(true); }} />
                  </label>
                  {!d.material && (
                    <label style={lab}>Nota máxima
                      <input style={input} value={cab.nota_maxima} inputMode="decimal" onChange={(e) => { setCab((p) => ({ ...p, nota_maxima: e.target.value })); setSujo(true); }} />
                    </label>
                  )}
                  <label style={lab}>Data da aplicação
                    <input style={input} type="date" value={cab.data_aplicacao} onChange={(e) => { setCab((p) => ({ ...p, data_aplicacao: e.target.value })); setSujo(true); }} />
                  </label>
                </div>
              ) : null}

              {pode && (
                <div style={caixaPlanilha}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ color: colors.navy, fontSize: 14 }}>Importar notas por planilha</strong>
                      <div style={mini}>Baixe o modelo com os treinandos da turma, preencha as notas e envie de volta. Você confere antes de salvar.</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={btnSec} disabled={ocupado} onClick={baixarModelo}>Baixar modelo</button>
                      <input ref={inputPlan} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }} onChange={enviarPlanilha} />
                      <button type="button" style={btnSec} disabled={ocupado} onClick={() => inputPlan.current?.click()}>Enviar planilha preenchida</button>
                    </div>
                  </div>
                  {previa && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, color: colors.textPrimary, marginBottom: 6 }}>
                        <strong>{previa.arquivo}</strong>: {previa.resumo.lidas} linha(s) lida(s) · <strong>{previa.resumo.aplicaveis} para aplicar</strong>
                        {previa.resumo.faltaram ? ` (${previa.resumo.faltaram} faltaram)` : ""}
                        {previa.resumo.sem_lancamento ? ` · ${previa.resumo.sem_lancamento} sem lançamento` : ""}
                        {previa.resumo.erros ? <span style={{ color: colors.dangerText, fontWeight: 700 }}> · {previa.resumo.erros} com erro (não serão aplicadas)</span> : null}
                        {previa.resumo.avisos ? <span style={{ color: colors.warningText, fontWeight: 700 }}> · {previa.resumo.avisos} aviso(s)</span> : null}
                      </div>
                      {previa.problemas.length > 0 && (
                        <ul style={listaProb}>
                          {(verTodos ? previa.problemas : previa.problemas.slice(0, 6)).map((x, i) => (
                            <li key={i} style={{ color: x.tipo === "erro" ? colors.dangerText : colors.warningText }}>
                              {x.linha ? `Linha ${x.linha}` : "Planilha"}{x.nome ? ` · ${x.nome}` : ""}: {x.mensagem}
                            </li>
                          ))}
                        </ul>
                      )}
                      {previa.problemas.length > 6 && (
                        <button type="button" style={{ ...link, marginBottom: 6 }} onClick={() => setVerTodos((v) => !v)}>
                          {verTodos ? "Mostrar menos" : `Ver todos os ${previa.problemas_total} apontamentos`}
                        </button>
                      )}
                      {previa.resumo.fora_da_planilha > 0 && (
                        <div style={mini}>
                          {previa.resumo.fora_da_planilha} treinando(s) da turma não vieram na planilha e ficam como estão
                          {previa.nao_listados.length ? `: ${previa.nao_listados.slice(0, 5).join(", ")}${previa.nao_listados.length > 5 ? "…" : ""}` : ""}.
                        </div>
                      )}
                      {previa.linhas.some((l) => { const v = edit[l.participante_id]; return v && (v.nota || v.respostas || v.faltou); }) && (
                        <div style={{ ...mini, color: colors.warningText, marginTop: 4 }}>
                          Atenção: linhas que já têm nota, respostas ou falta digitadas no rascunho serão substituídas pelas da planilha.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button type="button" style={btn} disabled={!previa.linhas.length} onClick={aplicarPlanilha}>Aplicar {previa.linhas.length} linha(s) no rascunho</button>
                        <button type="button" style={btnSec} onClick={() => setPrevia(null)}>Descartar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p style={dica}>
                {d.material
                  ? `Digite as ${d.material.total_questoes} letras marcadas, na ordem (ex.: ABCDDACB). Use “-” para questão em branco, que conta como erro. Se a folha já foi corrigida à mão, deixe as respostas vazias e informe a nota.`
                  : `Informe a nota final de cada treinando (0 a ${fmtNota(d.lote.nota_maxima)}). Marque “Faltou” para quem não fez a prova.`}
                {" "}O Portal guarda a nota na escala de 0 a 10{Number(d.lote.nota_maxima) !== 10 ? ` (convertida de ${fmtNota(d.lote.nota_maxima)})` : ""}.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={tabela}>
                  <thead>
                    <tr>
                      <th style={th}>Treinando</th>
                      <th style={th}>Faltou</th>
                      {d.material && <th style={th}>Respostas</th>}
                      <th style={th}>{d.material ? "Ou nota" : "Nota"}</th>
                      <th style={th}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.linhas.map((l) => {
                      const v = edit[l.participante_id] || { faltou: false, respostas: "", nota: "" };
                      const e = errosLinha[l.participante_id];
                      const salvoAgora = !sujo;
                      return (
                        <tr key={l.participante_id}>
                          <td style={td}>
                            <strong>{l.nome}</strong>
                            {l.matricula ? <div style={mini}>{l.matricula}</div> : null}
                            {e && <div style={{ ...mini, color: colors.dangerText, fontWeight: 700 }}>{e}</div>}
                          </td>
                          <td style={td}>
                            <input type="checkbox" checked={v.faltou} disabled={!pode} onChange={(ev) => mudaLinha(l.participante_id, { faltou: ev.target.checked })} aria-label={`Faltou: ${l.nome}`} />
                          </td>
                          {d.material && (
                            <td style={td}>
                              <input style={{ ...input, width: 150, fontFamily: "ui-monospace, monospace", letterSpacing: ".08em", textTransform: "uppercase" }}
                                value={v.respostas} disabled={!pode || v.faltou} placeholder={pode && !v.faltou ? "A".repeat(Math.min(d.material.total_questoes, 8)) : ""}
                                onChange={(ev) => mudaLinha(l.participante_id, { respostas: ev.target.value, nota: ev.target.value ? "" : v.nota })}
                                aria-label={`Respostas de ${l.nome}`} />
                            </td>
                          )}
                          <td style={td}>
                            <input style={{ ...input, width: 80 }} value={v.nota} inputMode="decimal" disabled={!pode || v.faltou || (!!d.material && !!v.respostas.trim())}
                              onChange={(ev) => mudaLinha(l.participante_id, { nota: ev.target.value })} aria-label={`Nota de ${l.nome}`} />
                          </td>
                          <td style={td}>
                            {v.faltou ? <span style={{ color: colors.textSecondary }}>Faltou</span>
                              : l.nota_10 === null || !salvoAgora ? <span style={{ color: colors.textMuted }}>{l.nota_10 === null ? "—" : "salve para atualizar"}</span>
                              : (
                                <>
                                  <strong style={{ color: l.nota_10 >= 6 ? colors.successText : colors.dangerText }}>{fmtNota(l.nota_10)}</strong>
                                  {l.acertos !== null ? <div style={mini}>{l.acertos}/{l.total_questoes} acertos</div> : null}
                                  {Number(d.lote.nota_maxima) !== 10 && l.nota !== null ? <div style={mini}>original {fmtNota(l.nota)}</div> : null}
                                </>
                              )}
                            {d.lote.status === "rascunho" && l.nota_atual !== null && !v.faltou && (
                              <div style={{ ...mini, color: colors.warningText }}>já tem {fmtNota(l.nota_atual)} lançada; será substituída</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d.lote.status === "confirmado" && (
                <p style={{ ...dica, marginTop: 10 }}>Importação confirmada{d.lote.confirmado_por ? ` por ${d.lote.confirmado_por}` : ""}. Para corrigir, a coordenação desfaz e a importação é refeita.</p>
              )}
              {d.lote.status === "desfeito" && (
                <p style={{ ...dica, marginTop: 10 }}>Importação desfeita{d.lote.desfeito_por ? ` por ${d.lote.desfeito_por}` : ""}. As notas voltaram ao que eram antes.</p>
              )}
            </section>
          </div>
        </>
      )}
    </TurmaPageShell>
  );
}

function Kpi({ rotulo, valor, detalhe, cor }) {
  return (
    <div style={kpi}>
      <span style={{ fontSize: 11, fontWeight: 800, color: colors.textMuted, textTransform: "uppercase", letterSpacing: ".04em" }}>{rotulo}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: cor || colors.navy }}>{valor}</span>
      {detalhe && <span style={{ fontSize: 12, color: colors.textSecondary }}>{detalhe}</span>}
    </div>
  );
}

const h2 = { margin: 0, fontSize: 18, fontWeight: 800, color: colors.navy };
const h3 = { margin: 0, fontSize: 15, fontWeight: 800, color: colors.navy };
const cabecalho = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginBottom: 12 };
const okBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: radius.md, padding: "10px 16px", fontSize: 14, marginBottom: 12 };
const avisoBox = { background: colors.warningLight, color: colors.warningText, border: "1px solid #fed7aa", borderRadius: radius.md, padding: "10px 16px", fontSize: 13, marginBottom: 12 };
const caixaConfirma = { background: colors.accentLight, border: `1px solid ${colors.accentBright}`, borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginBottom: 14, color: colors.textPrimary };
const faixa = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const kpi = { flex: "1 1 150px", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 14px", display: "grid", gap: 2 };
const duasColunas = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" };
const painel = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 16, boxSizing: "border-box" };
const colunaFolhas = { flex: "1 1 360px", minWidth: 0 };
const colunaDigitacao = { flex: "2 1 520px", minWidth: 0 };
const visorBox = { border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: "hidden", background: colors.surfaceMuted, maxHeight: 640, overflowY: "auto" };
const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const input = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: "#fff" };
const btn = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnPerigo = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.danger, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const link = { background: "none", border: "none", color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "none" };
const chip = { padding: "7px 13px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const chipOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "9px 10px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "9px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const caixaPlanilha = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 14px", marginBottom: 12 };
const listaProb = { margin: "0 0 6px", paddingLeft: 18, fontSize: 12, display: "grid", gap: 2 };
const mini = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const dica = { margin: "0 0 12px", fontSize: 13, color: colors.textSecondary };
const badge = { padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "28px 16px", fontSize: 13 };
