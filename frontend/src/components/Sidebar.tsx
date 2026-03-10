import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Building2, CheckSquare,
  TrendingUp, Map, FlaskConical, Monitor,
  Brain, Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Zap, Home, Bell, FileText, Globe, Star, GitMerge, BarChart2, UserCheck,
  Terminal, Gamepad2, Shield, Briefcase, Users, Film,
} from 'lucide-react'
import { useAppStore } from '../store/useStore'
import { approvalsApi, terminalApi } from '../api/client'

// Badge metadata: which items get which badge count
const ITEM_BADGES: Record<string, 'approvals' | 'terminals'> = {
  '/approvals': 'approvals',
  '/terminal': 'terminals',
}

const NAV_GROUPS = [
  {
    id: 'management',
    label: '경영',
    icon: Briefcase,
    badge: 'approvals' as const,
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
    badge: null,
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
    badge: null,
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
    badge: null,
    items: [
      { to: '/weekly-report', icon: FileText, label: '주간보고서' },
      { to: '/ir-report', icon: BarChart2, label: 'IR 보고서' },
      { to: '/site-builder', icon: Globe, label: '웹사이트' },
      { to: '/site-evaluator', icon: Star, label: '사이트평가' },
      { to: '/game', icon: Gamepad2, label: '게임 플랫폼' },
      { to: '/video-studio', icon: Film, label: '영상 스튜디오' },
    ],
  },
  {
    id: 'system',
    label: '시스템',
    icon: Settings,
    badge: 'terminals' as const,
    items: [
      { to: '/terminal', icon: Terminal, label: '터미널' },
      { to: '/audit', icon: Shield, label: '감사 로그' },
      { to: '/admin', icon: Settings, label: '관리자' },
    ],
  },
]

const TOP_ITEMS = [
  { to: '/group-home', icon: Home, label: '그룹 홈', highlight: true },
  { to: '/chairman', icon: MessageSquare, label: 'AI 회장' },
]

