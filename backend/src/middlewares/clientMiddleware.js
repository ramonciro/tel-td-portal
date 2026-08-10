const db = require('../config/database'); // Ajuste o caminho se necessário para sua conexão

const clientMiddleware = async (req, res, next) => {
  // Pega o código do ambiente enviado pelo frontend via header ou query param (padrão: 'dasa')
  const clientCode = req.headers['x-client-id'] || req.query.cliente || 'dasa';

  try {
    const [rows] = await db.query(
      'SELECT id, codigo, nome FROM clientes WHERE codigo = ? AND ativo = 1', 
      [clientCode]
    );
    
    if (!rows || rows.length === 0) {
      // Fallback de segurança caso o cliente enviado não exista
      req.clienteId = 1;
      req.clienteCodigo = 'dasa';
    } else {
      req.clienteId = rows[0].id;
      req.clienteCodigo = rows[0].codigo;
    }

    next();
  } catch (error) {
    console.error("Erro no middleware de cliente:", error);
    // Fallback em caso de falha no banco
    req.clienteId = 1;
    req.clienteCodigo = 'dasa';
    next();
  }
};

module.exports = clientMiddleware;
