"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getStoredUser } from "../services/api";
import { colors, radius } from "../lib/theme";
import { STATUS, fmtData } from "../lib/conteudoUi";

// Cartão "Materiais de conteúdo" na página da turma (Pacote 3, 23/10/2026).
// Mostra se o analista já está fazendo o material desta ação em piso (#TBT e afins).
// Quem só acompanha (instrutor) vê apenas se existir material; quem produz conteúdo vê também o atalho.

const LEITURA = ["coordenador", "supervisor", "assistente_treinamento", "analista_conteudo", "superintendente", "super_admin", "instrutor"];
const ESCRITA = ["coordenador", "supervisor", "assistente_treinamento", "analista_conteudo", "super_admin"];

export default function MateriaisDaTurma({ turmaId }) {
  const [dados, setDados] = useState(null);
  const perfil = String(getStoredUser()?.perfil || "").toLowerCase();
  const ver = LEITURA.includes(perfil);
  const escreve = ESCRITA.includes(perfil);

  useEffect(() => {
    if (!ver || !turmaId) return;
    apiFetch(`/conteudo/turmas/${turmaId}/pedidos`).then(setDados).catch(() => setDados(null));
  }, [ver, turmaId]);

  if (!ver || !dados) return null;
  const { pedidos, dispensada } = dados;
  if (!pedidos.length && !escreve) return null;
  if (!pedidos.length && dispensada && !escreve) return null;

  return (
    <section style={card} aria-label="Materiais de conteúdo desta turma">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: colors.textPrimary }}>Materiais de conteúdo</div>
        {escreve && (
          <Link href={`/conteudo?aba=tbt&turma=${turmaId}`} style={link}>
            {pedidos.length ? "Abrir Produção de conteúdo" : "Criar pedido de material"}
          </Link>
        )}
      </div>
      {pedidos.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6 }}>
          {dispensada ? `Marcada como “não precisa de material”${dispensada.motivo ? `: ${dispensada.motivo}` : ""}.` : "Nenhum material ligado a esta turma ainda."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {pedidos.map((p) => {
            const st = STATUS[p.status] || STATUS.a_fazer;
            const linha = (
              <>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.titulo}</span>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  {[p.tipo, p.analista_nome || "Sem analista", p.status === "concluido" && p.concluido_em ? `concluído em ${fmtData(p.concluido_em)}` : null].filter(Boolean).join(" · ")}
                </span>
                <span style={{ ...selo, background: st.bg, color: st.cor }}>{st.rotulo}</span>
              </>
            );
            return escreve || perfil === "superintendente" ? (
              <Link key={p.id} href={`/conteudo/${p.id}`} style={linhaPedido}>{linha}</Link>
            ) : (
              <div key={p.id} style={linhaPedido}>{linha}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const card = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: "12px 16px", marginBottom: 14 };
const link = { color: colors.primary, fontWeight: 700, fontSize: 13, textDecoration: "underline" };
const linhaPedido = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.surfaceMuted, textDecoration: "none", color: colors.textPrimary };
const selo = { padding: "2px 8px", borderRadius: radius.pill, fontSize: 11.5, fontWeight: 800, marginLeft: "auto" };
