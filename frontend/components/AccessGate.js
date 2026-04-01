"use client";

import { useEffect, useState } from "react";
import { getStoredUser, hasSomeRole, hasOceanAccess } from "../services/api";

export default function AccessGate({ allowed = [], requireOceanAccess = false, children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  if (!allowed.length) return children;
  if (user === undefined) return null;
  if (!user) return null;

  if (!hasSomeRole(user, allowed) || (requireOceanAccess && !hasOceanAccess(user))) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: 28,
          border: "1px solid #e2e8f0",
          boxShadow: "0 12px 28px rgba(15,23,42,.06)",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: "6px 12px",
            borderRadius: 999,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          Acesso restrito
        </div>
        <h2 style={{ marginTop: 0 }}>
          Você não tem permissão para visualizar esta página.
        </h2>
        <p style={{ color: "#64748b", lineHeight: 1.7 }}>
          Esta área está disponível apenas para perfis autorizados.
        </p>
      </div>
    );
  }

  return children;
}
