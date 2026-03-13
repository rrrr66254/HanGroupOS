import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Users, CheckSquare, Brain, FlaskConical,
  Map, TrendingUp, MessageSquare, ArrowRight, Zap, Activity,
  Cpu, Thermometer, AlertTriangle, X, RefreshCw, Radio,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { dashboardApi, approvalsApi, companiesApi, healthApi, videoApi } from '../api/client'
import { useGroupStore, useAuthStore } from '../store/useStore'
import { useT } from '../i18n'
import type { DashboardStats, ApprovalRequest, Company } from '../types'

interface GpuStatus {
  name?: string; total_mb?: number; used_mb?: number; free_mb?: number
  temp_c?: number; util_pct?: number; vram_pct?: number; vram_warning?: boolean
  gpu_locked?: boolean; ollama_loaded_model?: string
}

interface GpuPoint { t: string; used: number; total: number; pct: number; temp: number; util: number }
interface FallbackEvent { occurred_at: string; from_provider: string; to_provider: string; reason: string }

interface HealthScore {
  id: number
  name: string
  industry: string
  score: number
  health: 'good' | 'warning' | 'critical'
  avg_progress: number
  kpi_rate: number
  recent_data: number
  strategy_count: number
}

function StatCard({ icon: Icon, label, value, color, to }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  to: string
}) {
  return (
    <Link to={to} className="card p-4 flex items-center gap-4 hover:border-brand/30 hover:bg-bg-elevated transition-colors cursor-pointer">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-bold text-slate-100">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </Link>
  )
}

const HEALTH_CONFIG = {
  good: { label: '양호', color: 'text-success', bg: 'bg-success/15', bar: 'bg-success' },
  warning: { label: '주의', color: 'text-warning', bg: 'bg-warning/15', bar: 'bg-warning' },
  critical: { label: '위험', color: 'text-red-400', bg: 'bg-red-400/15', bar: 'bg-red-400' },
}

