import { useEffect, useState } from 'react'
import { CheckSquare, X, Check, Mail, Clock, AlertCircle, Terminal, Bot, Loader, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { approvalsApi, terminalApi } from '../api/client'
import { useAppStore } from '../store/useStore'
import type { ApprovalRequest } from '../types'
import { format } from 'date-fns'

const TYPE_LABELS: Record<string, string> = {
  company_create: '계열사 설립',
  org_change: '조직 변경',
  strategy: '전략 결정',
  market_briefing: '시장 분석 보고',
  capability_update: '역량 활성화',
  general: '일반',
}

const TYPE_COLORS: Record<string, string> = {
  company_create: 'badge-brand',
  org_change: 'badge-pending',
  strategy: 'bg-purple-400/15 text-purple-300 badge',
  market_briefing: 'bg-teal-400/15 text-teal-300 badge',
  capability_update: 'bg-emerald-400/15 text-emerald-300 badge',
  general: 'badge-inactive',
}

interface TerminalRequest {
  id: number
  command: string
  reason: string
  status: string
  requested_by_name: string
  created_at: string
  output?: string
  exit_code?: number
  decided_at?: string
}

interface AiReviewResult {
  risk_level?: 'low' | 'medium' | 'high'
  risk_factors?: string[]
  recommendation?: 'approve' | 'reject' | 'review'
  recommendation_reason?: string
  key_points?: string[]
  questions?: string[]
  error?: string
}

const RISK_CONFIG = {
  low: { label: '낮음', color: 'text-success', bg: 'bg-success/10', Icon: ShieldCheck },
  medium: { label: '보통', color: 'text-warning', bg: 'bg-warning/10', Icon: ShieldQuestion },
  high: { label: '높음', color: 'text-danger', bg: 'bg-danger/10', Icon: ShieldAlert },
}

const REC_CONFIG = {
  approve: { label: '승인 권고', color: 'text-success', bg: 'bg-success/10' },
  reject: { label: '반려 권고', color: 'text-danger', bg: 'bg-danger/10' },
  review: { label: '추가 검토 필요', color: 'text-warning', bg: 'bg-warning/10' },
}

function ApprovalDetail({
  approval,
  onReview,
  onClose,
}: {
  approval: ApprovalRequest
  onReview: (id: number, status: string, note: string) => Promise<void>
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(
    approval.meta?.ai_review ? (approval.meta.ai_review as AiReviewResult) : null
  )

  const handleReview = async (status: string) => {
    setLoading(true)
    await onReview(approval.id, status, note)
    setLoading(false)
  }

  const handleAiReview = async () => {
    setAiLoading(true)
    try {
      const r = await approvalsApi.aiReview(approval.id)
      setAiReview(r.data)
    } finally {
      setAiLoading(false)
    }
  }

  const riskCfg = aiReview?.risk_level ? RISK_CONFIG[aiReview.risk_level] : null
  const recCfg = aiReview?.recommendation ? REC_CONFIG[aiReview.recommendation] : null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 animate-slide-in overflow-y-auto max-h-[90vh]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className={TYPE_COLORS[approval.request_type] || 'badge-inactive'}>
              {TYPE_LABELS[approval.request_type] || approval.request_type}
            </div>
            <h2 className="text-sm font-semibold text-slate-100 mt-2">{approval.title}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {approval.requester} · {format(new Date(approval.created_at), 'yyyy-MM-dd HH:mm')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        {/* 역량 활성화 요청 전용 UI */}
        {approval.request_type === 'capability_update' && approval.meta?.cap_types ? (
          <div className="mb-4 space-y-2">
            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">활성화 요청 역량</div>
            <div className="flex flex-wrap gap-1.5">
              {(approval.meta.cap_types as string[]).map((cap: string) => (
                <span key={cap} className="bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 text-[10px] px-2 py-0.5 rounded-full">
                  {cap}
                </span>
              ))}
            </div>
            <div className="bg-bg-elevated rounded-lg p-3 text-xs text-slate-400 leading-relaxed whitespace-pre-line">
              {approval.description}
            </div>
          </div>
        ) : (
          <div className="bg-bg-elevated rounded-lg p-3 mb-4 text-xs text-slate-400 leading-relaxed">
            {approval.description || '설명이 없습니다.'}
          </div>
        )}

        {/* AI 사전 검토 */}
        <div className="mb-4">
          {!aiReview ? (
            <button
              onClick={handleAiReview}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-brand/30 bg-brand/5 hover:bg-brand/10 text-brand-light text-xs transition-colors"
            >
              {aiLoading ? <Loader size={12} className="animate-spin" /> : <Bot size={12} />}
              {aiLoading ? 'AI 분석 중...' : 'AI 사전 검토 요청'}
            </button>
          ) : aiReview.error ? (
            <div className="bg-danger/10 rounded-lg p-3 text-xs text-danger flex items-center gap-2">
              <AlertCircle size={12} /> AI 분석 실패: {aiReview.error}
              <button onClick={handleAiReview} className="ml-auto text-slate-400 hover:text-slate-200">재시도</button>
            </div>
          ) : (
            <div className="rounded-lg border border-bg-border bg-bg-elevated p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Bot size={12} className="text-brand-light" /> AI 검토 결과
                </div>
                <button onClick={handleAiReview} disabled={aiLoading} className="text-[10px] text-slate-500 hover:text-slate-300">
                  {aiLoading ? <Loader size={10} className="animate-spin" /> : '재분석'}
                </button>
              </div>

              {/* 위험도 + 권고 */}
              <div className="flex gap-2">
                {riskCfg && (
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${riskCfg.bg} ${riskCfg.color}`}>
                    <riskCfg.Icon size={11} />
                    위험도 {riskCfg.label}
                  </div>
                )}
                {recCfg && (
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${recCfg.bg} ${recCfg.color}`}>
                    {recCfg.label}
                  </div>
                )}
              </div>

              {/* 권고 이유 */}
              {aiReview.recommendation_reason && (
                <p className="text-[11px] text-slate-400 leading-relaxed">{aiReview.recommendation_reason}</p>
              )}

              {/* 위험 요소 */}
              {aiReview.risk_factors && aiReview.risk_factors.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">위험 요소</div>
                  <ul className="space-y-0.5">
                    {aiReview.risk_factors.map((f, i) => (
                      <li key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                        <span className="text-danger mt-0.5">•</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 핵심 포인트 */}
              {aiReview.key_points && aiReview.key_points.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">핵심 포인트</div>
                  <ul className="space-y-0.5">
                    {aiReview.key_points.map((p, i) => (
                      <li key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                        <span className="text-brand-light mt-0.5">·</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 확인 필요 사항 */}
              {aiReview.questions && aiReview.questions.length > 0 && (
                <div className="bg-warning/5 rounded-md p-2">
                  <div className="text-[10px] text-warning mb-1">확인 필요</div>
                  {aiReview.questions.map((q, i) => (
                    <div key={i} className="text-[11px] text-slate-400">Q{i + 1}. {q}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {approval.status === 'pending' && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">검토 의견 (선택)</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="승인/반려 사유..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleReview('rejected')}
                disabled={loading}
                className="flex-1 btn-danger flex items-center justify-center gap-1.5"
              >
                <X size={13} /> 반려
              </button>
              <button
                onClick={() => handleReview('approved')}
                disabled={loading}
                className="flex-1 btn-primary flex items-center justify-center gap-1.5 bg-success hover:bg-success/80"
              >
                <Check size={13} /> 승인
              </button>
            </div>
          </>
        )}

        {approval.status !== 'pending' && (
          <div className={`rounded-lg px-3 py-2 text-xs ${
            approval.status === 'approved'
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-danger'
          }`}>
            {approval.status === 'approved' ? '✓ 승인됨' : '✗ 반려됨'}
            {approval.reviewer_note && ` — ${approval.reviewer_note}`}
          </div>
        )}
      </div>
    </div>
  )
}

function TerminalDetail({ tr, onDecide, onClose }: {
  tr: TerminalRequest
  onDecide: (id: number, action: 'approve' | 'reject') => Promise<void>
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)

  const handle = async (action: 'approve' | 'reject') => {
    setLoading(true)
    await onDecide(tr.id, action)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 animate-slide-in">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded font-mono">터미널 명령</span>
            <h2 className="text-sm font-semibold text-slate-100 mt-2 font-mono break-all">{tr.command}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {tr.requested_by_name} · {format(new Date(tr.created_at), 'yyyy-MM-dd HH:mm')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="bg-bg-elevated rounded-lg p-3 mb-4 text-xs text-slate-400 leading-relaxed">
          <span className="text-slate-500">사유: </span>{tr.reason || '사유 없음'}
        </div>

        {tr.output && (
          <div className="mb-4">
            <div className="text-[10px] text-slate-500 mb-1">실행 결과 (exit {tr.exit_code})</div>
            <pre className="bg-black/40 rounded-lg p-3 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-40 overflow-y-auto">
              {tr.output}
            </pre>
          </div>
        )}

        {tr.status === 'pending' && (
          <div className="flex gap-2">
            <button onClick={() => handle('reject')} disabled={loading}
              className="flex-1 btn-danger flex items-center justify-center gap-1.5">
              <X size={13} /> 거부
            </button>
            <button onClick={() => handle('approve')} disabled={loading}
              className="flex-1 btn-primary flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500">
              <Check size={13} /> 승인 & 실행
            </button>
          </div>
        )}

        {tr.status !== 'pending' && (
          <div className={`rounded-lg px-3 py-2 text-xs ${
            tr.status === 'executed' ? 'bg-emerald-500/10 text-emerald-300'
            : tr.status === 'rejected' ? 'bg-danger/10 text-danger'
            : 'bg-blue-500/10 text-blue-300'
          }`}>
            {tr.status === 'executed' ? `✓ 실행 완료 (exit ${tr.exit_code})` : tr.status === 'rejected' ? '✗ 거부됨' : `⏳ ${tr.status}`}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Approvals() {
  const { triggerBadgeRefresh } = useAppStore()
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [terminals, setTerminals] = useState<TerminalRequest[]>([])
  const [mainTab, setMainTab] = useState<'approvals' | 'terminal'>('approvals')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [termStatusFilter, setTermStatusFilter] = useState('pending')
  const [selected, setSelected] = useState<ApprovalRequest | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<TerminalRequest | null>(null)

  const loadApprovals = (status?: string) =>
    approvalsApi.list(status || statusFilter).then((r) => setApprovals(r.data))

  const loadTerminals = (status?: string) =>
    terminalApi.list(status || termStatusFilter).then((r) => setTerminals(r.data))

  useEffect(() => { loadApprovals() }, [statusFilter])
  useEffect(() => { loadTerminals() }, [termStatusFilter])

  const handleReview = async (id: number, status: string, note: string) => {
    await approvalsApi.review(id, { status, reviewer_note: note })
    triggerBadgeRefresh()
    setSelected(null)
    loadApprovals()
  }

  const handleTermDecide = async (id: number, action: 'approve' | 'reject') => {
    if (action === 'approve') {
      await terminalApi.approveAndExecute(id)
    } else {
      await terminalApi.decide(id, 'reject')
    }
    triggerBadgeRefresh()
    setSelectedTerm(null)
    loadTerminals()
  }

  const pendingCount = approvals.filter((a) => a.status === 'pending').length
  const pendingTermCount = terminals.filter((t) => t.status === 'pending').length

  const termStatusColor = (status: string) => {
    if (status === 'executed') return 'bg-emerald-500/15 text-emerald-300'
    if (status === 'rejected') return 'bg-danger/15 text-danger'
    if (status === 'approved') return 'bg-blue-500/15 text-blue-300'
    return 'bg-warning/15 text-warning'
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Main tab switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMainTab('approvals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            mainTab === 'approvals' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
          }`}
        >
          <Mail size={13} />
          승인 인박스
          {pendingCount > 0 && <span className="badge-pending">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setMainTab('terminal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            mainTab === 'terminal' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
          }`}
        >
          <Terminal size={13} />
          터미널 요청
          {pendingTermCount > 0 && <span className="badge-pending">{pendingTermCount}</span>}
        </button>
      </div>

      {/* Approval inbox */}
      {mainTab === 'approvals' && (
        <>
          <div className="flex gap-1 ml-auto justify-end">
            {['pending', 'approved', 'rejected'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  statusFilter === s
                    ? 'bg-brand/20 text-brand-light'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
                }`}
              >
                {s === 'pending' ? '대기' : s === 'approved' ? '승인' : '반려'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {approvals.length === 0 && (
              <div className="card p-12 text-center text-slate-600">
                <Mail size={32} className="mx-auto mb-3 text-slate-700" />
                <p className="text-sm">해당하는 승인 요청이 없습니다.</p>
              </div>
            )}
            {approvals.map((a) => (
              <div
                key={a.id}
                onClick={() => setSelected(a)}
                className={`card p-4 cursor-pointer hover:border-brand/30 transition-all flex items-center gap-4 ${
                  a.status === 'pending' ? 'border-warning/20' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.status === 'pending'
                    ? 'bg-warning/15 text-warning'
                    : a.status === 'approved'
                      ? 'bg-success/15 text-success'
                      : 'bg-danger/15 text-danger'
                }`}>
                  {a.status === 'pending' ? <Clock size={14} /> : a.status === 'approved' ? <Check size={14} /> : <X size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${a.status === 'pending' ? 'text-slate-100' : 'text-slate-400'}`}>
                      {a.title}
                    </span>
                    <span className={TYPE_COLORS[a.request_type] || 'badge-inactive'}>
                      {TYPE_LABELS[a.request_type] || a.request_type}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {a.requester} · {a.description?.slice(0, 80)}...
                  </div>
                </div>
                <div className="text-[10px] text-slate-600 flex-shrink-0">
                  {format(new Date(a.created_at), 'MM/dd HH:mm')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Terminal requests */}
      {mainTab === 'terminal' && (
        <>
          <div className="flex gap-1 justify-end">
            {['pending', 'executed', 'rejected'].map((s) => (
              <button
                key={s}
                onClick={() => setTermStatusFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  termStatusFilter === s
                    ? 'bg-brand/20 text-brand-light'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
                }`}
              >
                {s === 'pending' ? '대기' : s === 'executed' ? '실행됨' : '거부됨'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {terminals.length === 0 && (
              <div className="card p-12 text-center text-slate-600">
                <Terminal size={32} className="mx-auto mb-3 text-slate-700" />
                <p className="text-sm">해당하는 터미널 요청이 없습니다.</p>
              </div>
            )}
            {terminals.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTerm(t)}
                className={`card p-4 cursor-pointer hover:border-brand/30 transition-all flex items-center gap-4 ${
                  t.status === 'pending' ? 'border-warning/20' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${termStatusColor(t.status)}`}>
                  {t.status === 'pending' ? <Clock size={14} /> : t.status === 'executed' ? <Check size={14} /> : <X size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className={`text-xs font-mono ${t.status === 'pending' ? 'text-slate-100' : 'text-slate-400'} truncate max-w-xs`}>
                      {t.command}
                    </code>
                    {t.exit_code !== undefined && t.exit_code !== null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${t.exit_code === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                        exit {t.exit_code}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {t.requested_by_name} · {t.reason?.slice(0, 70)}
                  </div>
                </div>
                <div className="text-[10px] text-slate-600 flex-shrink-0">
                  {format(new Date(t.created_at), 'MM/dd HH:mm')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selected && (
        <ApprovalDetail
          approval={selected}
          onReview={handleReview}
          onClose={() => setSelected(null)}
        />
      )}
      {selectedTerm && (
        <TerminalDetail
          tr={selectedTerm}
          onDecide={handleTermDecide}
          onClose={() => setSelectedTerm(null)}
        />
      )}
    </div>
  )
}
