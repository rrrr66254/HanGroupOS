/**
 * Terminal — Admin approval panel for CEO terminal command requests.
 * Flow: CEO requests command → Admin approves/rejects → Admin executes
 */
import { useEffect, useState } from 'react'
import { Terminal as TerminalIcon, Check, X, Play, RefreshCw, Clock, CheckCircle, XCircle, Zap } from 'lucide-react'
import { terminalApi } from '../api/client'
import { useAuthStore } from '../store/useStore'
import { format } from 'date-fns'

interface TerminalReq {
  id: number
  company_id: number | null
  org_node_id: number | null
  requested_by_name: string
  command: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'executed'
  output: string | null
  exit_code: number | null
  created_at: string
  decided_at: string | null
  executed_at: string | null
}

const STATUS_CONFIG = {
  pending:  { label: '대기중',   color: 'bg-amber-400/15 text-amber-300',   icon: Clock },
  approved: { label: '승인됨',   color: 'bg-emerald-400/15 text-emerald-300', icon: CheckCircle },
  rejected: { label: '거부됨',   color: 'bg-red-400/15 text-red-300',       icon: XCircle },
  executed: { label: '실행완료', color: 'bg-indigo-400/15 text-indigo-300', icon: Zap },
}

export default function Terminal() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [requests, setRequests] = useState<TerminalReq[]>([])
  const [filter, setFilter] = useState<string>('pending')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<TerminalReq | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await terminalApi.list(filter || undefined)
      setRequests(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const handleApprove = async (req: TerminalReq) => {
    setActionLoading(true)
    try {
      await terminalApi.decide(req.id, 'approve')
      await load()
      setSelected(null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (req: TerminalReq) => {
    setActionLoading(true)
    try {
      await terminalApi.decide(req.id, 'reject', rejectNote || undefined)
      setRejectNote('')
      setShowRejectInput(false)
      await load()
      setSelected(null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleExecute = async (req: TerminalReq) => {
    setActionLoading(true)
    try {
      const res = await terminalApi.execute(req.id)
      setSelected(res.data)
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  const pending = requests.filter(r => r.status === 'pending').length

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <TerminalIcon size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">터미널 명령 관리</h1>
            <p className="text-[11px] text-slate-500">AI CEO 터미널 요청 승인 및 실행</p>
          </div>
          {pending > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-medium">
              {pending}건 대기
            </span>
          )}
        </div>
        <button onClick={load} className="btn-ghost gap-1.5 text-xs" disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {[
          { value: 'pending', label: '대기중' },
          { value: 'approved', label: '승인됨' },
          { value: 'rejected', label: '거부됨' },
          { value: 'executed', label: '실행완료' },
          { value: '', label: '전체' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Request list */}
        <div className="w-1/2 flex flex-col gap-2 overflow-y-auto">
          {requests.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              {loading ? '불러오는 중...' : '요청이 없습니다'}
            </div>
          ) : (
            requests.map(req => {
              const cfg = STATUS_CONFIG[req.status]
              const Icon = cfg.icon
              return (
                <button
                  key={req.id}
                  onClick={() => { setSelected(req); setShowRejectInput(false); setRejectNote('') }}
                  className={`card p-3 text-left hover:border-indigo-500/30 transition-all ${
                    selected?.id === req.id ? 'border-indigo-500/40 bg-indigo-500/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <code className="text-xs font-mono text-amber-300 flex-1 truncate">
                      {req.command}
                    </code>
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
                      <Icon size={10} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{req.reason || '이유 없음'}</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    {req.requested_by_name} · {format(new Date(req.created_at), 'MM-dd HH:mm')}
                  </p>
                </button>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        <div className="w-1/2 card p-4 flex flex-col gap-3 overflow-y-auto">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              요청을 선택하세요
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300">요청 #{selected.id}</h3>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_CONFIG[selected.status].color}`}>
                  {STATUS_CONFIG[selected.status].label}
                </span>
              </div>

              {/* Command */}
              <div>
                <p className="text-[10px] text-slate-500 mb-1">명령어</p>
                <div className="rounded-lg p-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <code className="text-sm font-mono text-amber-300">{selected.command}</code>
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-[10px] text-slate-500 mb-1">실행 사유</p>
                <p className="text-xs text-slate-300 leading-relaxed">{selected.reason || '이유 없음'}</p>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <div>요청자: <span className="text-slate-400">{selected.requested_by_name}</span></div>
                <div>요청일: <span className="text-slate-400">{format(new Date(selected.created_at), 'yyyy-MM-dd HH:mm')}</span></div>
                {selected.decided_at && (
                  <div className="col-span-2">결정일: <span className="text-slate-400">{format(new Date(selected.decided_at), 'yyyy-MM-dd HH:mm')}</span></div>
                )}
                {selected.executed_at && (
                  <div className="col-span-2">실행일: <span className="text-slate-400">{format(new Date(selected.executed_at), 'yyyy-MM-dd HH:mm')}</span></div>
                )}
              </div>

              {/* Output */}
              {selected.output && (
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">
                    출력 {selected.exit_code !== null && (
                      <span className={selected.exit_code === 0 ? 'text-emerald-400' : 'text-red-400'}>
                        (exit code: {selected.exit_code})
                      </span>
                    )}
                  </p>
                  <div className="rounded-lg p-3 max-h-48 overflow-y-auto" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">{selected.output}</pre>
                  </div>
                </div>
              )}

              {/* Actions (admin only) */}
              {isAdmin && (
                <div className="mt-auto pt-3 border-t border-bg-border flex flex-col gap-2">
                  {selected.status === 'pending' && (
                    <>
                      {showRejectInput ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="거부 사유 (선택)"
                            className="input text-xs h-16 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(selected)}
                              disabled={actionLoading}
                              className="btn flex-1 gap-1.5 text-xs"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                            >
                              <X size={13} />
                              {actionLoading ? '처리중...' : '거부 확인'}
                            </button>
                            <button onClick={() => setShowRejectInput(false)} className="btn-ghost text-xs px-3">
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(selected)}
                            disabled={actionLoading}
                            className="btn-primary flex-1 gap-1.5 text-xs"
                          >
                            <Check size={13} />
                            {actionLoading ? '처리중...' : '승인'}
                          </button>
                          <button
                            onClick={() => setShowRejectInput(true)}
                            disabled={actionLoading}
                            className="btn flex-1 gap-1.5 text-xs"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', borderColor: 'rgba(239,68,68,0.25)' }}
                          >
                            <X size={13} />
                            거부
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {selected.status === 'approved' && (
                    <button
                      onClick={() => handleExecute(selected)}
                      disabled={actionLoading}
                      className="btn-primary gap-1.5 text-xs"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', borderColor: 'rgba(16,185,129,0.3)' }}
                    >
                      <Play size={13} />
                      {actionLoading ? '실행중...' : '명령 실행'}
                    </button>
                  )}
                </div>
              )}

              {!isAdmin && selected.status === 'pending' && (
                <p className="text-[11px] text-amber-400 mt-auto pt-3 border-t border-bg-border">
                  ⏳ 관리자 승인 대기 중입니다
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
