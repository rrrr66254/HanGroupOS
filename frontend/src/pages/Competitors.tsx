import { useEffect, useState } from 'react'
import {
  Crosshair, Plus, Trash2, RefreshCw, Loader, ChevronDown, ChevronUp,
  Newspaper, X, Search,
} from 'lucide-react'
import { competitorApi } from '../api/client'

interface Competitor {
  id: number
  name: string
  industry: string
  competitor_keywords: string[]
  status: string
  created_at: string
}

interface NewsItem {
  id: number
  title: string
  content: string
  source: string
  data_type: string
  tags: string[]
  created_at: string
}

function CompetitorCard({
  competitor,
  onDelete,
}: {
  competitor: Competitor
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [news, setNews] = useState<NewsItem[]>([])
  const [loadingNews, setLoadingNews] = useState(false)
  const [collecting, setCollecting] = useState(false)

  const loadNews = async () => {
    setLoadingNews(true)
    try {
      const r = await competitorApi.news(competitor.id, 20)
      setNews(r.data.items || [])
    } finally {
      setLoadingNews(false)
    }
  }

  const handleExpand = () => {
    const next = !expanded
    setExpanded(next)
    if (next && news.length === 0) loadNews()
  }

  const handleCollect = async () => {
    setCollecting(true)
    try {
      await competitorApi.collect(competitor.id)
      await loadNews()
    } finally {
      setCollecting(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
          <Crosshair size={14} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-100 text-sm">{competitor.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">{competitor.industry || '업종 미지정'}</div>
          {competitor.competitor_keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {competitor.competitor_keywords.map((kw, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/40">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="btn-ghost text-xs flex items-center gap-1 px-2 py-1"
          >
            {collecting ? <Loader size={11} className="animate-spin" /> : <Search size={11} />}
            수집
          </button>
          <button
            onClick={handleExpand}
            className="btn-ghost text-xs flex items-center gap-1 px-2 py-1"
          >
            <Newspaper size={11} />
            뉴스
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-bg-border pt-3 space-y-2">
          {loadingNews ? (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
              <Loader size={13} className="animate-spin" />
              뉴스 로딩 중...
            </div>
          ) : news.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">
              수집된 뉴스가 없습니다. 위 "수집" 버튼을 눌러 즉시 수집하세요.
            </div>
          ) : (
            news.map((item) => (
              <div key={item.id} className="p-2.5 rounded-lg bg-bg-elevated border border-bg-border space-y-1">
                <div className="text-xs font-medium text-slate-200">{item.title}</div>
                <div className="text-[10px] text-slate-500 line-clamp-2">{item.content}</div>
                <div className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
              </div>
            ))
          )}
          {news.length > 0 && (
            <button onClick={loadNews} className="btn-ghost text-xs flex items-center gap-1">
              <RefreshCw size={10} /> 새로고침
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Competitors() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', industry: '', keywords: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await competitorApi.list()
      setCompetitors(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const keywords = form.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
      await competitorApi.create({ name: form.name, industry: form.industry, keywords })
      setForm({ name: '', industry: '', keywords: '' })
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 경쟁사를 삭제하겠습니까?')) return
    await competitorApi.delete(id)
    await load()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crosshair size={20} className="text-red-400" />
          <div>
            <h2 className="text-base font-semibold text-slate-100">경쟁사 모니터링</h2>
            <p className="text-xs text-slate-500">경쟁사 등록 → 키워드 기반 뉴스 자동 수집</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary flex items-center gap-1.5 text-xs"
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? '취소' : '경쟁사 추가'}
          </button>
        </div>
      </div>

      {/* 추가 폼 */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">새 경쟁사 등록</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">회사명 *</label>
              <input
                className="input w-full text-sm"
                placeholder="예: 삼성전자"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">업종</label>
              <input
                className="input w-full text-sm"
                placeholder="예: 반도체, 전자"
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">모니터링 키워드 (쉼표로 구분)</label>
            <input
              className="input w-full text-sm"
              placeholder="예: 삼성전자, 반도체, HBM, 갤럭시"
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">취소</button>
            <button onClick={handleCreate} disabled={saving || !form.name.trim()} className="btn-primary text-sm flex items-center gap-1.5">
              {saving && <Loader size={13} className="animate-spin" />}
              등록
            </button>
          </div>
        </div>
      )}

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Crosshair size={12} /> 총 경쟁사</div>
          <div className="text-2xl font-bold text-red-400">{competitors.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Newspaper size={12} /> 모니터링 중</div>
          <div className="text-2xl font-bold text-slate-100">{competitors.filter((c) => c.status === 'active').length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Search size={12} /> 총 키워드</div>
          <div className="text-2xl font-bold text-brand-light">
            {competitors.reduce((s, c) => s + (c.competitor_keywords?.length || 0), 0)}
          </div>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader size={20} className="animate-spin" />
          <span className="text-sm">로딩 중...</span>
        </div>
      ) : competitors.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <Crosshair size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">등록된 경쟁사가 없습니다.</p>
          <p className="text-xs mt-1 text-slate-600">위 "경쟁사 추가" 버튼으로 경쟁사를 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              competitor={c}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
