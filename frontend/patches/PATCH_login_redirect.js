// ─────────────────────────────────────────────────────────────────────────────
// PATCH: frontend/app/login/page.js (ou onde ocorre o redirect pós-login)
//
// Localizar o trecho que faz o redirect após login bem-sucedido.
// Geralmente é algo como:
//
//   router.push('/inicio');
//
// Substituir por:
// ─────────────────────────────────────────────────────────────────────────────

import { getRedirectPosLogin } from '@/lib/perfilUtils';

// Dentro do handleLogin / handleSubmit, após gravar o user no localStorage:
//
//   const user = await apiFetch('/api/login', { method: 'POST', body: ... });
//   localStorage.setItem('user', JSON.stringify(user));
//
// Substituir o router.push fixo por:

const destino = getRedirectPosLogin(user.perfil);
router.push(destino);

// ─────────────────────────────────────────────────────────────────────────────
// Resultado:
//   coordenador_rs → /rs/rps
//   gestor_rs      → /rs/rps
//   super_admin    → /inicio  (vê os dois módulos, entra pelo T&D)
//   instrutor      → /inicio
//   coordenador    → /inicio
//   supervisor     → /inicio
// ─────────────────────────────────────────────────────────────────────────────
