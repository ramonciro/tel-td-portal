"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialData = {
  totalClientes: 0,
  totalUsuarios: 0,
  totalTreinamentos: 0,
  totalPresencas: 0,
  totalAvaliacoes: 0,
  totalMateriaisAvaliativos: 0,
  npsMedio: 0,
  qualidadeMedia: 0,
  assiduidadeMedia: 0,
  treinamentosRecentes: [],
  treinamentosPorCliente: [],
  treinamentosPorInstrutor: [],
  avaliacoesPorCliente: []
};

export default function InicioPage()
