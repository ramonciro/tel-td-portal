
const mysql = require("mysql2")

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
})

db.connect((err)=>{
  if(err){
    console.error("Erro ao conectar no banco:",err)
  }else{
    console.log("Banco conectado")
  }
})

module.exports = db
