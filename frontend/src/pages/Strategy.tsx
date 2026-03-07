import { useEffect, useState } from 'react'
import { Map, Plus, X, Trophy, Target, Milestone, BarChart3 } from 'lucide-react'
import { strategyApi, companiesApi } from '../api/client'
import type { StrategyItem, Company, CEOPerformance } from '../types'
import { format } from 'date-fns'

const ITEM_TYPE_ICONS: Record<string, React.ElementType> = {
  objective: Target,
  initiative: Map,
  milestone: Milestone,
  kpi: BarChart3,
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-danger',
  medium: 'text-warning',
  low: 'text-slate-400',
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-bg-border rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full bg-brand transition-all duration-300"
        style={{ width: `${value}%` }}
      />
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

  const load = async () => {
    const cid = companyFilter ? parseInt(companyFilter) : undefined
    strategyApi.map(cid).then((r) => setItems(r.data))
    strategyApi.leaderboard().then((r) => setLeaderboard(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }

  useEffect(() => { load() }, [companyFilter])

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

  const grouped = items.reduce<Record<string, StrategyItem[]>>((acc, item) => {
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
          <div className="flex items-center gap-3">
            <select
              className="input max-w-[180px] text-xs"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">전체 그룹</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 ml-auto text-xs py-1.5">
              <Plus size={13} /> 전략 추가
            </button>
          </div>

          {Object.entries(grouped).map(([type, typeItems]) => {
            const Icon = ITEM_TYPE_ICONS[type] || Target
            return (
              <div key={type} className="card p-4">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2 mb-3">
                  <Icon size={14} className="text-brand-light" />
                  {type === 'objective' ? '목표' : type === 'milestone' ? '마일스톤' : type === 'kpi' ? 'KPI' : '이니셔티브'}
                  <span className="badge-brand">{typeItems.length}</span>
                </h3>
                <div className="space-y-2">
                  {typeItems.map((item) => (
                    <div key={item.id} className="bg-bg-elevated rounded-lg px-3 py-3 group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-200 truncate">{item.title}</span>
                            <span className={`text-[10px] font-medium ${PRIORITY_COLORS[item.priority]}`}>
                              {item.priority}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <ProgressBar value={item.progress} />
                            <input
                              type="range"
                              min={0} max={100}
                              value={item.progress}
                              onChange={(e) => updateProgress(item.id, parseInt(e.target.value))}
                              className="w-24 h-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                            <span className="text-[10px] text-slate-500 w-8 flex-shrink-0">{item.progress}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
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
                  ))}
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
