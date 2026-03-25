"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ChamadaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [modoAula, setModoAula] = useState(false);
  const [turmaAulaId, setTurmaAulaId] = useState("");
  const [dataAula, setDataAula] = useState("");
  const [origem, setOrigem] = useState("");

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

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Página da Turma</h1>
      <div style={{ marginTop: 16 }}>ID da turma: {String(id || "-")}</div>
      <div>Modo aula: {modoAula ? "SIM" : "NÃO"}</div>
      <div>Turma aula ID: {turmaAulaId || "-"}</div>
      <div>Data aula: {dataAula || "-"}</div>
      <div>Origem: {origem || "-"}</div>
    </div>
  );
  }