export default function Dashboard() {
  const groupName = useGroupStore((s) => s.config.group_name)
  const token = useAuthStore((s) => s.token)
  const t = useT()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [pending, setPending] = useState<ApprovalRequest[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [healthScores, setHealthScores] = useState<HealthScore[]>([])
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null)
  const [gpuHistory, setGpuHistory] = useState<GpuPoint[]>([])
  const [fallbackEvents, setFallbackEvents] = useState<FallbackEvent[]>([])
  const [dismissedFallbacks, setDismissedFallbacks] = useState<Set<string>>(new Set())
  const [wsEvents, setWsEvents] = useState<Array<{ type: string; title?: string; count?: number; ts: string }>>([])
  const [wsConnected, setWsConnected] = useState(false)
  const gpuPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const refreshData = () => {
    dashboardApi.stats().then((r) => setStats(r.data)).catch(() => {})
    approvalsApi.inbox().then((r) => setPending(r.data.slice(0, 5))).catch(() => {})
    companiesApi.list().then((r) => setCompanies(r.data.slice(0, 6))).catch(() => {})
    healthApi.scores().then((r) => setHealthScores(r.data.slice(0, 6))).catch(() => {})
  }

  useEffect(() => {
    refreshData()

    // WebSocket 실시간 알림 연결
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${window.location.host}/ws/notifications?token=${token || ''}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        setWsEvents((prev) => [{ ...data, ts: new Date().toISOString() }, ...prev].slice(0, 20))
        // 승인/알림 이벤트 시 자동 갱신
        if (data.type === 'notification' || data.type === 'unread_count') {
          refreshData()
        }
      } catch { /* ignore */ }
    }

    // GPU 상태 폴링 (5초)
    const fetchGpu = () => videoApi.gpuStatus().then((r) => setGpuStatus(r.data)).catch(() => {})
    fetchGpu()
    gpuPollRef.current = setInterval(fetchGpu, 5000)

    // GPU 이력 최초 로드 + 5분마다 갱신
    const fetchHistory = () =>
      videoApi.gpuHistory(24).then((r) => setGpuHistory(r.data)).catch(() => {})
    fetchHistory()
    const historyIv = setInterval(fetchHistory, 5 * 60 * 1000)

    // 폴백 이벤트 폴링 (30초)
    const fetchFallback = () =>
      videoApi.aiFallbackLog(10).then((r) => setFallbackEvents(r.data)).catch(() => {})
    fetchFallback()
    fallbackPollRef.current = setInterval(fetchFallback, 30000)

    return () => {
      if (gpuPollRef.current) clearInterval(gpuPollRef.current)
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current)
      clearInterval(historyIv)
      ws.close()
    }
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-brand/20 to-purple-500/10 border border-brand/20 rounded-xl p-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-brand-light" />
            <span className="text-xs text-brand-light font-medium">{groupName} OS v30</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={wsConnected
                ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
                : { background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}
            >
              <Radio size={8} />
              {wsConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">AI 기업 생태계에 오신 것을 환영합니다</h2>
          <p className="text-slate-400 text-sm mt-1">
            AI 회장·위원회와 대화하거나 AI 오피스를 확인하세요.
          </p>
        </div>
        <Link to="/chairman" className="btn-primary flex items-center gap-2 flex-shrink-0">
          <MessageSquare size={15} />
          AI 회장 대화
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Building2} label={t('dashboard.totalCompanies')} value={stats.total_companies} color="bg-brand/15 text-brand-light" to="/companies" />
          <StatCard icon={Users} label={t('dashboard.aiMembers')} value={stats.total_org_nodes} color="bg-accent/15 text-accent" to="/live-office" />
          <StatCard icon={CheckSquare} label={t('dashboard.pendingApprovals')} value={stats.pending_approvals} color="bg-warning/15 text-warning" to="/approvals" />
          <StatCard icon={Brain} label={t('dashboard.corporateMemory')} value={stats.total_memories} color="bg-purple-400/15 text-purple-400" to="/memory" />
          <StatCard icon={FlaskConical} label={t('dashboard.simulations')} value={stats.recent_simulations} color="bg-pink-400/15 text-pink-400" to="/simulation" />
          <StatCard icon={Map} label={t('dashboard.strategyItems')} value={stats.total_strategies} color="bg-success/15 text-success" to="/strategy" />
          <StatCard icon={Users} label={t('dashboard.openMeetings')} value={stats.open_meetings} color="bg-orange-400/15 text-orange-400" to="/meetings" />
          <StatCard icon={Building2} label={t('dashboard.activeCompanies')} value={stats.active_companies} color="bg-teal-400/15 text-teal-400" to="/companies" />
        </div>
      )}

      {/* GPU 미니 위젯 — nvidia-smi 감지 시만 표시 */}
      {gpuStatus && gpuStatus.name && (
        <div className={`card p-4 border ${gpuStatus.vram_warning ? 'border-red-500/30' : 'border-bg-border'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            {/* GPU 이름 + 상태 */}
            <div className="flex items-center gap-2 min-w-0">
              <Cpu size={14} className="text-purple-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-200 truncate">
                {gpuStatus.name?.replace('NVIDIA GeForce ', '')}
              </span>
              {gpuStatus.gpu_locked && (
                <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5 flex-shrink-0">
                  영상 생성 중
                </span>
              )}
              {gpuStatus.vram_warning && (
                <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 flex items-center gap-1 flex-shrink-0">
                  <AlertTriangle size={8} /> VRAM 부족
                </span>
              )}
            </div>

            {/* VRAM 바 */}
            {gpuStatus.total_mb && gpuStatus.total_mb > 0 && (
              <div className="flex items-center gap-2 flex-1 min-w-48">
                <span className="text-[10px] text-slate-500 flex-shrink-0">VRAM</span>
                <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      (gpuStatus.vram_pct ?? 0) >= 90 ? 'bg-red-500' :
                      (gpuStatus.vram_pct ?? 0) >= 65 ? 'bg-yellow-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.min(gpuStatus.vram_pct ?? 0, 100)}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono flex-shrink-0 ${
                  (gpuStatus.vram_pct ?? 0) >= 90 ? 'text-red-400' :
                  (gpuStatus.vram_pct ?? 0) >= 65 ? 'text-yellow-400' : 'text-slate-400'
                }`}>
                  {((gpuStatus.used_mb ?? 0) / 1024).toFixed(1)}/{Math.round((gpuStatus.total_mb ?? 0) / 1024)}GB
                </span>
              </div>
            )}

            {/* 온도 */}
            {gpuStatus.temp_c !== undefined && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-shrink-0">
                <Thermometer size={10} className={gpuStatus.temp_c > 80 ? 'text-red-400' : gpuStatus.temp_c > 65 ? 'text-yellow-400' : 'text-slate-500'} />
                {gpuStatus.temp_c}°C
              </div>
            )}

            {/* GPU 사용률 */}
            {gpuStatus.util_pct !== undefined && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-shrink-0">
                <Zap size={10} />
                {gpuStatus.util_pct}%
              </div>
            )}

            {/* Ollama 모델 */}
            {gpuStatus.ollama_loaded_model && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {gpuStatus.ollama_loaded_model.split(':')[0]}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CheckSquare size={15} className="text-warning" />
              승인 대기
            </h3>
            <Link to="/approvals" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">대기 중인 승인이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((a) => (
                <div key={a.id} className="bg-bg-elevated rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-200 truncate max-w-[200px]">{a.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{a.requester} · {a.request_type}</div>
                  </div>
                  <span className="badge-pending">{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Companies */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Building2 size={15} className="text-brand-light" />
              계열사 현황
            </h3>
            <Link to="/companies" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          {companies.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">계열사가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {companies.map((c) => (
                <div key={c.id} className="bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-slate-200">{c.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{c.industry}</div>
                  <span className={`badge mt-1 ${c.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Scorecard */}
      {healthScores.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity size={15} className="text-brand-light" />
              계열사 건강 스코어카드
            </h3>
            <Link to="/companies" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {healthScores.map((h) => {
              const cfg = HEALTH_CONFIG[h.health]
              return (
                <div key={h.id} className="flex items-center gap-3 bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="w-28 flex-shrink-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{h.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{h.industry}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden">
                        <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${h.score}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-200 w-8 text-right">{h.score}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-500">
                      <span>진척 {h.avg_progress}%</span>
                      <span>KPI {h.kpi_rate}%</span>
                      <span>데이터 {h.recent_data}건</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Provider 폴백 토스트 알림 */}
      {fallbackEvents.filter((e) => !dismissedFallbacks.has(e.occurred_at)).slice(0, 3).map((ev) => (
        <div key={ev.occurred_at} className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <Zap size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-300">
              AI Provider 자동 폴백
              <span className="ml-2 font-mono text-[10px] text-amber-500/70">
                {new Date(ev.occurred_at + 'Z').toLocaleTimeString('ko-KR')}
              </span>
            </div>
            <div className="text-[11px] text-amber-400/80 mt-0.5">
              <span className="font-mono bg-amber-500/15 px-1 rounded">{ev.from_provider}</span>
              {' → '}
              <span className="font-mono bg-emerald-500/15 text-emerald-400 px-1 rounded">{ev.to_provider}</span>
              {ev.reason && <span className="ml-2 text-slate-500">{ev.reason}</span>}
            </div>
          </div>
          <button onClick={() => setDismissedFallbacks((s) => new Set([...s, ev.occurred_at]))}
            className="text-slate-600 hover:text-slate-400 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      ))}

      {/* GPU 24h 이력 차트 */}
      {gpuHistory.length > 1 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Cpu size={14} className="text-purple-400" />
              GPU VRAM 사용 이력 (24h)
              {gpuStatus?.name && (
                <span className="text-[10px] text-slate-500 font-normal">
                  — {gpuStatus.name.replace('NVIDIA GeForce ', '')}
                </span>
              )}
            </h3>
            <button onClick={() => videoApi.gpuHistory(24).then((r) => setGpuHistory(r.data)).catch(() => {})}
              className="text-slate-600 hover:text-slate-400">
              <RefreshCw size={12} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={gpuHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => new Date(v + 'Z').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                tick={{ fontSize: 9, fill: '#475569' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: '#475569' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
                labelFormatter={(v) => new Date(String(v) + 'Z').toLocaleTimeString('ko-KR')}
                formatter={(val: number, name: string) =>
                  name === 'pct' ? [`${val.toFixed(1)}%`, 'VRAM'] :
                  name === 'temp' ? [`${val}°C`, '온도'] :
                  [`${val}%`, 'GPU']
                }
              />
              <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={65} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.4} />
              <Line type="monotone" dataKey="pct" stroke="#a855f7" strokeWidth={1.5}
                dot={false} name="pct" />
              <Line type="monotone" dataKey="temp" stroke="#64748b" strokeWidth={1}
                dot={false} name="temp" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1 text-[9px] text-slate-600 justify-end">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block rounded" />VRAM %</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block rounded border-dashed" />온도</span>
            <span className="flex items-center gap-1"><span className="w-3 h-px bg-red-500 inline-block" />90% 경고</span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">빠른 실행</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/chairman', icon: MessageSquare, label: 'AI 회장 채팅', color: 'text-accent' },
            { to: '/market', icon: TrendingUp, label: '시장 분석', color: 'text-success' },
            { to: '/simulation', icon: FlaskConical, label: '시뮬레이션', color: 'text-pink-400' },
            { to: '/live-office', icon: Users, label: 'AI 오피스', color: 'text-brand-light' },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link
              key={to}
              to={to}
              className="bg-bg-elevated hover:bg-bg-border rounded-lg px-4 py-3 flex items-center gap-3 transition-colors group"
            >
              <Icon size={16} className={`${color} group-hover:scale-110 transition-transform`} />
              <span className="text-xs text-slate-300">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
