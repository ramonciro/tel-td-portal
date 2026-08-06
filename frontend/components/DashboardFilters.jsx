export default function DashboardFilters({
  filtros,
  opcoes,
  onChange,
  onReset,
  onExport
}) {
  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "center" }}>
        
        {/* Filtro de Cliente */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#64748b" }}>CLIENTE</label>
          <select 
            value={filtros.cliente} 
            onChange={(e) => onChange("cliente", e.target.value)}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          >
            <option value="">Todos os Clientes</option>
            {opcoes.clientes?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Filtro de Status */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#64748b" }}>STATUS</label>
          <select 
            value={filtros.status} 
            onChange={(e) => onChange("status", e.target.value)}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          >
            <option value="">Todos os Status</option>
            <option value="Concluída">Concluída</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Planejada">Planejada</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>

        {/* Data Início */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#64748b" }}>DE</label>
          <input 
            type="date" 
            value={filtros.dataInicio} 
            onChange={(e) => onChange("dataInicio", e.target.value)}
            style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
        </div>

        {/* Data Fim */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#64748b" }}>ATÉ</label>
          <input 
            type="date" 
            value={filtros.dataFim} 
            onChange={(e) => onChange("dataFim", e.target.value)}
            style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
        </div>

      </div>

      {/* Botões de Ação dos Filtros */}
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
        <button 
          onClick={onReset}
          style={{ padding: "7px 14px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          Limpar Filtros
        </button>
        <button 
          onClick={onExport}
          style={{ padding: "7px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          📥 Exportar Relatório (CSV)
        </button>
      </div>
    </div>
  );
}
