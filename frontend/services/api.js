const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function handleUnauthorized() {
  console.warn('Sessão expirada');

  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');

    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }
}

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

export async function apiGet(endpoint) {
  const res = await apiFetch(endpoint);
  return res.json();
}

export async function apiPost(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res.json();
}
