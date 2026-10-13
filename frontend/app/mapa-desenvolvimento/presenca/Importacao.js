"use client";

import { useState } from "react";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";
import { btnPrimario, btnSecundario, entrada, painel, dica, acoes, selo } from "./estilos";

const COR_RESULTADO = {
  erro: { bg: colors.dangerLight, cor: colors.dangerText, label: "Erro" },
  novo: { bg: colors.successLight, cor: colors.successText, label: "Novo" },
  alterado: { bg: colors.warningLight, cor: colors.warningText, label: "Altera" },
  igual: { bg: colors.neutralLight, cor: colors.neutral, label: "Igual" },
};

// Importação de planilha de presença: primeiro uma PRÉVIA (nada é gravado),
// depois a confirmação. Aceita o formato da exportação (uma coluna por
// encontro) ou o formato com colunas Data e Situação.
export default function Importacao({ jornadaId, onFechar, onImportou, onBaixarModelo, setErro, setAviso }) {
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [ignorarErros, setIgnorarErros] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(confirmar) {
    if (!arquivo) return;
    setErro("");
    setAviso("");
    try {
      setOcupado(true);
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      if (confirmar) {
        fd.append("confirmar", "1");
        if (ignorarErros) fd.append("ignorar_erros", "1");
      }
      const r = await apiFetch(`/jornada-presenca/jornadas/${jornadaId}/importar`, { method: "POST", body: fd });
      if (confirmar) {
        setAviso(r.message || "Importação concluída.");
        onImportou();
      } else {
        setPrevia(r);
      }
    } catch (e) {
      setErro(e.message || "Erro ao importar a planilha.");
    } finally {
      setOcupado(false);
    }
  }

  const resumo = previa?.resumo;
  const aGravar = resumo ? resumo.novos + resumo.alterados : 0;

  return (
    <div style={painel}>
      <strong style={{ fontSize: 14 }}>Importar presença por planilha</strong>
      <div style={dica}>
        Use a planilha exportada pelo sistema (uma coluna por encontro, com P = presente, J = justificado, F = ausente) ou uma planilha com as colunas
        Nome (ou Matrícula/CPF), Data e Situação. Os encontros precisam estar cadastrados e a pessoa precisa estar na tripulação da jornada — a importação não
        cria encontros nem participantes. Célula em branco não altera nada.{" "}
        <button style={btnMini} onClick={onBaixarModelo}>
          Baixar planilha atual (modelo)
        </button>
      </div>
      <div style={acoes}>
        <input
          style={{ ...entrada, width: "auto", maxWidth: 360 }}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            setArquivo(e.target.files?.[0] || null);
            setPrevia(null);
          }}
        />
        <button style={btnPrimario} disabled={!arquivo || ocupado} onClick={() => enviar(false)}>
          {ocupado && !previa ? "Analisando…" : "Analisar planilha"}
        </button>
        <button style={btnSecundario} disabled={ocupado} onClick={onFechar}>
          Fechar
        </button>
      </div>

      {previa && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={acoes}>
            <span style={{ ...selo, ...fundo(COR_RESULTADO.novo) }}>{resumo.novos} novo(s)</span>
            <span style={{ ...selo, ...fundo(COR_RESULTADO.alterado) }}>{resumo.alterados} alteração(ões)</span>
            <span style={{ ...selo, ...fundo(COR_RESULTADO.igual) }}>{resumo.iguais} sem mudança</span>
            <span style={{ ...selo, ...fundo(COR_RESULTADO.erro) }}>{resumo.erros} com erro</span>
            <span style={dica}>Formato lido: {previa.formato === "largo" ? "uma coluna por encontro" : "colunas Data e Situação"}</span>
          </div>

          <div style={{ maxHeight: 280, overflow: "auto", border: `1px solid ${colors.border}`, borderRadius: 8, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Linha", "Pessoa", "Encontro / data", "Situação", "Resultado"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, background: colors.surfaceMuted, fontSize: 11, textTransform: "uppercase", color: colors.textSecondary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.itens.map((i, idx) => (
                  <tr key={idx}>
                    <td style={cel}>{i.linha}</td>
                    <td style={cel}>{i.nome}</td>
                    <td style={cel}>
                      {i.encontro ? `${i.encontro} · ` : ""}
                      {i.data ? formatDateBR(i.data) : "—"}
                    </td>
                    <td style={cel}>{i.situacao}</td>
                    <td style={cel}>
                      <span style={{ ...selo, ...fundo(COR_RESULTADO[i.resultado]) }}>{COR_RESULTADO[i.resultado].label}</span> <span style={{ color: colors.textSecondary }}>{i.mensagem}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previa.itens_omitidos > 0 && <div style={dica}>Mostrando as primeiras {previa.itens.length} linhas; há mais {previa.itens_omitidos} não exibidas.</div>}

          {resumo.erros > 0 && (
            <label style={{ ...dica, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={ignorarErros} onChange={(e) => setIgnorarErros(e.target.checked)} />
              Gravar mesmo assim, ignorando as {resumo.erros} linha(s) com erro
            </label>
          )}
          <div style={acoes}>
            <button style={btnPrimario} disabled={ocupado || aGravar === 0 || (resumo.erros > 0 && !ignorarErros)} onClick={() => enviar(true)}>
              {ocupado ? "Gravando…" : `Confirmar importação (${aGravar})`}
            </button>
            {aGravar === 0 && <span style={dica}>Nada novo para gravar.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const fundo = (c) => ({ background: c.bg, color: c.cor });
const cel = { padding: "6px 10px", borderBottom: `1px solid ${colors.surfaceMuted}`, verticalAlign: "top" };
const btnMini = { padding: "2px 8px", background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 };
