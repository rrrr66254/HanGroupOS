import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Play, Save, Trash2, ArrowRight, Settings, Loader2,
  MessageSquare, Brain, Database, Filter, Shuffle, Bell, CheckSquare,
  Globe, Clock, GitMerge, ChevronDown, X, History, Zap,
} from 'lucide-react'
import { workflowApi, companiesApi } from '../api/client'
import { useAppStore } from '../store/useStore'
import type { Company } from '../types'

interface WfNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  config: Record<string, string>
}

interface WfEdge {
  id: string
  source: string
  target: string
}

interface Workflow {
  id: number
  name: string
  description: string
  nodes: WfNode[]
  edges: WfEdge[]
  status: string
  company_id: number | null
  created_at: string
  updated_at: string
}

interface NodeType {
  type: string
  label: string
  category: string
  icon: string
  description: string
  config_schema: Record<string, string>
}

interface Execution {
  id: number
  workflow_id: number
  status: string
  node_results: Record<string, { status: string; output?: unknown; error?: string; duration_ms?: number }>
  started_at: string
  finished_at: string | null
  error_msg: string
}

const ICON_MAP: Record<string, React.ElementType> = {
  MessageSquare, Brain, Database, Filter, Shuffle, Bell, CheckSquare, Globe, Clock, GitMerge,
}

