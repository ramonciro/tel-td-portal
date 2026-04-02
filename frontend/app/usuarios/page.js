"use client";

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalizarListaClientes(valor) {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [usuariosData, clientesData] = await Promise.all([
          apiFetch("/usuarios").catch(() => []),
          apiFetch("/clientes").catch(() => []),
        ]);

        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
        setClientes(Array.isArray(clientesData) ? clientesData : []);
      } catch {
        setUsuarios([]);
        setClientes([]);
      }
    }

    carregar();
  }, []);

  const clientesOptions = useMemo(() => {
    return clientes
      .map((item) => ({
        value: item.nome,
        label: item.nome,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [clientes]);

  const fields = [
    { name: "nome", label: "Nome", placeholder: "Nome completo" },
    { name: "email", label: "E-mail", placeholder: "email@empresa.com" },
    { name: "senha", label: "Senha", type: "password", placeholder: "Senha de acesso" },
    {
      name: "perfil",
      label: "Perfil",
      type: "select",
      options: [
        { value: "coordenador", label: "Coordenador" },
        { value: "supervisor", label: "Supervisor" },
        { value: "instrutor", label: "Instrutor" },
        { value: "treinando", label: "Treinando" },
        { value: "superintendente", label: "Superintendente" },
      ],
      placeholder: "Selecione o perfil",
    },
    {
      name: "cliente",
      label: "Operações / clientes",
      type: "multiselect",
      options: clientesOptions,
      placeholder:
        clientesOptions.length > 0
          ? "Selecione uma ou mais operações"
          : "Cadastre clientes antes de vincular operações",
      helperText:
        "Para usuários que atuam em mais de uma operação, selecione múltiplos clientes. Para supervisoras com visão ampla, você pode incluir Global.",
    },
    {
      name: "ativo",
      label: "Ativo",
      type: "select",
      options: [
        { value: "1", label: "Sim" },
        { value: "0", label: "Não" },
      ],
      placeholder: "Selecione",
    },
    {
      name: "troca_senha_obrigatoria",
      label: "Troca de senha obrigatória",
      type: "select",
      options: [
        { value: "1", label: "Sim" },
        { value: "0", label: "Não" },
      ],
      placeholder: "Selecione",
    },

    {
      name: "pode_acessar_oceano_desenvolvimento",
      label: "Acesso ao Oceano do Desenvolvimento",
      type: "select",
      options: [
        { value: "1", label: "Liberado" },
        { value: "0", label: "Bloqueado" },
      ],
      placeholder: "Selecione",
      helperText:
        "Use para liberar individualmente a página do Oceano apenas para pessoas específicas da coordenação e superintendência.",
    },
  ];

  const columns = [
    {
      key: "nome",
      label: "Usuário",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>{item.email || "-"}</div>
        </div>
      ),
    },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => <span style={badgePerfil(item.perfil)}>{item.perfil || "-"}</span>,
    },
    {
      key: "cliente",
      label: "Operações",
      render: (item) => {
        const lista = normalizarListaClientes(item.cliente);

        return lista.length ? (
          <div style={chipsWrap}>
            {lista.map((cliente) => (
              <span key={`${item.id}-${cliente}`} style={chip}>
                {cliente}
              </span>
            ))}
          </div>
        ) : (
          <span style={plainCell}>Sem operação vinculada</span>
        );
      },
    },
    {
      key: "ativo",
      label: "Ativo",
      render: (item) => (
        <span style={badgeStatus(String(item.ativo) === "1")}>
          {String(item.ativo) === "1" ? "Sim" : "Não"}
        </span>
      ),
    },
    {
      key: "troca_senha_obrigatoria",
      label: "Troca de senha",
      render: (item) => (
        <span style={plainCell}>
          {String(item.troca_senha_obrigatoria) === "1" ? "Obrigatória" : "Normal"}
        </span>
      ),
    },

    {
      key: "pode_acessar_oceano_desenvolvimento",
      label: "Oceano",
      render: (item) => (
        <span style={badgeOcean(String(item.pode_acessar_oceano_desenvolvimento) === "1")}>
          {String(item.pode_acessar_oceano_desenvolvimento) === "1" ? "Liberado" : "Bloqueado"}
        </span>
      ),
    },
  ];

  const kpis = useMemo(() => {
    const total = usuarios.length;
    const ativos = usuarios.filter((item) => String(item.ativo) === "1").length;
    const coordenadores = usuarios.filter(
      (item) => String(item.perfil).toLowerCase() === "coordenador"
    ).length;
    const supervisores = usuarios.filter(
      (item) => String(item.perfil).toLowerCase() === "supervisor"
    ).length;
    const instrutores = usuarios.filter(
      (item) => String(item.perfil).toLowerCase() === "instrutor"
    ).length;
    const treinandos = usuarios.filter(
      (item) => String(item.perfil).toLowerCase() === "treinando"
    ).length;

    const multiOperacao = usuarios.filter(
      (item) => normalizarListaClientes(item.cliente).length > 1
    ).length;

    const porPerfil = [
      { label: "Coordenadores", value: coordenadores },
      { label: "Supervisores", value: supervisores },
      { label: "Instrutores", value: instrutores },
      { label: "Treinandos", value: treinandos },
    ];

    const alertas = [];

    if (multiOperacao > 0) {
      alertas.push(`${multiOperacao} usuário(s) já estão vinculados a múltiplas operações.`);
    }

    const semOperacao = usuarios.filter(
      (item) => normalizarListaClientes(item.cliente).length === 0
    ).length;

    if (semOperacao > 0) {
      alertas.push(`${semOperacao} usuário(s) estão sem operação vinculada.`);
    }

    if (!alertas.length) {
      alertas.push("Base de usuários organizada, sem pendências críticas no momento.");
    }

    return {
      total,
      ativos,
      instrutores,
      multiOperacao,
      oceanoLiberado: usuarios.filter((item) => String(item.pode_acessar_oceano_desenvolvimento) === "1").length,
      porPerfil,
      alertas,
    };
  }, [usuarios]);

  return (
    <CrudPageV2
      title="Usuários"
      subtitle="Gestão de acessos, perfis e operações vinculadas."
      endpoint="/usuarios"
      fields={fields}
      columns={columns}
      recordsTitle="Base de usuários"
      recordsSubtitle="Visão consolidada dos usuários cadastrados no portal."
      allowedCreateRoles={["coordenador", "supervisor"]}
      allowedEditRoles={["coordenador", "supervisor"]}
      allowedDeleteRoles={["coordenador", "superintendente"]}
      transformRecordToForm={(baseForm, record) => ({
        ...baseForm,
        ativo: String(record.ativo ?? "1"),
        troca_senha_obrigatoria: String(record.troca_senha_obrigatoria ?? "1"),
        pode_acessar_oceano_desenvolvimento: String(record.pode_acessar_oceano_desenvolvimento ?? "0"),
      })}
      transformFormToPayload={(formData) => ({
        ...formData,
        ativo: Number(formData.ativo || 0),
        troca_senha_obrigatoria: Number(formData.troca_senha_obrigatoria || 0),
        pode_acessar_oceano_desenvolvimento: Number(formData.pode_acessar_oceano_desenvolvimento || 0),
      })}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          {!clientesOptions.length ? (
            <SectionCard
              title="Atenção"
              subtitle="Para vincular operações aos usuários, é necessário ter clientes cadastrados."
            >
              <div style={warningBox}>
                Nenhum cliente encontrado na base. Cadastre clientes antes de configurar usuários multioperação.
              </div>
            </SectionCard>
          ) : null}

          <div style={heroGrid}>
            <StatCard title="Usuários" value={fmt(kpis.total)} subtitle="Base total" accent="#2563eb" />
            <StatCard title="Ativos" value={fmt(kpis.ativos)} subtitle="Usuários liberados" accent="#16a34a" />
            <StatCard title="Oceano liberado" value={fmt(kpis.oceanoLiberado)} subtitle="Acesso individual ativo" accent="#0891b2" />
            <StatCard title="Instrutores" value={fmt(kpis.instrutores)} subtitle="Perfis de instrução" accent="#7c3aed" />
            <StatCard title="Multioperação" value={fmt(kpis.multiOperacao)} subtitle="Mais de um cliente" accent="#ea580c" />
          </div>

          <div style={heroGrid}>
            {kpis.porPerfil.map((item) => (
              <StatCard
                key={item.label}
                title={item.label}
                value={fmt(item.value)}
                subtitle="Distribuição por perfil"
                accent="#475569"
              />
            ))}
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Alertas operacionais da base de usuários."
          >
            <div style={alertsGrid}>
              {kpis.alertas.map((item, index) => (
                <div key={`${item}-${index}`} style={alertItem}>
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

function badgeOcean(active) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: `1px solid ${active ? "#99f6e4" : "#e2e8f0"}` ,
    background: active ? "#ecfeff" : "#f8fafc",
    color: active ? "#0f766e" : "#64748b",
  };
}

function badgePerfil(perfil) {
  const key = String(perfil || "").toLowerCase();

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (key === "coordenador") return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  if (key === "supervisor") return { ...base, background: "#ede9fe", color: "#6d28d9" };
  if (key === "instrutor") return { ...base, background: "#dcfce7", color: "#166534" };
  return { ...base, background: "#f3f4f6", color: "#374151" };
}

function badgeStatus(ativo) {
  return {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
    background: ativo ? "#dcfce7" : "#fee2e2",
    color: ativo ? "#166534" : "#b91c1c",
  };
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const alertsGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  color: "#334155",
  lineHeight: 1.5,
  fontWeight: 600,
};

const warningBox = {
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const plainCell = {
  color: "#334155",
};

const chipsWrap = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const chip = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
};
