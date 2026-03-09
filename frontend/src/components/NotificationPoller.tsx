/**
 * NotificationPoller — background component that polls the group timeline
 * every 30 seconds and updates the sidebar badge with unseen event count.
 *
 * Tracks last-seen timestamp in localStorage so it survives page refreshes.
 */
import { useEffect, useRef } from 'react'
import { chatApi } from '../api/client'
import { useAppStore } from '../store/useStore'

const POLL_MS = 30_000
const LS_KEY = 'han_last_seen_event'

export default function NotificationPoller() {
  const setNewEventCount = useAppStore((s) => s.setNewEventCount)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = async () => {
    try {
      const lastSeen = localStorage.getItem(LS_KEY) ?? new Date(0).toISOString()
      const res = await chatApi.timeline(20)
      const events = res.data as Array<{ created_at: string }>
      const unseen = events.filter((e) => new Date(e.created_at) > new Date(lastSeen))
      setNewEventCount(unseen.length)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  return null
}
