/**
 * pessoasController.js — Cadastro único de pessoas, Fase 0 (22/09/2026)
 *
 * Só a busca por enquanto (GET /api/pessoas?busca=). O objetivo desta
 * rota é dar às telas de cadastro (Fase 2 do plano) um jeito de "procurar
 * antes de criar" — nenhuma tela ainda chama isto; é preparação. Nenhum
 * endpoint de criar/editar pessoa diretamente foi exposto nesta fase: por
 * enquanto, pessoas só nascem via resolverPessoa() (services/
 * pessoasService.js), chamado a partir dos cadastros existentes.
 *
 * Mesma régua de acesso a CPF já usada em treinamento_participantes
 * (treinamentoParticipantesController.js) — perfis fora dessa lista
 * recebem o CPF mascarado, nunca em texto puro, já que esta busca pode ser
 * chamada de qualquer tela de cadastro do portal.
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

module.exports = { buscar };
