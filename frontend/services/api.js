// Recupera a URL do Railway das variáveis de ambiente do Vercel
// Certifique-se de que no Vercel não haja uma "/" no final da URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tel-td-portal-production.up.railway.app';

export async function apiFetch(endpoint, options = {}) {
  // 1. Tratamento de Token (Seguro para SSR/Build)
  // Durante o 'npm run build', o localStorage não existe. Essa trava evita o erro.
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // 2. Montagem da URL
  const url = `${API_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 3. Tratamento de Expiração de Sessão (401)
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      // Só redireciona se não estivermos já na tela de login para evitar loop
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    return response;
  } catch (error) {
    console.error(`Erro crítico na requisição [${endpoint}]:`, error);
    
    // Retorna um objeto fake para evitar que o .json() quebre a página
    return {
      ok: false,
      status: 500,
      json: async () => ([]),
    };
  }
}

/**
 * Helpers para facilitar as chamadas nas páginas
 */
export async function apiGet(endpoint) {
  const res = await apiFetch(endpoint, { method: 'GET' });
  return res.json();
}

export async function apiPost(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}
