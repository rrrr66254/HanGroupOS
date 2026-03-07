import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Users, CheckSquare, Brain, FlaskConical,
  Map, TrendingUp, MessageSquare, ArrowRight, Zap,
} from 'lucide-react'
import { dashboardApi, approvalsApi, companiesApi } from '../api/client'
import type { DashboardStats, ApprovalRequest, Company } from '../types'

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

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [pending, setPending] = useState<ApprovalRequest[]>([])
  const [companies, setCompanies] = useState<Company[]>([])

  useEffect(() => {
    dashboardApi.stats().then((r) => setStats(r.data))
    approvalsApi.inbox().then((r) => setPending(r.data.slice(0, 5)))
    companiesApi.list().then((r) => setCompanies(r.data.slice(0, 6)))
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-brand/20 to-purple-500/10 border border-brand/20 rounded-xl p-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-brand-light" />
            <span className="text-xs text-brand-light font-medium">HAN Group OS v27</span>
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
          <StatCard icon={Building2} label="전체 계열사" value={stats.total_companies} color="bg-brand/15 text-brand-light" to="/companies" />
          <StatCard icon={Users} label="AI 조직원" value={stats.total_org_nodes} color="bg-accent/15 text-accent" to="/live-office" />
          <StatCard icon={CheckSquare} label="승인 대기" value={stats.pending_approvals} color="bg-warning/15 text-warning" to="/approvals" />
          <StatCard icon={Brain} label="기업 기억" value={stats.total_memories} color="bg-purple-400/15 text-purple-400" to="/memory" />
          <StatCard icon={FlaskConical} label="시뮬레이션" value={stats.recent_simulations} color="bg-pink-400/15 text-pink-400" to="/simulation" />
          <StatCard icon={Map} label="전략 항목" value={stats.total_strategies} color="bg-success/15 text-success" to="/strategy" />
          <StatCard icon={Users} label="오픈 회의" value={stats.open_meetings} color="bg-orange-400/15 text-orange-400" to="/meetings" />
          <StatCard icon={Building2} label="활성 계열사" value={stats.active_companies} color="bg-teal-400/15 text-teal-400" to="/companies" />
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
