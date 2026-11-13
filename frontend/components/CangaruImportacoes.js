"use client";

// Projeto Canguru · Histórico de importações e desfazer (Pacote 9c, 13/11/2026).
// Cada importação gravada vira um lote. “Desfazer” apaga o que o lote criou e devolve o que ele atualizou ao valor anterior.
// Importações feitas antes deste pacote não têm lote: só dá para excluí-las (não há “antes” para devolver).
// Só o coordenador do RH desfaz ou exclui; a analista vê o histórico.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";
import { st, fmtN, fmtDia, COR_RH } from "./RhUi";

const ORIGEM = { operador: "Operador (novato)", supervisor: "Supervisor", admissoes: "Datas de admissão" };
const quando = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function resumoLote(l) {
  if (l.origem === "admissoes") return `${fmtN(l.novatos_alterados)} data(s) de admissão gravada(s)`;
  const p = [];
  if (l.avaliacoes_criadas) p.push(`${fmtN(l.avaliacoes_criadas)} avaliação(ões) nova(s)`);
  if (l.avaliacoes_atualizadas) p.push(`${fmtN(l.avaliacoes_atualizadas)} atualizada(s)`);
  if (l.novatos_criados) p.push(`${fmtN(l.novatos_criados)} novato(s) incluído(s)`);
  return p.join(" · ") || "—";
}
function resumoDesfeito(r) {
  if (!r) return "";
  const p = [];
  if (r.avaliacoes_apagadas) p.push(`${fmtN(r.avaliacoes_apagadas)} avaliação(ões) apagada(s)`);
  if (r.avaliacoes_restauradas) p.push(`${fmtN(r.avaliacoes_restauradas)} voltaram ao valor anterior`);
  if (r.novatos_apagados) p.push(`${fmtN(r.novatos_apagados)} novato(s) removido(s)`);
  if (r.novatos_restaurados) p.push(`${fmtN(r.novatos_restaurados)} ficha(s) de novato restaurada(s)`);
  if (r.avaliacoes_mantidas) p.push(`${fmtN(r.avaliacoes_mantidas)} avaliação(ões) mantida(s) porque uma importação mais nova mexeu nelas`);
  if (r.novatos_mantidos) p.push(`${fmtN(r.novatos_mantidos)} novato(s) mantido(s) porque têm outras avaliações ou ponto de atenção`);
  if (r.novatos_nao_restaurados) p.push(`${fmtN(r.novatos_nao_restaurados)} ficha(s) com campo alterado depois e mantido`);
  return p.join("; ") || "nada precisou mudar";
}

