const db = require("../lib/db");
const { normalizarCpf } = require("../services/pessoasService");
const { CARGOS_ELEGIVEIS_PADRAO, CARGOS_ALMEJADOS_PADRAO, STATUS_OCUPAM_VAGA, lerLista } = require("./oficinaTalentosController");

// Oficina de Talentos — Fase 1: lado PÚBLICO (sem login). Duas rotas:
//   GET  /api/public/oficina/:token               → dados da turma p/ a página
//   POST /api/public/oficina/:token/inscricoes    → recebe a ficha
//
// Princípios de segurança (o backend não tinha nenhuma rota pública além do
// login, então tudo aqui é deliberadamente conservador):
//  - O TOKEN da turma define a empresa. Nada vem do cliente (req.empresaId aqui
//    é -1/null, pois não há JWT — nunca é usado).
//  - Matrícula + CPF são conferidos JUNTOS contra o cadastro único da empresa.
//    Nunca se cria pessoa nova por aqui: o que não casa fica "em conferência"
//    para a Metodologia decidir.
//  - Resposta NEUTRA: quem se inscreve não descobre se a matrícula/CPF existe
//    nem se foi confirmado ou ficou em conferência. Única distinção exposta é
//    "lista de espera", que depende só de vagas (informação já pública).
//  - Inscrição repetida (mesma turma + CPF) devolve a mesma resposta neutra,
//    sem criar nada.
//  - Honeypot (campo "website"): se vier preenchido, finge sucesso e descarta.
//  - Rate limit é aplicado na rota (ver oficinaTalentosPublicRoutes.js).

const ESCOLARIDADES = [
  "Ensino médio completo",
  "Superior em andamento",
  "Superior completo",
  "Pós-graduação em andamento",
  "Pós-graduação completa",
];

const MSG_RECEBIDA =
  "Inscrição recebida! A equipe de Metodologia vai conferir seus dados e entrar em contato pelo e-mail informado.";
const MSG_ESPERA =
  "As vagas desta turma estão preenchidas, mas sua inscrição entrou na lista de espera. Se abrir vaga, a equipe de Metodologia entra em contato pelo e-mail informado.";

function hojeLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function tokenValido(token) {
  return /^[a-f0-9]{36}$/.test(String(token || ""));
}

async function buscarTurmaPorToken(token, conn = db, travar = false) {
  const [rows] = await conn.query(
    `SELECT t.id, t.empresa_id, t.nome, t.descricao,
            DATE_FORMAT(t.data_inicio, '%Y-%m-%d') AS data_inicio,
            DATE_FORMAT(t.data_fim, '%Y-%m-%d') AS data_fim,
            t.horario, t.modalidade, t.local_nome, t.endereco, t.vagas,
            DATE_FORMAT(t.inscricoes_ate, '%Y-%m-%d') AS inscricoes_ate,
            t.status, t.cargos_elegiveis, t.cargos_almejados, t.carga_horaria_prevista
     FROM oficina_turmas t WHERE t.token = ? AND t.status <> 'rascunho' LIMIT 1${travar ? " FOR UPDATE" : ""}`,
    [token]
  );
  return rows[0] || null;
}

function inscricoesAbertas(turma) {
  if (turma.status !== "inscricoes_abertas") return false;
  if (turma.inscricoes_ate && hojeLocal() > turma.inscricoes_ate) return false;
  return true;
}

