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
  setSelectedCompany: (company: Company | null) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCompany: null,
  sidebarOpen: true,
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
