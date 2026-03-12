"use client";

import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErro("");

    try {
      const res = await fetch(
        process.env.NEXT_PUBLIC_API_URL + "/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            senha
          })
        }
      );

      if (!res.ok) {
        setErro("Login inválido");
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.token);

      window.location.href = "/clientes";
    } catch {
      setErro("Erro ao conectar com o servidor");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Tel T&D</h1>
      <p>Portal de Treinamento</p>

      <form onSubmit={handleLogin}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <br /><br />

        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <br /><br />

        <button type="submit">Entrar</button>

        {erro && <p>{erro}</p>}
      </form>
    </div>
  );
}
