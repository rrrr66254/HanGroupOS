import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, RefreshCw, BarChart2 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'
import { aiFeedbackApi } from '../api/client'

interface AgentFeedback {
  agent_name: string
  positive: number
  negative: number
  total: number
  satisfaction_rate: number
}

interface RecentFb {
  id: number
  message_id: number
  agent_name: string
  rating: number
  comment: string
  created_at: string
}

export default function AiFeedbackPage() {
  const [stats, setStats] = useState<{
    total: number; positive: number; negative: number; satisfaction_rate: number; by_agent: AgentFeedback[]
  } | null>(null)
  const [recent, setRecent] = useState<RecentFb[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([aiFeedbackApi.stats(), aiFeedbackApi.recent(30)])
      setStats(s.data)
      setRecent(r.data)
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <ThumbsUp size={20} className="text-emerald-400" /> AI 피드백 대시보드
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">AI 응답 좋아요/싫어요 분석 + 에이전트별 만족도</p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {stats && (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1">총 피드백</div>
              <div className="text-xl font-bold text-white">{stats.total}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><ThumbsUp size={11} /> 좋아요</div>
              <div className="text-xl font-bold text-emerald-400">{stats.positive}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><ThumbsDown size={11} /> 싫어요</div>
              <div className="text-xl font-bold text-red-400">{stats.negative}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1">만족도</div>
              <div className="text-xl font-bold text-indigo-400">{stats.satisfaction_rate}%</div>
            </div>
          </div>

          {/* 에이전트별 만족도 차트 */}
          {stats.by_agent.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <BarChart2 size={13} /> 에이전트별 만족도
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(180, stats.by_agent.length * 36)}>
                <BarChart data={stats.by_agent} layout="vertical"
                  margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }}
                    tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="agent_name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                    formatter={(v) => [`${v}%`, '만족도']} />
                  <Bar dataKey="satisfaction_rate" fill="#34d399" radius={[0, 4, 4, 0]} name="만족도" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* 최근 피드백 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">최근 피드백</h3>
        <div className="space-y-2">
          {recent.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50">
              <div className="flex items-center gap-3">
                {f.rating > 0
                  ? <ThumbsUp size={14} className="text-emerald-400" />
                  : <ThumbsDown size={14} className="text-red-400" />}
                <div>
                  <span className="text-xs text-slate-300">{f.agent_name || 'AI'}</span>
                  {f.comment && <span className="text-[10px] text-slate-500 ml-2">"{f.comment}"</span>}
                </div>
              </div>
              <span className="text-[10px] text-slate-600">
                {new Date(f.created_at).toLocaleString('ko-KR')}
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-600">피드백이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}
