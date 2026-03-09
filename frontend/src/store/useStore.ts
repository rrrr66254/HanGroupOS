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
  setSelectedCompany: (company: Company | null) => void
  toggleSidebar: () => void
  setNewEventCount: (n: number) => void
  clearNewEvents: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCompany: null,
  sidebarOpen: true,
  newEventCount: 0,
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setNewEventCount: (n) => set({ newEventCount: n }),
  clearNewEvents: () => set({ newEventCount: 0 }),
}))
