export async function getDashboard(req, res) {
  return res.json({
    assiduidade: "93,4%",
    nps: "71",
    qualidade: "4,6/5",
    engajamento: "88%",
    treinamentosHoje: [
      { cliente: "Mercantil", tema: "Onboarding Comercial", instrutor: "Juliana Costa", status: "Em andamento" },
      { cliente: "Claro", tema: "Reciclagem de Argumentação", instrutor: "Paulo Silva", status: "Agendado" }
    ]
  });
}
