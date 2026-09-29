/**
 * pessoasController.js — Cadastro único de pessoas, Fase 0 (22/09/2026) +
 * Perfil da Pessoa / visão 360º (28/09/2026, ver claude/proposta-perfil-
 * pessoa-360-2026-09-28.md).
 *
 * buscar() (GET /api/pessoas?busca=) dá às telas de cadastro um jeito de
 * "procurar antes de criar". Nenhum endpoint de criar/editar pessoa
 * diretamente é exposto aqui: por enquanto, pessoas só nascem via
 * resolverPessoa() (services/pessoasService.js), chamado a partir dos
 * cadastros existentes.
 *
 * perfil() (GET /api/pessoas/:id) é a tela nova pedida pelo Ramon depois de
 * fechar a Fase 3 (backfill de pessoa_id aplicado em produção): abrir uma
 * pessoa e ver, num lugar só, tudo que o Cadastro Único já sabe sobre ela —
 * turmas de treinamento, jornada de desenvolvimento, coaching individual,
 * perfil comportamental (Metodologia), conta de acesso e dados bancários —
 * hoje espalhado em até seis cadastros sem nenhuma ligação visível entre
 * si. Cada consulta é filtrada por pessoa_id + empresa_id (isolamento de
 * tenant), e nenhuma migração de banco é necessária — é leitura pura do que
 * já existe.
 *
 * Mesma régua de acesso a CPF já usada em treinamento_participantes
 * (treinamentoParticipantesController.js) — perfis fora dessa lista
 * recebem o CPF mascarado, nunca em texto puro; dados bancários (que só
 * fazem sentido pra quem já pode ver CPF) ficam de fora da resposta por
 * inteiro para quem não tem esse acesso, em vez de vir mascarado.
 */
const pool = require("../lib/db");

const PERFIS_COM_ACESSO_CPF = ["coordenador", "assistente_treinamento", "super_admin"];

function podeVerCpf(perfil) {
  return PERFIS_COM_ACESSO_CPF.includes(String(perfil || "").toLowerCase().trim());
}

function mascararCpf(cpf) {
  if (!cpf) return null;
  return `***.***.${String(cpf).slice(-4, -2)}-${String(cpf).slice(-2)}`;
}

// GET /api/pessoas?busca=texto — busca por nome (LIKE), matrícula (exata)
// ou CPF (exato, só dígitos). Limitado a 20 resultados; não pagina porque é
// pensado pra autocomplete/typeahead, não pra listagem.
async function buscar(req, res) {
  try {
    const termo = String(req.query.busca || "").trim();
    if (termo.length < 2) {
      return res.json({ ok: true, itens: [] });
    }
    if (!req.empresaId) {
      return res.status(400).json({ ok: false, message: "Empresa não identificada para a busca" });
    }

    const soDigitos = termo.replace(/\D/g, "");
    const condicoes = ["LOWER(nome) LIKE ?"];
    const params = [`%${termo.toLowerCase()}%`];

    if (soDigitos.length >= 4) {
      condicoes.push("matricula = ?", "cpf = ?");
      params.push(soDigitos, soDigitos);
    }

    const [rows] = await pool.query(
      `SELECT id, nome, cpf, matricula, cliente, status_identidade
       FROM pessoas
       WHERE empresa_id = ? AND (${condicoes.join(" OR ")})
       ORDER BY nome ASC
       LIMIT 20`,
      [req.empresaId, ...params]
    );

    const podeCpf = podeVerCpf(req.user?.perfil);
    const itens = rows.map((p) => ({
      ...p,
      cpf: podeCpf ? p.cpf : mascararCpf(p.cpf),
    }));

    return res.json({ ok: true, itens });
  } catch (error) {
    console.error("[pessoasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao buscar pessoas" });
  }
}

