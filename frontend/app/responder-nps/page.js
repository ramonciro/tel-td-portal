"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import { apiFetch, getStoredUser } from "../../services/api";

// Next.js exige que useSearchParams() fique dentro de um <Suspense> em rota
// estática (sem isso, o build de produção falha com "useSearchParams()
// should be wrapped in a suspense boundary") — por isso o componente que lê
// a URL fica separado, e o export default só envolve ele em Suspense.
export default function ResponderNpsPage() {
  return (
    <Suspense fallback={<PortalShell><div style={loadingBox}>Carregando turmas...</div></PortalShell>}>
      <ResponderNpsConteudo />
    </Suspense>
  );
}

function ResponderNpsConteudo() {
  const searchParams = useSearchParams();
  const treinamentoIdContexto = searchParams.get("treinamento_id") || "";

  const [turmas, setTurmas] = useState([]);
  const [treinamentoId, setTreinamentoId] = useState("");
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  // Questionário (19/10/2026): critérios de 1 a 5 + dois textos, além da nota 0–10.
  const [criteriosLista, setCriteriosLista] = useState([]);
  const [criterios, setCriterios] = useState({});
  const [melhor, setMelhor] = useState("");
  const [melhorar, setMelhorar] = useState("");
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
        const lista = Array.isArray(data) ? data : [];
        setTurmas(lista);
        const q = await apiFetch("/nps-questionario").catch(() => null);
        setCriteriosLista(Array.isArray(q?.criterios) ? q.criterios : []);

        // Veio de um link de turma específica (aba NPS da turma) — pré-seleciona,
        // em vez de obrigar a escolher de novo a mesma turma que acabou de sair.
        if (
          treinamentoIdContexto &&
          lista.some((item) => String(item.id) === String(treinamentoIdContexto))
        ) {
          setTreinamentoId(treinamentoIdContexto);
        }
      } catch (error) {
        setErro(error.message || "Erro ao carregar turmas disponíveis para NPS.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [treinamentoIdContexto]);

  async function enviar() {
    try {
      setErro("");
      setSucesso("");

      if (!treinamentoId || nota === "") {
        setErro("Selecione a turma e escolha a nota de 0 a 10.");
        return;
      }
      const faltando = criteriosLista.filter((c) => !criterios[c.chave]);
      if (faltando.length) {
        setErro(`Responda todas as perguntas de 1 a 5. Faltam: ${faltando.map((c) => c.rotulo).join("; ")}.`);
        return;
      }

      await apiFetch("/avaliacoes-treinandos", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: treinamentoId,
          treinando_nome: user?.nome || "",
          nota_nps: Number(nota),
          criterios,
          melhor,
          melhorar,
          comentario,
        }),
      });

      setSucesso("NPS enviado com sucesso.");
      setTreinamentoId("");
      setNota("");
      setComentario("");
      setCriterios({});
      setMelhor("");
      setMelhorar("");

      const data = await apiFetch("/nps-disponivel").catch(() => []);
      setTurmas(Array.isArray(data) ? data : []);
    } catch (error) {
      setErro(error.message || "Erro ao enviar NPS.");
    }
  }

  // O formulário agora é longo: leva a mensagem de erro/sucesso para a vista.
  useEffect(() => {
    if ((erro || sucesso) && typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [erro, sucesso]);

  // ✅ evita render quebrado antes do user carregar
  if (!user) return null;

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Portal T&D · NPS"
          title="Responder NPS"
          subtitle="Avalie a experiência do treinamento em que você participou."
        />
      </div>

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
          </div>

          <div style={bloco}>
            <div style={label}>De 0 a 10, o quanto você recomendaria este treinamento a um colega?</div>
            <div style={escalaLinha}>
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(String(n))}
                  style={{ ...botaoNota, ...(String(n) === nota ? botaoNotaAtivo : null) }}
                  aria-pressed={String(n) === nota}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={escalaLegenda}><span>0 = não recomendaria</span><span>10 = recomendaria com certeza</span></div>
          </div>

          {criteriosLista.length > 0 && (
            <div style={bloco}>
              <div style={label}>Agora avalie cada ponto de 1 (ruim) a 5 (excelente)</div>
              {criteriosLista.map((c) => (
                <div key={c.chave} style={criterioLinha}>
                  <div style={{ flex: "1 1 240px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{c.rotulo}</div>
                    {c.ajuda ? <div style={{ fontSize: 12, color: "#64748b" }}>{c.ajuda}</div> : null}
                  </div>
                  <div style={escalaLinha}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCriterios((p) => ({ ...p, [c.chave]: n }))}
                        style={{ ...botaoNota, ...(criterios[c.chave] === n ? botaoNotaAtivo : null) }}
                        aria-pressed={criterios[c.chave] === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={formGrid}>
            <div style={fieldWrap}>
              <label style={label}>O que foi melhor no treinamento? (opcional)</label>
              <textarea style={textarea} rows={3} value={melhor} maxLength={1000} onChange={(e) => setMelhor(e.target.value)} />
            </div>
            <div style={fieldWrap}>
              <label style={label}>O que podemos melhorar? (opcional)</label>
              <textarea style={textarea} rows={3} value={melhorar} maxLength={1000} onChange={(e) => setMelhorar(e.target.value)} />
            </div>
            <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
              <label style={label}>Algo mais que queira registrar? (opcional)</label>
              <textarea style={textarea} rows={2} value={comentario} maxLength={1000} onChange={(e) => setComentario(e.target.value)} />
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
  boxSizing: "border-box",
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
  boxSizing: "border-box",
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

const bloco = { marginTop: 18, display: "grid", gap: 10 };
const escalaLinha = { display: "flex", flexWrap: "wrap", gap: 6 };
const escalaLegenda = { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", flexWrap: "wrap", gap: 6 };
const botaoNota = { minWidth: 40, height: 40, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const botaoNotaAtivo = { background: "#2563eb", borderColor: "#2563eb", color: "#fff" };
const criterioLinha = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" };
