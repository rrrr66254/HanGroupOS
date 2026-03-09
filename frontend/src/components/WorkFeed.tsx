import { useState, useEffect, useRef } from 'react'
import { Play, ChevronDown, ChevronUp, Loader2, RefreshCw, ArrowRight, Radio } from 'lucide-react'
import { workApi, companiesApi } from '../api/client'
import { useAuthStore } from '../store/useStore'

interface WorkLogEntry {
  id: number
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

interface Company { id: number; name: string; industry: string }

const LEVEL_STYLE: Record<string, { color: string; bg: string; label: string; emoji: string }> = {
  specialist: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: '전문가', emoji: '👤' },
  team_lead:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', label: '팀장',   emoji: '👥' },
  chief:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', label: 'C레벨', emoji: '🎯' },
  ceo:        { color: '#34d399', bg: 'rgba(52,211,153,0.10)', label: 'CEO',    emoji: '👔' },
}

// ── Live streaming item shown during SSE ──────────────────────────────────────
interface StreamItem {
  name: string; role: string; level: string
  status: 'thinking' | 'done'
  result?: string; task?: string
}

interface WorkFeedProps { companyId?: number; compact?: boolean }

export default function WorkFeed({ companyId, compact = false }: WorkFeedProps) {
  const token = useAuthStore((s) => s.token)
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<number | undefined>(companyId)
  const [cycles, setCycles] = useState<WorkCycle[]>([])
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null)
  const [cycleLogs, setCycleLogs] = useState<Record<string, WorkLogEntry[]>>({})
  const [loadingCycles, setLoadingCycles] = useState(false)

  // SSE state
  const [streaming, setStreaming] = useState(false)
  const [streamItems, setStreamItems] = useState<StreamItem[]>([])
  const [streamPhase, setStreamPhase] = useState('')
  const [streamResult, setStreamResult] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!companyId) {
      companiesApi.list().then((res) => {
        const list = res.data as Company[]
        setCompanies(list)
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
      }).catch(() => {})
    }
  }, [companyId])

  useEffect(() => { if (selectedId) loadCycles() }, [selectedId])

  const loadCycles = async () => {
    setLoadingCycles(true)
    try {
      const res = await workApi.cycles(selectedId)
      setCycles(res.data as WorkCycle[])
    } catch { /* ignore */ } finally { setLoadingCycles(false) }
  }

  const loadCycleLogs = async (cycleId: string) => {
    if (cycleLogs[cycleId]) return
    try {
      const res = await workApi.logs(selectedId, cycleId)
      setCycleLogs((prev) => ({ ...prev, [cycleId]: res.data as WorkLogEntry[] }))
    } catch { /* ignore */ }
  }

  const handleToggleCycle = (cycleId: string) => {
    if (expandedCycle === cycleId) { setExpandedCycle(null); return }
    setExpandedCycle(cycleId)
    loadCycleLogs(cycleId)
  }

  // ── SSE Streaming trigger ─────────────────────────────────────────────────
  const handleStreamTrigger = () => {
    if (!selectedId || streaming) return
    setStreaming(true)
    setStreamItems([])
    setStreamPhase('연결 중…')
    setStreamResult(null)

    // Close any existing connection
    if (esRef.current) { esRef.current.close() }

    // SSE uses GET so we need to pass auth differently — use fetch + ReadableStream
    const ctrl = new AbortController()
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }

    fetch(`/api/work/stream/${selectedId}`, { headers, signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Stream failed')
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n\n')
          buf = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const ev = JSON.parse(line.slice(6))
              handleSSEEvent(ev)
            } catch { /* ignore */ }
          }
        }
        // Done
        setStreaming(false)
        await loadCycles()
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setStreamResult('❌ 스트리밍 연결 오류')
          setStreaming(false)
        }
      })

    // Attach abort to ref for cleanup
    ;(esRef as any).current = { close: () => ctrl.abort() }
  }

  const handleSSEEvent = (ev: Record<string, unknown>) => {
    const type = ev.type as string
    if (type === 'start') {
      setStreamPhase(`사이클 #${ev.cycle_id} 시작`)
    } else if (type === 'phase') {
      setStreamPhase(ev.label as string)
    } else if (type === 'agent_start') {
      setStreamItems((prev) => [
        ...prev,
        { name: ev.name as string, role: ev.role as string, level: ev.level as string, status: 'thinking' },
      ])
    } else if (type === 'agent_done') {
      setStreamItems((prev) =>
        prev.map((item) =>
          item.name === ev.name && item.status === 'thinking'
            ? { ...item, status: 'done', task: ev.task as string, result: ev.result as string }
            : item
        )
      )
    } else if (type === 'complete') {
      setStreamPhase('완료')
      setStreamResult(`✅ 사이클 #${ev.cycle_id} 완료 (${ev.total_logs}건)`)
    } else if (type === 'error') {
      setStreamResult(`❌ 오류: ${ev.message}`)
      setStreaming(false)
    }
  }

  useEffect(() => () => { esRef.current?.close() }, [])

  const groupLogsByLevel = (logs: WorkLogEntry[]) => {
    const order = ['specialist', 'team_lead', 'chief', 'ceo']
    const grouped: Record<string, WorkLogEntry[]> = {}
    for (const log of logs) { grouped[log.level] = grouped[log.level] || []; grouped[log.level].push(log) }
    return order.filter((l) => grouped[l]).map((l) => ({ level: l, logs: grouped[l] }))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">⚙️ 자율 업무 루프</span>
          {!companyId && companies.length > 0 && (
            <select
              value={selectedId || ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="text-xs bg-bg-elevated border border-bg-border rounded-lg px-2 py-1 text-slate-300"
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadCycles} disabled={loadingCycles}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors">
            <RefreshCw size={13} className={loadingCycles ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleStreamTrigger} disabled={streaming || !selectedId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: streaming ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.12)',
              border: '1px solid rgba(52,211,153,0.3)', color: '#34d399',
              opacity: streaming ? 0.8 : 1,
            }}>
            {streaming ? <Radio size={12} className="animate-pulse" /> : <Play size={12} />}
            {streaming ? '실시간 중…' : '업무 실행 (실시간)'}
          </button>
        </div>
      </div>

      {/* Live stream panel */}
      {(streaming || streamItems.length > 0) && (
        <div className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.03)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-900/20">
            {streaming
              ? <Radio size={11} className="text-emerald-400 animate-pulse" />
              : <span className="text-emerald-500 text-[10px]">●</span>}
            <span className="text-[11px] font-medium text-emerald-300">
              {streaming ? `LIVE · ${streamPhase}` : streamPhase}
            </span>
          </div>
          <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
            {streamItems.map((item, i) => {
              const style = LEVEL_STYLE[item.level] || LEVEL_STYLE.specialist
              return (
                <div key={i} className="rounded-lg px-3 py-2"
                  style={{ background: style.bg, border: `1px solid ${style.color}18` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px]">{style.emoji}</span>
                    <span className="text-[11px] font-medium" style={{ color: style.color }}>{item.name}</span>
                    <span className="text-[9px] text-slate-600">{item.role}</span>
                    <span className="ml-auto">
                      {item.status === 'thinking'
                        ? <Loader2 size={10} className="animate-spin text-slate-500" />
                        : <span className="text-[9px] text-emerald-500">완료</span>}
                    </span>
                  </div>
                  {item.result && (
                    <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{item.result}</p>
                  )}
                </div>
              )
            })}
            {streaming && streamItems.length === 0 && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={14} className="animate-spin text-slate-600" />
                <span className="text-xs text-slate-600">에이전트 초기화 중…</span>
              </div>
            )}
          </div>
          {streamResult && (
            <div className="px-4 py-2 border-t border-white/[0.04] text-[11px]"
              style={{ color: streamResult.startsWith('✅') ? '#34d399' : '#f87171' }}>
              {streamResult}
            </div>
          )}
        </div>
      )}

      {/* Past cycles */}
      {loadingCycles ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
      ) : cycles.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-sm">
          업무 기록이 없습니다.<br />
          <span className="text-xs">"업무 실행" 버튼으로 자율 업무를 시작하세요.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const isExp = expandedCycle === cycle.cycle_id
            return (
              <div key={cycle.cycle_id} className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <button className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => handleToggleCycle(cycle.cycle_id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-slate-600">#{cycle.cycle_id}</span>
                      <span className="text-[10px] text-slate-600">· {cycle.total_agents}명</span>
                      <span className="text-[10px] text-slate-700 ml-auto">
                        {new Date(cycle.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{cycle.summary}</p>
                  </div>
                  {isExp ? <ChevronUp size={13} className="text-slate-500 mt-1 flex-shrink-0" />
                          : <ChevronDown size={13} className="text-slate-500 mt-1 flex-shrink-0" />}
                </button>

                {isExp && (
                  <div className="px-4 pb-4 border-t border-white/[0.04]">
                    {!cycleLogs[cycle.cycle_id] ? (
                      <div className="py-4 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-600" /></div>
                    ) : (
                      <div className="space-y-3 mt-3">
                        {groupLogsByLevel(cycleLogs[cycle.cycle_id]).map(({ level, logs }) => {
                          const style = LEVEL_STYLE[level] || LEVEL_STYLE.specialist
                          return (
                            <div key={level}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                  style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}>
                                  {style.emoji} {style.label}
                                </div>
                                <div className="h-px flex-1" style={{ background: style.color, opacity: 0.12 }} />
                              </div>
                              <div className="space-y-2 ml-2">
                                {logs.map((log) => <AgentLogCard key={log.id} log={log} style={style} />)}
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
  const short = log.result.length > 120 ? log.result.slice(0, 120) + '…' : log.result
  return (
    <div className="rounded-lg p-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: style.bg, border: `1px solid ${style.color}18` }}
      onClick={() => setExpanded((v) => !v)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: style.color }}>{log.agent_name}</span>
        <span className="text-[10px] text-slate-600">{log.agent_role}</span>
      </div>
      <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
        <ArrowRight size={9} />{log.task}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{expanded ? log.result : short}</p>
    </div>
  )
}
