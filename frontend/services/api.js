const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ==========================
// HELPERS DE TOKEN E USUÁRIO
// ==========================
export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// ==========================
// TRATAMENTO DE LOGOUT
// ==========================
function handleUnauthorized() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }
}

// ==========================
// FUNÇÃO BASE (apiFetch)
// ==========================
export async function apiFetch(endpoint, options = {}) {
  // PROTEÇÃO PARA O BUILD DO VERCEL
  // Se estiver a compilar e não tiver URL, retorna resposta vazia para não quebrar o build
  if (!API_URL && typeof window === 'undefined') {
    return new Response(JSON.stringify({}), { status: 200 });
  }

  const token = getToken();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      handleUnauthorized();
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 });
    }

    return response;
  } catch (error) {
    console.error("Erro na chamada da API:", error);
    // Retorna um fallback para evitar crash no build das rotas
    return new Response(JSON.stringify({}), { status: 200 });
  }
}

// ==========================
// MÉTODOS AUXILIARES
// ==========================
export async function apiGet(endpoint) {
  const res = await apiFetch(endpoint, { method: 'GET' });
  return res.json();
}

export async function apiPost(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function apiPut(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function apiDelete(endpoint) {
  const res = await apiFetch(endpoint, { method: 'DELETE' });
  return res.json();
}

export default API_URL;
