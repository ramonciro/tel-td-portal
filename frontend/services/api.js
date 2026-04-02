const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api"
).replace(/\/$/, "");

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
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

function normalizeRole(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function hasOceanAccess(user) {
  const perfil = normalizeRole(user?.perfil);
  const allowed = ["coordenador", "superintendente"];
  return allowed.includes(perfil) && Number(user?.pode_acessar_oceano_desenvolvimento || 0) === 1;
}

export function hasSomeRole(user, allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || !allowedRoles.length) return true;

  const userRoles = [
    user?.perfil,
    user?.role,
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ]
    .map(normalizeRole)
    .filter(Boolean);

  const allowed = allowedRoles.map(normalizeRole).filter(Boolean);

  return allowed.some((role) => userRoles.includes(role));
}

export async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
      body: options.body,
    });
  } catch (error) {
    throw new Error(
      "Falha de conexão com a API. Verifique a URL da API, CORS ou indisponibilidade do servidor."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let data;
  try {
    data = isJson ? await response.json() : await response.text();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (isJson && (data?.message || data?.error)) ||
      (typeof data === "string" && data) ||
      `Erro ${response.status}`;

    if (response.status === 401) {
      clearSession();
    }

    throw new Error(message);
  }

  return data;
}

export default API_URL;


export async function apiDownload(path, filenameFallback = "arquivo.xlsx") {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();

  let response;
  try {
    response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error("Falha de conexão com a API durante o download.");
  }

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        message = data?.message || data?.error || message;
      } else {
        const text = await response.text();
        if (text) message = text;
      }
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || filenameFallback;

  if (typeof window !== "undefined") {
    const href = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(href);
  }

  return true;
}
