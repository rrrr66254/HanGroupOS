import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Save, User } from 'lucide-react'
import { agentPersonalityApi } from '../api/client'
import { companiesApi } from '../api/client'

const PRESET_STYLES: Record<string, { color: string; bg: string }> = {
  conservative: { color: 'text-blue-400', bg: 'bg-blue-500/10' },
  aggressive: { color: 'text-red-400', bg: 'bg-red-500/10' },
  creative: { color: 'text-purple-400', bg: 'bg-purple-500/10' },
  balanced: { color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
}

interface Preset {
  key: string
  label: string
  description: string
}

interface AgentInfo {
  org_node_id: number
  agent_name: string
  role: string
  level: string
  preset: string
  tone: string
  expertise: string
  response_length: string
}

export default function AgentPersonalityPage() {
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState<number>(0)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [presets, setPresets] = useState<Record<string, Preset>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data?.companies || r.data || []
      setCompanies(list)
      if (list.length > 0) setSelectedCompany(list[0].id)
    }).catch(() => {})
    agentPersonalityApi.presets().then((r) => setPresets(r.data.presets)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedCompany) return
    setLoading(true)
    agentPersonalityApi.company(selectedCompany).then((r) => {
      setAgents(r.data.agents)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedCompany])

  const startEdit = async (nodeId: number) => {
    try {
      const r = await agentPersonalityApi.get(nodeId)
      setEditData({
        preset: r.data.preset || 'balanced',
        tone: r.data.tone || 'professional',
        expertise: r.data.expertise || '',
        custom_instruction: r.data.custom_instruction || '',
        response_length: r.data.response_length || 'medium',
      })
      setEditing(nodeId)
    } catch { /* ignore */ }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await agentPersonalityApi.update(editing, { org_node_id: editing, ...editData })
      // 목록 갱신
      const r = await agentPersonalityApi.company(selectedCompany)
      setAgents(r.data.agents)
      setEditing(null)
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles size={20} className="text-purple-400" /> 에이전트 성격 설정
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">각 AI 에이전트의 말투/성격/전문분야 커스터마이징</p>
        </div>
        <select value={selectedCompany} onChange={(e) => setSelectedCompany(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-300">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 프리셋 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {Object.values(presets).map((p) => {
          const style = PRESET_STYLES[p.key] || PRESET_STYLES.balanced
          return (
            <div key={p.key} className={`card p-3 ${style.bg} border border-slate-800`}>
              <div className={`font-bold text-sm ${style.color}`}>{p.label}</div>
              <div className="text-[10px] text-slate-500 mt-1">{p.description}</div>
            </div>
          )
        })}
      </div>

      {/* 에이전트 목록 */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">에이전트 목록</h3>
        {loading ? (
          <div className="py-8 text-center text-slate-600 text-xs">로딩 중...</div>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => {
              const style = PRESET_STYLES[a.preset] || PRESET_STYLES.balanced
              return (
                <div key={a.org_node_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                      <User size={14} className="text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm text-white font-medium">{a.agent_name}</div>
                      <div className="text-[10px] text-slate-500">{a.role} · {a.level}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${style.bg} ${style.color}`}>
                      {presets[a.preset]?.label || a.preset}
                    </span>
                    <button onClick={() => startEdit(a.org_node_id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1">
                      편집
                    </button>
                  </div>
                </div>
              )
            })}
            {agents.length === 0 && (
              <div className="py-8 text-center text-slate-600 text-xs">이 계열사에 에이전트가 없습니다.</div>
            )}
          </div>
        )}
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles size={14} /> 성격 설정 편집
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">프리셋</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(presets).map((p) => (
                    <button key={p.key}
                      onClick={() => setEditData({ ...editData, preset: p.key })}
                      className={`text-xs p-2 rounded-md border transition ${
                        editData.preset === p.key
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-slate-700 text-slate-500 hover:border-slate-600'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">말투</label>
                <select value={editData.tone || 'professional'}
                  onChange={(e) => setEditData({ ...editData, tone: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300">
                  <option value="professional">전문적</option>
                  <option value="formal">격식체</option>
                  <option value="casual">캐주얼</option>
                  <option value="friendly">친근한</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">응답 길이</label>
                <select value={editData.response_length || 'medium'}
                  onChange={(e) => setEditData({ ...editData, response_length: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300">
                  <option value="short">짧게 (핵심만)</option>
                  <option value="medium">보통</option>
                  <option value="long">상세하게</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">전문 분야 (쉼표 구분)</label>
                <input value={editData.expertise || ''}
                  onChange={(e) => setEditData({ ...editData, expertise: e.target.value })}
                  placeholder="예: 클라우드, AI, 보안"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">커스텀 지시문</label>
                <textarea value={editData.custom_instruction || ''}
                  onChange={(e) => setEditData({ ...editData, custom_instruction: e.target.value })}
                  rows={3} placeholder="이 에이전트에게 추가할 특별 지시문..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-300">취소</button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md flex items-center gap-1 disabled:opacity-50">
                <Save size={12} /> {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
