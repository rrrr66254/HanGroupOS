import { useEffect, useState } from 'react'
import { CheckSquare, X, Check, Mail, Clock, AlertCircle } from 'lucide-react'
import { approvalsApi } from '../api/client'
import type { ApprovalRequest } from '../types'
import { format } from 'date-fns'

const TYPE_LABELS: Record<string, string> = {
  company_create: '계열사 설립',
  org_change: '조직 변경',
  strategy: '전략 결정',
  market_briefing: '시장 분석 보고',
  general: '일반',
}

const TYPE_COLORS: Record<string, string> = {
  company_create: 'badge-brand',
  org_change: 'badge-pending',
  strategy: 'bg-purple-400/15 text-purple-300 badge',
  market_briefing: 'bg-teal-400/15 text-teal-300 badge',
  general: 'badge-inactive',
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

  const handleReview = async (status: string) => {
    setLoading(true)
    await onReview(approval.id, status, note)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 animate-slide-in">
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

        <div className="bg-bg-elevated rounded-lg p-3 mb-4 text-xs text-slate-400 leading-relaxed">
          {approval.description || '설명이 없습니다.'}
        </div>

        {Object.keys(approval.meta).length > 0 && (
          <div className="bg-bg-elevated rounded-lg p-3 mb-4">
            <div className="text-[10px] text-slate-500 mb-1">메타데이터</div>
            {Object.entries(approval.meta).map(([k, v]) => (
              <div key={k} className="text-xs text-slate-400">
                <span className="text-slate-500">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        )}

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

export default function Approvals() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState<ApprovalRequest | null>(null)

  const load = (status?: string) =>
    approvalsApi.list(status || statusFilter).then((r) => setApprovals(r.data))

  useEffect(() => { load() }, [statusFilter])

  const handleReview = async (id: number, status: string, note: string) => {
    await approvalsApi.review(id, { status, reviewer_note: note })
    setSelected(null)
    load()
  }

  const pendingCount = approvals.filter((a) => a.status === 'pending').length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-brand-light" />
          <span className="text-sm font-semibold text-slate-200">승인 인박스</span>
          {pendingCount > 0 && (
            <span className="badge-pending">{pendingCount}</span>
          )}
        </div>
        <div className="flex gap-1 ml-auto">
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
      </div>

      {/* Mail list */}
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

      {selected && (
        <ApprovalDetail
          approval={selected}
          onReview={handleReview}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
