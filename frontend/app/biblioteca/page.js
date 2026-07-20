"use client";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import PageHero from "../../components/PageHero";
import { apiFetch } from "../../services/api";
import { colors, chart } from "../../lib/theme";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function statusStyle(status) {
  const key = normalizeText(status);

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (key === "publicado") {
    return { ...base, background: colors.successLight, color: colors.successText };
  }

  if (key === "em atualização" || key === "em atualizacao") {
    return { ...base, background: colors.warningLight, color: colors.warningText };
  }

  return { ...base, background: colors.neutralLight, color: colors.textSecondary };
}

function tipoStyle() {
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
          <span style={tipoStyle()}>{item.tipo || "Material"}</span>
          <span style={statusStyle(item.status)}>{item.status || "Rascunho"}</span>
        </div>

        <div style={cardTitle}>{item.titulo || "Sem título"}</div>
        <div style={cardMeta}>
          {(item.cliente || "GLOBAL") + " • " + (item.publico || "Público não informado")}
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
  const [arquivo, setArquivo] = useState(null);
  const [uploadLink, setUploadLink] = useState("");
  const [uploadErro, setUploadErro] = useState("");
  const [uploadSucesso, setUploadSucesso] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const res = await apiFetch("/biblioteca");
        const data = await res.json();
        setBiblioteca(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar biblioteca:", err);
        setBiblioteca([]);
      }
    }
    carregar();
  }, []);

  async function fazerUpload() {
    try {
      setUploadErro("");
      setUploadSucesso("");

      if (!arquivo) {
        setUploadErro("Selecione um arquivo para enviar.");
        return;
      }

      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const res = await apiFetch("/biblioteca/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      setUploadLink(data.link_arquivo || "");
      setUploadSucesso("Arquivo enviado com sucesso. Agora vincule esse link no cadastro do material.");
    } catch (error) {
      setUploadErro(error.message || "Erro ao fazer upload do arquivo.");
    }
  }

  const stats = useMemo(() => {
    const total = biblioteca.length;
    const publicados = biblioteca.filter((item) => normalizeText(item.status) === "publicado").length;
    const atualizando = biblioteca.filter((item) => {
      const txt = normalizeText(item.status);
      return txt === "em atualização" || txt === "em atualizacao";
    }).length;
    const rascunhos = biblioteca.filter((item) => normalizeText(item.status) === "rascunho").length;

    return { total, publicados, atualizando, rascunhos };
  }, [biblioteca]);

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
      placeholder: uploadLink || "URL do arquivo, pasta ou documento",
    },
    {
      name: "descricao",
      label: "Descrição",
      type: "textarea",
      placeholder: "Contexto e uso do material",
    },
  ];

  return (
    <CrudPageV2
      endpoint="/biblioteca"
      fields={fields}
      allowedCreateRoles={["coordenador", "supervisor"]}
      allowedEditRoles={["coordenador", "supervisor"]}
      allowedDeleteRoles={["coordenador", "supervisor"]}
      recordsMode="cards"
      recordsTitle="Materiais cadastrados"
      recordsSubtitle="Conteúdos disponíveis para operação, instrutoria e treinandos."
      renderRecordCard={(item, actions) => (
        <BibliotecaCard
          item={item}
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
        />
      )}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <PageHero
            eyebrow="Materiais"
            title="Biblioteca"
            subtitle="Central de materiais de apoio, conteúdos de treinamento e arquivos publicados no portal."
          />
          <div style={heroGrid}>
            <StatCard title="Materiais" value={fmt(stats.total)} accent={chart.blue} />
            <StatCard title="Publicados" value={fmt(stats.publicados)} accent={colors.success} />
            <StatCard title="Em atualização" value={fmt(stats.atualizando)} accent={colors.warning} />
            <StatCard title="Rascunhos" value={fmt(stats.rascunhos)} accent={colors.neutral} />
          </div>

          <SectionCard
            title="Upload de arquivos"
            subtitle="Envie o material no portal e depois use o link gerado no cadastro."
          >
            {uploadErro ? <div style={errorBox}>{uploadErro}</div> : null}
            {uploadSucesso ? <div style={successBox}>{uploadSucesso}</div> : null}

            <div style={uploadWrap}>
              <input
                type="file"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
              <button style={uploadBtn} onClick={fazerUpload}>
                Fazer upload
              </button>
            </div>

            {uploadLink ? (
              <div style={linkBox}>
                <strong>Link gerado:</strong>
                <div style={{ marginTop: 6, wordBreak: "break-all" }}>{uploadLink}</div>
              </div>
            ) : null}
          </SectionCard>
        </div>
      }
    />
  );
}

const heroGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const uploadWrap = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const uploadBtn = { border: "none", borderRadius: 10, padding: "10px 16px", background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer" };
const errorBox = { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 14, padding: 12, fontWeight: 700, marginBottom: 12 };
const successBox = { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 14, padding: 12, fontWeight: 700, marginBottom: 12 };
const linkBox = { marginTop: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 12, padding: 12 };
const card = { background: "#fff", borderRadius: 18, border: "1px solid #e2e8f0", boxShadow: "0 10px 24px rgba(15,23,42,.05)", overflow: "hidden", display: "grid" };
const cardTop = { padding: 16, borderBottom: "1px solid #f1f5f9" };
const cardTopRow = { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" };
const cardTitle = { marginTop: 10, fontSize: 18, fontWeight: 800, color: "#0f172a" };
const cardMeta = { marginTop: 6, color: "#64748b", fontSize: 13 };
const cardBody = { padding: 16, display: "grid", gap: 12 };
const tagRow = { display: "flex", gap: 8, flexWrap: "wrap" };
const tag = { display: "inline-block", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const descricao = { margin: 0, color: "#475569", lineHeight: 1.6, fontSize: 14 };
const cardActions = { display: "flex", gap: 8, flexWrap: "wrap" };
const openButton = { textDecoration: "none", border: "none", borderRadius: 10, padding: "10px 14px", background: "#2563eb", color: "#fff", fontWeight: 800, fontSize: 13 };
const editBtn = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", background: "#fff", color: "#334155", fontWeight: 800, fontSize: 13, cursor: "pointer" };
const deleteBtn = { border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", background: "#fff1f2", color: "#be123c", fontWeight: 800, fontSize: 13, cursor: "pointer" };
