const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api";

export default API_URL;

export async function apiFetch(path, options = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error(data?.message || "Erro na requisição");
  }

  return data;
}

export function storeUserSession(token, user) {
  if (typeof window === "undefined") return;

  if (token) {
    localStorage.setItem("token", token);
  }

  localStorage.setItem("user", JSON.stringify(user));
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function hasSomeRole(user, roles = []) {
  if (!user) return false;

  const perfil = String(user.perfil || "").toLowerCase();
  return roles.map((r) => String(r).toLowerCase()).includes(perfil);
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("token");
}

export function logout(router) {
  clearSession();
  if (router) router.push("/login");
}
