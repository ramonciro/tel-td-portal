"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TurmaPageShell from "../../../../../components/TurmaPageShell";
import { apiFetch } from "../../../../../services/api";
import { colors, radius } from "../../../../../lib/theme";

// Importação das provas feitas no papel (16/10/2026) — lista da turma.
// A foto/PDF fica guardada no Portal e o instrutor digita as respostas marcadas
// (o Portal corrige pelo gabarito) ou a nota final já corrigida à mão.

const STATUS = {
  rascunho: { texto: "Rascunho", cor: colors.warningText, bg: colors.warningLight },
  confirmado: { texto: "Confirmada", cor: colors.successText, bg: colors.successLight },
  desfeito: { texto: "Desfeita", cor: colors.textSecondary, bg: colors.neutralLight },
};

function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}
function fmtNota(n) {
  return n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default function ProvasPapelListaPage() {
  const { id } = useParams() || {};
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ material_id: "", titulo: "", nota_maxima: "10", data_aplicacao: "" });
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      setDados(await apiFetch(`/provas-papel/turmas/${id}`));
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as importações.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const provaEscolhida = (dados?.provas || []).find((p) => String(p.id) === String(form.material_id));
  const campo = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function criar(e) {
    e.preventDefault();
    setCriando(true);
    try {
      setErro("");
      const corpo = {
        material_id: form.material_id ? Number(form.material_id) : undefined,
        titulo: form.titulo || undefined,
        nota_maxima: form.material_id ? undefined : form.nota_maxima,
        data_aplicacao: form.data_aplicacao || undefined,
      };
      const r = await apiFetch(`/provas-papel/turmas/${id}/lotes`, { method: "POST", body: JSON.stringify(corpo) });
      router.push(`/turma/${id}/avaliacoes/papel/${r.id}`);
    } catch (err) {
      setErro(err.message || "Não foi possível criar a importação.");
      setCriando(false);
    }
  }

  const turma = dados?.turma || null;

  return (
    <TurmaPageShell id={id} treinamento={turma} loading={carregando} abaAtiva="avaliacoes">
      <div style={{ marginBottom: 14 }}>
        <a href={`/turma/${id}/avaliacoes`} style={link}>← Avaliações da turma</a>
      </div>
      {erro && <div style={alerta}>{erro}</div>}

      {dados && (
        <>
          <div style={cabecalho}>
            <div>
              <h2 style={h2}>Provas feitas no papel</h2>
              <p style={sub}>
                Guarde a foto ou o PDF das folhas e lance as respostas marcadas (o Portal corrige pelo gabarito) ou a nota já corrigida.
                Só a confirmação altera as notas da turma.
              </p>
            </div>
            {dados.pode_editar && !aberto && (
              <button type="button" style={btn} onClick={() => setAberto(true)}>Nova importação</button>
            )}
          </div>

          {aberto && dados.pode_editar && (
            <form onSubmit={criar} style={painel}>
              <div style={grade}>
                <label style={lab}>
                  Qual prova foi aplicada?
                  <select style={input} value={form.material_id} onChange={campo("material_id")}>
                    <option value="">Prova só de papel (sem gabarito no Portal)</option>
                    {dados.provas.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.total_questoes}>
                        {p.titulo} {p.total_questoes ? `· ${p.total_questoes} questões` : "· sem questões"}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={lab}>
                  Título da prova
                  <input style={input} value={form.titulo} onChange={campo("titulo")}
                    placeholder={provaEscolhida ? provaEscolhida.titulo : "Ex.: Prova técnica"} maxLength={200} />
                </label>
                {!form.material_id && (
                  <label style={lab}>
                    Nota máxima da prova
                    <input style={input} value={form.nota_maxima} onChange={campo("nota_maxima")} inputMode="decimal" />
                  </label>
                )}
                <label style={lab}>
                  Data da aplicação
                  <input style={input} type="date" value={form.data_aplicacao} onChange={campo("data_aplicacao")} />
                </label>
              </div>
              <p style={{ ...sub, marginTop: 10 }}>
                {form.material_id
                  ? "Com a prova cadastrada, você digita as letras marcadas e o Portal corrige. A prova no papel conta como uma tentativa do treinando."
                  : "Sem gabarito no Portal, lance a nota final de cada treinando. Se a nota máxima não for 10, o Portal converte para a escala de 0 a 10."}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="submit" style={btn} disabled={criando}>{criando ? "Criando…" : "Criar e abrir"}</button>
                <button type="button" style={btnSec} onClick={() => setAberto(false)}>Cancelar</button>
              </div>
            </form>
          )}

          <div style={painel0}>
            {dados.lotes.length === 0 ? (
              <div style={vazio}>Nenhuma prova em papel importada nesta turma ainda.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tabela}>
                  <thead>
                    <tr>
                      <th style={th}>Prova</th>
                      <th style={th}>Aplicação</th>
                      <th style={th}>Situação</th>
                      <th style={th}>Lançadas</th>
                      <th style={th}>Média (0–10)</th>
                      <th style={th}>Folhas</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.lotes.map((l) => {
                      const st = STATUS[l.status] || STATUS.rascunho;
                      return (
                        <tr key={l.id}>
                          <td style={td}>
                            <strong>{l.titulo}</strong>
                            <div style={mini}>{l.material_id ? "Prova cadastrada (com gabarito)" : `Só papel · nota máxima ${fmtNota(l.nota_maxima)}`}</div>
                          </td>
                          <td style={td}>{fmtData(l.data_aplicacao)}</td>
                          <td style={td}><span style={{ ...badge, color: st.cor, background: st.bg }}>{st.texto}</span></td>
                          <td style={td}>{l.lancados}/{dados.participantes}{l.faltaram ? <div style={mini}>{l.faltaram} faltou</div> : null}</td>
                          <td style={td}>{fmtNota(l.media_10)}</td>
                          <td style={td}>{l.arquivos}</td>
                          <td style={td}><a href={`/turma/${id}/avaliacoes/papel/${l.id}`} style={link}>Abrir</a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </TurmaPageShell>
  );
}

const h2 = { margin: 0, fontSize: 18, fontWeight: 800, color: colors.navy };
const sub = { margin: "4px 0 0", fontSize: 13, color: colors.textSecondary, maxWidth: 680 };
const cabecalho = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14, marginBottom: 12 };
const painel = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 16, marginBottom: 16 };
const painel0 = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden" };
const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 };
const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: "#fff" };
const btn = { padding: "9px 16px", borderRadius: radius.sm, border: "none", background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const link = { background: "none", border: "none", color: colors.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "none" };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "11px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const mini = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const badge = { padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "36px 16px", fontSize: 14 };
