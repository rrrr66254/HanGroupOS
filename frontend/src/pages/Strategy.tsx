import { useEffect, useState } from 'react'
import { Map, Plus, X, Trophy, Target, Milestone, BarChart3, LayoutGrid, List } from 'lucide-react'
import { strategyApi, companiesApi } from '../api/client'
import type { StrategyItem, Company, CEOPerformance } from '../types'
import { format } from 'date-fns'

const ITEM_TYPE_ICONS: Record<string, React.ElementType> = {
  objective: Target,
  initiative: Map,
  milestone: Milestone,
  kpi: BarChart3,
}

const ITEM_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  objective:  { label: '목표',       color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  initiative: { label: '이니셔티브', color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  milestone:  { label: '마일스톤',   color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
  kpi:        { label: 'KPI',        color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
}

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  high:   { color: '#f87171', label: '높음' },
  medium: { color: '#fbbf24', label: '중간' },
  low:    { color: '#64748b', label: '낮음' },
}

// ── Company lane colors ────────────────────────────────────────────────────
const LANE_COLORS = [
  '#818cf8', '#34d399', '#fb923c', '#fbbf24',
  '#f472b6', '#60a5fa', '#a3e635', '#c084fc',
]

function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-bg-border rounded-full h-1">
      <div
        className="h-1 rounded-full transition-all duration-300"
        style={{ width: `${value}%`, background: color ?? '#6366f1' }}
      />
    </div>
  )
}

