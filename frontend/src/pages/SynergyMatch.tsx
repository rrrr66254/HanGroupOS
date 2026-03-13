import { useState, useEffect } from 'react'
import { GitMerge, RefreshCw, Sparkles, Loader2 } from 'lucide-react'
import { synergyMatchApi } from '../api/client'

interface Opportunity {
  company_a: { id: number; name: string }
  company_b: { id: number; name: string }
  synergy_type: string
  description: string
  match_score: number
}

const TYPE_COLORS: Record<string, string> = {
  '기술-데이터': 'text-cyan-400 bg-cyan-500/10',
  '콘텐츠-플랫폼': 'text-purple-400 bg-purple-500/10',
  '금융-운영': 'text-emerald-400 bg-emerald-500/10',
  '고객 교차': 'text-amber-400 bg-amber-500/10',
}

export default function SynergyMatch() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await synergyMatchApi.opportunities()
      setOpportunities(r.data.opportunities)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const runAi = async () => {
    setAnalyzing(true)
    try {
      const r = await synergyMatchApi.aiAnalyze()
      setAiAnalysis(r.data.analysis)
    } catch { /* ignore */ }
    setAnalyzing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <GitMerge size={20} className="text-cyan-400" /> 시너지 매칭
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">계열사 간 역량/필요 분석 + 협업 기회 자동 추천</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={runAi} disabled={analyzing}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50">
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI 심층 분석
          </button>
        </div>
      </div>

      {/* 키워드 기반 매칭 결과 */}
      <div className="space-y-3">
        {opportunities.map((o, i) => (
          <div key={i} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-white">{o.company_a.name}</div>
              <GitMerge size={14} className="text-slate-600" />
              <div className="text-sm font-medium text-white">{o.company_b.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${TYPE_COLORS[o.synergy_type] || 'text-slate-400 bg-slate-800'}`}>
                {o.synergy_type}
              </span>
              <div className="text-xs text-slate-500 max-w-[250px] truncate">{o.description}</div>
              <div className="w-12 bg-slate-800 rounded-full h-1.5">
                <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${o.match_score * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {opportunities.length === 0 && !loading && (
          <div className="card p-8 text-center text-xs text-slate-600">
            매칭된 시너지 기회가 없습니다. 계열사를 추가하면 자동 분석됩니다.
          </div>
        )}
      </div>

      {/* AI 심층 분석 */}
      {aiAnalysis && (
        <div className="card p-4 border border-indigo-500/30">
          <h3 className="text-xs font-bold text-indigo-400 mb-2 flex items-center gap-1">
            <Sparkles size={12} /> AI 시너지 심층 분석
          </h3>
          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{aiAnalysis}</div>
        </div>
      )}
    </div>
  )
}
