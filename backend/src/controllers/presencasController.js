const Presenca = require("../models/Presenca");

exports.listar = async (req,res)=>{

  try{

    const lista = await Presenca.findAll();

    res.json(lista);

  }catch(err){

    res.status(500).json({error:"Erro ao listar presenças"});

  }

};

exports.porTreinamento = async (req,res)=>{

  const { id } = req.params;

  try{

    const lista = await Presenca.findAll({
      where:{ treinamento_id:id }
    });

    res.json(lista);

  }catch(err){

    res.status(500).json({error:"Erro ao buscar presenças"});

  }

};

exports.salvarLote = async (req,res)=>{

  const { treinamento_id, participantes } = req.body;

  try{

    for(const p of participantes){

      await Presenca.upsert({

        treinamento_id:treinamento_id,
        participante:p.nome,
        status:p.status,
        justificativa:p.justificativa || null

      });

    }

    res.json({ok:true});

  }catch(err){

    res.status(500).json({error:"Erro ao salvar chamada"});

  }

};
