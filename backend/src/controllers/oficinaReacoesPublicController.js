/**
 * oficinaReacoesPublicController.js — avaliação dos módulos pelo participante (21/10/2026)
 *
 * Rotas SEM login, no mesmo espírito da inscrição pública da Oficina:
 *   POST /api/public/oficina/:token/reacoes/consultar  { cpf, matricula }
 *   POST /api/public/oficina/:token/reacoes            { cpf, matricula, modulo_id, nota, comentario }
 *
 * Quem avalia se identifica por CPF + matrícula (POST, nunca na URL) e só pode avaliar
 * módulos em que foi credenciado (presença registrada). Resposta neutra: se os dados não
 * casam com uma participação confirmada, a mensagem é a mesma, sem dizer o que falhou.
 * A gestão só vê médias e comentários — o nome de quem avaliou nunca é exibido.
 */
const db = require("../lib/db");
const { normalizarCpf } = require("../services/pessoasService");

const MSG_NAO_ENCONTRADO = "Não encontramos uma participação confirmada com esses dados. Confira CPF e matrícula.";
const semZeros = (v) => String(v || "").trim().replace(/^0+/, "").toLowerCase();
const tokenValido = (t) => /^[a-f0-9]{36}$/.test(String(t || ""));
const hojeLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });

async function identificar(token, body) {
  if (!tokenValido(token)) return null;
  const cpf = normalizarCpf(body?.cpf);
  const matricula = String(body?.matricula || "").trim();
  if (!cpf || !matricula) return null;
  const [rows] = await db.query(
    `SELECT i.id AS inscricao_id, i.nome, i.matricula, i.turma_id, i.empresa_id, t.nome AS turma_nome
       FROM oficina_turmas t
       JOIN oficina_inscricoes i ON i.turma_id = t.id
      WHERE t.token = ? AND t.status <> 'rascunho' AND i.cpf = ? AND i.status IN ('confirmado','concluido') LIMIT 1`,
    [token, cpf]
  );
  const r = rows[0];
  if (!r || semZeros(r.matricula) !== semZeros(matricula)) return null;
  return r;
}

async function modulosAvaliaveis(pessoa) {
  const [mods] = await db.query(
    `SELECT m.id, m.ordem, m.titulo, DATE_FORMAT(m.data, '%Y-%m-%d') AS data,
            (SELECT nota FROM oficina_reacoes r WHERE r.modulo_id = m.id AND r.inscricao_id = ?) AS nota
       FROM oficina_modulos m
       JOIN oficina_presencas p ON p.modulo_id = m.id AND p.inscricao_id = ?
      WHERE m.turma_id = ? ORDER BY m.ordem, m.id`,
    [pessoa.inscricao_id, pessoa.inscricao_id, pessoa.turma_id]
  );
  return mods.map((m) => ({ id: m.id, titulo: m.titulo, data: m.data, nota: m.nota === null ? null : Number(m.nota) }));
}

async function consultar(req, res) {
  try {
    const pessoa = await identificar(req.params.token, req.body);
    if (!pessoa) return res.status(404).json({ error: MSG_NAO_ENCONTRADO });
    res.json({
      participante: String(pessoa.nome || "").split(" ")[0],
      turma: pessoa.turma_nome,
      modulos: await modulosAvaliaveis(pessoa),
    });
  } catch (e) {
    console.error("[oficina/reacoes] consultar:", e);
    res.status(500).json({ error: "Não foi possível carregar seus módulos agora." });
  }
}

async function enviar(req, res) {
  try {
    const pessoa = await identificar(req.params.token, req.body);
    if (!pessoa) return res.status(404).json({ error: MSG_NAO_ENCONTRADO });
    const moduloId = Number(req.body?.modulo_id);
    const nota = Number(req.body?.nota);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) return res.status(400).json({ error: "Escolha uma nota de 1 a 5." });
    const comentario = String(req.body?.comentario || "").trim().slice(0, 500) || null;
    const permitidos = await modulosAvaliaveis(pessoa);
    if (!permitidos.some((m) => m.id === moduloId)) {
      return res.status(403).json({ error: "Você só pode avaliar módulos em que sua presença foi registrada." });
    }
    await db.query(
      `INSERT INTO oficina_reacoes (empresa_id, turma_id, modulo_id, inscricao_id, nota, comentario)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE nota = VALUES(nota), comentario = VALUES(comentario)`,
      [pessoa.empresa_id, pessoa.turma_id, moduloId, pessoa.inscricao_id, nota, comentario]
    );
    res.json({ ok: true, mensagem: "Obrigado! Sua avaliação foi registrada." });
  } catch (e) {
    console.error("[oficina/reacoes] enviar:", e);
    res.status(500).json({ error: "Não foi possível registrar sua avaliação agora." });
  }
}

module.exports = { consultar, enviar };
