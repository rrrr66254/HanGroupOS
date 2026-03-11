import { useEffect, useState } from 'react'
import {
  Lightbulb, RefreshCw, Loader, ChevronDown, ChevronUp,
  Building2, Calendar, Zap, TrendingUp, BarChart3, Play, ArrowUpCircle, X, CheckSquare, Square,
  GitBranch,
} from 'lucide-react'
import { dataApi, companiesApi, strategyApi } from '../api/client'
import MarkdownMessage from '../components/MarkdownMessage'
import type { Company } from '../types'

interface Insight {
  id: number
  title: string
  description: string
  item_type: string
  status: string
  priority: string
  company_id: number | null
  created_at: string
  source_insight_id?: number
}

interface GenealogyNode {
  id: number
  title: string
  item_type: string
  status: string
  progress: number
  children: GenealogyNode[]
}

interface InsightStats {
  total: number
  by_company: Record<string, number>
  by_priority: Record<string, number>
  recent_7days: number
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: '높음', medium: '보통', low: '낮음',
}

const ITEM_TYPE_OPTIONS = [
  { value: 'objective', label: '전략 목표' },
  { value: 'milestone', label: '마일스톤' },
  { value: 'action', label: '실행 과제' },
  { value: 'risk', label: '리스크' },
]

interface PromoteModalProps {
  insight: Insight
  companies: Company[]
  onClose: () => void
  onDone: () => void
}

function PromoteModal({ insight, companies, onClose, onDone }: PromoteModalProps) {
  const [targetCompanyId, setTargetCompanyId] = useState(
    insight.company_id ? String(insight.company_id) : ''
  )
  const [itemType, setItemType] = useState('objective')
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState('')

  const handlePromote = async () => {
    setPromoting(true)
    setError('')
    try {
      await strategyApi.createItem({
        title: insight.title.replace('[자동인사이트] ', ''),
        description: insight.description,
        item_type: itemType,
        priority: insight.priority,
        company_id: targetCompanyId ? parseInt(targetCompanyId) : null,
      })
      onDone()
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || '격상 실패')
    } finally {
      setPromoting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-brand-light" />
            <h3 className="text-sm font-semibold text-slate-100">전략 목표로 격상</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 rounded-lg bg-bg-elevated border border-bg-border">
          <div className="text-xs font-medium text-slate-200 line-clamp-2">{insight.title}</div>
          <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{insight.description}</div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">대상 계열사 *</label>
            <select
              className="input w-full text-sm"
              value={targetCompanyId}
              onChange={(e) => setTargetCompanyId(e.target.value)}
            >
              <option value="">그룹 공통 (회사 미지정)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">전략 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setItemType(opt.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    itemType === opt.value
                      ? 'bg-brand/20 border-brand/40 text-brand-light'
                      : 'border-bg-border text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost text-sm">취소</button>
          <button
            onClick={handlePromote}
            disabled={promoting}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            {promoting && <Loader size={13} className="animate-spin" />}
            <ArrowUpCircle size={13} />
            격상하기
          </button>
        </div>
      </div>
    </div>
  )
}

