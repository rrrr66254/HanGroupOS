import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import NotificationPoller from './NotificationPoller'
import PullWatcher from './PullWatcher'
import Toast from './Toast'
import { useAppStore } from '../store/useStore'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      <NotificationPoller />
      <PullWatcher />
      <Toast />
      <Sidebar />
      <div
        className="flex flex-col flex-1 min-w-0 transition-all duration-200"
        style={{ marginLeft: sidebarOpen ? 240 : 64 }}
      >
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
