import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import ErrorBoundary from './ErrorBoundary'
import NotificationPoller from './NotificationPoller'
import PullWatcher from './PullWatcher'
import Toast from './Toast'
import { useAppStore } from '../store/useStore'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      <NotificationPoller />
      <PullWatcher />
      <Toast />

      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar />

      {/* Desktop: margin based on sidebar width. Mobile: no margin (sidebar is overlay) */}
      <div
        className="flex flex-col flex-1 min-w-0 transition-all duration-200 md:ml-0"
        style={{}}
      >
        {/* Hidden spacer for desktop sidebar */}
        <style>{`
          @media (min-width: 768px) {
            .main-content-area { margin-left: ${sidebarOpen ? 240 : 64}px; }
          }
          @media (max-width: 767px) {
            .main-content-area { margin-left: 0; }
          }
        `}</style>
        <div className="main-content-area flex flex-col flex-1 min-w-0 transition-all duration-200">
          <Header />
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  )
}
