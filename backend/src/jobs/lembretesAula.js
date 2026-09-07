/**
 * lembretesAula.js
 *
 * Fase 2 do roadmap de competitividade ("vitórias rápidas") — lembrete de
 * aula do dia seguinte para instrutores. Consulta o cronograma real
 * (turma_aulas) para amanhã e agrupa por instrutor responsável.
 *
 * turma_aulas.instrutor_responsavel é um campo de texto livre (não há FK
 * para usuarios — mesmo padrão já usado em capacidadeResolver/
 * desempenhoInstrutorResolver, que também casam por nome). O e-mail de
 * destino é resolvido casando esse nome com usuarios.nome; instrutores sem
 * usuário correspondente (ou sem e-mail cadastrado) entram em `semEmail`
 * no retorno, para visibilidade — não interrompem o envio aos demais.
 */

const pool = require("../lib/db");
const { sendMail } = require("../services/mailer");

function amanhaISO() {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

async function buscarAulasDeAmanha() {
  const data = amanhaISO();
  const [rows] = await pool.query(
    `SELECT ta.id, ta.instrutor_responsavel, ta.titulo,
            t.tema, t.cliente, t.id AS treinamento_id
     FROM turma_aulas ta
     JOIN treinamentos t ON t.id = ta.treinamento_id
     WHERE ta.data_aula = ?
       AND ta.status_execucao NOT IN ('cancelada', 'ministrada')
       AND ta.instrutor_responsavel IS NOT NULL
       AND TRIM(ta.instrutor_responsavel) <> ''`,
    [data]
  );
  return { data, aulas: rows };
}

function agruparPorInstrutor(aulas) {
  const mapa = new Map();
  for (const aula of aulas) {
    const chave = aula.instrutor_responsavel.trim();
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(aula);
  }
  return mapa;
}

async function buscarEmailInstrutor(nomeInstrutor) {
  const [rows] = await pool.query(
    "SELECT email FROM usuarios WHERE ativo = 1 AND LOWER(TRIM(nome)) = LOWER(?) LIMIT 1",
    [nomeInstrutor.trim()]
  );
  return rows[0]?.email || null;
}

function montarHtml(nomeInstrutor, dataFormatada, aulas) {
  const itens = aulas
    .map((a) => `<li>${a.tema} — ${a.cliente}${a.titulo ? ` (${a.titulo})` : ""}</li>`)
    .join("");
  return `
    <p>Olá, ${nomeInstrutor}!</p>
    <p>Você tem ${aulas.length === 1 ? "uma aula agendada" : `${aulas.length} aulas agendadas`} para amanhã (${dataFormatada}):</p>
    <ul style="padding-left:18px;color:#334155;font-size:13.5px;line-height:1.6;">${itens}</ul>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">E-mail automático — Portal T&amp;D.</p>
  `;
}

async function rodarLembretesAula() {
  const { data, aulas } = await buscarAulasDeAmanha();
  const dataFormatada = data.split("-").reverse().join("/");

  if (!aulas.length) {
    return { data, instrutoresNotificados: 0, semEmail: [] };
  }

  const porInstrutor = agruparPorInstrutor(aulas);
  let notificados = 0;
  const semEmail = [];

  for (const [nomeInstrutor, aulasInstrutor] of porInstrutor) {
    // eslint-disable-next-line no-await-in-loop
    const email = await buscarEmailInstrutor(nomeInstrutor);
    if (!email) {
      semEmail.push(nomeInstrutor);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await sendMail({
      to: email,
      subject: `[Portal T&D] Você tem aula amanhã (${dataFormatada})`,
      html: montarHtml(nomeInstrutor, dataFormatada, aulasInstrutor),
    });
    notificados += 1;
  }

  return { data, instrutoresNotificados: notificados, semEmail };
}

module.exports = { rodarLembretesAula };
