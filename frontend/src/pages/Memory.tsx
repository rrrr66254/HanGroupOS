import { useEffect, useState } from 'react'
import { Brain, Plus, X, Search, Trash2 } from 'lucide-react'
import { memoryApi, companiesApi } from '../api/client'
import type { CorporateMemory, Company } from '../types'
import { format } from 'date-fns'

const TYPE_LABELS: Record<string, string> = {
  decision: '의사결정',
  lesson: '교훈',
  fact: '팩트',
  event: '이벤트',
  general: '일반',
}

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: 'border-l-danger text-danger',
  high: 'border-l-warning text-warning',
  normal: 'border-l-brand text-brand-light',
  low: 'border-l-slate-600 text-slate-400',
}

export default function Memory() {
  const [memories, setMemories] = useState<CorporateMemory[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [importanceFilter, setImportanceFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [stats, setStats] = useState<{ total: number; by_type: Record<string, number>; critical: number } | null>(null)
  const [newForm, setNewForm] = useState({
    title: '', content: '', memory_type: 'general',
    importance: 'normal', company_id: '', tags: '',
  })

  const load = async () => {
    const params: Record<string, unknown> = {}
    if (search) params.search = search
    if (typeFilter) params.memory_type = typeFilter
    if (importanceFilter) params.importance = importanceFilter
    const res = await memoryApi.list(params)
    setMemories(res.data)
    memoryApi.stats().then((r) => setStats(r.data))
  }

  useEffect(() => {
    load()
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [search, typeFilter, importanceFilter])

  const createMemory = async () => {
    await memoryApi.create({
      ...newForm,
      company_id: newForm.company_id ? parseInt(newForm.company_id) : null,
      tags: newForm.tags ? newForm.tags.split(',').map((t) => t.trim()) : [],
    })
    setShowNew(false)
    setNewForm({ title: '', content: '', memory_type: 'general', importance: 'normal', company_id: '', tags: '' })
    load()
  }

  const deleteMemory = async (id: number) => {
    await memoryApi.delete(id)
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <div className="card p-3 text-center col-span-1">
            <div className="text-lg font-bold text-slate-100">{stats.total}</div>
            <div className="text-[10px] text-slate-500">전체</div>
          </div>
          {Object.entries(stats.by_type).map(([type, count]) => (
            <div key={type} className="card p-3 text-center">
              <div className="text-lg font-bold text-brand-light">{count}</div>
              <div className="text-[10px] text-slate-500">{TYPE_LABELS[type] || type}</div>
            </div>
          ))}
          <div className="card p-3 text-center border-danger/20">
            <div className="text-lg font-bold text-danger">{stats.critical}</div>
            <div className="text-[10px] text-slate-500">Critical</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8"
            placeholder="기억 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-[130px] text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">전체 유형</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[120px] text-xs" value={importanceFilter} onChange={(e) => setImportanceFilter(e.target.value)}>
          <option value="">전체 중요도</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 ml-auto text-xs py-1.5">
          <Plus size={13} /> 기억 추가
        </button>
      </div>

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="card p-12 text-center text-slate-600">
          <Brain size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-sm">기업 기억이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {memories.map((m) => {
            const impColor = IMPORTANCE_COLORS[m.importance] || IMPORTANCE_COLORS.normal
            return (
              <div key={m.id} className={`card p-4 border-l-4 ${impColor.split(' ')[0]} group`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{m.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="badge badge-inactive text-[9px]">{TYPE_LABELS[m.memory_type] || m.memory_type}</span>
                      <span className={`text-[9px] font-medium ${impColor.split(' ').slice(1).join(' ')}`}>{m.importance}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMemory(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-danger p-1 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{m.content}</p>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-bg-border">
                  <div className="flex gap-1 flex-wrap">
                    {m.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-elevated text-slate-500">#{tag}</span>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-600">
                    {format(new Date(m.created_at), 'yy.MM.dd')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New memory modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">기업 기억 추가</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">제목 *</label>
                <input className="input" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">내용 *</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={newForm.content}
                  onChange={(e) => setNewForm((f) => ({ ...f, content: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">유형</label>
                  <select className="input text-xs" value={newForm.memory_type} onChange={(e) => setNewForm((f) => ({ ...f, memory_type: e.target.value }))}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">중요도</label>
                  <select className="input text-xs" value={newForm.importance} onChange={(e) => setNewForm((f) => ({ ...f, importance: e.target.value }))}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">태그 (쉼표로 구분)</label>
                <input className="input text-xs" value={newForm.tags} onChange={(e) => setNewForm((f) => ({ ...f, tags: e.target.value }))} placeholder="전략, AI, 결정" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">계열사</label>
                <select className="input text-xs" value={newForm.company_id} onChange={(e) => setNewForm((f) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">그룹 전체</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="flex-1 btn-ghost border border-bg-border">취소</button>
              <button onClick={createMemory} disabled={!newForm.title || !newForm.content} className="flex-1 btn-primary">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
