import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Company } from '../types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'han-auth' }
  )
)

// ── Group Settings Store ─────────────────────────────────────────────────────
export interface GroupConfig {
  group_name: string
  group_name_ko: string
  slogan: string
  slogan_ko: string
}

interface GroupSettingsState {
  config: GroupConfig
  loaded: boolean
  setConfig: (c: GroupConfig) => void
}

export const useGroupStore = create<GroupSettingsState>()(
  persist(
    (set) => ({
      config: {
        group_name: 'Group',
        group_name_ko: '그룹',
        slogan: 'AI Corporate Operating System',
        slogan_ko: 'AI 기업 운영 시스템',
      },
      loaded: false,
      setConfig: (c) => set({ config: c, loaded: true }),
    }),
    { name: 'group-settings' }
  )
)

export interface AppToast {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  body?: string
  link?: string  // 클릭 시 navigate할 경로
}

interface AppState {
  selectedCompany: Company | null
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  newEventCount: number
  pendingApprovals: number
  pendingTerminals: number
  badgeTick: number
  theme: 'dark' | 'light'
  toasts: AppToast[]
  setSelectedCompany: (company: Company | null) => void
  toggleSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  setNewEventCount: (n: number) => void
  clearNewEvents: () => void
  setPendingApprovals: (n: number) => void
  setPendingTerminals: (n: number) => void
  triggerBadgeRefresh: () => void
  toggleTheme: () => void
  addToast: (t: Omit<AppToast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCompany: null,
  sidebarOpen: true,
  mobileSidebarOpen: false,
  newEventCount: 0,
  pendingApprovals: 0,
  pendingTerminals: 0,
  badgeTick: 0,
  theme: (localStorage.getItem('han-theme') as 'dark' | 'light') ?? 'dark',
  toasts: [],
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setNewEventCount: (n) => set({ newEventCount: n }),
  clearNewEvents: () => set({ newEventCount: 0 }),
  setPendingApprovals: (n) => set({ pendingApprovals: n }),
  setPendingTerminals: (n) => set({ pendingTerminals: n }),
  triggerBadgeRefresh: () => set((s) => ({ badgeTick: s.badgeTick + 1 })),
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('han-theme', next)
    return { theme: next }
  }),
  addToast: (t) => set((s) => ({
    toasts: [...s.toasts, { ...t, id: `${Date.now()}-${Math.random()}` }],
  })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
