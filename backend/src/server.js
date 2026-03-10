
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.json({ ok: true, service: "Tel T&D API" });
});

app.use("/api", routes);

const port = Number(process.env.PORT || 3333);
app.listen(port, () => {
  console.log(`Tel T&D API rodando na porta ${port}`);
});
