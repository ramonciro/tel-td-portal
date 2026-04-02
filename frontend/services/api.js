const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default API_URL;

// ==========================
// TOKEN
// ==========================
export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

// ==========================
// USER
// ==========================
export function getStoredUser() {
  if (typeof window === 'undefined') return null;

  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// ==========================
// LOGOUT / 401 (Sessão Expirada)
// ==========================
function handleUnauthorized() {
  console.warn('Sessão expirada ou inválida');

  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Redireciona para o login se não estiver lá
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }
}

// ==========================
// FETCH BASE
// ==========================
export async function apiFetch(endpoint, options = {}) {
  const token = getToken();

  // Garante que o endpoint comece com /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

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
    throw new Error('Não autorizado');
  }

  if (!response.ok) {
    const text = await response.text();
    console.error('Erro na resposta da API:', text);
    throw new Error(`Erro ${response.status}: ${text}`);
  }

  return response;
}

// ==========================
// HELPERS (Para facilitar o uso)
// ==========================
export async function apiGet(endpoint) {
  const res = await apiFetch(endpoint, {
    method: 'GET'
  });
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
  const res = await apiFetch(endpoint, {
    method: 'DELETE'
  });
  return res.json();
}
