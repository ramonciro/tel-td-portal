# Sprint 5 — Analytics & KPIs

## O que foi entregue

### Backend
| Arquivo | O que é |
|---|---|
| `backend/src/controllers/analyticsController.js` | 🆕 Motor de analytics: 5 endpoints com queries reais ao banco |
| `backend/src/index.js` | 🔄 Rotas `/api/analytics/*` registradas |

### Frontend
| Arquivo | O que é |
|---|---|
| `frontend/app/inicio/page.js` | 🔄 Dashboard home redesenhado com dados reais |
| `frontend/app/indicadores/page.js` | 🆕 Página analytics completa: Horas / NPS / Efetividade / ROI |
| `frontend/components/PortalShell.js` | 🔄 "📊 Indicadores" adicionado ao menu |

## Endpoints criados

| Endpoint | Dados |
|---|---|
| `GET /api/analytics/resumo` | KPIs globais: horas, turmas, participantes, NPS, presença |
| `GET /api/analytics/horas` | Horas por mês (12m), por cliente, por instrutor |
| `GET /api/analytics/nps` | Score NPS, promotores/neutros/detratores, tendência, por turma |
| `GET /api/analytics/efetividade` | Taxa aprovação, nota média, presença, por cliente |
| `GET /api/analytics/roi` | Horas × pessoas, taxa conclusão, custo estimado |

## Cálculo NPS
- Promotores: nota_nps >= 9
- Neutros: nota_nps 7-8.9
- Detratores: nota_nps < 7
- Score = (promotores - detratores) / total × 100

## Notas
- Todos os dados filtrados por empresa_id (tenant isolation automático)
- super_admin vê dados globais de todos os tenants
- Custo estimado do ROI usa R$ 150/h por participante (referência indicativa)
- Sem migration SQL necessária — lê das tabelas existentes
