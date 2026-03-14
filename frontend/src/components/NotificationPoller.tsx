/**
 * NotificationPoller — 통합 WebSocket 허브
 * 알림, 배지, 메신저, 터미널, 프로바이더 상태를 단일 WS로 수신.
 * 지수 백오프 재연결 + 최대 재시도 횟수 제한.
 * WS 연결 실패 시 30초 REST 폴링으로 자동 폴백.
 */
import { useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { useAppStore, useAuthStore } from '../store/useStore'

const FALLBACK_POLL_MS = 30_000
const PING_INTERVAL_MS = 25_000
const MAX_RETRIES = 10
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000

// ── 전역 WebSocket 이벤트 구독 시스템 ──────────────────────────────────────
type WsEventHandler = (data: Record<string, unknown>) => void
const _subscribers: Record<string, Set<WsEventHandler>> = {}

export function subscribeWsEvent(type: string, handler: WsEventHandler) {
  if (!_subscribers[type]) _subscribers[type] = new Set()
  _subscribers[type].add(handler)
  return () => { _subscribers[type]?.delete(handler) }
}

function dispatchWsEvent(data: Record<string, unknown>) {
  const type = data.type as string
  if (type && _subscribers[type]) {
    _subscribers[type].forEach((fn) => {
      try { fn(data) } catch { /* ignore */ }
    })
  }
}

// ── 전역 WS 레퍼런스 (send 가능) ──────────────────────────────────────────
let _globalWs: WebSocket | null = null
export function getGlobalWs(): WebSocket | null { return _globalWs }

export default function NotificationPoller() {
  const setNewEventCount = useAppStore((s) => s.setNewEventCount)
  const setPendingApprovals = useAppStore((s) => s.setPendingApprovals)
  const setPendingTerminals = useAppStore((s) => s.setPendingTerminals)
  const setWsStatus = useAppStore((s) => s.setWsStatus)
  const setWsRetryCount = useAppStore((s) => s.setWsRetryCount)
  const token = useAuthStore((s) => s.token)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const retryCountRef = useRef(0)

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      if (mountedRef.current) setNewEventCount(res.data.count ?? 0)
    } catch { /* ignore */ }
  }, [setNewEventCount])

  const getBackoffDelay = (retryNum: number) => {
    // 지수 백오프 + 지터: delay = min(base * 2^n + jitter, max)
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryNum), MAX_DELAY_MS)
    const jitter = Math.random() * 500
    return delay + jitter
  }

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return

    setWsStatus('connecting')

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${window.location.host}/ws/notifications?token=${token}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    _globalWs = ws

    ws.onopen = () => {
      // WebSocket 연결 성공 → 재시도 카운터 리셋
      retryCountRef.current = 0
      setWsStatus('connected')
      setWsRetryCount(0)

      // 폴백 폴링 중단
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current)
        fallbackRef.current = null
      }
      // 핑 시작 (연결 유지)
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (!mountedRef.current) return

        // 통합 이벤트 디스패치
        dispatchWsEvent(data)

        // 기본 이벤트 처리
        switch (data.type) {
          case 'unread_count':
            setNewEventCount(data.count ?? 0)
            break
          case 'badge_update':
            setPendingApprovals(data.approvals ?? 0)
            setPendingTerminals(data.terminals ?? 0)
            break
          case 'pong':
            break // 핑 응답 — 무시
          default:
            break
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRef.current = null
      _globalWs = null
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }

      // 폴백 REST 폴링 활성화
      if (!fallbackRef.current) {
        fetchCount()
        fallbackRef.current = setInterval(fetchCount, FALLBACK_POLL_MS)
      }

      // 최대 재시도 횟수 체크
      if (retryCountRef.current >= MAX_RETRIES) {
        setWsStatus('failed')
        setWsRetryCount(retryCountRef.current)
        return
      }

      setWsStatus('disconnected')
      const delay = getBackoffDelay(retryCountRef.current)
      retryCountRef.current += 1
      setWsRetryCount(retryCountRef.current)

      // 재연결 예약 (지수 백오프)
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()
  }, [token, fetchCount, setNewEventCount, setPendingApprovals, setPendingTerminals, setWsStatus, setWsRetryCount])

  // 수동 재연결 함수 (외부에서 호출 가능)
  const manualReconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    if (reconnectRef.current) clearTimeout(reconnectRef.current)
    retryCountRef.current = 0
    setWsRetryCount(0)
    connect()
  }, [connect, setWsRetryCount])

  useEffect(() => {
    // manualReconnect를 전역에 노출
    (window as unknown as Record<string, unknown>).__wsReconnect = manualReconnect
    return () => { delete (window as unknown as Record<string, unknown>).__wsReconnect }
  }, [manualReconnect])

  useEffect(() => {
    mountedRef.current = true
    retryCountRef.current = 0
    fetchCount()
    connect()

    return () => {
      mountedRef.current = false
      _globalWs = null
      if (wsRef.current) wsRef.current.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (fallbackRef.current) clearInterval(fallbackRef.current)
      if (pingRef.current) clearInterval(pingRef.current)
    }
  }, [token])

  return null
}
