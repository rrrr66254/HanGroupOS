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

interface AppState {
  selectedCompany: Company | null
  sidebarOpen: boolean
  newEventCount: number
  pendingApprovals: number
  pendingTerminals: number
  theme: 'dark' | 'light'
  setSelectedCompany: (company: Company | null) => void
  toggleSidebar: () => void
  setNewEventCount: (n: number) => void
  clearNewEvents: () => void
  setPendingApprovals: (n: number) => void
  setPendingTerminals: (n: number) => void
  toggleTheme: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCompany: null,
  sidebarOpen: true,
  newEventCount: 0,
  pendingApprovals: 0,
  pendingTerminals: 0,
  theme: (localStorage.getItem('han-theme') as 'dark' | 'light') ?? 'dark',
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setNewEventCount: (n) => set({ newEventCount: n }),
  clearNewEvents: () => set({ newEventCount: 0 }),
  setPendingApprovals: (n) => set({ pendingApprovals: n }),
  setPendingTerminals: (n) => set({ pendingTerminals: n }),
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('han-theme', next)
    return { theme: next }
  }),
}))
