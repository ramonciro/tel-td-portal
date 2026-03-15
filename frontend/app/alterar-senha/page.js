"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch, getStoredUser } from "../../services/api";

export default function AlterarSenhaPage() {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    const user = getStoredUser();

    if (!user?.email) return setErro("Usuário não identificado.");
    if (!senhaAtual || !novaSenha || !confirmacao) return setErro("Preencha todos os campos.");
    if (novaSenha !== confirmacao) return setErro("A nova senha e a confirmação não coincidem.");

    try {
      setLoading(true);
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: user.email, senha: senhaAtual }),
      });
      await apiFetch("/auth/alterar-senha", {
        method: "POST",
        body: JSON.stringify({ email: user.email, novaSenha }),
      });
      setSucesso("Senha alterada com sucesso.");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      setTimeout(() => router.push("/inicio"), 1200);
    } catch (error) {
      setErro(error.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalShell title="Alterar senha" subtitle="Atualização segura da credencial de acesso.">
      <SectionCard title="Atualização de senha" subtitle="Preencha os campos abaixo para concluir a alteração.">
        {erro ? <div style={errorBox}>{erro}</div> : null}
        {sucesso ? <div style={successBox}>{sucesso}</div> : null}

        <form onSubmit={handleSubmit} style={{ maxWidth: 460, display: "grid", gap: 10 }}>
          <input type="password" placeholder="Senha atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} style={input} />
          <input type="password" placeholder="Nova senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} style={input} />
          <input type="password" placeholder="Confirmar nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} style={input} />
          <button type="submit" style={button} disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</button>
        </form>
      </SectionCard>
    </PortalShell>
  );
}

const input = { width: "100%", boxSizing: "border-box", height: 42, padding: "0 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontSize: 14 };
const button = { border: 0, background: "#2563eb", color: "#fff", height: 42, borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 14 };
const errorBox = { marginBottom: 12, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 10, padding: 10, fontWeight: 600 };
const successBox = { marginBottom: 12, background: "#ecfdf5", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, fontWeight: 600 };
