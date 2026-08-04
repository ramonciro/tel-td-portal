"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../components/PortalShell";
import SectionCard from "../../../components/SectionCard";
import { apiFetch } from "../../../services/api";

export default function CriarTurmaInstrutorPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    tema: "",
    cliente: "",
    instrutor: "",
    publico: "",
    carga_horaria: "20h",
    data_inicio: "",
    data_fim: "",
    modalidade: "Presencial",
    sala: ""
  });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const descricaoFormatada = `[modalidade:${form.modalidade}] [sala:${form.sala}] Turma cadastrada autonomamente pelo instrutor.`;

      const payload = {
        tema: form.tema,
        cliente: form.cliente,
        instrutor: form.instrutor,
        publico: form.publico,
        carga_horaria: form.carga_horaria,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        descricao: descricaoFormatada
      };

      const novaTurma = await apiFetch("/api/treinamentos", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setSucesso("Turma criada com sucesso! Redirecionando...");
      setTimeout(() => {
        router.push(`/turma/${novaTurma?.id || ""}`);
      }, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao criar turma.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PortalShell title="Criar Nova Turma" subtitle="Cadastre as informações da turma para iniciar a gestão e o cronograma.">
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        
        {erro && <div style={{ padding: 12, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>{erro}</div>}
        {sucesso && <div style={{ padding: 12, borderRadius: 12, background: "#f0fdf4", color: "#166534", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>{sucesso}</div>}

        <SectionCard title="Dados da Turma">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Tema / Nome da Turma *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Excel Avançado para Operação"
                  value={form.tema}
                  onChange={e => setForm({...form, tema: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Agibank, Claro, Buser..."
                  value={form.cliente}
                  onChange={e => setForm({...form, cliente: e.target.value})}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Instrutor Responsável *</label>
                <input
                  type="text"
                  required
                  placeholder="Seu nome completo"
                  value={form.instrutor}
                  onChange={e => setForm({...form, instrutor: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Público-alvo</label>
                <input
                  type="text"
                  placeholder="Ex: Analistas de Atendimento N1"
                  value={form.publico}
                  onChange={e => setForm({...form, publico: e.target.value})}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Data de Início *</label>
                <input
                  type="date"
                  required
                  value={form.data_inicio}
                  onChange={e => setForm({...form, data_inicio: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Data de Término *</label>
                <input
                  type="date"
                  required
                  value={form.data_fim}
                  onChange={e => setForm({...form, data_fim: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Carga Horária</label>
                <input
                  type="text"
                  placeholder="Ex: 16h"
                  value={form.carga_horaria}
                  onChange={e => setForm({...form, carga_horaria: e.target.value})}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Modalidade</label>
                <select
                  value={form.modalidade}
                  onChange={e => setForm({...form, modalidade: e.target.value})}
                  style={inputStyle}
                >
                  <option value="Presencial">Presencial</option>
                  <option value="Online / Ao Vivo">Online / Ao Vivo</option>
                  <option value="Híbrido">Híbrido</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sala / Local / Link</label>
                <input
                  type="text"
                  placeholder="Ex: Sala de Treinamento 03 ou Link Meet"
                  value={form.sala}
                  onChange={e => setForm({...form, sala: e.target.value})}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => router.push("/instrutor")}
                style={{ background: "#e2e8f0", border: "none", padding: "12px 20px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer"
                }}
              >
                {salvando ? "Criando turma..." : "Salvar e Continuar"}
              </button>
            </div>
          </form>
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff" };
const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 };
