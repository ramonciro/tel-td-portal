const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
// LOGOUT / 401
// ==========================
function handleUnauthorized() {
  console.warn('Sessão expirada ou inválida');

  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

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

  const response = await fetch(`${API_URL}${endpoint}`, {
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
    console.error('Erro API:', text);
    throw new Error(`Erro ${response.status}`);
  }

  return response;
}

// ==========================
// HELPERS
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
