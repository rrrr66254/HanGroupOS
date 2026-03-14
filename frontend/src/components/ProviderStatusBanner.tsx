import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Wifi, WifiOff, Key, Settings, X, CheckCircle,
  AlertTriangle, Loader2, RefreshCw, Eye, EyeOff,
} from 'lucide-react'
import { modelsApi, orgApi } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProviderHealth {
  ollama: {
    status: 'connected' | 'disconnected'
    model: string
    models_available: string[]
    base_url: string
  }
  anthropic: { status: 'configured' | 'no_api_key'; model: string }
  openai: { status: 'configured' | 'no_api_key'; model: string }
  gemini: { status: 'configured' | 'no_api_key'; model: string }
}

// ── Global health hook (WebSocket + REST fallback) ───────────────────────────
let _globalHealth: ProviderHealth | null = null
const _listeners = new Set<(h: ProviderHealth | null) => void>()

async function fetchHealth() {
  try {
    const res = await modelsApi.health()
    _globalHealth = res.data as ProviderHealth
    _listeners.forEach((fn) => fn(_globalHealth))
  } catch {}
}

export function useProviderHealth() {
  const [health, setHealth] = useState<ProviderHealth | null>(_globalHealth)
  const [loading, setLoading] = useState(!_globalHealth)

  useEffect(() => {
    const update = (h: ProviderHealth | null) => {
      setHealth(h)
      setLoading(false)
    }
    _listeners.add(update)
    if (!_globalHealth) {
      fetchHealth().then(() => setLoading(false))
    }

    // WebSocket으로 프로바이더 상태 실시간 수신
    let unsub: (() => void) | null = null
    try {
      const { subscribeWsEvent } = require('./NotificationPoller')
      unsub = subscribeWsEvent('provider_status', (data: Record<string, unknown>) => {
        const wsHealth: ProviderHealth = {
          ollama: {
            status: (data.ollama as { status: string })?.status === 'connected' ? 'connected' : 'disconnected',
            model: _globalHealth?.ollama.model || '',
            models_available: (data.ollama as { models?: string[] })?.models || [],
            base_url: _globalHealth?.ollama.base_url || '',
          },
          anthropic: { status: (data.anthropic as { status: string })?.status === 'configured' ? 'configured' : 'no_api_key', model: _globalHealth?.anthropic.model || '' },
          openai: { status: (data.openai as { status: string })?.status === 'configured' ? 'configured' : 'no_api_key', model: _globalHealth?.openai.model || '' },
          gemini: { status: (data.gemini as { status: string })?.status === 'configured' ? 'configured' : 'no_api_key', model: _globalHealth?.gemini.model || '' },
        }
        _globalHealth = wsHealth
        _listeners.forEach((fn) => fn(_globalHealth))
      })
    } catch { /* silent */ }

    return () => {
      _listeners.delete(update)
      if (unsub) unsub()
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    await fetchHealth()
    setLoading(false)
  }, [])

  return { health, loading, refresh }
}

// Start health check — initial fetch only (WebSocket handles updates)
let _pollerStarted = false
export function startHealthPoller() {
  if (_pollerStarted) return
  _pollerStarted = true
  fetchHealth()
}

// ── Setup Modal ───────────────────────────────────────────────────────────────
interface SetupModalProps {
  onClose: () => void
  health: ProviderHealth | null
  onRefresh: () => void
}

function SetupModal({ onClose, health, onRefresh }: SetupModalProps) {
  const [tab, setTab] = useState<'ollama' | 'apikeys'>('ollama')
  const [ollamaUrl, setOllamaUrl] = useState(
    health?.ollama.base_url || 'http://localhost:11434'
  )
  const [ollamaModel, setOllamaModel] = useState(health?.ollama.model || 'qwen2.5')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  const testOllama = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        const mods = (data.models || []).map((m: { name: string }) => m.name)
        setTestResult({ ok: true, msg: `연결 성공! 모델 ${mods.length}개 사용 가능` })
      } else {
        setTestResult({ ok: false, msg: `응답 오류: ${res.status}` })
      }
    } catch {
      setTestResult({ ok: false, msg: 'Ollama에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.' })
    }
    setTesting(false)
  }

  const saveOllama = async () => {
    setSaving(true)
    try {
      await modelsApi.saveProvider({ provider: 'ollama', base_url: ollamaUrl, model_override: ollamaModel, api_key: '' })
      // Migrate mock nodes to ollama
      await orgApi.migrateMock()
      setSaved('Ollama 설정 저장됨')
      onRefresh()
    } catch {
      setSaved('저장 실패')
    }
    setSaving(false)
    setTimeout(() => setSaved(null), 2000)
  }

  const saveApiKey = async (provider: string, key: string) => {
    if (!key.trim()) return
    setSaving(true)
    try {
      await modelsApi.saveProvider({ provider, api_key: key.trim(), model_override: '', base_url: '' })
      // Migrate mock nodes
      await orgApi.migrateMock()
      setSaved(`${provider} API 키 저장됨`)
      onRefresh()
    } catch {
      setSaved('저장 실패')
    }
    setSaving(false)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl bg-bg-card border border-bg-border"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-brand-light" />
            <span className="text-sm font-semibold text-slate-200">AI 프로바이더 설정</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bg-border px-5">
          {(['ollama', 'apikeys'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="py-2.5 px-4 text-xs font-medium transition-colors border-b-2 -mb-px"
              style={{
                borderColor: tab === t ? '#6366f1' : 'transparent',
                color: tab === t ? '#a5b4fc' : '#64748b',
              }}
            >
              {t === 'ollama' ? (
                <span className="flex items-center gap-1.5">
                  <Wifi size={11} />Ollama (로컬)
                  {health?.ollama.status === 'connected'
                    ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  }
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Key size={11} />API 키 (클라우드)
                  {(health?.anthropic.status === 'configured' || health?.openai.status === 'configured')
                    ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  }
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* ── Ollama Tab ── */}
          {tab === 'ollama' && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{
                background: health?.ollama.status === 'connected'
                  ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${health?.ollama.status === 'connected' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                {health?.ollama.status === 'connected'
                  ? <Wifi size={14} className="text-emerald-400 flex-shrink-0" />
                  : <WifiOff size={14} className="text-red-400 flex-shrink-0" />
                }
                <span className="text-xs" style={{ color: health?.ollama.status === 'connected' ? '#34d399' : '#f87171' }}>
                  {health?.ollama.status === 'connected'
                    ? `연결됨 · ${health.ollama.models_available.length}개 모델 사용 가능`
                    : 'Ollama가 실행되지 않거나 연결할 수 없습니다'
                  }
                </span>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Ollama 서버 URL</label>
                <input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                  placeholder="http://localhost:11434"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">기본 모델</label>
                <input
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                  placeholder="qwen2.5"
                />
              </div>

              {health?.ollama.models_available.length ? (
                <div>
                  <div className="text-[10px] text-slate-500 mb-2">설치된 모델</div>
                  <div className="flex flex-wrap gap-1.5">
                    {health.ollama.models_available.map((m) => (
                      <button
                        key={m}
                        onClick={() => setOllamaModel(m)}
                        className="text-[10px] px-2 py-1 rounded-md font-mono transition-colors"
                        style={{
                          background: ollamaModel === m ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                          color: ollamaModel === m ? '#a5b4fc' : '#94a3b8',
                          border: `1px solid ${ollamaModel === m ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-slate-600 p-3 rounded-lg bg-bg-elevated">
                  💡 Ollama 설치 후 <span className="font-mono text-amber-500">ollama pull qwen2.5</span> 또는{' '}
                  <span className="font-mono text-amber-500">ollama pull llama3.2</span> 로 모델을 다운로드하세요.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={testOllama}
                  disabled={testing}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {testing ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
                  연결 테스트
                </button>
                <button
                  onClick={saveOllama}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                  저장 & 적용
                </button>
              </div>

              {testResult && (
                <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg" style={{
                  background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  color: testResult.ok ? '#34d399' : '#f87171',
                }}>
                  {testResult.ok ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                  {testResult.msg}
                </div>
              )}
            </>
          )}

          {/* ── API Keys Tab ── */}
          {tab === 'apikeys' && (
            <div className="space-y-4">
              {[
                {
                  key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…',
                  hint: 'claude-sonnet-4-6, claude-haiku 등 사용 가능',
                  status: health?.anthropic.status, val: anthropicKey, set: setAnthropicKey,
                },
                {
                  key: 'openai', label: 'OpenAI', placeholder: 'sk-…',
                  hint: 'gpt-4o, gpt-4o-mini 등 사용 가능',
                  status: health?.openai.status, val: openaiKey, set: setOpenaiKey,
                },
                {
                  key: 'gemini', label: 'Google Gemini', placeholder: 'AIza…',
                  hint: 'gemini-1.5-flash 등 사용 가능',
                  status: health?.gemini.status, val: geminiKey, set: setGeminiKey,
                },
              ].map(({ key, label, placeholder, hint, status, val, set }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-medium text-slate-400">{label} API 키</label>
                    <span className="text-[9px] flex items-center gap-1"
                      style={{ color: status === 'configured' ? '#34d399' : '#64748b' }}
                    >
                      {status === 'configured'
                        ? <><CheckCircle size={9} />등록됨</>
                        : <>미등록</>
                      }
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[key] ? 'text' : 'password'}
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        placeholder={status === 'configured' ? '••••••••••••• (변경하려면 입력)' : placeholder}
                        className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono pr-8"
                      />
                      <button
                        onClick={() => setShowKeys((p) => ({ ...p, [key]: !p[key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                      >
                        {showKeys[key] ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    </div>
                    <button
                      onClick={() => saveApiKey(key, val)}
                      disabled={!val.trim() || saving}
                      className="text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: val.trim() ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                        color: val.trim() ? '#a5b4fc' : '#475569',
                        border: `1px solid ${val.trim() ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      저장
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-600">{hint}</p>
                </div>
              ))}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg text-emerald-400"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <CheckCircle size={11} />{saved}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Provider Status Banner (shown in header) ───────────────────────────────────
export default function ProviderStatusBanner() {
  const { health, loading, refresh } = useProviderHealth()
  const [modalOpen, setModalOpen] = useState(false)
  const autoOpenedRef = useRef(false)

  // Auto-open modal if nothing is connected on first load
  useEffect(() => {
    if (autoOpenedRef.current || !health || loading) return
    autoOpenedRef.current = true
    const ollamaOk = health.ollama.status === 'connected'
    const apiOk = health.anthropic.status === 'configured' || health.openai.status === 'configured'
    if (!ollamaOk && !apiOk) {
      setModalOpen(true)
    }
  }, [health, loading])

  if (loading || !health) return null

  const ollamaOk = health.ollama.status === 'connected'
  const anthropicOk = health.anthropic.status === 'configured'
  const openaiOk = health.openai.status === 'configured'
  const anyOk = ollamaOk || anthropicOk || openaiOk
  const allOk = ollamaOk && anthropicOk && openaiOk

  return (
    <>
      {/* Banner */}
      <div className="flex items-center gap-2">
        {/* Status dots */}
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-bg-elevated"
          title="AI 연결 상태 — 클릭하여 설정"
        >
          {/* Ollama */}
          <span className="flex items-center gap-1 text-[10px]" style={{ color: ollamaOk ? '#34d399' : '#f87171' }}>
            {ollamaOk ? <Wifi size={10} /> : <WifiOff size={10} />}
            <span className="hidden sm:inline">Ollama</span>
          </span>

          {/* API providers */}
          {[
            { label: 'Claude', ok: anthropicOk },
            { label: 'GPT', ok: openaiOk },
          ].map(({ label, ok }) => (
            <span key={label} className="flex items-center gap-0.5 text-[10px]"
              style={{ color: ok ? '#34d399' : '#475569' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? '#34d399' : '#334155' }} />
              <span className="hidden sm:inline">{label}</span>
            </span>
          ))}

          {/* Overall warning */}
          {!anyOk && (
            <AlertTriangle size={11} className="text-amber-400" />
          )}
          {!allOk && anyOk && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </button>

        <button
          onClick={refresh}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-bg-elevated transition-colors"
          title="연결 상태 새로고침"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Setup Modal */}
      {modalOpen && (
        <SetupModal
          onClose={() => setModalOpen(false)}
          health={health}
          onRefresh={() => { refresh(); setModalOpen(false) }}
        />
      )}
    </>
  )
}
