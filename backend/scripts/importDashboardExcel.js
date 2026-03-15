const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pool = require('../lib/db');

const DEFAULT_FILE = path.resolve(process.cwd(), '../Dashboard_TD.xlsx');
const args = process.argv.slice(2);
const sourceArg = args.find((arg) => !arg.startsWith('--'));
const sourceFile = sourceArg ? path.resolve(process.cwd(), sourceArg) : DEFAULT_FILE;
const shouldTruncate = args.includes('--truncate');

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function titleCase(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/\bTd\b/g, 'T&D')
    .replace(/\bDa\b/g, 'da')
    .replace(/\bDe\b/g, 'de')
    .replace(/\bDo\b/g, 'do')
    .replace(/\bDos\b/g, 'dos')
    .replace(/\bDas\b/g, 'das');
}

function normalizeClient(value) {
  const text = normalizeText(value).toUpperCase();
  const map = {
    'MERCANTIL': 'Mercantil',
    'PREFEITURA DE SALVADOR': 'Prefeitura de Salvador',
    'REDE AMÉRICAS': 'Rede Américas',
    'REDE AMERICAS': 'Rede Américas',
    'AGIBANK': 'Agibank',
    'CLARO': 'Claro',
    'BUSER': 'Buser',
    'CREA': 'Crea',
    'HUGSNET': 'Hugsnet'
  };
  return map[text] || titleCase(text);
}

