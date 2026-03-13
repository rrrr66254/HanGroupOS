import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore, useAppStore, useGroupStore } from './store/useStore'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import OllamaSetupNotice from './components/OllamaSetupNotice'
import { startHealthPoller } from './components/ProviderStatusBanner'
import { groupSettingsApi } from './api/client'
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
import AuditLog from './pages/AuditLog'
import VideoStudio from './pages/VideoStudio'
import VideoJobs from './pages/VideoJobs'
import DocGenerator from './pages/DocGenerator'
import DataAnalytics from './pages/DataAnalytics'
import InsightsDashboard from './pages/InsightsDashboard'
import Competitors from './pages/Competitors'
import AgentPerformance from './pages/AgentPerformance'
import CostAnalytics from './pages/CostAnalytics'
import DelegationChain from './pages/DelegationChain'
import KpiScoreboard from './pages/KpiScoreboard'
import AgentPersonalityPage from './pages/AgentPersonalityPage'
import DataFeedsPage from './pages/DataFeedsPage'
import WebhookSettings from './pages/WebhookSettings'
import SynergyMatch from './pages/SynergyMatch'
import DashboardCustomize from './pages/DashboardCustomize'
import AiFeedbackPage from './pages/AiFeedbackPage'
import WorkflowBuilder from './pages/WorkflowBuilder'
import FinancialStatements from './pages/FinancialStatements'
import Permissions from './pages/Permissions'

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
  const setGroupConfig = useGroupStore((s) => s.setConfig)
  useEffect(() => { if (token) startHealthPoller() }, [token])
  useEffect(() => {
    if (token) {
      groupSettingsApi.get().then((r) => setGroupConfig(r.data)).catch(() => {})
    }
  }, [token])
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  return (
    <ErrorBoundary>
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
          <Route path="meetings" element={<Navigate to="/live-office" replace />} />
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
          <Route path="audit" element={<AuditLog />} />
          <Route path="video-studio" element={<VideoStudio />} />
          <Route path="video-jobs" element={<VideoJobs />} />
          <Route path="doc-generator" element={<DocGenerator />} />
          <Route path="data-analytics" element={<DataAnalytics />} />
          <Route path="insights" element={<InsightsDashboard />} />
          <Route path="competitors" element={<Competitors />} />
          <Route path="agent-performance" element={<AgentPerformance />} />
          <Route path="cost-analytics" element={<CostAnalytics />} />
          <Route path="delegation" element={<DelegationChain />} />
          <Route path="kpi-scoreboard" element={<KpiScoreboard />} />
          <Route path="agent-personality" element={<AgentPersonalityPage />} />
          <Route path="data-feeds" element={<DataFeedsPage />} />
          <Route path="webhook-settings" element={<WebhookSettings />} />
          <Route path="synergy-match" element={<SynergyMatch />} />
          <Route path="dashboard-customize" element={<DashboardCustomize />} />
          <Route path="ai-feedback" element={<AiFeedbackPage />} />
          <Route path="workflow-builder" element={<WorkflowBuilder />} />
          <Route path="financial" element={<FinancialStatements />} />
          <Route path="permissions" element={<Permissions />} />
        </Route>
        <Route path="*" element={<Navigate to="/group-home" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
