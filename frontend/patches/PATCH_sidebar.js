// ─────────────────────────────────────────────────────────────────────────────
// PATCH: frontend/components/PortalShell.js (ou o componente de sidebar do portal)
//
// 1. Adicionar import no topo do arquivo:
// ─────────────────────────────────────────────────────────────────────────────

import { podeAcessarRS, podeAcessarTD } from '@/lib/perfilUtils';

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dentro do componente, recuperar o perfil do usuário logado:
//    (provavelmente já existe algo assim — adaptar conforme o código atual)
// ─────────────────────────────────────────────────────────────────────────────

const user = getStoredUser();
const perfil = user?.perfil || '';
const verTD = podeAcessarTD(perfil);
const verRS = podeAcessarRS(perfil);

// ─────────────────────────────────────────────────────────────────────────────
// 3. No JSX do sidebar, envolver os itens T&D com {verTD && (...)}
//    e adicionar a seção R&S envolta com {verRS && (...)}
//
//    Exemplo de estrutura final do sidebar:
// ─────────────────────────────────────────────────────────────────────────────

/*

  {verTD && (
    <>
      <SidebarLink href="/inicio"       label="Início"        icon="🏠" />
      <SidebarLink href="/turmas"       label="Turmas"        icon="📚" />
      <SidebarLink href="/presencas"    label="Presenças"     icon="✅" />
      <SidebarLink href="/avaliacoes"   label="Avaliações"    icon="📝" />
      <SidebarLink href="/treinamentos" label="Treinamentos"  icon="🎓" />
      <SidebarLink href="/usuarios"     label="Usuários"      icon="👤" />
      <SidebarLink href="/trilhas"      label="Trilhas"       icon="🛤️" />
      <SidebarLink href="/necessidades" label="Necessidades"  icon="💡" />
      <SidebarLink href="/biblioteca"   label="Biblioteca"    icon="📖" />
      <SidebarLink href="/nps"          label="NPS"           icon="⭐" />
      <SidebarLink href="/auditoria"    label="Auditoria"     icon="🔍" />
      {/* outros itens T&D */}
    </>
  )}

  {verRS && (
    <>
      {/* Separador visual somente quando exibe ambos os módulos */}
      {verTD && (
        <div style={{ borderTop: '1px solid #1e2d45', margin: '12px 0' }} />
      )}

      {/* Eyebrow de seção */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#FF6B4A',
        textTransform: 'uppercase', letterSpacing: 1.5,
        padding: '0 16px', marginBottom: 4,
      }}>
        R&S
      </div>

      <SidebarLink href="/rs/rps"      label="Requisições"     icon="👥" />
      {/* Sprint 2: */}
      {/* <SidebarLink href="/rs"          label="Dashboard R&S"   icon="📊" /> */}
      {/* <SidebarLink href="/rs/relatorio" label="Relatório Mensal" icon="📈" /> */}
    </>
  )}

*/
