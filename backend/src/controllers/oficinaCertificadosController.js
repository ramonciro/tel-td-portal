const crypto = require("crypto");
const db = require("../lib/db");
const { buscarTurma, carregarModulos, filtroTenant } = require("./oficinaTalentosController");
const { cargoAlmejadoRotulo } = require("./oficinaIndicadoresController");

// Oficina de Talentos — Fase 2: presença (credenciamento) por módulo, lista de
// frequência, elegibilidade e certificados. Regra do Ramon (13/10/2026): o
// certificado exige participação + presença + carga horária. A presença mínima
// é configurável por turma (oficina_turmas.presenca_minima, padrão 100%).
//
// Como a frequência é calculada:
//  - Cada módulo da grade "pesa" a sua carga horária. Se NENHUM módulo tem
//    carga horária preenchida, cada módulo pesa 1 (frequência por nº de módulos).
//  - percentual = peso dos módulos em que a pessoa foi credenciada ÷ peso total × 100.
//  - Elegível = inscrição confirmada (ou já concluída), grade com pelo menos um
//    módulo, percentual > 0 e percentual ≥ presença mínima da turma.
//  - Só quem está "confirmado" (ou "concluído") entra na lista de presença:
//    em conferência/lista de espera ainda não são participantes.

const STATUS_PARTICIPANTE = ["confirmado", "concluido"];

function pesosDosModulos(modulos) {
  const temCh = modulos.some((m) => Number(m.carga_horaria) > 0);
  return modulos.map((m) => ({ id: m.id, peso: temCh ? Number(m.carga_horaria) || 0 : 1 }));
}

function calcularFrequencia(pesos, idsPresentes) {
  const total = pesos.reduce((a, p) => a + p.peso, 0);
  const presente = pesos.filter((p) => idsPresentes.has(p.id)).reduce((a, p) => a + p.peso, 0);
  const percentual = total > 0 ? Math.round((presente / total) * 10000) / 100 : 0;
  return { percentual, peso_presente: presente, peso_total: total };
}

function elegivel(percentual, presencaMinima, temModulos) {
  return temModulos && percentual > 0 && percentual + 1e-9 >= Number(presencaMinima);
}

// Código público do certificado: "OT-" + 10 caracteres sem letras/números ambíguos.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function gerarCodigo() {
  const bytes = crypto.randomBytes(10);
  let c = "";
  for (let i = 0; i < 10; i++) c += ALFABETO[bytes[i] % ALFABETO.length];
  return `OT-${c}`;
}

async function carregarParticipantes(turmaId) {
  const [rows] = await db.query(
    `SELECT i.id, i.nome, i.matricula, i.cpf, i.status, i.pessoa_id,
            i.cargo_almejado, i.cargo_almejado_outro, i.cargo_promovido, i.promocao_obs,
            DATE_FORMAT(i.promovido_em, '%Y-%m-%d') AS promovido_em,
            c.id AS certificado_id, c.codigo AS certificado_codigo
     FROM oficina_inscricoes i
     LEFT JOIN oficina_certificados c ON c.inscricao_id = i.id
     WHERE i.turma_id = ? AND i.status IN (${STATUS_PARTICIPANTE.map(() => "?").join(",")})
     ORDER BY i.nome ASC`,
    [turmaId, ...STATUS_PARTICIPANTE]
  );
  return rows;
}

async function carregarPresencas(turmaId) {
  const [rows] = await db.query(`SELECT modulo_id, inscricao_id FROM oficina_presencas WHERE turma_id = ?`, [turmaId]);
  const porInscricao = new Map();
  rows.forEach((r) => {
    if (!porInscricao.has(r.inscricao_id)) porInscricao.set(r.inscricao_id, new Set());
    porInscricao.get(r.inscricao_id).add(r.modulo_id);
  });
  return porInscricao;
}

/* ───────────────────── Frequência / presença ───────────────────── */

async function frequenciaTurma(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const modulos = await carregarModulos(turma.id);
    const pesos = pesosDosModulos(modulos);
    const participantes = await carregarParticipantes(turma.id);
    const presencas = await carregarPresencas(turma.id);

    const inscritos = participantes.map((p) => {
      const ids = presencas.get(p.id) || new Set();
      const freq = calcularFrequencia(pesos, ids);
      return {
        inscricao_id: p.id,
        nome: p.nome,
        matricula: p.matricula,
        cpf: p.cpf,
        status: p.status,
        presencas: modulos.map((m) => ids.has(m.id)),
        percentual: freq.percentual,
        elegivel: elegivel(freq.percentual, turma.presenca_minima, modulos.length > 0),
        certificado: p.certificado_id ? { id: p.certificado_id, codigo: p.certificado_codigo } : null,
        cargo_almejado: cargoAlmejadoRotulo(p.cargo_almejado, p.cargo_almejado_outro),
        promocao: p.promovido_em ? { data: p.promovido_em, cargo: p.cargo_promovido, observacao: p.promocao_obs } : null,
      };
    });

    res.json({
      turma: {
        id: turma.id,
        nome: turma.nome,
        presenca_minima: Number(turma.presenca_minima),
        carga_horaria_total: turma.carga_horaria_prevista === null ? null : Number(turma.carga_horaria_prevista),
      },
      modulos,
      inscritos,
    });
  } catch (error) {
    console.error("[oficina] frequenciaTurma:", error);
    res.status(500).json({ error: "Erro ao carregar a frequência da turma." });
  }
}

