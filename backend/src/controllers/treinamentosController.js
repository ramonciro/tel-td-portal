export async function listTreinamentos(req, res) {
  return res.json([
    { tema: "Onboarding Comercial", cliente: "Mercantil", instrutor: "Juliana Costa", status: "EM_ANDAMENTO" },
    { tema: "Reciclagem de Argumentação", cliente: "Claro", instrutor: "Paulo Silva", status: "AGENDADO" }
  ]);
}
