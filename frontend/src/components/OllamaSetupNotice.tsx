import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X, ExternalLink, ChevronRight } from 'lucide-react'
import { modelsApi } from '../api/client'

const STORAGE_KEY = 'han_ollama_notice_dismissed'

interface OllamaStatus {
  base_url: string
  model: string
  has_db_config: boolean
  reachable: boolean
  needs_setup: boolean
}

export default function OllamaSetupNotice() {
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Only show once per session (or until dismissed permanently)
    const dismissed = sessionStorage.getItem(STORAGE_KEY)
    if (dismissed) return

    modelsApi.ollamaStatus()
      .then((res) => {
        const s = res.data as OllamaStatus
        setStatus(s)
        if (s.needs_setup) setVisible(true)
      })
      .catch(() => {
        // If the API itself fails (e.g. server starting), skip the notice
      })
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  const goSetup = () => {
    dismiss()
    navigate('/admin')
  }

  if (!visible || !status) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 380,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,158,11,0.1)',
        padding: '16px 18px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(245,158,11,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">Ollama 설정 필요</div>
            <div className="text-[10px] text-slate-500 mt-0.5">AI 기능을 사용하려면 Ollama를 연결해주세요</div>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-slate-600 hover:text-slate-400 flex-shrink-0 mt-0.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Status detail */}
      <div className="bg-bg-elevated rounded-lg px-3 py-2.5 mb-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">Base URL</span>
          <span className="text-[10px] font-mono text-slate-400">
            {status.base_url || '미설정'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">연결 상태</span>
          <span className={`text-[10px] font-medium ${status.reachable ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.reachable ? '● 연결됨' : status.base_url ? '● 연결 실패' : '● URL 없음'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">기본 모델</span>
          <span className="text-[10px] font-mono text-purple-400">{status.model}</span>
        </div>
      </div>

      {/* Steps guide */}
      <div className="text-[10px] text-slate-500 mb-3 space-y-1">
        <div className="text-[10px] text-slate-400 font-medium mb-1.5">빠른 시작:</div>
        <div>1. <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-brand-light hover:underline inline-flex items-center gap-0.5">Ollama 설치 <ExternalLink size={9} /></a></div>
        <div className="font-mono bg-bg-card rounded px-2 py-1 text-slate-400 mt-1">
          ollama pull {status.model || 'qwen2.5'}
        </div>
        <div>2. 관리자 설정에서 Base URL 입력</div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={goSetup}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          설정하러 가기 <ChevronRight size={12} />
        </button>
        <button
          onClick={dismiss}
          className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 bg-bg-elevated"
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
