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
  create: (data: object, autoOrg = true) =>
    api.post(`/companies?auto_org=${autoOrg}`, data),
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
  deleteNode: (id: number) => api.delete(`/org/nodes/${id}`),
  graph: (companyId?: number) =>
    api.get('/org/graph', { params: { company_id: companyId } }),
  groupTree: () => api.get('/org/group-tree'),
  templates: () => api.get('/org/templates'),
  proposals: (companyId?: number) =>
    api.get('/org/proposals', { params: { company_id: companyId } }),
  approveProposal: (id: number) => api.post(`/org/proposals/${id}/approve`),
  rejectProposal: (id: number) => api.post(`/org/proposals/${id}/reject`),
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
  suggestions: (companyId?: number) =>
    api.get('/chat/suggestions', { params: { company_id: companyId } }),
  dismissSuggestion: (id: number) => api.post(`/chat/suggestions/${id}/dismiss`),
}

// ── Approvals ─────────────────────────────────────────────────────────────────
export const approvalsApi = {
  inbox: () => api.get('/approvals/inbox'),
  list: (status?: string) => api.get('/approvals', { params: { status } }),
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
