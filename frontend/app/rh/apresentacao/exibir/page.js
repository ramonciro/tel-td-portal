"use client";

// Apresentação em tela cheia (13/11/2026) — fora do PortalShell. Endereço: /rh/apresentacao/exibir?tipo=clima|canguru&ciclo=ID&publico=...
// Quem abre precisa estar logado no Portal; os dados vêm dos mesmos relatórios das telas de Resultado.
import { useEffect, useState } from "react";
import { apiFetch } from "../../../../services/api";
import { Apresentador, slidesClima, slidesCanguru } from "../../../../components/RhSlides";

export default function ExibirApresentacaoPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const tipo = p.get("tipo") === "canguru" ? "canguru" : "clima";
    const publico = ["cliente", "diretoria", "rh"].includes(p.get("publico")) ? p.get("publico") : "diretoria";
    const ciclo = p.get("ciclo");
    (async () => {
      try {
        if (tipo === "clima") {
          if (!ciclo || !/^\d+$/.test(ciclo)) throw new Error("Pesquisa não informada. Abra a apresentação pela tela Apresentação do RH.");
          const rel = await apiFetch(`/rh/clima/ciclos/${ciclo}/relatorio?publico=${publico}&recortes=servico,tempo,faixa,genero`);
          let planos = [];
          try {
            const r = await apiFetch(`/rh/planos?ciclo=${ciclo}`);
            planos = (r.planos || []).filter((x) => x.status !== "cancelado" && (publico !== "cliente" || x.visivel_cliente));
          } catch { planos = []; }
          setDados({ titulo: `${rel.ciclo.nome} · Clima`, slides: slidesClima(rel, planos) });
        } else {
          const rel = await apiFetch(`/rh/canguru/relatorio?publico=${publico}`);
          if (!rel.geral || !rel.geral.novatos) throw new Error("Nenhuma avaliação do Canguru importada ainda.");
          setDados({ titulo: "Projeto Canguru", slides: slidesCanguru(rel) });
        }
      } catch (e) { setErro(e.message || "Não foi possível montar a apresentação. Entre no Portal e tente novamente."); }
    })();
  }, []);

  if (erro) return <div style={{ padding: 32, color: "#fecaca", background: "#0b1220", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>{erro}</div>;
  if (!dados) return <div style={{ padding: 32, color: "#cbd5e1", background: "#0b1220", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>Montando a apresentação…</div>;
  return <Apresentador construtores={dados.slides} titulo={dados.titulo} />;
}
