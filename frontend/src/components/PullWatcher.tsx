/**
 * PullWatcher — 전역 Ollama pull 완료 감지 컴포넌트
 * 어느 페이지에 있든 pull이 완료되면 Toast 알림을 표시.
 *
 * 동작 방식:
 * 1. 마운트 + 5초 간격 폴링으로 GET /video/ollama/pull-status 확인
 * 2. 새로 발견된 활성 pull에 대해 WebSocket(/ws/ollama-pull) 구독
 * 3. type === 'done' 수신 시 addToast() 호출
 * 4. 언마운트 시 모든 WebSocket 연결 정리
 */
import { useEffect, useRef } from 'react'
import { videoApi } from '../api/client'
import { useAuthStore, useAppStore } from '../store/useStore'

const POLL_MS = 5_000

export default function PullWatcher() {
  const token = useAuthStore((s) => s.token)
  const addToast = useAppStore((s) => s.addToast)
  // model → WebSocket 매핑
  const wsMapRef = useRef<Map<string, WebSocket>>(new Map())
  const mountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const subscribeModel = (model: string) => {
    // 이미 구독 중이면 중복 연결 방지
    if (wsMapRef.current.has(model)) return
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/video/ws/ollama-pull?model=${encodeURIComponent(model)}&token=${token}`
    )
    wsMapRef.current.set(model, ws)

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'done') {
          addToast({
            type: 'success',
            title: 'Ollama 모델 다운로드 완료',
            body: `"${model}" 다운로드가 완료되었습니다.`,
            link: '/admin?tab=ollama',
          })
          ws.close()
          wsMapRef.current.delete(model)
        } else if (d.type === 'error') {
          addToast({
            type: 'error',
            title: 'Ollama 다운로드 실패',
            body: d.status ?? model,
          })
          ws.close()
          wsMapRef.current.delete(model)
        } else if (d.type === 'cancelled') {
          ws.close()
          wsMapRef.current.delete(model)
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => { wsMapRef.current.delete(model) }
    ws.onclose = () => { wsMapRef.current.delete(model) }
  }

  const checkPulls = () => {
    if (!mountedRef.current || !token) return
    videoApi.ollamaPullStatus().then((r) => {
      if (!mountedRef.current) return
      const pulls: Record<string, { type: string }> = r.data.pulls ?? {}
      Object.entries(pulls).forEach(([model, state]) => {
        if (state.type !== 'done' && state.type !== 'error' && state.type !== 'cancelled') {
          subscribeModel(model)
        }
      })
    }).catch(() => {})
  }

  useEffect(() => {
    if (!token) return
    mountedRef.current = true

    checkPulls()
    pollRef.current = setInterval(checkPulls, POLL_MS)

    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
      wsMapRef.current.forEach((ws) => ws.close())
      wsMapRef.current.clear()
    }
  }, [token])

  return null
}
