const XLSX = require("xlsx");
const db = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const { tenantScopeFor } = require("../lib/tenantScope");
const { resolverPessoa, pessoaIdDoUsuario, acharConflitoMatricula, gravarDadosDaPessoa } = require("../services/pessoasService");
const { garantirUsuarioTreinando } = require("../services/provisionamentoUsuariosService");
const { condicaoIdentidade } = require("../lib/identidadeTreinando");

// Decisão 12 (Pacote Salas/Assistente/CPF/Horas/Farol MPT, 15/09/2026): a
// Assistente de Treinamento enxerga participantes/chamada de qualquer
// tenant nesta tela (Gestão de Turmas) — decidido endpoint a endpoint via
// tenantScopeFor, nunca no clientMiddleware (ver lib/tenantScope.js).
const CROSS_TENANT_ROLES = ["assistente_treinamento"];

// Decisão 14 (Pacote Salas/Assistente/CPF/Horas/Farol MPT, 15/09/2026): CPF
// é um campo novo, visível/exportável só para Assistente de Treinamento,
// Coordenador e Super Admin. A coluna existe pra todo mundo (ver migrate.js);
// o corte é feito aqui, no que a API devolve — supervisor/instrutor/
// treinando continuam vendo os demais campos do participante normalmente,
// só sem o CPF.
const PERFIS_COM_ACESSO_CPF = ["coordenador", "assistente_treinamento", "super_admin"];

function usuarioPodeVerCpf(req) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  return PERFIS_COM_ACESSO_CPF.includes(perfil);
}

function removerCpfSeNecessario(req, linhas) {
  if (usuarioPodeVerCpf(req)) return linhas;
  return linhas.map((linha) => {
    const { cpf, ...resto } = linha;
    return resto;
  });
}

