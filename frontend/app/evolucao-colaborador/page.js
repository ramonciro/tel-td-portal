"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch } from "../../services/api";

export default function EvolucaoColaboradorPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/usuarios"),
      apiFetch("/treinamentos"),
      apiFetch("/presencas"),
      apiFetch("/avaliacoes"),
    ])
      .then(([u, t, p, a]) => {
        setUsuarios(u);
        setTreinamentos(t);
        setPresencas(p);
        setAvaliacoes(a);
      })
      .catch((e) => setErro(e.message || "Erro ao carregar dados"));
  }, []);

  const cards = useMemo(() => {
    return usuarios.map((u) => {
      const pres = presencas.filter(
        (p) => String(p.treinando_nome || "").toLowerCase() === String(u.nome || "").toLowerCase()
      );
      const ids = [...new Set(pres.map((p) => p.treinamento_id).filter(Boolean))];
      const treinos = treinamentos.filter((t) => ids.includes(t.id));
      const avs = avaliacoes.filter((a) => ids.includes(a.treinamento_id));
      const presentes = pres.filter((p) => p.status === "presente").length;
      const total = pres.length;
      const assiduidade = total ? Math.round((presentes / total) * 100) : 0;
      const nota = avs.length
        ? (avs.reduce((acc, x) => acc + Number(x.nota_prova || 0), 0) / avs.length).toFixed(1)
        : "0.0";

      return {
        nome: u.nome,
        perfil: u.perfil,
        cliente: u.cliente,
        treinamentos: treinos.length,
        assiduidade,
        nota,
      };
    });
  }, [usuarios, treinamentos, presencas, avaliacoes]);

  return (
    <PortalShell
      title="Evolução do Colaborador"
      subtitle="Painel com dados reais do portal"
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={grid}>
        {cards.map((c) => (
          <div key={c.nome} style={card}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.nome}</div>
            <div style={{ color: "#64748b", marginTop: 4 }}>
              {c.perfil} • {c.cliente || "-"}
            </div>
            <div style={{ marginTop: 12 }}>
              Treinamentos: <strong>{c.treinamentos}</strong>
            </div>
            <div>
              Assiduidade: <strong>{c.assiduidade}%</strong>
            </div>
            <div>
              Nota média: <strong>{c.nota}</strong>
            </div>
          </div>
        ))}

        {!cards.length ? <div style={card}>Nenhum colaborador disponível.</div> : null}
      </div>
    </PortalShell>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 16,
};

const card = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(0,0,0,.08)",
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 10,
  marginBottom: 16,
};
