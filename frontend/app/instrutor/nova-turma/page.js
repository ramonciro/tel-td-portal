"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import SectionCard from "../../../components/SectionCard";
import { apiFetch } from "../../../services/api";

export default function NovaTurmaInstrutorPage() {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [formData, setFormData] = useState({
    tema: "",
    cliente: "",
    instrutor: "",
    publico: "",
    carga_horaria: "20h",
    data_inicio: "",
    data_fim: "",
    modalidade: "Presencial"
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErro("");
    setSucesso("");

    try {
      // Endpoint correto do backend para treinamentos / turmas
      await apiFetch("/api/treinamentos", {
        method: "POST",
        body: JSON.stringify(formData)
      });

      setSucesso("Turma cadastrada com sucesso!");
      setTimeout(() => {
        router.push("/instrutor");
      }, 1500);

    } catch (err) {
      console.error("Erro ao criar turma:", err);
      setErro(err.message || "Erro ao cadastrar nova turma. Verifique os campos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell 
      title="Cadastrar Nova Turma" 
      subtitle="Preencha as informações básicas para abrir uma nova turma pelo painel do instrutor."
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20, maxWidth: 800 }}>
        
        {erro && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 16, borderRadius: 12, fontWeight: 600 }}>
            {erro}
          </div>
        )}

        {sucesso && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: 16, borderRadius: 12, fontWeight: 600 }}>
            {sucesso}
          </div>
        )}

        <SectionCard title="Informações do Treinamento">
          <div style={{ display: "grid", gap: 16 }}>
            
            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Tema / Nome do Treinamento *
              </label>
              <input
                type="text"
                required
                name="tema"
                value={formData.tema}
                onChange={handleChange}
                placeholder="Ex: Reciclagem de Crédito ou Excel Avançado"
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Cliente *
                </label>
                <input
                  type="text"
                  required
                  name="cliente"
                  value={formData.cliente}
                  onChange={handleChange}
                  placeholder="Ex: Agibank, Claro..."
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Instrutor Responsável *
                </label>
                <input
                  type="text"
                  required
                  name="instrutor"
                  value={formData.instrutor}
                  onChange={handleChange}
                  placeholder="Seu nome"
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Público-alvo
                </label>
                <input
                  type="text"
                  name="publico"
                  value={formData.publico}
                  onChange={handleChange}
                  placeholder="Ex: Operação, Onboarding..."
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Carga Horária
                </label>
                <input
                  type="text"
                  name="carga_horaria"
                  value={formData.carga_horaria}
                  onChange={handleChange}
                  placeholder="Ex: 20h"
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>
            </div>

          </div>
        </SectionCard>

        <SectionCard title="Cronograma e Modalidade">
          <div style={{ display: "grid", gap: 16 }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Data de Início *
                </label>
                <input
                  type="date"
                  required
                  name="data_inicio"
                  value={formData.data_inicio}
                  onChange={handleChange}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Data de Fim *
                </label>
                <input
                  type="date"
                  required
                  name="data_fim"
                  value={formData.data_fim}
                  onChange={handleChange}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Modalidade
              </label>
              <select
                name="modalidade"
                value={formData.modalidade}
                onChange={handleChange}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff" }}
              >
                <option value="Presencial">Presencial</option>
                <option value="Online">Online</option>
                <option value="Híbrido">Híbrido</option>
              </select>
            </div>

          </div>
        </SectionCard>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ padding: "12px 20px", borderRadius: 10, background: "#e2e8f0", color: "#334155", fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: "12px 24px", borderRadius: 10, background: "#2563eb", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Cadastrando..." : "Cadastrar Turma"}
          </button>
        </div>

      </form>
    </PortalShell>
  );
}
