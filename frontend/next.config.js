/** @type {import('next').NextConfig} */
// Marcador de versão no rodapé do menu (21/10/2026): data do build e commit do deploy.
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATA: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
    NEXT_PUBLIC_BUILD_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev",
  },
};

module.exports = nextConfig;
