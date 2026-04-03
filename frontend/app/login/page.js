"use client";

import { useState } from "react";
import { apiFetch } from "../../services/api";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push("/inicio");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Image src="/logo.png" alt="Logo" width={120} height={120} />

        <h1>Portal T&D</h1>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />

          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={styles.input}
          />

          <button style={styles.button}>Entrar</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
  },
  card: {
    background: "#fff",
    padding: "40px",
    borderRadius: "16px",
    textAlign: "center",
    width: "350px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "20px",
  },
  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  button: {
    background: "#2563eb",
    color: "#fff",
    padding: "10px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