const CATEGORY_COLORS: Record<string, string> = {
  ai: 'border-purple-500/50 bg-purple-500/5',
  data: 'border-blue-500/50 bg-blue-500/5',
  logic: 'border-amber-500/50 bg-amber-500/5',
  action: 'border-emerald-500/50 bg-emerald-500/5',
  integration: 'border-cyan-500/50 bg-cyan-500/5',
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  archived: 'bg-red-500/15 text-red-400',
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [nodes, setNodes] = useState<WfNode[]>([])
  const [edges, setEdges] = useState<WfEdge[]>([])
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState<Execution | null>(null)
  const [history, setHistory] = useState<Execution[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showNodePicker, setShowNodePicker] = useState(false)
  const [editingNode, setEditingNode] = useState<WfNode | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const addToast = useAppStore((s) => s.addToast)
  const canvasRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [wfRes, ntRes, cRes] = await Promise.allSettled([
      workflowApi.list(),
      workflowApi.nodeTypes(),
      companiesApi.list(),
    ])
    if (wfRes.status === 'fulfilled') setWorkflows(wfRes.value.data)
    if (ntRes.status === 'fulfilled') setNodeTypes(ntRes.value.data)
    if (cRes.status === 'fulfilled') setCompanies(cRes.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selectWorkflow = (wf: Workflow) => {
    setSelected(wf)
    setNodes(wf.nodes || [])
    setEdges(wf.edges || [])
    setExecResult(null)
    setShowHistory(false)
  }

  const createWorkflow = async () => {
    const res = await workflowApi.create({ name: '새 워크플로우', description: '' })
    const wf = res.data
    setWorkflows((p) => [wf, ...p])
    selectWorkflow(wf)
  }

  const saveWorkflow = async () => {
    if (!selected) return
    setSaving(true)
    await workflowApi.update(selected.id, { nodes, edges, name: selected.name, description: selected.description })
    addToast({ type: 'success', title: '워크플로우 저장됨' })
    setSaving(false)
  }

  const deleteWorkflow = async (id: number) => {
    await workflowApi.delete(id)
    setWorkflows((p) => p.filter((w) => w.id !== id))
    if (selected?.id === id) { setSelected(null); setNodes([]); setEdges([]) }
  }

  const executeWorkflow = async () => {
    if (!selected) return
    setExecuting(true)
    setExecResult(null)
    try {
      await workflowApi.update(selected.id, { nodes, edges })
      const res = await workflowApi.execute(selected.id)
      setExecResult(res.data)
      addToast({ type: res.data.status === 'completed' ? 'success' : 'error', title: `실행 ${res.data.status === 'completed' ? '완료' : '실패'}` })
    } catch {
      addToast({ type: 'error', title: '실행 오류' })
    }
    setExecuting(false)
  }

  const loadHistory = async () => {
    if (!selected) return
    const res = await workflowApi.history(selected.id)
    setHistory(res.data)
    setShowHistory(true)
  }

  // 노드 추가
  const addNode = (nt: NodeType) => {
    const id = `node_${Date.now()}`
    const newNode: WfNode = {
      id,
      type: nt.type,
      label: nt.label,
      position: { x: 100 + nodes.length * 30, y: 100 + nodes.length * 30 },
      config: {},
    }
    setNodes((p) => [...p, newNode])
    setShowNodePicker(false)
  }

  const removeNode = (id: string) => {
    setNodes((p) => p.filter((n) => n.id !== id))
    setEdges((p) => p.filter((e) => e.source !== id && e.target !== id))
    if (editingNode?.id === id) setEditingNode(null)
  }

  const handleNodeClick = (node: WfNode) => {
    if (connecting) {
      if (connecting !== node.id) {
        setEdges((p) => [...p, { id: `edge_${Date.now()}`, source: connecting, target: node.id }])
      }
      setConnecting(null)
    } else {
      setEditingNode(node)
    }
  }

  const removeEdge = (id: string) => setEdges((p) => p.filter((e) => e.id !== id))

  const getNodeType = (type: string) => nodeTypes.find((nt) => nt.type === type)
  const getNodeIcon = (type: string) => {
    const nt = getNodeType(type)
    return nt ? ICON_MAP[nt.icon] || Zap : Zap
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-500" size={24} /></div>

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Left Panel — Workflow List */}
      <div className="w-64 border-r border-bg-border bg-bg-card flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-bg-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">워크플로우</h2>
          <button onClick={createWorkflow} className="p-1.5 rounded-md bg-brand/15 text-brand-light hover:bg-brand/25 transition-colors">
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              onClick={() => selectWorkflow(wf)}
              className={`p-2.5 rounded-lg cursor-pointer transition-colors group ${
                selected?.id === wf.id ? 'bg-brand/15 border border-brand/30' : 'hover:bg-bg-elevated border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200 truncate">{wf.name}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-red-400">
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_BADGE[wf.status] || STATUS_BADGE.draft}`}>
                  {wf.status}
                </span>
                <span className="text-[10px] text-slate-600">{(wf.nodes || []).length}개 노드</span>
              </div>
            </div>
          ))}
          {workflows.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">워크플로우를 만들어보세요</p>
          )}
        </div>
      </div>

      {/* Center — Canvas */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-bg-card">
              <div className="flex items-center gap-3">
                <input
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                  className="bg-transparent text-sm font-semibold text-slate-100 border-b border-transparent focus:border-brand outline-none"
                />
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_BADGE[selected.status] || STATUS_BADGE.draft}`}>
                  {selected.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowNodePicker(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-elevated text-slate-300 hover:bg-bg-border transition-colors">
                  <Plus size={13} />노드 추가
                </button>
                <button onClick={saveWorkflow} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand/15 text-brand-light hover:bg-brand/25 transition-colors">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}저장
                </button>
                <button onClick={loadHistory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-elevated text-slate-300 hover:bg-bg-border transition-colors">
                  <History size={13} />이력
                </button>
                <button onClick={executeWorkflow} disabled={executing || nodes.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-40">
                  {executing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}실행
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div ref={canvasRef} className="flex-1 overflow-auto p-6 bg-bg-base relative">
              {connecting && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium border border-amber-500/30 z-20">
                  연결할 대상 노드를 클릭하세요 <button onClick={() => setConnecting(null)} className="ml-2 text-slate-400 hover:text-white">취소</button>
                </div>
              )}

              {/* Edges (visual lines) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {edges.map((edge) => {
                  const srcNode = nodes.find((n) => n.id === edge.source)
                  const tgtNode = nodes.find((n) => n.id === edge.target)
                  if (!srcNode || !tgtNode) return null
                  const x1 = srcNode.position.x + 120
                  const y1 = srcNode.position.y + 35
                  const x2 = tgtNode.position.x + 120
                  const y2 = tgtNode.position.y + 35
                  return (
                    <g key={edge.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(99,102,241,0.4)" strokeWidth={2} markerEnd="url(#arrow)" />
                    </g>
                  )
                })}
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="rgba(99,102,241,0.6)" />
                  </marker>
                </defs>
              </svg>

              {/* Nodes */}
              {nodes.map((node) => {
                const nt = getNodeType(node.type)
                const Icon = getNodeIcon(node.type)
                const catColor = nt ? CATEGORY_COLORS[nt.category] || '' : ''
                const execStatus = execResult?.node_results?.[node.id]

                return (
                  <div
                    key={node.id}
                    style={{ position: 'absolute', left: node.position.x, top: node.position.y, zIndex: 10 }}
                    className={`w-[240px] border rounded-xl p-3 cursor-pointer transition-all hover:shadow-lg ${catColor} ${
                      editingNode?.id === node.id ? 'ring-2 ring-brand' : ''
                    } ${execStatus?.status === 'completed' ? 'ring-1 ring-emerald-500/50' : ''} ${execStatus?.status === 'failed' ? 'ring-1 ring-red-500/50' : ''}`}
                    onClick={() => handleNodeClick(node)}
                    draggable
                    onDragEnd={(e) => {
                      const rect = canvasRef.current?.getBoundingClientRect()
                      if (rect) {
                        setNodes((p) => p.map((n) => n.id === node.id ? { ...n, position: { x: e.clientX - rect.left - 120, y: e.clientY - rect.top - 35 } } : n))
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-slate-300" />
                        <span className="text-xs font-semibold text-slate-200">{node.label}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); setConnecting(node.id) }}
                          className="p-1 rounded text-slate-500 hover:text-brand-light" title="연결">
                          <ArrowRight size={11} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
                          className="p-1 rounded text-slate-500 hover:text-red-400" title="삭제">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{nt?.description || node.type}</p>
                    {execStatus && (
                      <div className={`mt-1.5 px-2 py-1 rounded text-[10px] ${
                        execStatus.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {execStatus.status === 'completed' ? `완료 (${execStatus.duration_ms}ms)` : `실패: ${execStatus.error}`}
                      </div>
                    )}
                  </div>
                )
              })}

              {nodes.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Zap size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">"노드 추가" 버튼으로 AI 처리 단계를 추가하세요</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Zap size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">워크플로우를 선택하거나 새로 만드세요</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel — Node Config / History */}
      {(editingNode || showHistory) && (
        <div className="w-72 border-l border-bg-border bg-bg-card flex flex-col flex-shrink-0">
          {showHistory ? (
            <>
              <div className="p-3 border-b border-bg-border flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">실행 이력</span>
                <button onClick={() => setShowHistory(false)} className="p-1 rounded text-slate-500 hover:text-slate-300"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {history.map((ex) => (
                  <div key={ex.id} className={`p-2.5 rounded-lg border ${
                    ex.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold ${ex.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {ex.status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-500">{new Date(ex.started_at).toLocaleString('ko')}</span>
                    </div>
                    {ex.error_msg && <p className="text-[10px] text-red-400 mt-1">{ex.error_msg}</p>}
                    {ex.node_results && (
                      <div className="mt-1.5 space-y-0.5">
                        {Object.entries(ex.node_results).map(([nid, r]) => (
                          <div key={nid} className="flex items-center gap-1 text-[9px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <span className="text-slate-400 truncate">{nid}</span>
                            <span className="text-slate-600 ml-auto">{r.duration_ms}ms</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {history.length === 0 && <p className="text-xs text-slate-500 text-center py-6">실행 이력 없음</p>}
              </div>
            </>
          ) : editingNode && (
            <>
              <div className="p-3 border-b border-bg-border flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">노드 설정</span>
                <button onClick={() => setEditingNode(null)} className="p-1 rounded text-slate-500 hover:text-slate-300"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">라벨</label>
                  <input
                    value={editingNode.label}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditingNode({ ...editingNode, label: val })
                      setNodes((p) => p.map((n) => n.id === editingNode.id ? { ...n, label: val } : n))
                    }}
                    className="w-full bg-bg-base border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">타입</label>
                  <p className="text-xs text-slate-300">{editingNode.type}</p>
                </div>
                {/* Config fields from node type schema */}
                {(() => {
                  const nt = getNodeType(editingNode.type)
                  if (!nt) return null
                  return Object.keys(nt.config_schema).map((key) => (
                    <div key={key}>
                      <label className="text-[10px] text-slate-500 block mb-1">{key}</label>
                      <textarea
                        value={editingNode.config[key] || ''}
                        onChange={(e) => {
                          const cfg = { ...editingNode.config, [key]: e.target.value }
                          setEditingNode({ ...editingNode, config: cfg })
                          setNodes((p) => p.map((n) => n.id === editingNode.id ? { ...n, config: cfg } : n))
                        }}
                        rows={key === 'prompt' || key === 'system_prompt' ? 4 : 2}
                        className="w-full bg-bg-base border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-brand resize-none"
                      />
                    </div>
                  ))
                })()}

                {/* Edges from this node */}
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">연결</label>
                  {edges.filter((e) => e.source === editingNode.id).map((edge) => {
                    const tgt = nodes.find((n) => n.id === edge.target)
                    return (
                      <div key={edge.id} className="flex items-center justify-between py-1">
                        <span className="text-[10px] text-slate-400">→ {tgt?.label || edge.target}</span>
                        <button onClick={() => removeEdge(edge.id)} className="text-slate-500 hover:text-red-400"><X size={10} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Node Type Picker Modal */}
      {showNodePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNodePicker(false)}>
          <div className="bg-bg-card border border-bg-border rounded-2xl w-[500px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-bg-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">노드 추가</h3>
              <button onClick={() => setShowNodePicker(false)} className="p-1 rounded text-slate-500 hover:text-slate-300"><X size={16} /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2 overflow-y-auto max-h-[50vh]">
              {nodeTypes.map((nt) => {
                const Icon = ICON_MAP[nt.icon] || Zap
                return (
                  <button
                    key={nt.type}
                    onClick={() => addNode(nt)}
                    className={`p-3 rounded-xl border text-left transition-colors hover:shadow-md ${CATEGORY_COLORS[nt.category] || 'border-bg-border'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className="text-slate-300" />
                      <span className="text-xs font-semibold text-slate-200">{nt.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{nt.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
