"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { formatDateBR } from "../../lib/date";

// Oficina de Talentos — Fase 2 (13/10/2026): presença (credenciamento) por
// módulo, frequência, elegibilidade e emissão de certificados. Regra do
// Ramon: certificado = participação + presença + carga horária; presença
// mínima definida em cada turma. Backend: oficinaCertificadosController.js.

const fmtH = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function PresencaCertificados({ turmaId, onMudou, setErro, setAviso }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  // Fase 3: painel "Registrar promoção" (uma pessoa por vez).
  const [promo, setPromo] = useState(null); // { inscricao_id, nome, cargo, data, observacao }

  const carregar = useCallback(async () => {
    try {
      const d = await apiFetch(`/oficina-talentos/turmas/${turmaId}/frequencia`);
      setDados(d);
    } catch (e) {
      setErro(e.message || "Erro ao carregar a frequência.");
    } finally {
      setCarregando(false);
    }
  }, [turmaId, setErro]);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  const elegiveisSemCertificado = useMemo(
    () => (dados ? dados.inscritos.filter((i) => i.elegivel && !i.certificado).length : 0),
    [dados]
  );
  const totalCertificados = useMemo(() => (dados ? dados.inscritos.filter((i) => i.certificado).length : 0), [dados]);

  async function executar(fn, sucesso) {
    setErro("");
    setAviso("");
    try {
      setOcupado(true);
      await fn();
      if (sucesso) setAviso(sucesso);
      await carregar();
      if (onMudou) onMudou();
    } catch (e) {
      setErro(e.message || "Erro ao salvar.");
    } finally {
      setOcupado(false);
    }
  }

  const alternar = (moduloId, inscricaoId, presente) =>
    executar(() =>
      apiFetch(`/oficina-talentos/modulos/${moduloId}/presenca`, {
        method: "PUT",
        body: JSON.stringify({ inscricao_id: inscricaoId, presente }),
      })
    );

  const credenciarTodos = (modulo, presente) =>
    executar(
      () =>
        apiFetch(`/oficina-talentos/modulos/${modulo.id}/credenciar-todos`, {
          method: "POST",
          body: JSON.stringify({ presente }),
        }),
      presente ? `Todos os confirmados credenciados em "${modulo.titulo}".` : `Presenças de "${modulo.titulo}" limpas (quem já tem certificado foi mantido).`
    );

  async function emitir() {
    if (!window.confirm(`Emitir ${elegiveisSemCertificado} certificado(s) para quem atingiu a presença mínima?`)) return;
    setErro("");
    setAviso("");
    try {
      setOcupado(true);
      const r = await apiFetch(`/oficina-talentos/turmas/${turmaId}/certificados/emitir`, { method: "POST", body: JSON.stringify({}) });
      setAviso(`${r.emitidos} certificado(s) emitido(s). Ainda sem direito: ${r.nao_elegiveis}.`);
      await carregar();
      if (onMudou) onMudou();
    } catch (e) {
      setErro(e.message || "Erro ao emitir certificados.");
    } finally {
      setOcupado(false);
    }
  }

  async function revogar(inscrito) {
    if (!window.confirm(`Revogar o certificado de ${inscrito.nome}? O código deixa de validar e a inscrição volta para "Confirmado".`)) return;
    executar(() => apiFetch(`/oficina-talentos/certificados/${inscrito.certificado.id}`, { method: "DELETE" }), "Certificado revogado.");
  }

  function abrirPromocao(i) {
    setErro("");
    setAviso("");
    setPromo({
      inscricao_id: i.inscricao_id,
      nome: i.nome,
      cargo: i.cargo_almejado && i.cargo_almejado !== "Não informado" ? i.cargo_almejado : "",
      cargoAlmejado: i.cargo_almejado,
      data: new Date().toISOString().slice(0, 10),
      observacao: "",
    });
  }

  async function salvarPromocao() {
    if (!promo) return;
    await executar(
      () =>
        apiFetch(`/oficina-talentos/inscricoes/${promo.inscricao_id}/promocao`, {
          method: "PUT",
          body: JSON.stringify({ promovido: true, cargo_promovido: promo.cargo, data: promo.data, observacao: promo.observacao }),
        }),
      `Promoção de ${promo.nome} registrada.`
    );
    setPromo(null);
  }

  function desfazerPromocao(i) {
    if (!window.confirm(`Desfazer a promoção de ${i.nome}? Ela deixa de contar nos indicadores.`)) return;
    executar(
      () => apiFetch(`/oficina-talentos/inscricoes/${i.inscricao_id}/promocao`, { method: "PUT", body: JSON.stringify({ promovido: false }) }),
      "Promoção desfeita."
    );
  }

  const abrir = (caminho) => window.open(caminho, "_blank", "noopener");

  if (carregando) return <SectionCard title="Presença e certificados"><div style={vazio}>Carregando…</div></SectionCard>;
  if (!dados) return null;

  const { turma, modulos, inscritos } = dados;

  return (
    <SectionCard
      title="Presença e certificados"
      subtitle={`Certificado para quem atingir ${turma.presenca_minima}% de presença na grade${turma.carga_horaria_total ? ` (carga horária ${fmtH(turma.carga_horaria_total)} h)` : ""}. Só participantes confirmados entram aqui.`}
      action={
        <div style={acoes}>
          <button style={btnSecundario} onClick={() => abrir(`/oficina-talentos/impressao/${turmaId}/frequencia`)}>
            Lista de frequência
          </button>
          <button style={btnSecundario} disabled={!totalCertificados} onClick={() => abrir(`/oficina-talentos/impressao/${turmaId}/certificados`)}>
            Imprimir certificados ({totalCertificados})
          </button>
          <button style={btnPrimario} disabled={ocupado || elegiveisSemCertificado === 0} onClick={emitir}>
            Emitir certificados ({elegiveisSemCertificado})
          </button>
        </div>
      }
    >
      {modulos.length === 0 ? (
        <div style={vazio}>A turma ainda não tem grade. Edite a turma e cadastre os módulos para registrar presença.</div>
      ) : inscritos.length === 0 ? (
        <div style={vazio}>Nenhum participante confirmado ainda. Confirme as inscrições na aba “Inscritos”.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {promo && (
            <div style={painelPromo}>
              <strong style={{ fontSize: 14 }}>Registrar promoção — {promo.nome}</strong>
              <div style={tdSub}>
                Cargo almejado na inscrição: {promo.cargoAlmejado}. Informe o cargo que a pessoa realmente assumiu (pode ser diferente).
              </div>
              <div style={gradePromo}>
                <label style={rotuloPromo}>
                  Cargo assumido
                  <input style={entradaPromo} value={promo.cargo} maxLength={150} onChange={(e) => setPromo({ ...promo, cargo: e.target.value })} />
                </label>
                <label style={rotuloPromo}>
                  Data da promoção
                  <input style={entradaPromo} type="date" value={promo.data} onChange={(e) => setPromo({ ...promo, data: e.target.value })} />
                </label>
                <label style={{ ...rotuloPromo, gridColumn: "1 / -1" }}>
                  Observação (opcional)
                  <input style={entradaPromo} value={promo.observacao} maxLength={255} onChange={(e) => setPromo({ ...promo, observacao: e.target.value })} />
                </label>
              </div>
              <div style={acoes}>
                <button style={btnPrimario} disabled={ocupado || !promo.cargo.trim()} onClick={salvarPromocao}>
                  Salvar promoção
                </button>
                <button style={btnSecundario} disabled={ocupado} onClick={() => setPromo(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <table style={tabela}>
            <thead>
              <tr>
                <th style={th}>Participante</th>
                {modulos.map((m) => (
                  <th key={m.id} style={{ ...th, textAlign: "center", minWidth: 120 }}>
                    <div style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: colors.textPrimary }}>{m.titulo}</div>
                    <div style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                      {[m.data ? formatDateBR(m.data) : null, m.carga_horaria ? `${fmtH(m.carga_horaria)} h` : null].filter(Boolean).join(" · ")}
                    </div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                      <button style={btnMini} disabled={ocupado} onClick={() => credenciarTodos(m, true)}>
                        Todos
                      </button>
                      <button style={btnMini} disabled={ocupado} onClick={() => credenciarTodos(m, false)}>
                        Limpar
                      </button>
                    </div>
                  </th>
                ))}
                <th style={{ ...th, textAlign: "center" }}>Presença</th>
                <th style={th}>Situação</th>
                <th style={th}>Promoção</th>
              </tr>
            </thead>
            <tbody>
              {inscritos.map((i) => (
                <tr key={i.inscricao_id}>
                  <td style={td}>
                    <strong>{i.nome}</strong>
                    <div style={tdSub}>Matrícula {i.matricula}</div>
                  </td>
                  {modulos.map((m, idx) => (
                    <td key={m.id} style={{ ...td, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        style={{ width: 18, height: 18, cursor: i.certificado ? "not-allowed" : "pointer" }}
                        checked={i.presencas[idx]}
                        disabled={ocupado || Boolean(i.certificado)}
                        onChange={(e) => alternar(m.id, i.inscricao_id, e.target.checked)}
                      />
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{i.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                  <td style={td}>
                    {i.certificado ? (
                      <div>
                        <span style={{ ...selo, background: colors.successLight, color: colors.successText }}>Certificado</span>
                        <div style={tdSub}>{i.certificado.codigo}</div>
                        <div style={acoes}>
                          <button style={btnMini} onClick={() => abrir(`/oficina-talentos/impressao/${turmaId}/${i.certificado.codigo}`)}>
                            Imprimir
                          </button>
                          <button style={{ ...btnMini, color: colors.dangerText }} disabled={ocupado} onClick={() => revogar(i)}>
                            Revogar
                          </button>
                        </div>
                      </div>
                    ) : i.elegivel ? (
                      <span style={{ ...selo, background: colors.primaryLight, color: colors.primary }}>Elegível</span>
                    ) : (
                      <span style={{ ...selo, background: colors.neutralLight, color: colors.neutral }}>Abaixo do mínimo</span>
                    )}
                  </td>
                  <td style={td}>
                    {i.promocao ? (
                      <div>
                        <span style={{ ...selo, background: colors.successLight, color: colors.successText }}>Promovido(a)</span>
                        <div style={tdSub}>
                          {i.promocao.cargo} · {formatDateBR(i.promocao.data)}
                        </div>
                        <button style={{ ...btnMini, marginTop: 4 }} disabled={ocupado} onClick={() => desfazerPromocao(i)}>
                          Desfazer
                        </button>
                      </div>
                    ) : i.certificado ? (
                      <div>
                        <div style={tdSub}>Almeja: {i.cargo_almejado}</div>
                        <button style={{ ...btnMini, marginTop: 4 }} disabled={ocupado} onClick={() => abrirPromocao(i)}>
                          Registrar promoção
                        </button>
                      </div>
                    ) : (
                      <span style={tdSub}>Só após o certificado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 0", fontSize: 14 };
const acoes = { display: "flex", gap: 8, flexWrap: "wrap" };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, verticalAlign: "bottom" };
const td = { padding: "10px 12px", verticalAlign: "middle", borderBottom: `1px solid ${colors.surfaceMuted}` };
const tdSub = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const selo = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: radius.pill, whiteSpace: "nowrap", display: "inline-block" };
const btnPrimario = { padding: "9px 18px", background: colors.accent, color: "#fff", border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSecundario = { padding: "9px 18px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnMini = { padding: "3px 8px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 11, fontWeight: 700 };
const painelPromo = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 14, display: "grid", gap: 10, marginBottom: 14 };
const gradePromo = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const rotuloPromo = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const entradaPromo = { padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, fontFamily: "inherit", background: colors.surface, color: colors.textPrimary, boxSizing: "border-box", width: "100%" };
