/**
 * sequenciaController.js — "Sequência de chamadas em dia" do instrutor (21/10/2026)
 *
 * GET /api/minha-sequencia  (perfil instrutor)
 *
 * Conta quantos DIAS DE AULA seguidos o instrutor teve com a chamada lançada.
 * Só olha dias em que ele tinha aula (fim de semana, feriado e dia sem aula não
 * quebram nem somam). Um dia fica "em dia" quando todas as aulas daquela data, nas
 * turmas dele, têm chamada lançada. A aula de HOJE ainda sem chamada não quebra a
 * sequência (ainda dá tempo) — só aparece como "falta lançar hoje".
 * Turmas canceladas ficam de fora. Nada é gravado: é cálculo sobre turma_aulas e
 * presenca_aulas, que já existem.
 */
const db = require("../lib/db");

const JANELA_DIAS = 120;
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
const somarDias = (iso, d) => {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

async function minhaSequencia(req, res) {
  try {
    const nome = String(req.user?.nome || "").trim();
    if (!nome) return res.json({ ok: true, aplicavel: false });
    const hoje = hojeISO();
    const desde = somarDias(hoje, -JANELA_DIAS);
    const params = [nome.toLowerCase(), desde, hoje];
    let tenant = "";
    if (req.empresaId) { tenant = " AND t.empresa_id = ?"; params.push(req.empresaId); }

    const [aulas] = await db.query(
      `SELECT DATE_FORMAT(a.data_aula, '%Y-%m-%d') AS dia, a.id,
              EXISTS(SELECT 1 FROM presenca_aulas p WHERE p.turma_aula_id = a.id) AS lancada
         FROM turma_aulas a
         JOIN treinamentos t ON t.id = a.treinamento_id
        WHERE LOWER(TRIM(t.instrutor)) = ?
          AND a.data_aula BETWEEN ? AND ?
          AND LOWER(COALESCE(t.status, '')) NOT IN ('cancelada','cancelado')
          AND COALESCE(a.status_execucao, '') <> 'cancelada'${tenant}`,
      params
    );

    // dia → todas as aulas lançadas?
    const dias = new Map();
    for (const a of aulas) {
      const d = dias.get(a.dia) || { total: 0, lancadas: 0 };
      d.total += 1; d.lancadas += Number(a.lancada) ? 1 : 0;
      dias.set(a.dia, d);
    }
    const ordenados = [...dias.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1)); // mais recente primeiro
    let faltaHoje = 0;
    const passados = [];
    for (const [dia, d] of ordenados) {
      if (dia === hoje) { faltaHoje = d.total - d.lancadas; if (faltaHoje === 0) passados.push([dia, true]); continue; }
      passados.push([dia, d.lancadas === d.total]);
    }

    let atual = 0;
    for (const [, ok] of passados) { if (ok) atual += 1; else break; }
    let melhor = 0, corrida = 0;
    for (const [, ok] of [...passados].reverse()) { corrida = ok ? corrida + 1 : 0; melhor = Math.max(melhor, corrida); }
    const ultimoFalho = passados.find(([, ok]) => !ok);

    res.json({
      ok: true,
      aplicavel: ordenados.length > 0,
      sequencia: atual,
      melhor_sequencia: melhor,
      falta_lancar_hoje: faltaHoje,
      ultimo_dia_sem_chamada: ultimoFalho ? ultimoFalho[0] : null,
      dias_com_aula: ordenados.length,
      janela_dias: JANELA_DIAS,
    });
  } catch (e) {
    console.error("[sequencia] minhaSequencia:", e);
    res.status(500).json({ ok: false, error: "Não foi possível calcular sua sequência agora." });
  }
}

module.exports = { minhaSequencia };
