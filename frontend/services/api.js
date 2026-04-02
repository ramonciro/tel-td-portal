const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ==========================
// TOKEN & USER HELPERS
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
// TRATAMENTO DE SESSÃO
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
// CORE FETCH (O coração da comunicação)
// ==========================
export async function apiFetch(endpoint, options = {}) {
  // Proteção para o Build do Vercel: Se não houver URL e for build, não trava
  if (!API_URL && typeof window === 'undefined') {
    console.warn(`Aviso: NEXT_PUBLIC_API_URL não definida para o endpoint ${endpoint}`);
    return new Response(JSON.stringify({}), { status: 200 }); 
  }

  const token = getToken();
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
    throw new Error('Sessão expirada');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro API (${response.status}): ${errorText}`);
  }

  return response;
}

// ==========================
// MÉTODOS SIMPLIFICADOS
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

export default API_URL;
