import axios from 'axios'
import { useAuthStore } from '../store/useStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return api.post('/auth/login', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// ── Companies ─────────────────────────────────────────────────────────────────
export const companiesApi = {
  list: (status?: string) => api.get('/companies', { params: { status } }),
  get: (id: number) => api.get(`/companies/${id}`),
  create: (data: object, autoOrg = true, aiBudget = 'any') =>
    api.post(`/companies?auto_org=${autoOrg}&ai_budget=${aiBudget}`, data),
  update: (id: number, data: object) => api.patch(`/companies/${id}`, data),
  delete: (id: number) => api.delete(`/companies/${id}`),
  orgTree: (id: number) => api.get(`/companies/${id}/org-tree`),
}

// ── Org ───────────────────────────────────────────────────────────────────────
export const orgApi = {
  nodes: (companyId?: number) =>
    api.get('/org/nodes', { params: { company_id: companyId } }),
  createNode: (data: object) => api.post('/org/nodes', data),
  updateNode: (id: number, data: object) => api.patch(`/org/nodes/${id}`, data),
  moveNode: (id: number, parentId: number) => api.patch(`/org/nodes/${id}/move`, { parent_id: parentId }),
  deleteNode: (id: number) => api.delete(`/org/nodes/${id}`),
  testNode: (id: number) => api.post(`/org/nodes/${id}/test`),
  graph: (companyId?: number) =>
    api.get('/org/graph', { params: { company_id: companyId } }),
  groupTree: () => api.get('/org/group-tree'),
  templates: () => api.get('/org/templates'),
  proposals: (companyId?: number) =>
    api.get('/org/proposals', { params: { company_id: companyId } }),
  approveProposal: (id: number) => api.post(`/org/proposals/${id}/approve`),
  rejectProposal: (id: number) => api.post(`/org/proposals/${id}/reject`),
  ensureSpecialists: (companyId: number) => api.post(`/org/ensure-specialists/${companyId}`),
  ensureAllSpecialists: () => api.post('/org/ensure-all-specialists'),
  migrateMock: () => api.post('/org/migrate-mock'),
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatApi = {
  sessions: (sessionType?: string) =>
    api.get('/chat/sessions', { params: { session_type: sessionType } }),
  createSession: (data: object) => api.post('/chat/sessions', data),
  deleteSession: (id: number) => api.delete(`/chat/sessions/${id}`),
  messages: (sessionId: number) =>
    api.get(`/chat/sessions/${sessionId}/messages`),
  send: (data: object) => api.post('/chat/send', data),
  companyQuery: (companyId: number, question: string) =>
    api.post('/chat/company-query', { company_id: companyId, question }),
  confirmCompany: (data: object) => api.post('/chat/confirm-company', data),
  briefCeo: (companyId: number) => api.post('/chat/brief-ceo', { company_id: companyId }),
  groupKpi: () => api.get('/chat/group-kpi'),
  collaborate: (companyAId: number, companyBId: number, task: string) =>
    api.post('/chat/collaborate', { company_a_id: companyAId, company_b_id: companyBId, task }),
  timeline: (limit?: number) => api.get('/chat/timeline', { params: { limit } }),
  multiCeoMeeting: (companyIds: number[], topic: string) =>
    api.post('/chat/multi-ceo-meeting', { company_ids: companyIds, topic }),
  performanceReport: () => api.get('/chat/performance-report'),
  boardMeeting: (agenda: string, companyIds: number[], includeIndependent?: boolean) =>
    api.post('/chat/board-meeting', { agenda, company_ids: companyIds, include_independent: includeIndependent ?? true }),
  recommendedActions: () => api.get('/chat/recommended-actions'),
  suggestions: (companyId?: number) =>
    api.get('/chat/suggestions', { params: { company_id: companyId } }),
  dismissSuggestion: (id: number) => api.post(`/chat/suggestions/${id}/dismiss`),
}

// ── Approvals ─────────────────────────────────────────────────────────────────
export const approvalsApi = {
  inbox: () => api.get('/approvals/inbox'),
  list: (status?: string) => api.get('/approvals', { params: { status } }),
  counts: () => api.get('/approvals/counts'),
  create: (data: object) => api.post('/approvals', data),
  review: (id: number, data: object) => api.post(`/approvals/${id}/review`, data),
  delete: (id: number) => api.delete(`/approvals/${id}`),
}

// ── Meetings ──────────────────────────────────────────────────────────────────
export const meetingsApi = {
  list: (companyId?: number) =>
    api.get('/meetings', { params: { company_id: companyId } }),
  create: (data: object) => api.post('/meetings', data),
  get: (id: number) => api.get(`/meetings/${id}`),
  messages: (id: number) => api.get(`/meetings/${id}/messages`),
  addMessage: (id: number, data: object) =>
    api.post(`/meetings/${id}/messages`, data),
  aiResponse: (id: number, role?: string) =>
    api.post(`/meetings/${id}/ai-response`, null, {
      params: { responder_role: role },
    }),
  close: (id: number) => api.post(`/meetings/${id}/close`),
  delete: (id: number) => api.delete(`/meetings/${id}`),
  summarize: (id: number) => api.post(`/meetings/${id}/summarize`),
}

// ── Market ────────────────────────────────────────────────────────────────────
export const marketApi = {
  analyze: (data: object) => api.post('/market/analyze', data),
  reports: (companyId?: number) =>
    api.get('/market/reports', { params: { company_id: companyId } }),
  getReport: (id: number) => api.get(`/market/reports/${id}`),
}

// ── Simulation ────────────────────────────────────────────────────────────────
export const simulationApi = {
  run: (data: object) => api.post('/simulation/run', data),
  list: (companyId?: number) =>
    api.get('/simulation', { params: { company_id: companyId } }),
  get: (id: number) => api.get(`/simulation/${id}`),
  merger: (data: object) => api.post('/simulation/merger', data),
}

// ── AI Models ─────────────────────────────────────────────────────────────────
export const modelsApi = {
  catalog: (provider?: string) =>
    api.get('/models/catalog', { params: { provider } }),
  recommend: (data: object) => api.post('/models/recommend', data),
  assign: (data: object) => api.post('/models/assign', data),
  providers: () => api.get('/models/providers'),
  saveProvider: (data: object) => api.post('/models/providers', data),
  deleteProvider: (id: number) => api.delete(`/models/providers/${id}`),
  health: () => api.get('/models/providers/health'),
  ollamaStatus: () => api.get('/models/ollama/status'),
}

// ── External API Keys ──────────────────────────────────────────────────────────
export const externalKeyApi = {
  list: () => api.get('/data/api-keys'),
  create: (data: object) => api.post('/data/api-keys', data),
  delete: (id: number) => api.delete(`/data/api-keys/${id}`),
  test: (id: number) => api.post(`/data/api-keys/${id}/test`),
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (unreadOnly?: boolean) => api.get('/notifications', { params: { unread_only: unreadOnly } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: number) => api.post(`/notifications/read/${id}`),
  markAllRead: () => api.post('/notifications/read-all'),
  delete: (id: number) => api.delete(`/notifications/${id}`),
}

// ── Memory ────────────────────────────────────────────────────────────────────
export const memoryApi = {
  list: (params?: object) => api.get('/memory', { params }),
  create: (data: object) => api.post('/memory', data),
  delete: (id: number) => api.delete(`/memory/${id}`),
  stats: () => api.get('/memory/stats/summary'),
}

// ── Strategy ──────────────────────────────────────────────────────────────────
export const strategyApi = {
  map: (companyId?: number) =>
    api.get('/strategy/map', { params: { company_id: companyId } }),
  createItem: (data: object) => api.post('/strategy/map', data),
  updateItem: (id: number, data: object) => api.patch(`/strategy/map/${id}`, data),
  deleteItem: (id: number) => api.delete(`/strategy/map/${id}`),
  evaluateCEO: (data: object) => api.post('/strategy/ceo/evaluate', data),
  ceoPerformance: (companyId?: number) =>
    api.get('/strategy/ceo/performance', { params: { company_id: companyId } }),
  leaderboard: () => api.get('/strategy/ceo/leaderboard'),
  collaborations: () => api.get('/strategy/collaborations'),
  createCollaboration: (data: object) => api.post('/strategy/collaborations', data),
  generate: (companyId: number, focus?: string) =>
    api.post('/strategy/generate', { company_id: companyId, focus }),
}

// ── Knowledge / Dashboard ─────────────────────────────────────────────────────
export const knowledgeApi = {
  list: (params?: object) => api.get('/knowledge', { params }),
  create: (data: object) => api.post('/knowledge', data),
  get: (id: number) => api.get(`/knowledge/${id}`),
  delete: (id: number) => api.delete(`/knowledge/${id}`),
}

export const liveOfficeApi = {
  agents: (companyId?: number) =>
    api.get('/knowledge/agents/live', { params: { company_id: companyId } }),
}

export const dashboardApi = {
  stats: () => api.get('/knowledge/dashboard/stats'),
}

// ── Work (Autonomous Loop) ────────────────────────────────────────────────────
export const workApi = {
  trigger: (companyId: number) => api.post(`/work/trigger/${companyId}`),
  logs: (companyId?: number, cycleId?: string, limit?: number) =>
    api.get('/work/logs', { params: { company_id: companyId, cycle_id: cycleId, limit } }),
  cycles: (companyId?: number) =>
    api.get('/work/cycles', { params: { company_id: companyId } }),
  p2p: (fromNodeId: number, toNodeId: number, topic: string) =>
    api.post('/work/p2p', { from_node_id: fromNodeId, to_node_id: toNodeId, topic }),
  p2pList: (companyId?: number) =>
    api.get('/work/p2p', { params: { company_id: companyId } }),
  weeklyReport: (companyId: number) =>
    api.post(`/work/weekly-report/${companyId}`),
}

// ── Talent ────────────────────────────────────────────────────────────────────
export const talentApi = {
  match: (companyIds: number[]) =>
    api.post('/strategy/talent', { company_ids: companyIds }),
}

// ── Sites ─────────────────────────────────────────────────────────────────────
export const sitesApi = {
  list: (status?: string) => api.get('/sites', { params: { status } }),
  getCompanySite: (companyId: number) => api.get(`/sites/company/${companyId}`),
  generate: (companyId: number, templateType = 'corporate') =>
    api.post(`/sites/generate/${companyId}`, null, { params: { template_type: templateType } }),
  getHtml: (siteId: number) => api.get(`/sites/${siteId}/html`),
  updateHtml: (siteId: number, html: string) => api.patch(`/sites/${siteId}/html`, { html }),
  deploy: (siteId: number) => api.post(`/sites/${siteId}/deploy`),
  undeploy: (siteId: number) => api.post(`/sites/${siteId}/undeploy`),
  submissions: (siteId: number) => api.get(`/sites/${siteId}/submissions`),
  evaluate: () => api.post('/sites/evaluate'),
  generateIR: (companyId: number) => api.post(`/sites/ir/${companyId}`),
  // Multipage
  generatePages: (siteId: number) => api.post(`/sites/${siteId}/pages/generate`),
  listPages: (siteId: number) => api.get(`/sites/${siteId}/pages`),
  getPageHtml: (siteId: number, pageId: number) => api.get(`/sites/${siteId}/pages/${pageId}/html`),
  updatePage: (siteId: number, pageId: number, data: { html?: string; title?: string }) =>
    api.patch(`/sites/${siteId}/pages/${pageId}`, data),
}

// ── Synergy ───────────────────────────────────────────────────────────────────
export const synergyApi = {
  analyze: (companyIds: number[]) =>
    api.post('/strategy/synergy', { company_ids: companyIds }),
}

// ── Terminal ──────────────────────────────────────────────────────────────────
export const terminalApi = {
  list: (status?: string, companyId?: number) =>
    api.get('/terminal/requests', { params: { status, company_id: companyId } }),
  request: (data: object) => api.post('/terminal/request', data),
  decide: (id: number, action: 'approve' | 'reject', note?: string) =>
    api.post(`/terminal/requests/${id}/decide`, { action, note }),
  execute: (id: number) => api.post(`/terminal/requests/${id}/execute`),
  approveAndExecute: (id: number) => api.post(`/terminal/requests/${id}/approve-and-execute`),
  live: (limit = 20) => api.get('/terminal/live', { params: { limit } }),
}

// ── Capabilities ──────────────────────────────────────────────────────────────
export const capabilitiesApi = {
  company: (companyId: number) => api.get(`/capabilities/company/${companyId}`),
  pending: () => api.get('/capabilities/pending'),
  analyze: (companyId: number) => api.get(`/capabilities/analyze/${companyId}`),
  request: (companyId: number) => api.post(`/capabilities/request/${companyId}`),
  activate: (capabilityId: number) => api.post(`/capabilities/${capabilityId}/activate`),
}

// ── Game ──────────────────────────────────────────────────────────────────────
export const gameApi = {
  trending: (query = '', platform = 'all') =>
    api.get('/game/trending', { params: { query, platform } }),
  analytics: (gameTitle: string, companyId?: number) =>
    api.post('/game/analytics', { game_title: gameTitle, company_id: companyId }),
  generateIdeas: (companyId: number, genre = '', platform = '', count = 3) =>
    api.post('/game/ideas/generate', { company_id: companyId, genre, platform, count }),
  saveIdea: (data: object) => api.post('/game/ideas/save', data),
  projects: (companyId: number) => api.get(`/game/projects/${companyId}`),
  createProject: (data: object) => api.post('/game/projects', data),
  updateProject: (id: number, data: object) => api.patch(`/game/projects/${id}`, data),
  permits: (country = 'KR') => api.get('/game/permits', { params: { country } }),
}

// ── Agent (personality + direct chat) ────────────────────────────────────────
export const agentApi = {
  updatePersonality: (nodeId: number, personality: object) =>
    api.patch(`/org/nodes/${nodeId}/personality`, personality),
  chat: (nodeId: number, message: string) =>
    api.post('/chat/agent-chat', { node_id: nodeId, message }),
}

// ── Video Generation ──────────────────────────────────────────────────────────
export const videoApi = {
  models: () => api.get('/video/models'),
  stats: () => api.get('/video/stats'),
  generate: (data: object) => api.post('/video/generate', data),
  jobs: (companyId?: number, limit = 100) =>
    api.get('/video/jobs', { params: { company_id: companyId, limit } }),
  job: (id: number) => api.get(`/video/jobs/${id}`),
  deleteJob: (id: number) => api.delete(`/video/jobs/${id}`),
  batchDelete: (ids: number[]) => api.post('/video/jobs/batch-delete', { ids }),
  fileUrl: (id: number) => `/api/video/file/${id}`,
}

// ── Audit Log ──────────────────────────────────────────────────────────────────
export const auditApi = {
  log: (params?: { kind?: string; status?: string; limit?: number; offset?: number }) =>
    api.get('/audit/log', { params }),
  stats: () => api.get('/audit/stats'),
}

// ── Data Collection ────────────────────────────────────────────────────────────
export const dataApi = {
  // 기존
  collected: (params?: object) => api.get('/data/collected', { params }),
  insights: (companyId: number, limit = 20, save = false) =>
    api.post(`/data/insights/${companyId}`, null, { params: { limit, save } }),
  search: (q: string, companyId?: number, limit = 20) =>
    api.get('/data/search', { params: { q, company_id: companyId, limit } }),
  stats: () => api.get('/data/stats'),
  export: (companyId: number, dataType?: string, limit = 500) =>
    api.get(`/data/export/${companyId}`, { params: { data_type: dataType, limit }, responseType: 'blob' }),
  // 무료 소스 수집
  collectHackernews: (data?: object) => api.post('/data/collect/hackernews', data || {}),
  collectWorldBank: (data?: object) => api.post('/data/collect/worldbank', data || {}),
  collectReddit: (data?: object) => api.post('/data/collect/reddit', data || {}),
  collectDart: (data?: object) => api.post('/data/collect/dart', data || {}),
  collectEcos: (data?: object) => api.post('/data/collect/ecos', data || {}),
  collectFred: (data?: object) => api.post('/data/collect/fred', data || {}),
  collectAlphaVantage: (data?: object) => api.post('/data/collect/alphavantage', data || {}),
  // 시장 알림
  alerts: () => api.get('/data/alerts'),
  createAlert: (keyword: string, companyId?: number) =>
    api.post('/data/alerts', { keyword, company_id: companyId }),
  toggleAlert: (id: number, isActive: boolean) =>
    api.patch(`/data/alerts/${id}`, { is_active: isActive }),
  deleteAlert: (id: number) => api.delete(`/data/alerts/${id}`),
}

// ── Document Generator ────────────────────────────────────────────────────────
export const docsApi = {
  businessPlan: (companyId: number) => api.post(`/docs/business-plan/${companyId}`),
  marketBrief: (companyId: number) => api.post(`/docs/market-brief/${companyId}`),
  ir: (companyId: number) => api.get(`/docs/ir/${companyId}`),
  weeklyReport: (companyId: number) => api.post(`/work/weekly-report/${companyId}`),
  types: () => api.get('/docs/types'),
}
