"use client";

import { useEffect } from "react";

export default function DashboardPage() {
  useEffect(() => {
    window.location.href = "/clientes";
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Redirecionando...</h1>
      <p>Aguarde um instante.</p>
    </div>
  );
}
