"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import API_URL from "../../../services/api";
import { colors, radius } from "../../../lib/theme";
import { formatDateBR } from "../../../lib/date";

// Validação PÚBLICA de certificado da Oficina de Talentos (Fase 2, 13/10/2026).
// O código impresso no certificado leva até aqui. Só mostra nome, oficina,
// carga horária e datas — nunca CPF, matrícula ou e-mail.

export default function ValidarOficinaPage() {
  const params = useParams();
  const codigo = Array.isArray(params?.codigo) ? params.codigo[0] : params?.codigo;
  const [estado, setEstado] = useState("carregando"); // carregando | valido | invalido | erro
  const [dados, setDados] = useState(null);

  useEffect(() => {
    if (!codigo) return;
    fetch(`${API_URL}/public/oficina/certificado/${encodeURIComponent(codigo)}`)
      .then(async (r) => {
        if (r.status === 404) return setEstado("invalido");
        if (!r.ok) return setEstado("erro");
        setDados(await r.json());
        setEstado("valido");
      })
      .catch(() => setEstado("erro"));
  }, [codigo]);

  return (
    <div style={{ minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-td.png" alt="Portal T&D" style={{ height: 44, borderRadius: radius.sm }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.textSecondary }}>Portal T&D · Validação de certificado</span>
        </div>

        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 24 }}>
          {estado === "carregando" && <p style={{ margin: 0 }}>Verificando…</p>}

          {estado === "valido" && dados && (
            <>
              <span style={{ background: colors.successLight, color: colors.successText, fontWeight: 800, fontSize: 12, padding: "4px 12px", borderRadius: radius.pill }}>
                Certificado válido
              </span>
              <h1 style={{ fontSize: 22, margin: "14px 0 4px", color: colors.textPrimary }}>{dados.nome}</h1>
              <p style={{ margin: "0 0 12px", color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
                Participou da <strong>Oficina de Talentos — {dados.oficina}</strong>
                {dados.data_inicio ? `, ${dados.data_fim && dados.data_fim !== dados.data_inicio ? `de ${formatDateBR(dados.data_inicio)} a ${formatDateBR(dados.data_fim)}` : `em ${formatDateBR(dados.data_inicio)}`}` : ""}
                {dados.carga_horaria ? `, com carga horária de ${dados.carga_horaria} horas` : ""}.
              </p>
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
                Código {dados.codigo}
                {dados.emitido_em ? ` · emitido em ${formatDateBR(dados.emitido_em)}` : ""}
              </p>
            </>
          )}

          {estado === "invalido" && (
            <>
              <span style={{ background: colors.dangerLight, color: colors.dangerText, fontWeight: 800, fontSize: 12, padding: "4px 12px", borderRadius: radius.pill }}>
                Certificado não encontrado
              </span>
              <p style={{ margin: "14px 0 0", color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
                Não existe certificado ativo com este código. Confira se digitou corretamente; certificados revogados deixam de ser válidos.
              </p>
            </>
          )}

          {estado === "erro" && <p style={{ margin: 0 }}>Não foi possível validar agora. Tente novamente em instantes.</p>}
        </div>
      </div>
    </div>
  );
}
