const express = require("express")
const router = express.Router()
const db = require("../database")

router.post("/login",(req,res)=>{

  const { email, senha } = req.body

  db.query(
    "SELECT * FROM usuarios WHERE email = ?",
    [email],
    (err,result)=>{

      if(err) return res.status(500).json(err)

      if(result.length === 0){
        return res.status(401).json({erro:"Usuário não encontrado"})
      }

      const usuario = result[0]

      if(usuario.senha !== senha){
        return res.status(401).json({erro:"Senha incorreta"})
      }

      res.json({
        id: usuario.id,
        nome: usuario.nome,
        perfil: usuario.perfil
      })

    }
  )

})

module.exports = router
