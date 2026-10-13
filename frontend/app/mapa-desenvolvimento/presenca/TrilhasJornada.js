"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { btnPrimario, btnSecundario, painel, dica, acoes, avisoErro } from "./estilos";

// Vincula trilhas do catálogo à jornada (13/10/2026). Só as trilhas vinculadas
// aparecem na escolha do encontro, na grade e nos totais por trilha.
// A mesma trilha pode estar em várias jornadas. Retirar uma trilha NÃO apaga
// presença: os encontros dela passam a "sem trilha".
export default function TrilhasJornada({ jornadaId, onFechar, onSalvou, setErro, setAviso }) {
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState("");
  const [itens, setItens] = useState([]); // { id, titulo, cliente, status, encontros, marcado }
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await apiFetch(`/jornada-presenca/jornadas/${jornadaId}/trilhas`);
        if (!vivo) return;
        setItens([
          ...d.vinculadas.map((t) => ({ ...t, marcado: true })),
          ...d.disponiveis.map((t) => ({ ...t, encontros: 0, marcado: false })),
        ]);
      } catch (e) {
        if (vivo) setFalha(e.message || "Não foi possível carregar as trilhas.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [jornadaId]);

  const alternar = (id) => setItens((l) => l.map((t) => (t.id === id ? { ...t, marcado: !t.marcado } : t)));
  const q = busca.trim().toLowerCase();
  const visiveis = itens.filter((t) => t.marcado || !q || `${t.titulo} ${t.cliente || ""}`.toLowerCase().includes(q));
  const retiradas = itens.filter((t) => !t.marcado && t.encontros > 0);
  const marcadas = itens.filter((t) => t.marcado);

  async function salvar() {
    if (retiradas.length) {
      const total = retiradas.reduce((s, t) => s + t.encontros, 0);
      const msg = `Retirar ${retiradas.map((t) => `“${t.titulo}”`).join(", ")} da jornada? ${total} encontro(s) deixarão de apontar para essa trilha (ficam como “sem trilha”). As presenças já lançadas não são apagadas.`;
      if (!window.confirm(msg)) return;
    }
    setErro("");
    setAviso("");
    try {
      setOcupado(true);
      const r = await apiFetch(`/jornada-presenca/jornadas/${jornadaId}/trilhas`, {
        method: "PUT",
        body: JSON.stringify({ trilha_ids: marcadas.map((t) => t.id) }),
      });
      setAviso(
        r.encontros_desvinculados
          ? `Trilhas da jornada atualizadas. ${r.encontros_desvinculados} encontro(s) ficaram sem trilha.`
          : "Trilhas da jornada atualizadas."
      );
      onSalvou();
    } catch (e) {
      setErro(e.message || "Erro ao salvar as trilhas da jornada.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={painel}>
      <strong style={{ fontSize: 14 }}>Escolha as trilhas desta jornada</strong>
      <div style={dica}>
        Marque as trilhas do catálogo que fazem parte desta jornada. Em cada encontro você escolhe a qual trilha ele pertence, e a grade, os filtros, os
        totais, o Excel e a impressão passam a mostrar a trilha. A mesma trilha pode ser usada em várias jornadas. Para criar ou editar uma trilha, use a página{" "}
        <Link href="/trilhas" style={{ color: colors.primary, fontWeight: 700 }}>
          Trilhas
        </Link>
        .
      </div>
      {falha && <div style={avisoErro}>{falha}</div>}
      {carregando ? (
        <div style={dica}>Carregando…</div>
      ) : itens.length === 0 ? (
        <div style={dica}>Nenhuma trilha cadastrada neste ambiente ainda.</div>
      ) : (
        <>
          <input
            style={{ padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 14, maxWidth: 360 }}
            placeholder="Buscar trilha ou cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }}>
            {visiveis.map((t) => (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 12px",
                  background: t.marcado ? "#eff6ff" : "#fff",
                  border: `1px solid ${t.marcado ? "#bfdbfe" : colors.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={t.marcado} onChange={() => alternar(t.id)} />
                <span style={{ display: "grid" }}>
                  <strong style={{ fontSize: 13, color: colors.textPrimary }}>{t.titulo}</strong>
                  <span style={{ fontSize: 11, color: colors.textSecondary }}>
                    {[t.cliente || "Global (sem cliente)", t.qtd_etapas ? `${t.qtd_etapas} etapa(s)` : null, t.encontros ? `${t.encontros} encontro(s) nesta jornada` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
            {visiveis.length === 0 && <div style={dica}>Nenhuma trilha com esse filtro.</div>}
          </div>
        </>
      )}
      <div style={acoes}>
        <button style={btnPrimario} disabled={ocupado || carregando || Boolean(falha)} onClick={salvar}>
          Salvar trilhas ({marcadas.length})
        </button>
        <button style={btnSecundario} disabled={ocupado} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
