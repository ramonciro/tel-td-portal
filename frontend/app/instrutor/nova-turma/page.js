"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/PortalShell";
import SectionCard from "@/components/SectionCard";
import { apiFetch } from "@/services/api";

export default function NovaTurmaPage() {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [formData, setFormData] = useState({
    nome: "",
    codigo: "",
    curso: "",
    turno: "Noturno",
    dataInicio: "",
    dataFim: "",
    observacoes: ""
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
      await apiFetch("/api/turmas", {
        method: "POST",
        body: JSON.stringify(formData)
      });

      setSucesso("Turma cadastrada com sucesso!");
      setTimeout(() => {
        router.push("/instrutor");
      }, 1500);

    } catch (err) {
      console.error("Erro ao criar turma:", err);
      setErro(err.message || "Erro ao cadastrar nova turma. Verifique os dados.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell 
      title="Cadastrar Nova Turma" 
      subtitle="Preencha as informações básicas para abrir uma nova turma de ensino técnico."
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

        <SectionCard title="Informações Gerais da Turma">
          <div style={{ display: "grid", gap: 16 }}>
            
            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Nome da Turma *
              </label>
              <input
                type="text"
                required
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                placeholder="Ex: Técnico em Refrigeração - Turma A"
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Código / Identificador *
                </label>
                <input
                  type="text"
                  required
                  name="codigo"
                  value={formData.codigo}
                  onChange={handleChange}
                  placeholder="Ex: REF-2026-1"
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Turno *
                </label>
                <select
                  name="turno"
                  value={formData.turno}
                  onChange={handleChange}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff" }}
                >
                  <option value="Matutino">Matutino</option>
                  <option value="Vespertino">Vespertino</option>
                  <option value="Noturno">Noturno</option>
                  <option value="Integral">Integral</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Curso Vinculado *
              </label>
              <input
                type="text"
                required
                name="curso"
                value={formData.curso}
                onChange={handleChange}
                placeholder="Ex: Técnico em Refrigeração e Climatização"
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>

          </div>
        </SectionCard>

        <SectionCard title="Cronograma e Observações">
          <div style={{ display: "grid", gap: 16 }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Data de Início *
                </label>
                <input
                  type="date"
                  required
                  name="dataInicio"
                  value={formData.dataInicio}
                  onChange={handleChange}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                  Data de Término (Previsão)
                </label>
                <input
                  type="date"
                  name="dataFim"
                  value={formData.dataFim}
                  onChange={handleChange}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
                Observações / Informações Adicionais
              </label>
              <textarea
                rows={3}
                name="observacoes"
                value={formData.observacoes}
                onChange={handleChange}
                placeholder="Detalhes sobre a sala, laboratório ou orientações gerais..."
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
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
