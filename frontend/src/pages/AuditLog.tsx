import { useEffect, useState, useCallback } from 'react'
import {
  Shield, Check, X, Clock, Terminal, FileText,
  ChevronDown, ChevronUp, RefreshCw, Filter,
} from 'lucide-react'
import { auditApi } from '../api/client'
import { format } from 'date-fns'

interface AuditEntry {
  id: number
  kind: 'approval' | 'terminal'
  title: string
  description: string
  category: string
  status: string
  actor: string
  reviewer: string | null
  reviewer_note: string
  created_at: string
  event_at: string
  command: string | null
  exit_code: number | null
  output: string | null
}

interface Stats {
  approval: { total: number; pending: number; approved: number; rejected: number }
  terminal: { total: number; pending: number; executed: number; rejected: number }
}

const CATEGORY_LABELS: Record<string, string> = {
  company_create: '계열사 설립',
  org_change: '조직 변경',
  strategy: '전략 결정',
  market_briefing: '시장 분석',
  capability_update: '역량 활성화',
  general: '일반',
  terminal: '터미널',
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-300 border-red-500/20',
  executed: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  approved: <Check size={11} />,
  rejected: <X size={11} />,
  executed: <Terminal size={11} />,
  pending: <Clock size={11} />,
}

const STATUS_LABELS: Record<string, string> = {
  approved: '승인',
  rejected: '반려',
  executed: '실행됨',
  pending: '대기',
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isTerminal = entry.kind === 'terminal'
  const hasDetail = entry.description || entry.output || entry.reviewer_note

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      entry.status === 'pending'
        ? 'border-amber-500/20 bg-amber-500/3'
        : 'border-bg-border bg-bg-card'
    }`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-elevated/50 transition-colors"
        onClick={() => hasDetail && setExpanded((p) => !p)}
      >
        {/* Kind icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isTerminal ? 'bg-slate-700 text-slate-300' : 'bg-brand/15 text-brand-light'
        }`}>
          {isTerminal ? <Terminal size={13} /> : <FileText size={13} />}
        </div>

        {/* Title + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-200 truncate max-w-xs">
              {isTerminal ? <code className="font-mono">{entry.title}</code> : entry.title}
            </span>
            <span className="text-[10px] bg-bg-elevated text-slate-400 px-1.5 py-0.5 rounded border border-bg-border">
              {CATEGORY_LABELS[entry.category] || entry.category}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            <span className="text-slate-400">{entry.actor}</span>
            {entry.reviewer && (
              <> · 처리: <span className="text-slate-300">{entry.reviewer}</span></>
            )}
            {entry.reviewer_note && (
              <span className="text-slate-500"> — {entry.reviewer_note.slice(0, 50)}</span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${STATUS_STYLES[entry.status] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
          {STATUS_ICONS[entry.status]}
          {STATUS_LABELS[entry.status] || entry.status}
          {entry.exit_code !== null && entry.exit_code !== undefined && (
            <span className="ml-1 opacity-70">exit {entry.exit_code}</span>
          )}
        </div>

        {/* Time */}
        <div className="text-[10px] text-slate-600 flex-shrink-0 w-24 text-right">
          {format(new Date(entry.event_at), 'MM/dd HH:mm')}
        </div>

        {/* Expand toggle */}
        {hasDetail && (
          <div className="text-slate-600 flex-shrink-0">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-bg-border px-4 py-3 space-y-2 bg-bg-elevated/30">
          {entry.description && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">설명 / 사유</div>
              <p className="text-xs text-slate-400 leading-relaxed">{entry.description}</p>
            </div>
          )}
          {entry.reviewer_note && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">검토 의견</div>
              <p className="text-xs text-slate-300 leading-relaxed">{entry.reviewer_note}</p>
            </div>
          )}
          {entry.output && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                실행 결과 {entry.exit_code !== null && `(exit ${entry.exit_code})`}
              </div>
              <pre className="text-[10px] text-slate-300 font-mono bg-black/30 rounded-lg p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                {entry.output}
              </pre>
            </div>
          )}
          <div className="text-[10px] text-slate-600">
            요청: {format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm:ss')}
            {entry.event_at !== entry.created_at && (
              <> · 처리: {format(new Date(entry.event_at), 'yyyy-MM-dd HH:mm:ss')}</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [logRes, statsRes] = await Promise.all([
        auditApi.log({
          kind: kindFilter === 'all' ? undefined : kindFilter,
          status: statusFilter || undefined,
          limit: 60,
        }),
        auditApi.stats(),
      ])
      setEntries(logRes.data.entries)
      setTotal(logRes.data.total)
      setStats(statsRes.data)
    } finally {
      setLoading(false)
    }
  }, [kindFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const pendingTotal = (stats?.approval.pending ?? 0) + (stats?.terminal.pending ?? 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield size={16} className="text-brand-light" />
        <span className="text-sm font-semibold text-slate-200">감사 로그</span>
        {pendingTotal > 0 && (
          <span className="badge-pending">{pendingTotal} 대기</span>
        )}
        <button
          onClick={load}
          className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
          title="새로고침"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {/* Approval stats */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={13} className="text-brand-light" />
              <span className="text-xs font-medium text-slate-300">승인 요청</span>
              <span className="ml-auto text-xs text-slate-500">{stats.approval.total}건</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-base font-bold text-emerald-400">{stats.approval.approved}</div>
                <div className="text-[10px] text-slate-500">승인</div>
              </div>
              <div>
                <div className="text-base font-bold text-red-400">{stats.approval.rejected}</div>
                <div className="text-[10px] text-slate-500">반려</div>
              </div>
              <div>
                <div className="text-base font-bold text-amber-400">{stats.approval.pending}</div>
                <div className="text-[10px] text-slate-500">대기</div>
              </div>
            </div>
          </div>

          {/* Terminal stats */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal size={13} className="text-slate-300" />
              <span className="text-xs font-medium text-slate-300">터미널 요청</span>
              <span className="ml-auto text-xs text-slate-500">{stats.terminal.total}건</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-base font-bold text-blue-400">{stats.terminal.executed}</div>
                <div className="text-[10px] text-slate-500">실행</div>
              </div>
              <div>
                <div className="text-base font-bold text-red-400">{stats.terminal.rejected}</div>
                <div className="text-[10px] text-slate-500">거부</div>
              </div>
              <div>
                <div className="text-base font-bold text-amber-400">{stats.terminal.pending}</div>
                <div className="text-[10px] text-slate-500">대기</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={12} className="text-slate-500" />

        {/* Kind */}
        <div className="flex gap-1">
          {[['all', '전체'], ['approval', '승인 요청'], ['terminal', '터미널']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setKindFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                kindFilter === v
                  ? 'bg-brand/20 text-brand-light'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-bg-border mx-1" />

        {/* Status */}
        <div className="flex gap-1">
          {[['', '전체 상태'], ['pending', '대기'], ['approved', '승인'], ['rejected', '반려'], ['executed', '실행됨']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                statusFilter === v
                  ? 'bg-brand/20 text-brand-light'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] text-slate-600">{total}건</span>
      </div>

      {/* Timeline entries */}
      <div className="space-y-2">
        {loading && entries.length === 0 && (
          <div className="card p-12 text-center text-slate-600">
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin text-slate-700" />
            <p className="text-sm">로딩 중...</p>
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="card p-12 text-center text-slate-600">
            <Shield size={32} className="mx-auto mb-3 text-slate-700" />
            <p className="text-sm">해당하는 감사 로그가 없습니다.</p>
          </div>
        )}
        {entries.map((entry) => (
          <EntryRow key={`${entry.kind}-${entry.id}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}