// Carrega o módulo garantindo que ele pertence a uma turma do tenant do usuário.
async function moduloDoTenant(req, moduloId) {
  const tenant = filtroTenant(req, "t");
  const [rows] = await db.query(
    `SELECT m.id, m.turma_id FROM oficina_modulos m JOIN oficina_turmas t ON t.id = m.turma_id
     WHERE m.id = ?${tenant.sql}`,
    [moduloId, ...tenant.params]
  );
  return rows[0] || null;
}

async function registrarPresenca(req, res) {
  try {
    const modulo = await moduloDoTenant(req, req.params.moduloId);
    if (!modulo) return res.status(404).json({ error: "Módulo não encontrado." });

    const inscricaoId = Number(req.body?.inscricao_id);
    const presente = req.body?.presente !== false;

    const [insc] = await db.query(`SELECT id, status FROM oficina_inscricoes WHERE id = ? AND turma_id = ?`, [
      inscricaoId,
      modulo.turma_id,
    ]);
    if (!insc[0] || !STATUS_PARTICIPANTE.includes(insc[0].status)) {
      return res.status(400).json({ error: "Só participantes confirmados podem ter presença registrada." });
    }

    if (presente) {
      await db.query(
        `INSERT IGNORE INTO oficina_presencas (turma_id, modulo_id, inscricao_id, registrado_por_id) VALUES (?, ?, ?, ?)`,
        [modulo.turma_id, modulo.id, inscricaoId, req.user?.id ?? null]
      );
    } else {
      const [cert] = await db.query(`SELECT id FROM oficina_certificados WHERE inscricao_id = ?`, [inscricaoId]);
      if (cert.length) {
        return res.status(409).json({ error: "Esta pessoa já tem certificado emitido. Revogue o certificado antes de remover a presença." });
      }
      await db.query(`DELETE FROM oficina_presencas WHERE modulo_id = ? AND inscricao_id = ?`, [modulo.id, inscricaoId]);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[oficina] registrarPresenca:", error);
    res.status(500).json({ error: "Erro ao registrar a presença." });
  }
}

// Credencia todos os confirmados de uma vez (ou limpa o módulo). Limpar nunca
// toca em quem já tem certificado emitido.
async function credenciarTodos(req, res) {
  try {
    const modulo = await moduloDoTenant(req, req.params.moduloId);
    if (!modulo) return res.status(404).json({ error: "Módulo não encontrado." });

    if (req.body?.presente === false) {
      const [r] = await db.query(
        `DELETE p FROM oficina_presencas p
         LEFT JOIN oficina_certificados c ON c.inscricao_id = p.inscricao_id
         WHERE p.modulo_id = ? AND c.id IS NULL`,
        [modulo.id]
      );
      return res.json({ ok: true, removidas: r.affectedRows });
    }

    const [r] = await db.query(
      `INSERT IGNORE INTO oficina_presencas (turma_id, modulo_id, inscricao_id, registrado_por_id)
       SELECT ?, ?, i.id, ? FROM oficina_inscricoes i WHERE i.turma_id = ? AND i.status IN (${STATUS_PARTICIPANTE.map(() => "?").join(",")})`,
      [modulo.turma_id, modulo.id, req.user?.id ?? null, modulo.turma_id, ...STATUS_PARTICIPANTE]
    );
    res.json({ ok: true, credenciados: r.affectedRows });
  } catch (error) {
    console.error("[oficina] credenciarTodos:", error);
    res.status(500).json({ error: "Erro ao credenciar os participantes." });
  }
}

/* ───────────────────────── Certificados ───────────────────────── */

async function emitirCertificados(req, res) {
  const conn = await db.getConnection();
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const modulos = await carregarModulos(turma.id);
    if (!modulos.length) {
      return res.status(400).json({ error: "A turma ainda não tem grade. Cadastre os módulos antes de emitir certificados." });
    }

    const pesos = pesosDosModulos(modulos);
    const cargaHoraria = modulos.reduce((a, m) => a + (Number(m.carga_horaria) || 0), 0) || null;
    const participantes = await carregarParticipantes(turma.id);
    const presencas = await carregarPresencas(turma.id);

    const apenas = Array.isArray(req.body?.inscricao_ids) ? new Set(req.body.inscricao_ids.map(Number)) : null;

    let emitidos = 0;
    let jaTinham = 0;
    let naoElegiveis = 0;

    await conn.beginTransaction();

    for (const p of participantes) {
      if (apenas && !apenas.has(p.id)) continue;
      if (p.certificado_id) {
        jaTinham += 1;
        continue;
      }
      const freq = calcularFrequencia(pesos, presencas.get(p.id) || new Set());
      if (!elegivel(freq.percentual, turma.presenca_minima, true)) {
        naoElegiveis += 1;
        continue;
      }

      let gravado = false;
      for (let tentativa = 0; tentativa < 5 && !gravado; tentativa++) {
        try {
          await conn.query(
            `INSERT INTO oficina_certificados
              (empresa_id, turma_id, inscricao_id, pessoa_id, codigo, nome, turma_nome, carga_horaria, data_inicio, data_fim,
               percentual_presenca, emitido_por_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              turma.empresa_id,
              turma.id,
              p.id,
              p.pessoa_id,
              gerarCodigo(),
              p.nome,
              turma.nome,
              cargaHoraria,
              turma.data_inicio,
              turma.data_fim,
              freq.percentual,
              req.user?.id ?? null,
            ]
          );
          gravado = true;
        } catch (e) {
          // colisão de código (raríssima): tenta outro; qualquer outro erro sobe
          if (!(e && e.code === "ER_DUP_ENTRY" && /codigo/.test(e.message || ""))) throw e;
        }
      }
      if (!gravado) throw new Error("Não foi possível gerar um código único de certificado.");

      await conn.query(`UPDATE oficina_inscricoes SET status = 'concluido' WHERE id = ?`, [p.id]);
      emitidos += 1;
    }

    await conn.commit();
    res.json({ ok: true, emitidos, ja_tinham: jaTinham, nao_elegiveis: naoElegiveis });
  } catch (error) {
    await conn.rollback();
    console.error("[oficina] emitirCertificados:", error);
    res.status(500).json({ error: "Erro ao emitir os certificados." });
  } finally {
    conn.release();
  }
}

// Dados para impressão (certificados da turma, ou um só por ?codigo=).
async function listarCertificados(req, res) {
  try {
    const turma = await buscarTurma(req, req.params.id);
    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const params = [turma.id];
    let filtro = "";
    if (req.query.codigo) {
      filtro = " AND c.codigo = ?";
      params.push(String(req.query.codigo));
    }

    const [rows] = await db.query(
      `SELECT c.id, c.codigo, c.nome, c.turma_nome, c.carga_horaria,
              DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
              DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim,
              c.percentual_presenca, c.emitido_em
       FROM oficina_certificados c WHERE c.turma_id = ?${filtro} ORDER BY c.nome ASC`,
      params
    );

    res.json({
      turma: {
        id: turma.id,
        nome: turma.nome,
        assinatura1_nome: turma.assinatura1_nome,
        assinatura1_cargo: turma.assinatura1_cargo || "Colaborador(a)",
        assinatura2_nome: turma.assinatura2_nome,
        assinatura2_cargo: turma.assinatura2_cargo || "Coordenador(a) de T&D",
      },
      certificados: rows.map((c) => ({
        ...c,
        carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria),
        percentual_presenca: c.percentual_presenca === null ? null : Number(c.percentual_presenca),
      })),
    });
  } catch (error) {
    console.error("[oficina] listarCertificados:", error);
    res.status(500).json({ error: "Erro ao carregar os certificados." });
  }
}

// "Meus certificados" da Oficina (treinando). 16/10/2026: o treinando baixa
// SÓ o próprio certificado — nunca recebe o de outra pessoa. O vínculo é
// feito pelo login: inscrição com usuario_id = quem está logado OU com o
// mesmo pessoa_id do cadastro único (usuarios.pessoa_id). Sem vínculo
// confiável, devolve lista vazia (não tenta adivinhar por nome). Nada é
// importado do Doity: só lê o que já está em oficina_certificados.
async function meusCertificados(req, res) {
  try {
    const usuarioId = Number(req.user?.id);
    if (!usuarioId) return res.json({ certificados: [] });

    const [[u]] = await db.query(`SELECT pessoa_id FROM usuarios WHERE id = ? LIMIT 1`, [usuarioId]);
    const pessoaId = u?.pessoa_id || null;

    const tenant = filtroTenant(req, "t");
    const params = [usuarioId];
    let vinculo = "i.usuario_id = ?";
    if (pessoaId) {
      vinculo = "(i.usuario_id = ? OR i.pessoa_id = ?)";
      params.push(pessoaId);
    }
    params.push(...tenant.params);
    let filtroCodigo = "";
    if (req.query.codigo) {
      filtroCodigo = " AND c.codigo = ?";
      params.push(String(req.query.codigo));
    }

    const [rows] = await db.query(
      `SELECT c.id, c.codigo, c.nome, c.turma_nome, c.carga_horaria,
              DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
              DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim,
              c.percentual_presenca, c.emitido_em,
              t.assinatura1_nome, t.assinatura1_cargo, t.assinatura2_nome, t.assinatura2_cargo
       FROM oficina_certificados c
       JOIN oficina_inscricoes i ON i.id = c.inscricao_id
       JOIN oficina_turmas t ON t.id = c.turma_id
       WHERE ${vinculo}${tenant.sql}${filtroCodigo}
       ORDER BY c.emitido_em DESC`,
      params
    );

    res.json({
      certificados: rows.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        nome: c.nome,
        turma_nome: c.turma_nome,
        carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria),
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        percentual_presenca: c.percentual_presenca === null ? null : Number(c.percentual_presenca),
        emitido_em: c.emitido_em,
        assinatura1_nome: c.assinatura1_nome,
        assinatura1_cargo: c.assinatura1_cargo || "Colaborador(a)",
        assinatura2_nome: c.assinatura2_nome,
        assinatura2_cargo: c.assinatura2_cargo || "Coordenador(a) de T&D",
      })),
    });
  } catch (error) {
    console.error("[oficina] meusCertificados:", error);
    res.status(500).json({ error: "Erro ao carregar seus certificados." });
  }
}

async function revogarCertificado(req, res) {
  const conn = await db.getConnection();
  try {
    const tenant = filtroTenant(req, "t");
    const [rows] = await conn.query(
      `SELECT c.id, c.inscricao_id, i.promovido_em
       FROM oficina_certificados c
       JOIN oficina_turmas t ON t.id = c.turma_id
       JOIN oficina_inscricoes i ON i.id = c.inscricao_id
       WHERE c.id = ?${tenant.sql}`,
      [req.params.id, ...tenant.params]
    );
    if (!rows[0]) return res.status(404).json({ error: "Certificado não encontrado." });
    if (rows[0].promovido_em) {
      return res.status(409).json({
        error: "Esta pessoa tem promoção registrada a partir da oficina. Desfaça a promoção antes de revogar o certificado.",
      });
    }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM oficina_certificados WHERE id = ?`, [rows[0].id]);
    await conn.query(`UPDATE oficina_inscricoes SET status = 'confirmado' WHERE id = ? AND status = 'concluido'`, [
      rows[0].inscricao_id,
    ]);
    await conn.commit();
    console.log(`[oficina] certificado ${rows[0].id} revogado por usuário ${req.user?.id ?? "?"}`);
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    console.error("[oficina] revogarCertificado:", error);
    res.status(500).json({ error: "Erro ao revogar o certificado." });
  } finally {
    conn.release();
  }
}

// Lista de frequência para impressão (assinatura em papel): participantes
// confirmados/concluídos + módulos. Reaproveita frequenciaTurma.
async function listaImpressao(req, res) {
  return frequenciaTurma(req, res);
}

/* ───────────────── Validação pública (sem login) ───────────────── */

async function validarCertificadoPublico(req, res) {
  try {
    const codigo = String(req.params.codigo || "").trim().toUpperCase();
    if (!/^OT-[A-Z0-9]{10}$/.test(codigo)) return res.status(404).json({ valido: false });

    const [rows] = await db.query(
      `SELECT nome, turma_nome, carga_horaria,
              DATE_FORMAT(data_inicio, '%Y-%m-%d') AS data_inicio,
              DATE_FORMAT(data_fim, '%Y-%m-%d') AS data_fim,
              percentual_presenca, DATE_FORMAT(emitido_em, '%Y-%m-%d') AS emitido_em
       FROM oficina_certificados WHERE codigo = ? LIMIT 1`,
      [codigo]
    );
    if (!rows[0]) return res.status(404).json({ valido: false });

    res.json({
      valido: true,
      codigo,
      nome: rows[0].nome,
      oficina: rows[0].turma_nome,
      carga_horaria: rows[0].carga_horaria === null ? null : Number(rows[0].carga_horaria),
      data_inicio: rows[0].data_inicio,
      data_fim: rows[0].data_fim,
      emitido_em: rows[0].emitido_em,
    });
  } catch (error) {
    console.error("[oficina-publico] validarCertificado:", error);
    res.status(500).json({ error: "Não foi possível validar o certificado agora." });
  }
}

module.exports = {
  meusCertificados,
  frequenciaTurma,
  registrarPresenca,
  credenciarTodos,
  emitirCertificados,
  listarCertificados,
  revogarCertificado,
  listaImpressao,
  validarCertificadoPublico,
};
