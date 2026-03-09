import { useState, useEffect } from 'react'
import { Play, ChevronDown, ChevronUp, Loader2, RefreshCw, ArrowRight } from 'lucide-react'
import { workApi, companiesApi } from '../api/client'

interface WorkLogEntry {
  id: number
  company_id: number
  org_node_id: number
  agent_name: string
  agent_role: string
  level: string
  task: string
  result: string
  cycle_id: string
  parent_log_id: number | null
  created_at: string
}

interface WorkCycle {
  cycle_id: string
  company_id: number
  ceo_name: string
  summary: string
  total_agents: number
  created_at: string
}

interface Company {
  id: number
  name: string
  industry: string
}

const LEVEL_STYLE: Record<string, { color: string; bg: string; label: string; emoji: string }> = {
  specialist: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: '전문가', emoji: '👤' },
  team_lead:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '팀장', emoji: '👥' },
  chief:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'C레벨', emoji: '🎯' },
  ceo:        { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: 'CEO', emoji: '👔' },
  chairman:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '회장', emoji: '🏛' },
}

interface WorkFeedProps {
  companyId?: number
  compact?: boolean
}

export default function WorkFeed({ companyId, compact = false }: WorkFeedProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(companyId)
  const [cycles, setCycles] = useState<WorkCycle[]>([])
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null)
  const [cycleLogs, setCycleLogs] = useState<Record<string, WorkLogEntry[]>>({})
  const [triggering, setTriggering] = useState(false)
  const [loadingCycles, setLoadingCycles] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) {
      companiesApi.list().then((res) => {
        setCompanies(res.data as Company[])
        if ((res.data as Company[]).length > 0 && !selectedCompanyId) {
          setSelectedCompanyId((res.data as Company[])[0].id)
        }
      }).catch(() => {})
    }
  }, [companyId])

  useEffect(() => {
    if (selectedCompanyId) loadCycles()
  }, [selectedCompanyId])

  const loadCycles = async () => {
    setLoadingCycles(true)
    try {
      const res = await workApi.cycles(selectedCompanyId)
      setCycles(res.data as WorkCycle[])
    } catch { /* ignore */ } finally {
      setLoadingCycles(false)
    }
  }

  const loadCycleLogs = async (cycleId: string) => {
    if (cycleLogs[cycleId]) return
    try {
      const res = await workApi.logs(selectedCompanyId, cycleId)
      setCycleLogs((prev) => ({ ...prev, [cycleId]: res.data as WorkLogEntry[] }))
    } catch { /* ignore */ }
  }

  const handleToggleCycle = (cycleId: string) => {
    if (expandedCycle === cycleId) {
      setExpandedCycle(null)
    } else {
      setExpandedCycle(cycleId)
      loadCycleLogs(cycleId)
    }
  }

  const handleTrigger = async () => {
    if (!selectedCompanyId) return
    setTriggering(true)
    setTriggerResult(null)
    try {
      const res = await workApi.trigger(selectedCompanyId)
      const data = res.data as { cycle_id: string; total_logs: number; ceo_summary: string }
      setTriggerResult(`✅ 업무 사이클 완료 (${data.total_logs}개 보고서 생성)`)
      await loadCycles()
    } catch (err: any) {
      setTriggerResult(`❌ 오류: ${err?.response?.data?.detail || '업무 실행 실패'}`)
    } finally {
      setTriggering(false)
    }
  }

  const logsForCycle = (cycleId: string): WorkLogEntry[] => cycleLogs[cycleId] || []

  // Group logs by level for display
  const groupLogsByLevel = (logs: WorkLogEntry[]) => {
    const order = ['specialist', 'team_lead', 'chief', 'ceo']
    const grouped: Record<string, WorkLogEntry[]> = {}
    for (const log of logs) {
      grouped[log.level] = grouped[log.level] || []
      grouped[log.level].push(log)
    }
    return order.filter((l) => grouped[l]).map((l) => ({ level: l, logs: grouped[l] }))
  }

  return (
    <div className="space-y-4">
      {/* Header + controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">⚙️ 자율 업무 루프</span>
          {!compact && !companyId && companies.length > 0 && (
            <select
              value={selectedCompanyId || ''}
              onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
              className="text-xs bg-bg-elevated border border-bg-border rounded-lg px-2 py-1 text-slate-300"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCycles}
            disabled={loadingCycles}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors"
            title="새로고침"
          >
            <RefreshCw size={13} className={loadingCycles ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggering || !selectedCompanyId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: triggering ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.12)',
              border: '1px solid rgba(52,211,153,0.3)',
              color: '#34d399',
              opacity: triggering ? 0.7 : 1,
            }}
          >
            {triggering ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {triggering ? '실행 중...' : '업무 실행'}
          </button>
        </div>
      </div>

      {/* Trigger result message */}
      {triggerResult && (
        <div
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: triggerResult.startsWith('✅') ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${triggerResult.startsWith('✅') ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: triggerResult.startsWith('✅') ? '#34d399' : '#f87171',
          }}
        >
          {triggerResult}
        </div>
      )}

      {/* Cycles list */}
      {loadingCycles ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-600" />
        </div>
      ) : cycles.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-sm">
          아직 업무 기록이 없습니다.<br />
          <span className="text-xs">"업무 실행" 버튼으로 AI 자율 업무를 시작하세요.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const isExpanded = expandedCycle === cycle.cycle_id
            return (
              <div
                key={cycle.cycle_id}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
              >
                {/* Cycle header */}
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => handleToggleCycle(cycle.cycle_id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-slate-600">#{cycle.cycle_id}</span>
                      <span className="text-[10px] text-slate-600">·</span>
                      <span className="text-[10px] text-slate-500">
                        에이전트 {cycle.total_agents}명
                      </span>
                      <span className="text-[10px] text-slate-700 ml-auto">
                        {new Date(cycle.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] text-emerald-500">👔 {cycle.ceo_name}</span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{cycle.summary}</p>
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/[0.04]">
                    {!cycleLogs[cycle.cycle_id] ? (
                      <div className="py-4 flex justify-center">
                        <Loader2 size={16} className="animate-spin text-slate-600" />
                      </div>
                    ) : (
                      <div className="space-y-3 mt-3">
                        {groupLogsByLevel(logsForCycle(cycle.cycle_id)).map(({ level, logs }) => {
                          const style = LEVEL_STYLE[level] || LEVEL_STYLE.specialist
                          return (
                            <div key={level}>
                              {/* Level header */}
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                  style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}
                                >
                                  <span>{style.emoji}</span>
                                  <span>{style.label}</span>
                                </div>
                                <div className="h-px flex-1" style={{ background: style.color, opacity: 0.15 }} />
                              </div>
                              {/* Agent logs */}
                              <div className="space-y-2 ml-2">
                                {logs.map((log) => (
                                  <AgentLogCard key={log.id} log={log} style={style} />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AgentLogCard({ log, style }: { log: WorkLogEntry; style: { color: string; bg: string } }) {
  const [expanded, setExpanded] = useState(false)
  const shortResult = log.result.length > 120 ? log.result.slice(0, 120) + '…' : log.result

  return (
    <div
      className="rounded-lg p-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: style.bg, border: `1px solid ${style.color}20` }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium" style={{ color: style.color }}>
          {log.agent_name}
        </span>
        <span className="text-[10px] text-slate-600 flex-shrink-0">{log.agent_role}</span>
      </div>
      <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
        <ArrowRight size={9} />
        {log.task}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {expanded ? log.result : shortResult}
      </p>
    </div>
  )
}
