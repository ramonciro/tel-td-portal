import db from "../config/db.js";

export const getDashboard = async (req, res) => {
  try {

    const [treinamentos] = await db.query(`
      SELECT COUNT(*) as totalTreinamentos FROM treinamentos
    `);

    const [usuarios] = await db.query(`
      SELECT COUNT(*) as totalUsuarios FROM usuarios
    `);

    const [clientes] = await db.query(`
      SELECT COUNT(*) as totalClientes FROM clientes
    `);

    const [horas] = await db.query(`
      SELECT IFNULL(SUM(carga_horaria),0) as horasTreinadas FROM treinamentos
    `);

    const [participantes] = await db.query(`
      SELECT IFNULL(SUM(participantes_presentes),0) as participantesTreinados FROM treinamentos
    `);

    const [conclusao] = await db.query(`
      SELECT 
      IFNULL((SUM(concluidos) / NULLIF(SUM(participantes_presentes),0)) * 100,0) as taxaConclusao
      FROM treinamentos
    `);

    const [aproveitamento] = await db.query(`
      SELECT IFNULL(AVG(nota_prova),0) as mediaAproveitamento FROM avaliacoes
    `);

    res.json({
      treinamentos: treinamentos[0].totalTreinamentos,
      usuarios: usuarios[0].totalUsuarios,
      clientes: clientes[0].totalClientes,
      horasTreinadas: horas[0].horasTreinadas,
      participantes: participantes[0].participantesTreinados,
      taxaConclusao: conclusao[0].taxaConclusao,
      aproveitamento: aproveitamento[0].mediaAproveitamento
    });

  } catch (error) {
    console.error("Erro dashboard:", error);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
};
