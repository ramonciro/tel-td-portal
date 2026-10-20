/**
 * codigoAcesso.js — código de primeiro acesso dos treinandos (21/10/2026)
 *
 * Decisão do Ramon: em vez de uma senha única para todos os treinandos
 * (Portal@2026), cada conta nova nasce com um código próprio, que vale como
 * senha inicial até a pessoa criar a dela (troca obrigatória, como já era).
 * O código fica visível para a coordenação (para entregar à pessoa) apenas
 * enquanto a senha não for trocada; no primeiro acesso ele é apagado.
 *
 * Alfabeto sem 0/O/1/I/L para não confundir quando é lido em voz alta ou
 * impresso. Formato XXXX-XXXX; no login, hífen/espaço/minúsculas são ignorados.
 */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const VALIDADE_DIAS = 14;

function gerarCodigo() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Forma usada para guardar o hash e para comparar no login.
function canonico(valor) {
  return String(valor || "").toUpperCase().replace(/[\s-]/g, "");
}

function expiraEm(dias = VALIDADE_DIAS) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Define um código novo para o usuário. `conn` pode ser pool ou conexão de
 * transação. Devolve o código em claro (única vez em que ele é conhecido além
 * da coluna codigo_acesso).
 */
async function definirCodigo(conn, usuarioId) {
  const codigo = gerarCodigo();
  const hash = await bcrypt.hash(canonico(codigo), 10);
  await conn.query(
    `UPDATE usuarios
        SET senha = ?, troca_senha_obrigatoria = 1, codigo_acesso = ?, codigo_acesso_expira = ?
      WHERE id = ?`,
    [hash, codigo, expiraEm(), usuarioId]
  );
  return codigo;
}

module.exports = { gerarCodigo, canonico, expiraEm, definirCodigo, VALIDADE_DIAS };
