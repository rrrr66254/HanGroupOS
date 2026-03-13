/**
 * NotificationCenter — 실시간 알림 벨 + 히스토리 드로어
 * Header의 Bell 버튼 클릭 시 슬라이드 드로어로 알림 목록 표시
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, Check, CheckCheck, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { notificationsApi } from '../api/client'
import { useAppStore, useAuthStore } from '../store/useStore'

interface Notification {
  id: number
  title: string
  body: string
  notif_type: string
  icon: string
  company_id: number | null
  link: string
  is_read: boolean
  meta: Record<string, unknown>
  created_at: string
}

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  approval: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  video: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  work: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  form: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const panelRef = useRef<HTMLDivElement>(null)
  const newEventCount = useAppStore((s) => s.newEventCount)
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const wsRef = useRef<WebSocket | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await notificationsApi.list(filter === 'unread')
      setNotifications(res.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [token, filter])

  // WebSocket 실시간 업데이트
  useEffect(() => {
    if (!token || !open) return

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${window.location.host}/ws/notifications?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = () => {
      // 새 알림이 오면 목록 갱신
      fetchNotifications()
    }
    ws.onerror = () => ws.close()

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [token, open, fetchNotifications])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, filter, fetchNotifications])

  // 바깥 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markRead = async (id: number) => {
    await notificationsApi.markRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    useAppStore.getState().setNewEventCount(Math.max(0, newEventCount - 1))
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    useAppStore.getState().setNewEventCount(0)
  }

  const deleteNotif = async (id: number) => {
    await notificationsApi.delete(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id)
    if (n.link) {
      navigate(n.link)
      setOpen(false)
    }
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    return `${Math.floor(hours / 24)}일 전`
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors"
      >
        <Bell size={16} />
        {newEventCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {newEventCount > 99 ? '99+' : newEventCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="absolute right-0 top-12 w-[400px] max-h-[70vh] bg-bg-card border border-bg-border rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-brand-light" />
              <span className="text-sm font-semibold text-slate-100">알림 센터</span>
              {newEventCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/30">
                  {newEventCount}건
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={markAllRead}
                className="p-1.5 rounded-md text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="모두 읽음"
              >
                <CheckCheck size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex px-4 pt-2 gap-1">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-brand/15 text-brand-light'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
                }`}
              >
                {f === 'all' ? '전체' : '미읽음'}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                {filter === 'unread' ? '미읽음 알림이 없습니다' : '알림이 없습니다'}
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
                    n.is_read
                      ? 'hover:bg-bg-elevated'
                      : 'bg-brand/5 hover:bg-brand/10 border-l-2 border-brand'
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{n.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${n.is_read ? 'text-slate-300' : 'text-slate-100'}`}>
                          {n.title}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${TYPE_COLORS[n.notif_type] || TYPE_COLORS.info}`}>
                          {n.notif_type}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-600">{timeAgo(n.created_at)}</span>
                        {n.link && (
                          <ExternalLink size={10} className="text-slate-600" />
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {!n.is_read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                          className="p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          title="읽음 처리"
                        >
                          <Check size={11} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotif(n.id) }}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        title="삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
