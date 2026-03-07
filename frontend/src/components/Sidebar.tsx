import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Building2, CheckSquare,
  Users, TrendingUp, Map, FlaskConical, Monitor,
  Brain, Settings, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react'
import { useAppStore } from '../store/useStore'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/chairman', icon: MessageSquare, label: 'AI 회장', highlight: true },
  { to: '/companies', icon: Building2, label: '계열사' },
  { to: '/approvals', icon: CheckSquare, label: '승인함' },
  { to: '/meetings', icon: Users, label: '회의실' },
  { to: '/market', icon: TrendingUp, label: '시장분석' },
  { to: '/strategy', icon: Map, label: '전략맵' },
  { to: '/simulation', icon: FlaskConical, label: '시뮬레이션' },
  { to: '/live-office', icon: Monitor, label: 'AI 오피스' },
  { to: '/memory', icon: Brain, label: '기업기억' },
  { to: '/admin', icon: Settings, label: '관리자' },
]

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore()
  const [logoError, setLogoError] = useState(false)

  return (
    <aside
      className="fixed top-0 left-0 h-full bg-bg-card border-r border-bg-border flex flex-col z-40 transition-all duration-200"
      style={{ width: sidebarOpen ? 240 : 64 }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-bg-border">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Logo image with Zap fallback */}
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            {!logoError ? (
              <img
                src="/logo.png"
                alt="HAN Group"
                className="w-8 h-8 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
            )}
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <div className="text-sm font-bold text-slate-100">HAN Group</div>
              <div className="text-[10px] text-slate-500 font-mono">OS v29</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, highlight }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative
              ${isActive
                ? 'bg-brand/15 text-brand-light'
                : highlight
                  ? 'text-accent hover:bg-accent/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-bg-elevated'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? 'text-brand-light' : highlight ? 'text-accent' : ''}`}
                />
                {sidebarOpen && (
                  <span className="truncate animate-fade-in">{label}</span>
                )}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-3 px-2 py-1 bg-bg-elevated border border-bg-border rounded-md text-xs text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Toggle */}
      <div className="p-2 border-t border-bg-border">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </aside>
  )
}
