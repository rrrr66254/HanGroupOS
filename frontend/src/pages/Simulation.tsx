import { useEffect, useState } from 'react'
import { FlaskConical, Play, ChevronDown, ChevronUp, TrendingUp, AlertTriangle } from 'lucide-react'
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

export default function Simulation() {
  const [simulations, setSimulations] = useState<SimulationRun[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [scenario, setScenario] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [params, setParams] = useState<Record<string, string>>({ investment: '1000', period_months: '12' })
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    simulationApi.list().then((r) => setSimulations(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [])

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
    </div>
  )
}
