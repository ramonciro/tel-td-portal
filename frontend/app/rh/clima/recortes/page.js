"use client";

// Recortes (12/11/2026): onde o resultado muda (tempo de casa, serviço, cargo, faixa etária, gênero e coordenação).
// Só grupos com o mínimo de pessoas aparecem; grupos pequenos entram juntos em "Demais". Coordenação é só da equipe do RH.
import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Abas, SeletorCiclo, useCiclos, TabelaRecorte, FAROL, fmtN } from "../../../../components/RhUi";

export default function RecortesPage() {
  const { ciclos, cicloId, setCicloId, erro: erroCiclos } = useCiclos();
  const [tipo, setTipo] = useState("tempo");
  const [rc, setRc] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!cicloId) return;
    setRc(null); setErro("");
    apiFetch(`/rh/clima/ciclos/${cicloId}/recortes?tipo=${encodeURIComponent(tipo)}`)
      .then((r) => { setRc(r); setTipos(r.tipos || []); })
      .catch((e) => setErro(e.message || "Não foi possível carregar o recorte."));
  }, [cicloId, tipo]);

  const ciclo = ciclos?.find((c) => String(c.id) === String(cicloId));
  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Clima organizacional" title="Recortes" subtitle={ciclo ? `${ciclo.nome}${ciclo.cliente ? ` · ${ciclo.cliente}` : ""} · ${fmtN(ciclo.n_respondentes)} respondentes` : "Onde o resultado muda"} />
      {erroCiclos || erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erroCiclos || erro}</div> : null}
      {ciclos && !ciclos.length ? <div style={{ ...st.card, marginTop: 16 }}><p style={st.vazio}>Nenhuma pesquisa importada. <Link href="/rh/clima" style={{ color: "#9d174d", fontWeight: 800 }}>Importar agora</Link></p></div> : null}
      {ciclos?.length ? <div style={{ ...st.filtros, marginTop: 16 }}><SeletorCiclo ciclos={ciclos} valor={cicloId} onChange={setCicloId} /></div> : null}

      {ciclos?.length ? (
        <>
          <Abas valor={tipo} onChange={setTipo} abas={(tipos.length ? tipos : [{ tipo: "tempo", nome: "Tempo de casa" }, { tipo: "servico", nome: "Serviço" }, { tipo: "cargo", nome: "Cargo/posição" }, { tipo: "faixa", nome: "Faixa etária" }, { tipo: "genero", nome: "Gênero" }]).map((t) => ({ value: t.tipo, label: t.nome }))} />
          {!rc && !erro ? <p style={{ color: colors.textMuted }}>Carregando…</p> : null}
          {rc ? (
            <div style={st.card}>
              <h3 style={st.cardTitle}>% de respostas positivas por {rc.nome.toLowerCase()}</h3>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
                {Object.entries(FAROL).map(([k, f]) => (
                  <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: colors.textSecondary }}>
                    <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: f.bg, border: `1px solid ${f.barra}` }} />
                    {f.rotulo}: {k === "verde" ? `a partir de ${rc.limites.farol_verde_min}%` : k === "amarelo" ? `de ${rc.limites.farol_amarelo_min}% a ${rc.limites.farol_verde_min - 0.1}%` : `abaixo de ${rc.limites.farol_amarelo_min}%`}
                  </span>
                ))}
              </div>
              {rc.grupos.length ? <TabelaRecorte rc={rc} /> : <p style={st.vazio}>Nenhum grupo com {rc.minimo} pessoas ou mais neste recorte.</p>}
              <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>
                Só aparecem grupos com {rc.minimo} pessoas ou mais, para ninguém ser identificado. {rc.grupos.some((g) => g.rotulo.startsWith("Demais")) ? "“Demais” reúne os grupos pequenos. " : ""}
                {rc.restrito ? "Este recorte é só da equipe do RH e não vai para o relatório de cliente nem de diretoria." : ""}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </PortalShell>
  );
}
