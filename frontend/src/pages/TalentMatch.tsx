import { useState, useEffect } from 'react'
import { Users, Zap, Loader2, ArrowRight, RefreshCw, CheckCircle, Star } from 'lucide-react'
import { companiesApi, talentApi } from '../api/client'

interface Company { id: number; name: string; industry: string }
interface Recommendation {
  type: string; person: string
  from_company: string; to_company: string
  reason: string; benefit: string
  priority: 'high' | 'medium' | 'low'
}
interface TalentResult {
  summary: string
  recommendations: Recommendation[]
}

const PRIORITY_STYLE = {
  high:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#f87171',  label: '긴급' },
  medium: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  text: '#fbbf24',  label: '권장' },
  low:    { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)',  text: '#94a3b8',  label: '검토' },
}

const TYPE_COLOR: Record<string, string> = {
  파견: '#34d399', 협업: '#818cf8', 멘토링: '#fbbf24', 팀빌딩: '#60a5fa',
}

export default function TalentMatch() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<TalentResult | null>(null)

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data as Company[]
      setCompanies(list)
    }).catch(() => {})
  }, [])

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const analyze = async (all = false) => {
    setAnalyzing(true); setResult(null)
    try {
      const ids = all ? companies.map((c) => c.id) : Array.from(selected)
      const r = await talentApi.match(ids)
      setResult(r.data as TalentResult)
    } catch { /* ignore */ } finally { setAnalyzing(false) }
  }

  const allSel = companies.length > 0 && selected.size === companies.length

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Users size={18} className="text-brand-light" />
            계열사 인재 추천
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">AI가 계열사 간 인재 이동·협업 기회를 발굴합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => analyze(true)}
            disabled={analyzing || companies.length < 2}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}
          >
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            전체 분석
          </button>
          <button
            onClick={() => analyze(false)}
            disabled={analyzing || selected.size < 2}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={selected.size >= 2
              ? { background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}
          >
            <Zap size={13} />선택 분석 ({selected.size}개)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">계열사 선택</span>
            <button
              onClick={() => allSel ? setSelected(new Set()) : setSelected(new Set(companies.map((c) => c.id)))}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              {allSel ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="space-y-1.5">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="w-full text-left rounded-xl px-3 py-2.5 transition-all flex items-center gap-2.5"
                style={{
                  background: selected.has(c.id) ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                  border: selected.has(c.id) ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={selected.has(c.id)
                    ? { background: 'rgba(99,102,241,0.4)', border: '1px solid rgba(99,102,241,0.6)' }
                    : { border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {selected.has(c.id) && <CheckCircle size={10} className="text-brand-light" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-600 truncate">{c.industry}</div>
                </div>
              </button>
            ))}
            {companies.length === 0 && (
              <div className="text-center py-8 text-slate-600 text-xs">계열사가 없습니다</div>
            )}
          </div>
          {selected.size === 1 && (
            <p className="text-[10px] text-amber-500/80">최소 2개 선택하세요</p>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {analyzing && (
            <div className="card p-10 text-center">
              <Loader2 size={32} className="animate-spin text-brand mx-auto mb-3" />
              <div className="text-sm text-slate-300 font-medium">AI가 조직원 역량을 분석하고 있습니다…</div>
              <div className="text-xs text-slate-600 mt-1">역량 매칭 → 이동 기회 발굴 → 우선순위 책정</div>
            </div>
          )}

          {result && !analyzing && (
            <>
              <div className="card p-4"
                style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Star size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200">AI 인재 현황 분석</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
              </div>
              <div className="space-y-3">
                {result.recommendations.map((rec, i) => {
                  const style = PRIORITY_STYLE[rec.priority] ?? PRIORITY_STYLE.low
                  const typeColor = TYPE_COLOR[rec.type] ?? '#94a3b8'
                  return (
                    <div key={i} className="card p-4"
                      style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-slate-100">{rec.person}</span>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}30` }}
                            >
                              {rec.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400">{rec.from_company}</span>
                            <ArrowRight size={10} className="text-slate-600" />
                            <span className="text-slate-300 font-medium">{rec.to_company}</span>
                          </div>
                        </div>
                        <span
                          className="text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{ background: `${style.text}15`, color: style.text }}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{rec.reason}</p>
                      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.05]">
                        <Zap size={9} className="text-slate-600 flex-shrink-0" />
                        <span className="text-[10px] text-slate-500">{rec.benefit}</span>
                      </div>
                    </div>
                  )
                })}
                {result.recommendations.length === 0 && (
                  <div className="card p-8 text-center text-slate-600 text-sm">
                    추천 결과가 없습니다.<br />
                    <span className="text-xs">더 많은 계열사를 선택해보세요.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!result && !analyzing && (
            <div className="card p-12 text-center">
              <Users size={40} className="mx-auto mb-4 text-slate-700" />
              <div className="text-slate-500 text-sm font-medium mb-1">인재 추천 분석을 시작하세요</div>
              <div className="text-slate-700 text-xs">
                계열사를 선택하고 분석하면 AI가<br />
                최적의 인재 이동·협업 기회를 제안합니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
