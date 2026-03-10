import { useEffect, useState } from 'react'
import { Settings, Key, Cpu, Check, X, Trash2, Plus, Globe } from 'lucide-react'
import { modelsApi, externalKeyApi } from '../api/client'
import type { ModelCatalog, ProviderConfig } from '../types'

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

export default function Admin() {
  const [catalog, setCatalog] = useState<ModelCatalog[]>([])
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [health, setHealth] = useState<Record<string, { status: string; model: string }>>({})
  const [tab, setTab] = useState<'providers' | 'catalog' | 'external-keys' | 'system'>('providers')

  const [newProvider, setNewProvider] = useState({
    provider: 'anthropic', api_key: '', model_override: '', base_url: '',
  })

  const [extKeys, setExtKeys] = useState<ExternalKey[]>([])
  const [newExtKey, setNewExtKey] = useState({ service: '', label: '', api_key: '' })
  const [extError, setExtError] = useState('')

  const loadAll = async () => {
    modelsApi.catalog().then((r) => setCatalog(r.data))
    modelsApi.providers().then((r) => setProviders(r.data))
    modelsApi.health().then((r) => setHealth(r.data))
  }

  const loadExtKeys = () => externalKeyApi.list().then((r) => setExtKeys(r.data))

  useEffect(() => { loadAll(); loadExtKeys() }, [])

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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'providers', label: 'AI Provider 설정' },
          { id: 'catalog', label: '모델 카탈로그' },
          { id: 'external-keys', label: '외부 API 키' },
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
                  <div key={k.id} className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${k.is_active ? 'bg-success' : 'bg-slate-600'}`} />
                      <div>
                        <div className={`text-xs font-semibold font-mono ${EXT_SERVICE_INFO[k.service]?.color || 'text-slate-300'}`}>
                          {k.service}
                        </div>
                        <div className="text-[9px] text-slate-500">{k.label}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteExtKey(k.id)} className="text-slate-600 hover:text-danger p-1">
                      <Trash2 size={13} />
                    </button>
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
    </div>
  )
}
