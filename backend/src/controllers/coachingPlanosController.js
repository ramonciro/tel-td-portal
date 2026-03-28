const [result] = await db.query(
  `
  INSERT INTO coaching_planos
  (
    jornada_id,
    etapa_id,
    acao_id,
    tipo_coaching,
    titulo,
    publico_alvo,
    objetivo,
    responsavel_id,
    participantes_previstos,
    participantes_realizados,
    sessoes_previstas,
    sessoes_realizadas,
    carga_horaria_sessao,
    horas_totais,
    status,
    data_inicio,
    data_fim
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    jornada_id ? Number(jornada_id) : null,
    etapa_id ? Number(etapa_id) : null,
    acao_id ? Number(acao_id) : null,
    tipo_coaching || "desenvolvimento",
    titulo,
    publico_alvo || null,
    objetivo || null,
    responsavel_id || null,
    Number(participantes_previstos || 0),
    Number(participantes_realizados || 0),
    Number(sessoes_previstas || 0),
    Number(sessoes_realizadas || 0),
    Number(carga_horaria_sessao || 0),
    Number(horas_totais || 0),
    status || "planejado",
    data_inicio || null,
    data_fim || null,
  ]
);
