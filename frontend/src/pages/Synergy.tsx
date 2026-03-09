import { useState, useEffect } from 'react'
import { Zap, Building2, ArrowRight, Loader2, RefreshCw, CheckCircle, TrendingUp, Star } from 'lucide-react'
import { companiesApi } from '../api/client'
import { synergyApi } from '../api/client'

interface Company { id: number; name: string; industry: string; description?: string }
interface Opportunity {
  title: string
  company_a: string
  company_b: string
  category: string
  description: string
  expected_outcome: string
  priority: 'high' | 'medium' | 'low'
}
interface SynergyResult {
  summary: string
  opportunities: Opportunity[]
}

const PRIORITY_STYLE = {
  high:   { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  text: '#f87171', label: '우선순위 높음' },
  medium: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24', label: '우선순위 보통' },
  low:    { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8', label: '우선순위 낮음' },
}

const CATEGORY_COLOR: Record<string, string> = {
  기술공유: '#818cf8', 마케팅: '#34d399', 데이터: '#60a5fa',
  제품: '#f97316', 운영: '#a78bfa',
}

export default function Synergy() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<SynergyResult | null>(null)

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data as Company[]
      setCompanies(list)
    }).catch(() => {})
  }, [])

  const toggleCompany = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const analyze = async (all = false) => {
    setAnalyzing(true)
    setResult(null)
    try {
      const ids = all ? companies.map((c) => c.id) : Array.from(selected)
      const r = await synergyApi.analyze(ids)
      setResult(r.data as SynergyResult)
    } catch { /* ignore */ } finally { setAnalyzing(false) }
  }

  const selectAll = () => setSelected(new Set(companies.map((c) => c.id)))
  const clearAll = () => setSelected(new Set())
  const allSelected = companies.length > 0 && selected.size === companies.length

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Zap size={18} className="text-brand-light" />
            계열사 시너지 분석
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">AI 회장이 계열사 간 협업 기회를 자동 발굴합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={analyze.bind(null, true)}
            disabled={analyzing || companies.length < 2}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc',
            }}
          >
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            전체 분석
          </button>
          <button
            onClick={() => analyze(false)}
            disabled={analyzing || selected.size < 2}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={selected.size >= 2
              ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569' }}
          >
            <Zap size={13} />
            선택 분석 ({selected.size}개)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Company selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">계열사 선택</span>
            <button
              onClick={allSelected ? clearAll : selectAll}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="space-y-1.5">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCompany(c.id)}
                className="w-full text-left rounded-xl px-3 py-2.5 transition-all flex items-center gap-2.5"
                style={{
                  background: selected.has(c.id) ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                  border: selected.has(c.id)
                    ? '1px solid rgba(99,102,241,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
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
                <Building2 size={11} className="text-slate-700 flex-shrink-0" />
              </button>
            ))}
            {companies.length === 0 && (
              <div className="text-center py-8 text-slate-600 text-xs">계열사가 없습니다</div>
            )}
          </div>
          {selected.size > 0 && selected.size < 2 && (
            <p className="text-[10px] text-amber-500/80">최소 2개 이상 선택하세요</p>
          )}
        </div>

        {/* Analysis results */}
        <div className="lg:col-span-2 space-y-4">
          {analyzing && (
            <div className="card p-10 text-center">
              <Loader2 size={32} className="animate-spin text-brand mx-auto mb-3" />
              <div className="text-sm text-slate-300 font-medium">AI 회장이 시너지를 분석하고 있습니다…</div>
              <div className="text-xs text-slate-600 mt-1">계열사 역량 비교 → 협업 기회 발굴 → 우선순위 책정</div>
            </div>
          )}

          {result && !analyzing && (
            <>
              {/* Summary */}
              <div className="card p-4"
                style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Star size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200">AI 회장 종합 의견</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
              </div>

              {/* Opportunities */}
              <div className="space-y-3">
                {result.opportunities.map((opp, i) => {
                  const style = PRIORITY_STYLE[opp.priority] ?? PRIORITY_STYLE.low
                  const catColor = CATEGORY_COLOR[opp.category] ?? '#94a3b8'
                  return (
                    <div
                      key={i}
                      className="card p-4"
                      style={{ background: style.bg, border: `1px solid ${style.border}` }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-slate-100">{opp.title}</span>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${catColor}20`, color: catColor, border: `1px solid ${catColor}30` }}
                            >
                              {opp.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-300 font-medium">{opp.company_a}</span>
                            <ArrowRight size={10} className="text-slate-600" />
                            <span className="text-slate-300 font-medium">{opp.company_b}</span>
                          </div>
                        </div>
                        <span
                          className="text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{ background: `${style.text}15`, color: style.text }}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{opp.description}</p>
                      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.05]">
                        <TrendingUp size={10} className="text-slate-600 flex-shrink-0" />
                        <span className="text-[10px] text-slate-500">{opp.expected_outcome}</span>
                      </div>
                    </div>
                  )
                })}
                {result.opportunities.length === 0 && (
                  <div className="card p-8 text-center text-slate-600 text-sm">
                    시너지 기회를 찾지 못했습니다.<br />
                    <span className="text-xs">다른 계열사 조합을 선택해보세요.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!result && !analyzing && (
            <div className="card p-12 text-center">
              <Zap size={40} className="mx-auto mb-4 text-slate-700" />
              <div className="text-slate-500 text-sm font-medium mb-1">시너지 분석을 시작하세요</div>
              <div className="text-slate-700 text-xs">
                좌측에서 계열사를 선택하고 "선택 분석" 버튼을 누르거나<br />
                "전체 분석"으로 모든 계열사의 협업 기회를 발굴하세요.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
