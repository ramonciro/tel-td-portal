import pool from "../db.js";

export const getDashboard = async (req, res) => {
  try {
    const [treinamentos] = await pool.query(`
      SELECT COUNT(*) as totalTreinamentos FROM treinamentos
    `);

    const [usuarios] = await pool.query(`
      SELECT COUNT(*) as totalUsuarios FROM usuarios
    `);

    const [clientes] = await pool.query(`
      SELECT COUNT(*) as totalClientes FROM clientes
    `);

    const [horas] = await pool.query(`
      SELECT IFNULL(SUM(carga_horaria),0) as horasTreinadas FROM treinamentos
    `);

    const [participantes] = await pool.query(`
      SELECT IFNULL(SUM(participantes_presentes),0) as participantesTreinados FROM treinamentos
    `);

    const [conclusao] = await pool.query(`
      SELECT IFNULL((SUM(concluidos) / NULLIF(SUM(participantes_presentes),0)) * 100,0) as taxaConclusao
      FROM treinamentos
    `);

    const [aproveitamento] = await pool.query(`
      SELECT IFNULL(AVG(nota_prova),0) as mediaAproveitamento FROM avaliacoes
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
    console.error("Erro dashboard:", error);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
};
