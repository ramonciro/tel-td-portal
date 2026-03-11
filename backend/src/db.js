import mysql from "mysql2/promise";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.MYSQL_URL ||
  process.env.DATABASE_PRIVATE_URL;

let pool;

if (connectionString) {
  pool = mysql.createPool(connectionString);
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "railway",
  });
}

export default pool;
