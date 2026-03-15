"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function statusStyle(status) {
  const key = String(status || "").toLowerCase();

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (key === "publicado") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (key === "em atualização" || key === "em atualizacao") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  return { ...base, background: "#e2e8f0", color: "#334155" };
}

function tipoStyle(tipo) {
  return {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 800,
    fontSize: 11,
  };
}

function BibliotecaCard({ item, onEdit, onDelete }) {
  return (
    <div style={card}>
      <div style={cardTop}>
        <div style={cardTopRow}>
          <span style={tipoStyle(item.tipo)}>{item.tipo || "Material"}</span>
          <span style={statusStyle(item.status)}>{item.status || "Rascunho"}</span>
        </div>

        <div style={cardTitle}>{item.titulo || "Sem título"}</div>
        <div style={cardMeta}>
          {(item.cliente || "GLOBAL") +
            " • " +
            (item.publico || "Público não informado")}
        </div>
      </div>

      <div style={cardBody}>
        <div style={tagRow}>
          {item.categoria ? <span style={tag}>{item.categoria}</span> : null}
          {item.publico ? <span style={tag}>{item.publico}</span> : null}
        </div>

        <p style={descricao}>
          {item.descricao || "Material sem descrição cadastrada."}
        </p>

        <div style={cardActions}>
          {item.link_arquivo ? (
            <a
              href={item.link_arquivo}
              target="_blank"
              rel="noreferrer"
              style={openButton}
            >
              Abrir material
            </a>
          ) : null}

          <button onClick={onEdit} style={editBtn}>
            Editar
          </button>

          <button onClick={onDelete} style={deleteBtn}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BibliotecaPage() {
  const [biblioteca, setBiblioteca] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const data = await apiFetch("/biblioteca").catch(() => []);
        setBiblioteca(Array.isArray(data) ? data : []);
      } catch {
        setBiblioteca([]);
      }
    }

    carregar();
  }, []);

  const fields = [
    {
      name: "titulo",
      label: "Título",
      placeholder: "Nome do material",
    },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      options: [
        { value: "Apresentação", label: "Apresentação" },
        { value: "Manual", label: "Manual" },
        { value: "Card", label: "Card" },
        { value: "Roteiro", label: "Roteiro" },
        { value: "Material de turma", label: "Material de turma" },
      ],
      placeholder: "Selecione o tipo",
    },
    {
      name: "cliente",
      label: "Cliente",
      placeholder: "Cliente ou GLOBAL",
    },
    {
      name: "categoria",
      label: "Categoria",
      placeholder: "Ex.: onboarding, produto, processo",
    },
    {
      name: "publico",
      label: "Público",
      placeholder: "Ex.: treinandos, instrutores, todos",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Publicado", label: "Publicado" },
        { value: "Em atualização", label: "Em atualização" },
        { value: "Rascunho", label: "Rascunho" },
      ],
      placeholder: "Selecione o status",
    },
    {
      name: "link_arquivo",
      label: "Link do material",
      placeholder: "URL do arquivo, pasta ou documento",
    },
    {
      name: "descricao",
      label: "Descrição",
      type: "textarea",
      placeholder: "Contexto e uso do material",
    },
  ];

  const kpis = useMemo(() => {
    const total = biblioteca.length;
    const publicados = biblioteca.filter(
      (item) => String(item.status || "").toLowerCase() === "publicado"
    ).length;
    const atualizacao = biblioteca.filter(
      (item) =>
        String(item.status || "").toLowerCase() === "em atualização" ||
        String(item.status || "").toLowerCase() === "em atualizacao"
    ).length;
    const rascunhos = biblioteca.filter(
      (item) => String(item.status || "").toLowerCase() === "rascunho"
    ).length;

    const porClienteMap = {};
    const porCategoriaMap = {};

    biblioteca.forEach((item) => {
      const cliente = item.cliente || "GLOBAL";
      const categoria = item.categoria || "Sem categoria";

      porClienteMap[cliente] = (porClienteMap[cliente] || 0) + 1;
      porCategoriaMap[categoria] = (porCategoriaMap[categoria] || 0) + 1;
    });

    const porCliente = Object.entries(porClienteMap)
      .map(([cliente, totalItens]) => ({
        cliente,
        totalItens,
      }))
      .sort((a, b) => b.totalItens - a.totalItens);

    const porCategoria = Object.entries(porCategoriaMap)
      .map(([categoria, totalItens]) => ({
        categoria,
        totalItens,
      }))
      .sort((a, b) => b.totalItens - a.totalItens);

    const alertas = [];

    if (atualizacao > 0) {
      alertas.push(`${atualizacao} material(is) estão em atualização.`);
    }

    if (rascunhos > 0) {
      alertas.push(`${rascunhos} material(is) ainda estão como rascunho.`);
    }

    const semLink = biblioteca.filter((item) => !item.link_arquivo).length;
    if (semLink > 0) {
      alertas.push(`${semLink} material(is) ainda sem link cadastrado.`);
    }

    if (!alertas.length) {
      alertas.push("Biblioteca organizada, sem pendências críticas no momento.");
    }

    return {
      total,
      publicados,
      atualizacao,
      rascunhos,
      porCliente,
      porCategoria,
      alertas,
    };
  }, [biblioteca]);

  return (
    <CrudPageV2
      title="Biblioteca"
      subtitle="Acervo institucional de materiais do Treinamento & Desenvolvimento."
      endpoint="/biblioteca"
      fields={fields}
      columns={[]}
      recordsTitle="Acervo disponível"
      recordsSubtitle="Materiais cadastrados para uso operacional, instrucional e executivo."
      recordsGridStyle={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}
      renderRecordCard={({ item, onEdit, onDelete }) => (
        <BibliotecaCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Materiais"
              value={fmt(kpis.total)}
              subtitle="Base total"
              accent="#0891b2"
            />
            <StatCard
              title="Publicados"
              value={fmt(kpis.publicados)}
              subtitle="Disponíveis para uso"
              accent="#16a34a"
            />
            <StatCard
              title="Em atualização"
              value={fmt(kpis.atualizacao)}
              subtitle="Materiais em revisão"
              accent="#ea580c"
            />
            <StatCard
              title="Rascunhos"
              value={fmt(kpis.rascunhos)}
              subtitle="Ainda não finalizados"
              accent="#64748b"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Distribuição por cliente"
              subtitle="Clientes com maior volume de material cadastrado."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.totalItens} material(is)
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum cliente disponível.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Distribuição por categoria"
              subtitle="Organização do acervo por linha de conteúdo."
            >
              <div style={listGrid}>
                {kpis.porCategoria.length ? (
                  kpis.porCategoria.slice(0, 6).map((item) => (
                    <div key={item.categoria} style={listItem}>
                      <div style={itemTitle}>{item.categoria}</div>
                      <div style={itemMeta}>
                        {item.totalItens} material(is)
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhuma categoria disponível.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Pontos rápidos para acompanhar a maturidade do acervo."
          >
            <div style={alertGrid}>
              {kpis.alertas.map((item, index) => (
                <div key={index} style={alertItem}>
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

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};

const emptyText = {
  color: "#64748b",
};

const card = {
  background: "#ffffff",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  overflow: "hidden",
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
};

const cardTop = {
  padding: 14,
  background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
  borderBottom: "1px solid #e2e8f0",
};

const cardTopRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const cardTitle = {
  marginTop: 10,
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.2,
};

const cardMeta = {
  marginTop: 6,
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.4,
};

const cardBody = {
  padding: 14,
};

const tagRow = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 10,
};

const tag = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#334155",
  fontWeight: 700,
  fontSize: 11,
};

const descricao = {
  margin: "0 0 12px",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const cardActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const openButton = {
  textDecoration: "none",
  border: 0,
  background: "#2563eb",
  color: "#fff",
  padding: "9px 12px",
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 13,
};

const editBtn = {
  border: 0,
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "9px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const deleteBtn = {
  border: 0,
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "9px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};
