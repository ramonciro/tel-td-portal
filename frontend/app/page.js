"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.href = "/clientes";
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <p>Redirecionando...</p>
    </div>
  );
}