function Badge({ count, color = 'red' }: { count: number; color?: 'red' | 'orange' | 'yellow' }) {
  if (count === 0) return null
  const styles = {
    red:    { background: 'rgba(239,68,68,0.15)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' },
    orange: { background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.35)' },
    yellow: { background: 'rgba(250,204,21,0.15)', color: '#fbbf24', border: '1px solid rgba(250,204,21,0.35)' },
  }
  return (
    <span
      className="px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0"
      style={styles[color]}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function Sidebar() {
  const {
    sidebarOpen, toggleSidebar, newEventCount,
    pendingApprovals, pendingTerminals,
    setPendingApprovals, setPendingTerminals,
    badgeTick,
  } = useAppStore()
  const [approvalsByType, setApprovalsByType] = useState<Record<string, number>>({})
  const [logoError, setLogoError] = useState(false)
  const location = useLocation()

  // Poll pending counts every 30 seconds; also refreshes when badgeTick changes
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [approvals, terminals, counts] = await Promise.allSettled([
          approvalsApi.list('pending'),
          terminalApi.list('pending'),
          approvalsApi.counts(),
        ])
        if (approvals.status === 'fulfilled') {
          setPendingApprovals(approvals.value.data?.length ?? 0)
        }
        if (terminals.status === 'fulfilled') {
          setPendingTerminals(terminals.value.data?.length ?? 0)
        }
        if (counts.status === 'fulfilled') {
          setApprovalsByType(counts.value.data?.by_type ?? {})
        }
      } catch { /* silent */ }
    }
    fetchCounts()
    const iv = setInterval(fetchCounts, 30_000)
    return () => clearInterval(iv)
  }, [badgeTick])

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

  const getBadgeCount = (badgeKey: 'approvals' | 'terminals' | null) => {
    if (badgeKey === 'approvals') return pendingApprovals
    if (badgeKey === 'terminals') return pendingTerminals
    return 0
  }

  const getItemBadge = (to: string) => {
    const key = ITEM_BADGES[to]
    if (!key) return 0
    return getBadgeCount(key)
  }

  const NavItem = ({
    to, icon: Icon, label, highlight,
  }: { to: string; icon: React.ElementType; label: string; highlight?: boolean }) => {
    const showHomeBadge = to === '/group-home' && newEventCount > 0
    const itemBadge = getItemBadge(to)

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
              {/* Icon-mode badges */}
              {!sidebarOpen && showHomeBadge && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold bg-red-500 text-white">
                  {newEventCount > 9 ? '9+' : newEventCount}
                </span>
              )}
              {!sidebarOpen && itemBadge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold bg-orange-500 text-white">
                  {itemBadge > 9 ? '9+' : itemBadge}
                </span>
              )}
            </div>
            {sidebarOpen && (
              <span className="truncate animate-fade-in flex-1">{label}</span>
            )}
            {sidebarOpen && showHomeBadge && (
              <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Bell size={8} />{newEventCount}
              </span>
            )}
            {sidebarOpen && itemBadge > 0 && (
              <Badge count={itemBadge} color="orange" />
            )}
            {!sidebarOpen && (
              <div className="absolute left-full ml-3 px-2 py-1 bg-bg-elevated border border-bg-border rounded-md text-xs text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {label}{showHomeBadge ? ` (${newEventCount})` : ''}{itemBadge > 0 ? ` · ${itemBadge}건` : ''}
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
              <img src="/logo.png" alt="HAN Group" className="w-8 h-8 object-contain" onError={() => setLogoError(true)} />
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
          const groupBadge = getBadgeCount(group.badge)

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
                  {groupBadge > 0 && <Badge count={groupBadge} color="orange" />}
                  {hasActive && !isOpen && groupBadge === 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-light flex-shrink-0" />
                  )}
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                /* Collapsed: icon only + badge dot, hover shows sub-sidebar */
                <div
                  className="relative"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    showSubmenu(group.id, rect.top)
                  }}
                  onMouseLeave={hideSubmenu}
                >
                  <button
                    className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors relative ${
                      hasActive ? 'text-brand-light bg-brand/10' : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
                    }`}
                  >
                    <GroupIcon size={16} />
                    {groupBadge > 0 && (
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold bg-orange-500 text-white">
                        {groupBadge > 9 ? '9+' : groupBadge}
                      </span>
                    )}
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
            style={{ position: 'fixed', left: 64, top: submenuTop, zIndex: 9999 }}
            onMouseEnter={keepSubmenu}
            onMouseLeave={hideSubmenu}
            className="bg-bg-card border border-bg-border rounded-r-xl shadow-2xl py-2 min-w-[180px]"
          >
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-bg-border mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                {group.label}
              </span>
              {getBadgeCount(group.badge) > 0 && (
                <Badge count={getBadgeCount(group.badge)} color="orange" />
              )}
            </div>
            {group.items.map((item) => {
              const ItemIcon = item.icon
              const isActive = location.pathname.startsWith(item.to)
              const badge = getItemBadge(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setHoveredGroup(null)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    isActive ? 'text-brand-light bg-brand/10' : 'text-slate-400 hover:text-slate-200 hover:bg-bg-elevated'
                  }`}
                >
                  <ItemIcon size={14} />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && <Badge count={badge} color="orange" />}
                </NavLink>
              )
            })}
            {/* Approval type breakdown for management group */}
            {group.id === 'management' && Object.keys(approvalsByType).length > 0 && (
              <div className="mx-3 mt-1 pt-1 border-t border-bg-border space-y-0.5">
                {Object.entries(approvalsByType).map(([type, cnt]) => (
                  <div key={type} className="flex items-center justify-between text-[10px] text-slate-600 px-0.5">
                    <span className="truncate">{type}</span>
                    <span className="text-amber-500 font-medium ml-2">{cnt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </aside>
  )
}