export default function CangaruImportacoes() {
  const [dados, setDados] = useState(null);
  const [msg, setMsg] = useState({ tipo: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  const [alvo, setAlvo] = useState(null); // { tipo: "lote"|"anterior", item }
  const [palavra, setPalavra] = useState("");
  const [removerNovatos, setRemoverNovatos] = useState(false);

  const carregar = useCallback(async () => {
    try { setDados(await apiFetch("/rh/canguru/importacoes")); }
    catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não consegui carregar as importações." }); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (a) => { setAlvo(a); setPalavra(""); setRemoverNovatos(false); setMsg({ tipo: "", texto: "" }); };
  const fechar = () => { setAlvo(null); setPalavra(""); };
  const esperada = alvo?.tipo === "lote" ? "DESFAZER" : "EXCLUIR";

  const confirmar = async () => {
    if (!alvo || palavra.trim().toUpperCase() !== esperada) return;
    setOcupado(true); setMsg({ tipo: "", texto: "" });
    try {
      if (alvo.tipo === "lote") {
        const r = await apiFetch(`/rh/canguru/importacoes/${alvo.item.id}/desfazer`, { method: "POST", body: JSON.stringify({ confirmar: true }) });
        setMsg({ tipo: "ok", texto: `Importação nº ${alvo.item.id} desfeita: ${resumoDesfeito(r)}.` });
      } else {
        const a = alvo.item;
        const r = await apiFetch("/rh/canguru/importacoes/anteriores/excluir", { method: "POST", body: JSON.stringify({ confirmar: true, origem: a.origem, arquivo: a.arquivo, dia: a.dia, remover_novatos: removerNovatos }) });
        setMsg({ tipo: "ok", texto: `${fmtN(r.avaliacoes_apagadas)} avaliação(ões) excluída(s)${r.novatos_apagados ? ` e ${fmtN(r.novatos_apagados)} novato(s) sem avaliação removido(s)` : ""}.` });
      }
      fechar(); await carregar();
    } catch (e) { setMsg({ tipo: "erro", texto: e.message || "Não foi possível concluir." }); }
    finally { setOcupado(false); }
  };

  const pode = !!dados?.pode_desfazer;
  const lotes = dados?.lotes || [];
  const anteriores = dados?.anteriores || [];

  return (
    <>
      {msg.texto ? <div style={{ ...(msg.tipo === "ok" ? st.ok : st.erro), marginTop: 14 }}>{msg.texto}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>Importações com histórico</h3>
        <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>
          Toda importação gravada daqui para frente aparece nesta lista. <strong>Desfazer</strong> apaga o que aquela importação criou e devolve ao valor anterior o que ela atualizou.
          Se uma importação mais nova mexeu na mesma avaliação, ela é mantida e isso aparece no resultado. Pessoas cadastradas no portal durante a importação não são apagadas.
          {pode ? "" : " Só o coordenador do RH pode desfazer."}
        </p>
        {!dados ? <p style={{ fontSize: 13, color: colors.textMuted }}>Carregando…</p> : !lotes.length ? <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma importação com histórico ainda. A próxima que você gravar aparece aqui.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr><th style={st.th}>Nº</th><th style={st.th}>Tipo</th><th style={st.th}>Arquivo(s)</th><th style={st.th}>Quem e quando</th><th style={st.th}>O que gravou</th><th style={st.th}>Situação</th><th style={st.th} /></tr></thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td style={st.td}>{l.id}</td>
                    <td style={st.td}>{ORIGEM[l.origem] || l.origem}</td>
                    <td style={{ ...st.td, wordBreak: "break-word" }}>{l.arquivos || "—"}</td>
                    <td style={st.td}>{l.usuario || "—"}<br /><span style={{ fontSize: 12, color: colors.textMuted }}>{quando(l.criado_em)}</span></td>
                    <td style={st.td}>{resumoLote(l)}</td>
                    <td style={st.td}>{l.desfeito_em ? <span style={{ color: colors.textMuted }}>Desfeita em {quando(l.desfeito_em)}</span> : <strong style={{ color: "#166534" }}>Ativa</strong>}</td>
                    <td style={st.td}>{!l.desfeito_em && pode ? <button type="button" style={st.btnGhost} onClick={() => abrir({ tipo: "lote", item: l })}>Desfazer</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...st.card, marginTop: 16 }}>
        <h3 style={st.cardTitle}>Importações anteriores (sem histórico)</h3>
        <p style={{ margin: "-6px 0 12px", fontSize: 13, color: colors.textSecondary }}>
          Avaliações importadas antes do histórico existir, agrupadas por arquivo e dia. Aqui só dá para <strong>excluir</strong>: o portal não guardou o valor anterior, então a exclusão não pode ser desfeita.
          Os novatos continuam cadastrados, a menos que você marque para remover os que ficarem sem nenhuma avaliação.
        </p>
        {!dados ? null : !anteriores.length ? <p style={{ fontSize: 13, color: colors.textMuted }}>Não há importações antigas sem histórico.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr><th style={st.th}>Tipo</th><th style={st.th}>Arquivo</th><th style={st.th}>Dia</th><th style={st.th}>Avaliações</th><th style={st.th}>Novatos</th><th style={st.th} /></tr></thead>
              <tbody>
                {anteriores.map((a) => (
                  <tr key={`${a.origem}|${a.arquivo}|${a.dia}`}>
                    <td style={st.td}>{ORIGEM[a.origem] || a.origem}</td>
                    <td style={{ ...st.td, wordBreak: "break-word" }}>{a.arquivo || "(sem nome de arquivo)"}</td>
                    <td style={st.td}>{fmtDia(a.dia)}</td>
                    <td style={st.td}>{fmtN(a.linhas)}</td>
                    <td style={st.td}>{fmtN(a.novatos)}</td>
                    <td style={st.td}>{pode ? <button type="button" style={st.btnGhost} onClick={() => abrir({ tipo: "anterior", item: a })}>Excluir</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alvo ? (
        <div role="alertdialog" aria-label="Confirmar" style={{ ...st.card, marginTop: 16, border: "2px solid #b91c1c" }}>
          <h3 style={{ ...st.cardTitle, color: "#b91c1c" }}>{alvo.tipo === "lote" ? `Desfazer a importação nº ${alvo.item.id}?` : "Excluir estas avaliações?"}</h3>
          {alvo.tipo === "lote" ? (
            <p style={{ fontSize: 13, margin: "0 0 10px" }}>
              {ORIGEM[alvo.item.origem]} · {alvo.item.arquivos || "sem arquivo"} · {quando(alvo.item.criado_em)}.<br />
              O portal vai apagar {resumoLote(alvo.item)} e devolver ao valor anterior o que foi atualizado. Isso não pode ser desfeito depois.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, margin: "0 0 10px" }}>
                Vão ser apagadas <strong>{fmtN(alvo.item.linhas)}</strong> avaliação(ões) de {ORIGEM[alvo.item.origem]} do arquivo “{alvo.item.arquivo || "sem nome"}” importado em {fmtDia(alvo.item.dia)}. O valor anterior não foi guardado, então <strong>não dá para recuperar</strong>.
              </p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10 }}>
                <input type="checkbox" checked={removerNovatos} onChange={(e) => setRemoverNovatos(e.target.checked)} />
                Remover também os novatos que ficarem sem nenhuma avaliação e sem ponto de atenção
              </label>
            </>
          )}
          <div style={st.filtros}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={st.label}>Para confirmar, digite {esperada}</label>
              <input style={st.input} value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={{ ...st.btn, background: "#b91c1c", borderColor: "#b91c1c", opacity: palavra.trim().toUpperCase() === esperada && !ocupado ? 1 : 0.5 }} disabled={palavra.trim().toUpperCase() !== esperada || ocupado} onClick={confirmar}>{ocupado ? "Aguarde…" : alvo.tipo === "lote" ? "Desfazer importação" : "Excluir avaliações"}</button>
            <button type="button" style={st.btnGhost} onClick={fechar} disabled={ocupado}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