function normalizarCpf(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

function parseLocalDate(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate()
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");

  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function isSunday(dateValue) {
  const d = parseLocalDate(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}


function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRowKeys(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return normalized;
}

// Isolamento por tenant: confirma que um treinamento_id recebido do cliente
// pertence à empresa de quem está fazendo a requisição antes de ler/gravar
// participantes ou chamada. Sem isso, qualquer usuário autenticado podia
// ver/importar/editar/excluir a lista de participantes e a chamada de uma
// turma de outra empresa só sabendo (ou incrementando) o id.
//
// Pacote 3 (acesso restrito por cliente, generalizar): além do tenant,
// agora também confere o cliente do treinamento contra o(s) cliente(s) do
// usuário (req), pelo mesmo motivo que já valia para Trilhas (Pacote 1,
// item 6) — sem isso, instrutor/treinando de um cliente podia ver ou
// mexer na lista de participantes/chamada de uma turma de OUTRO cliente
// do mesmo tenant só sabendo/incrementando o treinamento_id. Gestor
// (coordenador/supervisor/superintendente) continua com acesso total.
// `req` é opcional para não quebrar nenhum chamador futuro que só precise
// do isolamento por tenant (hoje todos os pontos deste arquivo passam req).
async function treinamentoPertenceAoTenant(db, treinamentoId, empresaId, req = null) {
  const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [treinamentoId, empresaId] : [treinamentoId];
  const [rows] = await db.query(
    `SELECT cliente FROM treinamentos WHERE id = ?${tenantCheck} LIMIT 1`,
    params
  );
  if (!rows.length) return false;
  if (!req) return true;
  return usuarioTemAcessoAoCliente(req, rows[0].cliente);
}

// Inclusão de usuários (treinandos), 25/09/2026: resolverPessoa() e a
// criação de conta precisam do empresa_id REAL da turma — nunca do
// `empresaId` que vem de tenantScopeFor(), que é null de propósito para
// quem tem visão cross-tenant (ex.: assistente_treinamento). Uma pessoa/
// conta criada a partir de uma importação sempre tem que pertencer ao
// tenant DONO da turma, nunca a "todos os tenants" — mesmo cuidado já
// tomado nas gravações de Capacidade (ver capacidadeController.js).
async function empresaRealDoTreinamento(db, treinamentoId) {
  const [rows] = await db.query(
    `SELECT empresa_id FROM treinamentos WHERE id = ? LIMIT 1`,
    [treinamentoId]
  );
  return rows[0]?.empresa_id || null;
}

async function getParticipantesByTreinamento(req, res) {
  try {
    const { id } = req.params;
    const dataChamada = req.query?.data || null;
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const perfil = String(req.user?.perfil || "").toLowerCase().trim();

    if (!(await treinamentoPertenceAoTenant(db, id, empresaId, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    // Correção de segurança 15/09/2026 (auditoria, Pacote A.2): antes, este
    // endpoint só conferia se a turma era do mesmo tenant/cliente — não se
    // o treinando logado estava matriculado NELA. Resultado: um treinando
    // autenticado, sabendo/adivinhando o ID de qualquer turma do próprio
    // tenant (mesmo uma em que nunca participou), via nome completo,
    // matrícula, supervisor, operação e data de admissão de todos os
    // participantes — dado pessoal (LGPD) sem necessidade. Mesmo padrão de
    // "não é você, não vê" já usado em NPS/avaliações: sem matrícula na
    // turma, 404 (igual a turma não encontrada, não revela que ela existe).
    // 25/09/2026: casamento trocado de nome exato pra pessoa_id quando a
    // conta logada tem um (ver identidadeTreinando.js) — mesmo motivo do
    // NPS/provas: nome sozinho deixava dois treinandos homônimos se
    // confundirem nesta checagem.
    if (perfil === "treinando") {
      const nomeUsuario = String(req.user?.nome || "").trim();
      if (!nomeUsuario) {
        return res.status(400).json({ ok: false, message: "Usuário não identificado" });
      }
      const pessoaId = await pessoaIdDoUsuario(req.user?.id);
      const condTp = condicaoIdentidade("tp", "nome", pessoaId, nomeUsuario);
      const [matriculado] = await db.query(
        `SELECT tp.id FROM treinamento_participantes tp WHERE tp.treinamento_id = ? AND ${condTp.sql} LIMIT 1`,
        [id, ...condTp.params]
      );
      if (!matriculado.length) {
        return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
      }
    }

    let rows;

    if (dataChamada) {
      const [result] = await db.query(
        `
        SELECT
          tp.id,
          tp.treinamento_id,
          tp.nome,
          tp.matricula,
          tp.cpf,
          tp.cliente,
          tp.turma,
          tp.supervisor,
          tp.operacao,
          tp.data_admissao,
          tp.pessoa_id,
          COALESCE(p.status, 'pendente') AS status_presenca,
          COALESCE(p.justificativa, '') AS justificativa,
          tp.created_at
        FROM treinamento_participantes tp
        LEFT JOIN presencas p
          ON p.treinamento_id = tp.treinamento_id
         AND p.treinando_nome = tp.nome
         AND p.data_chamada = ?
        WHERE tp.treinamento_id = ?
        ORDER BY tp.nome ASC
        `,
        [dataChamada, id]
      );
      rows = result;
    } else {
      const [result] = await db.query(
        `
        SELECT
          id,
          treinamento_id,
          nome,
          matricula,
          cpf,
          cliente,
          turma,
          supervisor,
          operacao,
          data_admissao,
          pessoa_id,
          status_presenca,
          justificativa,
          created_at
        FROM treinamento_participantes
        WHERE treinamento_id = ?
        ORDER BY nome ASC
        `,
        [id]
      );
      rows = result;
    }

    // 19/10/2026 (decisão do Ramon): o treinando vê só os nomes dos colegas da própria turma —
    // matrícula, supervisor, operação, admissão e CPF ficam restritos à equipe. A linha dele mesmo vem completa.
    if (perfil === "treinando") {
      const proprio = String(req.user?.nome || "").trim().toLowerCase();
      return res.json(
        removerCpfSeNecessario(req, rows).map((r) =>
          String(r.nome || "").trim().toLowerCase() === proprio
            ? r
            : { id: r.id, treinamento_id: r.treinamento_id, nome: r.nome, cliente: r.cliente, turma: r.turma }
        )
      );
    }

    return res.json(removerCpfSeNecessario(req, rows));
  } catch (error) {
    console.error("[treinamentoParticipantesController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar participantes da turma"});
  }
}

async function importarParticipantesExcel(req, res) {
  try {
    const { treinamento_id } = req.body;

    if (!treinamento_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento_id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "Arquivo Excel não enviado",
      });
    }

    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    if (!(await treinamentoPertenceAoTenant(db, treinamento_id, empresaId, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[primeiraAba];
    const linhasOriginais = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const linhas = linhasOriginais.map(normalizeRowKeys);

    if (!linhas.length) {
      return res.status(400).json({
        ok: false,
        message: "A planilha está vazia",
      });
    }

    // Ajuste 15/09/2026 (fim de tarde): "matricula" saiu da lista de
    // colunas obrigatórias — turma de Avaliação Técnica (Reembolso de
    // Transporte) importa gente sem matrícula/login no RH de origem, só
    // com CPF. A planilha agora só precisa ter matrícula OU cpf (pelo
    // menos uma das duas colunas), não as duas.
    const colunasObrigatorias = [
      "nome",
      "cliente",
      "turma",
      "supervisor",
      "operacao",
      "data_admissao",
    ];

    const primeiraLinha = linhas[0];
    const faltando = colunasObrigatorias.filter(
      (col) => !(col in primeiraLinha)
    );

    if (faltando.length) {
      return res.status(400).json({
        ok: false,
        message: `Colunas obrigatórias ausentes: ${faltando.join(", ")}`,
      });
    }

    if (!("matricula" in primeiraLinha) && !("cpf" in primeiraLinha)) {
      return res.status(400).json({
        ok: false,
        message: "A planilha precisa ter pelo menos uma das colunas: matricula ou cpf.",
      });
    }

    // Pacote 2 (débito técnico, 2026-09): apagar os participantes/presenças
    // antigos e inserir os novos linha a linha rodava como queries soltas no
    // pool — se a conexão caísse no meio de uma planilha grande, a turma
    // ficava sem os participantes antigos (já apagados) E sem os novos
    // (importação incompleta), sem nenhuma forma de desfazer. Envolvido numa
    // transação: ou a planilha inteira entra, ou nada muda.
    // Inclusão de usuários (treinandos), 25/09/2026: identidade e conta
    // sempre presas ao tenant DONO da turma, nunca ao empresaId de quem
    // está importando (ver empresaRealDoTreinamento acima).
    const empresaIdTurma = await empresaRealDoTreinamento(db, treinamento_id);

    const conn = await db.getConnection();
    let totalImportados = 0;
    let contasCriadas = 0;
    let contasAtualizadas = 0;
    let semIdentificadorLogin = 0;
    let vinculadasAuto = 0;
    let linhasLidas = 0;
    const ignoradas = [];
    try {
      await conn.beginTransaction();

      await conn.query(
        `DELETE FROM presencas WHERE treinamento_id = ?`,
        [treinamento_id]
      );

      await conn.query(
        `DELETE FROM treinamento_participantes WHERE treinamento_id = ?`,
        [treinamento_id]
      );

      for (const linha of linhas) {
        linhasLidas += 1;
        const nome = String(linha.nome || "").trim();
        if (!nome) continue;

        const matriculaLinha = String(linha.matricula || "").trim();
        const clienteLinha = String(linha.cliente || "").trim();
        const cpfLinha = normalizarCpf(linha.cpf);

        // Cadastro Único de Pessoas (Fase 0) — mesma função central usada
        // em qualquer outro cadastro daqui pra frente: casa por CPF, senão
        // por matrícula+nome, senão cria pessoa nova (provisória). Nunca
        // bloqueia a importação por falta de CPF/matrícula.
        // 28/10/2026 — mesma inteligência da inclusão manual: reconhece quem já tem cadastro
        // (CPF; matrícula+nome; matrícula com nome parecido; nome único) e NÃO cria segunda pessoa
        // quando a matrícula já é de outra pessoa do mesmo cliente — essa linha fica de fora e é
        // listada no resultado, em vez de derrubar a planilha inteira.
        const numeroLinha = linhasLidas;
        const conflito = await acharConflitoMatricula(conn, empresaIdTurma, {
          matricula: matriculaLinha, nome, cpf: cpfLinha, cliente: clienteLinha,
        });
        if (conflito) {
          ignoradas.push({ linha: numeroLinha, nome, motivo: `matrícula ${matriculaLinha} já é de "${conflito.nome}"${conflito.cliente ? ` (${conflito.cliente})` : ""}` });
          continue;
        }
        const resolvida = await resolverPessoa(
          { empresaId: empresaIdTurma, nome, cpf: cpfLinha, matricula: matriculaLinha, cliente: clienteLinha },
          conn,
          { vinculoAmplo: true }
        );
        if (resolvida.ambigua) {
          ignoradas.push({ linha: numeroLinha, nome, motivo: `há ${resolvida.ambigua.length} pessoas com este nome; informe matrícula ou CPF` });
          continue;
        }
        const pessoa = resolvida.pessoa;
        if (!resolvida.criada) vinculadasAuto += 1;
        const anteriorLinha = resolvida.criada ? { operacao: "", data_admissao: null } : await dadosAnterioresDaPessoa(conn, pessoa.id);

        await conn.query(
          `
          INSERT INTO treinamento_participantes
          (
            treinamento_id,
            nome,
            matricula,
            cliente,
            turma,
            supervisor,
            operacao,
            data_admissao,
            cpf,
            status_presenca,
            justificativa,
            pessoa_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            treinamento_id,
            nome,
            matriculaLinha,
            clienteLinha,
            String(linha.turma || "").trim(),
            String(linha.supervisor || "").trim(),
            String(linha.operacao || "").trim() || anteriorLinha.operacao,
            String(linha.data_admissao || "").trim() ? formatExcelDateToMySQL(linha.data_admissao) : anteriorLinha.data_admissao,
            // Coluna opcional na planilha — a maioria dos modelos hoje em
            // uso não a tem, então nunca entra em `colunasObrigatorias`
            // (ver mais acima); quando presente, precisa bater 11 dígitos
            // ou é descartada silenciosamente (mesmo padrão defensivo do
            // resto do importador, que também não rejeita a planilha
            // inteira por uma célula individual mal formatada).
            cpfLinha,
            "pendente",
            null,
            pessoa.id,
          ]
        );

        totalImportados += 1;
        await gravarDadosDaPessoa(conn, pessoa.id, {
          operacao: String(linha.operacao || "").trim() || anteriorLinha.operacao,
          data_admissao: String(linha.data_admissao || "").trim() ? formatExcelDateToMySQL(linha.data_admissao) : anteriorLinha.data_admissao,
        });

        // Decisão 2 do Ramon (25/09/2026): contas de treinando nascem em
        // lote, aqui na importação — ver provisionamentoUsuariosService.js.
        const provisionamento = await garantirUsuarioTreinando(
          { pessoa, empresaId: empresaIdTurma, cliente: clienteLinha },
          conn
        );
        if (provisionamento.criado) contasCriadas += 1;
        else if (provisionamento.atualizado) contasAtualizadas += 1;
        else if (provisionamento.motivo === "sem_cpf_matricula") semIdentificadorLogin += 1;
      }

      await conn.query(
        `UPDATE treinamentos SET participantes = ? WHERE id = ?`,
        [totalImportados, treinamento_id]
      );

      await conn.commit();
    } catch (erroTransacao) {
      await conn.rollback();
      throw erroTransacao;
    } finally {
      conn.release();
    }

    return res.json({
      ok: true,
      message: "Participantes importados com sucesso",
      total: totalImportados,
      contas_criadas: contasCriadas,
      contas_atualizadas: contasAtualizadas,
      sem_identificador_login: semIdentificadorLogin,
      vinculadas_automaticamente: vinculadasAuto,
      linhas_ignoradas: ignoradas,
    });
  } catch (error) {
    console.error("[participantes] importarExcel:", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao importar participantes",
    });
  }
}

// Pedido do Ramon (29/09/2026): "Preciso do Excel base para importação dos
// treinandos nas turmas". Até aqui não existia planilha-modelo nenhuma pra
// baixar — a tela só mostrava um texto explicando as colunas (ver
// frontend/app/turma/[id]/participantes/page.js). Gera o modelo aqui, no
// backend, pra ele nunca desalinhar das colunas que `importarParticipantesExcel`
// (acima) realmente aceita — normalizadas por `normalizeHeader`.
async function baixarModeloImportacaoParticipantes(req, res) {
  try {
    const { id } = req.params;
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    if (!(await treinamentoPertenceAoTenant(db, id, empresaId, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const [rows] = await db.query(
      `SELECT cliente, tema, supervisor FROM treinamentos WHERE id = ? LIMIT 1`,
      [id]
    );
    const treinamento = rows[0] || {};
    const cliente = String(treinamento.cliente || "Nome do cliente").trim();
    // "turma" pro importador é o mesmo valor que a tela de participantes já
    // usa pra pré-preencher o formulário manual: o tema do treinamento (ver
    // emptyForm() em participantes/page.js) — não a coluna `turma` da
    // tabela `treinamentos`, que é outra coisa.
    const turma = String(treinamento.tema || "Nome da turma").trim();
    const supervisor = String(treinamento.supervisor || "Nome do supervisor").trim();

    const { novoWorkbook, estilizarCabecalho, FORMATO_DATA } = require("../lib/excelExport");
    const wb = novoWorkbook();

    const colunas = [
      { titulo: "Nome *",           chave: "nome",           largura: 30 },
      { titulo: "Cliente *",        chave: "cliente",        largura: 22 },
      { titulo: "Turma *",          chave: "turma",          largura: 26 },
      { titulo: "Supervisor *",     chave: "supervisor",     largura: 22 },
      { titulo: "Operação *",       chave: "operacao",       largura: 20 },
      { titulo: "Data Admissão *",  chave: "data_admissao",  largura: 16 },
      { titulo: "Matrícula **",     chave: "matricula",      largura: 14 },
      { titulo: "CPF **",           chave: "cpf",             largura: 16 },
    ];

    const wsModelo = wb.addWorksheet("Modelo");
    wsModelo.columns = colunas.map((c) => ({ width: c.largura }));

    // Cabeçalho na LINHA 1, de propósito: `importarParticipantesExcel` usa
    // `XLSX.utils.sheet_to_json` puro, que sempre lê a primeira linha da
    // planilha como cabeçalho — um título/legenda mesclados acima dele (como
    // numa primeira versão deste modelo) fazem a importação de volta falhar
    // com "colunas obrigatórias ausentes" nas 6 colunas, porque a "primeira
    // linha" vira o título, não os nomes de coluna de verdade. Testado com
    // reimportação de ponta a ponta antes de fechar o pacote.
    const headerRow = 1;
    colunas.forEach((c, i) => { wsModelo.getCell(headerRow, i + 1).value = c.titulo; });
    estilizarCabecalho(wsModelo, headerRow, colunas.length);

    wsModelo.getCell(headerRow, 1).note =
      "* obrigatório\n** preencha pelo menos um dos dois: Matrícula ou CPF (ver aba \"Instruções\").";
    wsModelo.getCell(headerRow, 7).note =
      "Preencha pelo menos uma das duas: Matrícula ou CPF.";
    wsModelo.getCell(headerRow, 8).note =
      "Só é aceito com 11 dígitos. Turma de Avaliação Técnica, sem matrícula/login no RH de origem: preencha só o CPF.";

    // Linhas de exemplo (itálico/cinza, pra ficar claro que são só ilustração
    // e devem ser apagadas antes de importar) — uma com matrícula, outra só
    // com CPF, cobrindo os dois casos que o importador aceita.
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const exemplos = [
      { nome: "João da Silva", operacao: "Atendimento", matricula: "123456",     cpf: "" },
      { nome: "Maria Souza",   operacao: "Cobrança",     matricula: "",          cpf: "98765432100" },
    ];
    exemplos.forEach((linha, idx) => {
      const row = headerRow + 1 + idx;
      const valores = { ...linha, cliente, turma, supervisor };
      colunas.forEach((c, i) => {
        const cell = wsModelo.getCell(row, i + 1);
        if (c.chave === "data_admissao") {
          cell.value = hoje;
          cell.numFmt = FORMATO_DATA;
        } else {
          cell.value = valores[c.chave] ?? "";
        }
      });
      wsModelo.getRow(row).font = { italic: true, color: { argb: "FF64748B" } };
    });

    // Algumas linhas em branco prontas pra preencher, já com Cliente/Turma/
    // Supervisor desta turma — poupa o preenchimento repetitivo linha a linha.
    for (let i = 0; i < 15; i++) {
      const row = headerRow + 1 + exemplos.length + i;
      wsModelo.getCell(row, 2).value = cliente;
      wsModelo.getCell(row, 3).value = turma;
      wsModelo.getCell(row, 4).value = supervisor;
    }

    wsModelo.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: colunas.length } };
    wsModelo.views = [{ state: "frozen", ySplit: headerRow }];

    // Aba "Instruções" — mesmas regras do texto de ajuda da tela, só que
    // sempre à mão junto do arquivo (útil se alguém reenviar o modelo por
    // e-mail sem o link da tela).
    const wsInfo = wb.addWorksheet("Instruções");
    wsInfo.columns = [{ width: 100 }];
    const linhasInfo = [
      { texto: "Como preencher esta planilha", bold: true, size: 13 },
      { texto: `Modelo gerado para a turma "${turma}" — cliente ${cliente}.`, size: 10, color: "FF64748B" },
      { texto: "" },
      { texto: "Colunas obrigatórias: Nome, Cliente, Turma, Supervisor, Operação e Data Admissão." },
      { texto: "Preencha pelo menos uma das colunas Matrícula ou CPF (as duas juntas também funcionam)." },
      { texto: "Turma de Avaliação Técnica, sem matrícula/login no RH de origem: use só a coluna CPF (11 dígitos)." },
      { texto: "Data Admissão: pode usar uma data do Excel (como nas duas linhas de exemplo da aba \"Modelo\") ou texto no formato DD/MM/AAAA." },
      { texto: "" },
      { texto: "A aba \"Modelo\" já vem com Cliente, Turma e Supervisor preenchidos com os dados desta turma — troque nome, operação, data de admissão e matrícula/CPF de cada treinando, apague as duas linhas de exemplo (em itálico) e adicione mais linhas se precisar." },
      { texto: "" },
      { texto: "Atenção", bold: true, color: "FFB45309" },
      { texto: "Importar uma planilha para esta turma SUBSTITUI totalmente a lista atual de participantes e apaga os registros de presença/chamada já lançados para ela. Se a turma já tem chamada feita, revise com cuidado antes de reimportar — a importação não pode ser desfeita." },
      { texto: "" },
      { texto: "A importação também cria automaticamente o acesso (login) de cada treinando no portal, usando CPF ou matrícula como identificador (Decisão 2 do Ramon, 25/09/2026)." },
    ];
    linhasInfo.forEach((linha, idx) => {
      const row = idx + 1;
      const cell = wsInfo.getCell(row, 1);
      cell.value = linha.texto;
      cell.font = {
        bold: !!linha.bold,
        size: linha.size || 11,
        color: linha.color ? { argb: linha.color } : undefined,
      };
      cell.alignment = { wrapText: true, vertical: "top" };
      if (linha.texto) wsInfo.getRow(row).height = linha.bold ? 20 : undefined;
    });

    const buf = await wb.xlsx.writeBuffer();
    const nomeArquivoTurma = turma.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "turma";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="modelo_importacao_participantes_${nomeArquivoTurma}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[participantes] baixarModeloImportacao:", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao gerar o modelo de importação",
    });
  }
}

async function salvarChamadaParticipantes(req, res) {
  try {
    const { treinamento_id, participantes, data_chamada } = req.body || {};

    if (!treinamento_id || !Array.isArray(participantes)) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento_id e participantes",
      });
    }

    if (!data_chamada) {
      return res.status(400).json({
        ok: false,
        message: "Informe a data da chamada",
      });
    }

    if (isSunday(data_chamada)) {
      return res.status(400).json({
        ok: false,
        message: "Domingo é considerado dia não letivo e não gera chamada.",
      });
    }

    const { empresaId: empresaIdChamada, crossTenant } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    if (!(await treinamentoPertenceAoTenant(db, treinamento_id, empresaIdChamada, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    // Quando quem está salvando é a Assistente (acesso cross-tenant), o
    // `empresa_id` gravado na presença tem que ser o da TURMA (o tenant de
    // verdade dono do registro), nunca o da própria conta da Assistente
    // (que pode nem ter uma empresa própria) nem null — gravar errado aqui
    // faria a chamada sumir da tela /presencas do tenant certo, o mesmo
    // tipo de vazamento silencioso já corrigido na Fase 4 para este exato
    // fluxo (ver comentário logo abaixo, "faltava gravar empresa_id").
    let empresaIdParaGravar = req.empresaId || null;
    if (crossTenant) {
      const [[turmaReal]] = await db.query(`SELECT empresa_id FROM treinamentos WHERE id = ? LIMIT 1`, [treinamento_id]);
      empresaIdParaGravar = turmaReal?.empresa_id ?? null;
    }

    // A chamada inteira entra numa transação (21/10/2026): ou salva todos os treinandos, ou nenhum.
    await comTransacao(async (conn) => {
      for (const item of participantes) {
        const status = item.status_presenca || "pendente";
        const presente = status === "presente" ? 1 : 0;

        const [existentes] = await conn.query(
          `
          SELECT id
          FROM presencas
          WHERE treinamento_id = ? AND treinando_nome = ? AND data_chamada = ?
          LIMIT 1
          `,
          [treinamento_id, item.nome, data_chamada]
        );

        if (existentes.length) {
          await conn.query(
            `
            UPDATE presencas
            SET presente = ?, status = ?, justificativa = ?, data_chamada = ?
            WHERE id = ?
            `,
            [
              presente,
              status,
              item.justificativa || null,
              data_chamada,
              existentes[0].id,
            ]
          );
        } else {
          // Fase 4 (isolamento multi-tenant): faltava gravar empresa_id aqui —
          // era o único caminho de criação de `presencas` que não preenchia a
          // coluna (o CRUD genérico de /api/presencas injeta automaticamente).
          // Sem isso, a chamada salva por esta tela nunca aparecia em
          // GET /api/presencas (que filtra por empresa_id) e não podia ser
          // editada/excluída por lá.
          await conn.query(
            `
            INSERT INTO presencas
            (treinamento_id, treinando_nome, data_chamada, presente, status, justificativa, empresa_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              treinamento_id,
              item.nome,
              data_chamada,
              presente,
              status,
              item.justificativa || null,
              empresaIdParaGravar,
            ]
          );
        }

        if (item.id) {
          await conn.query(
            `
            UPDATE treinamento_participantes
            SET status_presenca = ?, justificativa = ?
            WHERE id = ? AND treinamento_id = ?
            `,
            [
              status,
              item.justificativa || null,
              item.id,
              treinamento_id,
            ]
          );
        }
      }
    });

    return res.json({
      ok: true,
      message: "Chamada diária salva com sucesso",
    });
  } catch (error) {
    console.error("[treinamentoParticipantesController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar chamada diária"});
  }
}

// 28/10/2026 — log das recusas (4xx) desta rota: até aqui só o 500 era registrado, então
// quando uma inclusão era barrada não sobrava rastro nos logs do Railway. Sem CPF no log.
function recusarParticipante(req, res, status, message, extra = {}) {
  console.warn(
    `[participantes] ${status} turma=${req.params?.id || "?"} perfil=${req.user?.perfil || "?"} usuario=${req.user?.id || "?"} motivo="${message}"`
  );
  return res.status(status).json({ ok: false, message, ...extra });
}

// 28/10/2026 — Operação e data de admissão não ficam no cadastro da pessoa, ficam em cada linha
// de turma. Ao reaproveitar uma pessoa que já existe, traz os valores mais recentes que ela já
// teve em outra turma, para quem inclui não precisar redigitar.
async function dadosAnterioresDaPessoa(conn, pessoaId) {
  if (!pessoaId) return { operacao: "", data_admissao: null };
  let operacao = "";
  let data_admissao = null;
  try {
    const [pr] = await conn.query(
      `SELECT operacao, DATE_FORMAT(data_admissao, '%Y-%m-%d') AS data_admissao FROM pessoas WHERE id = ? LIMIT 1`,
      [pessoaId]
    );
    operacao = String(pr[0]?.operacao || "").trim();
    data_admissao = pr[0]?.data_admissao || null;
  } catch (e) {
    if (!(e && e.code === "ER_BAD_FIELD_ERROR")) throw e;
  }
  if (!operacao || !data_admissao) {
    const [rows] = await conn.query(
      `SELECT operacao, DATE_FORMAT(data_admissao, '%Y-%m-%d') AS data_admissao
         FROM treinamento_participantes WHERE pessoa_id = ? ORDER BY id DESC LIMIT 30`,
      [pessoaId]
    );
    if (!operacao) operacao = String((rows.find((r) => String(r.operacao || "").trim()) || {}).operacao || "").trim();
    if (!data_admissao) data_admissao = (rows.find((r) => r.data_admissao) || {}).data_admissao || null;
  }
  return { operacao, data_admissao };
}

const semZeros = (v) => String(v || "").trim().toUpperCase().replace(/^0+(?=\d)/, "");

async function createParticipanteTreinamento(req, res) {
  try {
    const treinamento_id = Number(req.params?.id || req.body?.treinamento_id || 0);
    const {
      nome,
      matricula,
      cliente,
      turma,
      supervisor,
      operacao,
      data_admissao,
      cpf,
      pessoa_id,
    } = req.body || {};

    let nomeTrim = String(nome || "").trim();
    let matriculaTrim = String(matricula || "").trim();
    let cpfNormalizado = normalizarCpf(cpf);
    const pessoaEscolhidaId = Number(pessoa_id) > 0 ? Number(pessoa_id) : null;

    if (!treinamento_id) {
      return recusarParticipante(req, res, 400, "Turma não identificada.");
    }
    if (cpf && !cpfNormalizado && !pessoaEscolhidaId) {
      return recusarParticipante(req, res, 400, "CPF inválido — informe os 11 dígitos, com ou sem pontuação");
    }

    const { empresaId: empresaIdParticipante } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    if (!(await treinamentoPertenceAoTenant(db, treinamento_id, empresaIdParticipante, req))) {
      return recusarParticipante(req, res, 404, "Treinamento não encontrado");
    }
    const empresaIdTurma = await empresaRealDoTreinamento(db, treinamento_id);

    // Pessoa escolhida na busca ("Incluir pessoa já cadastrada"): nome, matrícula e CPF vêm do
    // cadastro — quem inclui não precisa redigitar nem conhecer o CPF.
    let pessoaEscolhida = null;
    if (pessoaEscolhidaId) {
      const [pr] = await db.query(`SELECT * FROM pessoas WHERE id = ? AND empresa_id = ? LIMIT 1`, [
        pessoaEscolhidaId,
        empresaIdTurma,
      ]);
      pessoaEscolhida = pr[0] || null;
      if (!pessoaEscolhida) {
        return recusarParticipante(req, res, 404, "Pessoa não encontrada neste ambiente.");
      }
      nomeTrim = pessoaEscolhida.nome;
      matriculaTrim = matriculaTrim || pessoaEscolhida.matricula || "";
      cpfNormalizado = cpfNormalizado || pessoaEscolhida.cpf || null;
    }

    // Matrícula/CPF deixaram de ser exigidos de quem já tem cadastro: sem nenhum dos dois, o
    // portal procura a pessoa pelo nome (se houver uma só, vincula; se houver várias, pede escolha).
    if (!nomeTrim) {
      return recusarParticipante(req, res, 400, "Informe o nome do participante.");
    }

    // Dedup nesta turma. Matrícula (sem zeros à esquerda) e CPF identificam a pessoa; o NOME só
    // barra quando não há como distinguir (quem chegou ou quem já está na turma não tem matrícula/CPF)
    // — antes, dois homônimos com matrículas diferentes eram barrados como se fossem a mesma pessoa.
    const condicoesDup = [];
    const paramsDup = [];
    if (pessoaEscolhida) { condicoesDup.push("pessoa_id = ?"); paramsDup.push(pessoaEscolhida.id); }
    if (matriculaTrim) {
      condicoesDup.push("(matricula IS NOT NULL AND TRIM(matricula) <> '' AND UPPER(TRIM(LEADING '0' FROM TRIM(matricula))) = ?)");
      paramsDup.push(semZeros(matriculaTrim));
    }
    if (cpfNormalizado) { condicoesDup.push("cpf = ?"); paramsDup.push(cpfNormalizado); }
    if (!matriculaTrim && !cpfNormalizado) {
      condicoesDup.push("nome = ?");
      paramsDup.push(nomeTrim);
    } else {
      condicoesDup.push("(nome = ? AND COALESCE(TRIM(matricula),'') = '' AND COALESCE(cpf,'') = '')");
      paramsDup.push(nomeTrim);
    }

    const [existentes] = await db.query(
      `SELECT id, nome, matricula FROM treinamento_participantes
        WHERE treinamento_id = ? AND (${condicoesDup.join(" OR ")}) LIMIT 1`,
      [treinamento_id, ...paramsDup]
    );
    if (existentes.length) {
      const e = existentes[0];
      return recusarParticipante(
        req, res, 409,
        `${e.nome}${e.matricula ? ` (matrícula ${e.matricula})` : ""} já está nesta turma.`,
        { ja_na_turma: true }
      );
    }

    const clienteTrim = String(cliente || "").trim();

    // Mesma matrícula de OUTRA pessoa (nome diferente) no mesmo cliente: não cria segunda pessoa.
    if (!pessoaEscolhida && matriculaTrim) {
      const conflito = await acharConflitoMatricula(db, empresaIdTurma, {
        matricula: matriculaTrim, nome: nomeTrim, cpf: cpfNormalizado, cliente: clienteTrim,
      });
      if (conflito) {
        return recusarParticipante(
          req, res, 409,
          `A matrícula ${matriculaTrim} já está cadastrada para "${conflito.nome}"${conflito.cliente ? ` (${conflito.cliente})` : ""}. Se é a mesma pessoa, use "Incluir pessoa já cadastrada" (ou digite o nome igual ao cadastro); se é outra pessoa, confira a matrícula.`,
          { conflito_matricula: true, pessoa_existente: { id: conflito.id, nome: conflito.nome, matricula: conflito.matricula, cliente: conflito.cliente } }
        );
      }
    }

    const resolvida = await resolverPessoa(
      { empresaId: empresaIdTurma, nome: nomeTrim, cpf: cpfNormalizado, matricula: matriculaTrim, cliente: clienteTrim },
      db,
      { vinculoAmplo: true, idPessoa: pessoaEscolhida?.id || null, manterNome: !!pessoaEscolhida }
    );
    if (resolvida.ambigua) {
      return recusarParticipante(
        req, res, 409,
        `Há ${resolvida.ambigua.length} pessoas cadastradas com o nome "${nomeTrim}" (${resolvida.ambigua.slice(0, 5).map((c) => c.matricula ? `matrícula ${c.matricula}` : c.cliente || "sem matrícula").join("; ")}). Use "Incluir pessoa já cadastrada" para escolher, ou informe matrícula ou CPF.`,
        {
          ambiguo: true,
          candidatas: resolvida.ambigua.map((c) => ({ id: c.id, nome: c.nome, matricula: c.matricula, cliente: c.cliente })),
        }
      );
    }
    const pessoa = resolvida.pessoa;

    // Pessoa já na turma por outro caminho (ex.: casada pelo nome com quem já está na lista).
    const [jaPessoa] = await db.query(
      `SELECT id FROM treinamento_participantes WHERE treinamento_id = ? AND pessoa_id = ? LIMIT 1`,
      [treinamento_id, pessoa.id]
    );
    if (jaPessoa.length) {
      return recusarParticipante(req, res, 409, `${pessoa.nome} já está nesta turma.`, { ja_na_turma: true });
    }

    const anterior = await dadosAnterioresDaPessoa(db, pessoa.id);
    const operacaoGravar = String(operacao || "").trim() || anterior.operacao;
    const admissaoGravar = data_admissao ? formatExcelDateToMySQL(data_admissao) : anterior.data_admissao;
    const matriculaGravar = matriculaTrim || pessoa.matricula || "";
    const cpfGravar = cpfNormalizado || pessoa.cpf || null;

    const [result] = await db.query(
      `
      INSERT INTO treinamento_participantes
      (
        treinamento_id,
        nome,
        matricula,
        cliente,
        turma,
        supervisor,
        operacao,
        data_admissao,
        cpf,
        status_presenca,
        justificativa,
        pessoa_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        treinamento_id,
        pessoa.nome || nomeTrim,
        matriculaGravar,
        clienteTrim,
        String(turma || "").trim(),
        String(supervisor || "").trim(),
        operacaoGravar,
        admissaoGravar,
        cpfGravar,
        "pendente",
        null,
        pessoa.id,
      ]
    );

    await gravarDadosDaPessoa(db, pessoa.id, { operacao: operacaoGravar, data_admissao: admissaoGravar });

    const provisionamento = await garantirUsuarioTreinando({
      pessoa,
      empresaId: empresaIdTurma,
      cliente: clienteTrim,
    });

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM treinamento_participantes WHERE treinamento_id = ?`,
      [treinamento_id]
    );

    try {
      await db.query(`UPDATE treinamentos SET participantes = ? WHERE id = ?`, [
        Number(countRow?.total || 0),
        treinamento_id,
      ]);
    } catch {}

    const reaproveitada = !resolvida.criada;
    const conta = provisionamento.criado
      ? "criada"
      : provisionamento.motivo === "sem_cpf_matricula"
      ? "sem_login"
      : provisionamento.motivo === "conta_existente_vinculada"
      ? "vinculada"
      : "existente";

    let mensagem = "Participante adicionado com sucesso";
    if (reaproveitada) mensagem = `${pessoa.nome} já tinha cadastro no portal — vinculado(a) à turma sem duplicar.`;
    if (conta === "sem_login") mensagem += " Atenção: sem matrícula ou CPF a pessoa ainda não consegue entrar no portal.";

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: mensagem,
      conta_criada: !!provisionamento.criado,
      vinculo: {
        pessoa_id: pessoa.id,
        pessoa_nova: !!resolvida.criada,
        casada_por: resolvida.casadaPor,
        conta,
      },
    });
  } catch (error) {
    console.error("[treinamentoParticipantesController]", error.message || error, error.code || "");
    return res.status(500).json({
      ok: false,
      message: "Erro ao adicionar participante"});
  }
}

// GET /api/treinamentos/:id/pessoas-cadastradas?busca= — 28/10/2026.
// "Incluir pessoa já cadastrada": procura no Cadastro Único do ambiente da turma (nome, matrícula
// ou CPF) e diz, para cada pessoa, se já está nesta turma e se tem conta de acesso (e se já entrou).
// Instrutor/supervisor só enxergam pessoas dos seus clientes (ou sem cliente); CPF só vai para
// quem já pode ver CPF, e mascarado para os demais.
async function buscarPessoasParaTurma(req, res) {
  try {
    const treinamento_id = Number(req.params?.id || 0);
    const termo = String(req.query?.busca || "").trim();
    if (termo.length < 2) return res.json({ ok: true, itens: [] });

    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    if (!treinamento_id || !(await treinamentoPertenceAoTenant(db, treinamento_id, empresaId, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    const empresaIdTurma = await empresaRealDoTreinamento(db, treinamento_id);

    const digitos = termo.replace(/\D/g, "");
    const cond = ["p.nome LIKE ?"];
    const params = [`%${termo}%`];
    if (digitos.length >= 4) {
      cond.push("p.matricula = ?", "p.cpf = ?", "TRIM(LEADING '0' FROM p.matricula) = ?");
      params.push(digitos, digitos, digitos.replace(/^0+/, ""));
    }

    const [rows] = await db.query(
      `SELECT p.id, p.nome, p.cpf, p.matricula, p.cliente, p.status_identidade,
              (SELECT COUNT(*) FROM treinamento_participantes tp WHERE tp.treinamento_id = ? AND tp.pessoa_id = p.id) AS na_turma,
              COALESCE(NULLIF(TRIM(p.operacao),''), (SELECT tp2.operacao FROM treinamento_participantes tp2 WHERE tp2.pessoa_id = p.id AND TRIM(COALESCE(tp2.operacao,'')) <> '' ORDER BY tp2.id DESC LIMIT 1)) AS operacao,
              COALESCE(DATE_FORMAT(p.data_admissao, '%Y-%m-%d'), (SELECT DATE_FORMAT(tp3.data_admissao, '%Y-%m-%d') FROM treinamento_participantes tp3 WHERE tp3.pessoa_id = p.id AND tp3.data_admissao IS NOT NULL ORDER BY tp3.id DESC LIMIT 1)) AS data_admissao,
              (SELECT u.id FROM usuarios u WHERE u.pessoa_id = p.id ORDER BY u.id LIMIT 1) AS usuario_id,
              (SELECT u.ativo FROM usuarios u WHERE u.pessoa_id = p.id ORDER BY u.id LIMIT 1) AS conta_ativa,
              (SELECT u.troca_senha_obrigatoria FROM usuarios u WHERE u.pessoa_id = p.id ORDER BY u.id LIMIT 1) AS primeiro_acesso_pendente
         FROM pessoas p
        WHERE p.empresa_id = ? AND (${cond.join(" OR ")})
        ORDER BY p.nome ASC
        LIMIT 30`,
      [treinamento_id, empresaIdTurma, ...params]
    );

    const podeCpf = usuarioPodeVerCpf(req);
    const itens = rows
      .filter((p) => usuarioTemAcessoAoCliente(req, p.cliente))
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        matricula: p.matricula,
        cliente: p.cliente,
        operacao: p.operacao || null,
        data_admissao: p.data_admissao || null,
        cpf_final: p.cpf ? String(p.cpf).slice(-2) : null,
        cpf: podeCpf ? p.cpf : undefined,
        na_turma: Number(p.na_turma) > 0,
        conta: p.usuario_id ? (Number(p.conta_ativa) === 0 ? "inativa" : Number(p.primeiro_acesso_pendente) === 1 ? "aguardando_primeiro_acesso" : "ativa") : "sem_conta",
      }));

    // Contas criadas à mão (Gestão de Usuários) sem vínculo com o cadastro de pessoas.
    const [orfas] = await db.query(
      `SELECT id, nome, cliente, ativo FROM usuarios
        WHERE empresa_id = ? AND pessoa_id IS NULL AND perfil = 'treinando' AND nome LIKE ? LIMIT 10`,
      [empresaIdTurma, `%${termo}%`]
    );
    const contasSemCadastro = orfas
      .filter((u) => usuarioTemAcessoAoCliente(req, u.cliente))
      .map((u) => ({ usuario_id: u.id, nome: u.nome, cliente: u.cliente, ativo: Number(u.ativo) !== 0 }));

    return res.json({ ok: true, itens, contas_sem_cadastro: contasSemCadastro });
  } catch (error) {
    console.error("[participantes] buscarPessoasParaTurma:", error.message || error, error.code || "");
    return res.status(500).json({ ok: false, message: "Erro ao buscar pessoas" });
  }
}

async function deleteParticipanteTreinamento(req, res) {
  try {
    const { id } = req.params;
    const { empresaId: empresaIdDelete } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const tenantJoin = empresaIdDelete
      ? " AND EXISTS (SELECT 1 FROM treinamentos t WHERE t.id = tp.treinamento_id AND t.empresa_id = ?)"
      : "";
    const params = empresaIdDelete ? [id, empresaIdDelete] : [id];

    // Pacote 3 (acesso restrito por cliente, generalizar): junta o cliente
    // do treinamento pra confirmar, abaixo, que instrutor/treinando só
    // excluem participante de turma do(s) próprio(s) cliente(s) — mesma
    // lacuna já fechada para leitura/importação/chamada acima.
    const [rows] = await db.query(
      `
      SELECT tp.id, tp.treinamento_id, tp.nome, t.cliente AS treinamento_cliente
      FROM treinamento_participantes tp
      JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.id = ?${tenantJoin}
      LIMIT 1
      `,
      params
    );

    if (!rows.length || !usuarioTemAcessoAoCliente(req, rows[0].treinamento_cliente)) {
      return res.status(404).json({
        ok: false,
        message: "Participante não encontrado",
      });
    }

    const participante = rows[0];

    // Presenças + participante numa transação só (21/10/2026).
    await comTransacao(async (conn) => {
      await conn.query(
        `
        DELETE FROM presencas
        WHERE treinamento_id = ? AND treinando_nome = ?
        `,
        [participante.treinamento_id, participante.nome]
      );

      await conn.query(
        `
        DELETE FROM treinamento_participantes
        WHERE id = ?
        `,
        [id]
      );
    });

    return res.json({
      ok: true,
      message: "Participante excluído com sucesso",
    });
  } catch (error) {
    console.error("[treinamentoParticipantesController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir participante"});
  }
}

