
const db = require("../database")

exports.getDashboard = (req,res)=>{

  db.query("SELECT COUNT(*) as total FROM usuarios",(err,usuarios)=>{

    if(err) return res.status(500).json(err)

    db.query("SELECT COUNT(*) as total FROM treinamentos",(err,treinamentos)=>{

      if(err) return res.status(500).json(err)

      res.json({
        usuarios: usuarios[0].total,
        treinamentos: treinamentos[0].total
      })

    })

  })

}
