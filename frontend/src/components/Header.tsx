import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, User, Sun, Moon, Globe } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore, useAppStore, useGroupStore } from '../store/useStore'
import { useI18nStore, LOCALE_LABELS, type Locale } from '../i18n'
import ProviderStatusBanner from './ProviderStatusBanner'
import NotificationCenter from './NotificationCenter'

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
  '/agent-performance': 'AI 에이전트 성과',
  '/workflow-builder': 'AI 워크플로우 빌더',
  '/financial': '재무제표 관리',
  '/permissions': '권한 관리',
}

export default function Header() {
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useAppStore()
  const groupName = useGroupStore((s) => s.config.group_name)
  const navigate = useNavigate()
  const { locale, setLocale } = useI18nStore()
  const [langOpen, setLangOpen] = useState(false)

  const title = PAGE_TITLES[pathname] || `${groupName} OS`

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-bg-card border-b border-bg-border flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-slate-100">{title}</h1>
        <p className="text-xs text-slate-500 font-mono">{groupName} OS v30</p>
      </div>

      <div className="flex items-center gap-3">
        <ProviderStatusBanner />
        <div className="h-4 w-px bg-bg-border" />

        {/* 언어 선택 */}
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors flex items-center gap-1"
            title="언어 변경"
          >
            <Globe size={16} />
            <span className="text-[10px] font-mono">{locale.toUpperCase()}</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 top-10 bg-bg-card border border-bg-border rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
              {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLocale(l); setLangOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-elevated transition-colors ${
                    locale === l ? 'text-brand-light font-semibold' : 'text-slate-400'
                  }`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors"
          title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <NotificationCenter />

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
