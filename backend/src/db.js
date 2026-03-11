import mysql from "mysql2/promise";

const connectionString = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada no Railway");
}

const pool = mysql.createPool(connectionString);

export default pool;
