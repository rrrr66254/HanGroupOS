import { useState, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Building2, CheckSquare,
  TrendingUp, Map, FlaskConical, Monitor,
  Brain, Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Zap, Home, Bell, FileText, Globe, Star, GitMerge, BarChart2, UserCheck,
  Terminal, Gamepad2, Shield, Briefcase, Users,
} from 'lucide-react'
import { useAppStore } from '../store/useStore'

const TOP_ITEMS = [
  { to: '/group-home', icon: Home, label: '그룹 홈', highlight: true },
  { to: '/chairman', icon: MessageSquare, label: 'AI 회장' },
]

const NAV_GROUPS = [
  {
    id: 'management',
    label: '경영',
    icon: Briefcase,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
      { to: '/companies', icon: Building2, label: '계열사' },
      { to: '/approvals', icon: CheckSquare, label: '승인함' },
    ],
  },
  {
    id: 'strategy',
    label: '분석/전략',
    icon: TrendingUp,
    items: [
      { to: '/market', icon: TrendingUp, label: '시장분석' },
      { to: '/strategy', icon: Map, label: '전략맵' },
      { to: '/synergy', icon: GitMerge, label: '시너지분석' },
      { to: '/simulation', icon: FlaskConical, label: '시뮬레이션' },
    ],
  },
  {
    id: 'org',
    label: '조직/AI',
    icon: Users,
    items: [
      { to: '/live-office', icon: Monitor, label: 'AI 오피스' },
      { to: '/memory', icon: Brain, label: '기업기억' },
      { to: '/talent-match', icon: UserCheck, label: '인재추천' },
    ],
  },
  {
    id: 'content',
    label: '보고/콘텐츠',
    icon: FileText,
    items: [
      { to: '/weekly-report', icon: FileText, label: '주간보고서' },
      { to: '/ir-report', icon: BarChart2, label: 'IR 보고서' },
      { to: '/site-builder', icon: Globe, label: '웹사이트' },
      { to: '/site-evaluator', icon: Star, label: '사이트평가' },
      { to: '/game', icon: Gamepad2, label: '게임 플랫폼' },
    ],
  },
  {
    id: 'system',
    label: '시스템',
    icon: Settings,
    items: [
      { to: '/terminal', icon: Terminal, label: '터미널' },
      { to: '/audit', icon: Shield, label: '감사 로그' },
      { to: '/admin', icon: Settings, label: '관리자' },
    ],
  },
]

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, newEventCount } = useAppStore()
  const [logoError, setLogoError] = useState(false)
  const location = useLocation()

  // Open groups: auto-open the group that contains the active route
  const getInitialOpen = () => {
    const set = new Set<string>()
    for (const g of NAV_GROUPS) {
      if (g.items.some((item) => location.pathname.startsWith(item.to))) {
        set.add(g.id)
      }
    }
    return set
  }
  const [openGroups, setOpenGroups] = useState<Set<string>>(getInitialOpen)

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Hover sub-sidebar for collapsed mode
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)
  const [submenuTop, setSubmenuTop] = useState(0)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSubmenu = (groupId: string, top: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setHoveredGroup(groupId)
    setSubmenuTop(top)
  }

  const hideSubmenu = () => {
    hoverTimeoutRef.current = setTimeout(() => setHoveredGroup(null), 80)
  }

  const keepSubmenu = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
  }

  const NavItem = ({ to, icon: Icon, label, highlight }: { to: string; icon: React.ElementType; label: string; highlight?: boolean }) => {
    const showBadge = to === '/group-home' && newEventCount > 0
    return (
      <NavLink
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
            <div className="relative flex-shrink-0">
              <Icon size={18} className={isActive ? 'text-brand-light' : highlight ? 'text-accent' : ''} />
              {showBadge && !sidebarOpen && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  {newEventCount > 9 ? '9+' : newEventCount}
                </span>
              )}
            </div>
            {sidebarOpen && (
              <span className="truncate animate-fade-in flex-1">{label}</span>
            )}
            {sidebarOpen && showBadge && (
              <span
                className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <Bell size={8} />{newEventCount}
              </span>
            )}
            {!sidebarOpen && (
              <div className="absolute left-full ml-3 px-2 py-1 bg-bg-elevated border border-bg-border rounded-md text-xs text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {label}{showBadge ? ` (${newEventCount})` : ''}
              </div>
            )}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <aside
      className="fixed top-0 left-0 h-full bg-bg-card border-r border-bg-border flex flex-col z-40 transition-all duration-200"
      style={{ width: sidebarOpen ? 240 : 64 }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-bg-border">
        <div className="flex items-center gap-3 overflow-hidden">
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
        {/* Top standalone items */}
        {TOP_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {/* Divider */}
        <div className="my-2 border-t border-bg-border opacity-40" />

        {/* Groups */}
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups.has(group.id)
          const hasActive = group.items.some((item) => location.pathname.startsWith(item.to))
          const GroupIcon = group.icon

          return (
            <div key={group.id}>
              {sidebarOpen ? (
                /* Expanded: clickable group header */
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-slate-500 hover:text-slate-300 hover:bg-bg-elevated"
                >
                  <GroupIcon size={15} className={hasActive ? 'text-brand-light' : ''} />
                  <span className="flex-1 text-left animate-fade-in uppercase tracking-wider">
                    {group.label}
                  </span>
                  {hasActive && !isOpen && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-light flex-shrink-0" />
                  )}
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                /* Collapsed: icon only, hover shows sub-sidebar */
                <div
                  className="relative"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    showSubmenu(group.id, rect.top)
                  }}
                  onMouseLeave={hideSubmenu}
                >
                  <button
                    className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                      hasActive ? 'text-brand-light bg-brand/10' : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
                    }`}
                  >
                    <GroupIcon size={16} />
                  </button>
                </div>
              )}

              {/* Group items (only shown when expanded) */}
              {sidebarOpen && isOpen && (
                <div className="ml-2 pl-3 border-l border-bg-border space-y-0.5 mt-0.5 mb-1">
                  {group.items.map((item) => (
                    <NavItem key={item.to} {...item} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
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

      {/* Floating sub-sidebar for collapsed mode */}
      {!sidebarOpen && hoveredGroup && (() => {
        const group = NAV_GROUPS.find((g) => g.id === hoveredGroup)
        if (!group) return null
        return (
          <div
            style={{
              position: 'fixed',
              left: 64,
              top: submenuTop,
              zIndex: 9999,
            }}
            onMouseEnter={keepSubmenu}
            onMouseLeave={hideSubmenu}
            className="bg-bg-card border border-bg-border rounded-r-xl shadow-2xl py-2 min-w-[180px]"
          >
            <div className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold border-b border-bg-border mb-1">
              {group.label}
            </div>
            {group.items.map((item) => {
              const ItemIcon = item.icon
              const isActive = location.pathname.startsWith(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setHoveredGroup(null)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'text-brand-light bg-brand/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-bg-elevated'
                  }`}
                >
                  <ItemIcon size={14} />
                  {item.label}
                </NavLink>
              )
            })}
          </div>
        )
      })()}
    </aside>
  )
}
