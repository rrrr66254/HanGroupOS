import { useState, useEffect } from 'react'
import { Monitor, Star, Zap, ExternalLink, Loader2, RefreshCw, TrendingUp, Eye } from 'lucide-react'
import { sitesApi } from '../api/client'

interface Site {
  id: number; company_id: number; company_name: string | null
  title: string; slug: string; status: string
  ai_score: number; ai_feedback: string; visits: number
  created_at: string | null; deployed_at: string | null
}

function ScoreRing({ score }: { score: number }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : score >= 40 ? '#f97316' : '#f87171'
  return (
    <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  )
}

export default function SiteEvaluator() {
  const [sites, setSites] = useState<Site[]>([])
  const [allSites, setAllSites] = useState<Site[]>([])
  const [filter, setFilter] = useState<'all' | 'live' | 'draft'>('all')
  const [loading, setLoading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => { loadSites() }, [])

  useEffect(() => {
    if (filter === 'all') setSites(allSites)
    else setSites(allSites.filter((s) => s.status === filter))
  }, [filter, allSites])

  const loadSites = async () => {
    setLoading(true)
    try {
      const r = await sitesApi.list()
      const list = r.data as Site[]
      setAllSites(list)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const runEvaluation = async () => {
    setEvaluating(true)
    try {
      await sitesApi.evaluate()
      await loadSites()
    } catch { /* ignore */ } finally { setEvaluating(false) }
  }

  const selectSite = async (site: Site) => {
    setSelectedSite(site)
    setPreviewHtml('')
    if (!site.id) return
    setLoadingPreview(true)
    try {
      const r = await sitesApi.getHtml(site.id)
      setPreviewHtml(r.data.html)
    } catch { /* ignore */ } finally { setLoadingPreview(false) }
  }

  const liveSites = allSites.filter((s) => s.status === 'live')
  const avgScore = liveSites.length
    ? Math.round(liveSites.reduce((a, b) => a + (b.ai_score || 0), 0) / liveSites.length)
    : 0
  const topSite = [...liveSites].sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))[0]

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Monitor size={18} className="text-brand-light" />
            계열사 사이트 평가
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">배포된 계열사 웹사이트를 AI 회장이 평가합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadSites} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={runEvaluation}
            disabled={evaluating}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: evaluating ? 'rgba(251,191,36,0.06)' : 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24',
            }}
          >
            {evaluating ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
            {evaluating ? 'AI 평가 중…' : 'AI 평가 실행'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '전체 사이트', value: allSites.length, icon: Monitor, color: '#60a5fa' },
          { label: '배포 중', value: liveSites.length, icon: TrendingUp, color: '#34d399' },
          { label: '평균 AI 점수', value: avgScore ? `${avgScore}점` : '–', icon: Star, color: '#fbbf24' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
              <Icon size={16} style={{ color }} />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-100">{value}</div>
              <div className="text-[10px] text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {topSite && topSite.ai_score > 0 && (
        <div className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <Star size={14} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300">
            최고 평가: <strong>{topSite.company_name || topSite.title}</strong> ({Math.round(topSite.ai_score)}점)
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {(['all', 'live', 'draft'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-xs rounded-lg transition-all"
            style={{
              background: filter === f ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: filter === f ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
              color: filter === f ? '#a5b4fc' : '#64748b',
            }}
          >
            {f === 'all' ? '전체' : f === 'live' ? '배포 중' : '초안'}
          </button>
        ))}
      </div>

      {/* Two-column layout: list + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Site list */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
          ) : sites.length === 0 ? (
            <div className="card p-10 text-center text-slate-600 text-sm">
              사이트가 없습니다.<br />
              <span className="text-xs">계열사 웹사이트 빌더에서 사이트를 생성하세요.</span>
            </div>
          ) : (
            sites.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSite(s)}
                className="w-full text-left rounded-xl p-4 transition-all"
                style={{
                  background: selectedSite?.id === s.id ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                  border: selectedSite?.id === s.id
                    ? '1px solid rgba(99,102,241,0.35)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex items-center gap-3">
                  <ScoreRing score={s.ai_score || 0} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-slate-100 truncate">
                        {s.company_name || s.title}
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={s.status === 'live'
                          ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                          : { background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}
                      >
                        {s.status === 'live' ? 'LIVE' : '초안'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">/sites/{s.slug}</div>
                    {s.ai_feedback && (
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{s.ai_feedback}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
                        <Eye size={8} /> {s.visits}회
                      </span>
                      {s.deployed_at && (
                        <span className="text-[9px] text-slate-700">
                          배포 {new Date(s.deployed_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.status === 'live' && (
                    <a
                      href={`/sites/${s.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-brand-light hover:bg-brand/10 transition-colors flex-shrink-0"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Preview panel */}
        <div className="rounded-xl overflow-hidden border border-bg-border"
          style={{ height: 520, background: 'rgba(255,255,255,0.01)' }}>
          {!selectedSite ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <Monitor size={32} className="mb-3" />
              <span className="text-sm">사이트를 선택하면 미리보기가 표시됩니다</span>
            </div>
          ) : loadingPreview ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-slate-600" />
            </div>
          ) : previewHtml ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  <span className="text-[10px] text-slate-600 ml-2 font-mono">/sites/{selectedSite.slug}</span>
                </div>
                {selectedSite.status === 'live' && (
                  <a href={`/sites/${selectedSite.slug}`} target="_blank" rel="noreferrer"
                    className="text-[10px] text-brand-light flex items-center gap-0.5 hover:underline">
                    <ExternalLink size={9} /> 새 탭
                  </a>
                )}
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Site Preview"
                className="flex-1 w-full"
                sandbox="allow-forms allow-scripts allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
              HTML을 불러올 수 없습니다
            </div>
          )}
        </div>
      </div>

      {/* AI feedback detail */}
      {selectedSite && selectedSite.ai_feedback && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">
              AI 회장 평가 — {selectedSite.company_name || selectedSite.title}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full ml-auto"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              {Math.round(selectedSite.ai_score)}점
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{selectedSite.ai_feedback}</p>
        </div>
      )}
    </div>
  )
}
