"use client";

// Força o Next.js a tratar a página como dinâmica
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

// --- CONFIGURAÇÕES (FORA DO COMPONENTE PARA EVITAR ERRO DE SERIALIZAÇÃO) ---

const CAMPOS_CONFIG = [
  { name: "nome", label: "Treinamento", placeholder: "Ex: Integração, Reciclagem..." },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "planejada", label: "Planejada" },
      { value: "em andamento", label: "Em andamento" },
      { value: "concluída", label: "Concluída" },
      { value: "cancelada", label: "Cancelada" },
    ],
  },
  { name: "carga_horaria", label: "Carga Horária (h)", placeholder: "Ex: 4" },
  { name: "instrutor", label: "Instrutor Responsável" },
  { name: "data_inicio", label: "Data de Início", type: "date" },
  { name: "modalidade", label: "Modalidade", type: "select", options: [{value:"online", label:"Online"}, {value:"presencial", label:"Presencial"}] },
  { name: "sala", label: "Sala/Link" },
  { name: "descricao", label: "Observações Adicionais", type: "textarea" },
];

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

// --- COMPONENTE PRINCIPAL ---

export default function TreinamentosPage() {
  const [mounted, setMounted] = useState(false);
  const [treinamentos, setTreinamentos] = useState([]);

  // 1. Garante que o código pesado só execute no Navegador
  useEffect(() => {
    setMounted(true);
    
    async function carregar() {
      try {
        const res = await apiFetch("/treinamentos");
        const data = await res.json();
        setUsuarios(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar:", err);
      }
    }
    carregar();
  }, []);

  const kpis = useMemo(() => {
    return {
      total: treinamentos.length,
      andamento: treinamentos.filter(t => String(t.status).includes("andamento")).length,
      horas: treinamentos.reduce((acc, t) => acc + Number(t.carga_horaria || 0), 0)
    };
  }, [treinamentos]);

  // 2. Se estiver no Build da Vercel (Server Side), retorna um estado vazio e seguro
  if (!mounted) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", padding: "40px", textAlign: "center" }}>
        <p style={{ color: "#64748b", fontWeight: 600 }}>Carregando Portal T&D...</p>
      </div>
    );
  }

  return (
    <CrudPageV2
      title="Gestão de Treinamentos"
      endpoint="/treinamentos"
      fields={CAMPOS_CONFIG}
      hero={
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
          <StatCard title="Total de Turmas" value={fmt(kpis.total)} accent="#2563eb" />
          <StatCard title="Em Execução" value={fmt(kpis.andamento)} accent="#ea580c" />
          <StatCard title="Carga Horária Total" value={`${fmt(kpis.horas)}h`} accent="#7c3aed" />
        </div>
      }
      renderItem={(item) => (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.nome}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{item.instrutor} • {item.carga_horaria}h</div>
          </div>
          <div style={{
             padding: "4px 10px", 
             borderRadius: 999, 
             fontSize: 11, 
             fontWeight: 800,
             background: item.status === 'concluída' ? '#dcfce7' : '#f1f5f9',
             color: item.status === 'concluída' ? '#166534' : '#475569'
          }}>
            {String(item.status).toUpperCase()}
          </div>
        </div>
      )}
    />
  );
}
