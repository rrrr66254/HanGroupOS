import { useState, useEffect } from 'react'
import {
  DollarSign, TrendingUp, Cpu, BarChart2,
  RefreshCw, ChevronDown, PieChart as PieIcon,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { agentMetricsApi } from '../api/client'

const COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9']

interface ProviderCost {
  provider: string
  requests: number
  tokens: number
  cost_usd: number
}
interface ModelCost {
  provider: string
  model: string
  requests: number
  tokens: number
  cost_usd: number
}
interface DayCost {
  date: string
  cost_usd: number
  requests: number
}
interface CostSummary {
  total_cost_usd: number
  total_requests: number
  by_provider: ProviderCost[]
  by_model: ModelCost[]
  by_day: DayCost[]
  budget_monthly_usd: number | null
}

export default function CostAnalytics() {
  const [data, setData] = useState<CostSummary | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await agentMetricsApi.costSummary(days)
      setData(r.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [days])

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        {loading ? '로딩 중...' : '데이터를 불러올 수 없습니다.'}
      </div>
    )
  }

  const avgDaily = data.by_day.length > 0
    ? data.total_cost_usd / data.by_day.length
    : 0
  const projectedMonthly = avgDaily * 30

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign size={20} /> 비용 추적 대시보드
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">프로바이더별 AI 호출 비용 분석</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 기간 선택 */}
          <div className="relative">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="appearance-none bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-300 pr-7 cursor-pointer"
            >
              <option value={7}>7일</option>
              <option value={14}>14일</option>
              <option value={30}>30일</option>
              <option value={90}>90일</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign size={16} />} label="총 비용" color="text-emerald-400"
          value={`$${data.total_cost_usd.toFixed(4)}`} />
        <KpiCard icon={<TrendingUp size={16} />} label="월 예상 비용" color="text-amber-400"
          value={`$${projectedMonthly.toFixed(2)}`} />
        <KpiCard icon={<BarChart2 size={16} />} label="총 요청 수" color="text-indigo-400"
          value={data.total_requests.toLocaleString()} />
        <KpiCard icon={<Cpu size={16} />} label="프로바이더 수" color="text-cyan-400"
          value={String(data.by_provider.length)} />
      </div>

      {/* 일별 비용 추이 + 프로바이더 비율 */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp size={13} /> 일별 비용 추이 (USD)
          </h3>
          {data.by_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.by_day} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, '비용']}
                />
                <Line type="monotone" dataKey="cost_usd" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-xs text-slate-600">비용 데이터가 없습니다</div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <PieIcon size={13} /> 프로바이더 비용 비율
          </h3>
          {data.by_provider.filter((p) => p.cost_usd > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.by_provider.filter((p) => p.cost_usd > 0)}
                  dataKey="cost_usd"
                  nameKey="provider"
                  cx="50%" cy="50%"
                  innerRadius={40} outerRadius={70}
                  paddingAngle={2}
                  label={(props) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {data.by_provider.filter((p) => p.cost_usd > 0).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, '비용']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-xs text-slate-600">
              유료 프로바이더 사용 내역이 없습니다
              <br /><span className="text-slate-700">(Ollama/로컬 AI는 무료)</span>
            </div>
          )}
        </div>
      </div>

      {/* 모델별 비용 바 차트 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <BarChart2 size={13} /> 모델별 비용 상세
        </h3>
        {data.by_model.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(180, data.by_model.slice(0, 10).length * 36)}>
            <BarChart data={data.by_model.slice(0, 10)} layout="vertical"
              margin={{ top: 0, right: 30, left: 120, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: '#475569' }}
                tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
              <YAxis type="category" dataKey="model" tick={{ fontSize: 9, fill: '#94a3b8' }} width={120} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                formatter={(v) => [`$${Number(v).toFixed(4)}`, '비용']} />
              <Bar dataKey="cost_usd" fill="#818cf8" radius={[0, 4, 4, 0]} name="비용 (USD)" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-xs text-slate-600">모델별 비용 데이터가 없습니다</div>
        )}
      </div>

      {/* 프로바이더별 상세 테이블 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">프로바이더별 상세</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-2 text-slate-500 font-medium">프로바이더</th>
                <th className="text-right py-2 text-slate-500 font-medium">요청 수</th>
                <th className="text-right py-2 text-slate-500 font-medium">총 토큰</th>
                <th className="text-right py-2 text-slate-500 font-medium">비용 (USD)</th>
                <th className="text-right py-2 text-slate-500 font-medium">비율</th>
              </tr>
            </thead>
            <tbody>
              {data.by_provider.map((p, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 text-slate-300 font-medium">{p.provider}</td>
                  <td className="py-2 text-right text-slate-400">{p.requests.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-400">{p.tokens.toLocaleString()}</td>
                  <td className="py-2 text-right text-emerald-400 font-mono">${p.cost_usd.toFixed(4)}</td>
                  <td className="py-2 text-right text-slate-500">
                    {data.total_cost_usd > 0
                      ? `${((p.cost_usd / data.total_cost_usd) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
              {data.by_provider.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-600">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">{icon} {label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