function sanitizeEmail(name, domain = 'teltd.local') {
  const base = normalizeText(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'usuario';
  return `${base}@${domain}`;
}

function asNumber(value, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function excelDateToMysql(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function buildTrainingTheme(row) {
  const turma = normalizeText(row['Turma']);
  const tipo = normalizeText(row['Tipo_Treinamento']);
  const cliente = normalizeClient(row['Cliente']);
  if (turma) return turma;
  if (tipo && cliente) return `${tipo} - ${cliente}`;
  return tipo || cliente || 'Treinamento importado';
}

function buildDescription(row) {
  const partes = [];
  const data = excelDateToMysql(row['Data']);
  const supervisor = titleCase(row['Supervisor']);
  if (data) partes.push(`Data-base: ${data}`);
  if (supervisor) partes.push(`Supervisor: ${supervisor}`);
  if (normalizeText(row['Observações'])) partes.push(`Obs.: ${normalizeText(row['Observações'])}`);
  return partes.join(' | ');
}

async function tableColumns(table) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table}`);
  return new Set(rows.map((row) => row.Field));
}

async function ensureColumn(table, definition) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    // ignore if column already exists
  }
}

async function ensureSchema() {
  await ensureColumn('clientes', 'segmento VARCHAR(100) NULL');
  await ensureColumn('clientes', 'gestor VARCHAR(150) NULL');
  await ensureColumn('clientes', 'descricao TEXT NULL');
  await ensureColumn('clientes', 'supervisor VARCHAR(150) NULL');
  await ensureColumn('clientes', 'observacoes TEXT NULL');

  await ensureColumn('usuarios', 'troca_senha_obrigatoria TINYINT(1) DEFAULT 1');

  await ensureColumn('treinamentos', 'participantes INT DEFAULT 0');
  await ensureColumn('treinamentos', 'participantes_previstos INT DEFAULT 0');
  await ensureColumn('treinamentos', 'participantes_presentes INT DEFAULT 0');
  await ensureColumn('treinamentos', 'concluidos INT DEFAULT 0');
  await ensureColumn('treinamentos', 'publico VARCHAR(150) NULL');
  await ensureColumn('treinamentos', 'status VARCHAR(50) DEFAULT "planejado"');
  await ensureColumn('treinamentos', 'descricao TEXT NULL');
  await ensureColumn('treinamentos', 'data DATE NULL');
  await ensureColumn('treinamentos', 'turma VARCHAR(150) NULL');
  await ensureColumn('treinamentos', 'supervisor VARCHAR(150) NULL');

  await ensureColumn('presencas', 'presente TINYINT(1) DEFAULT 0');
  await ensureColumn('presencas', 'status VARCHAR(20) NULL');
  await ensureColumn('presencas', 'justificativa TEXT NULL');

  await ensureColumn('avaliacoes', 'titulo VARCHAR(200) NULL');
  await ensureColumn('avaliacoes', 'nota_nps DECIMAL(10,2) DEFAULT 0');
  await ensureColumn('avaliacoes', 'nota_qualidade DECIMAL(10,2) DEFAULT 0');
  await ensureColumn('avaliacoes', 'nota_prova DECIMAL(10,2) DEFAULT 0');
  await ensureColumn('avaliacoes', 'observacoes TEXT NULL');
  await ensureColumn('avaliacoes', 'comentario TEXT NULL');
}

function readRows(file) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets['Base_Dados'];
  if (!sheet) throw new Error('A aba Base_Dados não foi encontrada no Excel.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  return rows.filter((row) => {
    const id = Number(row.ID);
    return Number.isFinite(id) && id > 0 && normalizeText(row.Cliente) && normalizeText(row.Tipo_Treinamento);
  });
}

async function upsertClient(row) {
  const nome = normalizeClient(row['Cliente']);
  const supervisor = titleCase(row['Supervisor']);
  const gestor = supervisor || 'Gestão T&D';
  const descricao = `Cliente importado da planilha Dashboard_TD.xlsx. Último treinamento lido: ${buildTrainingTheme(row)}.`;

  const [existing] = await pool.query('SELECT id FROM clientes WHERE nome = ? LIMIT 1', [nome]);
  if (existing.length) return existing[0].id;

  const cols = await tableColumns('clientes');
  const data = {
    nome,
    status: 'ativo',
    segmento: 'Operação',
    gestor,
    descricao,
    supervisor,
    observacoes: 'Registro criado automaticamente pelo importador do dashboard.'
  };

  const keys = Object.keys(data).filter((key) => cols.has(key));
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.query(`INSERT INTO clientes (${keys.join(', ')}) VALUES (${placeholders})`, values);
  return result.insertId;
}

async function upsertUser(nome, perfil, cliente) {
  const cleanName = titleCase(nome);
  if (!cleanName) return null;
  const email = sanitizeEmail(cleanName);
  const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (existing.length) return existing[0].id;
  const cols = await tableColumns('usuarios');
  const data = {
    nome: cleanName,
    email,
    senha: 'Tel@2026',
    perfil,
    cliente,
    ativo: 1,
    troca_senha_obrigatoria: 1
  };
  const keys = Object.keys(data).filter((key) => cols.has(key));
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.query(`INSERT INTO usuarios (${keys.join(', ')}) VALUES (${placeholders})`, values);
  return result.insertId;
}

async function insertTraining(row) {
  const cols = await tableColumns('treinamentos');
  const participantes = asNumber(row['Participantes']);
  const presencas = asNumber(row['Presenças']);
  const faltas = participantes - presencas;
  const data = {
    tema: buildTrainingTheme(row),
    cliente: normalizeClient(row['Cliente']),
    instrutor: titleCase(row['Instrutor']),
    carga_horaria: 4,
    participantes,
    participantes_previstos: participantes,
    participantes_presentes: presencas,
    concluidos: presencas,
    publico: 'Operação',
    status: faltas > 0 ? 'em_andamento' : 'concluido',
    descricao: buildDescription(row),
    data: excelDateToMysql(row['Data']),
    turma: normalizeText(row['Turma']) || buildTrainingTheme(row),
    supervisor: titleCase(row['Supervisor'])
  };
  const keys = Object.keys(data).filter((key) => cols.has(key));
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.query(`INSERT INTO treinamentos (${keys.join(', ')}) VALUES (${placeholders})`, values);
  return { id: result.insertId, participantes, presencas, faltas, data };
}

async function insertAttendance(trainingId, row, trainingMeta) {
  const cols = await tableColumns('presencas');
  const turma = normalizeText(row['Turma']) || buildTrainingTheme(row);
  const presentRows = [];
  const absentRows = [];
  for (let i = 1; i <= trainingMeta.presencas; i += 1) {
    presentRows.push({
      treinamento_id: trainingId,
      treinando_nome: `${turma} - Participante ${String(i).padStart(3, '0')}`,
      presente: 1,
      status: 'presente',
      justificativa: null
    });
  }
  for (let i = 1; i <= trainingMeta.faltas; i += 1) {
    absentRows.push({
      treinamento_id: trainingId,
      treinando_nome: `${turma} - Participante ${String(trainingMeta.presencas + i).padStart(3, '0')}`,
      presente: 0,
      status: 'ausente',
      justificativa: 'Importado de consolidado de turma.'
    });
  }

  const allRows = [...presentRows, ...absentRows];
  if (!allRows.length) return 0;

  const keys = ['treinamento_id', 'treinando_nome', 'presente', 'status', 'justificativa'].filter((key) => cols.has(key));
  let inserted = 0;
  for (const item of allRows) {
    const values = keys.map((key) => item[key]);
    const placeholders = keys.map(() => '?').join(', ');
    await pool.query(`INSERT INTO presencas (${keys.join(', ')}) VALUES (${placeholders})`, values);
    inserted += 1;
  }
  return inserted;
}

async function insertEvaluation(trainingId, row, trainingMeta) {
  const nota = row['Avaliação (0-10)'];
  if (nota === null || nota === undefined || nota === '') return false;
  const cols = await tableColumns('avaliacoes');
  const data = {
    treinamento_id: trainingId,
    titulo: `Avaliação - ${buildTrainingTheme(row)}`,
    nota_nps: asNumber(nota),
    nota_qualidade: asNumber(nota),
    nota_prova: 0,
    observacoes: `Importado da planilha do dashboard. Presença: ${trainingMeta.presencas}/${trainingMeta.participantes}.`,
    comentario: normalizeText(row['Observações']) || null
  };
  const keys = Object.keys(data).filter((key) => cols.has(key));
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => '?').join(', ');
  await pool.query(`INSERT INTO avaliacoes (${keys.join(', ')}) VALUES (${placeholders})`, values);
  return true;
}

async function truncateData() {
  const tables = ['avaliacoes', 'presencas', 'treinamentos', 'usuarios', 'clientes'];
  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM ${table}`);
    } catch (error) {
      console.warn(`Não foi possível limpar ${table}: ${error.message}`);
    }
  }
}

