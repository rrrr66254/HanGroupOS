import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore, useAppStore } from './store/useStore'
import Layout from './components/Layout'
import OllamaSetupNotice from './components/OllamaSetupNotice'
import { startHealthPoller } from './components/ProviderStatusBanner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chairman from './pages/Chairman'
import Companies from './pages/Companies'
import Approvals from './pages/Approvals'
import Meetings from './pages/Meetings'
import Market from './pages/Market'
import Strategy from './pages/Strategy'
import Simulation from './pages/Simulation'
import LiveOffice from './pages/LiveOffice'
import Memory from './pages/Memory'
import Admin from './pages/Admin'
import GroupHome from './pages/GroupHome'
import WeeklyReport from './pages/WeeklyReport'
import SiteBuilder from './pages/SiteBuilder'
import SiteEvaluator from './pages/SiteEvaluator'
import Synergy from './pages/Synergy'
import IRReport from './pages/IRReport'
import TalentMatch from './pages/TalentMatch'
import Terminal from './pages/Terminal'
import GameDashboard from './pages/GameDashboard'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      <OllamaSetupNotice />
    </>
  )
}

export default function App() {
  const theme = useAppStore((s) => s.theme)
  const token = useAuthStore((s) => s.token)
  useEffect(() => { if (token) startHealthPoller() }, [token])
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/group-home" replace />} />
          <Route path="group-home" element={<GroupHome />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chairman" element={<Chairman />} />
          <Route path="companies" element={<Companies />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="market" element={<Market />} />
          <Route path="strategy" element={<Strategy />} />
          <Route path="simulation" element={<Simulation />} />
          <Route path="live-office" element={<LiveOffice />} />
          <Route path="memory" element={<Memory />} />
          <Route path="admin" element={<Admin />} />
          <Route path="weekly-report" element={<WeeklyReport />} />
          <Route path="site-builder" element={<SiteBuilder />} />
          <Route path="site-evaluator" element={<SiteEvaluator />} />
          <Route path="synergy" element={<Synergy />} />
          <Route path="ir-report" element={<IRReport />} />
          <Route path="talent-match" element={<TalentMatch />} />
          <Route path="terminal" element={<Terminal />} />
          <Route path="game" element={<GameDashboard />} />
        </Route>
        <Route path="*" element={<Navigate to="/group-home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
