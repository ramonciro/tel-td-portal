const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://tel-td-portal-production.up.railway.app/api";

export default API_URL;


/*
----------------------------------------------------
Função padrão para chamadas da API
----------------------------------------------------
*/

export async function apiFetch(path, options = {}) {

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token")
      : null;

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



/*
----------------------------------------------------
Salvar usuário após login
----------------------------------------------------
*/

export function storeUserSession(token, user) {

  if (typeof window === "undefined") return;

  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));

}



/*
----------------------------------------------------
Recuperar usuário salvo
----------------------------------------------------
*/

export function getStoredUser() {

  if (typeof window === "undefined") return null;

  try {

    const raw = localStorage.getItem("user");

    return raw ? JSON.parse(raw) : null;

  } catch {

    return null;

  }

}



/*
----------------------------------------------------
Remover sessão (logout)
----------------------------------------------------
*/

export function clearSession() {

  if (typeof window === "undefined") return;

  localStorage.removeItem("token");
  localStorage.removeItem("user");

}



/*
----------------------------------------------------
Verificar se usuário possui algum perfil
----------------------------------------------------
*/

export function hasSomeRole(user, roles = []) {

  if (!user) return false;

  const perfil = String(user.perfil || "").toLowerCase();

  return roles
    .map((r) => String(r).toLowerCase())
    .includes(perfil);

}



/*
----------------------------------------------------
Verificar se usuário está autenticado
----------------------------------------------------
*/

export function isAuthenticated() {

  if (typeof window === "undefined") return false;

  const token = localStorage.getItem("token");

  return !!token;

}



/*
----------------------------------------------------
Logout rápido
----------------------------------------------------
*/

export function logout(router) {

  clearSession();

  if (router) {
    router.push("/login");
  }

}
