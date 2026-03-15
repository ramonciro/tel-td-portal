"use client";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";

function BibliotecaCard({ item, onEdit, onDelete }) {
  return (
    <div style={{ background: "#fff", borderRadius: 22, border: "1px solid #e2e8f0", boxShadow: "0 12px 28px rgba(15,23,42,.06)", overflow: "hidden" }}>
      <div style={{ padding: 18, background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)", borderBottom: "1px solid #dbeafe" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".04em" }}>{item.tipo || "Material"}</div>
        <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{item.titulo || "Sem título"}</div>
        <div style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>{item.cliente || "Sem cliente vinculado"}</div>
      </div>
      <div style={{ padding: 18 }}>
        <p style={{ marginTop: 0, color: "#64748b", lineHeight: 1.65 }}>{item.descricao || "Material sem descrição informada."}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {item.categoria ? <span style={tagStyle}>{item.categoria}</span> : null}
          {item.publico ? <span style={tagStyle}>{item.publico}</span> : null}
          {item.status ? <span style={tagStyle}>{item.status}</span> : null}
        </div>
        {item.link_arquivo ? <a href={item.link_arquivo} target="_blank" rel="noreferrer" style={{ display: "inline-block", textDecoration: "none", background: "#2563eb", color: "#fff", padding: "10px 14px", borderRadius: 12, fontWeight: 800, marginBottom: 14 }}>Abrir material</a> : null}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onEdit} style={editBtn}>Editar</button>
          <button onClick={onDelete} style={deleteBtn}>Excluir</button>
        </div>
      </div>
    </div>
  );
}

const tagStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#f1f5f9", color: "#334155", fontWeight: 700, fontSize: 12 };
const editBtn = { border: 0, background: "#dbeafe", color: "#1d4ed8", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };
const deleteBtn = { border: 0, background: "#fee2e2", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };

export default function BibliotecaPage() {
  const fields = [
    { name: "titulo", label: "Título", placeholder: "Nome do material" },
    { name: "tipo", label: "Tipo", type: "select", options: [{ value: "Apresentação", label: "Apresentação" }, { value: "Manual", label: "Manual" }, { value: "Card", label: "Card" }, { value: "Roteiro", label: "Roteiro" }, { value: "Material de turma", label: "Material de turma" }]},
    { name: "cliente", label: "Cliente", placeholder: "Cliente ou GLOBAL" },
    { name: "link_arquivo", label: "Link do material", placeholder: "URL do arquivo ou pasta" },
    { name: "categoria", label: "Categoria", placeholder: "Ex.: produto, processo, onboarding" },
    { name: "publico", label: "Público", placeholder: "Ex.: treinandos, instrutores, todos" },
    { name: "status", label: "Status", type: "select", options: [{ value: "Publicado", label: "Publicado" }, { value: "Em atualização", label: "Em atualização" }, { value: "Rascunho", label: "Rascunho" }]},
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Contexto e uso do material" },
  ];

  return (
    <CrudPageV2
      title="Biblioteca e portfólio de materiais"
      subtitle="Um espaço mais próximo de acervo vivo do T&D, permitindo organizar materiais de turmas, insumos de instrutores e conteúdos de apoio."
      endpoint="/biblioteca"
      fields={fields}
      columns={[]}
      recordsTitle="Acervo disponível"
      recordsSubtitle="Visão em cards para reforçar o conceito de portfólio e biblioteca de apoio."
      renderRecordCard={({ item, onEdit, onDelete }) => <BibliotecaCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />}
      hero={<><StatCard title="Portfólio de conteúdo" value="Biblioteca T&D" subtitle="Lugar para materiais de apoio, cards, apresentações e conteúdos das turmas." accent="#0891b2" /><SectionCard title="Visão desejada" subtitle="A biblioteca passa a se aproximar de um acervo navegável."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>A proposta aqui é deixar a biblioteca menos parecida com tabela fria e mais próxima de uma vitrine de materiais, permitindo uso por treinandos e uploads organizados por instrutores.</p></SectionCard></>}
    />
  );
}