async function contarOcupadas(turmaId, conn = db) {
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM oficina_inscricoes WHERE turma_id = ? AND status IN (${STATUS_OCUPAM_VAGA.map(() => "?").join(",")})`,
    [turmaId, ...STATUS_OCUPAM_VAGA]
  );
  return Number(total);
}

async function obterTurmaPublica(req, res) {
  try {
    if (!tokenValido(req.params.token)) return res.status(404).json({ error: "Link de inscrição não encontrado." });

    const turma = await buscarTurmaPorToken(req.params.token);
    if (!turma) return res.status(404).json({ error: "Link de inscrição não encontrado." });

    const [modulos] = await db.query(
      `SELECT titulo, DATE_FORMAT(data, '%Y-%m-%d') AS data, hora_inicio, hora_fim, carga_horaria
       FROM oficina_modulos WHERE turma_id = ? ORDER BY ordem ASC, id ASC`,
      [turma.id]
    );

    const ocupadas = turma.vagas === null ? 0 : await contarOcupadas(turma.id);
    const vagasRestantes = turma.vagas === null ? null : Math.max(turma.vagas - ocupadas, 0);

    res.json({
      nome: turma.nome,
      descricao: turma.descricao,
      data_inicio: turma.data_inicio,
      data_fim: turma.data_fim,
      horario: turma.horario,
      modalidade: turma.modalidade,
      local_nome: turma.local_nome,
      endereco: turma.endereco,
      carga_horaria_prevista: turma.carga_horaria_prevista === null ? null : Number(turma.carga_horaria_prevista),
      modulos: modulos.map((m) => ({ ...m, carga_horaria: m.carga_horaria === null ? null : Number(m.carga_horaria) })),
      vagas_restantes: vagasRestantes,
      inscricoes_abertas: inscricoesAbertas(turma),
      lista_espera: vagasRestantes === 0,
      cargos_elegiveis: lerLista(turma.cargos_elegiveis, CARGOS_ELEGIVEIS_PADRAO),
      cargos_almejados: lerLista(turma.cargos_almejados, CARGOS_ALMEJADOS_PADRAO),
      escolaridades: ESCOLARIDADES,
    });
  } catch (error) {
    console.error("[oficina-publico] obterTurmaPublica:", error);
    res.status(500).json({ error: "Não foi possível carregar a página de inscrição." });
  }
}

function cpfValido(cpf) {
  if (!cpf || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

const semZeros = (v) => String(v || "").trim().replace(/^0+/, "").toLowerCase();
const mesmoTexto = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

function texto(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

async function inscrever(req, res) {
  const body = req.body || {};

  try {
    if (!tokenValido(req.params.token)) return res.status(404).json({ error: "Link de inscrição não encontrado." });

    // Honeypot: robô preencheu o campo escondido → resposta de sucesso, nada gravado.
    if (texto(body.website, 200)) return res.json({ ok: true, situacao: "recebida", mensagem: MSG_RECEBIDA });

    const turmaPrevia = await buscarTurmaPorToken(req.params.token);
    if (!turmaPrevia) return res.status(404).json({ error: "Link de inscrição não encontrado." });
    if (!inscricoesAbertas(turmaPrevia)) {
      return res.status(409).json({ error: "As inscrições desta turma não estão abertas no momento." });
    }

    const eligiveis = lerLista(turmaPrevia.cargos_elegiveis, CARGOS_ELEGIVEIS_PADRAO);
    const almejados = lerLista(turmaPrevia.cargos_almejados, CARGOS_ALMEJADOS_PADRAO);

    // ── validação da ficha ──────────────────────────────────────────────
    const nome = texto(body.nome, 255);
    const email = texto(body.email, 255).toLowerCase();
    const cpf = normalizarCpf(body.cpf);
    const matricula = texto(body.matricula, 100);
    const escolaridade = texto(body.escolaridade, 80);
    const horarioTrabalho = texto(body.horario_trabalho, 120);
    let cargoAtual = texto(body.cargo_atual, 150);
    const cargoAtualOutro = texto(body.cargo_atual_outro, 120);
    const cargoAlmejado = texto(body.cargo_almejado, 150);
    const cargoAlmejadoOutro = texto(body.cargo_almejado_outro, 150);

    if (nome.length < 3) return res.status(400).json({ error: "Informe seu nome completo." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Informe um e-mail válido." });
    if (!cpf || !cpfValido(cpf)) return res.status(400).json({ error: "CPF inválido. Confira os 11 números." });
    if (!matricula) return res.status(400).json({ error: "Informe sua matrícula." });
    if (!ESCOLARIDADES.includes(escolaridade)) return res.status(400).json({ error: "Selecione sua escolaridade." });
    if (!horarioTrabalho) return res.status(400).json({ error: "Informe seu horário de trabalho." });

    const opcoesCargoAtual = [...eligiveis, "Outro"];
    if (!opcoesCargoAtual.some((c) => mesmoTexto(c, cargoAtual))) {
      return res.status(400).json({ error: "Selecione seu cargo atual." });
    }
    if (mesmoTexto(cargoAtual, "Outro")) {
      if (!cargoAtualOutro) return res.status(400).json({ error: "Informe qual é o seu cargo atual." });
      cargoAtual = `Outro: ${cargoAtualOutro}`;
    }

    if (!almejados.some((c) => mesmoTexto(c, cargoAlmejado))) {
      return res.status(400).json({ error: "Selecione o cargo que você almeja." });
    }
    if (mesmoTexto(cargoAlmejado, "Outro") && !cargoAlmejadoOutro) {
      return res.status(400).json({ error: "Informe qual cargo você almeja." });
    }

    if (body.aceite !== true) {
      return res.status(400).json({ error: "É necessário concordar com o uso dos dados para a inscrição." });
    }

    // ── gravação (transação com trava na turma para não estourar vagas) ──
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const turma = await buscarTurmaPorToken(req.params.token, conn, true);
      if (!turma || !inscricoesAbertas(turma)) {
        await conn.rollback();
        return res.status(409).json({ error: "As inscrições desta turma não estão abertas no momento." });
      }

      const [jaExiste] = await conn.query(`SELECT id FROM oficina_inscricoes WHERE turma_id = ? AND cpf = ? LIMIT 1`, [
        turma.id,
        cpf,
      ]);
      if (jaExiste.length) {
        await conn.rollback();
        return res.json({ ok: true, situacao: "recebida", mensagem: MSG_RECEBIDA });
      }

      // Conferência com o cadastro único: CPF + matrícula juntos, dentro da empresa da turma.
      let pessoaId = null;
      let vinculo = null;
      let motivo = null;

      const [porCpf] = await conn.query(`SELECT id, matricula FROM pessoas WHERE empresa_id = ? AND cpf = ? LIMIT 1`, [
        turma.empresa_id,
        cpf,
      ]);

      if (porCpf.length) {
        if (!porCpf[0].matricula) {
          motivo = "Cadastro encontrado pelo CPF, mas sem matrícula para conferir.";
        } else if (semZeros(porCpf[0].matricula) !== semZeros(matricula)) {
          motivo = "Matrícula informada difere da matrícula do cadastro.";
        } else {
          pessoaId = porCpf[0].id;
          vinculo = "matricula_cpf";
        }
      } else {
        const [porMatricula] = await conn.query(
          `SELECT id, cpf FROM pessoas WHERE empresa_id = ? AND matricula = ? LIMIT 1`,
          [turma.empresa_id, matricula]
        );
        motivo = porMatricula.length
          ? "Matrícula existe no cadastro com outro CPF."
          : "Matrícula e CPF não localizados no cadastro.";
      }

      if (!eligiveis.some((c) => mesmoTexto(c, cargoAtual))) {
        motivo = motivo ? `${motivo} Cargo atual fora da lista elegível.` : "Cargo atual fora da lista elegível.";
      }

      let usuarioId = null;
      if (pessoaId) {
        try {
          const [usr] = await conn.query(`SELECT id FROM usuarios WHERE pessoa_id = ? AND empresa_id = ? LIMIT 1`, [
            pessoaId,
            turma.empresa_id,
          ]);
          usuarioId = usr[0]?.id ?? null;
        } catch (e) {
          // vínculo com a conta é um bônus; nunca derruba a inscrição
        }
      }

      const ocupadas = turma.vagas === null ? 0 : await contarOcupadas(turma.id, conn);
      const semVaga = turma.vagas !== null && ocupadas >= turma.vagas;

      let status = pessoaId && !motivo ? "confirmado" : "em_conferencia";
      if (semVaga) status = "lista_espera";

      await conn.query(
        `INSERT INTO oficina_inscricoes
          (turma_id, empresa_id, pessoa_id, usuario_id, nome, email, cpf, matricula, escolaridade, horario_trabalho,
           cargo_atual, cargo_almejado, cargo_almejado_outro, status, vinculo, motivo_conferencia, consentimento_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          turma.id,
          turma.empresa_id,
          pessoaId,
          usuarioId,
          nome,
          email,
          cpf,
          matricula,
          escolaridade,
          horarioTrabalho,
          cargoAtual,
          cargoAlmejado,
          mesmoTexto(cargoAlmejado, "Outro") ? cargoAlmejadoOutro : null,
          status,
          vinculo,
          motivo,
        ]
      );

      await conn.commit();

      return res.status(201).json(
        semVaga
          ? { ok: true, situacao: "lista_espera", mensagem: MSG_ESPERA }
          : { ok: true, situacao: "recebida", mensagem: MSG_RECEBIDA }
      );
    } catch (error) {
      await conn.rollback();
      if (error && error.code === "ER_DUP_ENTRY") {
        return res.json({ ok: true, situacao: "recebida", mensagem: MSG_RECEBIDA });
      }
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("[oficina-publico] inscrever:", error);
    res.status(500).json({ error: "Não foi possível registrar sua inscrição agora. Tente novamente em instantes." });
  }
}

module.exports = { obterTurmaPublica, inscrever };
