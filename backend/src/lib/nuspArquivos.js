/**
 * nuspArquivos.js — arquivos de evidência do Núcleo (Pacote 4).
 *
 * Os arquivos ficam no volume de uploads (UPLOADS_DIR, no Railway /app/uploads), numa pasta própria
 * por empresa: <uploads>/nusp/<empresaId>/<nome-aleatório>.<ext>. O nome original só existe no banco;
 * em disco o nome é aleatório, então ninguém adivinha o endereço. O download passa por rota autenticada
 * (só equipe técnica do Núcleo) — não existe link público.
 * CommonJS — nunca usar import/export.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pastaUploads } = require("./uploadAssinado");

const LIMITE_BYTES = 15 * 1024 * 1024; // mesmo teto do upload do portal
const MAX_ARQUIVOS_POR_REGISTRO = 10;

// extensão → tipo de conteúdo + assinatura esperada no começo do arquivo (null = texto puro)
const TIPOS = {
  pdf:  { mime: "application/pdf", magic: [Buffer.from("%PDF")] },
  png:  { mime: "image/png", magic: [Buffer.from([0x89, 0x50, 0x4e, 0x47])] },
  jpg:  { mime: "image/jpeg", magic: [Buffer.from([0xff, 0xd8, 0xff])] },
  jpeg: { mime: "image/jpeg", magic: [Buffer.from([0xff, 0xd8, 0xff])] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [Buffer.from("PK")] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [Buffer.from("PK")] },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: [Buffer.from("PK")] },
  doc:  { mime: "application/msword", magic: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])] },
  xls:  { mime: "application/vnd.ms-excel", magic: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])] },
  ppt:  { mime: "application/vnd.ms-powerpoint", magic: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])] },
  csv:  { mime: "text/csv; charset=utf-8", magic: null },
  txt:  { mime: "text/plain; charset=utf-8", magic: null },
};
const EXTENSOES_ACEITAS = Object.keys(TIPOS);

function extensaoDe(nome) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(nome || "").trim());
  return m ? m[1].toLowerCase() : "";
}

// O navegador manda o nome em latin1 quando tem acento; devolve em UTF-8 e tira caracteres de controle e barras.
function nomeLimpo(nomeOriginal) {
  let n = String(nomeOriginal || "arquivo");
  try {
    const u = Buffer.from(n, "latin1").toString("utf8");
    if (!u.includes("�")) n = u;
  } catch (_) { /* mantém */ }
  n = n.replace(/[\u0000-\u001f\u007f\\/]/g, " ").replace(/\s+/g, " ").trim();
  if (n.length > 200) { const ext = extensaoDe(n); n = n.slice(0, 190) + (ext ? "." + ext : ""); }
  return n || "arquivo";
}

/** Confere nome e conteúdo. Devolve { ok: true, ext, mime, nome } ou { ok: false, message }. */
function validar(file) {
  if (!file || !file.buffer || !file.buffer.length) return { ok: false, message: "Escolha um arquivo para anexar." };
  if (file.buffer.length > LIMITE_BYTES) return { ok: false, message: "O arquivo passa de 15 MB. Reduza o tamanho ou anexe um link." };
  const nome = nomeLimpo(file.originalname);
  const ext = extensaoDe(nome);
  const t = TIPOS[ext];
  if (!t) return { ok: false, message: `Este tipo de arquivo não é aceito. Use ${EXTENSOES_ACEITAS.join(", ").toUpperCase()}.` };
  if (t.magic) {
    const bate = t.magic.some((m) => file.buffer.subarray(0, m.length).equals(m));
    if (!bate) return { ok: false, message: "O conteúdo do arquivo não confere com a extensão. Confira se ele não está corrompido." };
  } else if (file.buffer.subarray(0, 4096).includes(0)) {
    return { ok: false, message: "O conteúdo do arquivo não confere com a extensão. Confira se ele não está corrompido." };
  }
  return { ok: true, ext, mime: t.mime, nome };
}

const idSeguro = (n) => Number.isInteger(Number(n)) && Number(n) > 0;

/** Grava no volume. Devolve o caminho RELATIVO (guardado no banco). */
async function salvar(empresaId, buffer, ext) {
  if (!idSeguro(empresaId)) throw new Error("empresa inválida");
  const rel = path.posix.join("nusp", String(Number(empresaId)), `${crypto.randomBytes(16).toString("hex")}.${ext}`);
  const abs = path.join(pastaUploads(), ...rel.split("/"));
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer, { flag: "wx", mode: 0o640 });
  return rel;
}

/** Caminho absoluto de um caminho relativo guardado no banco — só se estiver na pasta da própria empresa. */
function caminhoAbsoluto(empresaId, rel) {
  if (!idSeguro(empresaId)) return null;
  const partes = String(rel || "").split("/");
  if (partes.length !== 3 || partes[0] !== "nusp" || partes[1] !== String(Number(empresaId))) return null;
  if (!/^[a-f0-9]{32}\.[a-z0-9]{1,5}$/.test(partes[2])) return null;
  return path.join(pastaUploads(), ...partes);
}

/** Apaga arquivos do volume; nunca lança erro (arquivo que já não existe não é problema). */
async function remover(empresaId, caminhos) {
  for (const rel of [].concat(caminhos || [])) {
    const abs = caminhoAbsoluto(empresaId, rel);
    if (!abs) continue;
    try { await fs.promises.unlink(abs); } catch (e) { if (e.code !== "ENOENT") console.error("[nusp.arquivos] falha ao apagar", e.message); }
  }
}

function abrir(empresaId, rel) {
  const abs = caminhoAbsoluto(empresaId, rel);
  if (!abs || !fs.existsSync(abs)) return null;
  return abs;
}

const mimeDe = (ext) => (TIPOS[ext] ? TIPOS[ext].mime : "application/octet-stream");

module.exports = { LIMITE_BYTES, MAX_ARQUIVOS_POR_REGISTRO, EXTENSOES_ACEITAS, validar, salvar, remover, abrir, mimeDe, extensaoDe };
