"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch, getStoredUser } from "../../services/api";

export default function ResponderNpsPage() {
  const [turmas, setTurmas] = useState([]);
  const [treinamentoId, setTreinamentoId] = useState("");
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ CORREÇÃO: user só no client
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro("");
        const data = await apiFetch("/nps-disponivel").catch(() => []);
        setTurmas(Array.isArray(data) ? data : []);
      } catch (error) {
        setErro(error.message || "Erro ao carregar turmas disponíveis para NPS.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  async function enviar() {
    try {
      setErro("");
      setSucesso("");

      if (!treinamentoId || nota === "") {
        setErro("Selecione a turma e informe a nota.");
        return;
      }

      await apiFetch("/avaliacoes-treinandos", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: treinamentoId,
          treinando_nome: user?.nome || "",
          nota_nps: Number(nota),
          comentario,
        }),
      });

      setSucesso("NPS enviado com sucesso.");
      setTreinamentoId("");
      setNota("");
      setComentario("");

      const data = await apiFetch("/nps-disponivel").catch(() => []);
      setTurmas(Array.isArray(data) ? data : []);
    } catch (error) {
      setErro(error.message || "Erro ao enviar NPS.");
    }
  }

  // ✅ evita render quebrado antes do user carregar
  if (!user) return null;

  return (
    <PortalShell
      title="Responder NPS"
      subtitle="Avalie a experiência do treinamento em que você participou."
    >
      {loading ? (
        <div style={loadingBox}>Carregando turmas...</div>
      ) : (
        <SectionCard
          title="Sua avaliação"
          subtitle="Você só pode responder o NPS das turmas em que está vinculado."
        >
          {erro ? <div style={errorBox}>{erro}</div> : null}
          {sucesso ? <div style={successBox}>{sucesso}</div> : null}

          <div style={formGrid}>
            <div style={fieldWrap}>
              <label style={label}>Treinando</label>
              <input style={input} value={user?.nome || ""} disabled />
            </div>

            <div style={fieldWrap}>
              <label style={label}>Turma</label>
              <select
                style={input}
                value={treinamentoId}
                onChange={(e) => setTreinamentoId(e.target.value)}
              >
                <option value="">Selecione a turma</option>
                {turmas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {(item.tema || "Turma") + " • " + (item.cliente || "Sem cliente")}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldWrap}>
              <label style={label}>Nota NPS (0 a 10)</label>
              <input
                style={input}
                type="number"
                min="0"
                max="10"
                step="1"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Digite sua nota"
              />
            </div>

            <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
              <label style={label}>Comentário</label>
              <textarea
                style={textarea}
                rows={4}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Conte como foi sua experiência no treinamento"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button style={btnPrimary} onClick={enviar}>
              Enviar avaliação
            </button>
          </div>
        </SectionCard>
      )}
    </PortalShell>
  );
}

// estilos (mantidos iguais)
const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
};

const textarea = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  fontSize: 14,
  color: "#0f172a",
  background: "#ffffff",
};

const btnPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};