function GenealogyTree({ nodes, depth = 0 }: { nodes: GenealogyNode[], depth?: number }) {
  return (
    <ul className={`space-y-1 ${depth > 0 ? 'ml-4 border-l border-bg-border pl-3 mt-1' : ''}`}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex items-start gap-2 py-1">
            <GitBranch size={11} className="text-brand-light flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-200 leading-snug">{node.title}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                <span>{node.item_type}</span>
                <span>·</span>
                <span>{node.status}</span>
                {node.progress > 0 && (
                  <>
                    <span>·</span>
                    <span>{node.progress}%</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {node.children?.length > 0 && (
            <GenealogyTree nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

function GenealogyModal({ insightId, onClose }: { insightId: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [tree, setTree] = useState<GenealogyNode[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    strategyApi.genealogy(insightId)
      .then((r) => setTree(Array.isArray(r.data) ? r.data : [r.data]))
      .catch(() => setError('계보 로딩 실패'))
      .finally(() => setLoading(false))
  }, [insightId])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-brand-light" />
            <h3 className="text-sm font-semibold text-slate-100">인사이트 계보</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
              <Loader size={14} className="animate-spin" />
              계보 로딩 중...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}
          {!loading && !error && tree.length === 0 && (
            <div className="text-xs text-slate-500 py-4">계보 데이터가 없습니다.</div>
          )}
          {!loading && tree.length > 0 && (
            <GenealogyTree nodes={tree} />
          )}
        </div>
      </div>
    </div>
  )
}

function InsightCard({
  insight,
  companyName,
  companies,
  onPromoted,
}: {
  insight: Insight
  companyName: string
  companies: Company[]
  onPromoted: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPromote, setShowPromote] = useState(false)
  const [showGenealogy, setShowGenealogy] = useState(false)
  const isAuto = insight.title.startsWith('[자동인사이트]')

  return (
    <div className="card p-4 space-y-2">
      {showPromote && (
        <PromoteModal
          insight={insight}
          companies={companies}
          onClose={() => setShowPromote(false)}
          onDone={onPromoted}
        />
      )}
      {showGenealogy && (
        <GenealogyModal
          insightId={insight.id}
          onClose={() => setShowGenealogy(false)}
        />
      )}
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isAuto ? 'bg-brand/20' : 'bg-success/20'}`}>
          {isAuto ? <Zap size={10} className="text-brand-light" /> : <Lightbulb size={10} className="text-success" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-100 truncate">{insight.title}</span>
            {isAuto && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/20 text-brand-light border border-brand/30 flex-shrink-0">
                AI 자동
              </span>
            )}
            {insight.source_insight_id && (
              <span className="text-[9px] bg-brand/10 text-brand-light border border-brand/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
                격상됨
              </span>
            )}
            <span className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLORS[insight.priority] || PRIORITY_COLORS.low}`}>
              {PRIORITY_LABEL[insight.priority] || insight.priority}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Building2 size={9} />
              {companyName || '그룹 공통'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={9} />
              {new Date(insight.created_at).toLocaleDateString('ko-KR')}
            </span>
          </div>
        </div>
        {insight.source_insight_id && (
          <button
            onClick={() => setShowGenealogy(true)}
            title="계보 보기"
            className="flex-shrink-0 text-slate-500 hover:text-brand-light p-1 transition-colors"
          >
            <GitBranch size={14} />
          </button>
        )}
        <button
          onClick={() => setShowPromote(true)}
          title="전략 목표로 격상"
          className="flex-shrink-0 text-slate-500 hover:text-brand-light p-1 transition-colors"
        >
          <ArrowUpCircle size={14} />
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-slate-500 hover:text-slate-300 p-1"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 border-t border-bg-border pt-2 text-xs text-slate-300">
          <MarkdownMessage content={insight.description || '내용 없음'} />
        </div>
      )}
    </div>
  )
}

export default function InsightsDashboard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCompany, setFilterCompany] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'auto' | 'manual'>('all')
  const [generating, setGenerating] = useState<number | null>(null)
  const [stats, setStats] = useState<InsightStats | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkPromoting, setBulkPromoting] = useState(false)
  const [bulkTargetCompany, setBulkTargetCompany] = useState('')
  const [bulkItemType, setBulkItemType] = useState('objective')
  const [showBulkPanel, setShowBulkPanel] = useState(false)

  const loadInsights = async () => {
    setLoading(true)
    try {
      const params: { item_type: string; limit: number; company_id?: number } = {
        item_type: 'initiative',
        limit: 100,
      }
      if (filterCompany) params.company_id = parseInt(filterCompany)
      const r = await strategyApi.items(params)
      let items: Insight[] = Array.isArray(r.data) ? r.data : []

      if (filterType === 'auto') items = items.filter((i) => i.title.startsWith('[자동인사이트]'))
      if (filterType === 'manual') items = items.filter((i) => !i.title.startsWith('[자동인사이트]'))

      setInsights(items)

      // 통계 계산
      const byCompany: Record<string, number> = {}
      const byPriority: Record<string, number> = {}
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      let recent = 0
      for (const item of items) {
        const cKey = String(item.company_id || 'group')
        byCompany[cKey] = (byCompany[cKey] || 0) + 1
        byPriority[item.priority] = (byPriority[item.priority] || 0) + 1
        if (new Date(item.created_at) > sevenDaysAgo) recent++
      }
      setStats({ total: items.length, by_company: byCompany, by_priority: byPriority, recent_7days: recent })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [])

  useEffect(() => {
    loadInsights()
  }, [filterCompany, filterType])

  const generateInsight = async (companyId: number) => {
    setGenerating(companyId)
    try {
      await dataApi.insights(companyId, 20, true)
      await loadInsights()
    } finally {
      setGenerating(null)
    }
  }

  const getCompanyName = (id: number | null) => {
    if (!id) return '그룹 공통'
    return companies.find((c) => c.id === id)?.name || `회사 #${id}`
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === insights.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(insights.map((i) => i.id)))
    }
  }

  const handleBulkPromote = async () => {
    if (selectedIds.size === 0) return
    setBulkPromoting(true)
    try {
      const items = Array.from(selectedIds).map((id) => ({
        insight_id: id,
        item_type: bulkItemType,
        company_id: bulkTargetCompany ? parseInt(bulkTargetCompany) : null,
      }))
      await strategyApi.bulkPromote({ items })
      setSelectedIds(new Set())
      setShowBulkPanel(false)
      await loadInsights()
    } finally {
      setBulkPromoting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb size={20} className="text-brand-light" />
          <div>
            <h2 className="text-base font-semibold text-slate-100">인사이트 대시보드</h2>
            <p className="text-xs text-slate-500">AI 자동 생성 + 수동 인사이트 통합 관리</p>
          </div>
        </div>
        <button onClick={loadInsights} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Lightbulb size={12} /> 전체 인사이트</div>
            <div className="text-2xl font-bold text-slate-100">{stats.total}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Zap size={12} /> 최근 7일</div>
            <div className="text-2xl font-bold text-brand-light">{stats.recent_7days}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Building2 size={12} /> 담당 회사</div>
            <div className="text-2xl font-bold text-success">{Object.keys(stats.by_company).length}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><TrendingUp size={12} /> 우선순위 高</div>
            <div className="text-2xl font-bold text-red-400">{stats.by_priority['high'] || 0}</div>
          </div>
        </div>
      )}

      {/* 즉시 인사이트 생성 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <Play size={14} className="text-success" />
          즉시 인사이트 생성
          <span className="text-[10px] text-slate-500 font-normal ml-auto">수집 데이터 → AI 분석 → StrategyItem 저장</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {companies.slice(0, 10).map((company) => (
            <button
              key={company.id}
              onClick={() => generateInsight(company.id)}
              disabled={generating !== null}
              className="p-2.5 rounded-lg border border-bg-border bg-bg-elevated hover:border-success/40 hover:bg-success/5 transition-all text-left"
            >
              {generating === company.id ? (
                <Loader size={12} className="animate-spin text-success mb-1.5" />
              ) : (
                <BarChart3 size={12} className="text-success mb-1.5" />
              )}
              <div className="text-[10px] font-medium text-slate-200 truncate">{company.name}</div>
              <div className="text-[9px] text-slate-500 mt-0.5 truncate">{company.industry || '업종 미지정'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="input text-xs h-8 py-0"
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
        >
          <option value="">전체 회사</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-bg-border overflow-hidden">
          {(['all', 'auto', 'manual'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-xs transition-colors ${
                filterType === type
                  ? 'bg-brand/20 text-brand-light'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {type === 'all' ? '전체' : type === 'auto' ? '🤖 AI 자동' : '✍️ 수동'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">{insights.length}건</span>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkPanel((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              <ArrowUpCircle size={11} />
              {selectedIds.size}개 선택 — bulk 격상
            </button>
          )}
        </div>
      </div>

      {/* Bulk 격상 패널 */}
      {showBulkPanel && selectedIds.size > 0 && (
        <div className="card p-4 space-y-3 border border-brand/30 bg-brand/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <ArrowUpCircle size={13} className="text-brand-light" />
              {selectedIds.size}개 인사이트 일괄 격상
            </span>
            <button onClick={() => setShowBulkPanel(false)} className="text-slate-500 hover:text-slate-300 p-1"><X size={13} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">대상 계열사</label>
              <select className="input w-full text-xs" value={bulkTargetCompany} onChange={(e) => setBulkTargetCompany(e.target.value)}>
                <option value="">그룹 공통</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">전략 유형</label>
              <select className="input w-full text-xs" value={bulkItemType} onChange={(e) => setBulkItemType(e.target.value)}>
                <option value="objective">전략 목표</option>
                <option value="milestone">마일스톤</option>
                <option value="action">실행 과제</option>
                <option value="initiative">이니셔티브</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowBulkPanel(false); setSelectedIds(new Set()) }} className="btn-ghost text-xs">취소</button>
            <button onClick={handleBulkPromote} disabled={bulkPromoting} className="btn-primary text-xs flex items-center gap-1.5">
              {bulkPromoting && <Loader size={11} className="animate-spin" />}
              <ArrowUpCircle size={11} />
              {selectedIds.size}개 격상
            </button>
          </div>
        </div>
      )}

      {/* 인사이트 목록 */}
      {!loading && insights.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button onClick={toggleSelectAll} className="flex items-center gap-1 hover:text-slate-300 transition-colors">
            {selectedIds.size === insights.length ? <CheckSquare size={12} className="text-brand-light" /> : <Square size={12} />}
            {selectedIds.size === insights.length ? '전체 해제' : '전체 선택'}
          </button>
        </div>
      )}
      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader size={20} className="animate-spin" />
          <span className="text-sm">로딩 중...</span>
        </div>
      ) : insights.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <Lightbulb size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">인사이트가 없습니다.</p>
          <p className="text-xs mt-1 text-slate-600">위에서 즉시 생성하거나 6시간 스케줄러를 기다리세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div key={insight.id} className="flex items-start gap-2">
              <button
                onClick={() => toggleSelect(insight.id)}
                className="mt-3 flex-shrink-0 text-slate-500 hover:text-brand-light transition-colors"
              >
                {selectedIds.has(insight.id) ? <CheckSquare size={14} className="text-brand-light" /> : <Square size={14} />}
              </button>
              <div className="flex-1 min-w-0">
                <InsightCard
                  insight={insight}
                  companyName={getCompanyName(insight.company_id)}
                  companies={companies}
                  onPromoted={loadInsights}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
