const [result] = await db.query(
  `
  INSERT INTO jornadas_desenvolvimento
  (nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    nome,
    descricao || null,
    objetivo || null,
    publico_macro || null,
    observacoes || null,
    status || "ativa",
    responsavel_id || null,
    data_inicio || null,
    data_fim || null,
  ]
);
