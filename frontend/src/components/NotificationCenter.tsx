/**
 * NotificationCenter — 실시간 알림 벨 + 알림 히스토리 드로어
 * Header의 Bell 아이콘 클릭 시 슬라이드 드로어로 알림 목록 표시
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, Check, CheckCheck, Trash2, ExternalLink, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
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

const TYPE_STYLES: Record<string, { bg: string; text: string; Icon: typeof Info }> = {
  info:     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   Icon: Info },
  success:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', Icon: CheckCircle },
  warning:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  Icon: AlertTriangle },
  error:    { bg: 'bg-red-500/10',    text: 'text-red-400',    Icon: XCircle },
  approval: { bg: 'bg-violet-500/10', text: 'text-violet-400', Icon: Check },
  video:    { bg: 'bg-pink-500/10',   text: 'text-pink-400',   Icon: Info },
  work:     { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   Icon: Info },
  form:     { bg: 'bg-orange-500/10', text: 'text-orange-400', Icon: Info },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const newEventCount = useAppStore((s) => s.newEventCount)
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, filter, fetchNotifications])

  // WebSocket for real-time updates when drawer is open
  useEffect(() => {
    if (!open || !token) return

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/notifications?token=${token}`)
    wsRef.current = ws

    ws.onmessage = () => {
      // Refetch on any notification event
      fetchNotifications()
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [open, token, fetchNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markRead = async (id: number) => {
    await notificationsApi.markRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
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

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <>
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

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setOpen(false)} />
      )}

      {/* Drawer Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[380px] max-w-full bg-bg-card border-l border-bg-border shadow-2xl z-50 transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-bg-border">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-brand-light" />
            <h2 className="text-sm font-semibold text-slate-100">알림 센터</h2>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="전체 읽음 처리"
              >
                <CheckCheck size={15} />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-bg-elevated transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-bg-border">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                filter === f
                  ? 'text-brand-light border-b-2 border-brand-light'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? '전체' : '읽지 않음'}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100vh - 96px)' }}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-brand-light/30 border-t-brand-light rounded-full animate-spin" />
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Bell size={32} className="mb-3 opacity-30" />
              <p className="text-sm">알림이 없습니다</p>
            </div>
          )}

          {!loading && notifications.map((n) => {
            const style = TYPE_STYLES[n.notif_type] || TYPE_STYLES.info
            const TypeIcon = style.Icon
            return (
              <div
                key={n.id}
                className={`group px-4 py-3 border-b border-bg-border/50 hover:bg-bg-elevated/50 transition-colors cursor-pointer ${
                  !n.is_read ? 'bg-brand/5' : ''
                }`}
                onClick={() => handleClick(n)}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`mt-0.5 p-1.5 rounded-lg ${style.bg} flex-shrink-0`}>
                    {n.icon && n.icon !== '🔔' ? (
                      <span className="text-sm">{n.icon}</span>
                    ) : (
                      <TypeIcon size={14} className={style.text} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-medium truncate ${!n.is_read ? 'text-slate-100' : 'text-slate-300'}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-light flex-shrink-0" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-600">{timeAgo(n.created_at)}</span>
                      {n.link && <ExternalLink size={9} className="text-slate-600" />}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                        className="p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        title="읽음 처리"
                      >
                        <Check size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotif(n.id) }}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
