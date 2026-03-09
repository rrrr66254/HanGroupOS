import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, MessageSquare, BarChart2, Clock, Loader2,
  Zap, ChevronRight, ArrowRight, Trophy, RefreshCw,
  TrendingUp, Users, Star,
} from 'lucide-react'
import { chatApi, companiesApi } from '../api/client'
import { format } from 'date-fns'

interface TimelineEvent {
  type: string; icon: string; title: string; description: string; created_at: string
}
interface RecommendedAction {
  action: string; reason: string; priority: 'high' | 'medium' | 'low'
}
interface CompanyKPI {
  id: number; name: string; industry: string; ai_score: number; ai_messages: number
}

const PRIORITY_STYLE = {
  high:   { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)',    text: '#f87171', label: '긴급' },
  medium: { bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)',   text: '#fbbf24', label: '보통' },
  low:    { bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.2)',   text: '#94a3b8', label: '일반' },
}

const EVENT_COLOR: Record<string, string> = {
  company_created: 'rgba(16,185,129,0.15)',
  ceo_briefing:    'rgba(99,102,241,0.15)',
  directive:       'rgba(226,76,75,0.15)',
  strategy:        'rgba(245,158,11,0.15)',
}

export default function GroupHome() {
  const navigate = useNavigate()
  const [companyCount, setCompanyCount] = useState(0)
  const [kpiTop, setKpiTop] = useState<CompanyKPI[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [actions, setActions] = useState<RecommendedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [actionsLoading, setActionsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadAll = async () => {
    setRefreshing(true)
    try {
      const [companiesRes, timelineRes, kpiRes] = await Promise.all([
        companiesApi.list(),
        chatApi.timeline(8),
        chatApi.groupKpi(),
      ])
      setCompanyCount((companiesRes.data as any[]).length)
      setTimeline(timelineRes.data as TimelineEvent[])
      const kpiData = kpiRes.data as { companies: CompanyKPI[] }
      setKpiTop(kpiData.companies.slice(0, 4))
    } catch { /* ignore */ } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const loadActions = async () => {
    setActionsLoading(true)
    try {
      const res = await chatApi.recommendedActions()
      const data = res.data as { actions: RecommendedAction[] }
      setActions(data.actions)
    } catch { /* ignore */ } finally {
      setActionsLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    loadActions()
  }, [])

  const handleActionClick = (action: RecommendedAction) => {
    navigate('/chairman', { state: { prefillInput: action.action } })
  }

  const now = new Date()

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-6">
      {/* ── Welcome header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest mb-1">
            {format(now, 'yyyy년 MM월 dd일 (EEE)')}
          </div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>👔</span> 한그룹 회장실
          </h1>
          <p className="text-xs text-slate-500 mt-1">그룹 전체 현황을 한눈에 확인하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadAll(); loadActions() }}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-500 hover:text-slate-300 bg-bg-elevated border border-bg-border"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            onClick={() => navigate('/chairman')}
            className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
          >
            <MessageSquare size={12} />AI 회장과 대화
          </button>
        </div>
      </div>

      {/* ── KPI overview cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Building2, label: '활성 계열사', value: companyCount, color: '#34d399', sub: '그룹 전체', onClick: () => navigate('/companies') },
          { icon: Trophy,    label: '최상위 점수', value: kpiTop[0]?.ai_score ?? '—', color: '#fbbf24', sub: kpiTop[0]?.name ?? '데이터 없음', onClick: () => navigate('/chairman') },
          { icon: MessageSquare, label: 'AI 총 대화', value: kpiTop.reduce((s, c) => s + c.ai_messages, 0), color: '#818cf8', sub: '계열사 합산', onClick: () => navigate('/chairman') },
          { icon: TrendingUp, label: '금주 이벤트', value: timeline.length, color: '#fb923c', sub: '최근 활동 건수', onClick: () => navigate('/chairman') },
        ].map(({ icon: Icon, label, value, color, sub, onClick }) => (
          <div
            key={label}
            onClick={onClick}
            className="card p-4 cursor-pointer hover:border-brand/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                <Icon size={15} style={{ color }} />
              </div>
              <ChevronRight size={11} className="text-slate-700 group-hover:text-slate-500 transition-colors" />
            </div>
            {loading ? (
              <div className="h-7 w-16 bg-bg-elevated rounded animate-pulse" />
            ) : (
              <div className="text-2xl font-bold text-slate-100">{value}</div>
            )}
            <div className="text-xs font-medium text-slate-400 mt-1">{label}</div>
            <div className="text-[10px] text-slate-600 mt-0.5 truncate">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* ── AI 추천 액션 ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">오늘의 AI 추천 액션</span>
            </div>
            <button
              onClick={loadActions}
              disabled={actionsLoading}
              className="text-[9px] text-slate-600 hover:text-slate-400 flex items-center gap-1"
            >
              {actionsLoading ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
              재생성
            </button>
          </div>

          {actionsLoading && actions.length === 0 && (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-bg-elevated animate-pulse" />
              ))}
            </div>
          )}

          {!actionsLoading && actions.length === 0 && (
            <div className="text-center py-6 text-[11px] text-slate-600">
              AI 회장과 대화 후 추천 액션을 받아보세요
            </div>
          )}

          <div className="space-y-2">
            {actions.map((a, i) => {
              const style = PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.low
              return (
                <button
                  key={i}
                  onClick={() => handleActionClick(a)}
                  className="w-full text-left rounded-lg p-3 transition-all hover:brightness-110"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-slate-200">{a.action}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{a.reason}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ color: style.text, background: `${style.text}15` }}>
                        {style.label}
                      </span>
                      <ArrowRight size={10} className="text-slate-600" />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Activity feed ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-200">최근 그룹 활동</span>
            </div>
            <button
              onClick={() => navigate('/chairman')}
              className="text-[9px] text-slate-600 hover:text-brand-light flex items-center gap-1"
            >
              전체 보기 <ChevronRight size={9} />
            </button>
          </div>

          {loading && (
            <div className="space-y-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-10 rounded bg-bg-elevated animate-pulse" />
              ))}
            </div>
          )}

          <div className="space-y-0.5">
            {timeline.map((ev, i) => (
              <div key={i} className="flex gap-2.5 py-1.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: EVENT_COLOR[ev.type] ?? 'rgba(255,255,255,0.05)' }}
                >
                  {ev.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-300 truncate">{ev.title}</div>
                  <div className="text-[9px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                    <span className="truncate">{ev.description}</span>
                    <span className="flex-shrink-0 text-slate-700">·</span>
                    <span className="flex-shrink-0">{format(new Date(ev.created_at), 'MM/dd HH:mm')}</span>
                  </div>
                </div>
              </div>
            ))}
            {!loading && timeline.length === 0 && (
              <div className="text-center py-8 text-[11px] text-slate-600">아직 활동 기록이 없습니다</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Top KPI ranking strip ── */}
      {kpiTop.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">계열사 AI 활동 순위</span>
            </div>
            <button
              onClick={() => navigate('/chairman')}
              className="text-[9px] text-slate-600 hover:text-brand-light flex items-center gap-1"
            >
              KPI 상세 <ChevronRight size={9} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {kpiTop.map((c, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`
              const barColor = c.ai_score >= 80 ? '#34d399' : c.ai_score >= 50 ? '#60a5fa' : '#fbbf24'
              return (
                <div
                  key={c.id}
                  className="rounded-xl p-3 cursor-pointer hover:border-brand/30 transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onClick={() => navigate('/chairman')}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{medal}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{c.name}</div>
                      <div className="text-[9px] text-slate-600">{c.industry}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-bg-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.ai_score}%`, background: barColor }} />
                    </div>
                    <span className="text-[10px] font-bold flex-shrink-0" style={{ color: barColor }}>{c.ai_score}</span>
                  </div>
                  <div className="text-[9px] text-slate-700 mt-1.5 flex items-center gap-1">
                    <Users size={8} />{c.ai_messages}회 대화
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
