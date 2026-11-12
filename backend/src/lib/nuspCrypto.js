/**
 * nuspCrypto.js — cifra do resumo curto do acolhimento (NUSPSI, Pacote 2, 11/2026).
 *
 * AES-256-GCM com chave de 32 bytes em NUSP_CRYPTO_KEY (base64 ou 64 caracteres hex),
 * guardada só nas variáveis do ambiente (Railway), nunca no código nem no banco.
 * Formato guardado: "v1:" + base64(iv[12] + tag[16] + texto cifrado).
 * O AAD amarra o texto à empresa: um resumo copiado para outro ambiente não abre.
 *
 * Sem chave configurada o servidor sobe normalmente; só o resumo deixa de poder ser
 * gravado ou lido (o resto do acolhimento funciona). CommonJS.
 */
const crypto = require("crypto");

const VERSAO = 1;

function chave() {
  const bruto = String(process.env.NUSP_CRYPTO_KEY || "").trim();
  if (!bruto) return null;
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(bruto)) buf = Buffer.from(bruto, "hex");
  else {
    try { buf = Buffer.from(bruto, "base64"); } catch (_) { buf = null; }
  }
  return buf && buf.length === 32 ? buf : null;
}

const chaveConfigurada = () => chave() !== null;

// O contexto separa os usos da mesma chave: um texto cifrado como "acolhimento" não abre como "pesquisa".
// O padrão ("acolhimento") mantém intacto tudo o que já foi gravado antes do Pacote 3.
const aad = (empresaId, contexto = "acolhimento") => Buffer.from(`nusp:${contexto}:${Number(empresaId)}`);

function cifrar(texto, empresaId, contexto = "acolhimento") {
  const k = chave();
  if (!k) { const e = new Error("NUSP_CRYPTO_KEY não configurada"); e.codigo = "SEM_CHAVE"; throw e; }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(aad(empresaId, contexto));
  const ct = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return `v${VERSAO}:` + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Devolve { texto } ou { erro: "SEM_CHAVE" | "ILEGIVEL" }. Nunca lança nem registra o conteúdo. */
function decifrar(valor, empresaId, contexto = "acolhimento") {
  if (!valor) return { texto: null };
  const k = chave();
  if (!k) return { erro: "SEM_CHAVE" };
  try {
    const m = String(valor).match(/^v(\d+):(.+)$/);
    if (!m || Number(m[1]) !== VERSAO) return { erro: "ILEGIVEL" };
    const raw = Buffer.from(m[2], "base64");
    if (raw.length < 29) return { erro: "ILEGIVEL" };
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAAD(aad(empresaId, contexto));
    d.setAuthTag(raw.subarray(12, 28));
    return { texto: Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8") };
  } catch (_) {
    return { erro: "ILEGIVEL" };
  }
}

module.exports = { cifrar, decifrar, chaveConfigurada, VERSAO };
