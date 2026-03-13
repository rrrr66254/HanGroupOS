import { useState, useEffect } from 'react'
import { Trophy, Medal, Award, TrendingUp, RefreshCw } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import { kpiScoreboardApi } from '../api/client'

const TROPHY_COLORS = { gold: '#f59e0b', silver: '#94a3b8', bronze: '#d97706' }
const TROPHY_ICONS = { gold: Trophy, silver: Medal, bronze: Award }

interface Ranking {
  rank: number
  company_id: number
  company_name: string
  industry: string
  total_score: number
  trophy: string | null
  breakdown: { kpi_achievement: number; ai_usage: number; ai_quality: number; response_speed: number }
  ai_calls_30d: number
  avg_quality: number
}

export default function KpiScoreboard() {
  const [rankings, setRankings] = useState<Ranking[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await kpiScoreboardApi.ranking()
      setRankings(r.data.rankings)
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const chartData = rankings.slice(0, 10).map((r) => ({
    name: r.company_name.length > 8 ? r.company_name.slice(0, 8) + '…' : r.company_name,
    score: r.total_score,
    trophy: r.trophy,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy size={20} className="text-amber-400" /> KPI 스코어보드
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">계열사별 종합 성과 랭킹 (30일 기준)</p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 상위 3 트로피 */}
      {rankings.length >= 1 && (
        <div className="grid grid-cols-3 gap-4">
          {rankings.slice(0, 3).map((r, i) => {
            const TrIcon = TROPHY_ICONS[r.trophy as keyof typeof TROPHY_ICONS] || Award
            const color = TROPHY_COLORS[r.trophy as keyof typeof TROPHY_COLORS] || '#64748b'
            return (
              <div key={r.company_id} className="card p-5 text-center relative overflow-hidden">
                <div className="absolute top-2 left-3 text-xs font-bold text-slate-600">#{r.rank}</div>
                <TrIcon size={32} style={{ color }} className="mx-auto mb-2" />
                <div className="font-bold text-white text-sm">{r.company_name}</div>
                <div className="text-xs text-slate-500">{r.industry}</div>
                <div className="text-2xl font-bold mt-2" style={{ color }}>{r.total_score}</div>
                <div className="text-[10px] text-slate-600">종합 점수</div>
              </div>
            )
          })}
        </div>
      )}

      {/* 랭킹 바 차트 */}
      {chartData.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp size={13} /> 종합 점수 랭킹
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} name="점수">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={TROPHY_COLORS[d.trophy as keyof typeof TROPHY_COLORS] || '#818cf8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 상세 테이블 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">상세 랭킹</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-2 text-slate-500">#</th>
                <th className="text-left py-2 text-slate-500">계열사</th>
                <th className="text-right py-2 text-slate-500">종합</th>
                <th className="text-right py-2 text-slate-500">KPI</th>
                <th className="text-right py-2 text-slate-500">AI활용</th>
                <th className="text-right py-2 text-slate-500">품질</th>
                <th className="text-right py-2 text-slate-500">속도</th>
                <th className="text-right py-2 text-slate-500">AI호출</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr key={r.company_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 font-bold text-slate-400">{r.rank}</td>
                  <td className="py-2">
                    <span className="text-slate-200 font-medium">{r.company_name}</span>
                    <span className="text-slate-600 ml-1 text-[10px]">{r.industry}</span>
                  </td>
                  <td className="py-2 text-right font-bold" style={{
                    color: TROPHY_COLORS[r.trophy as keyof typeof TROPHY_COLORS] || '#94a3b8'
                  }}>{r.total_score}</td>
                  <td className="py-2 text-right text-slate-400">{r.breakdown.kpi_achievement}</td>
                  <td className="py-2 text-right text-slate-400">{r.breakdown.ai_usage}</td>
                  <td className="py-2 text-right text-slate-400">{r.breakdown.ai_quality}</td>
                  <td className="py-2 text-right text-slate-400">{r.breakdown.response_speed}</td>
                  <td className="py-2 text-right text-slate-500">{r.ai_calls_30d}</td>
                </tr>
              ))}
              {rankings.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-600">
                  활성 계열사가 없습니다. 계열사를 생성하세요.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
