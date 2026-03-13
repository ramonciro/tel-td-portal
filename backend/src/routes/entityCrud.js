const express = require("express")
const pool = require("../lib/db")

function createCrudRouter({ table, fields, orderBy = "id DESC" }) {
  const router = express.Router()
  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`)
      res.json(rows)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: `Erro ao listar ${table}` })
    }
  })
  router.post("/", async (req, res) => {
    try {
      const data = req.body || {}
      const cols = fields.filter((f) => Object.prototype.hasOwnProperty.call(data, f))
      if (!cols.length) return res.status(400).json({ message: "Nenhum campo válido enviado" })
      const placeholders = cols.map(() => "?").join(", ")
      const values = cols.map((c) => data[c])
      const [result] = await pool.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`, values)
      res.status(201).json({ id: result.insertId, message: "Registro criado com sucesso" })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: `Erro ao criar ${table}` })
    }
  })
  router.put("/:id", async (req, res) => {
    try {
      const data = req.body || {}
      const cols = fields.filter((f) => Object.prototype.hasOwnProperty.call(data, f))
      if (!cols.length) return res.status(400).json({ message: "Nenhum campo válido enviado" })
      const setClause = cols.map((c) => `${c} = ?`).join(", ")
      const values = cols.map((c) => data[c]); values.push(req.params.id)
      await pool.query(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values)
      res.json({ message: "Registro atualizado com sucesso" })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: `Erro ao atualizar ${table}` })
    }
  })
  router.delete("/:id", async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id])
      res.json({ message: "Registro excluído com sucesso" })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: `Erro ao excluir ${table}` })
    }
  })
  return router
}
module.exports = createCrudRouter
