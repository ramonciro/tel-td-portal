"use client";

import { useState, useEffect } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";

export default function InstrutorTurmasPage() {
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);

  // Estados do formulário alinhados com o seu endpoint de treinamentos
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

  useEffect(() => {
    carregarTurmas();
  }, []);

  async function carregarTurmas() {
    try {
      const data = await apiFetch("/api/treinamentos");
      setTurmas(data || []);
    } catch (err) {
      console.error("Erro ao carregar turmas:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCriarTurma(e) {
    e.preventDefault();
    try {
      await apiFetch("/api/treinamentos", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      setModalAberto(false);
      carregarTurmas();
      // Reset form
      setFormData({
        tema: "",
        cliente: "",
        instrutor: "",
        publico: "",
        carga_horaria: "20h",
        data_inicio: "",
        data_fim: "",
        modalidade: "Presencial"
      });
    } catch (err) {
      alert("Erro ao criar turma: " + (err.message || "Verifique os dados"));
    }
  }

  return (
    <PortalShell 
      title="Painel do Instrutor - Gestão de Turmas" 
      subtitle="Acompanhe e abra novas turmas diretamente alinhadas ao portal de treinamentos."
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Suas Turmas Ativas</h3>
        <button
          onClick={() => setModalAberto(true)}
          style={{ padding: "10px 18px", borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          + Nova Turma
        </button>
      </div>

      <SectionCard title="Lista de Turmas Cadastradas">
        {loading ? (
          <p style={{ padding: 20, color: "#64748b" }}>Carregando turmas...</p>
        ) : turmas.length === 0 ? (
          <p style={{ padding: 20, color: "#64748b" }}>Nenhuma turma cadastrada no momento.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: 12 }}>Tema</th>
                  <th style={{ padding: 12 }}>Cliente</th>
                  <th style={{ padding: 12 }}>Público</th>
                  <th style={{ padding: 12 }}>Início</th>
                  <th style={{ padding: 12 }}>Fim</th>
                </tr>
              </thead>
              <tbody>
                {turmas.map((t, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 12, fontWeight: 600, color: "#1e293b" }}>{t.tema}</td>
                    <td style={{ padding: 12, color: "#475569" }}>{t.cliente}</td>
                    <td style={{ padding: 12, color: "#475569" }}>{t.publico}</td>
                    <td style={{ padding: 12, color: "#475569" }}>{t.data_inicio}</td>
                    <td style={{ padding: 12, color: "#475569" }}>{t.data_fim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Modal igual ao seu print de treinamentos */}
      {modalAberto && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div style={{ background: "#fff", padding: 30, borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>Criar nova turma</h3>
              <button 
                onClick={() => setModalAberto(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarTurma} style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Tema / Treinamento *</label>
                <input
                  type="text"
                  required
                  value={formData.tema}
                  onChange={e => setFormData({...formData, tema: e.target.value})}
                  placeholder="Ex: Reciclagem de Crédito"
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Cliente *</label>
                  <input
                    type="text"
                    required
                    value={formData.cliente}
                    onChange={e => setFormData({...formData, cliente: e.target.value})}
                    placeholder="Ex: Agibank"
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Instrutor *</label>
                  <input
                    type="text"
                    required
                    value={formData.instrutor}
                    onChange={e => setFormData({...formData, instrutor: e.target.value})}
                    placeholder="Nome do instrutor"
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Público</label>
                  <input
                    type="text"
                    value={formData.publico}
                    onChange={e => setFormData({...formData, publico: e.target.value})}
                    placeholder="Ex: Operação"
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Carga Horária</label>
                  <input
                    type="text"
                    value={formData.carga_horaria}
                    onChange={e => setFormData({...formData, carga_horaria: e.target.value})}
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Data de Início *</label>
                  <input
                    type="date"
                    required
                    value={formData.data_inicio}
                    onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#334155" }}>Data de Fim *</label>
                  <input
                    type="date"
                    required
                    value={formData.data_fim}
                    onChange={e => setFormData({...formData, data_fim: e.target.value})}
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  style={{ padding: "10px 16px", borderRadius: 8, background: "#e2e8f0", border: "none", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: "10px 20px", borderRadius: 8, background: "#2563eb", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
                >
                  Salvar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
