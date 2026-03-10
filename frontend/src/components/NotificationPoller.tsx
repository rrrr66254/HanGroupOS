/**
 * NotificationPoller — WebSocket 기반 실시간 알림 배지 업데이트
 * WebSocket 연결 실패 시 30초 REST 폴링으로 자동 폴백.
 */
import { useEffect, useRef } from 'react'
import api from '../api/client'
import { useAppStore, useAuthStore } from '../store/useStore'

const FALLBACK_POLL_MS = 30_000
const WS_RECONNECT_MS = 5_000

export default function NotificationPoller() {
  const setNewEventCount = useAppStore((s) => s.setNewEventCount)
  const token = useAuthStore((s) => s.token)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const fetchCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      if (mountedRef.current) setNewEventCount(res.data.count ?? 0)
    } catch { /* ignore */ }
  }

  const connect = () => {
    if (!token || !mountedRef.current) return

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${window.location.host}/ws/notifications?token=${token}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // WebSocket 연결 성공 → 폴백 폴링 중단
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current)
        fallbackRef.current = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'unread_count' && mountedRef.current) {
          setNewEventCount(data.count ?? 0)
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRef.current = null
      // 폴백 REST 폴링 활성화
      if (!fallbackRef.current) {
        fetchCount()
        fallbackRef.current = setInterval(fetchCount, FALLBACK_POLL_MS)
      }
      // 재연결 예약
      reconnectRef.current = setTimeout(connect, WS_RECONNECT_MS)
    }

    ws.onerror = () => ws.close()
  }

  useEffect(() => {
    mountedRef.current = true
    fetchCount()
    connect()

    return () => {
      mountedRef.current = false
      if (wsRef.current) wsRef.current.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (fallbackRef.current) clearInterval(fallbackRef.current)
    }
  }, [token])

  return null
}
