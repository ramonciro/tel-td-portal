"use client";

import { useEffect, useState } from "react";

const initialAvaliacao = {
  treinamento_id: "",
  nota_nps: "",
  nota_qualidade: "",
  comentario: ""
};

const initialMaterial = {
  treinamento_id: "",
  titulo: "",
  tipo: "PROVA",
  link_arquivo: "",
  observacao: ""
};

export default function AvaliacoesPage() {
  const [avaliacao, setAvaliacao] = useState(initialAvaliacao);
  const [material, setMaterial] = useState(initialMaterial);
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function apiGet(path) {
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    return res.json();
  }

  async function apiPost(path, body) {
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erro");
    return data;
  }

  async function carregarTudo() {
    try {
      const [treins, avs, mats] = await Promise.all([
        apiGet("/treinamentos"),
        apiGet("/avaliacoes"),
        apiGet("/materiais-avaliativos")
      ]);

      setTreinamentos(treins);
      setAvaliacoes(avs);
      setMateriais(mats);
    } catch {
      setErro("Erro ao carregar dados da página");
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  function handleAvaliacaoChange(e) {
    setAvaliacao({ ...avaliacao, [e.target.name]: e.target.value });
  }

  function handleMaterialChange(e) {
    setMaterial({ ...material, [e.target.name]: e.target.value });
  }

  async function salvarAvaliacao(e) {
    e.preventDefault();
    setMensagem("");
    setErro("");

    try {
      await apiPost("/avaliacoes", {
        ...avaliacao,
        treinamento_id: Number(avaliacao.treinamento_id),
        nota_nps: Number(avaliacao.nota_nps),
        nota_qualidade: Number(avaliacao.nota_qualidade)
      });

      setMensagem("Avaliação registrada com sucesso");
      setAvaliacao(initialAvaliacao);
      carregarTudo();
    } catch (e) {
      setErro("Erro ao salvar avaliação");
    }
  }

  async function salvarMaterial(e) {
    e.preventDefault();
    setMensagem("");
    setErro("");

    try {
      await apiPost("/materiais-avaliativos", {
        ...material,
        treinamento_id: Number(material.treinamento_id)
      });

      setMensagem("Teste/Prova cadastrado com sucesso");
      setMaterial(initialMaterial);
      carregarTudo();
    } catch (e) {
      setErro("Erro ao salvar teste/prova");
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Avaliações</h1>
      <p>Registro de NPS, qualidade e materiais avaliativos.</p>

      {mensagem ? <p style={{ color: "green" }}>{mensagem}</p> : null}
      {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}

      <div style={{ display: "grid", gap: 24, marginTop: 24 }}>
        <form onSubmit={salvarAvaliacao} style={boxStyle}>
          <h2>Nova avaliação</h2>

          <label>Treinamento</label>
          <select
            name="treinamento_id"
            value={avaliacao.treinamento_id}
            onChange={handleAvaliacaoChange}
            style={inputStyle}
          >
            <option value="">Selecione</option>
            {treinamentos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tema} - {t.cliente}
              </option>
            ))}
          </select>

          <label>NPS (0 a 10)</label>
          <input
            type="number"
            min="0"
            max="10"
            name="nota_nps"
            value={avaliacao.nota_nps}
            onChange={handleAvaliacaoChange}
            style={inputStyle}
          />

          <label>Qualidade (1 a 5)</label>
          <input
            type="number"
            min="1"
            max="5"
            name="nota_qualidade"
            value={avaliacao.nota_qualidade}
            onChange={handleAvaliacaoChange}
            style={inputStyle}
          />

          <label>Comentário</label>
          <textarea
            name="comentario"
            value={avaliacao.comentario}
            onChange={handleAvaliacaoChange}
            style={{ ...inputStyle, minHeight: 100 }}
          />

          <button type="submit" style={buttonStyle}>Salvar avaliação</button>
        </form>

        <form onSubmit={salvarMaterial} style={boxStyle}>
          <h2>Testes e Provas</h2>

          <label>Treinamento</label>
          <select
            name="treinamento_id"
            value={material.treinamento_id}
            onChange={handleMaterialChange}
            style={inputStyle}
          >
            <option value="">Selecione</option>
            {treinamentos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tema} - {t.cliente}
              </option>
            ))}
          </select>

          <label>Título</label>
          <input
            name="titulo"
            value={material.titulo}
            onChange={handleMaterialChange}
            style={inputStyle}
          />

          <label>Tipo</label>
          <select
            name="tipo"
            value={material.tipo}
            onChange={handleMaterialChange}
            style={inputStyle}
          >
            <option value="PROVA">Prova</option>
            <option value="TESTE">Teste</option>
            <option value="EXERCICIO">Exercício</option>
            <option value="CHECKLIST">Checklist</option>
          </select>

          <label>Link do arquivo</label>
          <input
            name="link_arquivo"
            value={material.link_arquivo}
            onChange={handleMaterialChange}
            style={inputStyle}
            placeholder="Ex.: link do Drive, SharePoint ou arquivo interno"
          />

          <label>Observação</label>
          <textarea
            name="observacao"
            value={material.observacao}
            onChange={handleMaterialChange}
            style={{ ...inputStyle, minHeight: 100 }}
          />

          <button type="submit" style={buttonStyle}>Salvar teste/prova</button>
        </form>

        <div style={boxStyle}>
          <h2>Avaliações registradas</h2>
          {avaliacoes.length === 0 ? (
            <p>Nenhuma avaliação registrada ainda.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellStyle}>Treinamento</th>
                  <th style={cellStyle}>NPS</th>
                  <th style={cellStyle}>Qualidade</th>
                  <th style={cellStyle}>Comentário</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoes.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.treinamento_id}</td>
                    <td style={cellStyle}>{item.nota_nps}</td>
                    <td style={cellStyle}>{item.nota_qualidade}</td>
                    <td style={cellStyle}>{item.comentario || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={boxStyle}>
          <h2>Testes e provas cadastrados</h2>
          {materiais.length === 0 ? (
            <p>Nenhum material avaliativo cadastrado ainda.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellStyle}>Treinamento</th>
                  <th style={cellStyle}>Título</th>
                  <th style={cellStyle}>Tipo</th>
                  <th style={cellStyle}>Link</th>
                </tr>
              </thead>
              <tbody>
                {materiais.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.treinamento_id}</td>
                    <td style={cellStyle}>{item.titulo}</td>
                    <td style={cellStyle}>{item.tipo}</td>
                    <td style={cellStyle}>
                      {item.link_arquivo ? (
                        <a href={item.link_arquivo} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const boxStyle = {
  background: "#fff",
  padding: 24,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const inputStyle = {
  width: "100%",
  padding: 12,
  marginTop: 8,
  marginBottom: 16,
  border: "1px solid #d1d5db",
  borderRadius: 10
};

const buttonStyle = {
  background: "#172554",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: "bold"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse"
};

const cellStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};
