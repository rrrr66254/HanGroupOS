import { useEffect, useState } from 'react'
import {
  Activity, Zap, Clock, BarChart2, Cpu, TrendingUp,
  RefreshCw, ChevronDown, Award,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import { agentMetricsApi, companiesApi } from '../api/client'
import { useGroupStore } from '../store/useStore'

interface AgentSummary {
  agent_name: string
  agent_role: string
  requests: number
  total_tokens: number
  avg_response_ms: number
  avg_quality: number | null
}

interface ProviderSummary {
  provider: string
  requests: number
  total_tokens: number
}

interface DayTrend {
  date: string
  requests: number
  tokens: number
  avg_quality: number | null
}

interface MetricRow {
  id: number
  agent_name: string
  agent_role: string
  provider: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  response_time_ms: number
  quality_score: number | null
  session_type: string
  created_at: string
}

const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#fb923c', '#2dd4bf']

export default function AgentPerformance() {
  const groupName = useGroupStore((s) => s.config.group_name)
  const [days, setDays] = useState(7)
  const [companyId, setCompanyId] = useState<number | undefined>()
  const [companies, setCompanies] = useState<Array<{ id: number; name: string }>>([])
  const [summary, setSummary] = useState<{
    total_requests: number; total_tokens: number; avg_response_ms: number; avg_quality: number
    by_agent: AgentSummary[]; by_provider: ProviderSummary[]; by_day: DayTrend[]
  } | null>(null)
  const [recent, setRecent] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [summaryRes, recentRes, comps] = await Promise.all([
        agentMetricsApi.summary(days, companyId),
        agentMetricsApi.recent(30, companyId),
        companiesApi.list(),
      ])
      setSummary(summaryRes.data)
      setRecent(recentRes.data)
      setCompanies(comps.data.map((c: any) => ({ id: c.id, name: c.name })))
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [days, companyId])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Activity size={18} className="text-brand-light" />
            {groupName} AI 에이전트 성과 분석
          </h2>
          <p className="text-xs text-slate-500 mt-1">에이전트별 응답 품질, 토큰 사용량, 처리 시간 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : undefined)}
            className="input text-xs py-1.5 w-40"
          >
            <option value="">전체 회사</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input text-xs py-1.5 w-24">
            <option value={7}>7일</option>
            <option value={14}>14일</option>
            <option value={30}>30일</option>
            <option value={90}>90일</option>
          </select>
          <button onClick={load} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Zap, label: '총 요청', value: summary?.total_requests ?? 0, color: '#818cf8' },
          { icon: BarChart2, label: '총 토큰', value: summary?.total_tokens ? `${(summary.total_tokens / 1000).toFixed(1)}K` : '0', color: '#34d399' },
          { icon: Clock, label: '평균 응답 시간', value: summary?.avg_response_ms ? `${summary.avg_response_ms}ms` : '—', color: '#fbbf24' },
          { icon: TrendingUp, label: '평균 품질', value: summary?.avg_quality ? `${(summary.avg_quality * 100).toFixed(0)}%` : '—', color: '#60a5fa' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                <Icon size={14} style={{ color }} />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-100">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {summary && summary.total_requests > 0 && (
        <>
          {/* 일별 트렌드 + 프로바이더 분포 */}
          <div className="grid grid-cols-2 gap-6">
            {/* 일별 요청 추이 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <TrendingUp size={13} /> 일별 요청 추이
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={summary.by_day} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="requests" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} name="요청" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 프로바이더 분포 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Cpu size={13} /> 프로바이더별 사용량
              </h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={summary.by_provider} dataKey="requests" nameKey="provider"
                      cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {summary.by_provider.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {summary.by_provider.map((p, i) => (
                    <div key={p.provider} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-slate-300 flex-1">{p.provider}</span>
                      <span className="text-xs text-slate-500 font-mono">{p.requests}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 품질 추이 + 에이전트 품질 랭킹 */}
          <div className="grid grid-cols-2 gap-6">
            {/* 일별 품질 추이 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Award size={13} /> 일별 품질 추이
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={summary.by_day.filter((d) => d.avg_quality != null)}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, '품질']}
                  />
                  <Line type="monotone" dataKey="avg_quality" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} name="품질" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 에이전트 품질 랭킹 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Award size={13} /> 에이전트 품질 랭킹
              </h3>
              {(() => {
                const ranked = summary.by_agent
                  .filter((a) => a.avg_quality != null)
                  .map((a) => ({ ...a, quality_pct: Math.round((a.avg_quality ?? 0) * 100) }))
                  .sort((a, b) => b.quality_pct - a.quality_pct)
                  .slice(0, 8)
                return ranked.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ranked} layout="vertical"
                      margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }}
                        tickFormatter={(v: number) => `${v}%`} />
                      <YAxis type="category" dataKey="agent_name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number) => [`${v}%`, '품질']} />
                      <Bar dataKey="quality_pct" fill="#34d399" radius={[0, 4, 4, 0]} name="품질" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-600">품질 데이터가 없습니다</div>
                )
              })()}
            </div>
          </div>

          {/* 에이전트별 성과 랭킹 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Activity size={13} /> 에이전트별 성과 순위
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(200, summary.by_agent.length * 32)}>
              <BarChart data={summary.by_agent.slice(0, 10)} layout="vertical"
                margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 9, fill: '#475569' }} />
                <YAxis type="category" dataKey="agent_name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="requests" fill="#818cf8" radius={[0, 4, 4, 0]} name="요청 수" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 에이전트 테이블 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">에이전트 상세</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-bg-border">
                    <th className="text-left py-2 px-2">에이전트</th>
                    <th className="text-left py-2 px-2">역할</th>
                    <th className="text-right py-2 px-2">요청</th>
                    <th className="text-right py-2 px-2">토큰</th>
                    <th className="text-right py-2 px-2">평균 응답(ms)</th>
                    <th className="text-right py-2 px-2">품질</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_agent.map((a) => (
                    <tr key={a.agent_name} className="border-b border-bg-border/50 hover:bg-bg-elevated">
                      <td className="py-2 px-2 text-slate-200 font-medium">{a.agent_name}</td>
                      <td className="py-2 px-2 text-slate-500">{a.agent_role}</td>
                      <td className="py-2 px-2 text-right text-slate-300 font-mono">{a.requests}</td>
                      <td className="py-2 px-2 text-right text-slate-300 font-mono">
                        {a.total_tokens > 1000 ? `${(a.total_tokens / 1000).toFixed(1)}K` : a.total_tokens}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300 font-mono">{a.avg_response_ms}</td>
                      <td className="py-2 px-2 text-right">
                        {a.avg_quality != null ? (
                          <span className={`font-mono ${a.avg_quality >= 0.8 ? 'text-emerald-400' : a.avg_quality >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {(a.avg_quality * 100).toFixed(0)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 최근 호출 이력 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Clock size={13} /> 최근 AI 호출 이력
        </h3>
        {recent.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-600">
            아직 AI 호출 기록이 없습니다. AI 회장과 대화하거나 자동 작업이 실행되면 여기에 기록됩니다.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-bg-elevated rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{r.agent_name}</div>
                  <div className="text-[10px] text-slate-500">{r.agent_role} · {r.provider}/{r.model}</div>
                </div>
                <div className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                  {r.total_tokens}tok
                </div>
                <div className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                  {r.response_time_ms}ms
                </div>
                {r.quality_score != null && (
                  <div className={`text-[10px] font-mono flex-shrink-0 ${
                    r.quality_score >= 0.8 ? 'text-emerald-400' : 'text-yellow-400'
                  }`}>
                    {(r.quality_score * 100).toFixed(0)}%
                  </div>
                )}
                <div className="text-[9px] text-slate-600 flex-shrink-0">
                  {new Date(r.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
