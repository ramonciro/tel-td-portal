"use client";
import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function TreinamentosPage() {
  const [clientes, setClientes] = useState([]);
  const [instrutores, setInstrutores] = useState([]);
  useEffect(() => {
    async function loadBase() {
      try {
        const [clientesData, usuariosData] = await Promise.all([apiFetch("/clientes").catch(() => []), apiFetch("/usuarios").catch(() => [])]);
        setClientes((Array.isArray(clientesData) ? clientesData : []).map((item) => ({ value: item.nome || item.cliente || item.id, label: item.nome || item.cliente || item.id })));
        setInstrutores((Array.isArray(usuariosData) ? usuariosData : []).filter((item) => ["instrutor", "supervisor", "coordenador"].includes(String(item.perfil || "").toLowerCase())).map((item) => ({ value: item.nome, label: item.nome })));
      } catch {
        setClientes([]);
        setInstrutores([]);
      }
    }
    loadBase();
  }, []);

  const fields = useMemo(() => [
    { name: "titulo", label: "Título do treinamento", placeholder: "Nome do treinamento" },
    { name: "cliente", label: "Cliente", type: "select", options: clientes },
    { name: "instrutor", label: "Instrutor", type: "select", options: instrutores },
    { name: "carga_horaria", label: "Carga horária", placeholder: "Ex.: 4h, 8h" },
    { name: "publico", label: "Público", placeholder: "Ex.: novos colaboradores, reciclagem" },
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Objetivo, foco e observações" },
    { name: "status", label: "Status", type: "select", options: [{ value: "Planejado", label: "Planejado" }, { value: "Em andamento", label: "Em andamento" }, { value: "Concluído", label: "Concluído" }]},
  ], [clientes, instrutores]);

  const columns = [
    { key: "titulo", label: "Treinamento" }, { key: "cliente", label: "Cliente" }, { key: "instrutor", label: "Instrutor" }, { key: "carga_horaria", label: "Carga horária" }, { key: "publico", label: "Público" }, { key: "status", label: "Status" },
  ];

  return (
    <CrudPageV2
      title="Treinamentos"
      subtitle="Organização das ações formativas com melhor leitura operacional e seleção orientada por cliente e instrutor."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsSubtitle="Cadastros e histórico de ações formativas do time."
      hero={<><StatCard title="Rotina de capacitação" value="Operação + gestão" subtitle="Registre o treinamento já vinculado ao cliente e ao instrutor." accent="#2563eb" /><SectionCard title="Melhoria aplicada" subtitle="A seleção por listas evita digitação solta e reduz inconsistências."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>Nesta versão, o registro foi organizado para apoiar mais o dia a dia do T&D, reforçando vínculo entre cliente, instrutor, carga horária e objetivo da ação.</p></SectionCard></>}
    />
  );
}
