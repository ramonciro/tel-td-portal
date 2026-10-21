const mysql = require("mysql2/promise")
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  // 21/10/2026: em produção as chamadas ao servidor travaram por 30 a 90 segundos
  // sem erro nem uso de CPU (o navegador desistia). Conexão parada que o caminho
  // até o banco derruba em silêncio é a causa mais provável: o pool continuava
  // entregando essa conexão "morta" e a consulta ficava esperando. Estas opções:
  //  - keep-alive: mantém a conexão viva e acusa a queda;
  //  - connectTimeout: abrir conexão nova não espera para sempre;
  //  - maxIdle/idleTimeout: conexões paradas por mais de 1 min são descartadas
  //    e recriadas, em vez de reaproveitadas.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
  maxIdle: 5,
  idleTimeout: 60000,
})
module.exports = pool
