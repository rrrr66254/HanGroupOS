export interface User {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export interface Company {
  id: number
  name: string
  description: string
  industry: string
  status: string
  vision: string
  created_by: number | null
  created_at: string
}

export interface OrgNode {
  id: number
  company_id: number | null
  name: string
  role: string
  level: string
  parent_id: number | null
  ai_provider: string
  ai_model: string
  description: string
  status: string
  meta: Record<string, unknown>
  created_at: string
  children?: OrgNode[]
}

export interface Meeting {
  id: number
  company_id: number | null
  title: string
  description: string
  status: string
  tags: string[]
  created_at: string
}

export interface MeetingMessage {
  id: number
  meeting_id: number
  sender: string
  sender_role: string
  content: string
  created_at: string
}

export interface ApprovalRequest {
  id: number
  title: string
  description: string
  request_type: string
  status: string
  requester: string
  company_id: number | null
  meta: Record<string, unknown>
  reviewer_note: string
  created_at: string
}

export interface ChatSession {
  id: number
  company_id: number | null
  session_type: string
  title: string
  created_at: string
}

export interface ChatMessage {
  id: number
  session_id: number
  role: string
  content: string
  sender_name: string
  created_at: string
}

export interface MarketReport {
  id: number
  company_id: number | null
  industry: string
  title: string
  summary: string
  opportunities: unknown[]
  threats: unknown[]
  competitors: unknown[]
  trends: unknown[]
  created_at: string
}

export interface SimulationRun {
  id: number
  company_id: number | null
  scenario: string
  parameters: Record<string, unknown>
  result: Record<string, unknown>
  summary: string
  status: string
  created_at: string
}

export interface ModelCatalog {
  id: number
  name: string
  provider: string
  model_id: string
  description: string
  is_free: boolean
  context_window: number
  strengths: string[]
}

export interface CorporateMemory {
  id: number
  company_id: number | null
  title: string
  content: string
  memory_type: string
  tags: string[]
  importance: string
  created_at: string
}

export interface StrategyItem {
  id: number
  company_id: number | null
  title: string
  description: string
  item_type: string
  status: string
  priority: string
  parent_id: number | null
  progress: number
  due_date: string
  created_at: string
}

export interface CEOPerformance {
  id: number
  company_id: number
  period: string
  overall_score: number
  metrics: Record<string, number>
  strengths: string[]
  improvements: string[]
  notes: string
  created_at: string
}

export interface ProviderConfig {
  id: number
  provider: string
  model_override: string
  is_active: boolean
  base_url: string
  created_at: string
}

export interface AgentActivity {
  id: number
  name: string
  role: string
  level: string
  company_id: number | null
  activity: string
  status: 'idle' | 'working' | 'thinking' | 'done'
  ai_provider: string
  ai_model: string
}

export interface OrgProposal {
  id: number
  company_id: number
  title: string
  proposal_json: Record<string, unknown>
  rationale: string
  status: string
  proposed_by: string
  created_at: string
}

export interface DashboardStats {
  total_companies: number
  active_companies: number
  total_org_nodes: number
  pending_approvals: number
  open_meetings: number
  total_memories: number
  recent_simulations: number
  total_strategies: number
}
