/**
 * Toast — 전역 토스트 알림 컴포넌트
 * useAppStore의 toasts 배열을 구독하여 화면 우상단에 표시.
 * 각 토스트는 4초 후 자동 제거. link 있으면 클릭 시 해당 경로로 이동.
 */
import { useEffect } from 'react'
import { CheckCircle, XCircle, Info, X, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, type AppToast } from '../store/useStore'

const ICONS = {
  success: <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />,
  error: <XCircle size={15} className="text-red-400 flex-shrink-0" />,
  info: <Info size={15} className="text-blue-400 flex-shrink-0" />,
}

const BG: Record<AppToast['type'], string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
}

function ToastItem({ toast }: { toast: AppToast }) {
  const removeToast = useAppStore((s) => s.removeToast)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id])

  const handleClick = () => {
    if (toast.link) {
      removeToast(toast.id)
      navigate(toast.link)
    }
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg backdrop-blur-sm
        text-sm text-slate-200 max-w-xs w-full ${BG[toast.type]}
        ${toast.link ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]' : ''}`}
      style={{ animation: 'fadeInRight 0.25s ease', transition: 'filter 0.15s, transform 0.1s' }}
      onClick={handleClick}
    >
      {ICONS[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[12px] leading-tight flex items-center gap-1">
          {toast.title}
          {toast.link && <ExternalLink size={9} className="text-slate-400 flex-shrink-0" />}
        </p>
        {toast.body && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{toast.body}</p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); removeToast(toast.id) }}
        className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5 flex-shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export default function Toast() {
  const toasts = useAppStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </div>
    </>
  )
}
