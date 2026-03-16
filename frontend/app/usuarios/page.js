"use client";

import { useEffect, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import { apiFetch } from "../../services/api";

export default function UsuariosPage() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [clientesData, usuariosData] = await Promise.all([
          apiFetch("/clientes").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

        setClientes(Array.isArray(clientesData) ? clientesData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch {
        setClientes([]);
        setUsuarios([]);
      }
    }

    carregar();
  }, []);

  const clienteOptions = clientes.map((cliente) => ({
    value: cliente.nome || cliente.cliente || "",
    label: cliente.nome || cliente.cliente || "",
  }));

  return (
    <AccessGate allowedRoles={["admin", "coordenador"]}>
      <CrudPageV2
        title="Usuários"
        subtitle="Gestão dos usuários com controle de perfil, cliente e status de acesso."
        endpoint="/usuarios"
        fields={[
          {
            name: "nome",
            label: "Nome",
            placeholder: "Nome completo",
          },
          {
            name: "email",
            label: "E-mail",
            placeholder: "email@empresa.com",
          },
          {
            name: "senha",
            label: "Senha",
            placeholder: "Senha de acesso",
          },
          {
            name: "perfil",
            label: "Perfil",
            type: "select",
            options: [
              { value: "coordenador", label: "Coordenador" },
              { value: "supervisor", label: "Supervisor" },
              { value: "instrutor", label: "Instrutor" },
              { value: "treinando", label: "Treinando" },
            ],
            placeholder: "Selecione perfil",
          },
          {
            name: "cliente",
            label: "Cliente",
            type: "select",
            options: clienteOptions,
            placeholder: "Selecione cliente",
          },
          {
            name: "ativo",
            label: "Status",
            type: "select",
            options: [
              { value: 1, label: "Ativo" },
              { value: 0, label: "Inativo" },
            ],
            placeholder: "Selecione status",
          },
          {
            name: "troca_senha_obrigatoria",
            label: "Primeiro acesso",
            type: "select",
            options: [
              { value: 1, label: "Sim" },
              { value: 0, label: "Não" },
            ],
            placeholder: "Selecione primeiro acesso",
          },
        ]}
        columns={[
          {
            key: "nome",
            label: "Nome",
          },
          {
            key: "email",
            label: "E-mail",
          },
          {
            key: "perfil",
            label: "Perfil",
          },
          {
            key: "cliente",
            label: "Cliente",
          },
          {
            key: "ativo",
            label: "Status",
            render: (item) => (Number(item.ativo) === 1 ? "Ativo" : "Inativo"),
          },
        ]}
        recordsTitle="Usuários cadastrados"
        recordsSubtitle={`Base atual com ${usuarios.length} usuário(s) no portal.`}
      />
    </AccessGate>
  );
              }