// GET /api/pessoas/:id — perfil 360º de uma pessoa (ver cabeçalho do
// arquivo). "Não encontrada" cobre tanto id inexistente quanto id de outro
// tenant (mesma query, WHERE empresa_id = ?), pra nunca revelar por
// diferença de mensagem que um id pertence a outra empresa.
async function perfil(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "Id inválido." });
    }
    if (!req.empresaId) {
      return res.status(400).json({ ok: false, message: "Empresa não identificada." });
    }

    const [pessoaRows] = await pool.query(
      `SELECT id, nome, cpf, matricula, cliente, status_identidade, created_at
       FROM pessoas WHERE id = ? AND empresa_id = ? LIMIT 1`,
      [id, req.empresaId]
    );
    const pessoa = pessoaRows[0];
    if (!pessoa) {
      return res.status(404).json({ ok: false, message: "Pessoa não encontrada." });
    }

    const podeCpf = podeVerCpf(req.user?.perfil);

    const [
      [turmas],
      [jornadas],
      [coaching],
      [metodologiaRows],
      [usuarioRows],
    ] = await Promise.all([
      // Turmas de treinamento em que a pessoa apareceu como participante,
      // mais recente primeiro.
      pool.query(
        `SELECT
           t.id AS treinamento_id, t.tema, t.cliente, t.instrutor,
           t.data_inicio, t.data_fim, t.data, t.status AS status_turma,
           tp.status_presenca
         FROM treinamento_participantes tp
         JOIN treinamentos t ON t.id = tp.treinamento_id
         WHERE tp.pessoa_id = ? AND t.empresa_id = ?
         ORDER BY COALESCE(t.data_inicio, t.data) DESC`,
        [id, req.empresaId]
      ),
      // Jornadas de desenvolvimento (coletivas) em que a pessoa participa.
      pool.query(
        `SELECT
           j.id AS jornada_id, j.nome AS jornada_nome, j.cliente,
           jp.id AS participante_id, jp.cargo, jp.turma, jp.status_jornada
         FROM jornada_participantes jp
         JOIN jornadas_desenvolvimento j ON j.id = jp.jornada_id
         WHERE jp.pessoa_id = ? AND j.empresa_id = ?
         ORDER BY jp.id DESC`,
        [id, req.empresaId]
      ),
      // Coaching individual — inclui a data do último encontro registrado,
      // pra dar o mesmo farol de atraso já usado em coachingIndividualController.js.
      pool.query(
        `SELECT
           ci.id, ci.cargo, ci.cliente, ci.cadencia_dias, ci.status,
           ci.data_inicio, ci.data_fim, ci.observacoes,
           (SELECT MAX(ce.data_encontro) FROM coaching_encontros ce
             WHERE ce.coaching_individual_id = ci.id) AS ultimo_encontro
         FROM coaching_individual ci
         WHERE ci.pessoa_id = ? AND ci.empresa_id = ?
         ORDER BY (ci.status = 'ativo') DESC, ci.data_inicio DESC`,
        [id, req.empresaId]
      ),
      // Perfil comportamental (Metodologia) — só o registro mais recente,
      // se houver mais de um lançamento pra mesma pessoa.
      pool.query(
        `SELECT
           perfil_animal, perfil_animal_secundario, disc_letra_dominante,
           disc_d, disc_i, disc_s, disc_c, origem, observacoes, updated_at
         FROM pessoas_metodologia
         WHERE pessoa_id = ? AND empresa_id = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [id, req.empresaId]
      ),
      // Conta de acesso ao portal, se esta pessoa tiver login.
      pool.query(
        `SELECT id, nome, email, perfil, ativo
         FROM usuarios WHERE pessoa_id = ? AND empresa_id = ? LIMIT 1`,
        [id, req.empresaId]
      ),
    ]);

    // Dados bancários / PIX — mesma régua de acesso a CPF, e só entram na
    // resposta pra quem já pode ver CPF hoje (Coordenador, Assistente de
    // Treinamento, Super Admin). Filtra por pessoa_id (Fase 2, item 1),
    // nunca por CPF direto, pra não reabrir a falha de cross-tenant descrita
    // na migração 37 (auditoria 15/09/2026).
    let dadosBancarios = null;
    if (podeCpf) {
      const [bancoRows] = await pool.query(
        `SELECT banco, agencia, operacao, conta, dv, tipo_chave_pix, chave_pix, atualizado_em
         FROM dados_bancarios_colaborador WHERE pessoa_id = ? LIMIT 1`,
        [id]
      );
      dadosBancarios = bancoRows[0] || null;
    }

    return res.json({
      ok: true,
      pessoa: {
        id: pessoa.id,
        nome: pessoa.nome,
        cpf: podeCpf ? pessoa.cpf : mascararCpf(pessoa.cpf),
        matricula: pessoa.matricula,
        cliente: pessoa.cliente,
        status_identidade: pessoa.status_identidade,
        criada_em: pessoa.created_at,
      },
      turmas,
      jornadas,
      coaching,
      metodologia: metodologiaRows[0] || null,
      usuario: usuarioRows[0] || null,
      dados_bancarios: dadosBancarios,
      pode_ver_cpf: podeCpf,
    });
  } catch (error) {
    console.error("[pessoasController] perfil:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao buscar perfil da pessoa." });
  }
}

module.exports = { buscar, perfil };
