import { useEffect, useState } from 'react'
import { FlaskConical, Play, ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Merge, CheckCircle, XCircle } from 'lucide-react'
import { simulationApi, companiesApi } from '../api/client'
import type { SimulationRun, Company } from '../types'
import { format } from 'date-fns'

const PRESET_SCENARIOS = [
  '신규 시장 진입 전략',
  '경쟁사 대응 시뮬레이션',
  '인수합병 시나리오 분석',
  'AI 기술 투자 ROI 예측',
  '리세션 대응 시나리오',
  '글로벌 확장 전략',
]

type MergerResult = {
  synergies?: string[]
  risks?: string[]
  org_plan?: string
  financial?: { cost_saving?: string; revenue_gain?: string; integration_cost?: string }
  timeline?: string
  recommendation?: string
  success_score?: number
}

export default function Simulation() {
  const [simulations, setSimulations] = useState<SimulationRun[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [scenario, setScenario] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [params, setParams] = useState<Record<string, string>>({ investment: '1000', period_months: '12' })
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [tab, setTab] = useState<'general' | 'merger'>('general')
  // Merger state
  const [mergerA, setMergerA] = useState('')
  const [mergerB, setMergerB] = useState('')
  const [mergerType, setMergerType] = useState('합병')
  const [mergerLoading, setMergerLoading] = useState(false)
  const [mergerResult, setMergerResult] = useState<{
    company_a: { name: string }
    company_b: { name: string }
    merger_type: string
    result: MergerResult
  } | null>(null)

  useEffect(() => {
    simulationApi.list().then((r) => setSimulations(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [])

  const runMerger = async () => {
    if (!mergerA || !mergerB || mergerA === mergerB) return
    setMergerLoading(true)
    setMergerResult(null)
    try {
      const res = await simulationApi.merger({
        company_a_id: parseInt(mergerA),
        company_b_id: parseInt(mergerB),
        merger_type: mergerType,
      })
      setMergerResult(res.data)
    } finally {
      setMergerLoading(false)
    }
  }

  const runSim = async () => {
    if (!scenario) return
    setLoading(true)
    try {
      const res = await simulationApi.run({
        scenario,
        company_id: companyId ? parseInt(companyId) : null,
        parameters: params,
      })
      setSimulations((prev) => [res.data, ...prev])
      setExpanded(res.data.id)
    } finally {
      setLoading(false)
    }
  }

  type SimResult = {
    revenue_projection?: { year1?: number; year2?: number; year3?: number; unit?: string }
    success_probability?: number
    risk_factors?: Array<{ factor: string; probability: string; impact: string }>
    key_milestones?: Array<{ month: number; milestone: string }>
    recommendation?: string
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('general')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === 'general' ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <FlaskConical size={12} /> 일반 시뮬레이션
        </button>
        <button
          onClick={() => setTab('merger')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === 'merger' ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Merge size={12} /> 합병·인수 시뮬레이션
        </button>
      </div>

      {/* ── Merger tab ── */}
      {tab === 'merger' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Merge size={15} className="text-purple-400" /> M&A 시뮬레이션
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">회사 A *</label>
                <select className="input" value={mergerA} onChange={(e) => setMergerA(e.target.value)}>
                  <option value="">선택...</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">회사 B *</label>
                <select className="input" value={mergerB} onChange={(e) => setMergerB(e.target.value)}>
                  <option value="">선택...</option>
                  {companies.filter((c) => String(c.id) !== mergerA).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">유형</label>
                <select className="input" value={mergerType} onChange={(e) => setMergerType(e.target.value)}>
                  <option value="합병">합병</option>
                  <option value="인수">인수</option>
                  <option value="전략적 제휴">전략적 제휴</option>
                </select>
              </div>
            </div>
            <button
              onClick={runMerger}
              disabled={!mergerA || !mergerB || mergerA === mergerB || mergerLoading}
              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {mergerLoading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 분석 중...</>
                : <><Merge size={14} /> M&A 분석 실행</>
              }
            </button>
          </div>

          {mergerResult && (
            <div className="card p-5 space-y-4 animate-fade-in">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-100">
                    {mergerResult.company_a.name} × {mergerResult.company_b.name}
                  </h3>
                  <p className="text-xs text-slate-500">{mergerResult.merger_type} 시뮬레이션 결과</p>
                </div>
                {mergerResult.result.success_score !== undefined && (
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{
                      color: mergerResult.result.success_score >= 70 ? '#10b981'
                           : mergerResult.result.success_score >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {mergerResult.result.success_score}
                    </div>
                    <div className="text-[10px] text-slate-500">성공 점수</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Synergies */}
                {mergerResult.result.synergies && (
                  <div>
                    <h4 className="text-xs font-semibold text-success mb-2 flex items-center gap-1">
                      <CheckCircle size={11} /> 시너지 효과
                    </h4>
                    <ul className="space-y-1.5">
                      {mergerResult.result.synergies.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2 text-xs text-slate-300">
                          <span className="text-success mt-0.5">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {mergerResult.result.risks && (
                  <div>
                    <h4 className="text-xs font-semibold text-danger mb-2 flex items-center gap-1">
                      <XCircle size={11} /> 주요 리스크
                    </h4>
                    <ul className="space-y-1.5">
                      {mergerResult.result.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 bg-danger/5 border border-danger/20 rounded-lg px-3 py-2 text-xs text-slate-300">
                          <span className="text-danger mt-0.5">!</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Financial */}
              {mergerResult.result.financial && (
                <div>
                  <h4 className="text-xs font-semibold text-accent mb-2 flex items-center gap-1">
                    <TrendingUp size={11} /> 재무 전망
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '비용 절감', value: mergerResult.result.financial.cost_saving, color: '#10b981' },
                      { label: '매출 증가', value: mergerResult.result.financial.revenue_gain, color: '#22d3ee' },
                      { label: '통합 비용', value: mergerResult.result.financial.integration_cost, color: '#f59e0b' },
                    ].map((item) => (
                      <div key={item.label} className="bg-bg-elevated rounded-lg p-3 text-center border border-bg-border">
                        <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
                        <div className="text-sm font-bold" style={{ color: item.color }}>{item.value || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Org plan + timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mergerResult.result.org_plan && (
                  <div className="bg-bg-elevated rounded-lg p-3">
                    <h4 className="text-[10px] font-semibold text-slate-400 mb-1">조직 통합 방안</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{mergerResult.result.org_plan}</p>
                  </div>
                )}
                {mergerResult.result.timeline && (
                  <div className="bg-bg-elevated rounded-lg p-3">
                    <h4 className="text-[10px] font-semibold text-slate-400 mb-1">예상 통합 기간</h4>
                    <p className="text-sm font-bold text-purple-400">{mergerResult.result.timeline}</p>
                  </div>
                )}
              </div>

              {/* Recommendation */}
              {mergerResult.result.recommendation && (
                <div className="bg-brand/5 border border-brand/20 rounded-lg p-3">
                  <h4 className="text-[10px] font-semibold text-brand-light mb-1">최종 권고 의견</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{mergerResult.result.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'general' && (
      <>
      {/* Run form */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <FlaskConical size={15} className="text-pink-400" />
          비즈니스 시뮬레이션
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">시나리오 *</label>
            <input
              className="input"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="시뮬레이션할 시나리오를 입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">계열사 (선택)</label>
            <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">그룹 전체</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">투자 규모 (백만원)</label>
            <input
              className="input"
              type="number"
              value={params.investment}
              onChange={(e) => setParams((p) => ({ ...p, investment: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">기간 (개월)</label>
            <input
              className="input"
              type="number"
              value={params.period_months}
              onChange={(e) => setParams((p) => ({ ...p, period_months: e.target.value }))}
            />
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_SCENARIOS.map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                scenario === s
                  ? 'border-pink-400/60 bg-pink-400/15 text-pink-300'
                  : 'border-bg-border text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={runSim}
          disabled={!scenario || loading}
          className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 시뮬레이션 중...</>
          ) : (
            <><Play size={14} /> 시뮬레이션 실행</>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="space-y-3">
        <h3 className="text-xs text-slate-500 font-medium">{simulations.length}개 시뮬레이션 결과</h3>
        {simulations.length === 0 && (
          <div className="card p-12 text-center text-slate-600 text-sm">
            <FlaskConical size={32} className="mx-auto mb-3 text-slate-700" />
            시뮬레이션 결과가 없습니다. 위에서 시뮬레이션을 실행하세요.
          </div>
        )}
        {simulations.map((sim) => {
          const result = sim.result as SimResult
          return (
            <div key={sim.id} className="card overflow-hidden">
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-elevated"
                onClick={() => setExpanded(expanded === sim.id ? null : sim.id)}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-100">{sim.scenario}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {format(new Date(sim.created_at), 'yyyy-MM-dd HH:mm')}
                    {sim.company_id && companies.find((c) => c.id === sim.company_id)
                      ? ` · ${companies.find((c) => c.id === sim.company_id)?.name}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {result.success_probability !== undefined && (
                    <div className="text-right">
                      <div className="text-lg font-bold text-brand-light">{result.success_probability}%</div>
                      <div className="text-[10px] text-slate-500">성공 확률</div>
                    </div>
                  )}
                  {expanded === sim.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </div>

              {expanded === sim.id && (
                <div className="px-4 pb-4 border-t border-bg-border pt-4 space-y-4 animate-fade-in">
                  {/* Summary */}
                  <div className="bg-brand/5 border border-brand/20 rounded-lg p-3 text-xs text-slate-300 leading-relaxed">
                    {sim.summary}
                  </div>

                  {/* Revenue projection */}
                  {result.revenue_projection && (
                    <div>
                      <h4 className="text-xs font-semibold text-success mb-2 flex items-center gap-1">
                        <TrendingUp size={12} /> 매출 예측 ({result.revenue_projection.unit || '백만원'})
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        {['year1', 'year2', 'year3'].map((year, i) => (
                          <div key={year} className="bg-success/5 border border-success/20 rounded-lg p-3 text-center">
                            <div className="text-[10px] text-slate-500">{i + 1}년차</div>
                            <div className="text-lg font-bold text-success mt-1">
                              {(result.revenue_projection?.[year as 'year1' | 'year2' | 'year3'] || 0).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk factors */}
                  {result.risk_factors && result.risk_factors.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-warning mb-2 flex items-center gap-1">
                        <AlertTriangle size={12} /> 리스크 요인
                      </h4>
                      <div className="space-y-1.5">
                        {result.risk_factors.map((r, i) => (
                          <div key={i} className="flex items-center gap-3 bg-bg-elevated rounded-lg px-3 py-2">
                            <span className="text-xs text-slate-300 flex-1">{r.factor}</span>
                            <span className={`badge text-[10px] ${r.probability === '고' ? 'badge-danger' : 'badge-pending'}`}>확률: {r.probability}</span>
                            <span className={`badge text-[10px] ${r.impact === '고' ? 'badge-danger' : 'badge-inactive'}`}>영향: {r.impact}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Milestones */}
                  {result.key_milestones && result.key_milestones.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-accent mb-2">주요 마일스톤</h4>
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {result.key_milestones.map((m, i) => (
                          <div key={i} className="flex-shrink-0 bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 text-center min-w-[100px]">
                            <div className="text-accent font-bold text-sm">{m.month}개월</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{m.milestone}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}
