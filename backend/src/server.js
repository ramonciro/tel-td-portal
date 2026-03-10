
import express from "express"
import cors from "cors"

const app = express()
app.use(cors())

app.get("/",(req,res)=>res.json({ok:true}))

app.listen(3333,()=>console.log("API running"))
