export async function listUsers(req, res) {
  return res.json([
    { nome: "Ramon Ciro", email: "admin@teltd.com", role: "COORDENADOR", cliente: "Global", ativo: true },
    { nome: "Paulo Silva", email: "paulo@teltd.com", role: "SUPERVISOR", cliente: "Claro", ativo: true }
  ]);
}