async function deleteParticipantesTreinamentoBulk(req, res) {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({
        ok: false,
        message: "Informe os ids dos participantes",
      });
    }

    const placeholders = ids.map(() => "?").join(", ");
    const { empresaId: empresaIdBulk } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const tenantJoin = empresaIdBulk
      ? " AND EXISTS (SELECT 1 FROM treinamentos t WHERE t.id = tp.treinamento_id AND t.empresa_id = ?)"
      : "";
    const params = empresaIdBulk ? [...ids, empresaIdBulk] : ids;

    // Pacote 3 (acesso restrito por cliente, generalizar): mesma junção com
    // o cliente do treinamento usada em deleteParticipanteTreinamento —
    // linhas de um cliente fora do alcance do usuário são descartadas
    // abaixo, do mesmo jeito que já acontecia pra linhas de outro tenant.
    const [todasAsLinhas] = await db.query(
      `
      SELECT tp.id, tp.treinamento_id, tp.nome, t.cliente AS treinamento_cliente
      FROM treinamento_participantes tp
      JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.id IN (${placeholders})${tenantJoin}
      `,
      params
    );
    const rows = todasAsLinhas.filter((r) =>
      usuarioTemAcessoAoCliente(req, r.treinamento_cliente)
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Nenhum participante encontrado",
      });
    }

    // Usa só os ids confirmados como do tenant (rows), não o `ids` bruto do
    // corpo da requisição — senão um id de outra empresa misturado na lista
    // seria excluído mesmo depois de barrado no SELECT acima.
    const idsConfirmados = rows.map((r) => r.id);
    const placeholdersConfirmados = idsConfirmados.map(() => "?").join(", ");

    // Presenças de todos + participantes numa transação só (21/10/2026).
    await comTransacao(async (conn) => {
      for (const participante of rows) {
        await conn.query(
          `
          DELETE FROM presencas
          WHERE treinamento_id = ? AND treinando_nome = ?
          `,
          [participante.treinamento_id, participante.nome]
        );
      }
      await conn.query(
        `
        DELETE FROM treinamento_participantes
        WHERE id IN (${placeholdersConfirmados})
        `,
        idsConfirmados
      );
    });

    return res.json({
      ok: true,
      message: "Participantes excluídos com sucesso",
      total: rows.length,
    });
  } catch (error) {
    console.error("[treinamentoParticipantesController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir participantes"});
  }
}

