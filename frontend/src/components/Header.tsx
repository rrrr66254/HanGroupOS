import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, User, Bell, Sun, Moon } from 'lucide-react'
import { useAuthStore, useAppStore } from '../store/useStore'
import ProviderStatusBanner from './ProviderStatusBanner'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '대시보드',
  '/chairman': 'AI 회장 채팅',
  '/companies': '계열사 관리',
  '/approvals': '승인함',
  '/meetings': '회의실',
  '/market': '시장 분석',
  '/strategy': '전략 맵',
  '/simulation': '시뮬레이션',
  '/live-office': 'AI 라이브 오피스',
  '/memory': '기업 기억',
  '/admin': '관리자',
}

export default function Header() {
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useAppStore()
  const navigate = useNavigate()

  const title = PAGE_TITLES[pathname] || 'HAN Group OS'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-bg-card border-b border-bg-border flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-slate-100">{title}</h1>
        <p className="text-xs text-slate-500 font-mono">HAN Group OS v27</p>
      </div>

      <div className="flex items-center gap-3">
        <ProviderStatusBanner />
        <div className="h-4 w-px bg-bg-border" />
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors"
          title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors">
          <Bell size={16} />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-bg-border">
          <div className="w-8 h-8 bg-brand/20 rounded-full flex items-center justify-center">
            <User size={14} className="text-brand-light" />
          </div>
          {user && (
            <div className="hidden sm:block">
              <div className="text-xs font-medium text-slate-200">{user.username}</div>
              <div className="text-[10px] text-slate-500">{user.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="ml-2 p-1.5 rounded-lg text-slate-500 hover:text-danger hover:bg-danger/10 transition-colors"
            title="로그아웃"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
