import { useEffect, useState } from 'react'
import { Settings, Key, Cpu, Check, X, Trash2, Plus } from 'lucide-react'
import { modelsApi } from '../api/client'
import type { ModelCatalog, ProviderConfig } from '../types'

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
  const [tab, setTab] = useState<'providers' | 'catalog' | 'system'>('providers')

  const [newProvider, setNewProvider] = useState({
    provider: 'anthropic', api_key: '', model_override: '', base_url: '',
  })

  const loadAll = async () => {
    modelsApi.catalog().then((r) => setCatalog(r.data))
    modelsApi.providers().then((r) => setProviders(r.data))
    modelsApi.health().then((r) => setHealth(r.data))
  }

  useEffect(() => { loadAll() }, [])

  const saveProvider = async () => {
    await modelsApi.saveProvider(newProvider)
    setNewProvider({ provider: 'anthropic', api_key: '', model_override: '', base_url: '' })
    loadAll()
  }

  const deleteProvider = async (id: number) => {
    await modelsApi.deleteProvider(id)
    loadAll()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit">
        {[
          { id: 'providers', label: 'AI Provider 설정' },
          { id: 'catalog', label: '모델 카탈로그' },
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
                <label className="block text-[10px] text-slate-500 mb-1">모델 Override (선택)</label>
                <input
                  className="input text-xs font-mono"
                  value={newProvider.model_override}
                  onChange={(e) => setNewProvider((p) => ({ ...p, model_override: e.target.value }))}
                  placeholder="기본값 사용"
                />
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
                { label: '버전', value: 'HAN Group OS v27.0.0' },
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
