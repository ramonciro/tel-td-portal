"use client";

// Projeto Canguru para o cliente (13/11/2026): resultado agregado dos serviços que o RH liberou para o cliente.
// Sem nomes, sem relatos e sem grupos pequenos. Somente leitura.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Campo, COR_RH } from "../../../../components/RhUi";
import { CangaruRelatorio } from "../../../../components/CangaruUi";

export default function CangaruClientePage() {
  const [liberado, setLiberado] = useState(null);
  const [f, setF] = useState({ de: "", ate: "" });
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { apiFetch("/rh/cliente/canguru").then((x) => setLiberado(Boolean(x.liberado))).catch((e) => { setErro(e.message || "Não foi possível verificar o acesso."); setLiberado(false); }); }, []);
  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); }, [f]);
  useEffect(() => {
    if (!liberado) return;
    setCarregando(true); setErro("");
    apiFetch(`/rh/cliente/canguru/relatorio${qs ? `?${qs}` : ""}`).then(setR).catch((e) => setErro(e.message || "Não foi possível carregar o resultado.")).finally(() => setCarregando(false));
  }, [liberado, qs]);

  const baixar = async () => {
    setErro("");
    try { await apiDownload(`/rh/cliente/canguru/exportar${qs ? `?${qs}` : ""}`, `canguru_${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (e) { setErro(e.message || "Não foi possível baixar o Excel."); }
  };
  const link = { ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" };

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Minhas pesquisas" title="Projeto Canguru" subtitle="Como os novatos avaliaram os primeiros 30, 60 e 90 dias." />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <Link href="/rh/cliente" style={link}>Voltar</Link>
        {liberado ? <Link href="/rh/cliente/canguru/comparativo" style={link}>Comparar períodos</Link> : null}
        {liberado && r && !r.poucos ? <button type="button" style={{ ...st.btn, background: COR_RH }} onClick={baixar}>Baixar Excel</button> : null}
      </div>
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {liberado === null && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
      {liberado === false && !erro ? (
        <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>O Canguru ainda não foi liberado</h3>
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 13.5 }}>Quando o RH liberar o resultado do Canguru para o seu cliente, ele aparece aqui.</p>
        </div>
      ) : null}
      {liberado ? (
        <>
          <div style={{ ...st.card, marginTop: 16 }}>
            <div style={st.filtros}>
              <Campo label="Respostas de" minWidth={150}><input style={st.input} type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
              <Campo label="até" minWidth={150}><input style={st.input} type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
              {f.de || f.ate ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => setF({ de: "", ate: "" })}>Limpar</button></div> : null}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: colors.textSecondary }}>Mostra só os serviços liberados para o seu cliente. Grupos com poucos novatos não aparecem, para ninguém ser reconhecido.</p>
          </div>
          {carregando && !r ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
          {r?.poucos ? <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}><h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Ainda há poucos dados</h3><p style={{ margin: 0, color: colors.textSecondary, fontSize: 13.5 }}>{r.mensagem}</p></div> : null}
          {r && !r.poucos ? <div style={{ ...st.card, marginTop: 16, opacity: carregando ? 0.6 : 1 }}><CangaruRelatorio r={r} /></div> : null}
        </>
      ) : null}
    </PortalShell>
  );
}