// ── Strategy card ──────────────────────────────────────────────────────────
function StrategyCard({
  item, onProgressChange, onDelete, laneColor, onDragStart,
}: {
  item: StrategyItem
  onProgressChange: (id: number, v: number) => void
  onDelete: (id: number) => void
  laneColor: string
  onDragStart: (e: React.DragEvent, itemId: number) => void
}) {
  const typeMeta = ITEM_TYPE_META[item.item_type] ?? ITEM_TYPE_META.objective
  const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium
  const Icon = ITEM_TYPE_ICONS[item.item_type] ?? Target

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      className="rounded-xl p-3 group relative transition-all hover:brightness-110 cursor-grab active:cursor-grabbing select-none"
      style={{ background: typeMeta.bg, border: `1px solid ${typeMeta.color}25` }}
    >
      {/* Type + priority badges */}
      <div className="flex items-center gap-1 mb-1.5">
        <div
          className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}
        >
          <Icon size={8} />{typeMeta.label}
        </div>
        <div
          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
          style={{ color: priorityMeta.color }}
        >
          {priorityMeta.label}
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all ml-1 p-0.5"
        >
          <X size={9} />
        </button>
      </div>

      {/* Title */}
      <div className="text-[11px] font-semibold text-slate-200 leading-snug mb-1">{item.title}</div>
      {item.description && (
        <div className="text-[9px] text-slate-600 leading-relaxed mb-2 line-clamp-2">{item.description}</div>
      )}

      {/* Progress */}
      <div className="space-y-1">
        <ProgressBar value={item.progress} color={laneColor} />
        <div className="flex items-center justify-between">
          <input
            type="range" min={0} max={100}
            value={item.progress}
            onChange={(e) => onProgressChange(item.id, parseInt(e.target.value))}
            className="w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-3 left-3 right-3"
            style={{ width: 'calc(100% - 24px)' }}
          />
          <span className="text-[9px] font-mono" style={{ color: laneColor }}>{item.progress}%</span>
          {item.due_date && (
            <span className="text-[9px] text-slate-700">{item.due_date}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Lane (one per company) ─────────────────────────────────────────────────
function CompanyLane({
  company, items, color, onProgressChange, onDelete, onDragStart, onDrop,
}: {
  company: { id: number | null; name: string }
  items: StrategyItem[]
  color: string
  onProgressChange: (id: number, v: number) => void
  onDelete: (id: number) => void
  onDragStart: (e: React.DragEvent, itemId: number) => void
  onDrop: (targetCompanyId: number | null) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const totalProgress = items.length
    ? Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length)
    : 0

  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-xl overflow-hidden transition-all"
      style={{
        width: 220,
        background: isDragOver ? `${color}18` : `${color}06`,
        border: `1px solid ${isDragOver ? color : `${color}20`}`,
        boxShadow: isDragOver ? `0 0 0 2px ${color}30` : 'none',
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(company.id) }}
    >
      {/* Lane header */}
      <div
        className="px-3 py-2.5 flex-shrink-0"
        style={{ background: `${color}12`, borderBottom: `1px solid ${color}20` }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-bold text-slate-200 truncate">{company.name}</div>
          <div
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1"
            style={{ background: `${color}20`, color }}
          >
            {items.length}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-bg-border overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${totalProgress}%`, background: color }} />
          </div>
          <span className="text-[9px] font-mono flex-shrink-0" style={{ color }}>{totalProgress}%</span>
        </div>
      </div>

      {/* Cards + drop target */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {isDragOver && items.length === 0 && (
          <div
            className="rounded-lg border-2 border-dashed py-6 text-center text-[9px]"
            style={{ borderColor: color, color }}
          >
            여기에 놓기
          </div>
        )}
        {items.length === 0 && !isDragOver ? (
          <div className="text-[10px] text-slate-700 text-center py-6">전략 없음</div>
        ) : (
          items.map((item) => (
            <StrategyCard
              key={item.id}
              item={item}
              laneColor={color}
              onProgressChange={onProgressChange}
              onDelete={onDelete}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default function Strategy() {
  const [items, setItems] = useState<StrategyItem[]>([])
  const [leaderboard, setLeaderboard] = useState<Array<{ company_id: number; company_name: string; period: string; overall_score: number }>>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyFilter, setCompanyFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({
    title: '', description: '', item_type: 'objective',
    priority: 'medium', company_id: '', due_date: '',
  })
  const [evaluating, setEvaluating] = useState(false)
  const [evalCompany, setEvalCompany] = useState('')
  const [evalPeriod, setEvalPeriod] = useState('')
  const [tab, setTab] = useState<'map' | 'leaderboard' | 'evaluate'>('map')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')

  const load = async () => {
    // Always fetch all items; board view filters client-side for lane layout
    strategyApi.map(undefined).then((r) => setItems(r.data))
    strategyApi.leaderboard().then((r) => setLeaderboard(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }

  useEffect(() => { load() }, [])

  const createItem = async () => {
    await strategyApi.createItem({
      ...newForm,
      company_id: newForm.company_id ? parseInt(newForm.company_id) : null,
    })
    setShowNew(false)
    setNewForm({ title: '', description: '', item_type: 'objective', priority: 'medium', company_id: '', due_date: '' })
    load()
  }

  const updateProgress = async (id: number, progress: number) => {
    await strategyApi.updateItem(id, { progress })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, progress } : i))
  }

  const deleteItem = async (id: number) => {
    await strategyApi.deleteItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const evaluateCEO = async () => {
    if (!evalCompany || !evalPeriod) return
    setEvaluating(true)
    try {
      await strategyApi.evaluateCEO({ company_id: parseInt(evalCompany), period: evalPeriod })
      strategyApi.leaderboard().then((r) => setLeaderboard(r.data))
      setTab('leaderboard')
    } finally {
      setEvaluating(false)
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const dragItemId = useState<number | null>(null)
  const [dragId, setDragId] = dragItemId

  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    setDragId(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(itemId))
  }

  const handleDrop = async (targetCompanyId: number | null) => {
    if (dragId === null) return
    const item = items.find((i) => i.id === dragId)
    if (!item || item.company_id === targetCompanyId) { setDragId(null); return }
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === dragId ? { ...i, company_id: targetCompanyId } : i))
    setDragId(null)
    await strategyApi.updateItem(dragId, { company_id: targetCompanyId })
  }

  const filteredItems = companyFilter
    ? items.filter((i) => String(i.company_id) === companyFilter)
    : items

  const grouped = filteredItems.reduce<Record<string, StrategyItem[]>>((acc, item) => {
    const key = item.item_type
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit">
        {[
          { id: 'map', label: '전략 맵' },
          { id: 'leaderboard', label: 'CEO 리더보드' },
          { id: 'evaluate', label: 'CEO 평가' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'map' | 'leaderboard' | 'evaluate')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <select
              className="input max-w-[180px] text-xs"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">전체 그룹</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* View mode toggle */}
            <div className="flex rounded-lg border border-bg-border overflow-hidden text-xs">
              <button
                onClick={() => setViewMode('board')}
                className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${viewMode === 'board' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutGrid size={11} />보드
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${viewMode === 'list' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <List size={11} />목록
              </button>
            </div>

            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 ml-auto text-xs py-1.5">
              <Plus size={13} /> 전략 추가
            </button>
          </div>

          {/* ── Board view: company lanes ── */}
          {viewMode === 'board' && (
            <>
              {items.length === 0 ? (
                <div className="card p-12 text-center text-slate-600 text-sm">
                  <Map size={32} className="mx-auto mb-3 text-slate-700" />
                  전략 항목이 없습니다. 추가 버튼을 눌러 전략을 작성하세요.
                </div>
              ) : (
                <div
                  className="flex gap-3 overflow-x-auto pb-3"
                  style={{ minHeight: 400 }}
                >
                  {/* Group-level lane (no company) */}
                  {(() => {
                    const groupItems = items.filter((i) => !i.company_id)
                    if (!companyFilter && groupItems.length > 0) {
                      return (
                        <CompanyLane
                          key="group"
                          company={{ id: null, name: '그룹 전체' }}
                          items={groupItems}
                          color="#e24c4b"
                          onProgressChange={updateProgress}
                          onDelete={deleteItem}
                          onDragStart={handleDragStart}
                          onDrop={handleDrop}
                        />
                      )
                    }
                    return null
                  })()}

                  {/* Per-company lanes */}
                  {companies
                    .filter((c) => !companyFilter || String(c.id) === companyFilter)
                    .map((c, idx) => {
                      const laneItems = items.filter((i) => i.company_id === c.id)
                      const color = LANE_COLORS[idx % LANE_COLORS.length]
                      return (
                        <CompanyLane
                          key={c.id}
                          company={c}
                          items={laneItems}
                          color={color}
                          onProgressChange={updateProgress}
                          onDelete={deleteItem}
                          onDragStart={handleDragStart}
                          onDrop={handleDrop}
                        />
                      )
                    })
                  }
                </div>
              )}
            </>
          )}

          {/* ── List view ── */}
          {viewMode === 'list' && (
            <>
              {Object.entries(grouped).map(([type, typeItems]) => {
                const Icon = ITEM_TYPE_ICONS[type] || Target
                const meta = ITEM_TYPE_META[type] ?? ITEM_TYPE_META.objective
                return (
                  <div key={type} className="card p-4">
                    <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2 mb-3">
                      <Icon size={13} style={{ color: meta.color }} />
                      <span style={{ color: meta.color }}>{meta.label}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {typeItems.length}
                      </span>
                    </h3>
                    <div className="space-y-2">
                      {typeItems.map((item) => {
                        const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium
                        return (
                          <div key={item.id} className="bg-bg-elevated rounded-lg px-3 py-3 group">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-slate-200 truncate">{item.title}</span>
                                  <span className="text-[9px] font-medium flex-shrink-0" style={{ color: priorityMeta.color }}>
                                    {priorityMeta.label}
                                  </span>
                                  {item.company_id && (
                                    <span
                                      className="text-[8px] px-1 py-0.5 rounded flex-shrink-0"
                                      style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}
                                    >
                                      {companies.find((c) => c.id === item.company_id)?.name ?? ''}
                                    </span>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-[10px] text-slate-500 mb-1.5 truncate">{item.description}</p>
                                )}
                                <div className="flex items-center gap-3">
                                  <ProgressBar value={item.progress} color={meta.color} />
                                  <input
                                    type="range" min={0} max={100}
                                    value={item.progress}
                                    onChange={(e) => updateProgress(item.id, parseInt(e.target.value))}
                                    className="w-20 h-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  />
                                  <span className="text-[10px] font-mono w-8 flex-shrink-0" style={{ color: meta.color }}>{item.progress}%</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                {item.due_date && (
                                  <span className="text-[10px] text-slate-600">{item.due_date}</span>
                                )}
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-danger p-1 transition-all"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {items.length === 0 && (
                <div className="card p-12 text-center text-slate-600 text-sm">
                  <Map size={32} className="mx-auto mb-3 text-slate-700" />
                  전략 항목이 없습니다. 추가 버튼을 눌러 전략을 작성하세요.
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'leaderboard' && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
            <Trophy size={14} className="text-warning" /> CEO 성과 리더보드
          </h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-8">아직 평가된 CEO가 없습니다. CEO 평가 탭에서 평가를 진행하세요.</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-bg-elevated rounded-lg px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    idx === 0 ? 'bg-yellow-500/20 text-yellow-400'
                    : idx === 1 ? 'bg-slate-400/20 text-slate-300'
                    : 'bg-orange-600/20 text-orange-500'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">{entry.company_name}</div>
                    <div className="text-[10px] text-slate-500">{entry.period}</div>
                  </div>
                  <div className="text-lg font-bold text-brand-light">{entry.overall_score.toFixed(1)}</div>
                  <div className="text-[10px] text-slate-500">/ 10</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'evaluate' && (
        <div className="card p-5 max-w-md">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">AI CEO 성과 평가</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">계열사 *</label>
              <select className="input" value={evalCompany} onChange={(e) => setEvalCompany(e.target.value)}>
                <option value="">선택...</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">평가 기간 *</label>
              <input
                className="input"
                value={evalPeriod}
                onChange={(e) => setEvalPeriod(e.target.value)}
                placeholder="예: 2025-Q1"
              />
            </div>
            <button
              onClick={evaluateCEO}
              disabled={!evalCompany || !evalPeriod || evaluating}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {evaluating ? '평가 중...' : 'CEO 성과 평가 실행'}
            </button>
          </div>
        </div>
      )}

      {/* New item modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">전략 항목 추가</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">제목 *</label>
                <input className="input" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">유형</label>
                  <select className="input text-xs" value={newForm.item_type} onChange={(e) => setNewForm((f) => ({ ...f, item_type: e.target.value }))}>
                    <option value="objective">목표</option>
                    <option value="initiative">이니셔티브</option>
                    <option value="milestone">마일스톤</option>
                    <option value="kpi">KPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">우선순위</label>
                  <select className="input text-xs" value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="high">높음</option>
                    <option value="medium">중간</option>
                    <option value="low">낮음</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">계열사</label>
                <select className="input text-xs" value={newForm.company_id} onChange={(e) => setNewForm((f) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">전체 그룹</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">목표 시기</label>
                <input className="input text-xs" value={newForm.due_date} onChange={(e) => setNewForm((f) => ({ ...f, due_date: e.target.value }))} placeholder="예: 2025-Q2" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="flex-1 btn-ghost border border-bg-border">취소</button>
              <button onClick={createItem} disabled={!newForm.title} className="flex-1 btn-primary">추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
