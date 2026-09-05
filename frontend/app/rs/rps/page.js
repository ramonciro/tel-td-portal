'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getStoredUser } from '../../../services/api';
import { podeAcessarRS, podeEditarRS } from '../../../lib/perfilUtils';

// ─── Helpers ───────────────────────────────────────────────────────

const MES_ATUAL = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtDate = (v) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return v; }
};

const fmtNum = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'));

const STATUS_CONFIG = {
  'ENTREGUE':     { bg: '#dcfce7', color: '#166534', label: 'Entregue' },
  'EM ANDAMENTO': { bg: '#dbeafe', color: '#1e40af', label: 'Em Andamento' },
  'NÃO ENTREGUE': { bg: '#fee2e2', color: '#991b1b', label: 'Não Entregue' },
  'CANCELADA':    { bg: '#f3f4f6', color: '#374151', label: 'Cancelada' },
};

const MESES_LABEL = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun',
  '07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez',
};

function mesLabel(mes) {
  if (!mes) return '';
  const [ano, mm] = mes.split('-');
  return `${MESES_LABEL[mm] || mm}/${ano}`;
}

function getMesesDisponiveis() {
  const meses = [];
  const hoje = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push(val);
  }
  return meses;
}

// ─── Badge de status ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { bg: '#f3f4f6', color: '#374151', label: status };
  return (
    <span style={{
      display: 'inline-block', background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Modal de criação/edição ────────────────────────────────────────
const FORM_INICIAL = {
  mes_referencia: MES_ATUAL(),
  site: '', setor: 'OPERACIONAL', chamado: '', produto: '', cargo: '',
  data_recebimento: '', status: 'EM ANDAMENTO',
  inicio_av_tecnica: '', final_av_tecnica: '', data_fechamento_vaga: '',
  hcs: '', hcs_com_to: '', hcs_aprovados: '', qtd_entregue: '',
  observacoes: '',
};

function RPModal({ open, rp, sites, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [produtoSugestoes, setProdutoSugestoes] = useState([]);
  const [showSugestoes, setShowSugestoes] = useState(false);

  useEffect(() => {
    if (rp) {
      setForm({
        mes_referencia:       rp.mes_referencia ? rp.mes_referencia.slice(0, 7) : MES_ATUAL(),
        site:                 rp.site || '',
        setor:                rp.setor || 'OPERACIONAL',
        chamado:              rp.chamado || '',
        produto:              rp.produto || '',
        cargo:                rp.cargo || '',
        data_recebimento:     rp.data_recebimento ? rp.data_recebimento.slice(0, 10) : '',
        status:               rp.status || 'EM ANDAMENTO',
        inicio_av_tecnica:    rp.inicio_av_tecnica ? rp.inicio_av_tecnica.slice(0, 10) : '',
        final_av_tecnica:     rp.final_av_tecnica ? rp.final_av_tecnica.slice(0, 10) : '',
        data_fechamento_vaga: rp.data_fechamento_vaga ? rp.data_fechamento_vaga.slice(0, 10) : '',
        hcs:                  rp.hcs ?? '',
        hcs_com_to:           rp.hcs_com_to ?? '',
        hcs_aprovados:        rp.hcs_aprovados ?? '',
        qtd_entregue:         rp.qtd_entregue ?? '',
        observacoes:          rp.observacoes || '',
      });
    } else {
      setForm(FORM_INICIAL);
    }
    setErro('');
  }, [rp, open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const buscarSugestoes = useCallback(async (q) => {
    if (!q || q.length < 2) { setProdutoSugestoes([]); return; }
    try {
      const data = await apiFetch(`/api/rs/produtos?q=${encodeURIComponent(q)}`);
      setProdutoSugestoes(data);
    } catch { setProdutoSugestoes([]); }
  }, []);

  const handleSalvar = async () => {
    if (!form.site || !form.produto) {
      setErro('Site e Produto são obrigatórios.');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      const payload = { ...form };
      if (payload.mes_referencia && payload.mes_referencia.length === 7) {
        payload.mes_referencia = payload.mes_referencia + '-01';
      }
      if (rp) {
        await apiFetch(`/api/rs/rps/${rp.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/rs/rps', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const isEstr = form.setor === 'ESTRATÉGICO';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 16,
        padding: '32px 36px', width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', color: '#e2e8f0',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: '#FF6B4A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>R&S</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
              {rp ? 'Editar Requisição' : 'Nova Requisição de Pessoa'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {/* Toggle Setor */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Setor *</label>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #1e2d45' }}>
            {['OPERACIONAL', 'ESTRATÉGICO'].map(s => (
              <button key={s} onClick={() => set('setor', s)} style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13,
                background: form.setor === s ? '#FF6B4A' : '#0B1220',
                color: form.setor === s ? '#fff' : '#94a3b8',
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Grid principal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>

          <div>
            <label style={labelStyle}>Mês de Referência *</label>
            <input type="month" value={form.mes_referencia}
              onChange={e => set('mes_referencia', e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Site *</label>
            <select value={form.site} onChange={e => set('site', e.target.value)} style={inputStyle}>
              <option value="">Selecione...</option>
              {sites.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
          </div>

          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Produto / Cliente *</label>
            <input
              value={form.produto}
              onChange={e => { set('produto', e.target.value); buscarSugestoes(e.target.value); setShowSugestoes(true); }}
              onBlur={() => setTimeout(() => setShowSugestoes(false), 150)}
              placeholder="Ex: SAFRA, DASA, CEMIG..."
              style={inputStyle}
            />
            {showSugestoes && produtoSugestoes.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: 180, overflowY: 'auto',
              }}>
                {produtoSugestoes.map(p => (
                  <div key={p} onClick={() => { set('produto', p); setShowSugestoes(false); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13, color: '#e2e8f0', borderBottom: '1px solid #1e2d45' }}
                    onMouseOver={e => e.currentTarget.style.background = '#1e2d45'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >{p}</div>
                ))}
              </div>
            )}
          </div>

          {isEstr ? (
            <div>
              <label style={labelStyle}>Cargo</label>
              <input value={form.cargo} onChange={e => set('cargo', e.target.value)}
                placeholder="Ex: SUPERVISOR DE TELEMARKETING" style={inputStyle} />
            </div>
          ) : <div />}

          <div>
            <label style={labelStyle}>Chamado</label>
            <input value={form.chamado} onChange={e => set('chamado', e.target.value)}
              placeholder="Nº GLPI, e-mail, DECOLA..." style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Status *</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
              <option value="EM ANDAMENTO">Em Andamento</option>
              <option value="ENTREGUE">Entregue</option>
              <option value="NÃO ENTREGUE">Não Entregue</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Data de Recebimento da RP</label>
            <input type="date" value={form.data_recebimento}
              onChange={e => set('data_recebimento', e.target.value)} style={inputStyle} />
          </div>

          {!isEstr && (
            <>
              <div>
                <label style={labelStyle}>Início da Av. Técnica</label>
                <input type="date" value={form.inicio_av_tecnica}
                  onChange={e => set('inicio_av_tecnica', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Final da Av. Técnica</label>
                <input type="date" value={form.final_av_tecnica}
                  onChange={e => set('final_av_tecnica', e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          {isEstr && (
            <div>
              <label style={labelStyle}>Data de Fechamento da Vaga</label>
              <input type="date" value={form.data_fechamento_vaga}
                onChange={e => set('data_fechamento_vaga', e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>

        {/* Bloco HCs */}
        <div style={{ marginTop: 24, padding: 20, background: '#0B1220', borderRadius: 10, border: '1px solid #1e2d45' }}>
          <div style={{ fontSize: 11, color: '#FF6B4A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Headcount
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { field: 'hcs',           label: "HC'S Solicitados" },
              { field: 'hcs_com_to',    label: "HC'S com TO" },
              { field: 'hcs_aprovados', label: "HC'S Aprovados" },
              { field: 'qtd_entregue',  label: 'QTD Entregue' },
            ].map(({ field, label }) => (
              <div key={field}>
                <label style={{ ...labelStyle, fontSize: 11 }}>{label}</label>
                <input type="number" min="0" value={form[field]}
                  onChange={e => set(field, e.target.value)}
                  style={{ ...inputStyle, textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Observações</label>
          <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
            rows={2} maxLength={500} placeholder="Anotações livres sobre esta RP..."
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
        </div>

        {erro && (
          <div style={{ marginTop: 12, padding: '10px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
          <button onClick={onClose} disabled={saving} style={btnSecStyle}>Cancelar</button>
          <button onClick={handleSalvar} disabled={saving} style={btnPrimStyle}>
            {saving ? 'Salvando...' : rp ? 'Salvar Alterações' : 'Criar RP'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────
export default function RPsPage() {
  const router = useRouter();
  const [rps, setRps] = useState([]);
  const [totais, setTotais] = useState(null);
  const [total, setTotal] = useState(0);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acessoOk, setAcessoOk] = useState(false);

  const [filtroMes, setFiltroMes] = useState(MES_ATUAL());
  const [filtroSite, setFiltroSite] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroProduto, setFiltroProduto] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [rpEditando, setRpEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ── Guard de acesso ──────────────────────────────────────────────
  // Roda uma única vez ao montar. Redireciona silenciosamente se o
  // perfil não tem acesso ao módulo R&S.
  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.replace('/login'); return; }
    if (!podeAcessarRS(user.perfil)) { router.replace('/inicio'); return; }
    setAcessoOk(true);
  }, [router]);

  const user = getStoredUser();
  const podeEditar = podeEditarRS(user?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroMes)     params.set('mes', filtroMes);
      if (filtroSite)    params.set('site', filtroSite);
      if (filtroSetor)   params.set('setor', filtroSetor);
      if (filtroStatus)  params.set('status', filtroStatus);
      if (filtroProduto) params.set('produto', filtroProduto);

      const data = await apiFetch(`/api/rs/rps?${params.toString()}`);
      setRps(data.rps || []);
      setTotais(data.totais || null);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Erro ao carregar RPs', e);
    } finally {
      setLoading(false);
    }
  }, [filtroMes, filtroSite, filtroSetor, filtroStatus, filtroProduto]);

  const carregarSites = useCallback(async () => {
    try {
      const data = await apiFetch('/api/rs/sites');
      setSites(data);
    } catch { setSites([]); }
  }, []);

  useEffect(() => { if (acessoOk) { carregar(); carregarSites(); } }, [acessoOk, carregar, carregarSites]);

  const handleEditar = (rp) => { setRpEditando(rp); setModalOpen(true); };
  const handleNova   = () => { setRpEditando(null); setModalOpen(true); };

  const handleExcluir = async (id) => {
    try {
      await apiFetch(`/api/rs/rps/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      carregar();
    } catch (e) { alert(e.message || 'Erro ao excluir'); }
  };

  const showAmbos = !filtroSetor;
  const showEstr  = !filtroSetor || filtroSetor === 'ESTRATÉGICO';

  // Enquanto verifica acesso, não renderiza nada
  if (!acessoOk) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0B1220', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>

      {/* ── PageHero ── */}
      <div style={{ padding: '32px 40px 0' }}>
        <div style={{ fontSize: 11, color: '#FF6B4A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
          Recrutamento & Seleção
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>
              Requisições de Pessoas
            </h1>
            <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>
              {loading
                ? 'Carregando...'
                : `${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''} · ${mesLabel(filtroMes) || 'todos os meses'}`}
            </p>
          </div>
          {podeEditar && (
            <button onClick={handleNova} style={{
              background: '#FF6B4A', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px 24px',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              + Nova RP
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ padding: '24px 40px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={filterLabelStyle}>Mês</label>
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={filterSelectStyle}>
            <option value="">Todos</option>
            {getMesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Site</label>
          <select value={filtroSite} onChange={e => setFiltroSite(e.target.value)} style={filterSelectStyle}>
            <option value="">Todos os sites</option>
            {sites.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Setor</label>
          <div style={{ display: 'flex', border: '1px solid #1e2d45', borderRadius: 8, overflow: 'hidden' }}>
            {[{ val: '', lbl: 'Todos' }, { val: 'OPERACIONAL', lbl: 'Operacional' }, { val: 'ESTRATÉGICO', lbl: 'Estratégico' }].map(({ val, lbl }) => (
              <button key={val} onClick={() => setFiltroSetor(val)} style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: filtroSetor === val ? '#FF6B4A' : '#0f1a2e',
                color: filtroSetor === val ? '#fff' : '#94a3b8',
              }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={filterLabelStyle}>Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={filterSelectStyle}>
            <option value="">Todos</option>
            <option value="EM ANDAMENTO">Em Andamento</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="NÃO ENTREGUE">Não Entregue</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Produto/Cliente</label>
          <input value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
            placeholder="Buscar produto..." style={{ ...filterSelectStyle, width: 160 }} />
        </div>

        {(filtroSite || filtroSetor || filtroStatus || filtroProduto) && (
          <button onClick={() => { setFiltroSite(''); setFiltroSetor(''); setFiltroStatus(''); setFiltroProduto(''); }}
            style={{ alignSelf: 'flex-end', padding: '8px 14px', background: 'none', border: '1px solid #1e2d45', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
            Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ── */}
      <div style={{ padding: '24px 40px 40px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Carregando requisições...</div>
        ) : rps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600 }}>Nenhuma RP encontrada</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Ajuste os filtros ou crie uma nova requisição.</div>
          </div>
        ) : (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #1e2d45' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0f1a2e' }}>
                  <Th>Mês</Th>
                  <Th>Site</Th>
                  {showAmbos && <Th>Setor</Th>}
                  <Th>Produto</Th>
                  {showEstr && <Th>Cargo</Th>}
                  <Th>Chamado</Th>
                  <Th>Recebimento</Th>
                  <Th>Status</Th>
                  {filtroSetor === 'OPERACIONAL' && <><Th>Início Av.</Th><Th>Final Av.</Th></>}
                  {showAmbos && <><Th>Início Av.</Th><Th>Final Av.</Th></>}
                  {filtroSetor === 'ESTRATÉGICO' && <Th>Fechamento</Th>}
                  <Th align="right">HC'S</Th>
                  <Th align="right">TO</Th>
                  <Th align="right">Aprovados</Th>
                  <Th align="right">Entregue</Th>
                  {podeEditar && <Th align="center">⚙️</Th>}
                </tr>
              </thead>
              <tbody>
                {rps.map((rp, i) => (
                  <tr key={rp.id} style={{ background: i % 2 === 0 ? '#0B1220' : '#0d1526', borderBottom: '1px solid #1e2d45' }}>
                    <Td>{mesLabel(rp.mes_referencia?.slice(0, 7))}</Td>
                    <Td>{rp.site}</Td>
                    {showAmbos && (
                      <Td>
                        <span style={{ fontSize: 11, fontWeight: 600, color: rp.setor === 'OPERACIONAL' ? '#60a5fa' : '#a78bfa' }}>
                          {rp.setor === 'OPERACIONAL' ? 'Oper.' : 'Estr.'}
                        </span>
                      </Td>
                    )}
                    <Td bold>{rp.produto}</Td>
                    {showEstr && <Td muted>{rp.cargo || '—'}</Td>}
                    <Td muted>{rp.chamado || '—'}</Td>
                    <Td muted>{fmtDate(rp.data_recebimento)}</Td>
                    <Td><StatusBadge status={rp.status} /></Td>
                    {(showAmbos || filtroSetor === 'OPERACIONAL') && (
                      <>
                        <Td muted>{rp.setor === 'OPERACIONAL' ? fmtDate(rp.inicio_av_tecnica) : '—'}</Td>
                        <Td muted>{rp.setor === 'OPERACIONAL' ? fmtDate(rp.final_av_tecnica) : '—'}</Td>
                      </>
                    )}
                    {filtroSetor === 'ESTRATÉGICO' && <Td muted>{fmtDate(rp.data_fechamento_vaga)}</Td>}
                    <Td align="right" bold>{fmtNum(rp.hcs)}</Td>
                    <Td align="right" muted>{fmtNum(rp.hcs_com_to)}</Td>
                    <Td align="right">{fmtNum(rp.hcs_aprovados)}</Td>
                    <Td align="right" bold style={{ color: '#4ade80' }}>{fmtNum(rp.qtd_entregue)}</Td>
                    {podeEditar && (
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleEditar(rp)}
                          style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', padding: '4px 10px', fontSize: 12, marginRight: 6 }}>
                          ✏️
                        </button>
                        <button onClick={() => setConfirmDelete(rp)}
                          style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, color: '#f87171', cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}>
                          🗑
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Linha de TOTAIS */}
                {totais && (
                  <tr style={{ background: '#0f1a2e', borderTop: '2px solid #1e2d45' }}>
                    <td colSpan={showAmbos ? (podeEditar ? 8 : 7) : (podeEditar ? 7 : 6)}
                      style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#FF6B4A', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      TOTAL
                    </td>
                    {(showAmbos || filtroSetor === 'OPERACIONAL') && <td colSpan={2} />}
                    {filtroSetor === 'ESTRATÉGICO' && <td />}
                    <td style={tdTotalStyle}>{fmtNum(totais.hcs)}</td>
                    <td style={tdTotalStyle}>{fmtNum(totais.hcs_com_to)}</td>
                    <td style={tdTotalStyle}>{fmtNum(totais.hcs_aprovados)}</td>
                    <td style={{ ...tdTotalStyle, color: '#4ade80' }}>{fmtNum(totais.qtd_entregue)}</td>
                    {podeEditar && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <RPModal
        open={modalOpen} rp={rpEditando} sites={sites}
        onClose={() => setModalOpen(false)} onSaved={carregar}
      />

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 14, padding: 32, maxWidth: 400, width: '100%', color: '#e2e8f0' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Excluir requisição?</div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
              <strong>{confirmDelete.produto}</strong> · {confirmDelete.site} · {mesLabel(confirmDelete.mes_referencia?.slice(0, 7))}
              <br />Esta ação não pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={btnSecStyle}>Cancelar</button>
              <button onClick={() => handleExcluir(confirmDelete.id)}
                style={{ ...btnPrimStyle, background: '#ef4444' }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────────
function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '12px 16px', textAlign: align,
      fontSize: 11, fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: 0.5,
      borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left', bold, muted, style: extraStyle }) {
  return (
    <td style={{
      padding: '10px 16px', textAlign: align,
      color: muted ? '#64748b' : (bold ? '#e2e8f0' : '#cbd5e1'),
      fontWeight: bold ? 600 : 400, whiteSpace: 'nowrap',
      ...extraStyle,
    }}>{children}</td>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────
const labelStyle = {
  display: 'block', fontSize: 12, color: '#94a3b8',
  fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
};

const filterLabelStyle = {
  display: 'block', fontSize: 11, color: '#64748b',
  fontWeight: 600, marginBottom: 4, textTransform: 'uppercase',
};

const inputStyle = {
  width: '100%', background: '#0B1220', border: '1px solid #1e2d45',
  borderRadius: 8, color: '#e2e8f0', padding: '10px 12px',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

const filterSelectStyle = {
  background: '#0f1a2e', border: '1px solid #1e2d45',
  borderRadius: 8, color: '#e2e8f0', padding: '8px 12px',
  fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
};

const btnPrimStyle = {
  background: '#FF6B4A', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 24px', fontWeight: 700,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};

const btnSecStyle = {
  background: 'none', color: '#94a3b8', border: '1px solid #1e2d45',
  borderRadius: 8, padding: '10px 24px', fontWeight: 600,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};

const tdTotalStyle = {
  padding: '12px 16px', textAlign: 'right',
  fontWeight: 700, color: '#e2e8f0', fontSize: 14,
};
