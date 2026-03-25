const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api"
).replace(/\/$/, "");

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
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
    throw new Error(message);
  }

  return data;
}

export default apiFetch;
