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
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email: user.email, senha: senhaAtual }) });
      await apiFetch("/auth/alterar-senha", { method: "POST", body: JSON.stringify({ email: user.email, novaSenha }) });
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
    <PortalShell title="Alterar senha" subtitle="Área para atualização segura da senha de acesso ao portal.">
      <SectionCard title="Atualização de senha" subtitle="Use esta página para ajustar sua credencial de acesso sem depender do primeiro acesso.">
        {erro ? <div style={errorBox}>{erro}</div> : null}
        {sucesso ? <div style={successBox}>{sucesso}</div> : null}
        <form onSubmit={handleSubmit} style={{ maxWidth: 560, display: "grid", gap: 14 }}>
          <input type="password" placeholder="Senha atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} style={input} />
          <input type="password" placeholder="Nova senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} style={input} />
          <input type="password" placeholder="Confirmar nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} style={input} />
          <button type="submit" style={button} disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</button>
        </form>
      </SectionCard>
    </PortalShell>
  );
}

const input = { width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 14, border: "1px solid #dbe3ef", background: "#fff" };
const button = { border: 0, background: "#2563eb", color: "#fff", padding: "14px 18px", borderRadius: 14, fontWeight: 800, cursor: "pointer" };
const errorBox = { marginBottom: 16, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 16, padding: 16, fontWeight: 600 };
const successBox = { marginBottom: 16, background: "#ecfdf5", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 16, padding: 16, fontWeight: 600 };
