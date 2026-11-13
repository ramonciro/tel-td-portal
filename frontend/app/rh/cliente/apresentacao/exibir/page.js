"use client";

// Apresentação do cliente em tela cheia (13/11/2026) — fora do PortalShell.
// Endereço: /rh/cliente/apresentacao/exibir?tipo=clima&ciclo=ID  ou  ?tipo=canguru
// Usa só as rotas do portal do cliente: mesmo relatório "para o cliente", só do que foi liberado para ele.
import { useEffect, useState } from "react";
import { apiFetch } from "../../../../../services/api";
import { Apresentador, slidesClima, slidesCanguru } from "../../../../../components/RhSlides";
import { gerarPptxClima, gerarPptxCanguru } from "../../../../../lib/pptxRh";

export default function ExibirApresentacaoClientePage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const tipo = p.get("tipo") === "canguru" ? "canguru" : "clima";
    const ciclo = p.get("ciclo");
    (async () => {
      try {
        if (tipo === "clima") {
          if (!ciclo || !/^\d+$/.test(ciclo)) throw new Error("Pesquisa não informada. Abra a apresentação pela tela Apresentação.");
          const rel = await apiFetch(`/rh/cliente/ciclos/${ciclo}/relatorio?recortes=servico,tempo,faixa,genero`);
          let planos = [];
          try { planos = ((await apiFetch(`/rh/cliente/ciclos/${ciclo}/planos`)).planos) || []; } catch { planos = []; }
          setDados({ titulo: `${rel.ciclo.nome} · Clima`, slides: slidesClima(rel, planos), pptx: () => gerarPptxClima(rel, planos) });
        } else {
          const rel = await apiFetch("/rh/cliente/canguru/relatorio");
          if (rel.poucos) throw new Error(rel.mensagem || "Ainda há poucos novatos avaliados para apresentar sem identificar ninguém.");
          if (!rel.geral || !rel.geral.novatos) throw new Error("Ainda não há avaliações do Canguru para mostrar.");
          setDados({ titulo: "Projeto Canguru", slides: slidesCanguru(rel), pptx: () => gerarPptxCanguru(rel) });
        }
      } catch (e) { setErro(e.message || "Não foi possível montar a apresentação. Entre no Portal e tente novamente."); }
    })();
  }, []);

  if (erro) return <div style={{ padding: 32, color: "#fecaca", background: "#0b1220", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>{erro}</div>;
  if (!dados) return <div style={{ padding: 32, color: "#cbd5e1", background: "#0b1220", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>Montando a apresentação…</div>;
  return <Apresentador construtores={dados.slides} titulo={dados.titulo} onPptx={dados.pptx} />;
}
