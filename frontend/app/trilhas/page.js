"use client";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";

function TrilhaCard({ item, onEdit, onDelete }) {
  const etapas = Array.isArray(item.etapas) ? item.etapas : typeof item.etapas === "string" ? item.etapas.split(",").map((t) => t.trim()).filter(Boolean) : [];
  return (
    <div style={{ background: "#fff", borderRadius: 22, border: "1px solid #e2e8f0", padding: 18, boxShadow: "0 12px 28px rgba(15,23,42,.06)" }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#65a30d" }}>{item.cliente || "GLOBAL"}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800 }}>{item.titulo || "Trilha sem título"}</div>
      <div style={{ marginTop: 10, color: "#64748b", lineHeight: 1.65 }}>{item.descricao || "Sem descrição."}</div>
      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {etapas.length ? etapas.map((etapa, index) => <div key={`${etapa}-${index}`} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, color: "#334155", fontWeight: 600 }}>Etapa {index + 1}: {etapa}</div>) : <div style={{ color: "#94a3b8" }}>Nenhuma etapa cadastrada.</div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onEdit} style={editBtn}>Editar</button>
        <button onClick={onDelete} style={deleteBtn}>Excluir</button>
      </div>
    </div>
  );
}
const editBtn = { border: 0, background: "#dbeafe", color: "#1d4ed8", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };
const deleteBtn = { border: 0, background: "#fee2e2", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };

export default function TrilhasPage() {
  const fields = [
    { name: "cliente", label: "Cliente", placeholder: "Cliente ou GLOBAL" },
    { name: "titulo", label: "Título da trilha", placeholder: "Nome da trilha" },
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Objetivo da trilha" },
    { name: "etapas", label: "Etapas", placeholder: "Separe por vírgula: Etapa 1, Etapa 2, Etapa 3" },
  ];

  return (
    <CrudPageV2
      title="Trilhas de aprendizagem"
      subtitle="Uma visão mais amigável e menos seca das trilhas, favorecendo entendimento do percurso de desenvolvimento."
      endpoint="/trilhas"
      fields={fields}
      columns={[]}
      recordsTitle="Trilhas disponíveis"
      recordsSubtitle="Leitura em cards para facilitar entendimento do percurso."
      transformBeforeSave={(form) => ({ ...form, etapas: String(form.etapas || "").split(",").map((item) => item.trim()).filter(Boolean) })}
      renderRecordCard={({ item, onEdit, onDelete }) => <TrilhaCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />}
      hero={<><StatCard title="Aprendizagem estruturada" value="Trilhas" subtitle="Organize percursos de desenvolvimento com leitura mais clara e amigável." accent="#65a30d" /><SectionCard title="Aplicação prática" subtitle="A trilha deve ajudar o usuário a visualizar caminho, não apenas cadastro."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>A ideia é tornar esta página mais intuitiva, especialmente para quando você quiser evoluir para acompanhamento de progresso por colaborador.</p></SectionCard></>}
    />
  );
}
