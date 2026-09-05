"use client";

import { useState, useEffect } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";

export default function RSConfiguracoes() {
  // ── Importação ───────────────────────────────────────────────────
  const [arquivo, setArquivo] = useState(null);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // ── Usuários R&S ─────────────────────────────────────────────────
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [formUser, setFormUser] = useState({ nome: "", email: "", senha: "", perfil: "gestor_rs" });
  const [criandoUser, setCriandoUser] = useState(false);
  const [erroUser, setErroUser] = useState("");
  const [okUser, setOkUser] = useState("");

  const carregarUsuarios = async () => {
    setLoadingUsers(true);
    try {
      const data = await apiFetch("/rs/usuarios");
      setUsuarios(data);
    } catch { setUsuarios([]); }
    finally { setLoadingUsers(false); }
  };

  useEffect(() => { carregarUsuarios(); }, []);

  // ── Importar planilha ─────────────────────────────────────────────
  const handleImportar = async () => {
    if (!arquivo) { alert("Selecione um arquivo .xlsx primeiro."); return; }
    setImportando(true);
    setResultado(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const data = await apiFetch(`/rs/importar?ano=${ano}&modo=skip`, {
        method: "POST",
        body: form,
      });
      setResultado(data);
    } catch (e) {
      setResultado({ ok: false, error: e.message });
    } finally {
      setImportando(false);
    }
  };

  // ── Criar usuário ─────────────────────────────────────────────────
  const handleCriarUser = async () => {
    if (!formUser.nome || !formUser.email || !formUser.senha) {
      setErroUser("Nome, e-mail e senha são obrigatórios."); return;
    }
    setCriandoUser(true); setErroUser(""); setOkUser("");
    try {
      await apiFetch("/rs/usuarios", { method: "POST", body: JSON.stringify(formUser) });
      setOkUser(`Usuário "${formUser.nome}" criado com sucesso.`);
      setFormUser({ nome: "", email: "", senha: "", perfil: "gestor_rs" });
      carregarUsuarios();
    } catch (e) {
      setErroUser(e.message || "Erro ao criar usuário.");
    } finally {
      setCriandoUser(false);
    }
  };

  const anos = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <PortalShell title="Configurações R&S" subtitle="Importação de histórico e gestão de usuários do módulo">
      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Configurações"
        subtitle="Importe o histórico do Google Sheets e gerencie os usuários do módulo R&S."
      />

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>

        {/* ── Importação de planilha ── */}
        <div style={card}>
          <h2 style={cardTitle}>📥 Importar Histórico (Google Sheets / Excel)</h2>
          <p style={cardDesc}>
            Baixe o Google Sheets como <strong>.xlsx</strong> e importe aqui. O sistema detecta
            automaticamente as abas, normaliza datas e ignora registros já existentes.
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <label style={labelSt}>Ano de referência</label>
              <select value={ano} onChange={e => setAno(e.target.value)} style={inputSt}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <p style={hint}>Usado para normalizar meses sem ano (ex: "JULHO" → Julho/{ano})</p>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={labelSt}>Arquivo (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setArquivo(e.target.files[0] || null)}
                style={{ ...inputSt, cursor: "pointer" }}
              />
              {arquivo && <p style={{ ...hint, color: colors.success }}>✓ {arquivo.name}</p>}
            </div>
            <button
              onClick={handleImportar}
              disabled={importando || !arquivo}
              style={{
                background: importando ? "#f1f5f9" : colors.accent,
                color:      importando ? colors.textMuted : "#fff",
                border: "none", borderRadius: 10, padding: "10px 22px",
                fontWeight: 700, fontSize: 14, cursor: importando ? "not-allowed" : "pointer",
                alignSelf: "flex-start", marginTop: 20,
              }}>
              {importando ? "⏳ Importando..." : "⬆ Importar"}
            </button>
          </div>

          {/* Resultado da importação */}
          {resultado && (
            <div style={{
              borderRadius: 12, border: "1px solid #e2e8f0",
              overflow: "hidden", background: "#f8fafc",
            }}>
              {resultado.ok ? (
                <>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0",
                                background: "#fff", display: "flex", gap: 24 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: colors.success }}>{resultado.resumo?.total_importado ?? 0}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase" }}>Importados</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: colors.neutral }}>{resultado.resumo?.total_ignorado ?? 0}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase" }}>Já existiam</div>
                    </div>
                    {(resultado.resumo?.total_erro ?? 0) > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: colors.danger }}>{resultado.resumo.total_erro}</div>
                        <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase" }}>Erros</div>
                      </div>
                    )}
                  </div>
                  {resultado.detalhes?.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={thSm}>Aba</th>
                          <th style={{ ...thSm, textAlign: "right" }}>Importados</th>
                          <th style={{ ...thSm, textAlign: "right" }}>Ignorados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.detalhes.map((d, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "7px 14px", color: colors.textPrimary }}>{d.aba}</td>
                            <td style={{ padding: "7px 14px", textAlign: "right", color: colors.success, fontWeight: 700 }}>{d.importados ?? "—"}</td>
                            <td style={{ padding: "7px 14px", textAlign: "right", color: colors.neutral }}>{d.ignorados ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <div style={{ padding: 16, color: colors.dangerText, background: colors.dangerLight }}>
                  ⚠ {resultado.error || "Erro na importação"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Gestão de usuários R&S ── */}
        <div style={card}>
          <h2 style={cardTitle}>👥 Usuários do Módulo R&S</h2>
          <p style={cardDesc}>
            Crie usuários com acesso exclusivo ao módulo R&S. Eles <strong>não verão</strong> nenhuma
            funcionalidade de T&D.
          </p>

          {/* Formulário de criação */}
          <div style={{
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12,
            padding: "18px 20px", marginBottom: 20,
          }}>
            <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 800, color: colors.textMuted,
                        textTransform: "uppercase", letterSpacing: ".04em" }}>Novo usuário</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelSt}>Nome *</label>
                <input value={formUser.nome} onChange={e => setFormUser(f=>({...f,nome:e.target.value}))}
                  placeholder="Nome completo" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>E-mail *</label>
                <input value={formUser.email} onChange={e => setFormUser(f=>({...f,email:e.target.value}))}
                  placeholder="email@telcc.com.br" type="email" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Senha inicial *</label>
                <input value={formUser.senha} onChange={e => setFormUser(f=>({...f,senha:e.target.value}))}
                  placeholder="Mínimo 6 caracteres" type="password" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Perfil</label>
                <select value={formUser.perfil} onChange={e => setFormUser(f=>({...f,perfil:e.target.value}))} style={inputSt}>
                  <option value="coordenador_rs">Coordenador R&S (edita)</option>
                  <option value="gestor_rs">Gestor R&S (só visualiza)</option>
                </select>
              </div>
            </div>
            {erroUser && <p style={{ marginTop: 10, color: colors.dangerText, fontSize: 13 }}>⚠ {erroUser}</p>}
            {okUser   && <p style={{ marginTop: 10, color: colors.success, fontSize: 13 }}>✓ {okUser}</p>}
            <button onClick={handleCriarUser} disabled={criandoUser}
              style={{
                marginTop: 14, background: colors.accent, color: "#fff",
                border: "none", borderRadius: 8, padding: "9px 20px",
                fontWeight: 700, fontSize: 13, cursor: criandoUser ? "not-allowed" : "pointer",
              }}>
              {criandoUser ? "Criando..." : "+ Criar Usuário"}
            </button>
          </div>

          {/* Lista de usuários existentes */}
          {loadingUsers ? (
            <p style={{ color: colors.textMuted, fontSize: 13 }}>Carregando usuários...</p>
          ) : usuarios.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 13 }}>Nenhum usuário R&S cadastrado ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thSm}>Nome</th>
                  <th style={thSm}>E-mail</th>
                  <th style={thSm}>Perfil</th>
                  <th style={{ ...thSm, textAlign: "center" }}>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "9px 14px", fontWeight: 600, color: colors.textPrimary }}>{u.nome}</td>
                    <td style={{ padding: "9px 14px", color: colors.textSecondary }}>{u.email}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{
                        background: u.perfil==="coordenador_rs" ? "#dbeafe" : "#f3f4f6",
                        color:      u.perfil==="coordenador_rs" ? "#1e40af" : colors.neutral,
                        borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                      }}>
                        {u.perfil === "coordenador_rs" ? "Coordenador R&S" : "Gestor R&S"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "center" }}>
                      <span style={{ color: u.ativo ? colors.success : colors.danger, fontWeight: 700 }}>
                        {u.ativo ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

// ── Estilos ────────────────────────────────────────────────────────
const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
  padding: "24px 26px", boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};
const cardTitle = {
  margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: colors.textPrimary,
};
const cardDesc = {
  margin: "0 0 18px", fontSize: 13, color: colors.textSecondary, lineHeight: 1.5,
};
const labelSt = {
  display: "block", fontSize: 11, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5,
};
const inputSt = {
  width: "100%", background: "#fff", border: "1px solid #e2e8f0",
  borderRadius: 8, color: colors.textPrimary, padding: "8px 11px",
  fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const hint = {
  margin: "4px 0 0", fontSize: 11, color: colors.textMuted,
};
const thSm = {
  padding: "8px 14px", fontSize: 10, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em",
  borderBottom: "1px solid #e2e8f0", textAlign: "left",
};
