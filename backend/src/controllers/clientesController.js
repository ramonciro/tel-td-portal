export async function listClientes(req, res) {
  return res.json([
    { nome: "Agibank" },
    { nome: "Mercantil" },
    { nome: "Crea" },
    { nome: "Buser" },
    { nome: "Rede Américas" },
    { nome: "Prefeitura de Salvador" },
    { nome: "Claro" },
    { nome: "Hugsnet" }
  ]);
}
