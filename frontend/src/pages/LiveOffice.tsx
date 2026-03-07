import { useEffect, useState, useCallback } from 'react'
import { Monitor, RefreshCw, Filter } from 'lucide-react'
import { liveOfficeApi, companiesApi } from '../api/client'
import type { AgentActivity, Company } from '../types'

const STATUS_CONFIG = {
  working: { color: 'bg-success', label: '작업 중', textColor: 'text-success' },
  thinking: { color: 'bg-brand blink', label: '분석 중', textColor: 'text-brand-light' },
  idle: { color: 'bg-slate-500', label: '대기', textColor: 'text-slate-400' },
  done: { color: 'bg-accent', label: '완료', textColor: 'text-accent' },
}

const LEVEL_COLORS: Record<string, string> = {
  chairman: 'border-brand/60 bg-brand/5',
  committee: 'border-purple-500/40 bg-purple-500/5',
  ceo: 'border-accent/40 bg-accent/5',
  chief: 'border-success/40 bg-success/5',
  team_lead: 'border-warning/40 bg-warning/5',
  specialist: 'border-slate-600 bg-bg-elevated',
}

const LEVEL_LABELS: Record<string, string> = {
  chairman: '회장',
  committee: '위원회',
  ceo: 'CEO',
  chief: 'Chief',
  team_lead: '팀장',
  specialist: '스페셜리스트',
}

function AgentCard({ agent }: { agent: AgentActivity }) {
  const status = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle
  const borderColor = LEVEL_COLORS[agent.level] || 'border-slate-600'

  return (
    <div className={`border rounded-xl p-4 transition-all ${borderColor}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">{agent.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{agent.role}</div>
        </div>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${status.textColor} bg-current/10`}>
          <div className={`w-1.5 h-1.5 rounded-full ${status.color}`} />
          {status.label}
        </div>
      </div>

      {/* Activity */}
      <div className="bg-black/20 rounded-lg px-3 py-2 mb-3">
        <div className="text-[10px] text-slate-500 mb-0.5">현재 작업</div>
        <div className="text-xs text-slate-300 flex items-center gap-1.5">
          {agent.status === 'working' && (
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
          )}
          {agent.activity}
        </div>
      </div>

      {/* AI Info */}
      <div className="flex items-center justify-between">
        <span className={`badge text-[9px] ${
          agent.level === 'chairman' ? 'badge-brand'
          : agent.level === 'ceo' ? 'bg-accent/10 text-accent badge'
          : 'badge-inactive'
        }`}>
          {LEVEL_LABELS[agent.level] || agent.level}
        </span>
        {agent.ai_provider && agent.ai_provider !== 'mock' && (
          <span className="text-[9px] text-slate-600 font-mono">{agent.ai_provider}</span>
        )}
      </div>
    </div>
  )
}

export default function LiveOffice() {
  const [agents, setAgents] = useState<AgentActivity[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyFilter, setCompanyFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [autoRefresh, setAutoRefresh] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cid = companyFilter ? parseInt(companyFilter) : undefined
      const res = await liveOfficeApi.agents(cid)
      setAgents(res.data.agents)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }, [companyFilter])

  useEffect(() => {
    load()
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, load])

  const filtered = agents.filter((a) => !levelFilter || a.level === levelFilter)

  const stats = {
    total: agents.length,
    working: agents.filter((a) => a.status === 'working').length,
    thinking: agents.filter((a) => a.status === 'thinking').length,
    idle: agents.filter((a) => a.status === 'idle').length,
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Monitor size={15} className="text-brand-light" />
          <span className="text-sm font-semibold text-slate-200">AI 라이브 오피스</span>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <select
            className="input max-w-[140px] text-xs py-1.5"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">전체 계열사</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className="input max-w-[120px] text-xs py-1.5"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">전체 직급</option>
            {Object.entries(LEVEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            자동 갱신 (5s)
          </label>

          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs py-1.5" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            갱신
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '전체 에이전트', value: stats.total, color: 'text-slate-300' },
          { label: '작업 중', value: stats.working, color: 'text-success' },
          { label: '분석 중', value: stats.thinking, color: 'text-brand-light' },
          { label: '대기', value: stats.idle, color: 'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-3 text-center">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Last refresh */}
      <div className="text-[10px] text-slate-600 text-right">
        마지막 갱신: {lastRefresh.toLocaleTimeString('ko-KR')}
        {autoRefresh && <span className="ml-2 text-success blink">● 자동 갱신 중</span>}
      </div>

      {/* Agent grid */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-600">
          <Monitor size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-sm">표시할 AI 에이전트가 없습니다.</p>
          <p className="text-xs mt-1 text-slate-700">계열사를 설립하면 AI 조직원이 나타납니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
