"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";

const ACOES = [
  { value: "", label: "Todas as ações" },
  { value: "criar", label: "Criar" },
  { value: "editar", label: "Editar" },
  { value: "excluir", label: "Excluir" },
];

const ENTIDADES = [
  { value: "", label: "Todas as entidades" },
  { value: "usuario", label: "Usuário" },
  { value: "treinamento", label: "Treinamento" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "presenca", label: "Presença" },
];

function acaoStyle(acao) {
  const base = { display: "inline-block", padding: "3px 9px", borderRadius: radius.pill, fontSize: 11, fontWeight: 700 };
  if (acao === "criar") return { ...base, background: colors.successLight, color: colors.successText };
  if (acao === "excluir") return { ...base, background: colors.dangerLight, color: colors.dangerText };
  return { ...base, background: colors.warningLight, color: colors.warningText };
}

function formatDataHora(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

export default function AuditoriaPage() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [expandido, setExpandido] = useState(null);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filtroAcao) params.set("acao", filtroAcao);
        if (filtroEntidade) params.set("entidade", filtroEntidade);
        const resposta = await apiFetch(`/auditoria?${params.toString()}`);
        setItens(Array.isArray(resposta?.itens) ? resposta.itens : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar auditoria.");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, [filtroAcao, filtroEntidade]);

  const totais = useMemo(() => {
    return {
      total: itens.length,
      criar: itens.filter((i) => i.acao === "criar").length,
      editar: itens.filter((i) => i.acao === "editar").length,
      excluir: itens.filter((i) => i.acao === "excluir").length,
    };
  }, [itens]);

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: colors.textPrimary }}>Auditoria</h1>
          <p style={{ fontSize: 13, color: colors.textSecondary, margin: "4px 0 0" }}>
            Histórico de ações sensíveis: criação, edição e exclusão de usuários, treinamentos, avaliações e presenças.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Registros no período", value: totais.total, color: colors.primary },
            { label: "Criações", value: totais.criar, color: colors.success },
            { label: "Edições", value: totais.editar, color: colors.warning },
            { label: "Exclusões", value: totais.excluir, color: colors.danger },
          ].map((c) => (
            <div key={c.label} style={{ flex: "1 1 160px", borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{c.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <SectionCard title="Filtros">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              value={filtroAcao}
              onChange={(e) => setFiltroAcao(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 }}
            >
              {ACOES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              value={filtroEntidade}
              onChange={(e) => setFiltroEntidade(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 }}
            >
              {ENTIDADES.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard title="Linha do tempo">
          {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando...</p>}
          {erro && <p style={{ fontSize: 13, color: colors.dangerText }}>{erro}</p>}
          {!loading && !erro && itens.length === 0 && (
            <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhum registro de auditoria encontrado para esse filtro.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {itens.map((item) => (
              <div key={item.id} style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={acaoStyle(item.acao)}>{item.acao}</span>
                    <span style={{ fontSize: 13, color: colors.textPrimary }}>{item.resumo || `${item.entidade} #${item.entidade_id}`}</span>
                  </div>
                  <span style={{ fontSize: 12, color: colors.textMuted, whiteSpace: "nowrap" }}>{formatDataHora(item.criado_em)}</span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: colors.textSecondary }}>
                  <span>{item.usuario_nome || "Sistema"}{item.perfil ? ` · ${item.perfil}` : ""}</span>
                  {(item.dados_antes || item.dados_depois) && (
                    <button
                      onClick={() => setExpandido(expandido === item.id ? null : item.id)}
                      style={{ background: "none", border: "none", color: colors.primary, cursor: "pointer", fontSize: 12, padding: 0 }}
                    >
                      {expandido === item.id ? "ocultar detalhes" : "ver detalhes"}
                    </button>
                  )}
                </div>
                {expandido === item.id && (
                  <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {item.dados_antes && (
                      <pre style={{ flex: "1 1 240px", fontSize: 11, background: colors.surfaceMuted, borderRadius: radius.sm, padding: 10, overflowX: "auto", margin: 0 }}>
                        <strong>antes:</strong>{"\n"}{JSON.stringify(item.dados_antes, null, 2)}
                      </pre>
                    )}
                    {item.dados_depois && (
                      <pre style={{ flex: "1 1 240px", fontSize: 11, background: colors.surfaceMuted, borderRadius: radius.sm, padding: 10, overflowX: "auto", margin: 0 }}>
                        <strong>depois:</strong>{"\n"}{JSON.stringify(item.dados_depois, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
