import { useEffect, useState } from 'react'
import { TrendingUp, Search, ChevronDown, ChevronUp, Loader } from 'lucide-react'
import { marketApi, companiesApi } from '../api/client'
import type { MarketReport, Company } from '../types'
import { format } from 'date-fns'

const PRESET_INDUSTRIES = ['AI', 'SaaS', '미디어', '데이터', '교육', '헬스케어', '핀테크', '이커머스']

export default function Market() {
  const [reports, setReports] = useState<MarketReport[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [industry, setIndustry] = useState('')
  const [focus, setFocus] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    marketApi.reports().then((r) => setReports(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [])

  const analyze = async () => {
    if (!industry) return
    setLoading(true)
    try {
      const res = await marketApi.analyze({
        industry,
        focus,
        company_id: companyId ? parseInt(companyId) : null,
      })
      setReports((prev) => [res.data, ...prev])
      setExpanded(res.data.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Analyze form */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <TrendingUp size={15} className="text-success" />
          시장 분석 실행
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">산업 분야 *</label>
            <input
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="예: AI SaaS, 미디어"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">분석 초점 (선택)</label>
            <input
              className="input"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="예: 한국 시장 진입 기회"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">계열사 연결 (선택)</label>
            <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">없음</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Preset industries */}
        <div className="flex gap-2 flex-wrap mb-4">
          {PRESET_INDUSTRIES.map((ind) => (
            <button
              key={ind}
              onClick={() => setIndustry(ind)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                industry === ind
                  ? 'border-brand/60 bg-brand/15 text-brand-light'
                  : 'border-bg-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
            >
              {ind}
            </button>
          ))}
        </div>

        <button
          onClick={analyze}
          disabled={!industry || loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? '분석 중...' : '시장 분석 시작'}
        </button>
      </div>

      {/* Reports */}
      <div className="space-y-3">
        <h3 className="text-xs text-slate-500 font-medium">{reports.length}개 분석 보고서</h3>
        {reports.length === 0 && (
          <div className="card p-12 text-center text-slate-600 text-sm">
            <TrendingUp size={32} className="mx-auto mb-3 text-slate-700" />
            아직 분석 보고서가 없습니다. 위에서 시장 분석을 실행하세요.
          </div>
        )}
        {reports.map((r) => (
          <div key={r.id} className="card overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-elevated transition-colors"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div>
                <div className="text-sm font-semibold text-slate-100">{r.title}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')}
                  {r.company_id && companies.find((c) => c.id === r.company_id)
                    ? ` · ${companies.find((c) => c.id === r.company_id)?.name}`
                    : ''}
                </div>
              </div>
              {expanded === r.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
            </div>

            {expanded === r.id && (
              <div className="px-4 pb-4 space-y-4 border-t border-bg-border pt-4 animate-fade-in">
                {/* Summary */}
                <div className="bg-bg-elevated rounded-lg p-3 text-xs text-slate-300 leading-relaxed">
                  {r.summary}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Opportunities */}
                  <div>
                    <h4 className="text-xs font-semibold text-success mb-2">기회 요인</h4>
                    <div className="space-y-1.5">
                      {(r.opportunities as Array<{ title: string; description: string; potential?: string }>).map((o, i) => (
                        <div key={i} className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                          <div className="text-xs font-medium text-success">{o.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{o.description}</div>
                          {o.potential && (
                            <span className={`badge mt-1 ${o.potential === 'high' ? 'badge-active' : 'badge-pending'}`}>
                              {o.potential}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Threats */}
                  <div>
                    <h4 className="text-xs font-semibold text-danger mb-2">위협 요인</h4>
                    <div className="space-y-1.5">
                      {(r.threats as Array<{ title: string; description: string }>).map((t, i) => (
                        <div key={i} className="bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                          <div className="text-xs font-medium text-danger">{t.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{t.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Trends */}
                {(r.trends as string[]).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-accent mb-2">주요 트렌드</h4>
                    <div className="flex flex-wrap gap-2">
                      {(r.trends as string[]).map((t, i) => (
                        <span key={i} className="badge bg-accent/10 text-accent text-[10px] px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Competitors */}
                {(r.competitors as Array<{ name: string; market_share?: string; strength?: string }>).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">경쟁사 현황</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {(r.competitors as Array<{ name: string; market_share?: string; strength?: string }>).map((c, i) => (
                        <div key={i} className="bg-bg-elevated rounded-lg px-3 py-2 text-center">
                          <div className="text-xs font-medium text-slate-300">{c.name}</div>
                          {c.market_share && <div className="text-[10px] text-brand-light">{c.market_share}</div>}
                          {c.strength && <div className="text-[10px] text-slate-500 mt-0.5">{c.strength}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
