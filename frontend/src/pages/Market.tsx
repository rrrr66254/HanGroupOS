import { useEffect, useState } from 'react'
import { TrendingUp, Search, ChevronDown, ChevronUp, Loader, Bell, BellOff, Plus, X } from 'lucide-react'
import { marketApi, companiesApi, dataApi } from '../api/client'
import type { MarketReport, Company } from '../types'
import { format } from 'date-fns'

interface MarketAlert {
  id: number
  keyword: string
  company_id: number | null
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

const PRESET_INDUSTRIES = ['AI', 'SaaS', '미디어', '데이터', '교육', '헬스케어', '핀테크', '이커머스']

export default function Market() {
  const [reports, setReports] = useState<MarketReport[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [industry, setIndustry] = useState('')
  const [focus, setFocus] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  // 시장 모니터링 알림
  const [alerts, setAlerts] = useState<MarketAlert[]>([])
  const [alertKeyword, setAlertKeyword] = useState('')
  const [alertCompanyId, setAlertCompanyId] = useState('')
  const [alertLoading, setAlertLoading] = useState(false)

  useEffect(() => {
    marketApi.reports().then((r) => setReports(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
    dataApi.alerts().then((r) => setAlerts(r.data)).catch(() => {})
  }, [])

  const addAlert = async () => {
    if (!alertKeyword.trim()) return
    setAlertLoading(true)
    try {
      await dataApi.createAlert(alertKeyword.trim(), alertCompanyId ? parseInt(alertCompanyId) : undefined)
      const r = await dataApi.alerts()
      setAlerts(r.data)
      setAlertKeyword('')
    } finally {
      setAlertLoading(false)
    }
  }

  const toggleAlert = async (id: number, active: boolean) => {
    await dataApi.toggleAlert(id, active)
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_active: active } : a))
  }

  const removeAlert = async (id: number) => {
    await dataApi.deleteAlert(id)
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

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

      {/* 시장 모니터링 알림 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Bell size={15} className="text-amber-400" />
          실시간 시장 모니터링 알림
          <span className="ml-auto text-[10px] text-slate-500 font-normal">6시간마다 자동 매칭</span>
        </h3>
        {/* 키워드 등록 */}
        <div className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="모니터링할 키워드 (예: AI반도체, ChatGPT)"
            value={alertKeyword}
            onChange={(e) => setAlertKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAlert()}
          />
          <select className="input w-36" value={alertCompanyId} onChange={(e) => setAlertCompanyId(e.target.value)}>
            <option value="">전체</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={addAlert}
            disabled={!alertKeyword.trim() || alertLoading}
            className="btn-primary flex items-center gap-1.5"
          >
            {alertLoading ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
            등록
          </button>
        </div>
        {/* 등록된 알림 목록 */}
        {alerts.length === 0 ? (
          <div className="text-xs text-slate-600 py-3 text-center">
            등록된 키워드 알림이 없습니다. 위에서 키워드를 입력하세요.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                  a.is_active
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-bg-border bg-bg-elevated text-slate-500'
                }`}
              >
                <button onClick={() => toggleAlert(a.id, !a.is_active)} title={a.is_active ? '비활성화' : '활성화'}>
                  {a.is_active ? <Bell size={11} /> : <BellOff size={11} />}
                </button>
                <span>{a.keyword}</span>
                {a.company_id && (
                  <span className="text-[10px] opacity-60">
                    · {companies.find((c) => c.id === a.company_id)?.name || `#${a.company_id}`}
                  </span>
                )}
                {a.last_triggered_at && (
                  <span className="text-[10px] opacity-50">
                    ({format(new Date(a.last_triggered_at), 'MM-dd HH:mm')})
                  </span>
                )}
                <button onClick={() => removeAlert(a.id)} className="ml-1 opacity-60 hover:opacity-100">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
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