async function main() {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Arquivo não encontrado: ${sourceFile}`);
  }

  await ensureSchema();
  if (shouldTruncate) await truncateData();

  const rows = readRows(sourceFile);
  const summary = {
    linhasLidas: rows.length,
    clientesCriados: 0,
    usuariosCriados: 0,
    treinamentosCriados: 0,
    presencasCriadas: 0,
    avaliacoesCriadas: 0
  };

  const existingClients = new Set();
  const existingUsers = new Set();

  for (const row of rows) {
    const clientName = normalizeClient(row['Cliente']);
    if (!existingClients.has(clientName)) {
      await upsertClient(row);
      existingClients.add(clientName);
      summary.clientesCriados += 1;
    }

    const instrutor = titleCase(row['Instrutor']);
    const supervisor = titleCase(row['Supervisor']);
    if (instrutor && !existingUsers.has(`instrutor:${instrutor}`)) {
      await upsertUser(instrutor, 'instrutor', clientName);
      existingUsers.add(`instrutor:${instrutor}`);
      summary.usuariosCriados += 1;
    }
    if (supervisor && !existingUsers.has(`supervisor:${supervisor}`)) {
      await upsertUser(supervisor, 'supervisor', clientName);
      existingUsers.add(`supervisor:${supervisor}`);
      summary.usuariosCriados += 1;
    }

    const training = await insertTraining(row);
    summary.treinamentosCriados += 1;

    summary.presencasCriadas += await insertAttendance(training.id, row, training);
    if (await insertEvaluation(training.id, row, training)) {
      summary.avaliacoesCriadas += 1;
    }
  }

  console.log('Importação concluída com sucesso.');
  console.table(summary);
}

main()
  .catch((error) => {
    console.error('Falha ao importar a planilha:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {}
  });
