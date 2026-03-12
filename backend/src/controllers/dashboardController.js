import pool from "../db.js";

async function countOrZero(sql) {
  const [[row]] = await pool.query(sql);
  return Number(row.total || 0);
}

export async function getDashboard(req, res) {
  try {
    const totalClientes = await countOrZero("SELECT COUNT(*) AS total FROM clientes");
    const totalUsuarios = await countOrZero("SELECT COUNT(*) AS total FROM usuarios");
    const totalTreinamentos = await countOrZero("SELECT COUNT(*) AS total FROM treinamentos");
    const totalPresencas = await countOrZero("SELECT COUNT(*) AS total FROM presencas");
    const totalAvaliacoes = await countOrZero("SELECT COUNT(*) AS total FROM avaliacoes");

    let totalMateriaisAvaliativos = 0;
    try {
      totalMateriaisAvaliativos = await countOrZero("SELECT COUNT(*) AS total FROM materiais_avaliativos");
    } catch {}

    const [[npsRow]] = await pool.query("SELECT COALESCE(ROUND(AVG(nota_nps), 1), 0) AS media FROM avaliacoes");
    const [[qualidadeRow]] = await pool.query("SELECT COALESCE(ROUND(AVG(nota_qualidade), 1), 0) AS media FROM avaliacoes");
    const [[assiduidadeRow]] = await pool.query(`
      SELECT COALESCE(
        ROUND((SUM(CASE WHEN presente = TRUE THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(*), 0), 1),
        0
      ) AS media
      FROM presencas
    `);

    const [treinamentosRecentes] = await pool.query(`
      SELECT id, tema, cliente, instrutor, status
      FROM treinamentos
      ORDER BY id DESC
      LIMIT 10
    `);

    return res.json({
      totalClientes,
      totalUsuarios,
      totalTreinamentos,
      totalPresencas,
      totalAvaliacoes,
      totalMateriaisAvaliativos,
      npsMedio: Number(npsRow.media || 0),
      qualidadeMedia: Number(qualidadeRow.media || 0),
      assiduidadeMedia: Number(assiduidadeRow.media || 0),
      treinamentosRecentes
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao carregar dashboard", error: error.message });
  }
}
