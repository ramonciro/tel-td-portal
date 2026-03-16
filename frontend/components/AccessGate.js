"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredUser, hasSomeRole } from "../services/api";

export default function AccessGate({
  allowedRoles = [],
  children,
  fallbackPath = "/inicio",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const normalizedAllowedRoles = useMemo(
    () => allowedRoles.map((r) => String(r).toLowerCase()),
    [allowedRoles]
  );

  useEffect(() => {
    const user = getStoredUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    if (
      normalizedAllowedRoles.length === 0 ||
      hasSomeRole(user, normalizedAllowedRoles)
    ) {
      setAllowed(true);
      setReady(true);
      return;
    }

    setAllowed(false);
    setReady(true);
  }, [router, pathname, normalizedAllowedRoles]);

  if (!ready) {
    return (
      <div style={loadingWrap}>
        <div style={loadingCard}>Carregando acesso...</div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={blockedWrap}>
        <div style={blockedCard}>
          <div style={blockedBadge}>Acesso restrito</div>
          <h2 style={blockedTitle}>Você não tem permissão para acessar esta área.</h2>
          <p style={blockedText}>
            Essa página está disponível apenas para perfis autorizados.
          </p>
          <button style={blockedButton} onClick={() => router.push(fallbackPath)}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return children;
}

const loadingWrap = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 240,
};

const loadingCard = {
  padding: 16,
  borderRadius: 14,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  color: "#475569",
  fontWeight: 700,
};

const blockedWrap = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "50vh",
};

const blockedCard = {
  maxWidth: 520,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 12px 28px rgba(15,23,42,.06)",
};

const blockedBadge = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  fontSize: 12,
  marginBottom: 12,
};

const blockedTitle = {
  margin: "0 0 8px",
  color: "#0f172a",
  fontSize: 24,
};

const blockedText = {
  margin: "0 0 18px",
  color: "#64748b",
  lineHeight: 1.6,
};

const blockedButton = {
  border: 0,
  background: "#2563eb",
  color: "#fff",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: 800,
  cursor: "pointer",
};
