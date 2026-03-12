const db = require("../config/db");

exports.getDashboard = async (req, res) => {
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
      SELECT SUM(carga_horaria) as horasTreinadas FROM treinamentos
    `);

    const [participantes] = await db.query(`
      SELECT SUM(participantes_presentes) as participantesTreinados FROM treinamentos
    `);

    const [conclusao] = await db.query(`
      SELECT 
      SUM(concluidos) / NULLIF(SUM(participantes_presentes),0) * 100 as taxaConclusao
      FROM treinamentos
    `);

    const [aproveitamento] = await db.query(`
      SELECT AVG(nota_prova) as mediaAproveitamento FROM avaliacoes
    `);

    res.json({
      treinamentos: treinamentos[0].totalTreinamentos || 0,
      usuarios: usuarios[0].totalUsuarios || 0,
      clientes: clientes[0].totalClientes || 0,
      horasTreinadas: horas[0].horasTreinadas || 0,
      participantes: participantes[0].participantesTreinados || 0,
      taxaConclusao: conclusao[0].taxaConclusao || 0,
      aproveitamento: aproveitamento[0].mediaAproveitamento || 0
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
};
