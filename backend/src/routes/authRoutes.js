const express = require("express")
const router = express.Router()
const db = require("../config/db")

router.post("/login",async(req,res)=>{

const {email,senha} = req.body

const [rows] = await db.query(
"SELECT * FROM usuarios WHERE email=?",
[email]
)

if(!rows.length){
return res.status(401).json({message:"Usuário não encontrado"})
}

const user = rows[0]

if(user.senha !== senha){
return res.status(401).json({message:"Senha incorreta"})
}

res.json({
token:"token-simples",
user
})

})

router.post("/alterar-senha",async(req,res)=>{

const {email,novaSenha} = req.body

await db.query(
"UPDATE usuarios SET senha=?, troca_senha_obrigatoria=0 WHERE email=?",
[novaSenha,email]
)

res.json({message:"Senha alterada"})

})

module.exports = router
