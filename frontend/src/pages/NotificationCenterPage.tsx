import { useState, useEffect, useCallback } from 'react'
import { subscribeWsEvent } from '../components/NotificationPoller'
import {
  Bell, Check, CheckCheck, Trash2, ExternalLink, Info, AlertTriangle,
  CheckCircle, XCircle, Filter, Settings, Search, RefreshCw,
} from 'lucide-react'
import { notificationsApi } from '../api/client'
import { useAppStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'

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

const TYPE_STYLES: Record<string, { bg: string; text: string; Icon: typeof Info; label: string }> = {
  info:     { bg: 'bg-blue-500/10',    text: 'text-blue-400',    Icon: Info,           label: '정보' },
  success:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', Icon: CheckCircle,    label: '성공' },
  warning:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   Icon: AlertTriangle,  label: '경고' },
  error:    { bg: 'bg-red-500/10',     text: 'text-red-400',     Icon: XCircle,        label: '오류' },
  approval: { bg: 'bg-violet-500/10',  text: 'text-violet-400',  Icon: Check,          label: '승인' },
  video:    { bg: 'bg-pink-500/10',    text: 'text-pink-400',    Icon: Info,           label: '영상' },
  work:     { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    Icon: Info,           label: '작업' },
  form:     { bg: 'bg-orange-500/10',  text: 'text-orange-400',  Icon: Info,           label: '폼' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}개월 전`
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return dateStr }
}

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const addToast = useAppStore((s) => s.addToast)
  const navigate = useNavigate()

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationsApi.list(readFilter === 'unread')
      setNotifications(res.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [readFilter])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // WebSocket 실시간 업데이트
  useEffect(() => {
    const unsub = subscribeWsEvent('unread_count', () => {
      fetchNotifications()
    })
    return () => unsub()
  }, [fetchNotifications])

  const markRead = async (id: number) => {
    await notificationsApi.markRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    addToast({ type: 'success', title: '전체 읽음 처리 완료' })
  }

  const deleteNotif = async (id: number) => {
    await notificationsApi.delete(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
  }

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      await notificationsApi.delete(id)
    }
    setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)))
    setSelectedIds(new Set())
    addToast({ type: 'success', title: `${ids.length}개 알림 삭제됨` })
  }

  const markSelectedRead = async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      await notificationsApi.markRead(id)
    }
    setNotifications((prev) => prev.map((n) => selectedIds.has(n.id) ? { ...n, is_read: true } : n))
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((n) => n.id)))
    }
  }

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  // 필터링
  const filtered = notifications.filter((n) => {
    if (readFilter === 'read' && !n.is_read) return false
    if (typeFilter !== 'all' && n.notif_type !== typeFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !n.body.toLowerCase().includes(q)) return false
    }
    return true
  })

  // 유형별 카운트
  const typeCounts = notifications.reduce<Record<string, number>>((acc, n) => {
    acc[n.notif_type] = (acc[n.notif_type] || 0) + 1
    return acc
  }, {})

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // 날짜별 그룹
  const grouped: Record<string, Notification[]> = {}
  for (const n of filtered) {
    const dateKey = new Date(n.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(n)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Bell size={22} className="text-brand-light" /> 알림 센터
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            전체 {notifications.length}개 · 읽지 않음 {unreadCount}개
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchNotifications} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated" title="새로고침">
            <RefreshCw size={14} />
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
              <CheckCheck size={13} /> 전체 읽음
            </button>
          )}
          <button onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated" title="알림 설정">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Read status tabs */}
        <div className="flex rounded-lg bg-bg-card border border-bg-border overflow-hidden">
          {([
            { key: 'all', label: '전체' },
            { key: 'unread', label: '읽지 않음' },
            { key: 'read', label: '읽음' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setReadFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                readFilter === key
                  ? 'bg-brand/15 text-brand-light'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-bg-elevated border border-bg-border rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">전체 유형</option>
            {Object.entries(TYPE_STYLES).map(([key, { label }]) => (
              <option key={key} value={key}>{label} ({typeCounts[key] || 0})</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full bg-bg-elevated border border-bg-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-brand"
            placeholder="알림 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-brand/5 border border-brand/20 rounded-lg">
          <span className="text-xs text-slate-300">{selectedIds.size}개 선택됨</span>
          <button onClick={markSelectedRead}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-emerald-400 hover:bg-emerald-500/10">
            <Check size={12} /> 읽음 처리
          </button>
          <button onClick={deleteSelected}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-400 hover:bg-red-500/10">
            <Trash2 size={12} /> 삭제
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">
            선택 해제
          </button>
        </div>
      )}

      {/* Type Stats */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeCounts).map(([type, count]) => {
          const style = TYPE_STYLES[type] || TYPE_STYLES.info
          const TypeIcon = style.Icon
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                typeFilter === type
                  ? `${style.bg} ${style.text} border-current`
                  : 'bg-bg-card border-bg-border text-slate-400 hover:text-slate-200'
              }`}
            >
              <TypeIcon size={12} />
              <span>{style.label}</span>
              <span className="font-bold">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Notifications by Date */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-light/30 border-t-brand-light rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Bell size={40} className="mb-3 opacity-20" />
          <p className="text-sm">알림이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select All */}
          <label className="flex items-center gap-2 px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="rounded"
            />
            <span className="text-[11px] text-slate-500">전체 선택</span>
          </label>

          {Object.entries(grouped).map(([dateKey, items]) => (
            <div key={dateKey}>
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 pl-1">
                {dateKey}
              </h3>
              <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden divide-y divide-bg-border/50">
                {items.map((n) => {
                  const style = TYPE_STYLES[n.notif_type] || TYPE_STYLES.info
                  const TypeIcon = style.Icon
                  return (
                    <div
                      key={n.id}
                      className={`group flex items-start gap-3 px-4 py-3 hover:bg-bg-elevated/50 transition-colors ${
                        !n.is_read ? 'bg-brand/5' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(n.id)}
                        onChange={() => toggleSelect(n.id)}
                        className="rounded mt-1 flex-shrink-0"
                      />

                      {/* Icon */}
                      <div className={`mt-0.5 p-1.5 rounded-lg ${style.bg} flex-shrink-0 cursor-pointer`} onClick={() => handleClick(n)}>
                        {n.icon && n.icon !== '🔔' ? (
                          <span className="text-sm">{n.icon}</span>
                        ) : (
                          <TypeIcon size={14} className={style.text} />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleClick(n)}>
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-medium ${!n.is_read ? 'text-slate-100' : 'text-slate-300'}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-light flex-shrink-0" />
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{n.body}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-600">{formatDate(n.created_at)}</span>
                          <span className="text-[10px] text-slate-600">{timeAgo(n.created_at)}</span>
                          {n.link && (
                            <span className="flex items-center gap-0.5 text-[10px] text-brand-light">
                              <ExternalLink size={8} /> 바로가기
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {!n.is_read && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                            title="읽음 처리"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotif(n.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                          title="삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-bg-card border border-bg-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Settings size={16} className="text-slate-400" /> 알림 설정
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-300 mb-2">알림 유형별 수신 설정</p>
                <div className="space-y-2">
                  {Object.entries(TYPE_STYLES).map(([key, { label, Icon, text, bg }]) => (
                    <label key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-base hover:bg-bg-elevated cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded ${bg}`}>
                          <Icon size={12} className={text} />
                        </div>
                        <span className="text-xs text-slate-300">{label}</span>
                      </div>
                      <input type="checkbox" defaultChecked className="rounded" />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300 mb-2">브라우저 알림</p>
                <label className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-base">
                  <span className="text-xs text-slate-400">브라우저 푸시 알림 허용</span>
                  <input type="checkbox" className="rounded" onChange={() => {
                    if ('Notification' in window) {
                      Notification.requestPermission()
                    }
                  }} />
                </label>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:bg-bg-elevated">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
