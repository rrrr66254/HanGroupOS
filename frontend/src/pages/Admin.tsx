import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Settings, Key, Cpu, Check, X, Trash2, Plus, Globe, FlaskConical, Loader2, Webhook, Copy, HardDrive, Download, Star, Zap, XCircle, Terminal } from 'lucide-react'
import { modelsApi, externalKeyApi, webhooksApi, videoApi } from '../api/client'
import { useAuthStore } from '../store/useStore'
import type { ModelCatalog, ProviderConfig } from '../types'

interface OllamaModel {
  name: string
  size: number
  digest: string
  modified_at: string
  details?: { parameter_size?: string; quantization_level?: string; family?: string }
}

interface OllamaInfo {
  models: OllamaModel[]
  default_model: string
  loaded_model: string
  ollama_running: boolean
  error?: string
}

interface ExternalKey {
  id: number
  service: string
  label: string
  is_active: boolean
  created_at: string
}

const EXT_SERVICE_INFO: Record<string, { description: string; color: string }> = {
  huggingface: { description: '영상 스튜디오 (HF Inference API)', color: 'text-yellow-400' },
  json2video: { description: '영상 스튜디오 (프레젠테이션 영상)', color: 'text-indigo-400' },
  serpapi: { description: '시장분석 / 게임플랫폼 검색', color: 'text-green-400' },
  newsapi: { description: '뉴스 수집', color: 'text-blue-400' },
  openai: { description: '이미지 분석 (GPT-4o Vision)', color: 'text-emerald-400' },
}

const PROVIDER_INFO: Record<string, { label: string; color: string; description: string }> = {
  anthropic: { label: 'Anthropic Claude', color: 'text-orange-400', description: 'Claude Opus, Sonnet, Haiku' },
  openai: { label: 'OpenAI', color: 'text-emerald-400', description: 'GPT-4o, GPT-4o Mini' },
  gemini: { label: 'Google Gemini', color: 'text-blue-400', description: 'Gemini 1.5 Pro, Flash' },
  ollama: { label: 'Ollama (로컬)', color: 'text-purple-400', description: 'Llama, Mistral 등 로컬 모델' },
  mock: { label: 'Mock AI', color: 'text-slate-400', description: 'API 없이 테스트 가능' },
}

const VALID_TABS = ['providers', 'catalog', 'external-keys', 'webhooks', 'ollama', 'gpu-log', 'system'] as const
type AdminTab = typeof VALID_TABS[number]

