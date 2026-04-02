const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function apiFetch(endpoint, options = {}) {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('token')
    : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      console.error('Não autorizado - token inválido ou expirado');

      // opcional: redireciona para login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }

      throw new Error('Não autorizado');
    }

    return response;
  } catch (error) {
    console.error('Erro na API:', error);
    throw error;
  }
}