function formatExcelDateToMySQL(value) {
  if (!value) return null;

  if (typeof value === "number") {
    const jsDate = XLSX.SSF.parse_date_code(value);
    if (!jsDate) return null;

    const yyyy = String(jsDate.y).padStart(4, "0");
    const mm = String(jsDate.m).padStart(2, "0");
    const dd = String(jsDate.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const us = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (us) {
    return `${us[1]}-${us[2]}-${us[3]}`;
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = String(date.getFullYear()).padStart(4, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

// "Exportar 1ª aula" (telas Cronograma e Pessoas da turma): o botão chamava
// /treinamentos/:id/exportar-primeira-aula, rota que nunca existiu — o clique
// terminava em erro. Gera a lista de quem inicia a turma (útil para liberar
// acessos/crachás e conferir quem é esperado no primeiro dia), com o resumo
// da turma no topo e uma coluna em branco para a assinatura na entrada.
async function exportarPrimeiraAula(req, res) {
  try {
    const { id } = req.params;
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    if (!(await treinamentoPertenceAoTenant(db, id, empresaId, req))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const [trRows] = await db.query(
      `SELECT tema, cliente, instrutor, supervisor, data_inicio, hora_inicio, hora_fim
         FROM treinamentos WHERE id = ? LIMIT 1`,
      [id]
    );
    const tr = trRows[0] || {};

    // Data da 1ª aula: a mais antiga do cronograma; sem cronograma, a data de início da turma.
    const [aulaRows] = await db.query(
      `SELECT MIN(data_aula) AS primeira FROM turma_aulas
        WHERE treinamento_id = ? AND COALESCE(status_execucao, '') <> 'cancelada'`,
      [id]
    );
    const primeira = aulaRows[0]?.primeira || tr.data_inicio || null;

    const [pessoas] = await db.query(
      `SELECT nome, matricula, cpf, operacao, supervisor, data_admissao
         FROM treinamento_participantes
        WHERE treinamento_id = ?
        ORDER BY nome ASC`,
      [id]
    );
    const comCpf = usuarioPodeVerCpf(req);

    const { novoWorkbook, estilizarCabecalho, FORMATO_DATA, paraDate } = require("../lib/excelExport");
    const wb = novoWorkbook();
    const ws = wb.addWorksheet("1ª aula");

    const info = [
      ["Turma", tr.tema || "—"],
      ["Cliente", tr.cliente || "—"],
      ["Instrutor", tr.instrutor || "—"],
      ["Supervisor", tr.supervisor || "—"],
      ["Data da 1ª aula", paraDate(primeira) || "—"],
      ["Horário", [tr.hora_inicio, tr.hora_fim].filter(Boolean).map((h) => String(h).slice(0, 5)).join(" às ") || "—"],
      ["Total de participantes", pessoas.length],
    ];
    info.forEach(([rotulo, valor], i) => {
      const r = i + 1;
      ws.getCell(r, 1).value = rotulo;
      ws.getCell(r, 1).font = { bold: true };
      const c = ws.getCell(r, 2);
      c.value = valor;
      if (valor instanceof Date) c.numFmt = FORMATO_DATA;
      c.alignment = { horizontal: "left" };
    });

    const colunas = [
      { titulo: "Nº", largura: 6 },
      { titulo: "Nome", largura: 38 },
      { titulo: "Matrícula", largura: 14 },
      ...(comCpf ? [{ titulo: "CPF", largura: 16 }] : []),
      { titulo: "Operação", largura: 22 },
      { titulo: "Supervisor", largura: 22 },
      { titulo: "Data de admissão", largura: 16 },
      { titulo: "Assinatura", largura: 30 },
    ];
    ws.columns = colunas.map((c) => ({ width: c.largura }));
    const cab = info.length + 2;
    colunas.forEach((c, i) => { ws.getCell(cab, i + 1).value = c.titulo; });
    estilizarCabecalho(ws, cab, colunas.length);

    pessoas.forEach((p, idx) => {
      const r = cab + 1 + idx;
      let col = 1;
      ws.getCell(r, col++).value = idx + 1;
      ws.getCell(r, col++).value = p.nome || "";
      ws.getCell(r, col++).value = p.matricula || "";
      if (comCpf) ws.getCell(r, col++).value = p.cpf || "";
      ws.getCell(r, col++).value = p.operacao || "";
      ws.getCell(r, col++).value = p.supervisor || "";
      const adm = ws.getCell(r, col++);
      const d = paraDate(p.data_admissao);
      if (d) { adm.value = d; adm.numFmt = FORMATO_DATA; }
      ws.getCell(r, col++).value = "";
      ws.getRow(r).height = 22;
    });
    ws.views = [{ state: "frozen", ySplit: cab }];

    const buf = await wb.xlsx.writeBuffer();
    const nome = String(tr.tema || "turma").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "turma";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="primeira_aula_${nome}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[participantes] exportarPrimeiraAula:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao exportar a lista da primeira aula" });
  }
}

module.exports = {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  baixarModeloImportacaoParticipantes,
  exportarPrimeiraAula,
  salvarChamadaParticipantes,
  createParticipanteTreinamento,
  buscarPessoasParaTurma,
  deleteParticipanteTreinamento,
  deleteParticipantesTreinamentoBulk,
};
