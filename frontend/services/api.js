const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api"
).replace(/\/$/, "");

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

// Funções para gerenciar o ambiente/cliente selecionado no navegador
export function getSelectedClient() {
  if (typeof window === "undefined") return "dasa";
  return localStorage.getItem("client_id") || "dasa";
}

export function setSelectedClient(clientCode) {
  if (typeof window === "undefined") return;
  localStorage.setItem("client_id", clientCode);
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

  const normalizedAllowed = allowedRoles.map(normalizeRole);
  return userRoles.some((r) => normalizedAllowed.includes(r));
}

// Função central de requisição atualizada para enviar o ambiente atual (X-Client-ID)
export async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();
  const currentClient = getSelectedClient(); // Envia o ambiente selecionado (dasa, sebrae, cemig, igua)

  // FIX: quando o body é FormData (upload de arquivo), NÃO definir Content-Type.
  // O browser precisa calculá-lo automaticamente para incluir o boundary multipart.
  // Forçar "application/json" aqui sobrescreve o boundary e causa Erro 400 no multer.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(!isFormData && { "Content-Type": "application/json" }),
    "X-Client-ID": currentClient,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("Falha de conexão com a API.");
  }

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    if (data && typeof data === "object") {
      message = data.message || data.error || message;
    }
    throw new Error(message);
  }

  return data;
}

export async function apiDownload(path, filenameFallback = "arquivo.xlsx") {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();
  const currentClient = getSelectedClient();

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "X-Client-ID": currentClient,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(href);
  }

  return true;
}

export default API_URL;
