"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../services/api";

export default function ChamadaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [modoAula, setModoAula] = useState(false);
  const [turmaAulaId, setTurmaAulaId] = useState("");
  const [dataAula, setDataAula] = useState("");
  const [origem, setOrigem] = useState("");

  const [treinamento, setTreinamento] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const aulaId = search.get("turma_aula_id") || "";
    const data = search.get("data_aula") || "";
    const origemParam = search.get("origem") || "";

    setTurmaAulaId(aulaId);
    setModoAula(Boolean(aulaId));
    setDataAula(data);
    setOrigem(origemParam);
  }, []);

  useEffect(() => {
    async function carregarTreinamento() {
      try {
        if (!id) return;
        setLoading(true);
        setErro("");

        const dados = await apiFetch(`/treinamentos/${id}`);
        setTreinamento(dados || null);
      } catch (err) {
        setErro(err.message || "Erro ao carregar treinamento");
      } finally {
        setLoading(false);
      }
    }

    carregarTreinamento();
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40 }}>Carregando...</div>;
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Página da Turma</h1>

      <div style={{ marginTop: 16 }}>ID da turma: {String(id || "-")}</div>
      <div>Modo aula: {modoAula ? "SIM" : "NÃO"}</div>
      <div>Turma aula ID: {turmaAulaId || "-"}</div>
      <div>Data aula: {dataAula || "-"}</div>
      <div>Origem: {origem || "-"}</div>

      <hr style={{ margin: "24px 0" }} />

      {erro ? (
        <div style={{ color: "red", fontWeight: "bold" }}>Erro: {erro}</div>
      ) : (
        <>
          <div>Tema: {treinamento?.tema || "-"}</div>
          <div>Cliente: {treinamento?.cliente || "-"}</div>
          <div>Instrutor: {treinamento?.instrutor || "-"}</div>
          <div>Data início: {treinamento?.data_inicio || treinamento?.data || "-"}</div>
          <div>Data fim: {treinamento?.data_fim || "-"}</div>
        </>
      )}
    </div>
  );
}
