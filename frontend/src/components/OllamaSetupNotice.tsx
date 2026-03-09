import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle, RefreshCw, X,
  ExternalLink, ChevronRight, Wifi, WifiOff,
} from 'lucide-react'
import { modelsApi } from '../api/client'

const DISMISSED_KEY = 'han_ollama_dismissed_until'

export interface OllamaStatus {
  base_url: string
  model: string
  has_db_config: boolean
  reachable: boolean
  models_available: string[]
  needs_setup: boolean
}

interface Props {
  /** Called whenever status changes — lets parent page show inline indicator */
  onStatus?: (s: OllamaStatus | null) => void
}

export default function OllamaSetupNotice({ onStatus }: Props) {
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const navigate = useNavigate()

  const check = useCallback(async (forceShow = false) => {
    setChecking(true)
    try {
      const res = await modelsApi.ollamaStatus()
      const s = res.data as OllamaStatus
      setStatus(s)
      onStatus?.(s)

      if (!s.needs_setup) {
        // Ollama is fine
        setJustConnected(true)
        setVisible(false)
        setTimeout(() => setJustConnected(false), 3000)
        return
      }

      // Check if user dismissed recently (within current session only)
      const dismissedUntil = sessionStorage.getItem(DISMISSED_KEY)
      if (dismissedUntil && !forceShow) {
        const until = parseInt(dismissedUntil, 10)
        if (Date.now() < until) return // still within dismiss window
      }

      setVisible(true)
    } catch {
      // API unreachable — backend not running yet, skip
    } finally {
      setChecking(false)
    }
  }, [onStatus])

  // Check on mount
  useEffect(() => { check() }, [check])

  const dismiss = () => {
    // Dismiss for 30 minutes (so it comes back after restart or long gaps)
    sessionStorage.setItem(DISMISSED_KEY, String(Date.now() + 30 * 60 * 1000))
    setVisible(false)
  }

  const goSetup = () => {
    dismiss()
    navigate('/admin')
  }

  const recheck = () => check(true)

  if (justConnected) {
    return (
      <div
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'rgba(16,185,129,0.12)',
          border: '1px solid rgba(16,185,129,0.35)',
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        <CheckCircle size={14} className="text-emerald-400" />
        <span className="text-xs text-emerald-300 font-medium">Ollama 연결됨</span>
        <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    )
  }

  if (!visible || !status) return null

  const isNotConfigured = !status.base_url
  const isUnreachable = status.base_url && !status.reachable

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 400,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b38 100%)',
        border: '1px solid rgba(245,158,11,0.35)',
        borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.1)',
        padding: '18px 20px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isNotConfigured
              ? <WifiOff size={16} className="text-amber-400" />
              : <AlertTriangle size={16} className="text-amber-400" />
            }
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              {isNotConfigured ? 'Ollama 미설정' : 'Ollama 연결 안됨'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isNotConfigured
                ? 'AI 기능을 사용하려면 Ollama를 설정해주세요'
                : `${status.base_url} 에 연결할 수 없습니다`}
            </div>
          </div>
        </div>
        <button onClick={dismiss} className="text-slate-600 hover:text-slate-400 mt-0.5">
          <X size={14} />
        </button>
      </div>

      {/* Status grid */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-[10px] text-slate-500">Base URL</span>
          <span className="text-[10px] font-mono text-slate-400 text-right truncate">
            {status.base_url || '미설정'}
          </span>
          <span className="text-[10px] text-slate-500">연결 상태</span>
          <span className={`text-[10px] font-medium text-right flex items-center justify-end gap-1 ${status.reachable ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.reachable
              ? <><CheckCircle size={9} />연결됨</>
              : isNotConfigured
                ? <><WifiOff size={9} />URL 없음</>
                : <><WifiOff size={9} />연결 실패</>
            }
          </span>
          <span className="text-[10px] text-slate-500">모델</span>
          <span className="text-[10px] font-mono text-purple-400 text-right">{status.model}</span>
        </div>
      </div>

      {/* Setup guide */}
      <div className="mb-4 space-y-2">
        <div className="text-[10px] font-medium text-slate-300 mb-2">설정 방법:</div>

        <div className="flex items-start gap-2">
          <span
            className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
          >1</span>
          <div className="text-[10px] text-slate-400 space-y-1">
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="text-brand-light hover:underline inline-flex items-center gap-1"
            >
              Ollama 설치 (ollama.com) <ExternalLink size={9} />
            </a>
            <div
              className="font-mono rounded px-2 py-1.5 text-slate-300 text-[10px]"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div>ollama serve</div>
              <div className="text-slate-500">ollama pull {status.model || 'qwen2.5'}</div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span
            className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
          >2</span>
          <div className="text-[10px] text-slate-400">
            관리자 → AI Provider 설정에서 Base URL 입력
            <div className="font-mono text-slate-500 mt-0.5">http://localhost:11434</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={goSetup}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium"
          style={{
            background: 'rgba(245,158,11,0.15)',
            color: '#fbbf24',
            border: '1px solid rgba(245,158,11,0.3)',
          }}
        >
          설정하러 가기 <ChevronRight size={12} />
        </button>
        <button
          onClick={recheck}
          disabled={checking}
          className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
          재확인
        </button>
        <button
          onClick={dismiss}
          className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          나중에
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