export default function Admin() {
  const [searchParams] = useSearchParams()
  const [catalog, setCatalog] = useState<ModelCatalog[]>([])
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [health, setHealth] = useState<Record<string, { status: string; model: string }>>({})
  const initialTab = (VALID_TABS.includes(searchParams.get('tab') as AdminTab)
    ? searchParams.get('tab')
    : 'providers') as AdminTab
  const [tab, setTab] = useState<AdminTab>(initialTab)

  const [newProvider, setNewProvider] = useState({
    provider: 'anthropic', api_key: '', model_override: '', base_url: '',
  })

  const [extKeys, setExtKeys] = useState<ExternalKey[]>([])
  const [newExtKey, setNewExtKey] = useState({ service: '', label: '', api_key: '' })
  const [extError, setExtError] = useState('')
  const [testResults, setTestResults] = useState<Record<number, { status: string; message: string }>>({})
  const [testingId, setTestingId] = useState<number | null>(null)

  // Webhook tokens
  interface WebhookToken { id: number; name: string; token: string; source: string; trigger_source: string; is_active: boolean; last_used_at: string | null; created_at: string }
  const [webhookTokens, setWebhookTokens] = useState<WebhookToken[]>([])
  const [newToken, setNewToken] = useState({ name: '', source: 'custom', trigger_source: 'hackernews' })
  const [createdToken, setCreatedToken] = useState<string | null>(null)  // 최초 생성 시만 전체 토큰 표시
  const [tokenLoading, setTokenLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const token = useAuthStore((s) => s.token)

  // Ollama 관리
  const [ollamaInfo, setOllamaInfo] = useState<OllamaInfo | null>(null)
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaPullName, setOllamaPullName] = useState('')
  const [ollamaMsg, setOllamaMsg] = useState('')
  const [deletingModel, setDeletingModel] = useState<string | null>(null)
  const [settingDefault, setSettingDefault] = useState<string | null>(null)
  // Pull WebSocket 상태 (model별 관리 + 페이지 재진입 복원)
  const [pullProgress, setPullProgress] = useState<{ pct: number; status: string; active: boolean; queued?: boolean } | null>(null)
  const [pullModel, setPullModel] = useState<string>('')  // 현재 pull 중인 모델명
  const [cancelling, setCancelling] = useState(false)
  const pullWsRef = useRef<WebSocket | null>(null)
  // GPU 설치 로그 탭
  const [gpuLog, setGpuLog] = useState<string>('')
  const gpuLogWsRef = useRef<WebSocket | null>(null)
  const gpuLogEndRef = useRef<HTMLDivElement | null>(null)

  const loadOllama = () => {
    setOllamaLoading(true)
    videoApi.ollamaModels()
      .then((r) => setOllamaInfo(r.data))
      .catch(() => setOllamaInfo({ models: [], default_model: '', loaded_model: '', ollama_running: false, error: 'Ollama에 연결할 수 없습니다.' }))
      .finally(() => setOllamaLoading(false))
  }

  const handleOllamaDelete = async (name: string) => {
    if (!confirm(`"${name}" 모델을 삭제하시겠습니까?`)) return
    setDeletingModel(name)
    try {
      await videoApi.ollamaDelete(name)
      setOllamaMsg(`✓ ${name} 삭제 완료`)
      loadOllama()
    } catch (e: any) {
      setOllamaMsg(`✗ 삭제 실패: ${e.response?.data?.detail || e.message}`)
    } finally {
      setDeletingModel(null)
    }
  }

  const handleOllamaSetDefault = async (name: string) => {
    setSettingDefault(name)
    try {
      await videoApi.ollamaSetDefault(name)
      setOllamaMsg(`✓ 기본 모델을 "${name}"으로 변경했습니다.`)
      loadOllama()
    } catch (e: any) {
      setOllamaMsg(`✗ 변경 실패: ${e.response?.data?.detail || e.message}`)
    } finally {
      setSettingDefault(null)
    }
  }

  // WebSocket 구독 함수 (handleOllamaPull + 재연결 공통)
  const _connectPullWs = (name: string) => {
    if (pullWsRef.current) { pullWsRef.current.close(); pullWsRef.current = null }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/api/video/ws/ollama-pull?model=${encodeURIComponent(name)}&token=${token}`)
    pullWsRef.current = ws
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'ping') return
        if (d.type === 'done') {
          setPullProgress({ pct: 100, status: '다운로드 완료!', active: false })
          setOllamaMsg(`✓ "${name}" 다운로드 완료`)
          loadOllama()
        } else if (d.type === 'cancelled') {
          setPullProgress(null)
          setOllamaMsg('다운로드가 취소되었습니다.')
        } else if (d.type === 'error') {
          setPullProgress(null)
          setOllamaMsg(`✗ ${d.status}`)
        } else if (d.type === 'queued') {
          setPullProgress({ pct: 0, status: d.status ?? '대기 중...', active: true, queued: true })
        } else {
          setPullProgress({ pct: d.pct ?? 0, status: d.status ?? '다운로드 중...', active: true })
        }
      } catch { /* ignore */ }
    }
    ws.onerror = () => { setPullProgress(null); setOllamaMsg('✗ WebSocket 연결 실패') }
    ws.onclose = () => { pullWsRef.current = null }
  }

  const handleOllamaPull = async () => {
    const name = ollamaPullName.trim()
    if (!name) return
    setOllamaPullName('')
    setOllamaMsg('')
    setPullProgress({ pct: 0, status: '요청 중...', active: true })
    setPullModel(name)
    try {
      await videoApi.ollamaPull(name)
    } catch { /* 이미 진행 중이어도 WS는 연결 */ }
    _connectPullWs(name)
  }

  const handleCancelPull = async () => {
    const model = pullModel
    setCancelling(true)
    // WebSocket 먼저 닫기 (UI 즉시 반응)
    pullWsRef.current?.close()
    pullWsRef.current = null
    setPullProgress(null)
    setPullModel('')
    // 백엔드에 취소 요청 전송 — 실제 Ollama 스트림 중단
    if (model) {
      try {
        await videoApi.ollamaCancelPull(model)
      } catch { /* ignore */ }
    }
    setCancelling(false)
    setOllamaMsg('다운로드가 취소되었습니다.')
  }

  const handleOllamaUnload = async () => {
    await videoApi.ollamaUnload()
    setOllamaMsg('✓ VRAM 언로드 완료')
    setTimeout(loadOllama, 1000)
  }

  const loadWebhookTokens = () => webhooksApi.listTokens().then((r) => setWebhookTokens(r.data))

  const handleCreateToken = async () => {
    if (!newToken.name.trim()) return
    setTokenLoading(true)
    try {
      const r = await webhooksApi.createToken(newToken)
      setCreatedToken(r.data.token)  // 전체 토큰 저장
      setNewToken({ name: '', source: 'custom', trigger_source: 'hackernews' })
      await loadWebhookTokens()
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const loadAll = async () => {
    modelsApi.catalog().then((r) => setCatalog(r.data))
    modelsApi.providers().then((r) => setProviders(r.data))
    modelsApi.health().then((r) => setHealth(r.data))
  }

  const loadExtKeys = () => externalKeyApi.list().then((r) => setExtKeys(r.data))

  // 마운트 시 진행 중인 pull 상태 복원
  useEffect(() => {
    loadAll(); loadExtKeys(); loadWebhookTokens()
    videoApi.ollamaPullStatus().then((r) => {
      const pulls: Record<string, { type: string; pct: number; status: string }> = r.data.pulls ?? {}
      const active = Object.entries(pulls).find(([, v]) => v.type !== 'done' && v.type !== 'error')
      if (active) {
        const [name, state] = active
        setPullModel(name)
        setPullProgress({ pct: state.pct ?? 0, status: state.status ?? '다운로드 중...', active: true, queued: state.type === 'queued' })
        _connectPullWs(name)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { if (tab === 'ollama') loadOllama() }, [tab])

  // GPU 설치 로그 탭 WebSocket
  useEffect(() => {
    if (tab !== 'gpu-log') {
      gpuLogWsRef.current?.close()
      gpuLogWsRef.current = null
      return
    }
    setGpuLog('')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/api/video/ws/gpu-setup-log?token=${token}`)
    gpuLogWsRef.current = ws
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'history') { setGpuLog(d.content ?? '') }
        else if (d.type === 'append') { setGpuLog((prev) => prev + d.content) }
      } catch { /* ignore */ }
    }
    ws.onclose = () => { gpuLogWsRef.current = null }
    return () => { ws.close() }
  }, [tab])

  // GPU 로그 자동 스크롤
  useEffect(() => {
    gpuLogEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [gpuLog])

  const saveProvider = async () => {
    await modelsApi.saveProvider(newProvider)
    setNewProvider({ provider: 'anthropic', api_key: '', model_override: '', base_url: '' })
    loadAll()
  }

  const deleteProvider = async (id: number) => {
    await modelsApi.deleteProvider(id)
    loadAll()
  }

  const saveExtKey = async () => {
    setExtError('')
    if (!newExtKey.service.trim() || !newExtKey.api_key.trim()) {
      setExtError('서비스명과 API 키는 필수입니다.')
      return
    }
    try {
      await externalKeyApi.create({ ...newExtKey, label: newExtKey.label || newExtKey.service })
      setNewExtKey({ service: '', label: '', api_key: '' })
      loadExtKeys()
    } catch (e: any) {
      setExtError(e.response?.data?.detail || '등록 실패')
    }
  }

  const deleteExtKey = async (id: number) => {
    await externalKeyApi.delete(id)
    loadExtKeys()
  }

  const testExtKey = async (id: number) => {
    setTestingId(id)
    try {
      const r = await externalKeyApi.test(id)
      setTestResults((prev) => ({ ...prev, [id]: { status: r.data.status, message: r.data.message } }))
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [id]: { status: 'error', message: e.response?.data?.detail || '테스트 실패' } }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'providers', label: 'AI Provider 설정' },
          { id: 'catalog', label: '모델 카탈로그' },
          { id: 'external-keys', label: '외부 API 키' },
          { id: 'webhooks', label: '웹훅 토큰' },
          { id: 'ollama', label: 'Ollama 모델' },
          { id: 'gpu-log', label: 'GPU 설치 로그' },
          { id: 'system', label: '시스템 정보' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'providers' && (
        <div className="space-y-4">
          {/* Health status */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Cpu size={13} /> Provider 상태
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(health).map(([provider, info]) => (
                <div key={provider} className="bg-bg-elevated rounded-lg px-3 py-2 text-center">
                  <div className={`text-xs font-medium ${PROVIDER_INFO[provider]?.color || 'text-slate-300'}`}>
                    {PROVIDER_INFO[provider]?.label || provider}
                  </div>
                  <div className={`text-[10px] mt-1 ${
                    info.status === 'configured' || info.status === 'always_available'
                      ? 'text-success'
                      : 'text-warning'
                  }`}>
                    {info.status === 'always_available' ? '항상 사용 가능'
                      : info.status === 'configured' ? '설정됨'
                      : '키 없음'}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-0.5 font-mono truncate">{info.model}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Add provider */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Key size={13} /> API Key 등록
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Provider</label>
                <select
                  className="input text-xs"
                  value={newProvider.provider}
                  onChange={(e) => setNewProvider((p) => ({ ...p, provider: e.target.value }))}
                >
                  {['anthropic', 'openai', 'gemini', 'ollama'].map((p) => (
                    <option key={p} value={p}>{PROVIDER_INFO[p]?.label || p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">API Key</label>
                <input
                  className="input text-xs font-mono"
                  type="password"
                  value={newProvider.api_key}
                  onChange={(e) => setNewProvider((p) => ({ ...p, api_key: e.target.value }))}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">모델 선택</label>
                {newProvider.provider === 'ollama' ? (
                  <input
                    className="input text-xs font-mono"
                    value={newProvider.model_override}
                    onChange={(e) => setNewProvider((p) => ({ ...p, model_override: e.target.value }))}
                    placeholder="llama3.2"
                  />
                ) : (
                  <select
                    className="input text-xs font-mono"
                    value={newProvider.model_override}
                    onChange={(e) => setNewProvider((p) => ({ ...p, model_override: e.target.value }))}
                  >
                    <option value="">기본값 사용</option>
                    {catalog
                      .filter((m) => m.provider === newProvider.provider)
                      .map((m) => (
                        <option key={m.id} value={m.model_id}>
                          {m.name} ({m.model_id})
                        </option>
                      ))}
                  </select>
                )}
              </div>
              {newProvider.provider === 'ollama' && (
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Base URL</label>
                  <input
                    className="input text-xs font-mono"
                    value={newProvider.base_url}
                    onChange={(e) => setNewProvider((p) => ({ ...p, base_url: e.target.value }))}
                    placeholder="http://localhost:11434"
                  />
                </div>
              )}
            </div>
            <button onClick={saveProvider} className="btn-primary text-xs flex items-center gap-2">
              <Plus size={12} /> 저장
            </button>
          </div>

          {/* Configured providers */}
          {providers.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3">등록된 Provider</h3>
              <div className="space-y-2">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-success' : 'bg-slate-600'}`} />
                      <div>
                        <div className={`text-xs font-medium ${PROVIDER_INFO[p.provider]?.color || 'text-slate-300'}`}>
                          {PROVIDER_INFO[p.provider]?.label || p.provider}
                        </div>
                        {p.model_override && (
                          <div className="text-[9px] text-slate-500 font-mono">{p.model_override}</div>
                        )}
                      </div>
                    </div>
                    <button onClick={() => deleteProvider(p.id)} className="text-slate-600 hover:text-danger p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'external-keys' && (
        <div className="space-y-4">
          {/* Service guide */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Globe size={13} /> 주요 외부 서비스
            </h3>
            <div className="space-y-1.5">
              {Object.entries(EXT_SERVICE_INFO).map(([svc, info]) => (
                <div key={svc} className="flex items-center gap-3 text-[11px]">
                  <code className={`font-mono font-semibold ${info.color} w-24 shrink-0`}>{svc}</code>
                  <span className="text-slate-500">{info.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Register form */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Key size={13} /> 외부 API 키 등록
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">서비스명 *</label>
                <input
                  className="input text-xs font-mono"
                  value={newExtKey.service}
                  onChange={(e) => setNewExtKey((p) => ({ ...p, service: e.target.value.toLowerCase().trim() }))}
                  placeholder="huggingface / json2video / serpapi"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">레이블 (선택)</label>
                <input
                  className="input text-xs"
                  value={newExtKey.label}
                  onChange={(e) => setNewExtKey((p) => ({ ...p, label: e.target.value }))}
                  placeholder="내 HF 토큰"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">API 키 *</label>
                <input
                  className="input text-xs font-mono"
                  type="password"
                  value={newExtKey.api_key}
                  onChange={(e) => setNewExtKey((p) => ({ ...p, api_key: e.target.value }))}
                  placeholder="hf-... / sk-... / ..."
                />
              </div>
            </div>
            {extError && (
              <p className="text-[11px] text-red-400 mb-2">{extError}</p>
            )}
            <button onClick={saveExtKey} className="btn-primary text-xs flex items-center gap-2">
              <Plus size={12} /> 등록
            </button>
          </div>

          {/* Registered keys */}
          {extKeys.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3">등록된 외부 API 키</h3>
              <div className="space-y-2">
                {extKeys.map((k) => (
                  <div key={k.id} className="flex flex-col gap-1 bg-bg-elevated rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${k.is_active ? 'bg-success' : 'bg-slate-600'}`} />
                        <div>
                          <div className={`text-xs font-semibold font-mono ${EXT_SERVICE_INFO[k.service]?.color || 'text-slate-300'}`}>
                            {k.service}
                          </div>
                          <div className="text-[9px] text-slate-500">{k.label}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => testExtKey(k.id)}
                          disabled={testingId === k.id}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-brand/20 text-brand-light hover:bg-brand/30 disabled:opacity-50"
                        >
                          {testingId === k.id ? <Loader2 size={10} className="animate-spin" /> : <FlaskConical size={10} />}
                          테스트
                        </button>
                        <button onClick={() => deleteExtKey(k.id)} className="text-slate-600 hover:text-danger p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {testResults[k.id] && (
                      <div className={`text-[10px] flex items-center gap-1.5 mt-0.5 ml-5 ${
                        testResults[k.id].status === 'ok' ? 'text-success' :
                        testResults[k.id].status === 'test_not_supported' ? 'text-slate-400' :
                        'text-red-400'
                      }`}>
                        {testResults[k.id].status === 'ok' ? <Check size={10} /> : testResults[k.id].status === 'test_not_supported' ? null : <X size={10} />}
                        {testResults[k.id].message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {extKeys.length === 0 && (
            <div className="card p-6 text-center text-xs text-slate-600">
              등록된 외부 API 키가 없습니다.
            </div>
          )}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">AI 모델 카탈로그</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.map((m) => (
              <div key={m.id} className="bg-bg-elevated rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{m.name}</div>
                    <div className={`text-[10px] mt-0.5 ${PROVIDER_INFO[m.provider]?.color || 'text-slate-400'}`}>
                      {PROVIDER_INFO[m.provider]?.label || m.provider}
                    </div>
                  </div>
                  {m.is_free && <span className="badge badge-active text-[9px]">무료</span>}
                </div>
                <p className="text-[10px] text-slate-500 mb-2">{m.description}</p>
                <div className="text-[9px] text-slate-600 font-mono mb-2">{m.model_id}</div>
                <div className="flex flex-wrap gap-1">
                  {m.strengths.map((s) => (
                    <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-brand/10 text-brand-light/70">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="text-[9px] text-slate-600 mt-2">
                  컨텍스트: {m.context_window.toLocaleString()} tokens
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Webhook size={13} className="text-brand-light" /> 외부 웹훅 토큰 관리
            </h3>
            <p className="text-[10px] text-slate-500 mb-4">
              Slack, Zapier 등 외부 시스템에서{' '}
              <code className="bg-bg-elevated px-1 rounded text-brand-light">POST /api/webhooks/collect</code>를
              호출할 때 사용하는 인증 토큰을 관리합니다.
              <br />헤더: <code className="bg-bg-elevated px-1 rounded text-brand-light">X-Webhook-Token: &lt;token&gt;</code>
            </p>

            {/* 토큰 생성 폼 */}
            <div className="p-3 rounded-lg bg-bg-elevated border border-bg-border space-y-2 mb-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">이름</label>
                  <input
                    className="input w-full text-xs mt-0.5"
                    placeholder="슬랙 알림봇"
                    value={newToken.name}
                    onChange={(e) => setNewToken((t) => ({ ...t, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">출처</label>
                  <select className="input w-full text-xs mt-0.5" value={newToken.source} onChange={(e) => setNewToken((t) => ({ ...t, source: e.target.value }))}>
                    <option value="custom">Custom</option>
                    <option value="slack">Slack</option>
                    <option value="zapier">Zapier</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">트리거 수집</label>
                  <select className="input w-full text-xs mt-0.5" value={newToken.trigger_source} onChange={(e) => setNewToken((t) => ({ ...t, trigger_source: e.target.value }))}>
                    <option value="hackernews">HackerNews</option>
                    <option value="worldbank">World Bank</option>
                    <option value="reddit">Reddit</option>
                    <option value="custom">커스텀 데이터</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreateToken}
                disabled={tokenLoading || !newToken.name.trim()}
                className="btn-primary text-xs flex items-center gap-1"
              >
                {tokenLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                토큰 생성
              </button>
            </div>

            {/* 최초 생성된 토큰 표시 */}
            {createdToken && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-success font-medium">✓ 토큰 생성 완료 — 지금 복사하세요 (이후 조회 불가)</span>
                  <button onClick={() => setCreatedToken(null)} className="text-slate-500 hover:text-slate-300"><X size={12} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono text-success bg-black/20 px-2 py-1 rounded break-all">{createdToken}</code>
                  <button
                    onClick={() => handleCopyToken(createdToken)}
                    className="shrink-0 p-1.5 rounded bg-success/20 hover:bg-success/30 text-success"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            )}

            {/* 토큰 목록 */}
            {webhookTokens.length === 0 ? (
              <div className="text-center py-6 text-slate-600 text-xs">등록된 웹훅 토큰이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {webhookTokens.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-elevated border border-bg-border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-slate-200">{t.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/10 text-brand-light">{t.source}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{t.trigger_source}</span>
                        {!t.is_active && <span className="text-[9px] text-slate-600">(비활성)</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {t.token} {t.last_used_at && `· 마지막 사용: ${new Date(t.last_used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={async () => { await webhooksApi.toggleToken(t.id); loadWebhookTokens() }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${t.is_active ? 'border-success/30 text-success hover:bg-success/10' : 'border-slate-600 text-slate-500 hover:bg-slate-700'}`}
                      >
                        {t.is_active ? '활성' : '비활성'}
                      </button>
                      <button
                        onClick={async () => { await webhooksApi.deleteToken(t.id); loadWebhookTokens() }}
                        className="p-1 text-slate-600 hover:text-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Settings size={13} /> 시스템 정보
            </h3>
            <div className="space-y-2">
              {[
                { label: '버전', value: 'HAN Group OS v29.0.0' },
                { label: '헌장', value: 'HAN Group Charter v1.0' },
                { label: '백엔드', value: 'FastAPI + SQLite' },
                { label: '프론트엔드', value: 'React 18 + TypeScript + Tailwind' },
                { label: 'AI 지원', value: 'Anthropic, OpenAI, Gemini, Ollama, Mock' },
                { label: '아키텍처', value: 'Modular · Plugin-style · Multi-provider' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-bg-border last:border-0">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs text-slate-300 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">버전 로드맵</h3>
            <div className="space-y-1">
              {Array.from({ length: 27 }, (_, i) => i + 1).map((v) => (
                <div key={v} className="flex items-center gap-3 py-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v <= 27 ? 'bg-success' : 'bg-slate-700'}`} />
                  <div className="text-[10px] text-slate-400">
                    <span className="text-slate-500 font-mono">v{v}</span>
                    {v === 27 && <span className="ml-2 badge badge-brand text-[9px]">현재</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'ollama' && (
        <div className="space-y-4">
          {/* 상태 헤더 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Cpu size={13} className="text-purple-400" /> Ollama 로컬 LLM 관리
              </h3>
              <button onClick={loadOllama} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <FlaskConical size={11} /> 새로고침
              </button>
            </div>

            {ollamaLoading && !ollamaInfo && (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                <Loader2 size={13} className="animate-spin" /> Ollama 연결 중...
              </div>
            )}

            {ollamaInfo && (
              <div className="flex gap-6 text-xs flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${ollamaInfo.ollama_running ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-slate-400">Ollama</span>
                  <span className={ollamaInfo.ollama_running ? 'text-emerald-400' : 'text-red-400'}>
                    {ollamaInfo.ollama_running ? '실행 중' : '미실행'}
                  </span>
                </div>
                {ollamaInfo.default_model && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <Star size={10} className="text-yellow-400" />
                    기본 모델: <span className="text-slate-200 font-mono ml-1">{ollamaInfo.default_model}</span>
                  </div>
                )}
                {ollamaInfo.loaded_model && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <Zap size={10} className="text-blue-400" />
                    VRAM 로드: <span className="text-blue-300 font-mono ml-1">{ollamaInfo.loaded_model}</span>
                    <button onClick={handleOllamaUnload} className="ml-2 text-[10px] text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded px-1.5 py-0.5 transition-colors">
                      언로드
                    </button>
                  </div>
                )}
                {!ollamaInfo.ollama_running && (
                  <span className="text-red-400 text-[11px]">{ollamaInfo.error}</span>
                )}
              </div>
            )}

            {ollamaMsg && (
              <div className={`mt-3 text-[11px] px-2.5 py-1.5 rounded ${
                ollamaMsg.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-300' :
                ollamaMsg.startsWith('⬇') ? 'bg-blue-500/10 text-blue-300' :
                'bg-red-500/10 text-red-400'
              }`}>
                {ollamaMsg}
              </div>
            )}
          </div>

          {/* 설치된 모델 목록 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <HardDrive size={13} /> 설치된 모델 ({ollamaInfo?.models.length ?? 0}개)
            </h3>
            {ollamaInfo?.models.length === 0 ? (
              <p className="text-xs text-slate-600 py-3 text-center">설치된 모델이 없습니다. 아래에서 모델을 다운로드하세요.</p>
            ) : (
              <div className="space-y-2">
                {ollamaInfo?.models.map((m) => {
                  const isDefault = m.name === ollamaInfo.default_model || m.name.split(':')[0] === ollamaInfo.default_model?.split(':')[0]
                  const isLoaded = m.name === ollamaInfo.loaded_model
                  const sizeGB = (m.size / 1024 / 1024 / 1024).toFixed(1)
                  return (
                    <div key={m.name} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${
                      isDefault ? 'bg-purple-500/8 border-purple-500/25' : 'bg-bg-elevated border-transparent'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-200 truncate">{m.name}</span>
                          {isDefault && (
                            <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-1.5 py-0.5 flex-shrink-0">
                              기본
                            </span>
                          )}
                          {isLoaded && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5 flex-shrink-0">
                              VRAM
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex gap-2">
                          <span>{sizeGB}GB</span>
                          {m.details?.parameter_size && <span>{m.details.parameter_size}</span>}
                          {m.details?.quantization_level && <span className="font-mono">{m.details.quantization_level}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isDefault && (
                          <button
                            onClick={() => handleOllamaSetDefault(m.name)}
                            disabled={settingDefault === m.name}
                            className="text-[10px] px-2 py-1 rounded border border-slate-700 hover:border-yellow-500/40 text-slate-500 hover:text-yellow-400 transition-colors disabled:opacity-50"
                          >
                            {settingDefault === m.name ? <Loader2 size={9} className="animate-spin" /> : '기본 설정'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOllamaDelete(m.name)}
                          disabled={deletingModel === m.name}
                          className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {deletingModel === m.name ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 새 모델 다운로드 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Download size={13} /> 모델 다운로드
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                value={ollamaPullName}
                onChange={(e) => setOllamaPullName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleOllamaPull()}
                placeholder="모델 이름 (예: gemma3:27b)"
                disabled={pullProgress?.active}
                className="flex-1 bg-bg-base border border-bg-border rounded text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-brand/60 placeholder:text-slate-600 disabled:opacity-50"
              />
              {pullProgress?.active ? (
                <button
                  onClick={handleCancelPull}
                  disabled={cancelling}
                  title="다운로드 취소"
                  className="px-3 py-2 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {cancelling
                    ? <Loader2 size={12} className="animate-spin" />
                    : <XCircle size={12} />}
                </button>
              ) : (
                <button onClick={handleOllamaPull} disabled={!ollamaPullName.trim()} className="btn-primary text-xs px-3">
                  <Download size={12} />
                </button>
              )}
            </div>

            {/* Pull 진행률 바 */}
            {pullProgress && (
              <div className="mb-3 space-y-1.5">
                {pullModel && (
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {pullProgress.active ? '⬇' : '✓'} {pullModel}
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className={`truncate max-w-[220px] ${pullProgress.queued ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {pullProgress.queued && '⏳ '}{pullProgress.status}
                  </span>
                  <span className={pullProgress.pct >= 100 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {pullProgress.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      pullProgress.pct >= 100 ? 'bg-emerald-500' :
                      pullProgress.queued ? 'bg-yellow-500' : 'bg-brand'
                    } ${pullProgress.active && pullProgress.pct < 5 ? 'animate-pulse' : ''}`}
                    style={{ width: `${Math.max(pullProgress.pct, 1)}%` }}
                  />
                </div>
              </div>
            )}
            {/* RTX 5070 Ti 추천 모델 */}
            <div>
              <p className="text-[10px] text-slate-500 mb-2">RTX 5070 Ti (16GB) 추천 모델</p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { name: 'gemma3:27b', desc: 'Google Gemma3 27B — 최고 품질', vram: '~15.6GB', tag: '권장' },
                  { name: 'qwen2.5:14b', desc: 'Alibaba Qwen2.5 14B — 다국어/추론', vram: '~8.7GB', tag: '' },
                  { name: 'gemma3:12b', desc: 'Google Gemma3 12B — 균형', vram: '~7.3GB', tag: '' },
                  { name: 'deepseek-r1:14b', desc: 'DeepSeek R1 14B — 추론 특화', vram: '~8.5GB', tag: '' },
                ].map((m) => (
                  <div key={m.name} className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-200">{m.name}</span>
                        {m.tag && <span className="text-[9px] bg-brand/20 text-brand-light border border-brand/30 rounded px-1 py-0.5">{m.tag}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500">{m.desc} · {m.vram}</div>
                    </div>
                    <button
                      onClick={() => { setOllamaPullName(m.name); setOllamaMsg(`⬇ "${m.name}" 다운로드 예약됨 — Pull 버튼을 눌러 시작하세요.`) }}
                      className="text-[10px] px-2 py-1 rounded border border-slate-700 hover:border-brand/40 text-slate-500 hover:text-brand-light transition-colors"
                    >
                      선택
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPU 설치 로그 탭 */}
      {tab === 'gpu-log' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Terminal size={13} /> GPU 설치 로그 (han setup-gpu)
            </h3>
            <p className="text-[10px] text-slate-500 mb-3">
              <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-slate-300">han setup-gpu</code>를 실행하면 여기서 실시간으로 진행 상황을 확인할 수 있습니다.
              페이지를 닫아도 설치는 계속 진행되며, 돌아오면 로그가 이어서 표시됩니다.
            </p>
            <div className="relative">
              <pre className="bg-bg-base border border-bg-border rounded-lg p-3 text-[10px] font-mono text-slate-300 overflow-auto max-h-[480px] whitespace-pre-wrap leading-relaxed">
                {gpuLog || <span className="text-slate-600">로그 없음 — 터미널에서 han setup-gpu 를 실행하세요.</span>}
                <div ref={gpuLogEndRef} />
              </pre>
              {gpuLogWsRef.current && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] text-emerald-400">실시간</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setGpuLog('')}
                className="text-[10px] px-2 py-1 rounded border border-slate-700 hover:border-slate-600 text-slate-500 hover:text-slate-300 transition-colors"
              >
                화면 지우기
              </button>
              <div className="text-[10px] text-slate-600 flex items-center">
                재시작: <code className="ml-1 bg-bg-elevated px-1.5 py-0.5 rounded text-slate-400">han setup-gpu --resume</code>
                &nbsp;|&nbsp;초기화: <code className="ml-1 bg-bg-elevated px-1.5 py-0.5 rounded text-slate-400">han setup-gpu --clean</code>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
